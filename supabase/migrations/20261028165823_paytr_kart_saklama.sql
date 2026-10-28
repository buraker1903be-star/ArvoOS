/*
  PAYTR KART SAKLAMA VE OTOMATİK YENİLEME (28.10.2026).

  Kurum sahibinin kararı: abonelik isteğe bağlı olarak kayıtlı karttan
  otomatik yenilenebilsin. PayTR Direkt API + Kart Saklama API
  (lib/paytr-direkt.ts). Üç tablo:

  paytr_kart_islemleri — her kartla ödeme denemesi. Garanti'deki
    garanti_payment_attempts'in karşılığı: lisansı uzatan kayıt yine
    payment_links + arvo_record_paytr_payment; bu tablo yalnızca
    denemenin türünü, kart saklama ONAYINI ve sonucunu taşıyor. Lisans
    uzatma kuralının ikinci bir kopyası yazılmasın diye.

  paytr_kayitli_kartlar — PayTR'nin verdiği anahtarlar (utoken: müşteri,
    ctoken: kart) ve gösterim bilgisi (son 4 hane, banka). Kart numarası
    YOK: kart PayTR'de duruyor, bize hiç gelmiyor.

  paytr_otomatik_yenileme — kurum/abone + ürün başına tek kayıt: hangi
    karttan, hangi onayla. Onay (an, IP, kabul edilen metin, kim) harcama
    itirazında savunmanın kendisi; bu yüzden onaysız kayıt kurulamıyor
    (kısıt) ve kapatılan yenileme silinmiyor, kapatıldı olarak kalıyor.

  ERİŞİM: üç tablo da istemciye KAPALI. utoken/ctoken bir karttan para
  çekmeye yetiyor; RLS politikası yazılmadı, yalnızca servis rolü okur.
  Sunucu kodu kurumun kendi kaydını yetki denetiminden sonra okur
  (Ödeme ve Lisans ekranı), proforma tablosundaki gibi.
*/

create table if not exists public.paytr_kart_islemleri (
  merchant_oid text primary key,
  payment_link_id uuid not null references public.payment_links(id) on delete cascade,
  tur text not null,
  tutar bigint not null,
  kullanici_ip text not null,
  kart_sakla boolean not null default false,
  otomatik_onay boolean not null default false,
  onay_at timestamptz,
  onay_ip text,
  onay_metni text,
  onaylayan uuid references auth.users(id) on delete set null,
  durum text not null default 'bekliyor',
  hata_kodu text,
  hata_mesaji text,
  created_at timestamptz not null default now(),
  sonuc_at timestamptz,
  constraint paytr_kart_islemleri_oid_check check (merchant_oid ~ '^[A-Z0-9]{1,64}$'),
  constraint paytr_kart_islemleri_tur_check check (tur in ('ilk', 'kayitli', 'otomatik')),
  constraint paytr_kart_islemleri_tutar_check check (tutar > 0),
  constraint paytr_kart_islemleri_durum_check check (durum in ('bekliyor', 'basarili', 'basarisiz')),
  -- Otomatik yenileme onayı kart saklamadan ve kaydı (an + IP + metin) olmadan verilemez.
  constraint paytr_kart_islemleri_onay_check check (
    not otomatik_onay or (kart_sakla and onay_at is not null and onay_ip is not null and onay_metni is not null)
  )
);
create index if not exists paytr_kart_islemleri_link_idx on public.paytr_kart_islemleri (payment_link_id);

create table if not exists public.paytr_kayitli_kartlar (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  subscriber_id uuid references public.product_subscribers(id) on delete cascade,
  utoken text not null,
  ctoken text not null,
  son4 text not null,
  banka text,
  program text,
  kart_turu text,
  sema text,
  son_kullanma_ay text,
  son_kullanma_yil text,
  created_at timestamptz not null default now(),
  constraint paytr_kayitli_kartlar_sahip_check check ((organization_id is null) <> (subscriber_id is null)),
  constraint paytr_kayitli_kartlar_son4_check check (son4 ~ '^[0-9]{4}$'),
  constraint paytr_kayitli_kartlar_ctoken_key unique (ctoken)
);
create index if not exists paytr_kayitli_kartlar_kurum_idx on public.paytr_kayitli_kartlar (organization_id) where organization_id is not null;
create index if not exists paytr_kayitli_kartlar_abone_idx on public.paytr_kayitli_kartlar (subscriber_id) where subscriber_id is not null;

create table if not exists public.paytr_otomatik_yenileme (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  subscriber_id uuid references public.product_subscribers(id) on delete cascade,
  product text not null,
  kart_id uuid not null references public.paytr_kayitli_kartlar(id) on delete cascade,
  aktif boolean not null default true,
  onay_at timestamptz not null,
  onay_ip text not null,
  onay_metni text not null,
  onaylayan uuid references auth.users(id) on delete set null,
  kapatildi_at timestamptz,
  kapatan uuid references auth.users(id) on delete set null,
  son_deneme_at timestamptz,
  deneme_sayisi integer not null default 0,
  son_hata text,
  hatirlatilan_donem date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paytr_otomatik_yenileme_sahip_check check ((organization_id is null) <> (subscriber_id is null)),
  constraint paytr_otomatik_yenileme_product_check check (product in ('arvoos', 'arvolab', 'randevu')),
  constraint paytr_otomatik_yenileme_kapanis_check check (aktif or kapatildi_at is not null),
  constraint paytr_otomatik_yenileme_deneme_check check (deneme_sayisi >= 0)
);
-- Kurum/abone + ürün başına tek kayıt (kapalı olanı da: yeniden açılınca aynı satır güncellenir).
create unique index if not exists paytr_otomatik_yenileme_kurum_urun on public.paytr_otomatik_yenileme (organization_id, product) where organization_id is not null;
create unique index if not exists paytr_otomatik_yenileme_abone_urun on public.paytr_otomatik_yenileme (subscriber_id, product) where subscriber_id is not null;

alter table public.paytr_kart_islemleri enable row level security;
alter table public.paytr_kayitli_kartlar enable row level security;
alter table public.paytr_otomatik_yenileme enable row level security;

revoke all on table public.paytr_kart_islemleri from public, anon, authenticated;
revoke all on table public.paytr_kayitli_kartlar from public, anon, authenticated;
revoke all on table public.paytr_otomatik_yenileme from public, anon, authenticated;
grant all on table public.paytr_kart_islemleri to service_role;
grant all on table public.paytr_kayitli_kartlar to service_role;
grant all on table public.paytr_otomatik_yenileme to service_role;
