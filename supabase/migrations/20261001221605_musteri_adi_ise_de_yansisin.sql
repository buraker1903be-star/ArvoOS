-- ============================================================
-- MÜŞTERİ ADI DEĞİŞİNCE İŞ KAYDI DA GÜNCELLENSİN
--
-- operation_workflows.customer_name, iş oluşturulurken fırsattan
-- alınmış bir KOPYA. Ad sonradan düzeltilince (operasyon künye
-- penceresinden ya da CRM'den) kopya eskide kalıyordu: İşler listesi,
-- pano, takvim, arşiv ve genel bakış hep eski adı gösteriyordu.
-- Sözleşme, finans ekranı ve iş detayı ise fırsattan okuduğu için
-- doğruyu gösteriyordu — yani aynı müşteri iki ekranda iki ayrı adla
-- görünüyordu.
--
-- NEDEN TETİKLEYİCİ, HER EKRANI TEK TEK BİRLEŞTİRMEK DEĞİL:
-- kopyayı okuyan beş ekran var ve yarın bir altıncısı yazılabilir.
-- Daha önemlisi, adı yalnızca operasyon değiştirmiyor; CRM'deki fırsat
-- formu da değiştiriyor. Yazma yolunu tek tek yakalamak yerine kaynağa
-- bağlanınca hangi yoldan gelirse gelsin kopya güncelleniyor.
--
-- Kopya SİLİNMİYOR: fırsatı olmayan (kurum içi) işlerde tek ad odur.
-- ============================================================

create or replace function private.arvo_musteri_adi_ise_yansit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.operation_workflows w
     set customer_name = new.customer_name,
         updated_at = now()
    from public.crm_contracts c
   where c.opportunity_id = new.id
     and w.contract_id = c.id
     and w.customer_name is distinct from new.customer_name;
  return new;
end;
$$;

revoke all on function private.arvo_musteri_adi_ise_yansit() from public, anon;
grant execute on function private.arvo_musteri_adi_ise_yansit() to authenticated, service_role;

drop trigger if exists arvo_musteri_adi_ise_yansit on public.crm_opportunities;
-- Yalnızca ad gerçekten değiştiğinde: her fırsat güncellemesinde işleri
-- taramak gereksiz yazma ve gereksiz updated_at demekti.
create trigger arvo_musteri_adi_ise_yansit
  after update of customer_name on public.crm_opportunities
  for each row
  when (old.customer_name is distinct from new.customer_name)
  execute function private.arvo_musteri_adi_ise_yansit();

/*
  Bugüne kadar ayrışmış kayıtlar bir kez hizalanıyor. Tetikleyici
  yalnızca BUNDAN SONRAKİ değişiklikleri yakalar; hâlihazırda eski ad
  taşıyan işler kendiliğinden düzelmezdi.
*/
update public.operation_workflows w
   set customer_name = o.customer_name
  from public.crm_contracts c
  join public.crm_opportunities o on o.id = c.opportunity_id
 where w.contract_id = c.id
   and w.customer_name is distinct from o.customer_name;

notify pgrst, 'reload schema';
