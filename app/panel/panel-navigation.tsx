"use client";

import Image from "next/image";

/*
  Kurumun sahip olduğu DİĞER Arvo ürünleri. Panelde bunların hiçbir izi
  yoktu: ArvoLab'ı da alan bir kurum, ürüne nasıl gideceğini bilmiyordu —
  adresi bilen elle yazıyor, bilmeyen "bize ArvoLab verilmemiş" sanıyordu.

  ArvoLab'a geçiş kendi yolundan gidiyor (/panel/uygulama/arvolab): orada
  tek kullanımlık bir oturum bağlantısı üretilip yönlendiriliyor, kişi
  ikinci kez giriş yapmıyor. ArvoARC ve Randevu şimdilik düz bağlantı — onlar
  için böyle bir köprü henüz yok ve olmayan bir kolaylığı varmış gibi
  göstermek, kullanıcıyı şaşırtan bir giriş ekranına çıkarır.

  AÇILIR PENCERE. Uygulamalar menüde düz bir bağlantı listesiydi; şimdi
  "UYGULAMALAR" düğmesi ekranın ORTASINDA bir pencere açıyor ve ürünler
  orada ikon + ad ızgarasında duruyor.

  İki ara sürüm denendi ve bırakıldı:
   - Tam sayfa "Uygulamalar" ekranı: ürünler arası geçiş bir varış noktası
     değil, bir açma hareketi; araya sayfa koymak her geçişe fazladan bir
     tıklama ekliyordu.
   - Menünün yanında hover ile açılan mini ızgara: dar şeridin yanında
     açıldığı için panelin içeriğiyle üst üste biniyor ve arkasındaki
     kartlar okunuyordu; dokunmatikte de hiç açılmıyordu.

  YALNIZCA GİDİLEBİLEN ürünler görünüyor (lisansı açık olanlar). Kapalı
  ürünleri de listeleyen sürüm denendi ve bırakıldı: basılınca hiçbir şey
  açmayan satırlar duruyordu.
*/
export type DigerUygulama = {
  kod: string;
  ad: string;
  href: string;
  ayniSekme: boolean;
  /*
    public/brand/ altındaki marka dosyasının adı. Logosu olan ürün gerçek
    logosuyla, olmayan (Randevu, Kurucu Konsolu) baş harfiyle görünüyor —
    olmayan bir logoyu harfle taklit etmek yerine ayrımı açıkça bırakmak.
  */
  marka?: MarkaKodu;
};

/*
  Logo dosyalarının kendi en-boy oranı ve uzantısı; kırpılmadan sığdırmak
  için. Ürünlerin kelime logosu PNG (tasarımdan geldiği gibi), kurucu
  merkezinin işareti SVG — o bir ürün değil, platformun kendisi ve
  kardeşleri gibi bir kelime logosu yok.
*/
export const MARKA_OLCU = {
  arvoos: { w: 1901, h: 395, uzanti: "png" },
  arvolab: { w: 1920, h: 468, uzanti: "png" },
  arc: { w: 1909, h: 373, uzanti: "png" },
  yonetim: { w: 64, h: 64, uzanti: "svg" },
} as const;
export type MarkaKodu = keyof typeof MARKA_OLCU;

/*
  Logo iki kez çiziliyor, biri CSS ile gizli: markaların koyu zemin için
  ayrı dosyası var (-on-dark) ve panel teması html[data-theme] ile
  değişiyor. Tek dosyayı süzgeçle koyulaştırmak marka kılavuzuna aykırı;
  JavaScript ile seçmek ise tema değişiminde bir kare yanlış logo demek.
*/
export function MarkaLogosu({ marka, ad }: { marka: MarkaKodu; ad: string }) {
  const { w, h, uzanti } = MARKA_OLCU[marka];
  return (
    <>
      <Image className="marka-acik" src={`/brand/${marka}.${uzanti}`} alt={ad} width={w} height={h} />
      <Image className="marka-koyu" src={`/brand/${marka}-on-dark.${uzanti}`} alt={ad} width={w} height={h} />
    </>
  );
}

/*
  Ortak posta kutusu menünün kendi girdisi — "UYGULAMALAR" penceresinde
  değil (gerekçe app/panel/layout.tsx'te). Okunmamış sayısı rozette, ve
  rozet menü daraltıldığında da duruyor: hiçbir şey açmadan görünmek
  rozetin tek işi.
*/
export type PostaGirdisi = { okunmamis: number };
