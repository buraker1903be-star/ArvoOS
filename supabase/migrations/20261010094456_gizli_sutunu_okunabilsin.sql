-- ============================================================
-- "gizli" SÜTUNU OKUNABİLİR OLMALI
--
-- 20261010014752 sütunu ekledi ama okuma yetkisi vermedi ve anahtar
-- canlıda "permission denied for table user_presence" ile düştü.
--
-- Sebep: user_presence'ta SELECT SÜTUN DÜZEYİNDE kısıtlı.
-- 20260912180000 sayfa ve cihaz bilgisini herkese kapatmak için
-- `revoke select` deyip yalnızca beş sütunu geri açmıştı; sonradan
-- eklenen her sütun varsayılan olarak KAPALI geliyor. Tabloya UPDATE
-- yetkisi var, o yüzden hata "update" değil "table" diyor: upsert
-- ON CONFLICT DO UPDATE excluded değerini okuyor ve okuma yetkisi
-- olmayan sütunda tablo düzeyinde reddediliyor.
--
-- Görünürlük tercihi zaten ekibe dönük bir bilgi: üst çubuk kimin
-- gizlendiğini bilmek zorunda, yoksa gizlenen kişi anlık güncellemede
-- yeniden çevrimiçi görünürdü. Sayfa ve cihaz bilgisinin aksine
-- gizlenecek bir yanı yok.
--
-- NOT: bu hata akış testlerinde görünmez. Şema dökümü tablo ve sütun
-- yetkilerini taşımıyor, test düzeneği de Supabase varsayılanını
-- taklit edip her tabloya tam yetki veriyor — sütun düzeyinde yetki
-- yalnızca canlıda var.
-- ============================================================

grant select (gizli) on public.user_presence to authenticated;

notify pgrst, 'reload schema';
