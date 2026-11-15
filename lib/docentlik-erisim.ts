/*
  DOÇENTLİK: KİMİN NEYİ GÖRECEĞİ (F6 PR4). Saf modül: Next, React ya da
  Supabase yok; testi tests/unit/docentlik-erisim.test.ts.

  Bölümlerin görünürlüğü yalnızca yetki anahtarlarından çıkıyor ve
  veritabanının kuralıyla (20261114200939) birebir aynı:
    Faaliyetlerim        kurumun her üyesi (kendi verisi)
    Kurumun faaliyetleri docentlik.tumunu_gor
    Kriter ve hedefler   docentlik.kriter_yonet
    ÜAK tabloları        docentlik.uak_yonet
  Kurum Sahibi istisnası `izin`in içinde (lib/yetkiler → etkinYetkiler);
  modül kurumda kapalıysa üç anahtar da yok (kurumaOzelYetkileriSuz) ve
  sayfa zaten kapıda düşüyor. Burada ayrıca rol listesi yok, bilerek.
*/

export type DocentlikBolumu = { key: string; label: string; aciklama: string };

export function docentlikBolumleri(izin: (key: string) => boolean): DocentlikBolumu[] {
  const bolumler: DocentlikBolumu[] = [
    { key: "faaliyetlerim", label: "Faaliyetlerim", aciklama: "Kendi faaliyetleriniz, belgeleriniz ve puanınız" },
  ];
  if (izin("docentlik.tumunu_gor")) {
    bolumler.push({ key: "kurum", label: "Kurumun faaliyetleri", aciklama: "Bütün akademisyenlerin faaliyetleri ve eksik puanları (doktora tarihleri görünmez)" });
  }
  if (izin("docentlik.kriter_yonet")) {
    bolumler.push({ key: "kriterler", label: "Kriter ve hedefler", aciklama: "Puanlama kriterleri, asgari ve azami puanlar" });
  }
  if (izin("docentlik.uak_yonet")) {
    bolumler.push({ key: "uak", label: "ÜAK tabloları", aciklama: "ÜAK tablosu PDF'leri" });
  }
  return bolumler;
}
