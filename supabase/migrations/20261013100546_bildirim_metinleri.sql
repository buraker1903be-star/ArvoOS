/*
  BİLDİRİM METİNLERİ, SÖZLEŞME İMZASI, EKİP MESAJI (13.10.2026).

  Anlık bildirim (20261013071812) telefona bildirim satırının HAM başlık
  ve metnini gönderiyor. Paneldeki çan bu metni kendisi yeniden kuruyor
  (notifications/describe.ts); telefonda ise kurum sahibinin gördüğü:
  "TKF-2026-000083 müşteri tarafından onaylandı" — müşterinin adı yok;
  "Müşteriden yeni mesaj / SOZ-… numaralı dosya için müşteri mesaj
  gönderdi" — mesajın kendisi yok. Kurum sahibinin tarifi:
    - Teklif/sözleşme: "Müşteri Meral Aydaç, TKF-… numaralı teklifi onayladı."
    - Müşteri mesajı: başlık müşterinin adı, metin mesajın kendisi.
    - Talep ataması: "Yeni Talep Ataması / Ad Soyad müşterisinin talebi
      size atanmıştır."
    - Ekip mesajı (Mesajlar uygulaması): kimden + mesajın kendisi.
    - "Bildirimlere düşen her şey telefona da düşmeli."

  1) METİN KATMANI: notifications'a BEFORE INSERT. Bildirimi yazan on üç
     yolun (teklif onayı gibi iş kuralı taşıyan büyük işlevler dahil)
     her birini yeniden yazmak yerine metin TEK yerde, kategoriye göre,
     satırın metadata'sındaki kimliklerden kuruluyor. Push tetikleyicisi
     AFTER çalıştığı için telefona son metin gider. Hiçbir koşulda
     bildirimin kendisini düşürmez: okuma hata verirse eski metin kalır.
  2) SÖZLEŞME İMZALANDI: bugüne dek hiçbir bildirim yoktu (imza işlevleri
     bildirim yazmıyor). crm_contracts'a AFTER UPDATE OF status: imzaya
     geçişte yöneticiler ve talebin satış temsilcisi.
  3) KURUMA YAYIN da telefona: user_id boş bildirimler (satış operasyona
     aktarıldı, ödeme onayı, müşteride bekleyen iş, revizyon süresi…)
     panelde herkese görünüyor ama push'a hiç gitmiyordu. Artık kurumun
     cihazı olan ve bildirimleri kapatmamış üyelerine gidiyor. Gelen posta
     İSTİSNA: kişi kendisi açar (20261013081415).
  4) EKİP MESAJI: internal_messages'a AFTER INSERT; konuşmanın gönderen
     dışındaki üyelerinden cihazı olan varsa sunucuya { mesaj_id } haber
     verir. Bildirim satırı AÇILMAZ: mesajların kendi okunmamış sayacı
     var, çan sohbetle dolmasın.

  Push işlevinin gövdesi 20261013090223'ten alındı.
*/

-- 1) Metin katmanı ----------------------------------------------------------
create or replace function private.arvo_bildirim_metni()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ad text;
  v_metin text;
  v_yazan text;
  v_baslik text;
