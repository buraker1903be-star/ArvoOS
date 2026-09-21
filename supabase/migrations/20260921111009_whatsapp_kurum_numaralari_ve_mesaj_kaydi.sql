-- ============================================================
-- WhatsApp: kurumun kendi numarası + mesaj kaydı
--
-- Dört ürün de WhatsApp'tan mesaj gönderecek ve iki ayrı gönderen var:
--
--   1. Arvo → kendi müşterisine (kurum): ödeme hatırlatma, lisans bildirimi.
--      Tek Arvo numarasından gider; anahtarı ortam değişkeninde, burada değil.
--   2. Kurum → kendi müşterisine: AkademikMerkez'in teklif/sözleşme/takip
--      kodu, ARC'ta sipariş ve iade, Randevu'da randevu bilgisi. Bu mesajlar
--      kurumun KENDİ numarasından gitmeli; müşteri "Arvo"dan değil çalıştığı
--      işletmeden mesaj aldığını görsün.
--
-- Bu migration ikincisinin kaydını açar: kurum WhatsApp Business hesabını
-- (WABA) bağlar, gönderim kapısı numarayı buradan bulur. Bağlamamış kurum
-- Arvo'nun ortak numarasına düşer.
--
-- Erişim anahtarı düz yazılmaz: PayTR mağaza anahtarlarıyla aynı yol
-- (lib/payment-credentials.ts, AES-256-GCM, PAYMENT_CREDENTIALS_KEY).
-- organization_payment_providers gibi bu tabloda da POLİTİKA YOK: yalnızca
-- service_role okur/yazar, panel createAdminClient ile gider ve yetkiyi
-- sunucu tarafı doğrular. Oturum jetonu tarayıcıda olduğu için token'a
-- authenticated erişimi açmak onu API'den okunabilir yapardı.
-- ============================================================

create table if not exists public.whatsapp_accounts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- Meta tarafındaki kimlikler: WABA ve gönderen numara.
  waba_id text not null,
  phone_number_id text not null unique,
  -- Meta'dan doğrulamada okunan görünen ad ve numara; panelde gösterilir.
  display_phone text,
  verified_name text,
  access_token_enc text not null,
  status text not null default 'connected'
    check (status in ('connected', 'unverified', 'disabled')),
  -- Son doğrulama denemesi ve hatası: panel "neden çalışmıyor"u söylesin.
  last_verified_at timestamptz,
  last_error text,
  connected_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_accounts enable row level security;

-- Supabase yeni tabloyu varsayılan yetkiyle anon ve authenticated'a açar;
-- politikasız RLS zaten kapıyı tutuyor ama token tablosunda tek savunmaya
-- güvenmiyoruz: yetkiyi de açıkça geri alıyoruz.
revoke all on table public.whatsapp_accounts from anon, authenticated;

comment on table public.whatsapp_accounts is
  'Kurumun kendi WhatsApp Business numarası. Yalnızca service_role; access_token_enc şifrelidir.';

-- ------------------------------------------------------------
-- Mesaj kaydı: giden ve gelen. Gelen kutusu (sonraki adım) ve "gitti mi"
-- sorusunun tek kaynağı. Ürün kendi kaydını `ref` ile bağlar (randevu
-- kimliği, teklif kimliği…).
-- ------------------------------------------------------------
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product text not null check (product in ('arvoos', 'arvolab', 'arc', 'randevu')),
  -- Mesajı kim gönderiyor: kurumun numarası mı, Arvo'nun ortak numarası mı.
  sender text not null check (sender in ('organization', 'arvo')),
  direction text not null check (direction in ('outbound', 'inbound')),
  -- Gönderen numaranın Meta kimliği; gelen mesajı kuruma bu eşler.
  phone_number_id text,
  -- Meta'nın verdiği mesaj kimliği (wamid…); durum bildirimi bununla gelir.
  wa_message_id text,
  -- Karşı taraf (kurumun müşterisi ya da Arvo'nun müşterisi), 905XXXXXXXXX.
  counterpart_phone text not null,
  template text,
  params jsonb,
  body text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  error text,
  ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_org_idx
  on public.whatsapp_messages (organization_id, created_at desc);
-- Durum bildirimi ve yanıt eşlemesi mesaj kimliğinden gelir.
create index if not exists whatsapp_messages_wa_id_idx
  on public.whatsapp_messages (wa_message_id) where wa_message_id is not null;

alter table public.whatsapp_messages enable row level security;

-- Kayıtta sır yok: kurumun yetkili üyesi kendi kurumunun mesajlarını görür
-- (gelen kutusu ekranı bunun üstüne kurulacak). Yazma yalnızca kapıdan,
-- yani service_role ile olur: kullanıcı "gönderildi" yazamaz.
create policy "privileged members read org whatsapp messages"
  on public.whatsapp_messages
  as permissive for select to authenticated
  using (private.arvo_is_privileged_member(organization_id));

notify pgrst, 'reload schema';
