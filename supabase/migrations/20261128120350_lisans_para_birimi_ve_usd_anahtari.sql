/*
  LİSANSIN PARA BİRİMİ VE ÜRÜN BAŞINA USD ANAHTARI (28.11.2026).

  İki eksik parça:

  1. ABONELİĞİN PARA BİRİMİ. Lisans satırı aylık ücreti taşıyor
     (`monthly_fee`) ama biriminı taşımıyordu; yani "bu kiracı ayda
     4.990 ödüyor" yazıyor, neyin 4.990'ı olduğu yazmıyordu. Yenileme,
     beklenen tutar ve havale karşılaştırması bu satırdan besleniyor.
     Kural: YENİLEME ABONELİĞİN BİRİMİNİ İZLER. Ürünün varsayılanı USD
     olsa bile mevcut TRY aboneliği TRY kalır — sütun `default 'TRY'`
     ile ekleniyor ve hiçbir satır dönüştürülmüyor.

  2. ÜRÜN BAŞINA USD SATIŞ ANAHTARI. ArvoLab koşullar sağlanınca
     kendiliğinden USD'ye geçiyor (iş kararı); öteki ürünlerde yetkili
     yönetici açıkça açmalı. Anahtar veritabanında, çünkü kiracıya
     değil ürüne ait bir karar ve dağıtım beklemeden değişebilmeli.
     Anahtarın açık olması TEK BAŞINA yetmiyor: satış için yayımlanmış
     USD fiyatı ve doğrulanmış USD kanalı da gerekiyor
     (lib/satis-para-birimi.ts).
*/

alter table public.organization_licenses
  add column if not exists para_birimi text not null default 'TRY';
alter table public.organization_licenses
  drop constraint if exists organization_licenses_para_birimi_check;
alter table public.organization_licenses
  add constraint organization_licenses_para_birimi_check check (para_birimi in ('TRY', 'USD'));

alter table public.organization_product_licenses
  add column if not exists para_birimi text not null default 'TRY';
alter table public.organization_product_licenses
  drop constraint if exists organization_product_licenses_para_birimi_check;
alter table public.organization_product_licenses
  add constraint organization_product_licenses_para_birimi_check check (para_birimi in ('TRY', 'USD'));

create table if not exists public.platform_urun_para_ayarlari (
  product text primary key,
  usd_satis_acik boolean not null default false,
  /* Kimin ne zaman açtığı: para birimi kararı iz bırakmalı. */
  guncelleyen uuid references auth.users(id) on delete set null,
  guncellendi timestamptz not null default now()
);

alter table public.platform_urun_para_ayarlari enable row level security;

/*
  OKUMA kurucuya, YAZMA kurucuya. Kiracı bu tabloyu görmüyor: kendi
  ekranında hangi birimle satın alabileceğini zaten ödeme akışı
  söylüyor, ayarın kendisi iç karar.
*/
drop policy if exists kurucu_urun_para_ayarini_okur on public.platform_urun_para_ayarlari;
create policy kurucu_urun_para_ayarini_okur on public.platform_urun_para_ayarlari
  for select to authenticated
  using ((select private.is_arvoos_founder()));

drop policy if exists kurucu_urun_para_ayarini_yazar on public.platform_urun_para_ayarlari;
create policy kurucu_urun_para_ayarini_yazar on public.platform_urun_para_ayarlari
  for all to authenticated
  using ((select private.is_arvoos_founder()))
  with check ((select private.is_arvoos_founder()));

revoke all on table public.platform_urun_para_ayarlari from anon;
grant select, insert, update on table public.platform_urun_para_ayarlari to authenticated;
grant all on table public.platform_urun_para_ayarlari to service_role;

/*
  ArvoLab satırı önceden açılmıyor: anahtar "yöneticinin açtığı
  ürünler" için. ArvoLab'ın USD'ye geçişi koşula bağlı ve kod
  tarafında tanımlı (usdVarsayilanAday), bir veritabanı satırına
  değil. Satır açsaydık "açık ama satılamıyor" diye yanıltıcı bir
  durum da yazmış olurduk.
*/
