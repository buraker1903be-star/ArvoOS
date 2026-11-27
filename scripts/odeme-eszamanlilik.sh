#!/usr/bin/env bash
# ÖDEME YENİDEN İŞLEME — EŞZAMANLILIK SINAMASI (10.11.2026, 20261110063102).
#
# CI'DA DEĞİL. PGlite tek bağlantılı olduğu için tests/db'deki senaryolar
# sıralıdır ve kilit beklemesini/döngüsünü gösteremez. Bu betik İZOLE,
# geçici bir PostgreSQL kümesine (yalnızca yerel soket, üretime hiçbir
# bağlantı yok) akış testlerinin şemasını kurar ve aynı olaya iki ayrı
# bağlantıdan aynı anda dokunur. Dış servis yok: PayTR bildirimi işlevin
# kendisine verilen alanlarla taklit ediliyor.
#
# Kullanım: PGBIN=/usr/lib/postgresql/16/bin scripts/odeme-eszamanlilik.sh
# (root olarak çalışıyorsa sunucuyu postgres kullanıcısıyla açar.)
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
D=${ODEME_PG_DIZIN:-/var/tmp/odeme-eszamanlilik}
PORT=${ODEME_PG_PORT:-55432}
KOK=$(cd "$(dirname "$0")/.." && pwd)

calistir() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }

rm -rf "$D"; mkdir -p "$D"; [ "$(id -u)" = 0 ] && chown postgres "$D"
calistir "$PGBIN/initdb" -D "$D/data" -A trust -U postgres >/dev/null
calistir "$PGBIN/pg_ctl" -D "$D/data" -l "$D/log.txt" -w \
  -o "-p $PORT -k $D -c listen_addresses='' -c log_lock_waits=on -c deadlock_timeout=200ms" start >/dev/null
trap 'calistir "$PGBIN/pg_ctl" -D "$D/data" -m fast stop >/dev/null' EXIT

PSQL=(psql -h "$D" -p "$PORT" -U postgres -X -q -tA)
node "$KOK/scripts/odeme-eszamanlilik-sema.mjs" > "$D/kur.sql"
"${PSQL[@]}" -c "create database taban"
"${PSQL[@]}" -d taban -v ON_ERROR_STOP=1 -f "$D/kur.sql" >/dev/null 2>&1

KURUCU=00000000-0000-4000-8000-000000000001
SAHIP=00000000-0000-4000-8000-000000000002
ARVO=00000000-0000-4000-8000-0000000000a0
SALON=00000000-0000-4000-8000-0000000000a1
LINK=00000000-0000-4000-8000-0000000000f1

"${PSQL[@]}" -d taban -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id, email) values ('$KURUCU', 'kurucu@example.com'), ('$SAHIP', 'salon@example.com');
insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
insert into public.organizations (id, name, slug, status, plan_code) values
  ('$ARVO', 'Arvo', 'arvo-os', 'active', 'starter'), ('$SALON', 'Güzel Salon', 'guzel-salon', 'active', 'starter');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('$ARVO', '$KURUCU', 'owner'), ('$SALON', '$SAHIP', 'owner');
insert into public.payment_links (id, organization_id, provider, provider_link_id, url, amount, status, purpose, payer_organization_id, plan_code, product, created_by)
values ('$LINK', '$ARVO', 'paytr', 'L1', 'https://paytr.example/l1', 150000, 'active', 'subscription', '$SALON', 'starter', 'arvoos', '$SAHIP');
SQL

LISANS_AC="insert into public.organization_licenses (organization_id, plan_code, license_status, trial_started_at, user_limit, storage_limit_mb, ai_credit_limit, monthly_fee)
           values ('$SALON', 'starter', 'trialing', now(), 3, 5120, 500, 150000) on conflict (organization_id) do nothing;"
KURUCU_ROL="select set_config('request.jwt.claims', '{\"sub\":\"$KURUCU\",\"role\":\"authenticated\"}', true); set local role authenticated;"
SERVIS_ROL="select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true); set local role service_role;"
bildirim() { echo "select 'bildirim=' || public.arvo_record_paytr_payment('$LINK', '$1', 150000, 150000, 'TL', false, '{\"payment_type\":\"card\"}'::jsonb);"; }
# Olay kimliği SAHİP rolüyle önceden okunur: tablo istemci rollerine RLS ile kapalı.
olay_id() { "${PSQL[@]}" -d "$1" -c "select id from public.payment_provider_events where merchant_oid = '$2'"; }
yeniden() { echo "select 'yeniden=' || public.arvo_reprocess_paytr_event('$1');"; }

hazirla() { # $1 senaryo veritabanı; $2 'lisanssiz' ise OID-1 'no_license' olarak hazır
  "${PSQL[@]}" -c "drop database if exists $1" -c "create database $1 template taban"
  if [ "${2:-}" = lisanssiz ]; then
    "${PSQL[@]}" -d "$1" -v ON_ERROR_STOP=1 -c "delete from public.organization_licenses where organization_id = '$SALON'" \
      -c "begin; $SERVIS_ROL $(bildirim OID-1) commit;" >/dev/null
    "${PSQL[@]}" -d "$1" -c "$LISANS_AC"
  fi
}

