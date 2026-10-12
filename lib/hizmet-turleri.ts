/*
  KURUMUN HİZMET TÜRLERİ (12.10.2026).

  Talep formundaki "Hizmet türü" listesi kodda sabitti ve akademik
  hizmetlerden oluşuyordu (tez, çeviri, analiz…); başka işi yapan kurum
  kendi hizmetlerini yazamıyor, her talepte "Diğer"i seçip elle
  yazıyordu. Artık kurum listeyi Ayarlar → Hizmet türleri'nde yönetiyor.

  Saklama: kurum başına tek satır, sıralı ad listesi
  (organization_service_types.turler). Satır YOKSA eski sabit liste
  geçerli — hiçbir kurumun formu kendiliğinden değişmiyor. Kurum listeyi
  ilk kez değiştirdiğinde varsayılan liste kopyalanıp değişiklik onun
  üstüne uygulanıyor.

  Talep kaydı hizmetin ADINI tutuyor (request_details.service_type),
  kimliğini değil. Bu yüzden listeden silmek ya da adı değiştirmek
  geçmiş kayıtları değiştirmez; eski kayıt yazıldığı adla kalır.

  "Diğer" listede saklanmaz, formda her zaman en sonda: listede olmayan
  bir hizmet için serbest yazma yolu kapanmasın.

  Bu modül saf: Next/Supabase'e dokunmaz, birim testi
  tests/unit/hizmet-turleri.test.ts.
*/

export const VARSAYILAN_HIZMET_TURLERI: readonly string[] = [
  "Tez Danışmanlığı",
  "Akademik Çeviri",
  "Literatür Danışmanlığı",
  "Veri Analizi",
  "Makale Danışmanlığı",
  "Biçimsel Düzenleme",
  "Araştırma Tasarımı",
  "Doçentlik Başvuru Danışmanlığı",
];

export const DIGER = "Diğer";
/** Veritabanındaki denetimle aynı (20261012110702). */
export const HIZMET_TURU_SINIRI = 60;
export const HIZMET_ADI_SINIRI = 120;

export type Sonuc = string[] | { hata: string };

const anahtar = (ad: string) => ad.toLocaleLowerCase("tr-TR");
const temizle = (ad: string) => ad.replace(/\s+/g, " ").trim();

/** Kayıttan gelen listeyi okur; satır yoksa (null) varsayılan liste. Bozuk öğeler atılır. */
export function hizmetTurleriCoz(turler: unknown): string[] {
  if (turler === null || turler === undefined) return [...VARSAYILAN_HIZMET_TURLERI];
  if (!Array.isArray(turler)) return [...VARSAYILAN_HIZMET_TURLERI];
  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const oge of turler) {
    if (typeof oge !== "string") continue;
    const ad = temizle(oge);
    if (!ad || gorulen.has(anahtar(ad)) || anahtar(ad) === anahtar(DIGER)) continue;
    gorulen.add(anahtar(ad));
    sonuc.push(ad);
  }
  return sonuc;
}

/** Talep formunun seçenekleri: kurumun listesi ve en sonda "Diğer". */
export function formSecenekleri(liste: readonly string[]): string[] {
  return [...liste, DIGER];
}

/** Adı denetler; `haric` yeniden adlandırılan öğenin sırası (kendisiyle çakışmasın). */
export function adDenetle(ham: string, liste: readonly string[], haric?: number): { ad: string } | { hata: string } {
  const ad = temizle(ham);
  if (ad.length < 2) return { hata: "Hizmet adı en az 2 karakter olmalı." };
  if (ad.length > HIZMET_ADI_SINIRI) return { hata: `Hizmet adı en fazla ${HIZMET_ADI_SINIRI} karakter olabilir.` };
  if (anahtar(ad) === anahtar(DIGER)) return { hata: "“Diğer” formda her zaman en sonda yer alıyor; listeye eklenmez." };
  const cakisan = liste.findIndex((mevcut, i) => i !== haric && anahtar(mevcut) === anahtar(ad));
  if (cakisan >= 0) return { hata: `“${liste[cakisan]}” listede zaten var.` };
  return { ad };
}

/*
  Öğe hem SIRASIYLA hem ADIYLA gösteriliyor: iki sekmede açık sayfadan
  biri listeyi değiştirdiyse sıra artık başka bir öğeyi gösterebilir.
  Ad tutmuyorsa işlem reddedilir; yanlış öğeyi silmek ya da yeniden
  adlandırmaktansa "sayfayı yenileyin" demek doğru.
*/
function ogeyiBul(liste: readonly string[], sira: number, ad: string): { hata: string } | null {
  if (!Number.isInteger(sira) || sira < 0 || sira >= liste.length || liste[sira] !== ad)
    return { hata: "Liste bu sayfa açıldıktan sonra değişmiş. Sayfayı yenileyip tekrar deneyin." };
  return null;
}

export function turEkle(liste: readonly string[], ham: string): Sonuc {
  if (liste.length >= HIZMET_TURU_SINIRI) return { hata: `En fazla ${HIZMET_TURU_SINIRI} hizmet türü eklenebilir.` };
  const denetim = adDenetle(ham, liste);
  if ("hata" in denetim) return denetim;
  return [...liste, denetim.ad];
}

export function turuAdlandir(liste: readonly string[], sira: number, eskiAd: string, ham: string): Sonuc {
  const yok = ogeyiBul(liste, sira, eskiAd);
  if (yok) return yok;
  const denetim = adDenetle(ham, liste, sira);
  if ("hata" in denetim) return denetim;
  return liste.map((ad, i) => (i === sira ? denetim.ad : ad));
}

export function turuSil(liste: readonly string[], sira: number, ad: string): Sonuc {
  const yok = ogeyiBul(liste, sira, ad);
  if (yok) return yok;
  return liste.filter((_, i) => i !== sira);
}

export function turuTasi(liste: readonly string[], sira: number, ad: string, yon: "yukari" | "asagi"): Sonuc {
  const yok = ogeyiBul(liste, sira, ad);
  if (yok) return yok;
  const hedef = yon === "yukari" ? sira - 1 : sira + 1;
  if (hedef < 0 || hedef >= liste.length) return [...liste];
  const yeni = [...liste];
  [yeni[sira], yeni[hedef]] = [yeni[hedef], yeni[sira]];
  return yeni;
}

/** Liste varsayılanla birebir aynı mı (sıra dahil)? Ekranda "Arvo listesi" rozeti için. */
export function varsayilanMi(liste: readonly string[]): boolean {
  return liste.length === VARSAYILAN_HIZMET_TURLERI.length && liste.every((ad, i) => ad === VARSAYILAN_HIZMET_TURLERI[i]);
}
