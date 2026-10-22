/*
  ANALİTİK MODÜLÜ (22.10.2026).

  Kurumlar kendi web sitelerinin trafiğini panelde görüyor: kaç kişi
  girdi, nereden geldi (Instagram, Google, Facebook…), hangi kampanyadan,
  hangi ülke/şehirden, hangi cihazla; şu an sitede kaç kişi var; formu
  dolduranlar hangi kaynaktan geldi. Arvo bunu kurumlara ayrı bir modül
  olarak satıyor; ilk müşteri AkademikMerkez.

  TOPLAMA: kurum sitesine tek satırlık takip kodu ekliyor (public/k.js →
  /api/k → analitik_olay_yaz). Site bize ait olmayabilir; kodu kurum
  kendisi ekliyor, panelin "Kurulum" bölümü nereye yapıştırılacağını
  anlatıyor.

  KİŞİSEL VERİ TUTULMUYOR (ArvoARC'taki canlı ziyaret kaydıyla aynı
  ilke): IP saklanmıyor; yalnızca GÜNLÜK DEĞİŞEN tuzlu bir karma —
  tekil ziyaretçi saymak ve botu elemek için. Ertesi gün aynı kişi başka
  bir karma üretiyor, kayıtlar günler arasında birbirine bağlanamıyor.
  Bu yüzden "ziyaretçi" günlük tekillerin TOPLAMIDIR; aynı kişinin iki
  gün gelmesi iki sayılır. Ekran bunu yazıyor. Çerez de yok, KVKK çerez
  onayı gerekmiyor.

  YAZMA anon'a açık bir security definer işlevden: takip kodu
  ziyaretçinin tarayıcısından geliyor, oturum yok. Yazılan şey bir
  sayaç — en kötü ihtimalle gürültü üretir, okunabilir bir şey
  sızdırmaz. Gürültüye karşı: alan adı denetimi (başka sitenin kodu
  kopyalaması kurumun sayılarını şişirmesin) ve ziyaretçi başına
  dakikalık hız sınırı.

  OKUMA özet işlevlerinden; ham satırlar RLS'li ve politikasız. Sayılar
  VERİTABANINDA hesaplanıyor, Türkiye gününe göre (AGENTS.md: kartın
  sayıları özet işlevinden).
*/

-- ---------- 0. Modül kaydı ----------

/*
  Kurumlarda KAPALI başlıyor: ayrı satılan bir hizmet. Kurucu Platform →
  kiracı dosyasından açıyor (toggleOrganizationModule satırı GÜNCELLER,
  satır yoksa "Modül kaydı bulunamadı" der; bu yüzden her kuruma satır).
*/
insert into public.arvo_modules (code, name, description, sort_order, is_active)
values ('analitik', 'Analitik', 'Web sitesi trafiği: ziyaretçi, kaynak, kampanya, ülke ve dönüşüm', 95, true)
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.organization_modules (organization_id, module_code, is_enabled)
select id, 'analitik', false from public.organizations
on conflict (organization_id, module_code) do nothing;

