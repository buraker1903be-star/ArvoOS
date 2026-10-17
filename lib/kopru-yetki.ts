import { timingSafeEqual } from "node:crypto";

/*
  ÜRÜN KÖPRÜLERİNİN ORTAK YETKİ DENETİMİ.

  Ürün başına ayrı gizli anahtar: Randevu RANDEVU_BRIDGE_SECRET,
  diğerleri PRODUCT_BRIDGE_SECRET gönderir (x-arvo-bridge-secret).
  Biri sızarsa öteki ürün açılmasın diye ayrı.

  TEK YERDE, çünkü ikinci köprü ucu (bildirim) yazılırken denetim
  kopyalanacaktı: aynı kuralın iki kopyası, birinde düzeltilen bir
  eksiğin ötekinde kalması demek. Bu depoda WhatsApp kapısı da aynı
  sebeple tek giriş noktasına indirilmişti.
*/
export type KopruUrunu = "arvoos" | "arvolab" | "arc" | "randevu";

export const KOPRU_URUNLERI: KopruUrunu[] = ["arvoos", "arvolab", "arc", "randevu"];

/** Ürünün kendi anahtarı; Randevu'nunki ayrı (lib/randevu-bridge-auth.ts ile aynı değer). */
export function kopruSirri(product: KopruUrunu): string | undefined {
  return product === "randevu" ? process.env.RANDEVU_BRIDGE_SECRET : process.env.PRODUCT_BRIDGE_SECRET;
}

/**
 * Anahtar sabit zamanlı karşılaştırılır ve uzunluk farkı ÖNCE elenir:
 * timingSafeEqual farklı uzunlukta istisna fırlatıyor. Anahtar tanımlı
 * değilse sonuç false — kapalı başarısızlık.
 */
export function kopruYetkili(istek: Request, product: KopruUrunu): boolean {
  const sir = kopruSirri(product);
  const gelen = istek.headers.get("x-arvo-bridge-secret");
  if (!sir || !gelen) return false;
  const beklenen = Buffer.from(sir);
  const alinan = Buffer.from(gelen);
  return beklenen.length === alinan.length && timingSafeEqual(beklenen, alinan);
}
