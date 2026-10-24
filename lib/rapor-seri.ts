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
