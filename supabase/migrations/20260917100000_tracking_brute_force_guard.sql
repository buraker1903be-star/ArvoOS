-- Takip kodu kaba kuvvete kapatılıyor.
--
-- SORUN
-- Takip kodu 32 harflik alfabeden 6 karakter: 32^6 ≈ 1,07 milyar olasılık.
-- Tek bir kodu tahmin etmek zor, ama saldırgan tek bir kodu değil HERHANGİ
-- bir geçerli kodu arıyor. Birkaç yüz açık sözleşme varsa arama uzayı
-- kod sayısına bölünüyor: saniyede 1000 denemeyle geçerli bir koda saatler
-- içinde düşülüyor. Deneme sayısında hiçbir sınır yoktu.
--
-- Geçerli bir kod şunları açıyor: sözleşme no, başlık, toplam/ödenen/kalan
-- tutar, kurum kimliği, teklif ve sözleşmenin paylaşım belirteçleri
-- (dolayısıyla müşteri adresi, vergi no, imza görseli, kurumun IBAN'ı),
-- mesaj geçmişi — ve arvo_tracking_confirm_proposal ile teklifi REDDETME
-- yetkisi. Ret, bağlı sözleşmeyi iptal edip fırsatı kayıp işaretliyor.
--
-- NEDEN SADECE HIZ SINIRI YETMİYOR
-- Bu fonksiyonlar anon'a açıktı. anon anahtarı tarayıcı paketinde herkese
-- açık olduğu için saldırgan Next.js sunucusunu atlayıp doğrudan PostgREST'e
-- gidebiliyordu; oraya IP'yi kendi yazdığı için IP bazlı sınır da anlamsız
-- kalıyordu.
--
-- ÇÖZÜM
-- 1) Kod ile kayıt çözen bütün fonksiyonlardan anon/authenticated izni
--    kaldırılıyor. Hepsi zaten yalnızca sunucu tarafından çağrılıyor
--    (app/takip, app/durum, app/api/portal-files — hiçbir tarayıcı kodu
--    çağırmıyor), çağrı service_role ile yapılacak.
-- 2) Denemeler IP ile birlikte kaydediliyor; sınırı aşan IP engelleniyor.
--    IP artık uydurulamıyor, çünkü tek giriş kapısı bizim sunucumuz.
--
-- Kod uzunluğu değiştirilmiyor: hız sınırıyla 32^6 fazlasıyla yeterli ve
-- uzatmak mevcut sözleşmelerin kodlarını değiştirmez.

create table if not exists public.tracking_lookup_attempts (
  id bigint generated always as identity primary key,
  client_ip text,
  -- Kod açık saklanmaz: engelleme için eşitlik yeterli, günlük sızarsa
  -- geçerli kodlar da sızmasın.
  code_digest text not null,
  outcome text not null check (outcome in ('found', 'not_found')),
  created_at timestamptz not null default now()
);

comment on table public.tracking_lookup_attempts is
  'Takip kodu sorgulama denemeleri. Kaba kuvvet sınırı için; kod özetlenerek saklanır.';

-- Sayım yalnızca sonuçsuz denemelere bakıyor; kısmi indeks hem küçük hem de
-- her sorguda taranacak satırı en aza indiriyor.
create index if not exists tracking_lookup_attempts_ip_open_idx
  on public.tracking_lookup_attempts (client_ip, created_at desc)
  where outcome = 'not_found';
create index if not exists tracking_lookup_attempts_open_idx
  on public.tracking_lookup_attempts (created_at desc)
  where outcome = 'not_found';
create index if not exists tracking_lookup_attempts_created_idx
  on public.tracking_lookup_attempts (created_at);

alter table public.tracking_lookup_attempts enable row level security;
-- Politika tanımlanmıyor: yalnızca service_role (RLS'i atlar) erişir.

revoke all on table public.tracking_lookup_attempts from anon, authenticated;
grant select, insert, delete on table public.tracking_lookup_attempts to service_role;

-- ---------------------------------------------------------------
-- Sınır kapısı
-- ---------------------------------------------------------------
-- Takip koduyla veri okuyan HER işlemin başında çağrılır: kodun gerçekten
-- var olup olmadığına kendisi bakar, denemeyi sonucuyla birlikte kaydeder ve
-- izin verilip verilmediğini söyler.
--
-- Sonucu kapının kendisi belirliyor, çağıran taraf değil. Bunun sebebi var:
-- bazı uçlar geçersiz kodda da hatasız boş sonuç dönüyor (ör.
-- list_customer_file_messages). Sonucu çağırana bıraksaydık saldırgan o uçtan
-- deneyerek her denemesini "bulundu" saydırıp sayacı tamamen atlatırdı.
--
-- Eşikler: gerçek müşteri kodunu bir-iki denemede girer. 10 dakikada 30
-- SONUÇSUZ deneme normal kullanımın çok üstünde, kaba kuvvetin çok altında.
create or replace function public.arvo_tracking_guard(
  p_client_ip text,
  p_code text
)
returns table (allowed boolean, code_exists boolean)
language plpgsql
volatile
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

  return query select true, v_exists;
end
$function$;

revoke all on function public.arvo_tracking_guard(text, text) from public, anon, authenticated;
grant execute on function public.arvo_tracking_guard(text, text) to service_role;

-- Günlük süresiz büyümesin.
create or replace function public.arvo_tracking_attempts_prune()
returns integer
language sql
volatile
security definer
set search_path to ''
as $function$
  with removed as (
    delete from public.tracking_lookup_attempts
    where created_at < now() - interval '7 days'
    returning 1
  )
  select count(*)::integer from removed;
$function$;

revoke all on function public.arvo_tracking_attempts_prune() from public, anon, authenticated;
grant execute on function public.arvo_tracking_attempts_prune() to service_role;

-- ---------------------------------------------------------------
-- service_role izinleri
-- ---------------------------------------------------------------
-- BU DOSYA YALNIZCA EKLER. anon izinleri 20260917110000'de kaldırılıyor.
--
-- Sıra önemli: canlıdaki kod bu fonksiyonları hâlâ anon ile çağırıyor.
-- Önce service_role'e izin verilir (iki taraf da çalışır), sonra yeni kod
-- yayınlanır, en son anon izni kaldırılır. Tersi sırada müşteri takip
-- sayfası aradaki sürede kapanırdı.
--
-- service_role'e AÇIKÇA izin verilmesi şart: bu fonksiyonlarda
-- "revoke all from public" yapılmış ve yalnızca anon/authenticated'a
-- verilmişti, yani service_role'ün execute izni yoktu.

grant execute on function public.lookup_contract_by_tracking_code_global(text) to service_role;
grant execute on function public.lookup_contract_by_tracking_code(text, text) to service_role;
grant execute on function public.arvo_tracking_documents(text) to service_role;
grant execute on function public.arvo_tracking_document_links(text) to service_role;
grant execute on function public.arvo_tracking_work_plan(text) to service_role;
grant execute on function public.list_customer_file_messages(text) to service_role;
grant execute on function public.list_customer_portal_files(text) to service_role;
grant execute on function public.arvo_tracking_confirm_proposal(text, text, text, text) to service_role;
grant execute on function public.authorize_customer_portal_file_download(text, uuid, text, text) to service_role;
grant execute on function public.send_customer_file_message(text, text) to service_role;
