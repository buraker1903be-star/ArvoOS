-- ============================================================
-- WhatsApp medya kovası: tür listesini genişlet
--
-- Bir önceki migration'daki liste yalnızca beklediğimiz türleri sayıyordu.
-- Sorun şu: Meta'nın bildirdiği MIME her zaman o listede olmuyor —
-- iPhone'dan gelen HEIC, sesli mesajın opus'u, WhatsApp'ın kendi ürettiği
-- QuickTime video, ve tür hiç bildirilmediğinde düştüğümüz
-- application/octet-stream. Kova listede olmayan türü REDDEDİYOR, yani
-- dosya sessizce "indirilemedi"ye düşüyordu.
--
-- Yanlış tarafa düşmenin bedeli asimetrik: fazladan bir tür kabul etmek
-- kovada bir dosya demek; eksik tür, müşterinin gönderdiği belgenin
-- kaybolması demek. Liste bu yüzden cömert.
--
-- Kovaya kimsenin doğrudan yazamadığını hatırlatmakta fayda var: yükleme
-- yalnızca service_role ile, webhook ve sunucu işleminden yapılıyor
-- (storage.objects üzerinde authenticated politikası yok). Yani bu liste
-- kullanıcıdan gelen bir yükleme yüzeyini genişletmiyor.
-- ============================================================

update storage.buckets
set allowed_mime_types = array[
  -- Görsel: HEIC/HEIF iPhone'dan, TIFF tarayıcıdan gelebiliyor.
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif', 'image/bmp', 'image/tiff',
  -- Video: WhatsApp çoğunlukla mp4 veriyor, iOS bazen QuickTime.
  'video/mp4', 'video/3gpp', 'video/quicktime', 'video/webm',
  -- Ses: sesli mesaj genelde ogg/opus.
  'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg',
  'audio/opus', 'audio/wav', 'audio/webm',
  -- Belge.
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf', 'application/zip', 'application/x-zip-compressed',
  'text/plain', 'text/csv',
  -- Tür bildirilmediğinde düştüğümüz yer; olmazsa o dosya hiç saklanamıyor.
  'application/octet-stream'
]
where id = 'whatsapp-media';

notify pgrst, 'reload schema';
