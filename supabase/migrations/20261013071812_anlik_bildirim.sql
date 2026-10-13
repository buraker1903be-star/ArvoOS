/*
  ANLIK BİLDİRİM (web push), 13.10.2026 — mobil uygulama 4. aşama.

  Panel bildirimleri yalnızca panel açıkken görünüyordu (çan + Realtime).
  Sahadaki personel ve yönetici telefonu cebindeyken "sana iş atandı",
  "müşteri yazdı" haberini almıyordu. Bu migration iki şey kurar:

  1) push_subscriptions: hangi kullanıcının hangi cihazı (tarayıcının
     push adresi + şifreleme anahtarları). Yalnızca sunucu (service_role)
     okur/yazar: kayıt ve silme sunucu işlemleriyle (oturumdaki kişiye
     bağlanarak) yapılıyor. Aynı cihaz başka bir kullanıcıyla giriş
     yapınca adres yeni kişiye geçmeli; istemciden bu bir başkasının
     satırını güncellemek demek, RLS ile ifade etmek yerine sunucuda.

  2) notifications'a AFTER INSERT tetikleyici: kişiye özel bildirim
     (user_id dolu) açıldığında ve kişinin kayıtlı cihazı varsa
     sunucunun /api/push/gonder adresine pg_net ile haber verir. Sunucu
     bildirimi KİMLİKLE yeniden okur (gövdeye güvenmez) ve cihazlara
     gönderir. Bildirim yazan yol on üç ayrı yerde (tetikleyiciler, RPC'ler,
     cron); tek kanca bu tablonun kendisi.

  Kuruma yayın bildirimleri (user_id boş: posta gelen kutusu, eşitleme
  durumu) push'a GİTMEZ: ortak kutuya düşen her posta herkesin cebini
  titretirdi.

  Adres ve paylaşılan sır Supabase Vault'ta (arvo_push_adres,
  arvo_push_sir); migration'a yazılmaz. İkisi yoksa tetikleyici hiçbir
  şey yapmaz. Tetikleyici HİÇBİR durumda bildirimin kendisini
  düşürmez: haber verilemezse yalnızca uyarı yazar.
*/

create extension if not exists pg_net;

-- 1) Cihaz kayıtları -----------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  cihaz text check (cihaz is null or char_length(cihaz) <= 200),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id, organization_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant all on table public.push_subscriptions to service_role;

-- 2) Bildirim açılınca sunucuya haber ------------------------------------------
create or replace function private.arvo_push_duyur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adres text;
  v_sir text;
begin
  if new.user_id is null or new.audience <> 'organization' then
    return null;
  end if;
  -- Cihazı olmayan kişi için istek atılmaz (çoğu bildirim böyle).
  if not exists (
    select 1 from public.push_subscriptions s
    where s.user_id = new.user_id and s.organization_id = new.organization_id
  ) then
    return null;
  end if;

  select decrypted_secret into v_adres from vault.decrypted_secrets where name = 'arvo_push_adres' limit 1;
  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'arvo_push_sir' limit 1;
  if v_adres is null or v_sir is null then
    return null;
  end if;

  perform net.http_post(
    url := v_adres,
    body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_sir),
    timeout_milliseconds := 5000
  );
  return null;
exception when others then
  raise warning 'anlık bildirim haberi gönderilemedi: %', sqlerrm;
  return null;
end $$;

revoke all on function private.arvo_push_duyur() from public, anon, authenticated;

drop trigger if exists arvo_push_duyur on public.notifications;
create trigger arvo_push_duyur
after insert on public.notifications
for each row execute function private.arvo_push_duyur();
