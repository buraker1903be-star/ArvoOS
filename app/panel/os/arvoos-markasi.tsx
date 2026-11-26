/*
  RESMÎ ArvoOS MARKASI: KELİME LOGOSU VE İŞARET (26.11.2026).

  İki biçim ayrı: konsolun açık sol menüsü (240 px) kelime logosunu,
  dar menü, tablet rayı ve telefonun üst çubuğu işareti kullanıyor.

  Eskiden menüde public/brand/yonetim.svg duruyordu — o, logodaki "OO"
  motifinin İKİ ÇEMBERLE ÇİZİLMİŞ yaklaşığıydı, resmî dosya değil.
  Resmî işaret kurum sahibinden geldi: public/brand/arvoos-simge.png,
  mürekkep kutusu 1405×704, yani 2 : 1. Repodaki favicon.svg ve PWA
  ikonları aynı motifin 1,54 : 1 oranındaki BAŞKA bir çizimi; menüde
  resmî olan kullanılıyor, o dosyalara bu turda dokunulmadı.

  İşaretin koyu zemin varyantı dosya olarak gelmedi, kelime logosundaki
  ayrımla türetildi (lacivert yarı beyaz, yeşil yarı aynı). Resmî bir
  on-dark işaret gelirse türetme kaldırılmalı.

  Kelime logosu için kaynak public/brand/arvoos{,-on-dark}.png; görünen
  ölçülere Lanczos ile indirilmiş kopyalar scripts/logo-goruntu-boyutlari.py
  ile üretiliyor (tarayıcının 1859 px'i 150 px'e indirmesi kenarları
  tırtıklı gösteriyordu — giriş ekranında ölçüldü). Dosyalar mürekkep
  kutusuna kırpılı: CSS'teki genişlik = görünen logo genişliği.

  İki tema varyantı da ÇİZİLİR, birini CSS gizler (.marka-acik /
  .marka-koyu): JavaScript ile seçmek tema değişiminde bir kare yanlış
  logo demek (panel-navigation.tsx'teki aynı gerekçe).
*/

/** Resmî kelime logosu; görünen genişlik CSS'te (sol menüde 150 px). */
export function ArvoOsLogosu() {
  return (
    <>
      <img
        className="marka-acik"
        src="/brand/arvoos-320.png"
        srcSet="/brand/arvoos-160.png 160w, /brand/arvoos-320.png 320w, /brand/arvoos-480.png 480w"
        sizes="150px"
        alt=""
        width={320}
        height={61}
      />
      <img
        className="marka-koyu"
        src="/brand/arvoos-on-dark-320.png"
        srcSet="/brand/arvoos-on-dark-160.png 160w, /brand/arvoos-on-dark-320.png 320w, /brand/arvoos-on-dark-480.png 480w"
        sizes="150px"
        alt=""
        width={320}
        height={61}
      />
    </>
  );
}

/** Resmî işaret; görünen genişlik CSS'te (menü rayında 34 px). */
export function ArvoOsIsareti() {
  return (
    <>
      <img
        className="marka-acik"
        src="/brand/arvoos-simge-68.png"
        srcSet="/brand/arvoos-simge-34.png 34w, /brand/arvoos-simge-68.png 68w, /brand/arvoos-simge-102.png 102w"
        sizes="34px"
        alt=""
        width={68}
        height={34}
      />
      <img
        className="marka-koyu"
        src="/brand/arvoos-simge-on-dark-68.png"
        srcSet="/brand/arvoos-simge-on-dark-34.png 34w, /brand/arvoos-simge-on-dark-68.png 68w, /brand/arvoos-simge-on-dark-102.png 102w"
        sizes="34px"
        alt=""
        width={68}
        height={34}
      />
    </>
  );
}
