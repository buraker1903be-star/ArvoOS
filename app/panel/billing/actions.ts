"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPanelContextErisimdenBagimsiz as getPanelContext } from "@/lib/panel-context";
import { parseTurkishAmount } from "@/lib/turkish-amount";
import { paraBirimiCoz, paraYaz, tutar as paraTutari } from "@/lib/para";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { PRODUCTS, productName } from "@/lib/products";
import { kurucuyaUyar } from "@/lib/kurucu-uyarisi";

const plans = new Set(["starter", "professional", "enterprise"]);
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function sanitizeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "dekont";
}

async function submitBankTransferPayment__impl(formData: FormData) {
  const { supabase, organization, membership, hiddenModuleKeys, yetkiler } = await getPanelContext();
  if (!membership || !yetkiler.has("finance.lisans.yonet")) {
    throw new Error("Ödeme bildirimi yalnızca kurum sahibi veya yöneticisi tarafından gönderilebilir.");
  }
  assertModuleKeyAccess(membership.role, "finance", hiddenModuleKeys);

  const bankAccountId = String(formData.get("bank_account_id") ?? "").trim();
  const product = String(formData.get("product") ?? "arvoos").trim();
  const planCode = String(formData.get("plan_code") ?? "").trim();
  const amountTl = parseTurkishAmount(String(formData.get("amount") ?? ""));
  const referenceNo = String(formData.get("reference_no") ?? "").trim().slice(0, 120);
  const customerNote = String(formData.get("customer_note") ?? "").trim().slice(0, 1000);
  const receipt = formData.get("receipt");

  if (!bankAccountId) throw new Error("Banka hesabı seçilmedi.");
  if (!PRODUCTS.some((p) => p.code === product)) throw new Error("Geçerli bir ürün seçin.");
  if (!plans.has(planCode)) throw new Error("Geçerli bir paket seçin.");
  if (!Number.isFinite(amountTl) || amountTl <= 0 || amountTl > 10000000) throw new Error("Geçerli bir ödeme tutarı girin.");
  if (!(receipt instanceof File) || receipt.size === 0) throw new Error("Dekont dosyası zorunludur.");
  if (!allowedTypes.has(receipt.type)) throw new Error("Dekont PDF, JPG, PNG veya WEBP olmalıdır.");
  if (receipt.size > 10 * 1024 * 1024) throw new Error("Dekont dosyası 10 MB sınırını aşıyor.");

  /*
    PARA BİRİMİ SUNUCUDAN, SEÇİLEN HESAPTAN (28.11.2026). Eskiden
    satıra `currency: "TRY"` SABİT yazılıyordu: USD bir hesaba yapılan
    havale kütüğe TL diye giriyor, onay ekranı 850 USD'yi 850 TL ile
    karşılaştırıyordu. İstemciden para birimi ALINMIYOR — alınsaydı
    müşteri hangi birimde ödediğini kendisi belirlerdi.
  */
  const { data: account, error: accountError } = await supabase
    .from("platform_bank_accounts")
    .select("id,currency")
    .eq("id", bankAccountId)
    .eq("is_active", true)
    .maybeSingle();
  if (accountError || !account) throw new Error("Aktif banka hesabı bulunamadı.");
  const paraBirimi = paraBirimiCoz((account as { currency?: string | null }).currency);
  if (!paraBirimi) {
    /* Hesabın birimi tanınmıyorsa bildirim alınmıyor: TRY varsaymak,
       yanlış birimde bir tahsilatı kütüğe doğru gibi yazmak olurdu. */
    throw new Error("Seçilen banka hesabının para birimi tanımlı değil; bu hesapla ödeme bildirimi alınamıyor.");
  }

  /*
    BİLDİRİM ASIL ÖDEME İSTEĞİNE BAĞLI (28.11.2026).

    Aboneliğin para birimi lisans satırında sabitlenmiş durumda
    (organization_licenses / organization_product_licenses →
    para_birimi, 20261128120350). Müşteri USD abonelik için TL hesabı
    seçerse bildirim KAYDEDİLMİYOR — ne satır açılıyor ne dekont
    yükleniyor. Eskiden böyle bir denetim yoktu: her bildirim TRY
    yazılıyor ve onay ekranı 850 USD'yi 850 TL ile karşılaştırıyordu.

    Lisans satırı yoksa (ilk satın alma) beklenen birim yok sayılıyor:
    o durumda hesabın birimi bildirimin birimi olur ve onay aşaması
    kararı kurucuya bırakır.
  */
  const lisansSorgusu = product === "arvoos"
    ? supabase.from("organization_licenses").select("para_birimi").eq("organization_id", organization.id).maybeSingle()
    : supabase.from("organization_product_licenses").select("para_birimi").eq("organization_id", organization.id).eq("product", product).maybeSingle();
  const { data: lisans, error: lisansHatasi } = await lisansSorgusu;
  /* Okunamayan lisans "fark yok" demek değil (AGENTS.md: engelin
     sorgusu hata yutmaz). */
  if (lisansHatasi) throw new Error(`Abonelik para birimi okunamadı: ${lisansHatasi.message}`);
  const beklenenBirim = paraBirimiCoz((lisans as { para_birimi?: string | null } | null)?.para_birimi);
  if (beklenenBirim && beklenenBirim !== paraBirimi) {
    throw new Error(
      `Bu aboneliğin para birimi ${beklenenBirim}; seçilen banka hesabı ${paraBirimi}. ` +
      `${beklenenBirim} hesabını seçin — bildirim kaydedilmedi.`,
    );
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Oturum doğrulanamadı.");

  const receiptPath = `${organization.id}/${userData.user.id}/${Date.now()}-${sanitizeFileName(receipt.name)}`;
  const { error: uploadError } = await supabase.storage.from("payment-receipts").upload(receiptPath, receipt, {
    contentType: receipt.type,
    upsert: false,
  });
  if (uploadError) throw new Error(`Dekont yüklenemedi: ${uploadError.message}`);

  const amount = Math.round(amountTl * 100);
  const { error: insertError } = await supabase.from("organization_payment_requests").insert({
    organization_id: organization.id,
    bank_account_id: bankAccountId,
    plan_code: planCode,
    product,
    amount,
    currency: paraBirimi,
    payment_method: "bank_transfer",
    receipt_path: receiptPath,
    reference_no: referenceNo || null,
    customer_note: customerNote || null,
    submitted_by: userData.user.id,
  });

  if (insertError) {
    await supabase.storage.from("payment-receipts").remove([receiptPath]);
    throw new Error(`Ödeme bildirimi kaydedilemedi: ${insertError.message}`);
  }

  /* Kurucuya anında e-posta (lib/kurucu-uyarisi): dekont onaylanmadan
     lisans açılmıyor ve bildirim eskiden yalnızca konsolun ziline
     düşüyordu. Akışı düşürmez. */
  await kurucuyaUyar({
    baslik: `Yeni dekont: ${organization.display_name || organization.name}`,
    satirlar: [
      ["Kurum", organization.display_name || organization.name],
      ["Ürün", productName(product as Parameters<typeof productName>[0])],
      ["Tutar", paraYaz(paraTutari(amount, paraBirimi))],
      ["Referans", referenceNo || null],
    ],
    not: customerNote || null,
    yol: "/panel/platform/payments",
    dugme: "Ödeme onaylarını aç",
  });

  revalidatePath("/panel/billing");
  redirect("/panel/billing?submitted=1");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function submitBankTransferPayment(...args: Parameters<typeof submitBankTransferPayment__impl>) {
  return runPanelAction(() => submitBankTransferPayment__impl(...args), "Ödeme bildiriminiz alındı");
}