begin
  begin
    case new.category
      when 'proposal_customer_decision' then
        select coalesce(nullif(new.metadata->>'customer_name', ''), o.customer_name) into v_ad
        from public.crm_proposals p
        left join public.crm_opportunities o on o.id = p.opportunity_id
        where p.id = (new.metadata->>'proposal_id')::uuid;
        v_ad := coalesce(v_ad, new.metadata->>'customer_name', 'Müşteri');
        if new.metadata->>'decision' = 'accept' then
          new.title := 'Teklif onaylandı';
          new.message := 'Müşteri ' || v_ad || ', ' || coalesce(new.metadata->>'proposal_no', 'teklif') || ' numaralı teklifi onayladı.';
        else
          new.title := 'Teklif reddedildi';
          new.message := 'Müşteri ' || v_ad || ', ' || coalesce(new.metadata->>'proposal_no', 'teklif') || ' numaralı teklifi reddetti.';
        end if;

      when 'sales_assignment' then
        select o.customer_name into v_ad from public.crm_opportunities o where o.id = (new.metadata->>'opportunity_id')::uuid;
        if v_ad is not null then
          new.title := 'Yeni Talep Ataması';
          new.message := v_ad || ' müşterisinin talebi size atanmıştır.';
        end if;

      when 'operation_assignment' then
        select w.customer_name, w.title into v_ad, v_baslik from public.operation_workflows w where w.id = (new.metadata->>'workflow_id')::uuid;
        new.title := 'Yeni İş Ataması';
        new.message := coalesce(v_ad || ' müşterisinin ', '') || '“' || coalesce(v_baslik, 'yeni iş') || '” işi size atanmıştır.';

      when 'customer_message' then
        -- Az önce aynı işlemde yazılan müşteri mesajı.
        select coalesce(o.customer_name, c.signed_name), m.body into v_ad, v_metin
        from public.crm_contracts c
        left join public.crm_opportunities o on o.id = c.opportunity_id
        left join lateral (
          select f.body from public.customer_file_messages f
          where f.contract_id = c.id and f.sender_type = 'customer'
          order by f.created_at desc limit 1
        ) m on true
        where c.id = (new.metadata->>'contract_id')::uuid;
        if v_metin is not null then
          new.title := coalesce(v_ad, 'Müşteri');
          new.message := left(v_metin, 300);
        end if;

      when 'internal_comment' then
        select k.body, e.full_name, o.customer_name into v_metin, v_yazan, v_ad
        from public.crm_internal_comments k
        left join public.hr_employees e on e.user_id = k.created_by and e.organization_id = k.organization_id
        left join public.crm_opportunities o on o.id = k.opportunity_id
        where k.id = (new.metadata->>'comment_id')::uuid;
        if v_metin is not null then
          new.title := coalesce(v_yazan, 'Ekipten biri') || coalesce(' · ' || v_ad, '');
          new.message := left(v_metin, 300);
        end if;

      when 'crm_won_automation' then
        select o.customer_name into v_ad from public.crm_opportunities o where o.id = (new.metadata->>'opportunity_id')::uuid;
        if v_ad is not null then
          new.message := v_ad || ' müşterisinin satışı operasyona aktarıldı; iş akışı ve ödeme kaydı açıldı.';
        end if;

      when 'contract_addendum_accepted', 'contract_addendum_rejected' then
        select coalesce(o.customer_name, c.signed_name) into v_ad
        from public.crm_contracts c left join public.crm_opportunities o on o.id = c.opportunity_id
        where c.id = (new.metadata->>'contract_id')::uuid;
        new.message := 'Müşteri ' || coalesce(v_ad, '') || ', ' || coalesce(new.metadata->>'contract_no', 'sözleşme')
          || ' Ek Protokol ' || coalesce(new.metadata->>'addendum_no', '')
          || case when new.category = 'contract_addendum_accepted' then ' onayladı.' else ' için değişiklik istedi.' end;

      else
        null;
    end case;
  exception when others then
    -- Metin kurulamazsa bildirim eski metniyle yazılır; hiçbir zaman düşmez.
    raise warning 'bildirim metni kurulamadı (%): %', new.category, sqlerrm;
  end;
  return new;
end $$;

revoke all on function private.arvo_bildirim_metni() from public, anon, authenticated;

drop trigger if exists arvo_bildirim_metni on public.notifications;
create trigger arvo_bildirim_metni
before insert on public.notifications
for each row execute function private.arvo_bildirim_metni();

