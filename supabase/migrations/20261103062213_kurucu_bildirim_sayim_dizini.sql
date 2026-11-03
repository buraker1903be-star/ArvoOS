/*
  KURUCU BİLDİRİM SAYIMI İÇİN DİZİN (03.11.2026, hızlandırma).

  Konsolun her sayfasını saran kabuk (arvo_panel_kabugu, p_kurucu) zildeki
  sayıyı şöyle hesaplıyor:
    count(*) from notifications where read_at is null and audience = 'founder'
  Ölçümde (lib/sure-olcumu) kabuk çağrısı konsolda ~470 ms, kurum panelinde
  ~210 ms sürüyordu.

  Uygun görünen dizin notifications_unread_idx (read_at IS NULL) ama
  KURUMA yazılan toplu bildirimlerde read_at HİÇ DOLMUYOR (okundu bilgisi
  kişi başına notification_user_reads'te). Yani o dizin bütün kurumların
  bütün toplu bildirimlerini taşıyor; kurucunun sayımı her açılışta bu
  satırları geziyor ve her biri için RLS'in kurum üyeliği EXISTS'ini
  çalıştırıyordu. Kurucu bildirimleri bunların küçük bir kısmı.

  Kısmi dizin yalnızca kurucuya giden OKUNMAMIŞ satırları tutuyor: sayım
  doğrudan ona oturuyor, kurum satırlarına hiç dokunmuyor. Okunan satır
  dizinden kendiliğinden düşüyor, yani dizin hep küçük kalıyor.
*/
create index if not exists notifications_kurucu_okunmamis_idx
  on public.notifications (created_at desc)
  where audience = 'founder' and read_at is null;
