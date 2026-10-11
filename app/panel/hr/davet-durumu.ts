/*
  DAVETİN HANGİ DURUMDA OLDUĞU — tek karar yeri.

  Panel bugüne kadar yalnızca `pending` ve `sent` davetleri okuyor ve
  süresi dolanları da bellekte eliyordu. İki davet böylece SESSİZCE
  kayboluyordu:

  - `failed`: kenar fonksiyonu daveti gönderemedi (e-posta servisi,
    oran sınırı, zaten kayıtlı hesap…) ve sebebi error_message'a
    yazdı. Listede hiç görünmediği için yönetici "davet gitti" sanıp
    bekliyor; kişi hiçbir zaman gelmiyor.
  - süresi dolmuş `sent`: bağlantı artık açılmıyor ama satır listeden
    düşmüş olduğu için yöneticiye "yeniden davet et" diyen bir iz
    kalmıyor.

  `expired` durumu BAŞKA bir şey: yöneticinin kendi iptal ettiği davet
  (cancelInvitation bu durumu yazıyor). O yüzden okunan durumlar
  arasında yok — iptal edilen davet sorun değil.

  Saf modül: saat dışarıdan verilir, birim testi
  tests/unit/davet-durumu.test.ts.
*/

/** Panelin okuduğu davet durumları. `expired` yok: o, iptal edilmiş davet. */
export const OKUNAN_DAVET_DURUMLARI = ["pending", "sent", "failed"] as const;

export const DAVET_DURUM_ADLARI: Record<string, string> = {
  pending: "Gönderiliyor",
  sent: "Gönderildi",
  failed: "Gönderilemedi",
};

export type DavetSatiri = {
  id: string;
  email: string;
  status: string;
  expires_at: string;
  error_message?: string | null;
};

/** Sebep metni kısa tutuluyor: kutu tek satırlık, uzun hata taşıyor. */
const ENCOK = 160;
function kisalt(metin: string): string {
  const temiz = metin.replace(/\s+/g, " ").trim();
  if (temiz.length <= ENCOK) return temiz;
  const kesik = temiz.slice(0, ENCOK);
  const bosluk = kesik.lastIndexOf(" ");
  return (bosluk > 80 ? kesik.slice(0, bosluk) : kesik) + "…";
}

/**
 * Davet neden sorunlu; sorun yoksa null.
 *
 * Gönderilemeyen davet, süresi dolmuş olsa bile GÖNDERİM hatasıyla
 * anlatılıyor: yöneticinin yapacağı iş "süresi doldu"dan değil
 * "gönderilemedi"den çıkıyor.
 */
export function davetSorunu<T extends DavetSatiri>(davet: T, simdi: number): string | null {
  if (davet.status === "failed") {
    const sebep = (davet.error_message ?? "").trim();
    return sebep ? kisalt(sebep) : "Davet e-postası gönderilemedi.";
  }
  if (Date.parse(davet.expires_at) <= simdi) return "Davetin süresi doldu; bağlantı artık açılmıyor.";
  return null;
}

/** Bekleyenler ve sorunlular; sorunlular sebebiyle birlikte. */
export function davetleriAyir<T extends DavetSatiri>(satirlar: readonly T[], simdi: number): {
  bekleyen: T[];
  sorunlu: (T & { sebep: string })[];
} {
  const bekleyen: T[] = [];
  const sorunlu: (T & { sebep: string })[] = [];
  for (const satir of satirlar) {
    const sebep = davetSorunu(satir, simdi);
    if (sebep) sorunlu.push({ ...satir, sebep });
    else bekleyen.push(satir);
  }
  return { bekleyen, sorunlu };
}

/** Bir kişinin (e-postasına göre) davetini bulur: bekleyen varsa o, yoksa sorunlu. */
export function kisininDaveti<T extends DavetSatiri>(satirlar: readonly T[], eposta: string | null, simdi: number): {
  davet: T | null;
  sebep: string | null;
} {
  const hedef = (eposta ?? "").trim().toLocaleLowerCase("tr-TR");
  if (!hedef) return { davet: null, sebep: null };
  const kendisinin = satirlar.filter((s) => s.email.trim().toLocaleLowerCase("tr-TR") === hedef);
  const { bekleyen, sorunlu } = davetleriAyir(kendisinin, simdi);
  if (bekleyen.length) return { davet: bekleyen[0], sebep: null };
  if (sorunlu.length) return { davet: sorunlu[0], sebep: sorunlu[0].sebep };
  return { davet: null, sebep: null };
}
