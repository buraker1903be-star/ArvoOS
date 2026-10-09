"use server";

import { flashSuccess, runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { paytrKimligi } from "@/lib/payments/kimlik";
import { createPaytrInstallmentLink, deletePaytrLink, paytrExpiry, toCallbackId } from "@/lib/paytr";
import { resolvePublicHost } from "@/lib/public-host";
import { parseTurkishAmount } from "@/lib/turkish-amount";
import { ODEME_SABLONU, odemeBaglantisiMesaji, odemeTutari, paytrBaglantiParcasi } from "@/lib/odeme-baglantisi";
import { organizationBrandName } from "@/lib/customer-message-templates";
import { postaDurumu } from "@/lib/posta-hesabi";
import { postaYeniGonder } from "@/lib/posta-esitleme";
import { sendThroughGateway } from "@/lib/whatsapp-gateway";
import { loadConversation } from "@/lib/whatsapp-inbox";
import { normalizePhone } from "@/lib/whatsapp-send";
import { belgeGonderimYolu } from "@/lib/belge-gonderim-yolu";
import { arvoKurumuMu } from "@/lib/arvo-kurumu";
import { getWhatsappStatus } from "@/lib/whatsapp-status";

async function accountsContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "accounts"))
    throw new Error("Cari hesap modülüne erişiminiz yok.");
  if (
    !context.isPlatformOwner &&
    !context.izin("finance.cari.yonet")
  )
    throw new Error("Bu işlem için yönetici yetkisi gerekli.");
  assertModuleKeyAccess(context.membership.role, "finance", context.hiddenModuleKeys);
  return context;
}

async function getPartyLedger(partyId: string) {
  const context = await accountsContext();
  const [{ data: party, error }, { data: contracts, error: contractError }] =
    await Promise.all([
      context.supabase
        .from("account_parties")
        .select("id,account_entries(entry_type,amount,source_type,description)")
        .eq("id", partyId)
        .eq("organization_id", context.membership.organization_id)
        .eq("is_active", true)
        .maybeSingle(),
      context.supabase
        .from("crm_contracts")
        .select("amount")
        .eq("party_id", partyId)
        .eq("organization_id", context.membership.organization_id)
        .in("status", ["signed", "completed"]),
    ]);
  if (error || !party) throw new Error("Seçilen müşteri carisi bulunamadı.");
  if (contractError) throw new Error("Sözleşme bakiyesi okunamadı.");
  const entries = party.account_entries ?? [];
  const ledgerDebit = entries
    .filter(
      (entry) =>
        entry.entry_type === "debit" && entry.source_type !== "adjustment",
    )
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const contractDebt = (contracts ?? []).reduce(
    (sum, contract) => sum + Number(contract.amount),
    0,
  );
  const additionalServices = entries
    .filter(
      (entry) =>
        entry.entry_type === "debit" &&
        entry.source_type === "manual" &&
        entry.description?.startsWith("Ek hizmet ·"),
    )
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const debit = contractDebt ? contractDebt + additionalServices : ledgerDebit;
  const recordedCredit = entries
    .filter((entry) => entry.entry_type === "credit")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const refunds = entries
    .filter(
      (entry) =>
        entry.entry_type === "debit" && entry.source_type === "adjustment",
    )
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const credit = Math.min(recordedCredit, debit + refunds);
  return { ...context, debit, credit, refunds };
}

/*
  Cari artık müşteri sayfasında bir pencere (cari-hesap.tsx); işlemden
  sonra o sayfa da yenilenmeli, yoksa pencere eski bakiyeyi gösterir.
  Müşteri sayfasının iki adresi var (finans ve CRM), ikisi de.
*/
function musteriSayfalariniYenile() {
  revalidatePath("/panel/finance/musteri/[id]", "page");
  revalidatePath("/panel/crm/musteri/[id]", "page");
}

function revalidateLedger() {
  musteriSayfalariniYenile();
  revalidatePath("/panel/finance");
  revalidatePath("/panel/hr/commissions");
  revalidatePath("/panel/finance/raporlar");
  revalidatePath("/panel");
}

