/*
  PROFORMA ALICI BİLGİSİ VE ÜRÜN (28.10.2026).

  Proforma yalnızca tek satırlık musteri_adi taşıyordu; bireysel abonede
  bu çoğu zaman e-posta adresiydi ve belgede "Sayın ali@…" yazıyordu.
  Kurum sahibi belgede ad soyad, kurum unvanı, vergi dairesi/numarası ve
  adres istedi. Bilgi proformaya KOPYA olarak yazılıyor: kurum sonradan
  unvanını değiştirse de düzenlenmiş belge düzenlendiği gibi kalmalı.
  Eski satırlarda alici boş; belge o zaman musteri_adi ile çiziliyor.

  Ürün de artık sabit değil: proforma yalnızca ArvoLab için
  kesilebiliyordu (sütunun varsayılanı 'arvolab', formda seçim yoktu),
  yani bir ArvoOS ya da ArvoCal müşterisine lisans proforması kesmenin
  yolu yoktu. Değer kümesi kısıtla sabitleniyor: tanınmayan bir ürün
  kodu proformayı hiçbir panelde görünmeyen bir kayda çevirirdi.
*/
alter table public.platform_proformalari
  add column if not exists alici jsonb;

alter table public.platform_proformalari
  drop constraint if exists platform_proformalari_alici_check;
alter table public.platform_proformalari
  add constraint platform_proformalari_alici_check check (alici is null or jsonb_typeof(alici) = 'object');

alter table public.platform_proformalari
  drop constraint if exists platform_proformalari_product_check;
alter table public.platform_proformalari
  add constraint platform_proformalari_product_check check (product = any (array['arvoos', 'arvolab', 'randevu']));
