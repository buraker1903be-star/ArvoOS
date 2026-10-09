"use server";

import { flashSuccess, runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { assertYetki } from "@/lib/yetkiler";
import { gecerliGun, gunFarki, gunKaydir } from "@/lib/taksit-vadesi";
import { tutarDegistir, yenidenBol, type PlanTaksidi } from "@/lib/taksit-plani";
import { netTahsilat, taksitleriDagit } from "@/lib/taksit-dagitimi";
import { parseTurkishAmount } from "@/lib/turkish-amount";

const types = new Set(["income", "expense"]);
const statuses = new Set(["planned", "paid", "canceled"]);
const invoiceStatuses = new Set(["draft", "open", "paid", "void"]);

async function financeContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "finance")) throw new Error("Finans modülüne erişiminiz yok.");
  if (!context.isPlatformOwner) assertYetki(context.yetkiler, "finance.kayit.yonet");
  assertModuleKeyAccess(context.membership.role, "finance", context.hiddenModuleKeys);
  return context;
}

async function syncContractCostSummary(supabase: Awaited<ReturnType<typeof financeContext>>["supabase"], organizationId: string, userId: string, contractId: string) {
  const [{ data: contract }, { data: items }] = await Promise.all([
    supabase.from("crm_contracts").select("id,contract_no,title,service_cost_transaction_id").eq("id",contractId).eq("organization_id",organizationId).maybeSingle(),
    supabase.from("contract_cost_items").select("amount,status").eq("contract_id",contractId).eq("organization_id",organizationId),
  ]);
  if(!contract) throw new Error("Sözleşme bulunamadı.");
  const total=(items??[]).reduce((sum,item)=>sum+Number(item.amount),0);
  const paid=(items??[]).filter(item=>item.status==="paid").reduce((sum,item)=>sum+Number(item.amount),0);
  let transactionId=contract.service_cost_transaction_id as string|null;
  if(total===0&&transactionId){await supabase.from("finance_transactions").delete().eq("id",transactionId).eq("organization_id",organizationId);transactionId=null}
  else if(total>0){const payload={organization_id:organizationId,transaction_type:"expense",status:paid>0?"paid":"planned",title:`${contract.contract_no} hizmet maliyeti`,category:"Hizmet maliyeti",amount:paid||total,currency:"TRY",paid_at:paid>0?new Date().toISOString():null,notes:contract.title};if(transactionId){await supabase.from("finance_transactions").update(payload).eq("id",transactionId).eq("organization_id",organizationId)}else{const {data:transaction,error}=await supabase.from("finance_transactions").insert({...payload,created_by:userId}).select("id").single();if(error)throw new Error("Finans gideri oluşturulamadı: "+error.message);transactionId=transaction.id}}
  const {error}=await supabase.from("crm_contracts").update({service_cost:total,service_cost_status:total>0&&(items??[]).every(item=>item.status==="paid")?"paid":"planned",service_cost_transaction_id:transactionId}).eq("id",contractId).eq("organization_id",organizationId);
  if(error)throw new Error("Maliyet özeti güncellenemedi: "+error.message);
}

async function addContractCostItem__impl(formData:FormData){const {supabase,membership,userId}=await financeContext();const contractId=String(formData.get("contract_id")??"");const category=String(formData.get("category")??"").trim();const description=String(formData.get("description")??"").trim();const supplier=String(formData.get("supplier")??"").trim();const reference=String(formData.get("reference_no")??"").trim();const costDate=String(formData.get("cost_date")??"")||todayInIstanbul();const status=String(formData.get("status")??"planned");const amount=Math.round(Number(formData.get("amount")??0)*100);if(!contractId||description.length<2||!Number.isFinite(amount)||amount<=0)throw new Error("Maliyet kalemi bilgileri eksik.");if(!new Set(["planned","paid"]).has(status))throw new Error("Maliyet durumu geçersiz.");const {data:contract}=await supabase.from("crm_contracts").select("id").eq("id",contractId).eq("organization_id",membership.organization_id).maybeSingle();if(!contract)throw new Error("Sözleşme bulunamadı.");const {error}=await supabase.from("contract_cost_items").insert({organization_id:membership.organization_id,contract_id:contractId,category:category||"Dış hizmet",description,supplier:supplier||null,amount,cost_date:costDate,status,reference_no:reference||null,created_by:userId});if(error)throw new Error("Maliyet kalemi eklenemedi: "+error.message);await syncContractCostSummary(supabase,membership.organization_id,userId,contractId);revalidatePath(`/panel/finance/costs/${contractId}`);revalidatePath("/panel/finance");revalidatePath("/panel/reporting")}