async function createCollection__impl(formData: FormData) {
  const partyId = String(formData.get("party_id") ?? "").trim();
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
  if (!partyId || !Number.isFinite(amount) || amount <= 0)
    throw new Error("Geçerli bir tahsilat tutarı girin.");
  const { supabase, membership, userId, debit, credit, refunds } =
    await getPartyLedger(partyId);
  // Sayfadaki açık bakiye ile aynı formül (borç + iade − tahsilat). Eskiden
  // iade hesaba katılmadığı için iade sonrası kalan bakiyenin tahsilatı
  // reddediliyordu.
  if (amount > debit + refunds - credit)
    throw new Error("Tahsilat açık cari bakiyesini aşamaz.");
  const { error } = await supabase.from("account_entries").insert({
    organization_id: membership.organization_id,
    party_id: partyId,
    entry_type: "credit",
    amount,
    source_type: "payment",
    reference_no:
      String(formData.get("reference_no") ?? "").trim() ||
      `TAH:${crypto.randomUUID()}`,
    transaction_date:
      String(formData.get("transaction_date") ?? "") ||
      todayInIstanbul(),
    description: String(
      formData.get("description") ?? "Müşteri tahsilatı",
    ).trim(),
    created_by: userId,
  });
  if (error) throw new Error("Tahsilat kaydedilemedi: " + error.message);
  revalidateLedger();
}

async function createRefund__impl(formData: FormData) {
  const partyId = String(formData.get("party_id") ?? "").trim();
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
  if (!partyId || !Number.isFinite(amount) || amount <= 0)
    throw new Error("Geçerli bir iade tutarı girin.");
  const { supabase, membership, userId, credit, refunds } =
    await getPartyLedger(partyId);
  if (amount > credit - refunds)
    throw new Error("İade tutarı net tahsilatı aşamaz.");
  const reason = String(formData.get("description") ?? "").trim();
  if (reason.length < 2 || reason.length > 500)
    throw new Error("İade nedeni 2–500 karakter olmalı.");
  const { error } = await supabase.from("account_entries").insert({
    organization_id: membership.organization_id,
    party_id: partyId,
    entry_type: "debit",
    amount,
    source_type: "adjustment",
    reference_no:
      String(formData.get("reference_no") ?? "").trim() ||
      `IADE:${crypto.randomUUID()}`,
    transaction_date:
      String(formData.get("transaction_date") ?? "") ||
      todayInIstanbul(),
    description: `Müşteri iadesi · ${reason}`,
    created_by: userId,
  });
  if (error) throw new Error("İade kaydedilemedi: " + error.message);
  revalidateLedger();
}

async function createAdditionalService__impl(formData: FormData) {
  const { supabase, membership, userId } = await accountsContext();
  const partyId = String(formData.get("party_id") ?? "").trim();
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
  const description = String(formData.get("description") ?? "").trim();
  if (!partyId || !Number.isFinite(amount) || amount <= 0)
    throw new Error("Geçerli bir ek hizmet tutarı girin.");
  if (description.length < 2 || description.length > 500)
    throw new Error("Ek hizmet açıklaması 2–500 karakter olmalı.");
  const { data: party, error: partyError } = await supabase
    .from("account_parties")
    .select("id")
    .eq("id", partyId)
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true)
    .maybeSingle();
  if (partyError || !party)
    throw new Error("Seçilen müşteri carisi bulunamadı.");
  const { error } = await supabase.from("account_entries").insert({
    organization_id: membership.organization_id,
    party_id: partyId,
    entry_type: "debit",
    amount,
    source_type: "manual",
    reference_no:
      String(formData.get("reference_no") ?? "").trim() ||
      `EKH:${crypto.randomUUID()}`,
    transaction_date:
      String(formData.get("transaction_date") ?? "") ||
      todayInIstanbul(),
    due_date: String(formData.get("due_date") ?? "") || null,
    description: `Ek hizmet · ${description}`,
    created_by: userId,
  });
  if (error) throw new Error("Ek hizmet borcu kaydedilemedi: " + error.message);
  revalidateLedger();
}

