/*
  GRAFİK SERİSİNİN NOKTASI — veri şekli, sunum değil (24.10.2026).

  Rapor modelleri aylık serileri kendileri üretiyor (kokpit altı aylık
  lead/satış/maliyet/tahsilat serilerini). Tip sunum dosyasında
  (rapor-parcalari.tsx) durduğu için model o dosyaya bağlanıyordu;
  saf mantığı JSX içeren bir modüle bağlamak, birim testini React'e
  bağlamak olurdu.

  ÇUBUĞUN ALTINDAKİ ETİKET AYRI BİR ALAN. `ad` hem ipucu/ekran
  okuyucu metni hem eksen etiketi olarak kullanılıyordu; ay
  kısaltmalarıyla sorun yoktu ama aynı grafik müşteri adı ve kayıp
  sebebiyle de kullanılınca etiketler üst üste bindi ve kutudaki
  rakamın üstüne taştı (canlıda CRM raporunda görüldü).
*/
export type SeriNoktasi = {
  /** Tam ad: ipucu ve ekran okuyucu. */
  ad: string;
  /** Çubuğun altındaki kısa etiket; verilmezse yazılmıyor. */
  eksen?: string;
  deger: number;
  /** Biçimlenmiş değer (ipucunda görünür). */
  etiket: string;
  simdiki?: boolean;
};

/*
  SERİNİN ÖZETİ — KPI penceresinin üst şeridi (25.10.2026).

  Toplam/ortalama/en yüksek pencerenin içinde hesaplanıyordu ve
  TOPLAM HAM YAZILIYORDU: altı aylık tahsilat ekranda **45288815**
  görünüyordu, ₺452.888 yerine. Nokta kendi `etiket`ini biçimli
  taşıdığı için satırlar doğruydu; yalnızca türetilen üç sayı
  biçimsizdi ve bu, bakanın gözüne "çok büyük bir rakam" diye
  çarpmıyor — kuruş da bir sayı.

  Hesap burada, çünkü biçimin hangi fonksiyondan geçeceği bir SUNUM
  kararı değil VERİ kararı: seri kuruş mu adet mi taşıyor sorusunun
  karşılığı. Sunum dosyasında kalsaydı birim testi JSX'e bağlanırdı.
*/
export type SeriBicimi = "para" | "sayi";

export type SeriOzeti = {
  toplam: number;
  /** Serideki NOKTA sayısına bölünür; boş aylar da bir dönem. */
  ortalama: number;
  enBuyuk: number;
  /** En yüksek noktanın adı; seri boşsa yok. */
  tepe?: string;
};

export function seriOzeti(seri: SeriNoktasi[]): SeriOzeti {
  if (seri.length === 0) return { toplam: 0, ortalama: 0, enBuyuk: 0 };
  const toplam = seri.reduce((t, n) => t + n.deger, 0);
  const enBuyuk = Math.max(...seri.map((n) => n.deger));
  return {
    toplam,
    /* Yuvarlama kuruşta yapılır: ortalamanın küsuratı para
       biçimleyicisine kesirli kuruş olarak gitmemeli. */
    ortalama: Math.round(toplam / seri.length),
    enBuyuk,
    tepe: seri.find((n) => n.deger === enBuyuk)?.ad,
  };
}
