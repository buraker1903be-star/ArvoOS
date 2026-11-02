/*
  KAYIP NEDENİ (02.11.2026; gerekçe lib/kapanis-nedeni.ts).

  Aylık rapor kaybedilen müşterileri sayıyordu ama neden gittikleri hiçbir
  yerde tutulmuyordu. Lisans kapatılırken (çekirdekte İptal, ek üründe
  İptal/Kapalı) kurucu nedeni seçiyor; neden lisans satırında duruyor.

  Liste sabit: serbest metin raporda toplanamaz, ayrıntı kapanis_notu'nda.
  Kod listesi lib/kapanis-nedeni.ts KAPANIS_NEDENLERI ile aynı; birim testi
  ikisini karşılaştırıyor.

  Lisans yeniden açılınca neden de siliniyor — kapanış anıyla AYNI
  tetikleyicide (private.lisans_kapanis_tarihi, gövde 20261102101259'dan,
  yalnızca iki satır eklendi): geri dönen müşteride eski "fiyat" nedeni
  kalırsa, bir sonraki kapanışta yanlış neden raporlanırdı.
*/
alter table public.organization_licenses
  add column if not exists kapanis_nedeni text,
  add column if not exists kapanis_notu text;
alter table public.organization_product_licenses
  add column if not exists kapanis_nedeni text,
  add column if not exists kapanis_notu text;

alter table public.organization_licenses drop constraint if exists organization_licenses_kapanis_nedeni_check;
alter table public.organization_licenses add constraint organization_licenses_kapanis_nedeni_check
  check (kapanis_nedeni is null or kapanis_nedeni in ('fiyat', 'kullanmiyor', 'rakip', 'eksik_ozellik', 'odeme', 'is_kapandi', 'diger'));
alter table public.organization_licenses drop constraint if exists organization_licenses_kapanis_notu_check;
alter table public.organization_licenses add constraint organization_licenses_kapanis_notu_check
  check (kapanis_notu is null or char_length(kapanis_notu) <= 500);
alter table public.organization_product_licenses drop constraint if exists organization_product_licenses_kapanis_nedeni_check;
alter table public.organization_product_licenses add constraint organization_product_licenses_kapanis_nedeni_check
  check (kapanis_nedeni is null or kapanis_nedeni in ('fiyat', 'kullanmiyor', 'rakip', 'eksik_ozellik', 'odeme', 'is_kapandi', 'diger'));
alter table public.organization_product_licenses drop constraint if exists organization_product_licenses_kapanis_notu_check;
alter table public.organization_product_licenses add constraint organization_product_licenses_kapanis_notu_check
  check (kapanis_notu is null or char_length(kapanis_notu) <= 500);

create or replace function private.lisans_kapanis_tarihi()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  eski_durum text;
  yeni_durum text;
begin
  if tg_table_name = 'organization_licenses' then
    eski_durum := case when tg_op = 'UPDATE' then old.license_status end;
    yeni_durum := new.license_status;
  else
    eski_durum := case when tg_op = 'UPDATE' then old.status end;
    yeni_durum := new.status;
  end if;

  if yeni_durum in ('active', 'trialing', 'past_due') then
    new.closed_at := null;
    /* Geri dönen müşteride eski kayıp nedeni kalmasın (02.11.2026). */
    new.kapanis_nedeni := null;
    new.kapanis_notu := null;
  elsif tg_op = 'INSERT' then
    /* Kapalı açılan lisans (ör. ürün "inactive" eklendi) hiç açılmadı: kapanış yok. */
    new.closed_at := null;
  elsif eski_durum in ('active', 'trialing', 'past_due') then
    new.closed_at := now();
  else
    /* Kapalıdan kapalıya (askıda → iptal): ilk kapanış anı korunuyor. */
    new.closed_at := old.closed_at;
  end if;
  return new;
end;
$$;

revoke all on function private.lisans_kapanis_tarihi() from public, anon, authenticated;