export async function createParty(formData: FormData) {
  const { supabase, userId, membership } = await accountsContext();
  const name = String(formData.get("name") ?? "").trim();
  const partyType = String(formData.get("party_type") ?? "customer");
  if (name.length < 2 || name.length > 180)
    throw new Error("Cari adı 2–180 karakter olmalı.");
  if (!["customer", "supplier", "both"].includes(partyType))
    throw new Error("Geçersiz cari türü.");
  const { error } = await supabase.from("account_parties").insert({
    organization_id: membership.organization_id,
    party_type: partyType,
    name,
    tax_number: String(formData.get("tax_number") ?? "").trim() || null,
    tax_office: String(formData.get("tax_office") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    created_by: userId,
  });
  if (error) throw new Error("Cari kart oluşturulamadı: " + error.message);
  await flashSuccess("Cari hesap oluşturuldu");
  revalidatePath("/panel/finance");
  revalidatePath("/panel/accounts");
}

export async function createEntry(formData: FormData) {
  const { supabase, userId, membership } = await accountsContext();
  const partyId = String(formData.get("party_id") ?? "");
  const entryType = String(formData.get("entry_type") ?? "debit");
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
  const description = String(formData.get("description") ?? "").trim();
  if (!["debit", "credit"].includes(entryType))
    throw new Error("Geçersiz hareket türü.");
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Tutar sıfırdan büyük olmalı.");
  if (description.length < 2 || description.length > 500)
    throw new Error("Açıklama 2–500 karakter olmalı.");
  const { data: party, error: partyError } = await supabase
    .from("account_parties")
    .select("id")
    .eq("id", partyId)
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true)
    .maybeSingle();
  if (partyError || !party)
    throw new Error("Seçilen cari bu kuruma ait değil veya pasif.");
  const { error } = await supabase.from("account_entries").insert({
    organization_id: membership.organization_id,
    party_id: partyId,
    entry_type: entryType,
    amount,
    description,
    reference_no: String(formData.get("reference_no") ?? "").trim() || null,
    transaction_date:
      String(formData.get("transaction_date") ?? "") ||
      todayInIstanbul(),
    due_date: String(formData.get("due_date") ?? "") || null,
    created_by: userId,
  });
  if (error) throw new Error("Cari hareket eklenemedi: " + error.message);
  await flashSuccess("Cari hareket kaydedildi");
  revalidatePath("/panel/finance");
  revalidatePath("/panel/accounts");
  revalidatePath("/panel/hr/commissions");
}

export async function updateEntry(formData: FormData) {
  const { supabase, membership } = await accountsContext();
  const entryId = String(formData.get("entry_id") ?? "").trim();
  const entryType = String(formData.get("entry_type") ?? "debit");
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
  const description = String(formData.get("description") ?? "").trim();
  if (!entryId) throw new Error("Hareket seçilmedi.");
  if (!["debit", "credit"].includes(entryType))
    throw new Error("Geçersiz hareket türü.");
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Tutar sıfırdan büyük olmalı.");
  if (description.length < 2 || description.length > 500)
    throw new Error("Açıklama 2–500 karakter olmalı.");
  const { error } = await supabase
    .from("account_entries")
    .update({
      entry_type: entryType,
      amount,
      description,
      reference_no: String(formData.get("reference_no") ?? "").trim() || null,
      transaction_date:
        String(formData.get("transaction_date") ?? "") || undefined,
      due_date: String(formData.get("due_date") ?? "") || null,
    })
    .eq("id", entryId)
    .eq("organization_id", membership.organization_id);
  if (error) throw new Error("Cari hareket güncellenemedi: " + error.message);
  revalidatePath("/panel/finance");
  revalidatePath("/panel/accounts");
  musteriSayfalariniYenile();
  revalidatePath("/panel/hr/commissions");
}

export async function deleteEntry(formData: FormData) {
  const { supabase, membership } = await accountsContext();
  const entryId = String(formData.get("entry_id") ?? "").trim();
  if (!entryId) throw new Error("Hareket seçilmedi.");
  const { error } = await supabase
    .from("account_entries")
    .delete()
    .eq("id", entryId)
    .eq("organization_id", membership.organization_id);
  if (error) throw new Error("Cari hareket silinemedi: " + error.message);
  revalidatePath("/panel/finance");
  revalidatePath("/panel/accounts");
  musteriSayfalariniYenile();
  revalidatePath("/panel/hr/commissions");
}

/*
  CARİ SİLME — ÖNCE BAĞLI MALİ KAYITLARA BAKILIR.

  account_entries carinin peşinden CASCADE ile siliniyor; yani silme
  işlemi hareket dökümünü de götürür. Bu yüzden sözleşmesi, ödeme planı
  ya da eşleşmiş banka hareketi olan cari SİLİNMEZ: bunlar ya yabancı
  anahtarla silmeyi zaten engeller (payment_plans, bank_transactions) ya
  da sessizce öksüz kalır (crm_contracts.party_id'de FK yok, satır
  kalır ama kimi gösterdiği kaybolur). Kullanıcıya "silinemedi" demek
  yerine NEDEN silinemediğini söylüyoruz.
*/
export async function deleteParty(formData: FormData) {
  return runPanelAction(() => deleteParty__impl(formData), "Cari silindi");
}

