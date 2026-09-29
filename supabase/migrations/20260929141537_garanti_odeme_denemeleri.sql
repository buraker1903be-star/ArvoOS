-- ============================================================
-- GARANTİ ÖDEME DENEMELERİ
--
-- NEDEN AYRI BİR TABLO. PayTR bir bağlantı API'si: sunucusuna çağrı
-- atılıyor, haftalarca yaşayan bir URL dönüyor, o URL taksite yazılıp
-- müşteriye gönderiliyor (payment_installments.payment_url).
--
-- GARANTİ'DE BU MÜMKÜN DEĞİL, iki sebeple:
--   1. Banka aynı orderid'yi ikinci kez kabul etmiyor. Denemesi düşen
--      müşteri aynı bağlantıyla tekrar ödeyemez.
--   2. İmza orderid'ye bağlı. Bugün hesaplanan bir imza, tek
--      denemeden sonra ölü.
--
-- Bu yüzden müşteriye giden bağlantı BİZİM SAYFAMIZ oluyor; müşteri
-- açtığında o an yeni bir orderid üretilip yeni imza hesaplanıyor.
-- Yani bir payment_links kaydına KARŞILIK BİRDEN ÇOK deneme düşüyor ve
-- bankanın geri dönüşünü (oid) doğru kayda bağlayacak yer burası.
--
-- İki yan fayda, ikisi de bankanın kendi tavsiyesiyle örtüşüyor:
-- StoreKey sunucudan hiç çıkmıyor ve tutar sepetten değil, sayfanın
-- açıldığı anda VERİTABANINDAN okunuyor.
--
-- ---------- orderid neden GLOBAL tekil ----------
--
-- ArvoOS, AkademikMerkez ve ArvoCulture aynı Üye İşyeri Numarasını
-- paylaşıyor (ayrı terminaller, 20260929120932). Banka açısından
-- sipariş numarası üye işyeri düzeyinde tekil; iki markanın numarası
-- çakışırsa ikincisi reddedilir. Bu yüzden tekillik kısıtı
-- organization_id'siz, tablo genelinde.
--
-- ---------- RLS ----------
--
-- payment_links ile aynı kalıp: RLS açık, POLİTİKA YOK — yani yalnızca
-- service_role. Panel bu kayıtlara sunucu kodundan, admin istemcisiyle
-- bakıyor. Ödeme kayıtlarını doğrudan tarayıcıya açmıyoruz.
-- ============================================================

create table if not exists public.garanti_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_link_id uuid not null references public.payment_links(id) on delete cascade,
  -- Bankaya giden orderid; üye işyeri düzeyinde tekil olmak zorunda.
  order_id text not null,
  amount bigint not null,
  currency_code integer not null default 949,
  -- Hangi terminalle denendi: aynı kurumun terminali sonradan
  -- değişirse, eski denemenin hangisiyle yapıldığı kaybolmasın.
  terminal_id text not null,
  status text not null default 'started',
  -- Bankadan dönenler; doğrulama sonucu ne olursa olsun saklanıyor.
  md_status text,
  proc_return_code text,
  bank_message text,
  -- Doğrulama tutmadıysa sebebi: sessizce kaybolmasın.
  reject_reason text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

comment on table public.garanti_payment_attempts is
  'Garanti 3D ödeme denemeleri. Bir payment_links kaydına birden çok deneme düşer; banka dönüşü order_id ile buraya bağlanır.';

alter table public.garanti_payment_attempts
  drop constraint if exists garanti_payment_attempts_order_id_key;
alter table public.garanti_payment_attempts
  add constraint garanti_payment_attempts_order_id_key unique (order_id);

alter table public.garanti_payment_attempts
  drop constraint if exists garanti_payment_attempts_amount_check;
alter table public.garanti_payment_attempts
  add constraint garanti_payment_attempts_amount_check check (amount > 0);

alter table public.garanti_payment_attempts
  drop constraint if exists garanti_payment_attempts_status_check;
alter table public.garanti_payment_attempts
  add constraint garanti_payment_attempts_status_check
  check (status = any (array['started', 'paid', 'failed', 'rejected']));

-- Sipariş numarası bankanın kabul ettiği biçimde: harf, rakam ve kısa
-- çizgi. Boşluklu ya da işaretli bir numara bankada sessizce başka
-- yorumlanabilir.
alter table public.garanti_payment_attempts
  drop constraint if exists garanti_payment_attempts_order_id_check;
alter table public.garanti_payment_attempts
  add constraint garanti_payment_attempts_order_id_check
  check (order_id ~ '^[A-Za-z0-9-]{8,64}$');

-- Bitmemiş denemeyi bitmiş gibi göstermeyelim: bitiş damgası yalnızca
-- sonuçlanmış denemede olur, sonuçlanmışta da olmak zorunda.
alter table public.garanti_payment_attempts
  drop constraint if exists garanti_payment_attempts_finished_check;
alter table public.garanti_payment_attempts
  add constraint garanti_payment_attempts_finished_check
  check ((status = 'started') = (finished_at is null));

create index if not exists garanti_payment_attempts_link_idx
  on public.garanti_payment_attempts (payment_link_id, started_at desc);
create index if not exists garanti_payment_attempts_org_idx
  on public.garanti_payment_attempts (organization_id, started_at desc);

alter table public.garanti_payment_attempts enable row level security;

-- Geri almak için:
-- drop table if exists public.garanti_payment_attempts;
