/*
  YENİ POSTA BİLDİRİMİ — saf kısım.

  Ortak kutunun rozetini görmek için panele bakmak gerekiyordu; başka bir
  modülde çalışan kişi müşterinin yazdığını ancak postaya girince
  öğreniyordu. Eşitleme artık gerçekten YENİ gelen posta için bildirim
  bırakıyor (panelin kendi bildirim çekmecesi).

  Karar burada, veritabanı yazması lib/posta-esitleme.ts'te: kaç bildirim
  çıkacağı ve ne yazacağı test edilebilir kalsın.
*/

/** Bu sayıdan çoksa tek tek değil, tek bir özet bildirim çıkıyor. */
export const BILDIRIM_TEK_TEK_SINIRI = 5;

/** Bildirim metni dar bir satırda görünüyor; uzun konu kırpılıyor. */
const METIN_SINIRI = 140;

export type BildirimGirdisi = {
  threadId: string;
  gonderenAd: string | null;
  gonderenAdres: string;
  konu: string;
  tarih: Date | null;
  yon: "gelen" | "giden";
};

export type PostaBildirimi = { threadId: string | null; baslik: string; mesaj: string };

const kisalt = (metin: string) => (metin.length > METIN_SINIRI ? `${metin.slice(0, METIN_SINIRI - 1)}…` : metin);

/**
 * Yeni mesajlardan çıkacak bildirimler.
 *
 * Üç kural:
 * 1. Yalnızca GELEN mesaj. Kendi gönderdiğimiz postayı haber vermek,
 *    gönderen kişiye kendi işini duyurmak olurdu.
 * 2. Konuşma başına tek bildirim (en yenisi). Bir yazışmaya arka arkaya
 *    üç mesaj düşmesi üç bildirim değil, bir yazışma demek.
 * 3. Çok sayıda yazışma geldiyse tek özet. Sabah açılan kutuda kırk
 *    bildirim, çekmeceyi okunmaz yapıyordu.
 */
export function yeniPostaBildirimleri(yeniler: readonly BildirimGirdisi[]): PostaBildirimi[] {
  const konusmaBasina = new Map<string, BildirimGirdisi>();
  for (const mesaj of yeniler) {
    if (mesaj.yon !== "gelen") continue;
    const onceki = konusmaBasina.get(mesaj.threadId);
    const dahaYeni = !onceki || (mesaj.tarih?.getTime() ?? 0) >= (onceki.tarih?.getTime() ?? 0);
    if (dahaYeni) konusmaBasina.set(mesaj.threadId, mesaj);
  }

  const gelenler = [...konusmaBasina.values()];
  if (!gelenler.length) return [];

  if (gelenler.length > BILDIRIM_TEK_TEK_SINIRI) {
    return [{
      threadId: null,
      baslik: "Yeni postalar",
      mesaj: `Ortak kutuya ${gelenler.length} yeni yazışma düştü.`,
    }];
  }

  return gelenler.map((mesaj) => ({
    threadId: mesaj.threadId,
    baslik: "Yeni posta",
    mesaj: kisalt(`${(mesaj.gonderenAd || mesaj.gonderenAdres).trim()} · ${mesaj.konu.trim() || "(konu yok)"}`),
  }));
}
