-- ============================================================
-- WhatsApp: görsel ve dosya (medya)
--
-- Şimdiye kadar metin dışı her mesaj bir yer tutucuya indirgeniyordu:
-- müşteri dekont, kimlik fotoğrafı ya da imzalı belge gönderdiğinde
-- panelde yalnızca "[görsel]" yazıyordu. Meta'nın verdiği medya kimliği
-- hiç okunmadan düşüyordu, yani dosya sonradan da bulunamıyordu.
--
-- İki parça:
--   1) whatsapp_messages'a medya sütunları.
--   2) Özel depolama kovası "whatsapp-media".
--
-- NEDEN KOPYA SAKLIYORUZ: Meta medyayı yaklaşık 30 gün sonra siliyor ve
-- indirmek erişim anahtarı istiyor. Yalnızca medya kimliğini saklamak,
-- bir ay sonra açılmayan her dosyanın kaybolması demekti. Kopya bizde.
--
-- Kovaya kimse doğrudan yazmıyor: gelen dosyayı webhook (service_role)
-- indirip koyuyor, giden dosyayı sunucu işlemi. Bu yüzden storage.objects
-- üzerinde authenticated için politika YOK — panel dosyayı kendi
-- rotasından, kısa ömürlü imzalı bağlantıyla okuyor. Kovaya doğrudan
-- okuma açmak, yolu tahmin edebilen bir kurum üyesine başka kurumun
-- dosyasını açardı; yol kurum kimliğiyle başlasa bile bu kontrolü
-- storage politikasında tekrarlamak yerine tek kapıdan geçiriyoruz.
-- ============================================================

-- 1) Mesaj satırındaki medya bilgisi ------------------------------------------

alter table public.whatsapp_messages
  -- Mesajın türü: Meta'nın bildirdiği tür (text, image, document…).
  -- Eskiden hiç yazılmıyordu; gelen kutusu görseli metinden ayıramıyordu.
  add column if not exists message_type text not null default 'text',
  -- Meta'nın medya kimliği. İndirme başarısız olursa yeniden denemenin
  -- tek yolu bu; 30 günlük pencere içinde işe yarar.
  add column if not exists media_id text,
  add column if not exists media_mime text,
  add column if not exists media_filename text,
  add column if not exists media_size bigint,
  -- Kovadaki yol: <organization_id>/<mesaj kimliği>.<uzantı>
  add column if not exists media_path text,
  add column if not exists media_error text,
  /*
    İndirme durumu ayrı bir sütun, çünkü "medya var ama henüz inmedi" ile
    "medya yok" birbirine karışırsa ekran dosyası olmayan bir mesaj için
    indirme düğmesi gösterir. 'pending' yeniden denenebilir olanı işaret
    eder; 'failed' denendi ve olmadı demektir.
  */
  add column if not exists media_status text not null default 'none';

alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_media_status_check;
alter table public.whatsapp_messages
  add constraint whatsapp_messages_media_status_check
  check (media_status in ('none', 'pending', 'stored', 'failed'));

comment on column public.whatsapp_messages.media_status is
  'none: medya yok · pending: indirilmedi, yeniden denenebilir · stored: kovada · failed: indirilemedi';

-- İnmemiş medyayı toplu yeniden denemek için; çoğunluk 'none' olacağından
-- kısmi indeks.
create index if not exists whatsapp_messages_medya_bekleyen_idx
  on public.whatsapp_messages (organization_id, created_at)
  where media_status = 'pending';

-- 2) Depolama kovası ----------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  false,
  -- Meta'nın kendi sınırı belge için 100 MB, görsel için 5 MB. Kovayı
  -- 100 MB'ta tutuyoruz ki gelen belge reddedilmesin.
  104857600,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/3gpp',
    'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

/*
  storage.objects üzerinde authenticated politikası bilerek yok: kovaya
  yalnızca service_role yazıyor ve okuyor. Panel dosyayı kendi rotasından
  (app/panel/crm/whatsapp/dosya/[id]) alıyor; orada mesajın çağıranın
  kurumuna ait olduğu doğrulanıp 60 saniyelik imzalı bağlantı üretiliyor.
  Böylece yetki tek yerde duruyor ve yol tahmin ederek başka kurumun
  dosyasına ulaşmak mümkün olmuyor.
*/
drop policy if exists "whatsapp_media_select" on storage.objects;
drop policy if exists "whatsapp_media_insert" on storage.objects;

notify pgrst, 'reload schema';
