"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { syncArvolabLicense } from "@/lib/arvolab";
import { syncArcTenantQuietly } from "@/lib/arc-bridge";
import { syncRandevuTenantQuietly } from "@/lib/randevu-bridge";
import { havaleDenetimleri } from "@/lib/beklenen-odeme";

async function reviewBankTransferPayment__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const reviewNote = String(formData.get("review_note") ?? "").trim().slice(0, 1000);

  if (!paymentId) throw new Error("Ödeme kaydı seçilmedi.");
  if (!new Set(["approved", "rejected"]).has(decision)) throw new Error("Geçersiz karar.");

  /*
    TUTAR DENETİMİ (14.10.2026). Onay lisansı BİLDİRİLEN paketle bir ay
    uzatıyor; eskiden bildirilen tutar ve paket hiçbir şeyle
    karşılaştırılmıyordu. Fark varsa kurucu ekranda görüp açıkça teyit
    etmeden onay geçmiyor (ekrandaki karar formu teyidi bu alanla
    gönderiyor). Ret için denetim yok.
  */
  if (decision === "approved") {
    const { data: bildirim, error: bildirimHatasi } = await supabase.from("organization_payment_requests")
      .select("id,organization_id,product,plan_code,amount").eq("id", paymentId).maybeSingle();
    if (bildirimHatasi || !bildirim) throw new Error("Ödeme bildirimi okunamadı" + (bildirimHatasi ? `: ${bildirimHatasi.message}` : "."));
    const denetim = (await havaleDenetimleri(supabase, [bildirim])).get(bildirim.id);
    if (denetim?.farklar.length && formData.get("fark_onayi") !== "evet") {
      throw new Error("Bildirim beklenenle uyuşmuyor: " + denetim.farklar.join(" ") + " Farkı görerek onaylamak için ekrandaki teyidi kullanın.");
    }
  }

  const { error } = await supabase.rpc("review_bank_transfer_payment", {
    p_payment_id: paymentId,
    p_decision: decision,
    p_review_note: reviewNote || null,
  });
  if (error) throw new Error(`Ödeme kararı kaydedilemedi: ${error.message}`);

  // Onaylanan ödeme ayrı veritabanındaki bir ürünün lisansını uzattıysa oraya
  // hemen yansıt; kaçarsa 10 dakikalık eşitleme yakalar.
  if (decision === "approved") {
    const { data: payment } = await supabase.from("organization_payment_requests")
      .select("organization_id, product").eq("id", paymentId).maybeSingle();
    if (payment?.product === "arvolab") await syncArvolabLicense(payment.organization_id);
    if (payment?.product === "arc") await syncArcTenantQuietly(payment.organization_id);
    if (payment?.product === "randevu") await syncRandevuTenantQuietly(payment.organization_id);
  }

  revalidatePath("/panel", "layout");
  revalidatePath("/panel/platform/payments");
  revalidatePath("/panel/platform/licenses");
  revalidatePath("/panel/platform/billing");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function reviewBankTransferPayment(...args: Parameters<typeof reviewBankTransferPayment__impl>) {
  return runPanelAction(() => reviewBankTransferPayment__impl(...args), "Ödeme kararı kaydedildi");
}
