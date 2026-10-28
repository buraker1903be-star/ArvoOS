/*
  KİRACIYA ABONELİK ÖDEME HATIRLATMASI (13.10.2026) — saf kurallar.
  Gönderim: app/api/cron/abonelik-hatirlatma (her sabah 09:00, Türkiye).

  Varsayılan olarak otomatik karttan çekim yok; dönem sonu yaklaşan kurum
  ödemesini kendi panelinden (Lisans ve ödeme) yapıyor. Kartını kaydedip
  otomatik yenilemeyi SEÇEN kurumlara bu hatırlatma gitmez; onlarınki
  lib/otomatik-yenileme.ts'te (28.10.2026). Hatırlatma eskiden yalnızca
  kurucunun Platform → Abonelikler listesindeydi; kurucu tek tek
  WhatsApp'tan yazıyordu. Kurum sahibinin tarifi: 7 gün kala, 3 gün
  kala, "yarın son gün"; yalnızca kurumun yöneticilerine.

  Kademeler: 7, 3, 1 (yarın), 0 (bugün) ve süresi dolduktan bir gün
  sonra bir kez. Gün farkı TÜRKİYE gününe göre (sunucu UTC'de; gece
  yarısından sonra bir önceki gün sayılmasın — AGENTS.md).
*/
import { gunFarki } from "@/lib/is-adimlari";

export const ABONELIK_KADEMELERI = [7, 3, 1, 0, -1] as const;
export type AbonelikKademesi = (typeof ABONELIK_KADEMELERI)[number];

const gunAnahtari = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" });
const uzunTarih = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long" });
const tl = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(kurus / 100);

/** Bitiş anı (ISO) ile bugünün Türkiye günü arasındaki gün; kademe değilse null. */
export function abonelikKademesi(bitis: string, bugun: string): AbonelikKademesi | null {
  const kalan = gunFarki(bugun, gunAnahtari.format(new Date(bitis)));
  return (ABONELIK_KADEMELERI as readonly number[]).includes(kalan) ? (kalan as AbonelikKademesi) : null;
}

export function abonelikBildirimi(girdi: {
  urunAdi: string;
  deneme: boolean;
  bitis: string;
  kademe: AbonelikKademesi;
  aylikUcret: number | null;
}): { baslik: string; metin: string; ton: "bilgi" | "uyari" | "tehlike" } {
  const ne = girdi.deneme ? `${girdi.urunAdi} deneme süreniz` : `${girdi.urunAdi} aboneliğiniz`;
  const Ne = girdi.deneme ? "Deneme süreniz" : "Aboneliğiniz";
  const Nenin = girdi.deneme ? "Deneme sürenizin" : "Aboneliğinizin";
  const tarih = uzunTarih.format(new Date(girdi.bitis));
  const ucret = !girdi.deneme && girdi.aylikUcret ? ` Aylık ücret ${tl(girdi.aylikUcret)}.` : "";
  const odeme = " Ödemenizi Lisans ve Ödeme sayfasından kartla yapabilirsiniz.";
  switch (girdi.kademe) {
    case 7:
    case 3:
      return {
        baslik: `${Nenin} bitmesine ${girdi.kademe} gün kaldı`,
        metin: `${ne} ${tarih} tarihinde sona eriyor.${ucret}${odeme}`,
        ton: girdi.kademe === 3 ? "uyari" : "bilgi",
      };
    case 1:
      return {
        baslik: `${Ne} yarın son gün`,
        metin: `${ne} yarın (${tarih}) sona eriyor. Ödeme yapılması beklenmektedir.${ucret}${odeme}`,
        ton: "uyari",
      };
    case 0:
      return {
        baslik: `${Ne} bugün sona eriyor`,
        metin: `${ne} bugün sona eriyor. Kesinti yaşamamak için ödemenizi bugün yapın.${ucret}${odeme}`,
        ton: "tehlike",
      };
    case -1:
      return {
        baslik: `${Ne} sona erdi`,
        metin: `${ne} ${tarih} tarihinde sona erdi. Ödeme yapılması beklenmektedir; ödeme yapılmazsa erişim kısıtlanabilir.${ucret}${odeme}`,
        ton: "tehlike",
      };
  }
}

/** Aynı kurum, ürün, dönem ve kademe için bildirim bir kez yazılır (iş tekrar koşsa da). */
export const abonelikAnahtari = (kurum: string, urun: string, bitis: string, kademe: AbonelikKademesi) =>
  `${kurum}:${urun}:${gunAnahtari.format(new Date(bitis))}:${kademe}`;