-- 2) Sözleşme imzalandı ------------------------------------------------------
create or replace function private.arvo_sozlesme_imza_bildirimi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ad text;
begin
  if new.status <> 'signed' or old.status = 'signed' then
    return null;
  end if;
  select o.customer_name into v_ad from public.crm_opportunities o where o.id = new.opportunity_id;
  v_ad := coalesce(v_ad, new.signed_name, 'Müşteri');

  insert into public.notifications (organization_id, user_id, audience, category, title, message, action_url, metadata)
  select distinct
    new.organization_id, alici.user_id, 'organization', 'contract_signed',
    'Sözleşme imzalandı',
    'Müşteri ' || v_ad || ', ' || new.contract_no || ' numaralı sözleşmeyi imzaladı.',
    '/panel/crm/contracts/' || new.id::text,
    jsonb_build_object('contract_id', new.id, 'contract_no', new.contract_no, 'customer_name', v_ad)
  from (
    select m.user_id from public.organization_memberships m
    where m.organization_id = new.organization_id and m.is_active and m.role::text in ('owner', 'admin', 'manager')
    union
    select e.user_id from public.crm_opportunities o
    join public.hr_employees e on e.id = o.assigned_employee_id
    join public.organization_memberships m on m.organization_id = new.organization_id and m.user_id = e.user_id and m.is_active
    where o.id = new.opportunity_id and e.user_id is not null
  ) alici
  where alici.user_id is not null;
  return null;
exception when others then
  -- İmza hiçbir koşulda bildirim yüzünden geri alınmaz.
  raise warning 'imza bildirimi yazılamadı: %', sqlerrm;
  return null;
end $$;

revoke all on function private.arvo_sozlesme_imza_bildirimi() from public, anon, authenticated;

drop trigger if exists arvo_sozlesme_imza_bildirimi on public.crm_contracts;
create trigger arvo_sozlesme_imza_bildirimi
after update of status on public.crm_contracts
for each row execute function private.arvo_sozlesme_imza_bildirimi();

-- 3) Push: kuruma yayın da --------------------------------------------------
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
    if new.category = 'posta_gelen' then
      -- Gelen posta: yalnızca postayı açmış ve cihazı olan biri varsa.
      if not exists (
        select 1
        from public.push_tercihleri t
        join public.push_subscriptions s on s.organization_id = t.organization_id and s.user_id = t.user_id
        where t.organization_id = new.organization_id and t.posta and t.acik
      ) then
        return null;
      end if;
    elsif not exists (
      -- Diğer yayınlar: cihazı olan ve bildirimleri kapatmamış bir üye varsa.
      select 1
      from public.push_subscriptions s
      join public.organization_memberships m on m.organization_id = s.organization_id and m.user_id = s.user_id and m.is_active
      where s.organization_id = new.organization_id
        and not exists (
          select 1 from public.push_tercihleri t
          where t.organization_id = s.organization_id and t.user_id = s.user_id and not t.acik
        )
    ) then
      return null;
    end if;
  else
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

-- 4) Ekip mesajı ------------------------------------------------------------
create or replace function private.arvo_mesaj_push_duyur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adres text;
  v_sir text;
begin
  if new.deleted_at is not null then
    return null;
  end if;
  if not exists (
    select 1
    from public.message_channel_members uye
    join public.push_subscriptions s on s.organization_id = uye.organization_id and s.user_id = uye.user_id
    where uye.channel_id = new.channel_id
      and uye.user_id <> new.sender_id
      and not exists (
        select 1 from public.push_tercihleri t
        where t.organization_id = uye.organization_id and t.user_id = uye.user_id and not t.acik
      )
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
    body := jsonb_build_object('mesaj_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_sir),
    timeout_milliseconds := 5000
  );
  return null;
exception when others then
  -- Mesaj hiçbir koşulda bildirim yüzünden düşmez.
  raise warning 'mesaj bildirimi haberi gönderilemedi: %', sqlerrm;
  return null;
end $$;

revoke all on function private.arvo_mesaj_push_duyur() from public, anon, authenticated;

drop trigger if exists arvo_mesaj_push_duyur on public.internal_messages;
create trigger arvo_mesaj_push_duyur
after insert on public.internal_messages
for each row execute function private.arvo_mesaj_push_duyur();
