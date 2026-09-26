-- Operasyon kayıt geçmişi okunabilsin.
--
-- İş detayı sayfası "Kayıt geçmişi" panosunu çiziyor (RecordHistory,
-- entity_type = 'operation_workflow') ama pano HER ZAMAN boştu. İki sebep
-- birlikte:
--
--   1. activity_logs üzerindeki tek SELECT politikası
--      (activity_logs_select_crm_chain) entity_type'ı üç CRM türüyle
--      sınırlıyor VE eşleşen bir crm_opportunities satırı şart koşuyor.
--      'operation_workflow' satırları kimseye görünmüyordu — yazılsalar
--      bile.
--   2. Operasyon işlemlerinin hiçbiri kayıt düşmüyordu (bu migration'la
--      birlikte gelen kod değişikliği onu ekliyor).
--
-- Yani özellik ekranda vardı, çalışmıyordu. Operasyoncunun "iş akışlarını
-- tarihsel olarak takip etmek istiyoruz" talebinin karşılığı buradaydı.
--
-- ERİŞİM KURALI: kaydın işine erişebilen görebilir. Alt sorgu
-- operation_workflows üzerinde ve o tablonun KENDİ RLS'i geçerli
-- (politika ifadesi çağıran kullanıcının yetkisiyle çalışıyor), yani kural
-- private.arvo_can_access_workflow'dan geliyor ve burada ikinci kez
-- yazılmıyor. İki yerde ayrı yazılan erişim kuralı ilk düzeltmede ayrışır.
--
-- entity_id metin: w.id::text karşılaştırılıyor. Ters yön (entity_id::uuid)
-- CRM kayıtlarında uuid olmayan bir değere denk gelirse hata fırlatır ve
-- PostgreSQL AND'lerin sırasını garanti etmiyor.
--
-- Adım olayları da entity_type = 'operation_workflow' ve entity_id = işin
-- kimliği ile yazılıyor; adımın kendisi metadata'da. Böylece tek sorgu
-- işin bütün geçmişini veriyor ve ikinci bir politikaya gerek kalmıyor.
--
-- Tekrar çalıştırılabilir.

drop policy if exists activity_logs_select_operations on public.activity_logs;
create policy activity_logs_select_operations on public.activity_logs
  for select
  to authenticated
  using (
    entity_type = 'operation_workflow'
    and exists (
      select 1
        from public.operation_workflows w
       where w.organization_id = activity_logs.organization_id
         and w.id::text = activity_logs.entity_id
    )
  );
