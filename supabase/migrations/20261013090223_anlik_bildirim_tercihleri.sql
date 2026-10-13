/*
  ANLIK BİLDİRİM TERCİHLERİ KİŞİ BAŞINA (13.10.2026).

  20261013081415 "Gelen postaları da bildir" anahtarını CİHAZA koymuştu
  (push_subscriptions.posta) ve "Kapat" yalnızca o cihazı kapatıyordu.
  Kurum sahibinin kuralı: "masaüstünden yapılan her ayar tüm etkin
  cihazlarda da geçerli olmalı". Tercih artık kişinin (kurum + kullanıcı)
  tek satırında; cihaz kayıtları yalnızca "nereye gönderilecek"i tutuyor.

  - acik: kişinin bütün cihazlarına anlık bildirim (kapalıysa hiçbiri).
  - posta: gelen posta da bildirilsin mi (yetki gönderimde yeniden
    hesaplanıyor, 20261013081415'teki gibi).

  Satırı olmayan kişi: acik = true, posta = false (bugünkü davranış).
  Eski cihaz anahtarı (push_subscriptions.posta) taşınıyor: kişinin
  herhangi bir cihazında açıksa kişide açık. Sütun kalıyor ama artık
  okunmuyor.

  Tablo istemciye kapalı (push_subscriptions gibi): sunucu işlemleri
  oturumdaki kişinin satırını yazar.

  İşlev gövdesi 20261013081415'ten alındı; değişen: cihaz anahtarı yerine
  kişi tercihi, kişiye özel bildirimde "acik" denetimi.
*/

create table if not exists public.push_tercihleri (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  acik boolean not null default true,
  posta boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists push_tercihleri_posta_idx
  on public.push_tercihleri(organization_id) where posta and acik;

alter table public.push_tercihleri enable row level security;
revoke all on table public.push_tercihleri from public, anon, authenticated;
grant all on table public.push_tercihleri to service_role;

-- Cihaz anahtarını kişiye taşı.
insert into public.push_tercihleri (organization_id, user_id, posta)
select organization_id, user_id, bool_or(posta)
from public.push_subscriptions
group by organization_id, user_id
on conflict (organization_id, user_id) do update set posta = excluded.posta;

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
  if new.audience <> 'organization' then
    return null;
  end if;

  if new.user_id is null then
    -- Kuruma yayın: yalnızca gelen posta, yalnızca postayı açmış ve
    -- cihazı olan biri varsa.
    if new.category is distinct from 'posta_gelen' then
      return null;
    end if;
    if not exists (
      select 1
      from public.push_tercihleri t
      join public.push_subscriptions s
        on s.organization_id = t.organization_id and s.user_id = t.user_id
      where t.organization_id = new.organization_id and t.posta and t.acik
    ) then
      return null;
    end if;
  else
    -- Kişiye özel: cihazı yoksa ya da bildirimleri kapattıysa istek atılmaz.
    if not exists (
      select 1 from public.push_subscriptions s
      where s.user_id = new.user_id and s.organization_id = new.organization_id
    ) then
      return null;
    end if;
    if exists (
      select 1 from public.push_tercihleri t
      where t.user_id = new.user_id and t.organization_id = new.organization_id and not t.acik
    ) then
      return null;
    end if;
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
