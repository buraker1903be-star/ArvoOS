/*
  FİYAT LİSTESİ KDV DAHİL YAYIMI (28.10.2026).

  Kod tarafı (lib/site/pricing.ts) KDV dahil rakamlara geçti, ama site
  ve kurulum fiyatı önce platform_fiyat_listesi'nden okuyor: konsoldan
  bir kez yayımlanmış satır, koddaki yeni rakamın ÜSTÜNE yazar. Yalnızca
  kodu değiştirmek, yayımlı satırı olan basamakta sitede eski (KDV
  hariç) fiyatı bırakırdı — hiçbir hata vermeden. Bu yüzden yeni liste
  burada YAYIMLANIYOR: satırı olan da olmayan da aynı rakama iner ve
  konsol ekranı koddakiyle aynı tabloyu gösterir.

  Rakamlar lib/site/pricing.ts ile BİREBİR aynı olmalı; ikisi ayrışırsa
  site veritabanındakini gösterir. Teklif usulü basamaklar (arvoos-ozel,
  randevu-zincir, arvolab-kurum, veri-aktarimi, ozel-gelistirme) bilerek
  listede yok: kodda null, yayımlı bir rakamları da yok.

  Bekleyen taslak varsa DÜŞÜYOR (taslak_bekliyor = false): KDV hariç
  rakamla hazırlanmış bir zam, bu yayımdan sonra "Yayımla"ya basılınca
  fiyatı sessizce geri indirirdi.

  arvolab-ekip satıştan kalktı (kurucu kararı): satırı varsa koda
  döndürülüyor. Kod artık bu basamağı tanımadığı için tutar zaten
  okunmuyor; satırı yayımlı bırakmak geçmiş ekranında "yayında" bir
  basamak gösterirdi.

  Yayım anı clock_timestamp(), now() DEĞİL (platform_fiyatlari_yayimla
  ile aynı): geçmiş tetikleyicisi yayımı yayimlandi_at DEĞİŞTİ diye
  tanıyor. Satır aynı işlemde yayımlanmışsa now() aynı anı verir ve
  yayım geçmişe "taslak iptali" diye düşer.

  Geçmiş (platform_fiyat_gecmisi) tetikleyiciyle yazılıyor; kim alanı
  boş kalıyor çünkü migration bir oturumla çalışmıyor.
*/
with yeni (kod, tur, kurus) as (
  values
    ('arvoos-baslangic', 'plan', 239000),
    ('arvoos-kurumsal', 'plan', 719000),
    ('arc-baslangic', 'plan', 159000),
    ('arc-buyume', 'plan', 359000),
    ('arc-olcek', 'plan', 479000),
    ('randevu-tek', 'plan', 89900),
    ('randevu-coklu', 'plan', 179000),
    ('arvolab-arastirmaci', 'plan', 499000),
    ('ek-kullanici', 'ek', 29900),
    ('ek-sube', 'ek', 41900)
),
-- Tek an: liste bütünüyle aynı anda yayına girer (toplu yayım gibi).
an as (select clock_timestamp() as t)
insert into public.platform_fiyat_listesi (kod, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at, updated_at)
select kod, tur, kurus, kurus, false, an.t, an.t from yeni cross join an
on conflict (kod) do update
set aylik_kurus = excluded.aylik_kurus,
    taslak_kurus = excluded.taslak_kurus,
    taslak_bekliyor = false,
    yayimlandi_at = excluded.yayimlandi_at,
    updated_by = null,
    updated_at = excluded.updated_at;

update public.platform_fiyat_listesi
set aylik_kurus = null,
    taslak_kurus = null,
    taslak_bekliyor = false,
    yayimlandi_at = null,
    updated_by = null,
    updated_at = now()
where kod = 'arvolab-ekip';
