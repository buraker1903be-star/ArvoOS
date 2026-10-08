-- ============================================================
-- POSTA: GELEN / GÖNDERİLEN AYRIMI VE SİLME
--
-- Liste şimdiye kadar tek yığındı: gelen de giden de aynı akışta
-- duruyordu. Ortak kutuda en sık sorulan iki soru ("bize ne geldi",
-- "biz ne gönderdik") ayrı ayrı sorulamıyordu.
--
-- NEDEN SÜTUN, NEDEN HESAPLANMIYOR:
--
-- Bilgi mesajlarda zaten var (mail_messages.yon) ama listeyi çizerken
-- her konuşma için mesajlara bakmak, yüz satırlık bir listede yüz alt
-- sorgu demek. PostgREST tarafında gömülü süzme de kurulamıyor: iki
-- tablo arasında yabancı anahtar yok (konuşmalar Gmail'in thread_id'siyle
-- eşleşiyor, kendi kimliğimizle değil). Eşitleme zaten her turda konuşma
-- satırını yeniden yazıyor; iki bayrağı orada doldurmak bedava.
--
-- Bir konuşma İKİSİNDE BİRDEN görünebilir ve bu doğru: müşteri yazmış,
-- biz cevaplamışsak o yazışma hem gelen hem gönderilen kutusuna aittir.
-- Gmail de böyle davranıyor.
--
-- SİLME: panelden silinen yazışma Gmail'in ÇÖP KUTUSUNA gidiyor ve
-- bizim tablolarımızdan kalkıyor. Kalıcı silme bilerek yok — yanlışlıkla
-- silinen bir müşteri yazışması Gmail'den geri alınabilmeli. Eşitleme
-- çöpe atılanı geri getirmiyor: Gmail'in liste ucu çöp ve spam'i
-- varsayılan olarak dışarıda bırakıyor.
-- ============================================================

alter table public.mail_threads
  add column if not exists gelen_var boolean not null default true,
  add column if not exists giden_var boolean not null default false;

comment on column public.mail_threads.gelen_var is
  'Konuşmada en az bir GELEN mesaj var. Eşitleme doldurur; liste süzgeci bunu okur.';
comment on column public.mail_threads.giden_var is
  'Konuşmada en az bir GİDEN mesaj var. Bir konuşma ikisinde birden görünebilir.';

/*
  Süzgeçli liste sorgusu kurum + kutu + tarih sırasına bakıyor.
  Kısmi indeksler: "gönderilenler" çoğu kurumda küçük bir alt küme.
*/
create index if not exists mail_threads_gelen_idx
  on public.mail_threads (organization_id, son_mesaj_at desc)
  where gelen_var;
create index if not exists mail_threads_giden_idx
  on public.mail_threads (organization_id, son_mesaj_at desc)
  where giden_var;

/*
  Mevcut satırlar bir kerelik dolduruluyor; yoksa eşitleme o konuşmaya
  yeniden dokunana kadar bayraklar varsayılanda kalır ve gönderilenler
  kutusu boş görünürdü.
*/
update public.mail_threads t set
  gelen_var = exists (
    select 1 from public.mail_messages m
    where m.organization_id = t.organization_id and m.thread_id = t.thread_id and m.yon = 'gelen'),
  giden_var = exists (
    select 1 from public.mail_messages m
    where m.organization_id = t.organization_id and m.thread_id = t.thread_id and m.yon = 'giden');

/*
  Silme personelin kendi oturumuyla yapılıyor (service_role değil): RLS
  konuşmanın kurumunu denetlesin diye. Okuma ve güncelleme politikaları
  zaten posta modülünü soruyor; silme için de aynı kapı.

  Mesaj satırları konuşmayla birlikte gidiyor ama aralarında yabancı
  anahtar yok (thread_id Gmail'in kimliği); temizliği sunucu işlemi
  yapıyor ve o da service_role ile. Burada yalnızca konuşma satırının
  silinmesine izin veriliyor.
*/
grant delete on public.mail_threads to authenticated;

drop policy if exists "posta modulu acik olanlar konusmayi siler" on public.mail_threads;
create policy "posta modulu acik olanlar konusmayi siler" on public.mail_threads
  as permissive for delete to authenticated
  using (private.arvo_modul_acik(organization_id, 'posta'));

notify pgrst, 'reload schema';
