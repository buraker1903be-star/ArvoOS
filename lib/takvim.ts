/*
  TAKVİM HESAPLARI (29.10.2026) — saf. Panelin tarih seçicisi
  (app/panel/components/tarih-secici.tsx) bunları kullanıyor.

  Her şey "YYYY-MM-DD" gün anahtarı üzerinde ve UTC takvimiyle: gün
  anahtarı bir AN değil bir GÜN taşıyor, saat dilimine çevirmek gece
  yarısına yakın saatlerde günü kaydırırdı (AGENTS.md "Tarih Türkiye
  saatiyle"). "Bugün" çağırandan gelir (todayInIstanbul).

  Hafta pazartesi başlar (Türkiye). Ay ekleme ay sonuna kırpar: 31
  Ocak + 1 ay = 28/29 Şubat, 3 Mart değil.

  Testi tests/unit/takvim.test.ts.
*/

export const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"] as const;
export const AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"] as const;
/** Pazartesiden başlayarak. */
export const GUNLER = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"] as const;
export const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

const GUN_DESENI = /^(\d{4})-(\d{2})-(\d{2})$/;
const iki = (n: number) => String(n).padStart(2, "0");

/** Geçerli bir gün anahtarı mı (31 Şubat gibi taşan tarih değil). */
export function gunMu(deger: string | null | undefined): deger is string {
  const eslesme = GUN_DESENI.exec(deger ?? "");
  if (!eslesme) return false;
  const [y, a, g] = [Number(eslesme[1]), Number(eslesme[2]), Number(eslesme[3])];
  const t = new Date(Date.UTC(y, a - 1, g));
  return t.getUTCFullYear() === y && t.getUTCMonth() === a - 1 && t.getUTCDate() === g;
}

export const parcala = (gun: string) => ({ yil: Number(gun.slice(0, 4)), ay: Number(gun.slice(5, 7)), gun: Number(gun.slice(8, 10)) });
export const anahtar = (yil: number, ay: number, gun: number) => {
  const t = new Date(Date.UTC(yil, ay - 1, gun));
  return `${t.getUTCFullYear()}-${iki(t.getUTCMonth() + 1)}-${iki(t.getUTCDate())}`;
};

export function gunEkle(gun: string, adet: number): string {
  const { yil, ay, gun: g } = parcala(gun);
  return anahtar(yil, ay, g + adet);
}

/** Ay ekler, ay sonuna kırpar. */
export function ayEkle(gun: string, adet: number): string {
  const { yil, ay, gun: g } = parcala(gun);
  const hedefAyBasi = new Date(Date.UTC(yil, ay - 1 + adet, 1));
  const sonGun = new Date(Date.UTC(hedefAyBasi.getUTCFullYear(), hedefAyBasi.getUTCMonth() + 1, 0)).getUTCDate();
  return anahtar(hedefAyBasi.getUTCFullYear(), hedefAyBasi.getUTCMonth() + 1, Math.min(g, sonGun));
}

/** 0 = pazartesi … 6 = pazar. */
export function haftaGunu(gun: string): number {
  const { yil, ay, gun: g } = parcala(gun);
  return (new Date(Date.UTC(yil, ay - 1, g)).getUTCDay() + 6) % 7;
}

export type TakvimHucresi = { gun: string; ayIcinde: boolean };

/** Ayın görünen ızgarası: altı hafta, pazartesiden başlar (yükseklik ay ay zıplamasın). */
export function ayIzgarasi(yil: number, ay: number): TakvimHucresi[] {
  const ilk = anahtar(yil, ay, 1);
  const baslangic = gunEkle(ilk, -haftaGunu(ilk));
  return Array.from({ length: 42 }, (_, i) => {
    const gun = gunEkle(baslangic, i);
    return { gun, ayIcinde: parcala(gun).ay === ay };
  });
}

