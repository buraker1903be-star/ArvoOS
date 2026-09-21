-- ============================================================
-- WhatsApp: sohbet arşivi ve hazır mesajlar
--
-- İki eksik, ikisi de sohbet sayısı arttıkça büyüyor:
--
--   1. Arşiv. Kapanmış yazışmalar listenin başında durmaya devam ediyor;
--      satışçı her gün aynı ölü sohbetlerin arasından geçiyor. Silmek
--      seçenek değil: kayıt hem kanıt hem de CRM geçmişi.
--   2. Hazır mesaj. Aynı cevaplar (fiyat listesi, çalışma saatleri, demo
--      randevusu) her seferinde elle yazılıyor; yazım her seferinde biraz
--      farklı çıkıyor.
--
-- Mesajın kendisine dokunulmuyor: arşiv sohbet DÜZEYİNDE bir durum, mesaj
-- satırlarının değişmesi gerekmez. Arşivlenmiş bir sohbete yeni mesaj
-- gelirse arşivden kendiliğinden çıkar — bu karar uygulamada
-- (lib/whatsapp-inbox.ts), veride değil: veriyi bozmadan fikir
-- değiştirebilelim diye.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Sohbet durumu
--
-- Anahtar (kurum, numara): aynı numara iki kurumun müşterisi olabilir ve
-- biri arşivlediğinde diğerinin listesi değişmemeli.
-- ------------------------------------------------------------
create table if not exists public.whatsapp_conversation_state (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Karşı taraf, 905XXXXXXXXX. whatsapp_messages.counterpart_phone ile aynı biçim.
  counterpart_phone text not null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, counterpart_phone)
);

comment on table public.whatsapp_conversation_state is
  'Sohbet düzeyinde durum (şimdilik yalnızca arşiv). Mesaj satırları değişmez.';

alter table public.whatsapp_conversation_state enable row level security;

-- Okuma kurumun yetkili üyesine açık; yazma yalnızca kapıdan (service_role)
-- olur. Kullanıcı tabloya doğrudan yazabilseydi başka bir kurumun
-- numarasını kendi kurumuna arşivleyebilirdi — anahtarın ilk sütunu
-- kurum olduğu için satır sessizce oraya düşerdi.
create policy "privileged members read org whatsapp conversation state"
  on public.whatsapp_conversation_state
  as permissive for select to authenticated
  using (private.arvo_is_privileged_member(organization_id));

-- Liste sorgusu arşivlenmemişleri istiyor; kısmi indeks yalnızca
-- arşivlenmişleri tutuyor, çünkü tablo büyüdükçe arşivli satır azınlıkta kalır.
create index if not exists whatsapp_conversation_state_arsiv_idx
  on public.whatsapp_conversation_state (organization_id)
  where archived_at is not null;

-- ------------------------------------------------------------
-- 2. Hazır mesajlar
--
-- Kurum başına; Arvo'nun kendi kurumu da kendi metinlerini yazar. Kod
-- tarafında önerilen bir başlangıç listesi var (lib/whatsapp-hazir-mesaj.ts)
-- ama o yalnızca öneri: kaydedilmeden kullanılabilir, kaydedilince bu
-- tabloya düşer. Böylece her kuruma satır kopyalamak (ve yeni kurum
-- açıldığında kopyalamayı unutmak) gerekmiyor.
-- ------------------------------------------------------------
create table if not exists public.whatsapp_quick_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Listede görünen kısa ad ("Fiyat listesi"), gövde gönderilecek metin.
  title text not null check (length(btrim(title)) between 1 and 60),
  body text not null check (length(btrim(body)) between 1 and 1024),
  -- Sıralama kullanıcıya bırakılıyor; en çok kullanılan üste alınabilsin.
  sort_index integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.whatsapp_quick_replies is
  'Kurumun hazır WhatsApp yanıtları. {ad} yer tutucusu gönderim anında müşterinin adıyla değişir.';

-- Aynı başlıktan iki tane olursa listede hangisinin hangisi olduğu
-- anlaşılmıyor; tekilliği veritabanı tutuyor.
create unique index if not exists whatsapp_quick_replies_baslik_uniq
  on public.whatsapp_quick_replies (organization_id, lower(btrim(title)));

create index if not exists whatsapp_quick_replies_org_idx
  on public.whatsapp_quick_replies (organization_id, sort_index, created_at);

alter table public.whatsapp_quick_replies enable row level security;

create policy "privileged members read org whatsapp quick replies"
  on public.whatsapp_quick_replies
  as permissive for select to authenticated
  using (private.arvo_is_privileged_member(organization_id));

notify pgrst, 'reload schema';
