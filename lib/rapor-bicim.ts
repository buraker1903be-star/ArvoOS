/*
  RAPOR BİÇİMLEYİCİLERİ (24.10.2026).

  `money` ve `percent` sunum dosyasında (rapor-parcalari.tsx)
  duruyordu. Rapor MODELLERİ de onları kullanıyor (huni alt
  açıklamaları, grafik etiketleri) ve bir modelin JSX içeren bir
  dosyaya bağlanması, saf mantığı React'e bağlamak olurdu — birim
  testi kurulumu ağırlaşır, model başka bir bağlamda kullanılamaz.

  O yüzden ikisi burada; sunum dosyası buradan alıp yeniden
  dışa veriyor, yani çağıranların hiçbiri değişmedi.
*/
export const money = (kurus: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })
    .format(kurus / 100);

/** Negatif oran "−%184" (eskiden "%-184" yazılıyordu). */
export const percent = (deger: number) =>
  Math.round(deger) < 0 ? `−%${Math.abs(Math.round(deger))}` : `%${Math.round(deger)}`;