/** min/max sınırında mı (ikisi de isteğe bağlı, uçlar dahil). */
export function aralikta(gun: string, min?: string | null, max?: string | null): boolean {
  return (!gunMu(min) || gun >= min) && (!gunMu(max) || gun <= max);
}

/** "2026-07-09" → "09.07.2026". */
export const kutuYazisi = (gun: string) => (gunMu(gun) ? `${gun.slice(8, 10)}.${gun.slice(5, 7)}.${gun.slice(0, 4)}` : "");

/** "2026-07-09" → "9 Temmuz 2026, Perşembe". */
export function uzunYazi(gun: string): string {
  if (!gunMu(gun)) return "";
  const { yil, ay, gun: g } = parcala(gun);
  return `${g} ${AYLAR[ay - 1]} ${yil}, ${GUNLER[haftaGunu(gun)]}`;
}

/*
  Klavyeyle yazılan tarih: "9.7.2026", "09/07/2026", "09-07-26",
  "09072026". İki haneli yıl 2000'li yıllar. Geçersiz ya da eksikse null
  (yarım yazılmış bir tarih bir gün sayılmasın).
*/
export function yaziyiCoz(yazi: string): string | null {
  const temiz = yazi.trim();
  let g: number, a: number, y: number;
  const ayrikli = /^(\d{1,2})[.\/\-\s](\d{1,2})[.\/\-\s](\d{2}|\d{4})$/.exec(temiz);
  const bitisik = /^(\d{2})(\d{2})(\d{4})$/.exec(temiz);
  if (ayrikli) [g, a, y] = [Number(ayrikli[1]), Number(ayrikli[2]), Number(ayrikli[3])];
  else if (bitisik) [g, a, y] = [Number(bitisik[1]), Number(bitisik[2]), Number(bitisik[3])];
  else return null;
  if (y < 100) y += 2000;
  const gun = `${y}-${iki(a)}-${iki(g)}`;
  return gunMu(gun) ? gun : null;
}

/*
  Yazarken noktaları kendiliğinden koyar: "0907" → "09.07", "09072026" →
  "09.07.2026". Kullanıcı nokta yazarsa olduğu gibi kalır.
*/
export function yaziMaskesi(yazi: string): string {
  /* Noktalar yalnızca maskenin kendi yerlerindeyse (3. ve 6. karakter)
     yeniden maskelenir. Eskiden ilk nokta düştüğü an maske duruyordu ve
     art arda yazılan rakamlar "09.072026" oluyordu. Kullanıcı kendisi
     başka yere ayırıcı koyduysa ("9.7.2026") olduğu gibi kalır. */
  const kendiAyiraci = [...yazi].some((k, i) => /[\/\-\s]/.test(k) || (k === "." && i !== 2 && i !== 5));
  if (kendiAyiraci) return yazi.slice(0, 10);
  const rakam = yazi.replace(/\D/g, "").slice(0, 8);
  if (rakam.length <= 2) return rakam;
  if (rakam.length <= 4) return `${rakam.slice(0, 2)}.${rakam.slice(2)}`;
  return `${rakam.slice(0, 2)}.${rakam.slice(2, 4)}.${rakam.slice(4)}`;
}

/** Bugüne göre kısa göreli ad: "Bugün", "Yarın", "Dün", "3 gün sonra", "2 gün önce"; uzaksa null. */
export function goreliAd(gun: string, bugun: string): string | null {
  if (!gunMu(gun) || !gunMu(bugun)) return null;
  const fark = Math.round((Date.UTC(parcala(gun).yil, parcala(gun).ay - 1, parcala(gun).gun) - Date.UTC(parcala(bugun).yil, parcala(bugun).ay - 1, parcala(bugun).gun)) / 86_400_000);
  if (fark === 0) return "Bugün";
  if (fark === 1) return "Yarın";
  if (fark === -1) return "Dün";
  if (fark > 1 && fark <= 30) return `${fark} gün sonra`;
  if (fark < -1 && fark >= -30) return `${-fark} gün önce`;
  return null;
}