async function deleteParty__impl(formData: FormData) {
  const { supabase, membership } = await accountsContext();
  const partyId = String(formData.get("party_id") ?? "").trim();
  if (!partyId) throw new Error("Cari seçilmedi.");

  const organizationId = membership.organization_id;
  const { data: party, error: partyError } = await supabase
    .from("account_parties")
    .select("id,name")
    .eq("id", partyId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (partyError) throw new Error("Cari okunamadı: " + partyError.message);
  if (!party) throw new Error("Cari bulunamadı.");

  const [contracts, plans, bank] = await Promise.all([
    supabase
      .from("crm_contracts")
      .select("contract_no")
      .eq("party_id", partyId)
      .eq("organization_id", organizationId)
      .limit(3),
    supabase
      .from("payment_plans")
      .select("id")
      .eq("party_id", partyId)
      .eq("organization_id", organizationId)
      .limit(1),
    supabase
      .from("bank_transactions")
      .select("id")
      .eq("matched_party_id", partyId)
      .eq("organization_id", organizationId)
      .limit(1),
  ]);

  const engeller: string[] = [];
  if (contracts.data?.length)
    engeller.push(`sözleşmesi var (${contracts.data.map((c) => c.contract_no).join(", ")})`);
  if (plans.data?.length) engeller.push("ödeme planı var");
  if (bank.data?.length) engeller.push("eşleşmiş banka hareketi var");
  if (engeller.length)
    throw new Error(
      `${party.name} silinemez: ${engeller.join(", ")}. Mali geçmişi olan cari silinmez; bakiyesi kapandığında arşive düşer.`,
    );

  const { error } = await supabase
    .from("account_parties")
    .delete()
    .eq("id", partyId)
    .eq("organization_id", organizationId);
  if (error) throw new Error("Cari silinemedi: " + error.message);
  revalidateLedger();
  revalidatePath("/panel/accounts");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function createCollection(...args: Parameters<typeof createCollection__impl>) {
  return runPanelAction(() => createCollection__impl(...args), "Tahsilat kaydedildi");
}
export async function createRefund(...args: Parameters<typeof createRefund__impl>) {
  return runPanelAction(() => createRefund__impl(...args), "İade kaydedildi");
}
export async function createAdditionalService(...args: Parameters<typeof createAdditionalService__impl>) {
  return runPanelAction(() => createAdditionalService__impl(...args), "Ek hizmet eklendi");
}

/*
  CARİ ÖDEME BAĞLANTISI (2026-10).

  Müşteri ödeyeceği tutarı söylüyor, tutar girilince PayTR bağlantısı
  oluşuyor ve istenirse aynı adımda WhatsApp ya da e-postayla gidiyor.
  Eskiden bağlantı yalnızca bir taksite açılabiliyordu (Finans → PAYTR
  Tahsilatları, kaldırıldı) ve müşteriye wa.me/mailto ile personelin kendi
  hesabından gidiyordu; gönderildi mi bilinmiyordu.

  payment_links'e kullanıcının yazma yetkisi yok (RLS politikası yok); kayıt
  service_role ile. Yetki burada: accountsContext (finance.cari.yonet) ve
  carinin bu kuruma ait olduğu (getPartyLedger, kullanıcının kendi RLS'iyle).
  Ödeme gelince arvo_record_paytr_payment tutarı cariye tahsilat yazar.
*/
async function odemeBaglantisiBaglami() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı olmadığı için PayTR kullanılamıyor.");
  if (!paymentCredentialsConfigured()) throw new Error("PAYMENT_CREDENTIALS_KEY tanımlı değil; PayTR bilgileri güvenle saklanamıyor.");
  return admin;
}

async function createPaymentLink__impl(formData: FormData) {
  const partyId = String(formData.get("party_id") ?? "").trim();
  const tutar = Math.round(parseTurkishAmount(String(formData.get("amount") ?? "")) * 100);
  if (!partyId || !Number.isFinite(tutar) || tutar <= 0) throw new Error("Geçerli bir tutar girin.");
  const aciklama = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  const { supabase, membership, userId, debit, credit, refunds } = await getPartyLedger(partyId);
  // Elle tahsilatla aynı kural: cari bakiyesini aşan ödeme alınmaz.
  const acik = debit + refunds - credit;
  if (tutar > acik) throw new Error(`Tutar açık bakiyeyi (${odemeTutari(Math.max(0, acik))}) aşamaz.`);

  const admin = await odemeBaglantisiBaglami();
  const credentials = await paytrKimligi(admin, membership.organization_id);
  const { data: party } = await supabase.from("account_parties").select("name").eq("id", partyId).eq("organization_id", membership.organization_id).maybeSingle();

  const id = randomUUID();
  // Bildirim adresi kurumun kalıcı alan adı: bağlantı haftalarca açık kalabiliyor
  // ve PayTR mağazasının kayıtlı sitesiyle aynı alan adı olmalı.
  const host = await resolvePublicHost(supabase, membership.organization_id);
  const expiry = paytrExpiry(null);
  const link = await createPaytrInstallmentLink(credentials, {
    name: `${party?.name ?? "Cari"} · ${aciklama ?? "Ödeme"}`,
    amountKurus: tutar,
    expiry,
    callbackUrl: `https://${host}/api/paytr/callback`,
    callbackId: toCallbackId(id),
  });

  const { error } = await admin.from("payment_links").insert({
    id, organization_id: membership.organization_id, purpose: "account", party_id: partyId, note: aciklama,
    provider_link_id: link.id, url: link.url, amount: tutar, expires_at: expiry, created_by: userId,
  });
  if (error) {
    try { await deletePaytrLink(credentials, link.id); } catch { /* en iyi çaba */ }
    throw new Error("Ödeme bağlantısı kaydedilemedi: " + error.message);
  }
  musteriSayfalariniYenile();
  revalidatePath("/panel/finance");

  const kanal = String(formData.get("gonder") ?? "");
  if (kanal === "whatsapp" || kanal === "eposta") {
    // Bağlantı oluştu; gönderim düşerse bunu söyleyelim ki ikinci bağlantı açılmasın.
    try {
      await odemeBaglantisiniGonder(id, kanal);
    } catch (hata) {
      throw new Error(`Bağlantı oluşturuldu ama gönderilemedi: ${hata instanceof Error ? hata.message : "bilinmeyen hata"} Listeden yeniden gönderebilir ya da kopyalayabilirsiniz.`);
    }
    return kanal === "whatsapp" ? "Ödeme bağlantısı oluşturuldu ve WhatsApp'tan gönderildi" : "Ödeme bağlantısı oluşturuldu ve e-postayla gönderildi";
  }
  return "Ödeme bağlantısı oluşturuldu";
}

/*
  Bağlantıyı müşteriye gönderir. ALICI ekrandan gelmiyor, caride kayıtlı
  telefon/e-postadan okunuyor (crm/whatsapp-gonder.ts ile aynı gerekçe:
  ekranı değiştirebilen biri mesajı istediği numaraya yollamasın).
*/
async function odemeBaglantisiniGonder(linkId: string, kanal: "whatsapp" | "eposta") {
  const context = await accountsContext();
  const { supabase, membership, organization } = context;
  const admin = await odemeBaglantisiBaglami();
  const { data: link } = await admin.from("payment_links").select("id,party_id,url,amount,note,status")
    .eq("id", linkId).eq("organization_id", membership.organization_id).eq("purpose", "account").maybeSingle();
  if (!link?.party_id) throw new Error("Ödeme bağlantısı bulunamadı.");
  if (link.status !== "active") throw new Error(link.status === "paid" ? "Bu bağlantı zaten ödendi." : "Bu bağlantı iptal edilmiş.");
  // Cari kullanıcının kendi RLS'iyle okunuyor: görmediği cariye gönderemesin.
  const { data: party } = await supabase.from("account_parties").select("name,phone,email")
    .eq("id", link.party_id).eq("organization_id", membership.organization_id).maybeSingle();
  if (!party) throw new Error("Cari bulunamadı.");

  const kurum = organizationBrandName({ slug: organization.slug, displayName: organization.display_name, legalName: organization.name });
  const { konu, metin } = odemeBaglantisiMesaji({ kurum, musteri: party.name, tutarKurus: Number(link.amount), aciklama: link.note, url: link.url });

  if (kanal === "eposta") {
    const adres = String(party.email ?? "").trim();
    if (!adres) throw new Error("Carinin e-posta adresi kayıtlı değil.");
    const hesap = await postaDurumu(membership.organization_id);
    if (hesap.durum !== "bagli" || !hesap.adres) throw new Error("Ortak posta kutusu bağlı değil (Ayarlar → Entegrasyonlar).");
    const sonuc = await postaYeniGonder({
      organizationId: membership.organization_id,
      kutuAdresi: hesap.adres,
      gonderenAd: organization.display_name || organization.name,
      alicilar: [adres],
      konu,
      govde: metin,
    });
    if ("hata" in sonuc) throw new Error(sonuc.hata);
    return;
  }

  const telefon = normalizePhone(String(party.phone ?? ""));
  if (!telefon) throw new Error("Carinin cep telefonu kayıtlı değil ya da biçimi tanınmıyor (05XX XXX XX XX).");
  const durum = await getWhatsappStatus(membership.organization_id);
  const yol = belgeGonderimYolu({
    kendiNumarasiBagli: durum.connected && durum.status !== "disabled",
    arvoKurumu: await arvoKurumuMu(supabase, membership.organization_id),
  });
  if (yol !== "panel") {
    throw new Error("Panelden göndermek için kendi WhatsApp Business numaranızı bağlayın (Ayarlar → Entegrasyonlar). O zamana kadar bağlantıyı kopyalayıp gönderebilirsiniz.");
  }

  // Serbest metin yalnızca müşterinin son mesajından sonraki 24 saatte; değilse onaylı şablon.
  const { windowOpen } = await loadConversation(membership.organization_id, telefon);
  const mesaj: Parameters<typeof sendThroughGateway>[0]["messages"][number] = { to: telefon, ref: link.id };
  if (windowOpen) {
    mesaj.text = metin;
  } else {
    const parca = paytrBaglantiParcasi(link.url);
    if (!parca) throw new Error("PayTR bağlantısının biçimi tanınmadı; bağlantıyı kopyalayıp gönderin.");
    mesaj.template = ODEME_SABLONU;
    mesaj.params = { musteri: party.name || "Yetkili", kurum, tutar: odemeTutari(Number(link.amount)) };
    mesaj.urlButtonParam = parca;
    mesaj.body = `${odemeTutari(Number(link.amount))} tutarında ödeme bağlantısı gönderildi. (onaylı şablon)`;
  }
  const sonuc = await sendThroughGateway({ product: "arvoos", organizationId: membership.organization_id, sender: "organization", messages: [mesaj] });
  const ilk = sonuc.results[0];
  if (!ilk?.sent) {
    const sebep = ilk?.error ?? "Mesaj gönderilemedi.";
    throw new Error(windowOpen ? sebep : `${sebep} (Şablon: ${ODEME_SABLONU})`);
  }
}

async function sendPaymentLink__impl(formData: FormData) {
  const kanal = String(formData.get("kanal") ?? "");
  if (kanal !== "whatsapp" && kanal !== "eposta") throw new Error("Gönderim yolu seçilmedi.");
  await odemeBaglantisiniGonder(String(formData.get("link_id") ?? "").trim(), kanal);
  await flashSuccess(kanal === "whatsapp" ? "Ödeme bağlantısı WhatsApp'tan gönderildi" : "Ödeme bağlantısı e-postayla gönderildi");
}

async function cancelPaymentLink__impl(formData: FormData) {
  const { membership } = await accountsContext();
  const admin = await odemeBaglantisiBaglami();
  const linkId = String(formData.get("link_id") ?? "").trim();
  const { data: link } = await admin.from("payment_links").select("id,party_id,provider_link_id,status")
    .eq("id", linkId).eq("organization_id", membership.organization_id).eq("purpose", "account").maybeSingle();
  if (!link) throw new Error("Ödeme bağlantısı bulunamadı.");
  if (link.status !== "active") throw new Error("Bu bağlantı zaten kapalı.");
  try {
    await deletePaytrLink(await paytrKimligi(admin, membership.organization_id), link.provider_link_id);
  } catch {
    // PayTR'de süresi dolmuş/kapanmış olabilir; bizde yine iptal edilir.
  }
  const { error } = await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", link.id).eq("status", "active");
  if (error) throw new Error("Bağlantı iptal edilemedi: " + error.message);
  musteriSayfalariniYenile();
}

export async function createPaymentLink(formData: FormData) {
  // Başarı mesajı gönderim yoluna göre değiştiği için işlem kendisi döndürüyor.
  const mesaj = await runPanelAction(() => createPaymentLink__impl(formData));
  if (mesaj) await flashSuccess(mesaj);
}
export async function sendPaymentLink(formData: FormData) {
  await runPanelAction(() => sendPaymentLink__impl(formData));
}
export async function cancelPaymentLink(formData: FormData) {
  await runPanelAction(() => cancelPaymentLink__impl(formData), "Ödeme bağlantısı iptal edildi");
}