# İki oturum: A işlemini açıp ifadesini çalıştırır ve kilidi TUTARAK 3 sn
# bekler; B 1 sn sonra başlar. B'nin kaç saniye beklediği ve sonucu yazılır.
yaris() { # $1 db, $2 A gövdesi, $3 B gövdesi
  ( "${PSQL[@]}" -d "$1" -c "begin; $2 select pg_sleep(3); commit;" 2>&1 | sed 's/^/  A: /' ) &
  sleep 1
  local bas=$(date +%s.%N)
  "${PSQL[@]}" -d "$1" -c "begin; $3 commit;" 2>&1 | sed 's/^/  B: /' || true
  printf '  B bekledi: %.1f sn\n' "$(echo "$(date +%s.%N) - $bas" | bc)"
  wait
}

durum() { # $1 db
  "${PSQL[@]}" -d "$1" <<SQL
select '  sonuç: olay=' || coalesce(string_agg(merchant_oid || ':' || result, ',' order by merchant_oid), '-') from public.payment_provider_events;
select '  onaylı ödeme=' || count(*) from public.organization_payment_requests where status = 'approved' and organization_id = '$SALON';
select '  aktivasyon=' || count(*) from public.billing_subscriptions where organization_id = '$SALON';
select '  lisans=' || coalesce((select license_status::text || ' ' || coalesce(to_char(current_period_end, 'YYYY-MM-DD'), 'dönem yok') from public.organization_licenses where organization_id = '$SALON'), 'YOK');
select '  bağlantı=' || status from public.payment_links where id = '$LINK';
select '  denetim=' || count(*) from public.activity_logs where entity_type = 'payment_event';
SQL
}

echo "1) İki kurucu aynı 'no_license' olayını aynı anda yeniden işler"
hazirla s1 lisanssiz
E=$(olay_id s1 OID-1)
yaris s1 "$KURUCU_ROL $(yeniden "$E")" "$KURUCU_ROL $(yeniden "$E")"
durum s1

echo "2) Yeniden işleme sürerken PayTR aynı bildirimi tekrarlar"
hazirla s2 lisanssiz
E=$(olay_id s2 OID-1)
yaris s2 "$KURUCU_ROL $(yeniden "$E")" "$SERVIS_ROL $(bildirim OID-1)"
durum s2

echo "3) Ters sıra: aynı bağlantıya yeni bildirim (OID-2) işlenirken kurucu OID-1'i yeniden işler"
hazirla s3 lisanssiz
E=$(olay_id s3 OID-1)
yaris s3 "$SERVIS_ROL $(bildirim OID-2)" "$KURUCU_ROL $(yeniden "$E")"
durum s3

echo "4) Kurucu lisansı siler (işlem açık), o sırada bildirim gelir"
hazirla s4
yaris s4 "$KURUCU_ROL delete from public.organization_licenses where organization_id = '$SALON';" "$SERVIS_ROL $(bildirim OID-1)"
durum s4

echo "5) Bildirim işlenirken (işlem açık) kurucu lisansı silmeye çalışır"
hazirla s5
yaris s5 "$SERVIS_ROL $(bildirim OID-1)" "$KURUCU_ROL delete from public.organization_licenses where organization_id = '$SALON';"
durum s5

echo "6) Yeniden işleme sürerken kurucu lisansı silmeye çalışır"
hazirla s6 lisanssiz
E=$(olay_id s6 OID-1)
yaris s6 "$KURUCU_ROL $(yeniden "$E")" "$KURUCU_ROL delete from public.organization_licenses where organization_id = '$SALON';"
durum s6

echo "7) Geri dönüş: geri alma SQL'i uygulanır, eski davranış döner; migration yeniden uygulanabilir"
hazirla s7
"${PSQL[@]}" -d s7 -v ON_ERROR_STOP=1 -f "$KOK/scripts/geri-donus/20261110063102_geri_al.sql" >/dev/null
"${PSQL[@]}" -d s7 -c "select '  geri alındıktan sonra yeni işlev sayısı=' || count(*) from pg_proc where proname in ('arvo_reprocess_paytr_event', 'arvo_apply_paytr_event')"
"${PSQL[@]}" -d s7 -v ON_ERROR_STOP=1 -c "delete from public.organization_licenses where organization_id = '$SALON'" -c "begin; $SERVIS_ROL $(bildirim OID-G) commit;" | sed 's/^/  eski gövde, lisanssız: /'
"${PSQL[@]}" -d s7 -c "select '  eski gövdede onaylı ödeme=' || count(*) from public.organization_payment_requests where status = 'approved' and organization_id = '$SALON'"
"${PSQL[@]}" -d s7 -v ON_ERROR_STOP=1 -f "$KOK/supabase/migrations/20261110063102_lisans_kaydi_yokken_odeme.sql" >/dev/null
"${PSQL[@]}" -d s7 -c "select '  yeniden uygulandıktan sonra yeni işlev sayısı=' || count(*) from pg_proc where proname in ('arvo_reprocess_paytr_event', 'arvo_apply_paytr_event')"

echo
if grep -q "deadlock detected" "$D/log.txt"; then echo "KİLİT DÖNGÜSÜ VAR:"; grep -A3 "deadlock detected" "$D/log.txt"; exit 1; fi
echo "Sunucu günlüğünde kilit döngüsü (deadlock) yok. Kilit beklemeleri:"
grep -c "still waiting for" "$D/log.txt" | sed 's/^/  bekleme kaydı: /'
