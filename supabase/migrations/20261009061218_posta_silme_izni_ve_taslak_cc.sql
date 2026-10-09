-- ============================================================
-- POSTA: YAZIŞMA SİLME İZNİ GERİ ALINIYOR, TASLAĞA CC
--
-- 1) SİLME. 20261008180253 authenticated'a mail_threads üzerinde DELETE
--    verdi ve politikası yalnızca "posta modülü açık mı" diye bakıyordu.
--    Panelden silmek ise ayrı bir yetenek istiyor (posta.sil, varsayılanı
--    yönetim). Oturum jetonu tarayıcıda olduğu için yalnızca okuma yetkisi
--    olan bir personel REST ucundan yazışma satırlarını doğrudan
--    silebiliyordu; mesaj satırları da sahipsiz kalıyordu.
--
--    Bu izne zaten gerek yok: silme sunucu işleminde service_role ile
--    yapılıyor (postaKonusmasiniCopeAt), yetki orada posta.sil ile ve
--    konuşmanın kuruma aidiyeti kullanıcının kendi oturumuyla
--    doğrulanıyor. O migration'ın yorumu tersini söylüyordu.
--
-- 2) TASLAKTA CC. Taslak kaydedilince formdaki Cc sessizce kayboluyordu;
--    tabloda yeri yoktu.
-- ============================================================

drop policy if exists "posta modulu acik olanlar konusmayi siler" on public.mail_threads;
revoke delete on public.mail_threads from authenticated, anon;

alter table public.mail_drafts
  add column if not exists cc text;

alter table public.mail_drafts
  drop constraint if exists mail_drafts_cc_uzunluk;
alter table public.mail_drafts
  add constraint mail_drafts_cc_uzunluk check (cc is null or char_length(cc) <= 2000);

comment on column public.mail_drafts.cc is
  'Taslağın Bilgi (Cc) alanı, kullanıcının yazdığı gibi. Gönderimde doğrulanır.';

notify pgrst, 'reload schema';
