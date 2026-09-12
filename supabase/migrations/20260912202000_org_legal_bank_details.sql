-- Kurumun resmi (yasal) bilgileri ve banka hesabı.
--
-- Amaç: Teklif ve sözleşme belgelerinde taraf bilgisi, ödeme maddesi
-- (havale/EFT hesabı), tebligat adresi ve yetkili mahkeme şehri artık
-- "Belge alt bilgisi" serbest metninden tahmin edilmez; ayarlardaki
-- "Resmi bilgiler ve banka" bölümünden gelir. Alanlar boşsa belgeler eski
-- davranışla (alt bilgi metni) çizilmeye devam eder.
--
-- 1) organizations tablosuna sütunlar. Adres/il/ilçe "legal_" önekli:
--    canlı şemada farklı amaçla açılmış olası address/city sütunlarıyla
--    çakışmasın. KEP alanı bilerek yok.
-- 2) Uzunluk ve biçim kısıtları (IBAN için ISO 13616 mod-97 dahil).
--    Uygulama (app/_components/legal/identifiers.ts) VKN/TCKN kontrol
--    hanelerini ayrıca doğrular.
-- 3) Herkese açık belge sayfaları için token ile çalışan salt-okur
--    arvo_public_organization_legal. Mevcut get_public_crm_proposal /
--    get_public_crm_contract fonksiyonlarına DOKUNULMAZ (canlı tanımlar
--    repodan ayrışmış olabilir; dönüş tipini değiştirmek drop gerektirir).
--
-- Yetki: organizations üzerinde kolon bazlı GRANT yok (tablo düzeyinde);
-- güncelleme mevcut organizations_update_admin RLS politikasıyla sınırlı,
-- sunucu işlemi ayrıca owner/admin rolünü ve etkilenen satırı kontrol eder.
-- İdempotent: tekrar çalıştırılabilir.

alter table public.organizations
  add column if not exists legal_name text,
  add column if not exists legal_address text,
  add column if not exists legal_city text,
  add column if not exists legal_district text,
  add column if not exists tax_office text,
  add column if not exists tax_number text,
  add column if not exists mersis_no text,
  add column if not exists bank_name text,
  add column if not exists bank_account_holder text,
  add column if not exists iban text;

alter table public.organizations drop constraint if exists organizations_legal_name_len;
alter table public.organizations add constraint organizations_legal_name_len
  check (legal_name is null or char_length(legal_name) between 1 and 200) not valid;

alter table public.organizations drop constraint if exists organizations_legal_address_len;
alter table public.organizations add constraint organizations_legal_address_len
  check (legal_address is null or char_length(legal_address) between 1 and 500) not valid;

alter table public.organizations drop constraint if exists organizations_legal_city_len;
alter table public.organizations add constraint organizations_legal_city_len
  check (legal_city is null or char_length(legal_city) between 1 and 60) not valid;

alter table public.organizations drop constraint if exists organizations_legal_district_len;
alter table public.organizations add constraint organizations_legal_district_len
  check (legal_district is null or char_length(legal_district) between 1 and 60) not valid;

alter table public.organizations drop constraint if exists organizations_tax_office_len;
alter table public.organizations add constraint organizations_tax_office_len
  check (tax_office is null or char_length(tax_office) between 1 and 120) not valid;

alter table public.organizations drop constraint if exists organizations_tax_number_format;
alter table public.organizations add constraint organizations_tax_number_format
  check (tax_number is null or tax_number ~ '^[0-9]{10,11}$') not valid;

alter table public.organizations drop constraint if exists organizations_mersis_no_format;
alter table public.organizations add constraint organizations_mersis_no_format
  check (mersis_no is null or mersis_no ~ '^[0-9]{16}$') not valid;

alter table public.organizations drop constraint if exists organizations_bank_name_len;
alter table public.organizations add constraint organizations_bank_name_len
  check (bank_name is null or char_length(bank_name) between 1 and 120) not valid;

alter table public.organizations drop constraint if exists organizations_bank_account_holder_len;
alter table public.organizations add constraint organizations_bank_account_holder_len
  check (bank_account_holder is null or char_length(bank_account_holder) between 1 and 200) not valid;

-- TR + 24 rakam; mod-97: BBAN + "TR"(=2927) + kontrol haneleri ≡ 1 (mod 97)
alter table public.organizations drop constraint if exists organizations_iban_format;
alter table public.organizations add constraint organizations_iban_format
  check (
    iban is null
    or (
      iban ~ '^TR[0-9]{24}$'
      and (substr(iban, 5) || '2927' || substr(iban, 3, 2))::numeric % 97 = 1
    )
  ) not valid;

-- ---------------------------------------------------------------
-- Herkese açık teklif/sözleşme sayfası: kurumun resmi ve banka bilgileri
-- ---------------------------------------------------------------
create or replace function public.arvo_public_organization_legal(public_token text, document_type text)
returns table(
  legal_name text,
  legal_address text,
  legal_city text,
  legal_district text,
  tax_office text,
  tax_number text,
  mersis_no text,
  bank_name text,
  bank_account_holder text,
  iban text
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  with target as (
    select p.organization_id
    from public.crm_proposals p
    where document_type = 'proposal'
      and p.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
    union all
    select c.organization_id
    from public.crm_contracts c
    where document_type = 'contract'
      and c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  )
  select
    org.legal_name::text,
    org.legal_address::text,
    org.legal_city::text,
    org.legal_district::text,
    org.tax_office::text,
    org.tax_number::text,
    org.mersis_no::text,
    org.bank_name::text,
    org.bank_account_holder::text,
    org.iban::text
  from target t
  join public.organizations org on org.id = t.organization_id
  where coalesce(public_token, '') <> ''
  limit 1;
$function$;

revoke all on function public.arvo_public_organization_legal(text, text) from public;
grant execute on function public.arvo_public_organization_legal(text, text) to anon, authenticated;
