/*
  MÜŞTERİ ETKİNLİĞİ (02.11.2026) — saf. Konsolun Müşteriler listesi ve
  ana ekranı; testi tests/unit/musteri-etkinligi.test.ts.

  Konsol bir müşterinin ödediğini ve dönemini biliyordu ama paneli
  KULLANIP KULLANMADIĞINI hiçbir ekranda söylemiyordu. Ayrılmanın en
  erken işareti bu: yenileme günü gelen ve üç haftadır kimsenin
  girmediği kurum, ödemeyi büyük olasılıkla yenilemeyecek. Bunu
  yenilemeden ÖNCE görmek, aramak için zaman bırakıyor.

  Kaynak user_presence: kurum × kişi başına TEK satır, son görülme anı
  (panel her açıkken nabız yazıyor). Yalnızca ArvoOS paneli — ArvoLab,
  ArvoARC ve ArvoCal kendi projelerinde; o ürünlerin müşterisi burada
  "hiç girmedi" görünebilir. O yüzden risk yalnızca ArvoOS lisansı
  açık kurumlara uygulanıyor (çağıran süzer).
*/

export type VarlikSatiri = { organization_id: string; last_seen_at: string };
export type KurumEtkinligi = { son: string | null; haftalik: number; toplam: number };
export type EtkinlikHali = "aktif" | "azaliyor" | "sessiz";

const GUN = 86_400_000;
export const AKTIF_GUN = 7;
export const SESSIZ_GUN = 21;
/** Bu kadar gün içinde yenilenecek ve sessiz olan kurum risktedir. */
export const RISK_PENCERESI_GUN = 30;

export function kurumEtkinligi(satirlar: VarlikSatiri[], simdi: number): Map<string, KurumEtkinligi> {
  const harita = new Map<string, KurumEtkinligi>();
  for (const s of satirlar) {
    const e = harita.get(s.organization_id) ?? { son: null, haftalik: 0, toplam: 0 };
    e.toplam += 1;
    if (!e.son || s.last_seen_at > e.son) e.son = s.last_seen_at;
    if (simdi - Date.parse(s.last_seen_at) <= AKTIF_GUN * GUN) e.haftalik += 1;
    harita.set(s.organization_id, e);
  }
  return harita;
}

/** Hiç girilmemiş kurum da "sessiz": kurulup kullanılmayan müşteri en riskli olanı. */
export function etkinlikHali(son: string | null, simdi: number): EtkinlikHali {
  if (!son) return "sessiz";
  const gun = (simdi - Date.parse(son)) / GUN;
  return gun <= AKTIF_GUN ? "aktif" : gun <= SESSIZ_GUN ? "azaliyor" : "sessiz";
}

export function etkinlikYazisi(son: string | null, simdi: number): string {
  if (!son) return "Hiç girilmedi";
  const gun = Math.floor((simdi - Date.parse(son)) / GUN);
  if (gun <= 0) return "Bugün";
  if (gun === 1) return "Dün";
  return `${gun} gün önce`;
}

/**
 * Risk: lisansı açık, yenilemesi RISK_PENCERESI_GUN içinde (ya da geçmiş)
 * ve etkin DEĞİL. Yenilemesi uzak olan sessiz müşteri de takip edilmeli
 * ama "bu hafta ara" listesine girmiyor — liste kısa kalmazsa kimse
 * okumaz.
 */
export function yenilemeRiski(girdi: { acik: boolean; yenileme: string | null; son: string | null }, simdi: number): boolean {
  if (!girdi.acik || !girdi.yenileme) return false;
  const kalan = (Date.parse(girdi.yenileme) - simdi) / GUN;
  return kalan <= RISK_PENCERESI_GUN && etkinlikHali(girdi.son, simdi) !== "aktif";
}

/**
 * Kurulup KULLANILMAYAN müşteri (02.11.2026): kurulumu bitmiş ve
 *  - denemede olup son 7 günde kimse girmemiş (deneme boşa gidiyor,
 *    ödemeye dönmeyecek), ya da
 *  - ödüyor (aktif / gecikmiş) ama panele HİÇ girilmemiş (kurulum
 *    yapıldı, kullanıcı başlamadı).
 * Yenileme riski ayrı bir soru (yenileme tarihine bağlı); çağıran iki
 * listeyi birbirinden ayıklıyor.
 */
export function kullanilmayanMi(girdi: { kurulum: string; durum: string | null; son: string | null }, simdi: number): boolean {
  if (girdi.kurulum !== "active") return false;
  if (girdi.durum === "trialing") return etkinlikHali(girdi.son, simdi) !== "aktif";
  if (girdi.durum === "active" || girdi.durum === "past_due") return !girdi.son;
  return false;
}