async function deleteContractCostItem__impl(formData:FormData){const {supabase,membership,userId}=await financeContext();const itemId=String(formData.get("item_id")??"");const contractId=String(formData.get("contract_id")??"");if(!itemId||!contractId)throw new Error("Maliyet kalemi seçilemedi.");const {error}=await supabase.from("contract_cost_items").delete().eq("id",itemId).eq("contract_id",contractId).eq("organization_id",membership.organization_id);if(error)throw new Error("Maliyet kalemi silinemedi: "+error.message);await syncContractCostSummary(supabase,membership.organization_id,userId,contractId);revalidatePath(`/panel/finance/costs/${contractId}`);revalidatePath("/panel/finance");revalidatePath("/panel/reporting")}

async function updateContractCostItem__impl(formData:FormData){const {supabase,membership,userId}=await financeContext();const itemId=String(formData.get("item_id")??"");const contractId=String(formData.get("contract_id")??"");const category=String(formData.get("category")??"").trim();const description=String(formData.get("description")??"").trim();const supplier=String(formData.get("supplier")??"").trim();const reference=String(formData.get("reference_no")??"").trim();const costDate=String(formData.get("cost_date")??"");const status=String(formData.get("status")??"planned");const amount=Math.round(Number(formData.get("amount")??0)*100);if(!itemId||!contractId||description.length<2||!costDate||!Number.isFinite(amount)||amount<=0)throw new Error("Maliyet kalemi bilgileri eksik.");if(!new Set(["planned","paid"]).has(status))throw new Error("Maliyet durumu geçersiz.");const {error}=await supabase.from("contract_cost_items").update({category:category||"Dış hizmet",description,supplier:supplier||null,amount,cost_date:costDate,status,reference_no:reference||null,updated_at:new Date().toISOString()}).eq("id",itemId).eq("contract_id",contractId).eq("organization_id",membership.organization_id);if(error)throw new Error("Maliyet kalemi güncellenemedi: "+error.message);await syncContractCostSummary(supabase,membership.organization_id,userId,contractId);revalidatePath(`/panel/finance/costs/${contractId}`);revalidatePath("/panel/finance");revalidatePath("/panel/reporting")}

