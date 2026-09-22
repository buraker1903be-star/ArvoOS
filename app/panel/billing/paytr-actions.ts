"use server";

import { redirect } from "next/navigation";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLicenseCheckout } from "@/lib/license-checkout";
import { createAiKrediCheckout } from "@/lib/ai-kredi-checkout";
import { PRODUCTS, type ProductCode } from "@/lib/products";

// Müşteri kurumun aboneliğini kartla (PayTR Link) ödemesi. ArvoOS, ArvoLab,
// Arc ve Randevu ayrı ayrı ödenir. Bağlantıyı lib/license-checkout.ts kurar
// (Randevu paneli de aynısını kullanır); burası yalnızca yetkiyi denetler.

async function payLicenseWithCard__impl(formData: FormData) {
  const product = String(formData.get("product") ?? "arvoos").trim();
  if (!PRODUCTS.some((item) => item.code === product)) throw new Error("Geçerli bir ürün seçilmedi.");

  const { organization, membership, userId } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Lisans ödemesini yalnızca Kurum Sahibi veya Yönetici yapabilir.");
  const admin = createAdminClient();
  if (!admin) throw new Error("Kartla ödeme şu an kullanılamıyor. Havale ile ödeyebilirsiniz.");

  const { url } = await createLicenseCheckout(admin, { organizationId: organization.id, product: product as ProductCode, actorId: userId });
  // Güvenli PayTR ödeme sayfasına
  redirect(url);
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcı (lib/panel-action.ts).
export async function payLicenseWithCard(formData: FormData) {
  return runPanelAction(() => payLicenseWithCard__impl(formData));
}

/*
  AI kredisi satın alma. Lisans ödemesinden ayrı: orada bir dönem uzuyor,
  burada bir bakiye artıyor (lib/ai-kredi-checkout.ts).
*/
async function buyAiCredit__impl(formData: FormData) {
  const paketKodu = String(formData.get("paket") ?? "").trim();

  const { organization, membership, userId } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Kredi satın almayı yalnızca Kurum Sahibi veya Yönetici yapabilir.");
  const admin = createAdminClient();
  if (!admin) throw new Error("Kartla ödeme şu an kullanılamıyor. ArvoOS ile iletişime geçin.");

  const { url } = await createAiKrediCheckout(admin, { organizationId: organization.id, paketKodu, actorId: userId });
  redirect(url);
}

export async function buyAiCredit(formData: FormData) {
  return runPanelAction(() => buyAiCredit__impl(formData));
}
