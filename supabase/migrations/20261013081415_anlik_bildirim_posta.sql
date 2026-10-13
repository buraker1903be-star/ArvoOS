/*
  ANLIK BİLDİRİM: GELEN POSTA, KİŞİ KENDİSİ AÇARSA (13.10.2026).

  20261013071812 kuruma yayın bildirimlerini (user_id boş) push'a hiç
  göndermiyordu: ortak kutuya düşen her posta herkesin cebini
  titretirdi. Kurum sahibi telefona posta gönderip bildirim
  beklediğinde bu boşluk göründü. Karar (13.10.2026): kişi kendisi
  açsın — cihaz başına "Gelen postaları da bildir" anahtarı, varsayılan
  KAPALI.

  - push_subscriptions.posta: bu cihaza gelen posta da bildirilsin mi.
    Yalnızca sunucu yazar (tablo istemciye kapalı); açarken postayı
    görme yetkisi (posta.gor) sunucuda denetlenir.
  - Tetikleyici: user_id boş ve kategori 'posta_gelen' ise, kurumda
    posta anahtarı açık bir cihaz varsa sunucuya haber verir. Yetki
    GÖNDERİM anında yeniden hesaplanır (app/api/push/gonder): anahtarı
    açtıktan sonra posta yetkisi alınan kişiye konu satırı gitmesin.

  Gövde 20261013071812'deki işlevden alındı; tek değişiklik yayın dalı.
*/

alter table public.push_subscriptions
  add column if not exists posta boolean not null default false;

create index if not exists push_subscriptions_posta_idx
  on public.push_subscriptions(organization_id) where posta;

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
    -- Kuruma yayın: yalnızca gelen posta, yalnızca anahtarı açık cihaz varsa.
    if new.category is distinct from 'posta_gelen' then
      return null;
    end if;
    if not exists (
      select 1 from public.push_subscriptions s
      where s.organization_id = new.organization_id and s.posta
    ) then
      return null;
    end if;
  elsif not exists (
    -- Kişiye özel: cihazı olmayan kişi için istek atılmaz (çoğu bildirim böyle).
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