export async function createFinanceTransaction(formData: FormData) {
  const { supabase, userId, membership } = await financeContext();
  const transactionType = String(formData.get("transaction_type") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const partyId = String(formData.get("party_id") ?? "").trim() || null;
  const freeCounterparty = String(formData.get("counterparty") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);

  if (!types.has(transactionType)) throw new Error("Geçersiz işlem türü.");
  if (title.length < 2 || title.length > 180) throw new Error("İşlem başlığı 2–180 karakter olmalı.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Tutar sıfırdan büyük olmalı.");

  let counterparty = freeCounterparty || null;
  if (partyId) {
    const { data: party, error: partyError } = await supabase.from("account_parties").select("id,name").eq("id", partyId).eq("organization_id", membership.organization_id).maybeSingle();
    if (partyError || !party) throw new Error("Seçilen cari bulunamadı.");
    counterparty = party.name;
  }

  const { error } = await supabase.from("finance_transactions").insert({
    organization_id: membership.organization_id,
    transaction_type: transactionType,
    status: "planned",
    title,
    counterparty: counterparty || null,
    party_id: partyId,
    category: category || null,
    amount,
    due_date: dueDate,
    notes: notes || null,
    created_by: userId,
  });
  if (error) throw new Error("Finans kaydı oluşturulamadı: " + error.message);

  if (partyId) {
    const { error: entryError } = await supabase.from("account_entries").insert({
      organization_id: membership.organization_id,
      party_id: partyId,
      entry_type: transactionType === "income" ? "debit" : "credit",
      source_type: "manual",
      amount,
      description: title,
      transaction_date: todayInIstanbul(),
      due_date: dueDate,
      created_by: userId,
    });
    if (entryError) throw new Error("Finans kaydı oluşturuldu ama cari hareketi eklenemedi: " + entryError.message);
  }

  await flashSuccess("Finans kaydı eklendi");
  revalidatePath("/panel/finance");
  revalidatePath("/panel");
}

export async function updateFinanceTransactionStatus(formData: FormData) {
  const { supabase, membership, userId } = await financeContext();
  const transactionId = String(formData.get("transaction_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!statuses.has(status)) throw new Error("Geçersiz finans durumu.");

  const { data: transaction, error: fetchError } = await supabase.from("finance_transactions")
    .select("id,title,amount,notes,party_id,transaction_type,status")
    .eq("id", transactionId).eq("organization_id", membership.organization_id).maybeSingle();
  if (fetchError || !transaction) throw new Error("Finans kaydı bulunamadı.");
  const alreadyPaid = transaction.status === "paid";

  const { error } = await supabase.from("finance_transactions").update({
    status,
    paid_at: status === "paid" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", transactionId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Finans kaydı güncellenemedi: " + error.message);

  // Tek yerden tamamlama: "Ödendi" işaretlenince bağlı cari bakiyesi,
  // (varsa) sözleşme faturası ve ödeme planındaki taksitler de otomatik
  // kapatılır — ayrı ayrı güncelleme gerekmez, Prim Raporu da anında
  // güncel tahsilat verisini görür.
  if (status === "paid" && !alreadyPaid) {
    let partyId = transaction.party_id as string | null;
    const contractNo = transaction.notes?.match(/Sözleşme\s+(SOZ-[A-Z0-9-]+)/i)?.[1]?.toUpperCase() ?? null;

    if (contractNo) {
      const { data: contract } = await supabase.from("crm_contracts").select("id,party_id,invoice_id").eq("organization_id", membership.organization_id).ilike("contract_no", contractNo).maybeSingle();
      if (!partyId && contract?.party_id) partyId = contract.party_id;
      // Fatura yalnızca tahsil edilen tutar faturanın tamamını karşılıyorsa
      // kapanır. Kısmi tahsilat faturayı "ödendi" yapmaz.
      if (contract?.invoice_id) {
        const { data: invoice, error: invoiceReadError } = await supabase.from("billing_invoices").select("id,total").eq("id", contract.invoice_id).eq("organization_id", membership.organization_id).maybeSingle();
        if (invoiceReadError) throw new Error("Sözleşmenin faturası okunamadı: " + invoiceReadError.message);
        if (invoice && Number(transaction.amount) >= Number(invoice.total)) {
          const { error: invoiceError } = await supabase.from("billing_invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoice.id).eq("organization_id", membership.organization_id);
          if (invoiceError) throw new Error("Fatura ödendi olarak işaretlenemedi: " + invoiceError.message);
        }
      }
      // Taksitler burada KAPATILMAZ. Aşağıdaki cari alacak kaydı
      // private.arvo_reconcile_party_installments'ı tetikliyor; o fonksiyon
      // parayı biriktirip taksidi ancak tutarı karşılandığında kapatıyor.
      // Buradaki döngü tutarı düşmeden önce kapattığı için 100 TL'lik bir
      // tahsilat 50.000 TL'lik taksidi kapatıyordu.
    }

    if (partyId) {
      const referenceNo = `FIN:${transactionId}`;
      const { data: existingEntry } = await supabase.from("account_entries").select("id").eq("organization_id", membership.organization_id).eq("reference_no", referenceNo).maybeSingle();
      if (!existingEntry) {
        const { error: entryError } = await supabase.from("account_entries").insert({
          organization_id: membership.organization_id,
          party_id: partyId,
          entry_type: transaction.transaction_type === "income" ? "credit" : "debit",
          source_type: "payment",
          amount: transaction.amount,
          description: transaction.transaction_type === "income" ? `${transaction.title} tahsil edildi` : `${transaction.title} ödendi`,
          reference_no: referenceNo,
          transaction_date: todayInIstanbul(),
          created_by: userId,
        });
        if (entryError) throw new Error("Ödeme işaretlendi ama cari bakiyesi güncellenemedi: " + entryError.message);
      }
    }
  }
  if (status !== "paid" && alreadyPaid) await supabase.from("account_entries").delete().eq("organization_id", membership.organization_id).eq("reference_no", `FIN:${transactionId}`);

  revalidatePath("/panel/finance");
  revalidatePath("/panel/finance/raporlar");
  revalidatePath("/panel/hr/commissions");
  revalidatePath("/panel");
}

export async function collectPaymentInstallment(formData: FormData) {
  const { supabase } = await financeContext();
  const installmentId = String(formData.get("installment_id") ?? "").trim();
  if (!installmentId) throw new Error("Taksit seçilemedi.");
  const { error } = await supabase.rpc("collect_payment_installment", { target_installment_id: installmentId });
  if (error) throw new Error("Tahsilat kaydedilemedi: " + error.message);
  await flashSuccess("Tahsilat kaydedildi");
  revalidatePath("/panel/finance");
  revalidatePath("/panel/finance/payment-plans");
  revalidatePath("/panel/finance/accounts");
  revalidatePath("/panel/finance/invoices");
  revalidatePath("/panel/finance/raporlar");
  revalidatePath("/panel/hr/commissions");
  revalidatePath("/panel");
}

export async function rebuildPaymentPlan(formData: FormData) {
  const { supabase } = await financeContext();
  const planId = String(formData.get("plan_id") ?? "").trim();
  const installmentCount = Number(formData.get("installment_count") ?? 0);
  const firstDueDate = String(formData.get("first_due_date") ?? "").trim();
  const intervalMonths = Number(formData.get("interval_months") ?? 1);

  if (!planId) throw new Error("Ödeme planı seçilemedi.");
  if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 36) throw new Error("Taksit sayısı 1–36 arasında olmalı.");
  if (!firstDueDate) throw new Error("İlk vade tarihi zorunludur.");
  if (!Number.isInteger(intervalMonths) || intervalMonths < 1 || intervalMonths > 12) throw new Error("Taksit aralığı 1–12 ay arasında olmalı.");

  const { error } = await supabase.rpc("rebuild_payment_plan_installments", {
    p_plan_id: planId,
    p_installment_count: installmentCount,
    p_first_due_date: firstDueDate,
    p_interval_months: intervalMonths,
  });
  if (error) {
    if (error.message.includes("payment_plan_has_paid_installments")) throw new Error("Tahsil edilmiş taksiti bulunan ödeme planı değiştirilemez.");
    throw new Error("Ödeme planı güncellenemedi: " + error.message);
  }
  revalidatePath("/panel/finance/payment-plans");
  revalidatePath("/panel/finance");
  revalidatePath("/panel");
}

export async function saveContractServiceCost(formData: FormData) {
  const { supabase, membership, userId } = await financeContext();
  const contractId = String(formData.get("contract_id") ?? "").trim();
  const supplier = String(formData.get("supplier") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const status = String(formData.get("cost_status") ?? "planned");
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
  if (!contractId || !Number.isFinite(amount) || amount < 0) throw new Error("Geçerli bir maliyet girin.");
  if (!new Set(["planned", "paid"]).has(status)) throw new Error("Maliyet durumu geçersiz.");
  const { data: contract, error: contractError } = await supabase.from("crm_contracts")
    .select("id,contract_no,title,service_cost_transaction_id")
    .eq("id", contractId).eq("organization_id", membership.organization_id).maybeSingle();
  if (contractError || !contract) throw new Error("Sözleşme bulunamadı.");
  let transactionId = contract.service_cost_transaction_id as string | null;
  const transactionPayload = {
    organization_id: membership.organization_id, transaction_type: "expense", status,
    title: `${contract.contract_no} hizmet maliyeti`, counterparty: supplier || null,
    category: "Hizmet maliyeti", amount, currency: "TRY",
    paid_at: status === "paid" ? new Date().toISOString() : null,
    notes: [contract.title, reference ? `Belge: ${reference}` : ""].filter(Boolean).join(" · "),
  };
  if (amount > 0 && transactionId) {
    const { error } = await supabase.from("finance_transactions").update(transactionPayload)
      .eq("id", transactionId).eq("organization_id", membership.organization_id);
    if (error) throw new Error("Maliyet gideri güncellenemedi: " + error.message);
  } else if (amount > 0) {
    const { data: transaction, error } = await supabase.from("finance_transactions")
      .insert({ ...transactionPayload, created_by: userId }).select("id").single();
    if (error) throw new Error("Maliyet gideri oluşturulamadı: " + error.message);
    transactionId = transaction.id;
  } else if (transactionId) {
    await supabase.from("finance_transactions").delete().eq("id", transactionId).eq("organization_id", membership.organization_id);
    transactionId = null;
  }
  const { error } = await supabase.from("crm_contracts").update({
    service_cost: amount, service_cost_supplier: supplier || null,
    service_cost_reference: reference || null, service_cost_status: status,
    service_cost_transaction_id: transactionId,
  }).eq("id", contractId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Sözleşme maliyeti kaydedilemedi: " + error.message);
  await flashSuccess("Sözleşme maliyeti kaydedildi");
  revalidatePath(`/panel/crm/contracts/${contractId}`);
  revalidatePath("/panel/finance");
  revalidatePath("/panel/finance/raporlar");
}

export async function updateInvoiceStatus(formData: FormData) {
  const { supabase, membership, userId } = await financeContext();
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!invoiceId) throw new Error("Fatura seçilemedi.");
  if (!invoiceStatuses.has(status)) throw new Error("Geçersiz fatura durumu.");

  const { data: invoice, error: invoiceError } = await supabase.from("billing_invoices").select("id,status,total").eq("id", invoiceId).eq("organization_id", membership.organization_id).maybeSingle();
  if (invoiceError || !invoice) throw new Error("Fatura bulunamadı.");
  const { data: contract } = await supabase.from("crm_contracts").select("id,party_id,contract_no").eq("organization_id", membership.organization_id).eq("invoice_id", invoiceId).maybeSingle();
  const { error } = await supabase.from("billing_invoices").update({
    status,
    paid_at: status === "paid" ? new Date().toISOString() : null,
  }).eq("id", invoiceId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Fatura durumu güncellenemedi: " + error.message);
  const referenceNo = `INV:${invoiceId}`;
  if (status === "paid" && invoice.status !== "paid" && contract?.party_id) {
    const { data: existingEntry } = await supabase.from("account_entries").select("id").eq("organization_id", membership.organization_id).eq("reference_no", referenceNo).maybeSingle();
    if (!existingEntry) {
      const [{ data: partyContracts, error: contractsError }, { data: partyEntries, error: entriesError }] = await Promise.all([
        supabase.from("crm_contracts").select("amount").eq("organization_id", membership.organization_id).eq("party_id", contract.party_id).in("status", ["signed", "completed"]),
        supabase.from("account_entries").select("entry_type,amount").eq("organization_id", membership.organization_id).eq("party_id", contract.party_id),
      ]);
      if (contractsError || entriesError) throw new Error("Cari bakiye doğrulanamadı.");

      const contractTotal = (partyContracts ?? []).reduce((sum, item) => sum + Number(item.amount), 0);
      const debitTotal = (partyEntries ?? []).filter((item) => item.entry_type === "debit").reduce((sum, item) => sum + Number(item.amount), 0);
      const creditTotal = (partyEntries ?? []).filter((item) => item.entry_type === "credit").reduce((sum, item) => sum + Number(item.amount), 0);
      const outstanding = Math.max(0, Math.max(contractTotal, debitTotal) - creditTotal);
      const collectionAmount = Math.min(Number(invoice.total), outstanding);

      if (collectionAmount > 0) {
        const { error: entryError } = await supabase.from("account_entries").insert({ organization_id: membership.organization_id, party_id: contract.party_id, entry_type: "credit", source_type: "payment", amount: collectionAmount, description: `${contract.contract_no} fatura tahsilatı`, reference_no: referenceNo, transaction_date: todayInIstanbul(), created_by: userId });
        if (entryError) throw new Error("Fatura güncellendi ancak cari tahsilat işlenemedi: " + entryError.message);
      }
    }
    // Taksitler ve planın tamamlanması burada elle yapılmaz: yukarıdaki
    // cari alacak kaydı private.arvo_reconcile_party_installments'ı
    // tetikliyor ve taksitleri tahsil edilen tutar kadar kapatıyor.
    // Buradaki koşulsuz güncelleme, cari hareketi 0 TL olsa bile (satır
    // 334'teki min() sıfır verebiliyor) planın bütün taksitlerini kapatıyordu.
  }
  if (status !== "paid" && invoice.status === "paid") await supabase.from("account_entries").delete().eq("organization_id", membership.organization_id).eq("reference_no", referenceNo);
  revalidatePath("/panel/finance");
  revalidatePath("/panel/finance/invoices");
  revalidatePath("/panel/hr/commissions");
  revalidatePath("/panel/finance/raporlar");
  revalidatePath("/panel");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function addContractCostItem(...args: Parameters<typeof addContractCostItem__impl>) {
  return runPanelAction(() => addContractCostItem__impl(...args), "Maliyet kalemi eklendi");
}
export async function deleteContractCostItem(...args: Parameters<typeof deleteContractCostItem__impl>) {
  return runPanelAction(() => deleteContractCostItem__impl(...args));
}
export async function updateContractCostItem(...args: Parameters<typeof updateContractCostItem__impl>) {
  return runPanelAction(() => updateContractCostItem__impl(...args), "Maliyet kalemi güncellendi");
}

/*
  TAKSİT PLANI (2026-10): cari penceresinin ödeme takviminden
    - bir taksitin VADESİ ve TUTARI (fark sonraki taksitlere gider),
    - planın TAKSİT SEÇENEĞİ (adet, ilk vade, aralık; ödenmiş kısım korunur)
  değiştirilir. Yeni planı lib/taksit-plani.ts hesaplıyor; yazma
  arvo_taksitleri_kaydet ile (toplam sözleşme tutarına eşit mi, yetki,
  ödenmiş/bağlantılı taksit silinmesin — veritabanında denetleniyor).
  Eskiden yalnızca plan baştan kurulabiliyordu ve tahsilatı olan planda
  o da kapalıydı.

  Yetki: tahsilat girişiyle aynı (finance.kayit.yonet); veritabanı ayrıca
  kurum sahibi/yöneticisi istiyor.
*/
type PlanSatiri = { id: string; installment_no: number; due_date: string | null; amount: number; status: string };

const PLAN_HATALARI: Record<string, string> = {
  plan_toplami_tutmuyor: "Taksitlerin toplamı sözleşme tutarını tutmuyor.",
  forbidden: "Ödeme planını yalnızca kurum sahibi ve yöneticisi değiştirebilir.",
  silinemeyen_taksit: "Ödenmiş ya da etkin ödeme bağlantısı olan bir taksit plandan çıkarılamaz; önce bağlantıyı iptal edin.",
  payment_plan_not_found: "Ödeme planı bulunamadı.",
};

async function planiOku(supabase: Awaited<ReturnType<typeof financeContext>>["supabase"], organizationId: string, planId: string) {
  const [{ data: plan }, { data: satirlar, error }] = await Promise.all([
    supabase.from("payment_plans").select("id,party_id,total_amount").eq("id", planId).eq("organization_id", organizationId).maybeSingle(),
    supabase.from("payment_installments").select("id,installment_no,due_date,amount,status").eq("organization_id", organizationId).eq("payment_plan_id", planId).order("installment_no"),
  ]);
  if (error) throw new Error("Ödeme planı okunamadı: " + error.message);
  if (!plan) throw new Error("Ödeme planı bulunamadı veya erişiminiz yok.");
  // İptal edilen taksit plandan sayılmaz; yeni plan 1..n diye yeniden numaralanır.
  const etkin = ((satirlar ?? []) as PlanSatiri[]).filter((t) => t.status !== "cancelled");
  return { plan: plan as { id: string; party_id: string; total_amount: number }, satirlar: etkin };
}

async function planiKaydet(supabase: Awaited<ReturnType<typeof financeContext>>["supabase"], planId: string, taksitler: PlanTaksidi[]) {
  const { error } = await supabase.rpc("arvo_taksitleri_kaydet", { p_plan_id: planId, p_taksitler: taksitler });
  if (error) {
    const bilinen = Object.entries(PLAN_HATALARI).find(([kod]) => error.message.includes(kod));
    throw new Error(bilinen ? bilinen[1] : "Ödeme planı kaydedilemedi: " + error.message);
  }
  revalidatePath("/panel/finance/musteri/[id]", "page");
  revalidatePath("/panel/crm/musteri/[id]", "page");
  revalidatePath("/panel/crm/contracts/[id]", "page");
  revalidatePath("/panel/finance");
  revalidatePath("/panel/finance/genel-bakis");
}

const bugunVeyaSonra = (gun: string | null) => gun ?? todayInIstanbul();

async function taksitiDuzenle__impl(formData: FormData): Promise<string> {
  const { supabase, membership } = await financeContext();
  const taksitId = String(formData.get("installment_id") ?? "").trim();
  const yeniTarih = String(formData.get("due_date") ?? "").trim();
  const tutarMetni = String(formData.get("amount") ?? "").trim();
  const kaydir = formData.get("sonrakiler") === "on";
  if (!taksitId) throw new Error("Taksit seçilemedi.");
  if (!gecerliGun(yeniTarih)) throw new Error("Geçerli bir vade tarihi seçin.");

  const { data: hedefSatir } = await supabase.from("payment_installments").select("payment_plan_id")
    .eq("id", taksitId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!hedefSatir) throw new Error("Taksit bulunamadı veya erişiminiz yok.");
  const { plan, satirlar } = await planiOku(supabase, membership.organization_id, hedefSatir.payment_plan_id);

  // Eski numaralarla plan; hedefin yeni numarası sıralamadaki yeri.
  let liste: PlanTaksidi[] = satirlar.map((t, i) => ({ no: i + 1, vade: bugunVeyaSonra(t.due_date), tutar: Number(t.amount) }));
  const hedefNo = satirlar.findIndex((t) => t.id === taksitId) + 1;
  if (!hedefNo) throw new Error("Taksit iptal edilmiş; düzenlenemez.");
  const eskiVade = liste[hedefNo - 1].vade;
  const eskiTutar = liste[hedefNo - 1].tutar;

  // 1) Vade: hedef yeni tarihe; istenirse sonrakiler aynı gün kadar.
  const fark = gunFarki(eskiVade, yeniTarih);
  liste = liste.map((t) => (t.no === hedefNo ? { ...t, vade: yeniTarih } : kaydir && fark && t.no > hedefNo ? { ...t, vade: gunKaydir(t.vade, fark) } : t));

  // 2) Tutar: fark sonraki taksitlere (lib/taksit-plani.ts).
  let tutarDegisti = false;
  if (tutarMetni) {
    const yeniTutar = Math.round(parseTurkishAmount(tutarMetni) * 100);
    if (!Number.isFinite(yeniTutar) || yeniTutar < 0) throw new Error("Geçerli bir tutar girin.");
    if (yeniTutar !== eskiTutar) {
      const sonuc = tutarDegistir(liste, hedefNo, yeniTutar);
      if ("hata" in sonuc) throw new Error(sonuc.hata);
      liste = sonuc;
      tutarDegisti = true;
    }
  }

  await planiKaydet(supabase, plan.id, liste);
  if (tutarDegisti) return "Taksit güncellendi; fark sonraki taksitlere aktarıldı";
  return kaydir && fark ? "Vade güncellendi; sonraki taksitler de kaydırıldı" : "Vade güncellendi";
}

export async function taksitiDuzenle(formData: FormData) {
  const mesaj = await runPanelAction(() => taksitiDuzenle__impl(formData));
  if (mesaj) await flashSuccess(mesaj);
}

/*
  Taksit seçeneği: ödenmiş kısmı bulmak için carinin net tahsilatı, bütün
  planlarının taksitlerine en eski vadeden dağıtılıyor (cari penceresi ve
  Müşteriler listesiyle aynı kural, lib/taksit-dagitimi.ts).
*/
async function taksitSecenegiDegistir__impl(formData: FormData) {
  const { supabase, membership } = await financeContext();
  const org = membership.organization_id;
  const planId = String(formData.get("plan_id") ?? "").trim();
  if (!planId) throw new Error("Ödeme planı seçilemedi.");
  const { plan, satirlar } = await planiOku(supabase, org, planId);

  const [{ data: hareketler }, { data: cariPlanlari }] = await Promise.all([
    supabase.from("account_entries").select("entry_type,source_type,amount").eq("organization_id", org).eq("party_id", plan.party_id),
    supabase.from("payment_plans").select("id").eq("organization_id", org).eq("party_id", plan.party_id),
  ]);
  const planIdleri = ((cariPlanlari ?? []) as { id: string }[]).map((p) => p.id);
  const { data: tumTaksitler } = planIdleri.length
    ? await supabase.from("payment_installments").select("id,due_date,amount,status").eq("organization_id", org).in("payment_plan_id", planIdleri)
    : { data: [] };
  const dagilim = taksitleriDagit((tumTaksitler ?? []) as { id: string; due_date: string | null; amount: number; status: string }[], netTahsilat((hareketler ?? []) as { entry_type: string; source_type: string | null; amount: number }[]), todayInIstanbul());
  const odenen = new Map(dagilim.map((t) => [t.id, t.odenen]));

  const sonuc = yenidenBol(
    satirlar.map((t, i) => ({ no: i + 1, vade: bugunVeyaSonra(t.due_date), tutar: Number(t.amount), odenen: odenen.get(t.id) ?? 0 })),
    Number(plan.total_amount),
    { adet: Number(formData.get("adet") ?? 0), ilkVade: String(formData.get("ilk_vade") ?? "").trim(), aralikAy: Number(formData.get("aralik") ?? 1) },
  );
  if ("hata" in sonuc) throw new Error(sonuc.hata);
  await planiKaydet(supabase, plan.id, sonuc);
}

export async function taksitSecenegiDegistir(formData: FormData) {
  return runPanelAction(() => taksitSecenegiDegistir__impl(formData), "Taksit planı güncellendi");
}
