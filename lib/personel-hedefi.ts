import { AYLAR, ayinSonGunu, type Donem } from "@/lib/rapor-donemi";
import { monthStartKey } from "@/lib/istanbul-date";

/*
  PERSONEL SATIŞ HEDEFİ — KARAR.

  Hedef AY BAŞINA konuyor (hr_personel_hedefleri), rapor ise serbest
  bir DÖNEM için çalışıyor. İkisini birleştirmenin tek dürüst yolu
  var: dönem tam aylara oturuyorsa o ayların hedefleri toplanır,
  oturmuyorsa hedef HİÇ gösterilmez.

  Yarım ayı orantılamak (15 günlük dönem → hedefin yarısı) ilk akla
  gelen ve en yanıltıcı yol: satış ayın içinde eşit dağılmıyor,
  "hedefin %48'i" cümlesi kimsenin koymadığı bir günlük hedefe
  dayanmış olurdu. Rapor bu durumda sayı yerine sebebini yazıyor —
  docs/RAPORLAMA-ASAMA-1.md'nin "uydurma hedef üretme" kuralı.

  SÜREN AY AYRI İŞARETLENİYOR. "Bu ay" dönemi ayın sonuna kadar
  uzanıyor ama bugün ayın 3'üyse gerçekleşme doğal olarak düşük:
  `surenAy` ile ekran "ay sürüyor" diyor. Bayrak olmadan yönetici
  her ayın başında bütün ekibi hedefin altında görürdü.

  Saf modül; testi tests/unit/personel-hedefi.test.ts.
*/

/** Veritabanı satırı; `donem` ayın ilk günü (2026-11-01). */
export type HedefKaydi = { employee_id: string; donem: string; tutar: number };

export type HedefKapsami = {
  /** Dönemin kapsadığı aylar, "YYYY-MM-01" biçiminde. */
  aylar: string[];
  /** Dönem bugünden sonra bitiyor: ölçülen ay henüz dolmadı. */
  surenAy: boolean;
};

const ayAnahtari = (gun: string) => gun.slice(0, 7);

/**
 * Dönemin kapsadığı aylar — dönem tam aylara oturmuyorsa `null`.
 *
 * "Tam ay" demek: başlangıç bir ayın ilk günü, bitiş bir ayın son
 * günü. Hazır aralıkların üçü (bu ay, geçen ay, bu yıl) buna uyuyor;
 * uymayan tek şey kullanıcının elle seçtiği özel aralık.
 */
export function donemAylari(donem: Donem, bugun: string): HedefKapsami | null {
  const [bYil, bAy, bGun] = donem.startKey.split("-").map(Number);
  if (bGun !== 1) return null;
  const [sYil, sAy] = donem.endKey.split("-").map(Number);
  if (donem.endKey !== ayinSonGunu(sYil, sAy)) return null;

  const aylar: string[] = [];
  let yil = bYil;
  let ay = bAy;
  while (yil < sYil || (yil === sYil && ay <= sAy)) {
    aylar.push(monthStartKey(yil, ay));
    ay += 1;
    if (ay > 12) { ay = 1; yil += 1; }
  }
  return { aylar, surenAy: bugun < donem.endKey };
}

/**
 * Kişi kırılımlı hedef toplamı. Anahtar `employee_id`, değer kuruş.
 * Dönemde hedefi olmayan kişi haritada HİÇ YOK — sıfır yazmak
 * "hedefi sıfır" demekti, oysa hedefi konmamış demek.
 */
export function hedefHaritasi(hedefler: readonly HedefKaydi[], kapsam: HedefKapsami): Map<string, number> {
  const kapsananAylar = new Set(kapsam.aylar.map(ayAnahtari));
  const harita = new Map<string, number>();
  for (const h of hedefler) {
    if (!kapsananAylar.has(ayAnahtari(h.donem))) continue;
    harita.set(h.employee_id, (harita.get(h.employee_id) ?? 0) + h.tutar);
  }
  return harita;
}

/**
 * Gerçekleşme yüzdesi. Hedef yoksa ya da sıfırsa `null`:
 * sıfıra bölmek Infinity veriyor ve ekranda "%∞" olarak çıkıyordu.
 */
export function gerceklesme(gerceklesen: number, hedef: number | null | undefined): number | null {
  if (!hedef || hedef <= 0) return null;
  return Math.round((gerceklesen / hedef) * 1000) / 10;
}

/** Ay seçicide ve hedef sayfasında görünen ad: "Kasım 2026". */
const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export function ayEtiketi(donem: string): string {
  const [yil, ay] = donem.split("-").map(Number);
  return `${AY_ADLARI[ay - 1] ?? AYLAR[ay - 1] ?? "?"} ${yil}`;
}

/**
 * Hedef sayfasının ay listesi: içinde bulunulan aydan geriye `geri`,
 * ileriye `ileri` ay. İleriye bakmak zorunlu — hedef yaşanmış aya
 * değil, gelecek aya konur.
 */
export function aySecenekleri(bugun: string, geri = 6, ileri = 6): string[] {
  const [yil, ay] = bugun.split("-").map(Number);
  const liste: string[] = [];
  for (let k = -geri; k <= ileri; k += 1) liste.push(monthStartKey(yil, ay + k));
  return liste;
}