/*
  Erişim: modül KURUMDA açık VE kişinin rolünde gizli değil.
  private.arvo_modul_acik yalnızca ikincisine bakıyor; kurumda kapatılan
  modülün verisi API'den okunmaya devam etmesin diye ikisi birlikte.
*/
create or replace function private.analitik_erisimi(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select private.arvo_modul_acik(p_org, 'analitik')
    and exists (select 1 from public.organization_modules om
                where om.organization_id = p_org and om.module_code = 'analitik' and om.is_enabled)
$$;

revoke all on function private.analitik_erisimi(uuid) from public, anon;
grant execute on function private.analitik_erisimi(uuid) to authenticated, service_role;

-- ---------- 1. Siteler ----------

create table if not exists public.analitik_siteler (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ad text not null check (char_length(trim(ad)) between 2 and 80),
  /* www'suz, küçük harf, yalnızca konak ("akademikmerkez.com"). Alt
     alan adları da kabul ediliyor (blog.akademikmerkez.com). */
  alan_adi text not null check (alan_adi ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  /* Takip kodundaki herkese açık anahtar. Gizli DEĞİL (sitenin
     kaynağında duruyor); yalnızca hangi siteye yazılacağını söylüyor. */
  anahtar text not null unique default replace(gen_random_uuid()::text, '-', ''),
  ilk_olay_at timestamptz,
  son_olay_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, alan_adi)
);

create index if not exists analitik_siteler_kurum on public.analitik_siteler (organization_id);

alter table public.analitik_siteler enable row level security;

drop policy if exists analitik_site_oku on public.analitik_siteler;
create policy analitik_site_oku on public.analitik_siteler
  for select to authenticated
  using (private.analitik_erisimi(organization_id));

drop policy if exists analitik_site_ekle on public.analitik_siteler;
create policy analitik_site_ekle on public.analitik_siteler
  for insert to authenticated
  with check (private.arvo_is_privileged_member(organization_id) and private.analitik_erisimi(organization_id));

drop policy if exists analitik_site_guncelle on public.analitik_siteler;
create policy analitik_site_guncelle on public.analitik_siteler
  for update to authenticated
  using (private.arvo_is_privileged_member(organization_id) and private.analitik_erisimi(organization_id))
  with check (private.arvo_is_privileged_member(organization_id) and private.analitik_erisimi(organization_id));

drop policy if exists analitik_site_sil on public.analitik_siteler;
create policy analitik_site_sil on public.analitik_siteler
  for delete to authenticated
  using (private.arvo_is_privileged_member(organization_id) and private.analitik_erisimi(organization_id));

revoke all on public.analitik_siteler from anon;
grant select, insert, update, delete on public.analitik_siteler to authenticated;

/*
  Anahtar, kurum ve zaman damgaları panelden yazılamaz: UPDATE yetkisi
  olan kullanıcı her sütunu API'den doğrudan yazabiliyor (AGENTS.md).
  Kurumu değiştirilen site başka kurumun sayılarına karışırdı; damgalar
  "kurulum doğrulandı" kanıtı.
*/
create or replace function private.analitik_site_koru()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.organization_id is distinct from old.organization_id
       or new.anahtar is distinct from old.anahtar
       or new.ilk_olay_at is distinct from old.ilk_olay_at
       or new.son_olay_at is distinct from old.son_olay_at
       or new.created_at is distinct from old.created_at then
      raise exception 'Bu alan panelden değiştirilemez.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists analitik_site_koru on public.analitik_siteler;
create trigger analitik_site_koru before update on public.analitik_siteler
  for each row execute function private.analitik_site_koru();

-- ---------- 2. Olaylar ----------

create table if not exists public.analitik_olaylar (
  id bigserial primary key,
  site_id uuid not null references public.analitik_siteler(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  tur text not null check (tur in ('sayfa', 'form')),
  yol text not null,
  /* Platform adı yazımda iniyor (lib/analitik-olay.ts kaynakAdi). */
  kaynak text not null,
  kaynak_ham text,
  kampanya text,
  ortam text,
  ulke text,
  sehir text,
  enlem double precision,
  boylam double precision,
  cihaz text check (cihaz in ('mobil', 'tablet', 'masaustu')),
  tarayici text,
  /* Günlük tuzlu karma: tekil sayım ve hız sınırı. */
  ziyaretci text not null
);

create index if not exists analitik_olaylar_site_zaman on public.analitik_olaylar (site_id, created_at desc);
create index if not exists analitik_olaylar_ziyaretci on public.analitik_olaylar (site_id, ziyaretci, created_at);

/* RLS AÇIK, POLİTİKA YOK: okuma özet işlevlerinden, yazma aşağıdaki işlevden. */
alter table public.analitik_olaylar enable row level security;
revoke all on public.analitik_olaylar from anon, authenticated;

-- ---------- 3. Yazma ----------

create or replace function public.analitik_olay_yaz(
  p_anahtar text,
  p_kaynak_konak text,
  p_tur text,
  p_yol text,
  p_kaynak text,
  p_kaynak_ham text,
  p_kampanya text,
  p_ortam text,
  p_ulke text,
  p_sehir text,
  p_enlem double precision,
  p_boylam double precision,
  p_cihaz text,
  p_tarayici text,
  p_ip text,
  p_ua text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_site record;
  v_konak text := lower(regexp_replace(coalesce(p_kaynak_konak, ''), '^www\.', ''));
  v_karma text;
  v_son integer;
begin
  select s.id, s.organization_id, s.alan_adi, s.ilk_olay_at, s.son_olay_at into v_site
  from public.analitik_siteler s where s.anahtar = p_anahtar;
  if v_site.id is null then return; end if;
  /* Modülü kapatılan kurumun sitesi yazmaya devam etmez. */
  if not exists (select 1 from public.organization_modules om
                 where om.organization_id = v_site.organization_id and om.module_code = 'analitik' and om.is_enabled) then
    return;
  end if;

  /*
    ALAN ADI DENETİMİ. Anahtar sitenin kaynağında açıkta; başka bir site
    kodu kopyalarsa kurumun sayıları onun trafiğiyle şişerdi. Konak
    tarayıcının Origin başlığından geliyor (sayfanın kendisi yazamıyor).
    Alt alan adları kabul: blog.akademikmerkez.com.
  */
  if v_konak <> v_site.alan_adi and v_konak not like '%.' || v_site.alan_adi then
    return;
  end if;

  /*
    GÜNLÜK TUZ. md5, pgcrypto değil: bu bir güvenlik sınırı değil, sayım
    anahtarı (ArvoARC arc_storefront_visit ile aynı gerekçe). Site kimliği
    karışıyor ki iki kurumun karmaları birbirine bağlanamasın.
  */
  v_karma := md5(coalesce(p_ip, '') || '|' || coalesce(p_ua, '') || '|' || v_site.id::text || '|'
    || to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM-DD'));

  /* HIZ SINIRI: dakikada 60 olaydan fazlası bot sayılıyor. */
  select count(*) into v_son from public.analitik_olaylar o
  where o.site_id = v_site.id and o.ziyaretci = v_karma and o.created_at > now() - interval '1 minute';
  if v_son >= 60 then return; end if;

  insert into public.analitik_olaylar
    (site_id, organization_id, tur, yol, kaynak, kaynak_ham, kampanya, ortam,
     ulke, sehir, enlem, boylam, cihaz, tarayici, ziyaretci)
  values (
    v_site.id, v_site.organization_id,
    case when p_tur = 'form' then 'form' else 'sayfa' end,
    left(coalesce(nullif(p_yol, ''), '/'), 300),
    left(coalesce(nullif(p_kaynak, ''), 'Doğrudan'), 120),
    nullif(left(coalesce(p_kaynak_ham, ''), 120), ''),
    nullif(left(coalesce(p_kampanya, ''), 120), ''),
    nullif(left(coalesce(p_ortam, ''), 60), ''),
    nullif(upper(left(coalesce(p_ulke, ''), 2)), ''),
    nullif(left(coalesce(p_sehir, ''), 120), ''),
    p_enlem, p_boylam,
    case when p_cihaz in ('mobil', 'tablet', 'masaustu') then p_cihaz else null end,
    nullif(left(coalesce(p_tarayici, ''), 40), ''),
    v_karma
  );

  /* Kurulum kanıtı. Her olayda yazmamak için dakikada bir. */
  if v_site.son_olay_at is null or v_site.son_olay_at < now() - interval '1 minute' then
    update public.analitik_siteler
    set son_olay_at = now(), ilk_olay_at = coalesce(ilk_olay_at, now())
    where id = v_site.id;
  end if;

  /*
    SAKLAMA: 400 gün (geçen yılın aynı ayıyla karşılaştırılabilsin).
    Ayrı bir zamanlayıcı yerine yazımın içinde, binde bir: unutulan bir
    cron işi sessizce büyüyen bir tablo demek.
  */
  if random() < 0.001 then
    delete from public.analitik_olaylar where created_at < now() - interval '400 days';
  end if;
end $$;

revoke all on function public.analitik_olay_yaz(text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, text, text) from public;
grant execute on function public.analitik_olay_yaz(text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, text, text) to anon, authenticated, service_role;

-- ---------- 4. Okuma: özet ----------

/*
  Bir sitenin [p_bas, p_bit] günleri (Türkiye günü, ikisi dahil) için
  bütün kartlar tek çağrıda. Yetki: sitenin kurumunda analitik modülüne
  erişimi olan üye.

  DÖNÜŞÜMÜN KAYNAĞI, form gönderilen sayfanın yönlendireni DEĞİL: form
  çoğu zaman sitenin iç sayfasında, yönlendiren de sitenin kendisi
  ("Doğrudan" görünürdü). Kaynak, aynı ziyaretçinin O GÜNKÜ ilk sayfa
  açılışından alınıyor — karma günlük olduğu için daha geriye
  bağlanamıyor.
*/
create or replace function public.analitik_ozet(p_site uuid, p_bas date, p_bit date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_org uuid;
  v_sonuc jsonb;
begin
  select s.organization_id into v_org from public.analitik_siteler s where s.id = p_site;
  if v_org is null or not private.analitik_erisimi(v_org) then
    raise exception 'Bu sitenin analitiğini görme yetkiniz yok.' using errcode = '42501';
  end if;
  if p_bit < p_bas or p_bit - p_bas > 400 then
    raise exception 'Tarih aralığı geçersiz.' using errcode = '22023';
  end if;

  with olay as (
    select o.*, (o.created_at at time zone 'Europe/Istanbul')::date as gun
    from public.analitik_olaylar o
    where o.site_id = p_site
      and o.created_at >= (p_bas::timestamp at time zone 'Europe/Istanbul')
      and o.created_at < ((p_bit + 1)::timestamp at time zone 'Europe/Istanbul')
  ),
  sayfa as (select * from olay where tur = 'sayfa'),
  /* Ziyaretçinin günlük girişi: o günkü ilk sayfa açılışı. */
  giris as (
    select distinct on (gun, ziyaretci) gun, ziyaretci, kaynak, kampanya, ulke, sehir, cihaz, tarayici, yol
    from sayfa order by gun, ziyaretci, created_at
  ),
  form as (
    select f.gun, f.ziyaretci, f.yol, coalesce(g.kaynak, f.kaynak) as kaynak
    from olay f left join giris g on g.gun = f.gun and g.ziyaretci = f.ziyaretci
    where f.tur = 'form'
  )
  select jsonb_build_object(
    'ziyaretci', (select count(*) from giris),
    'sayfa', (select count(*) from sayfa),
    'form', (select count(*) from form),
    'formZiyaretci', (select count(distinct (gun, ziyaretci)) from form),
    'tekSayfa', (select count(*) from (select gun, ziyaretci from sayfa group by 1, 2 having count(*) = 1) t),
    'gunluk', coalesce((select jsonb_agg(jsonb_build_object('gun', gun, 'ziyaretci', z, 'sayfa', s, 'form', f) order by gun) from (
        select d.gun, count(distinct d.ziyaretci) filter (where d.tur = 'sayfa') as z,
               count(*) filter (where d.tur = 'sayfa') as s, count(*) filter (where d.tur = 'form') as f
        from olay d group by d.gun) t), '[]'::jsonb),
    'sayfalar', coalesce((select jsonb_agg(jsonb_build_object('ad', yol, 'sayfa', s, 'ziyaretci', z) order by s desc, yol) from (
        select yol, count(*) as s, count(distinct (gun, ziyaretci)) as z from sayfa group by yol order by 2 desc, 1 limit 15) t), '[]'::jsonb),
    'girisSayfalari', coalesce((select jsonb_agg(jsonb_build_object('ad', yol, 'adet', n) order by n desc, yol) from (
        select yol, count(*) as n from giris group by yol order by 2 desc, 1 limit 10) t), '[]'::jsonb),
    'kaynaklar', coalesce((select jsonb_agg(jsonb_build_object('ad', kaynak, 'adet', n, 'form', fz) order by n desc, kaynak) from (
        select g.kaynak, count(*) as n,
               (select count(distinct (f.gun, f.ziyaretci)) from form f where f.kaynak = g.kaynak) as fz
        from giris g group by g.kaynak order by 2 desc, 1 limit 15) t), '[]'::jsonb),
    'kampanyalar', coalesce((select jsonb_agg(jsonb_build_object('ad', kampanya, 'kaynak', kaynak, 'adet', n) order by n desc, kampanya) from (
        select kampanya, kaynak, count(*) as n from giris where kampanya is not null group by 1, 2 order by 3 desc, 1 limit 15) t), '[]'::jsonb),
    'ulkeler', coalesce((select jsonb_agg(jsonb_build_object('ad', ulke, 'adet', n) order by n desc, ulke) from (
        select ulke, count(*) as n from giris where ulke is not null group by ulke order by 2 desc, 1 limit 20) t), '[]'::jsonb),
    'sehirler', coalesce((select jsonb_agg(jsonb_build_object('ad', sehir, 'ulke', ulke, 'adet', n) order by n desc, sehir) from (
        select sehir, ulke, count(*) as n from giris where sehir is not null group by 1, 2 order by 3 desc, 1 limit 20) t), '[]'::jsonb),
    'cihazlar', coalesce((select jsonb_agg(jsonb_build_object('ad', cihaz, 'adet', n) order by n desc) from (
        select coalesce(cihaz, 'masaustu') as cihaz, count(*) as n from giris group by 1) t), '[]'::jsonb),
    'tarayicilar', coalesce((select jsonb_agg(jsonb_build_object('ad', tarayici, 'adet', n) order by n desc, tarayici) from (
        select coalesce(tarayici, 'Diğer') as tarayici, count(*) as n from giris group by 1 order by 2 desc, 1 limit 10) t), '[]'::jsonb),
    'formSayfalari', coalesce((select jsonb_agg(jsonb_build_object('ad', yol, 'adet', n) order by n desc, yol) from (
        select yol, count(*) as n from form group by yol order by 2 desc, 1 limit 10) t), '[]'::jsonb)
  ) into v_sonuc;

  return v_sonuc;
end $$;

revoke all on function public.analitik_ozet(uuid, date, date) from public, anon;
grant execute on function public.analitik_ozet(uuid, date, date) to authenticated, service_role;

-- ---------- 5. Okuma: canlı ----------

/* "Şu an" = son beş dakikada olayı olan ayrı ziyaretçi; akış son 30 dakika. */
create or replace function public.analitik_canli(p_site uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_org uuid;
begin
  select s.organization_id into v_org from public.analitik_siteler s where s.id = p_site;
  if v_org is null or not private.analitik_erisimi(v_org) then
    raise exception 'Bu sitenin analitiğini görme yetkiniz yok.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'suAn', (select count(distinct o.ziyaretci) from public.analitik_olaylar o
             where o.site_id = p_site and o.created_at > now() - interval '5 minutes'),
    'sonSaat', (select count(*) from public.analitik_olaylar o
                where o.site_id = p_site and o.tur = 'sayfa' and o.created_at > now() - interval '1 hour'),
    'akis', coalesce((select jsonb_agg(jsonb_build_object(
          'zaman', t.created_at, 'tur', t.tur, 'yol', t.yol, 'kaynak', t.kaynak,
          'ulke', t.ulke, 'sehir', t.sehir, 'cihaz', t.cihaz) order by t.created_at desc)
        from (select * from public.analitik_olaylar o
              where o.site_id = p_site and o.created_at > now() - interval '30 minutes'
              order by o.created_at desc limit 50) t), '[]'::jsonb),
    'noktalar', coalesce((select jsonb_agg(jsonb_build_object('enlem', t.enlem, 'boylam', t.boylam, 'sehir', t.sehir, 'adet', t.n))
        from (select round(o.enlem::numeric, 1)::float8 as enlem, round(o.boylam::numeric, 1)::float8 as boylam,
                     max(o.sehir) as sehir, count(distinct o.ziyaretci) as n
              from public.analitik_olaylar o
              where o.site_id = p_site and o.created_at > now() - interval '1 hour'
                and o.enlem is not null and o.boylam is not null
              group by 1, 2) t), '[]'::jsonb)
  );
end $$;

revoke all on function public.analitik_canli(uuid) from public, anon;
grant execute on function public.analitik_canli(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
