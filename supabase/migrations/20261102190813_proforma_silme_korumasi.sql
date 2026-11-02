/*
  PROFORMA SİLME KORUMASI (02.11.2026, kurum sahibinin isteği: "hatalı
  proformayı silebilme yetkisi istiyorum").

  Konsol artık hatalı proformayı siliyor (app/panel/platform/tahsilat/
  actions.ts proformaSil). Silme servis rolüyle yapılıyor ve servis rolü
  RLS'i atlıyor; bu yüzden asıl kural burada, tetikleyicide — tetikleyici
  servis rolünü de durduruyor.

  Silinemeyenler:
   - ÖDENMİŞ ya da bir ödemeyle EŞLENMİŞ proforma: ödeme makbuzu ve
     fatura ona bağlı, müşteri "ödendi" olarak görüyor. Kaydı silmek
     tahsilatın belgesini yok etmek olurdu.
   - OTOMATİK proforma: günlük iş (dönem sonu yineleme anahtarıyla) silinen
     proformayı ertesi sabah aynen yeniden keserdi; iptal edilen satır ise
     dizinde kaldığı için yeniden kesilmiyor. Otomatik olan iptal edilir.

  Proforma numarası boşluk bırakır (PRF-…-0007 silinince 0008 gelir):
  proforma bir teklif belgesi, resmî fatura değil; sıralı fatura
  numarası kuralı ona uygulanmıyor.
*/
create or replace function private.platform_proforma_silme_korumasi()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if old.durum = 'odendi' or old.payment_request_id is not null or old.subscriber_payment_id is not null then
    raise exception 'Ödenmiş ya da ödemeyle eşlenmiş proforma silinemez (%).', old.proforma_no
      using errcode = 'P0001';
  end if;
  if old.otomatik then
    raise exception 'Otomatik düzenlenen proforma silinemez, iptal edilir (%): silinirse günlük iş aynısını yeniden keser.', old.proforma_no
      using errcode = 'P0001';
  end if;
  return old;
end;
$function$;
revoke all on function private.platform_proforma_silme_korumasi() from public, anon, authenticated;

drop trigger if exists platform_proforma_silme_korumasi on public.platform_proformalari;
create trigger platform_proforma_silme_korumasi
  before delete on public.platform_proformalari
  for each row execute function private.platform_proforma_silme_korumasi();
