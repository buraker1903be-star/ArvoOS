-- ============================================================
-- ORTAK POSTA KUTUSU — kurumun Gmail bağlantısı
--
-- Kurumun tek bir ortak adresi var (info@, uzman@ gibi) ve ekibin
-- tamamı aynı kutudan okuyup yanıtlıyor. Bu tablo o kutunun BAĞLANTISINI
-- tutuyor; postaların kendisi burada değil (sonraki aşama).
--
-- NEDEN KURUM BAŞINA GOOGLE ANAHTARI:
--
-- Gmail'de gelen kutusu okumak "restricted scope" ve çok kiracılı bir
-- uygulama için Google yayın onayı + yıllık CASA güvenlik denetimi
-- istiyor (ücretli, haftalar). Tek istisna, OAuth onay ekranının
-- "Internal" olması: o zaman hiçbir doğrulama gerekmiyor — ama Internal
-- yalnızca Cloud projesinin bulunduğu Workspace'in kendi kullanıcılarını
-- kapsıyor. Yani Arvo'nun tek bir projesi bütün kiracılara yetmez.
--
-- Bu yüzden anahtar kurumun kendisinde: her kurum kendi Workspace'inde
-- bir Cloud projesi açıp OAuth istemcisini "Internal" olarak kurar,
-- client_id ve client_secret'ı panele girer. Google onayı hiç devreye
-- girmez. Ödeme sağlayıcılarında (Tami, PayTR) ve WhatsApp'ta zaten
-- kurulu olan düzenin aynısı: sır kurumun, saklama bizim.
--
-- SIRLAR AES-256-GCM İLE ŞİFRELİ (lib/payment-credentials.ts), anahtar
-- yalnızca sunucudaki PAYMENT_CREDENTIALS_KEY'de. Tablo RLS açık ve
-- POLİTİKASIZ: authenticated hiçbir satırı göremez, erişim yalnızca
-- service_role üzerinden (whatsapp_accounts ile aynı model). Yenileme
-- belirteci tarayıcıya hiç inmemeli.
-- ============================================================

create table if not exists public.mail_accounts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- Ortak kutunun adresi. Google'dan dönen adresle doğrulanır; elle
  -- yazılan adrese güvenilmez (başka kutuya bağlanıp bu adresi yazan
  -- biri, ekrana yanlış kimlik gösterirdi).
  email text not null,
  client_id text not null,
  client_secret_enc text not null,
  refresh_token_enc text,
  status text not null default 'beklemede',
  -- Gmail'in artımlı eşitleme imleci (sonraki aşama): her senkronda
  -- buradan devam edilir, kutunun tamamı yeniden okunmaz.
  last_history_id text,
  last_sync_at timestamptz,
  last_error text,
  connected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mail_accounts_status_check
    check (status in ('beklemede', 'bagli', 'hata', 'kapali'))
);

/*
  Erişim yalnızca sunucudan.

  grant YOK: authenticated ve anon bu tabloya hiç dokunamaz. RLS'i de
  açıyoruz ki ileride yanlışlıkla bir grant eklendiğinde politikasız
  tablo yine kapalı kalsın — iki kat, çünkü burada duran şey kurumun
  posta kutusunun anahtarı.
*/
revoke all on public.mail_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.mail_accounts to service_role;
alter table public.mail_accounts enable row level security;

comment on table public.mail_accounts is
  'Kurumun ortak Gmail kutusunun bağlantısı. Sırlar AES-256-GCM ile şifreli; yalnızca service_role erişir, RLS politikasız kapalıdır.';
comment on column public.mail_accounts.status is
  'beklemede: anahtarlar girildi, Google izni alınmadı · bagli: çalışıyor · hata: yenileme belirteci reddedildi · kapali: kurum kapattı';

notify pgrst, 'reload schema';
