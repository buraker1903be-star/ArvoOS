/*
  MÜŞTERİ TAKİP PORTALINA SON GİRİŞ VE ÇEVRİMİÇİ (12.10.2026)

  Kurum, müşterinin takip ekranına girip girmediğini, en son ne zaman
  girdiğini ve şu an ekranda olup olmadığını göremiyordu. Takip kodunu
  gönderen personel "baktı mı?" sorusuna cevapsız kalıyordu.

  Portalın her işlemi (sorgu, mesaj, dosya, açık sekmede 20 sn'de bir
  yenileme) tek kapıdan geçiyor: arvo_tracking_guard (lib/tracking-access).
  Kapı geçerli bir takip koduyla geldiğinde o sözleşmenin satırına:
    - last_seen_at: her istekte (yenileme dahil) → çevrimiçi göstergesi;
      sekme görünürken 20 sn'de bir yenilendiği için son 70 sn'de
      görülen müşteri ekranda sayılır (panel tarafı, lib/portal-ziyareti),
    - last_login_at / login_count: yalnızca sorgu ekranından giriş
      (p_tur = 'giris') — yenilemeler giriş sayılmaz.

  tracking_lookup_attempts bu işi göremezdi: kodun özetini tutuyor ve
  7 günde temizleniyor (deneme sınırı içindir, ziyaret geçmişi değil).

  Gizlilik: yalnızca zaman ve sayı tutulur; IP ve cihaz burada YOK.

  Kapının imzası değişiyor (üçüncü parametre, varsayılanlı): eski iki
  parametreli işlev düşürülüp yenisi kuruluyor, yoksa iki aşırı yükleme
  aynı çağrıda belirsiz kalırdı. Gövde canlı anlık görüntüden alındı.
*/

create table if not exists public.crm_contract_portal_visits (
  contract_id uuid primary key references public.crm_contracts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_login_at timestamptz,
  last_login_at timestamptz,
  login_count integer not null default 0,
  last_seen_at timestamptz not null default now()
);

create index if not exists crm_contract_portal_visits_kurum_idx
  on public.crm_contract_portal_visits (organization_id, last_seen_at desc);

alter table public.crm_contract_portal_visits enable row level security;

-- Okuma: kurumun aktif üyeleri (sözleşmeyi ve işi gören personel).
drop policy if exists members_read_portal_visits on public.crm_contract_portal_visits;
create policy members_read_portal_visits on public.crm_contract_portal_visits
  as permissive for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = crm_contract_portal_visits.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ));

-- Yazma yalnızca kapı işleviyle (security definer); kimse elle yazamaz.
revoke all on table public.crm_contract_portal_visits from anon, authenticated;
grant select on table public.crm_contract_portal_visits to authenticated;
-- Sunucu tarafı (service_role) okuyabilsin; Supabase varsayılanı da bu, açıkça yazıyoruz.
grant all on table public.crm_contract_portal_visits to service_role;

drop function if exists public.arvo_tracking_guard(text, text);

create function public.arvo_tracking_guard(p_client_ip text, p_code text, p_tur text default null)
 returns table(allowed boolean, code_exists boolean)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ip text := nullif(left(trim(coalesce(p_client_ip, '')), 64), '');
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  -- sha256 Postgres çekirdeğinde (pg_catalog); pgcrypto'ya bağımlılık yok.
  v_digest text := encode(sha256(convert_to(v_code, 'UTF8')), 'hex');
  v_ip_attempts integer;
  v_global_attempts integer;
  v_exists boolean;
  v_giris boolean := p_tur = 'giris';
begin
  -- Yalnızca SONUÇSUZ denemeler sayılır. Kaba kuvvetin ürettiği tek şey
  -- sonuçsuz denemedir; geçerli koduyla gelen müşteri bu sayaca girmez.
  -- Bu ayrım şart: takip sayfası mesajları 20 saniyede bir yeniliyor, yani
  -- açık sekmesi olan bir müşteri 10 dakikada 30 istek üretiyor. Her deneme
  -- sayılsaydı müşteri kendi kendini kilitlerdi.
  --
  -- IP bilinmiyorsa hepsi tek kovada toplanır; uydurulamadığı için bu kova
  -- yalnızca gerçekten IP okunamayan istekleri barındırır.
  select count(*) into v_ip_attempts
  from public.tracking_lookup_attempts a
  where a.client_ip is not distinct from v_ip
    and a.outcome = 'not_found'
    and a.created_at > now() - interval '10 minutes';

  select count(*) into v_global_attempts
  from public.tracking_lookup_attempts a
  where a.outcome = 'not_found'
    and a.created_at > now() - interval '10 minutes';

  -- IP başına 30 sonuçsuz / 10 dk; platform genelinde 2000 / 10 dk (IP
  -- havuzuyla dağıtılmış taramaya karşı üst sınır). Gerçek müşteri kodunu
  -- bir-iki denemede girer; 30 yanlış deneme normal kullanımın çok üstünde.
  if v_ip_attempts >= 30 or v_global_attempts >= 2000 then
    return query select false, false;
    return;
  end if;

  -- Kodun varlığı burada belirlenir. Sözleşmenin açık olup olmadığına
  -- bakılmaz: var olan bir kod tahmin değildir, asıl fonksiyonlar kendi
  -- görünürlük kurallarını zaten uyguluyor.
  select exists (
    select 1 from public.crm_contracts c
    where c.tracking_code = v_code
  ) into v_exists;

  insert into public.tracking_lookup_attempts (client_ip, code_digest, outcome)
  values (v_ip, v_digest, case when v_exists then 'found' else 'not_found' end);

  -- Portal ziyareti (20261012131639): son görülme her istekte, giriş
  -- yalnızca sorgu ekranından. Takip kodu tekil (crm_contracts_tracking_code_key).
  if v_exists then
    insert into public.crm_contract_portal_visits as v
      (contract_id, organization_id, first_login_at, last_login_at, login_count, last_seen_at)
    select c.id, c.organization_id,
           case when v_giris then now() end, case when v_giris then now() end,
           case when v_giris then 1 else 0 end, now()
    from public.crm_contracts c
    where c.tracking_code = v_code
    on conflict (contract_id) do update set
      last_seen_at = now(),
      last_login_at = case when v_giris then now() else v.last_login_at end,
      first_login_at = case when v_giris then coalesce(v.first_login_at, now()) else v.first_login_at end,
      login_count = v.login_count + case when v_giris then 1 else 0 end;
  end if;

  return query select true, v_exists;
end
$function$;

revoke all on function public.arvo_tracking_guard(text, text, text) from public, anon, authenticated;
grant execute on function public.arvo_tracking_guard(text, text, text) to service_role;
