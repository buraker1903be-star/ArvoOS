#!/usr/bin/env bash
# YAYIN PROVASI — 20261110063102 (PR #313). CI'DA DEĞİL; elle çalıştırılır.
#
# İzole, geçici bir PostgreSQL kümesi kurar (yeni initdb, TCP DİNLEMEZ — yalnızca
# unix soket), üzerine "üretimdeki hâli" (canlı anlık görüntü + bekleyen
# migration'lar, BU migration HARİÇ) kurar ve scripts/yayin-provasi.mjs'i koşar:
# belgenin §1 kontrolleri → migration (tek işlem) → §3 kontrolleri → ödeme akışı.
# Bitince küme silinir. Üretime bağlanmaz, gizli bilgi istemez, dış istek atmaz.
#
# GEREKSİNİMLER
#   - PostgreSQL 16 sunucu ikilileri (initdb, pg_ctl, postgres) ve psql.
#     Varsayılan yol /usr/lib/postgresql/16/bin; başka yerdeyse PGBIN=… verin.
#   - Node 22.18+ (TypeScript sıyırma; CI Node 24 kullanıyor) ve `npm ci` yapılmış depo.
#   - root olarak çalışıyorsa sunucu `postgres` kullanıcısıyla açılır (runuser).
#   - Docker / Supabase / PostgREST GEREKMEZ — ve uygulama katmanını (sayfa çizimi,
#     sunucu işlemi, imzalı HTTP callback) SINAMAZ. O kısım belgenin §4'ünde.
#
# Kullanım: scripts/yayin-provasi.sh   (çıkış kodu: 0 hepsi geçti, 1 en az biri kaldı)
# Ayarlar:  PGBIN, PROVA_PG_DIZIN (varsayılan /var/tmp/arvo-prova), PROVA_PG_PORT (55433)
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
export PROVA_PG_DIZIN=${PROVA_PG_DIZIN:-/var/tmp/arvo-prova}
export PROVA_PG_PORT=${PROVA_PG_PORT:-55433}
D=$PROVA_PG_DIZIN
KOK=$(cd "$(dirname "$0")/.." && pwd)

calistir() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }

rm -rf "$D"; mkdir -p "$D"; [ "$(id -u)" = 0 ] && chown postgres "$D"
calistir "$PGBIN/initdb" -D "$D/data" -A trust -U postgres >/dev/null
calistir "$PGBIN/pg_ctl" -D "$D/data" -l "$D/pg.log" -w -o "-p $PROVA_PG_PORT -k $D -c listen_addresses=''" start >/dev/null
trap 'calistir "$PGBIN/pg_ctl" -D "$D/data" -m fast stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT

# "Üretimdeki hâl": akış testlerinin kurduğu şema, bu migration olmadan.
(cd "$KOK" && node -e '
const fs = require("fs"), path = require("path");
import("./tests/db/ortam.mjs").then((o) => {
  const sema = fs.readFileSync(o.SEMA, "utf8");
  const ad = "20261110063102_lisans_kaydi_yokken_odeme.sql";
  const bekleyen = o.BEKLEYEN_MIGRATIONLAR.filter((a) => a !== ad).map((a) => fs.readFileSync(path.resolve("supabase/migrations", a), "utf8"));
  const parcalar = [o.SUPABASE_KABUGU, sema, ...bekleyen, o.SUPABASE_VARSAYILAN_YETKI, ...[sema, ...bekleyen].flatMap((s) => o.yetkiSatirlari(s))];
  fs.writeFileSync(process.argv[1], parcalar.join("\n;\n") + "\n");
});' "$D/oncesi.sql")
chmod 644 "$D/oncesi.sql"

PSQL=(psql -h "$D" -p "$PROVA_PG_PORT" -U postgres -X -q -tA)
"${PSQL[@]}" -c "create database arvo_prova"
"${PSQL[@]}" -d arvo_prova -v ON_ERROR_STOP=1 -f "$D/oncesi.sql" >/dev/null 2>&1
echo "İzolasyon: $("${PSQL[@]}" -d arvo_prova -c "select 'listen_addresses=[' || current_setting('listen_addresses') || '] veri=' || current_setting('data_directory') || ' istemci=' || coalesce(inet_client_addr()::text, 'unix soket')")"
echo

node "$KOK/scripts/yayin-provasi.mjs"
