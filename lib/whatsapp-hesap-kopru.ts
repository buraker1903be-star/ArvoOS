import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { removeWhatsappAccountRow, saveWhatsappAccountRow, verifyWhatsappAccountRow } from "@/lib/whatsapp-account";
import { getWhatsappStatus } from "@/lib/whatsapp-status";

/*
  ÜRÜN PANELİNDEN WHATSAPP NUMARASI BAĞLAMA — ortak gövde.

  Kayıt ArvoOS'ta (whatsapp_accounts) duruyor, çünkü gönderim kapısı
  numarayı oradan buluyor ve erişim anahtarı yalnızca ArvoOS'un
  şifreleme anahtarıyla saklanıyor. Ama KİRACIYI ARVOOS PANELİNE
  GÖNDERMEK ÇÖZÜM DEĞİL: ArvoARC ya da Randevu hizmeti alan bir
  müşterinin ArvoOS paneli olmayabilir — o zaman numarasını hiçbir
  yerden bağlayamaz ve bildirim özelliği kendisine kapalı kalır.

  Bu dosya Randevu ucundan çıkarıldı (17.10.2026): ArvoARC'a da aynı
  bölüm eklenirken gövde üçüncü kez kopyalanacaktı. Değişen tek şey
  ürün adı ve yetkiyi kimin doğruladığı; geri kalan aynı.

  YETKİ İKİ KADEMELİ. Çağıran ürün kendi oturumundan actorId'yi
  doğruluyor; burada o kişinin ArvoOS'ta bu kurumda gerçekten
  yetkili olduğu AYRICA denetleniyor. Ürünün sözüne güvenmek,
  ürünün sırrı sızdığında herkesin numarasını değiştirebilmesi
  demekti.

  Erişim anahtarı hiçbir yanıtta dönmez (getWhatsappStatus onu hiç
  okumuyor).
*/

export type HesapEylemi = "status" | "save" | "verify" | "remove";
export const HESAP_EYLEMLERI = new Set<HesapEylemi>(["status", "save", "verify", "remove"]);

export type HesapIstegi = {
  eylem: HesapEylemi;
  organizationId: string;
  actorId: string;
  /** Hangi ürünün lisansı aranacak. */
  urun: string;
  /** Bu rol kurumda numara bağlayabilir mi. */
  yetkiliMi: (rol: string) => boolean;
  wabaId?: string;
  phoneNumberId?: string;
  accessToken?: string;
};

export type HesapYaniti = { durum: number; govde: Record<string, unknown> };

export async function whatsappHesapIslemi(istek: HesapIstegi): Promise<HesapYaniti> {
  const admin = createAdminClient();
  if (!admin) return { durum: 503, govde: { error: "unavailable" } };
  /* Anahtar şifresiz yazılmaz: şifreleme anahtarı yoksa bölüm hiç açılmaz. */
  if (!paymentCredentialsConfigured()) return { durum: 503, govde: { error: "no_encryption_key" } };

  const [lisans, kisi] = await Promise.all([
    admin
      .from("organization_product_licenses")
      .select("status")
      .eq("organization_id", istek.organizationId)
      .eq("product", istek.urun)
      .maybeSingle(),
    admin
      .from("organization_memberships")
      .select("role,is_active")
      .eq("organization_id", istek.organizationId)
      .eq("user_id", istek.actorId)
      .maybeSingle(),
  ]);
  if (!lisans.data) return { durum: 404, govde: { error: "no_license" } };
  if (!kisi.data?.is_active || !istek.yetkiliMi(kisi.data.role)) return { durum: 403, govde: { error: "forbidden" } };

  try {
    if (istek.eylem === "status") {
      return { durum: 200, govde: { status: await getWhatsappStatus(istek.organizationId) } };
    }

    if (istek.eylem === "save") {
      await saveWhatsappAccountRow(admin, {
        organizationId: istek.organizationId,
        wabaId: String(istek.wabaId ?? "").replace(/\s/g, ""),
        phoneNumberId: String(istek.phoneNumberId ?? "").replace(/\s/g, ""),
        token: String(istek.accessToken ?? "").trim(),
        connectedBy: istek.actorId,
      });
      return { durum: 200, govde: { status: await getWhatsappStatus(istek.organizationId) } };
    }

    if (istek.eylem === "verify") {
      const sonuc = await verifyWhatsappAccountRow(admin, istek.organizationId);
      /* Doğrulanamadı da bir yanıt: durum kaydedildi, ekran sebebini göstersin. */
      return {
        durum: 200,
        govde: {
          status: await getWhatsappStatus(istek.organizationId),
          verified: sonuc.ok,
          detail: sonuc.error ?? null,
        },
      };
    }

    await removeWhatsappAccountRow(admin, istek.organizationId);
    return { durum: 200, govde: { status: await getWhatsappStatus(istek.organizationId) } };
  } catch (hata) {
    /* Meta'nın ve doğrulamanın Türkçe cümleleri olduğu gibi ürüne geçer. */
    const detail = hata instanceof Error ? hata.message : String(hata);
    console.error("[whatsapp-hesap]", istek.urun, istek.eylem, detail);
    return { durum: 400, govde: { error: "whatsapp_failed", detail } };
  }
}
