-- ============================================================
-- ÇEVRİMİÇİ GÖRÜNÜRLÜĞÜ ("ekibe çevrimdışı görün")
--
-- Üst çubukta kurumun o an çevrimiçi olan kişileri görünüyor
-- (user_presence). Kişinin bunu kapatma yolu yoktu: panel açıkken
-- herkes birbirini görüyordu ve "görünmeden çalışmak" için oturumu
-- kapatmak gerekiyordu.
--
-- İŞARET, SİLME DEĞİL: son görülme yine yazılıyor. Kaydı hiç yazmamak,
-- yöneticinin personel ekranındaki oturum geçmişini de boşaltırdı ve
-- orası bir yönetim kaydı — kişinin görünürlük tercihi onu
-- değiştirmemeli. Gizlilik tercihi yalnızca EKİBE dönük göstergeyi
-- kapatıyor; personel ekranı gerçek durumu göstermeye devam ediyor ve
-- panelde bunu söylüyor.
--
-- Tercih kişinin kendi satırında: oturumdan oturuma ve cihazdan cihaza
-- taşınsın. Eşitleme (recordPresence) bu sütuna dokunmuyor, upsert
-- yalnızca saydığı alanları yazıyor.
-- ============================================================

alter table public.user_presence
  add column if not exists gizli boolean not null default false;

comment on column public.user_presence.gizli is
  'Kişi ekibe çevrimdışı görünmeyi seçti. Üst çubuk ve mesajlaşma bunu çevrimdışı sayar; personel ekranı gerçek son görülmeyi gösterir.';

/*
  Yazma izni zaten var (presence_update_own): kişi kendi satırını
  güncelleyebiliyor. Yeni sütun için ayrı bir politika gerekmiyor —
  satır sahipliği kuralı aynı. Başkasının görünürlüğünü değiştirmek
  politika tarafından engelleniyor.
*/

notify pgrst, 'reload schema';
