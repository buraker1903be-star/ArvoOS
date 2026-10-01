-- ============================================================
-- MÜŞTERİ BİLGİSİ DEĞİŞİNCE CARİ DE GÜNCELLENSİN
--
-- Sözleşme imzalanırken cari (account_parties) FIRSATTAN doğuyor:
-- ad, e-posta ve telefon oradan kopyalanıyor. Sonradan müşteri bilgisi
-- düzeltilince cari eskide kalıyordu; finans ekranı ve cari kartı eski
-- adı/e-postayı gösteriyordu.
--
-- DAHA CİDDİSİ, DEFTER İKİYE BÖLÜNEBİLİYORDU: imza fonksiyonu mevcut
-- cariyi ADA GÖRE arıyor (lower(name) = lower(opp.customer_name)). Ad
-- düzeltildikten sonra aynı müşteriye ikinci sözleşme yapılırsa eşleşme
-- tutmuyor ve İKİNCİ bir cari açılıyor — aynı müşterinin borcu iki ayrı
-- kayda dağılıyor. Adı güncel tutmak bunu da kapatıyor.
--
-- ELLE DÜZELTİLMİŞ CARİ EZİLMİYOR. Muhasebe cariyi kendi ekranından
-- değiştirebiliyor (vergi no, adres, ticari unvan). Bu yüzden her alan
-- yalnızca cari HÂLÂ ESKİ CRM DEĞERİNİ taşıyorsa güncelleniyor; biri
-- elle değiştirilmişse ona dokunulmuyor.
--
-- Önceki tetikleyicinin (20261001221605) yerini alıyor: o yalnızca iş
-- kaydındaki ad kopyasını güncelliyordu, bu ikisini birden yapıyor ve
-- e-posta ile telefonu da kapsıyor.
-- ============================================================

create or replace function private.arvo_musteri_bilgisi_yansit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- 1) İş kaydındaki ad kopyası (İşler, pano, takvim, arşiv, genel bakış)
  if new.customer_name is distinct from old.customer_name then
    update public.operation_workflows w
       set customer_name = new.customer_name,
           updated_at = now()
      from public.crm_contracts c
     where c.opportunity_id = new.id
       and w.contract_id = c.id
       and w.customer_name is distinct from new.customer_name;
  end if;

  -- 2) Cari (finans). Bağlantı ödeme planı üzerinden; sözleşmenin kendi
  --    party_id'si de dolu olabiliyor, ikisi birden taranıyor.
  update public.account_parties p
     set name  = case when p.name  is not distinct from old.customer_name
                      then new.customer_name else p.name end,
         email = case when p.email is not distinct from old.contact_email
                      then new.contact_email else p.email end,
         phone = case when p.phone is not distinct from old.contact_phone
                      then new.contact_phone else p.phone end,
         updated_at = now()
   where p.organization_id = new.organization_id
     and p.id in (
       select pp.party_id
         from public.crm_contracts c
         join public.payment_plans pp on pp.contract_id = c.id
        where c.opportunity_id = new.id and pp.party_id is not null
       union
       select c.party_id
         from public.crm_contracts c
        where c.opportunity_id = new.id and c.party_id is not null
     );

  return new;
end;
$$;

revoke all on function private.arvo_musteri_bilgisi_yansit() from public, anon;
grant execute on function private.arvo_musteri_bilgisi_yansit() to authenticated, service_role;

drop trigger if exists arvo_musteri_adi_ise_yansit on public.crm_opportunities;
drop trigger if exists arvo_musteri_bilgisi_yansit on public.crm_opportunities;
create trigger arvo_musteri_bilgisi_yansit
  after update of customer_name, contact_email, contact_phone on public.crm_opportunities
  for each row
  when (old.customer_name is distinct from new.customer_name
     or old.contact_email is distinct from new.contact_email
     or old.contact_phone is distinct from new.contact_phone)
  execute function private.arvo_musteri_bilgisi_yansit();

/*
  Bugüne kadar ayrışmış cariler bir kez hizalanıyor — yalnızca adı
  fırsatla aynı olanlar. Adı farklı olan cari elle değiştirilmiş
  olabilir; ona dokunmak muhasebenin kaydını bozardı.
*/
update public.account_parties p
   set email = coalesce(o.contact_email, p.email),
       phone = coalesce(o.contact_phone, p.phone)
  from public.crm_contracts c
  join public.crm_opportunities o on o.id = c.opportunity_id
  join public.payment_plans pp on pp.contract_id = c.id
 where p.id = pp.party_id
   and lower(p.name) = lower(o.customer_name)
   and (p.email is distinct from o.contact_email or p.phone is distinct from o.contact_phone);

notify pgrst, 'reload schema';
