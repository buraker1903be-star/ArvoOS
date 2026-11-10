"use server";

import { konsolAlaniniDogrula } from "../konsol-alani";
import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { syncArvolabLicense } from "@/lib/arvolab";
import { syncArcTenantQuietly } from "@/lib/arc-bridge";
import { syncRandevuTenantQuietly } from "@/lib/randevu-bridge";
import { havaleDenetimleri } from "@/lib/beklenen-odeme";

async function reviewBankTransferPayment__impl(formData: FormData) {
  const { supabase, isPlatformOwner, konsolKapsami } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");
  konsolAlaniniDogrula(konsolKapsami, "finans");

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
  if (error) throw new Error(odemeHatasi("Ödeme kararı kaydedilemedi", error.message));

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
  revalidatePath("/panel/platform/musteriler", "layout");
  revalidatePath("/panel/platform/billing");
}

/*
  Lisans kaydı yokken ödeme (10.11.2026, 20261110063102). Eskiden onay
  lisans satırı olmayan kurumda da "kaydedildi" diyordu: bildirim onaylı
  görünüyor, lisans hiç açılmıyordu. Artık veritabanı 'license_missing'
  fırlatıp onayı geri alıyor; ham kodu kurucunun okuyacağı cümleye
  çeviriyoruz — ödeme bekliyor kaldığı için lisans oluşturulunca aynı
  bildirim yeniden onaylanabilir.
*/
function odemeHatasi(baslik: string, mesaj: string): string {
  if (mesaj.includes("license_missing")) {
    return "Kurumun ArvoOS lisans kaydı yok; ödeme lisansa uygulanamadı ve bekliyor durumunda kaldı. Platform → Lisanslar'dan lisansı (paket, ücret, kullanıcı limiti) oluşturup yeniden onaylayın.";
  }
  return `${baslik}: ${mesaj}`;
}

/*
  İşlenemeyen PayTR bildirimini yeniden işleme. Yalnızca 'no_license'
  sonuçlu olay için: kurucu lisansı oluşturduktan sonra aynı bildirimi
  kayıt işlevinden yeniden geçirir. Tekrar uygulanmasını veritabanı
  engelliyor (işlev yalnızca 'no_license' olayı kabul ediyor, merchant_oid
  tekil) — burada ikinci bir koruma yazmıyoruz.
*/
async function reprocessPaytrEvent__impl(formData: FormData) {
  const { supabase, isPlatformOwner, konsolKapsami } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");
  konsolAlaniniDogrula(konsolKapsami, "finans");

  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) throw new Error("Bildirim seçilmedi.");

  const { data, error } = await supabase.rpc("arvo_reprocess_paytr_event", { p_event_id: eventId });
  if (error) {
    if (error.message.includes("event_not_reprocessable")) throw new Error("Bu bildirim yeniden işlenemez; zaten işlenmiş ya da başka bir sebeple düşmüş.");
    if (error.message.includes("event_not_found")) throw new Error("Bildirim bulunamadı; sayfayı yenileyin.");
    throw new Error(`Bildirim yeniden işlenemedi: ${error.message}`);
  }

  revalidatePath("/panel", "layout");
  revalidatePath("/panel/platform/payments");
  revalidatePath("/panel/platform/saglik");
  revalidatePath("/panel/platform/musteriler", "layout");
  revalidatePath("/panel/platform/billing");

  if (data === "no_license") throw new Error("Kurumun ArvoOS lisans kaydı hâlâ yok; önce Platform → Lisanslar'dan lisansı oluşturun. Bildirim listede kaldı.");
  if (data !== "recorded") throw new Error(`Bildirim yeniden işlendi ama kaydedilemedi (sonuç: ${String(data)}). Listede yeni sebebiyle görünüyor.`);
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function reviewBankTransferPayment(...args: Parameters<typeof reviewBankTransferPayment__impl>) {
  return runPanelAction(() => reviewBankTransferPayment__impl(...args), "Ödeme kararı kaydedildi");
}

export async function reprocessPaytrEvent(...args: Parameters<typeof reprocessPaytrEvent__impl>) {
  return runPanelAction(() => reprocessPaytrEvent__impl(...args), "Ödeme lisansa uygulandı");
}
