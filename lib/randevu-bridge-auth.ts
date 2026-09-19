import { timingSafeEqual } from "node:crypto";

/**
 * Randevu sunucusundan gelen çağrının anahtarı (RANDEVU_BRIDGE_SECRET,
 * x-arvo-bridge-secret başlığı). ArvoLab'ın PRODUCT_BRIDGE_SECRET'ından
 * ayrı: biri sızarsa diğer ürün açılmasın.
 */
export function randevuBridgeAuthorized(request: Request) {
  const secret = process.env.RANDEVU_BRIDGE_SECRET;
  const sent = request.headers.get("x-arvo-bridge-secret");
  if (!secret || !sent) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(sent);
  // Uzunluk farkı timingSafeEqual'i patlatır; önce onu eşitle.
  return expected.length === received.length && timingSafeEqual(expected, received);
}
