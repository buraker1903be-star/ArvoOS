/*
  Liste sayfalarının (talepler, teklifler, sözleşmeler) sağındaki
  istatistik kartı için saf hesaplar. Saat okuyan işlevler bugünü
  parametre olarak alır: bileşen gövdesinde saat okunmaz ve test
  edilebilir kalır. Birim testi liste-istatistik.test.ts.
*/

const GUN = 86_400_000;

/** Kayıt `simdi`den kaç tam gün önce (gelecekteyse 0). */
export function gunOnce(deger: string, simdi: number): number {
  return Math.max(0, Math.floor((simdi - Date.parse(deger)) / GUN));
}

/** Kayıt [enAz, enCok) gün önce mi. */
export function gunAraliginda(deger: string, enAz: number, enCok: number, simdi: number): boolean {
  const gun = gunOnce(deger, simdi);
  return gun >= enAz && gun < enCok;
}

/** Son 30 gün ve önceki 30 güne göre değişim yüzdesi (önceki 0 ise null). */
export function son30Degisim(tarihler: string[], simdi: number): { son30: number; degisim: number | null } {
  const son30 = tarihler.filter((t) => gunAraliginda(t, 0, 30, simdi)).length;
  const onceki = tarihler.filter((t) => gunAraliginda(t, 30, 60, simdi)).length;
  return { son30, degisim: onceki ? Math.round(((son30 - onceki) / onceki) * 100) : null };
}

/** Oran yüzdesi; payda 0 ise null. */
export function oran(pay: number, payda: number): number | null {
  return payda ? Math.round((pay / payda) * 100) : null;
}

/** En sık geçen değerler ve sayıları, çoktan aza; eşitlikte ilk görülen önde. */
export function enCok(degerler: string[], adet: number): [string, number][] {
  const sayac = new Map<string, number>();
  for (const deger of degerler) sayac.set(deger, (sayac.get(deger) ?? 0) + 1);
  return [...sayac.entries()].sort((x, y) => y[1] - x[1]).slice(0, adet);
}

const AY_ADLARI = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const ayAnahtari = (an: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit" }).format(an).slice(0, 7);

/** Son `ay` ayın boş dilimleri, eskiden yeniye; ay sınırı Türkiye saatiyle. */
function dilimleriKur(ay: number, simdi: number) {
  const [yil, aySira] = ayAnahtari(simdi).split("-").map(Number);
  return Array.from({ length: ay }, (_, i) => {
    const d = new Date(Date.UTC(yil, aySira - 1 - (ay - 1 - i), 1));
    return { anahtar: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, ad: AY_ADLARI[d.getUTCMonth()], adet: 0, toplam: 0 };
  });
}

/**
 * Son `ay` ayın (bu ay dahil, Türkiye saatiyle) her biri için kayıt
 * sayısı ve toplam; eskiden yeniye. Ay sınırı Türkiye saatiyle: UTC'de
 * ayın son gecesi 21:00 sonrası açılan kayıt bir sonraki aya düşer.
 */
export function aylik(kayitlar: { tarih: string | null; tutar?: number }[], ay: number, simdi: number): { ad: string; adet: number; toplam: number }[] {
  const dilimler = dilimleriKur(ay, simdi);
  const bul = new Map(dilimler.map((d) => [d.anahtar, d]));
  for (const kayit of kayitlar) {
    if (!kayit.tarih) continue;
    const dilim = bul.get(ayAnahtari(Date.parse(kayit.tarih)));
    if (!dilim) continue;
    dilim.adet += 1;
    dilim.toplam += kayit.tutar ?? 0;
  }
  return dilimler.map(({ ad, adet, toplam }) => ({ ad, adet, toplam }));
}

/**
 * Ortanca (medyan). Teklif tutarında ortalama yerine: tek bir hatalı
 * kayıt (canlıda ₺5,4 milyonluk bir teklif) ortalamayı ₺36 binden
 * ₺121 bine çekiyordu. Boş dizide 0.
 */
export function ortanca(degerler: number[]): number {
  if (!degerler.length) return 0;
  const sirali = [...degerler].sort((a, b) => a - b);
  const orta = Math.floor(sirali.length / 2);
  return sirali.length % 2 ? sirali[orta] : Math.round((sirali[orta - 1] + sirali[orta]) / 2);
}

/*
  Veritabanından gelen AY DİLİMLERİ ekrana. Sayım artık orada yapılıyor
  (crm_teklif_istatistikleri) ve yalnızca kayıt OLAN aylar dönüyor;
  grafikte boş ay da görünmeli, yoksa "Eylül'de hiç teklif yok" bilgisi
  kayboluyor ve sütunlar yanıltıcı biçimde bitişik duruyor.

  Ay anahtarı veritabanında da Türkiye saatiyle üretiliyor; iki taraf
  aynı sınırı kullanmazsa ayın ilk ve son günü yanlış dilime düşer.
*/
export function aylikDilimler(
  ozet: readonly { ay: string; adet: number; toplam: number }[],
  ay: number,
  simdi: number,
): { ad: string; adet: number; toplam: number }[] {
  const dilimler = dilimleriKur(ay, simdi);
  const bul = new Map(dilimler.map((d) => [d.anahtar, d]));
  for (const satir of ozet) {
    const dilim = bul.get(satir.ay);
    if (!dilim) continue;
    dilim.adet += Number(satir.adet) || 0;
    dilim.toplam += Number(satir.toplam) || 0;
  }
  return dilimler.map(({ ad, adet, toplam }) => ({ ad, adet, toplam }));
}
