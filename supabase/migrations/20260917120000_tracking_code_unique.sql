-- Takip kodu benzersizliği veritabanı garantisine bağlanıyor.
--
-- SORUN
-- Kod üreticisi (private.arvo_generate_tracking_code) çakışmayı yalnızca
-- "exists (select 1 ... where upper(tracking_code) = v_code)" ile kontrol
-- ediyor. Bu bir yarış: iki sözleşme aynı anda oluşturulursa ikisi de
-- "boşta" görüp aynı kodu alabilir. Tabloda benzersizlik kısıtı yok.
--
-- NEDEN ÖNEMLİ
-- Takip kodu kiracıya bağlı değil, platform genelinde tek havuz. Koda göre
-- çözen fonksiyonlar kurum filtresi kullanmıyor:
--   list_customer_portal_files(p_tracking_code)  → yalnızca koda bakıyor
--   arvo_tracking_document_links(p_tracking_code) → "where upper(tracking_code) = v_code limit 1"
-- Oysa /durum/<kurum-slug> sayfası kuruma göre çalışıyor. Kod çakışırsa o
-- sayfa bir kurumun sözleşmesini gösterirken BAŞKA kurumun dosyalarını
-- listeleyebilir. "limit 1" hangisinin geleceğini de belirsiz bırakıyor.
--
-- Çakışma olasılığı düşük (32^6 ≈ 1,07 milyar), ama düşük olasılık garanti
-- değil ve sonucu kiracı izolasyonunun kırılması.
--
-- DİKKAT: Canlıda zaten çakışan kod varsa bu migration HATA VERİR. Bu
-- istenen davranış — sessizce geçmektense sorunu göstermesi gerekir.
-- Önce aşağıdaki sorguyla bakın; boş dönmeli:
--
--   select upper(tracking_code) as kod, count(*) as adet,
--          string_agg(contract_no, ', ') as sozlesmeler
--   from public.crm_contracts
--   where tracking_code is not null and trim(tracking_code) <> ''
--   group by 1 having count(*) > 1;
--
-- Kısmi indeks: kodu olmayan sözleşmeler kısıtlanmaz (NULL'lar zaten
-- benzersizlik kısıtına takılmaz, ama boş metin takılırdı).

create unique index if not exists crm_contracts_tracking_code_unique_idx
  on public.crm_contracts (upper(tracking_code))
  where tracking_code is not null and trim(tracking_code) <> '';

comment on index public.crm_contracts_tracking_code_unique_idx is
  'Takip kodu platform genelinde benzersiz. Koda göre çözen fonksiyonlar kurum filtresi kullanmıyor; çakışma kiracı izolasyonunu kırar.';
