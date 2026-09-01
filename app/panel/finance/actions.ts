"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const types = new Set(["income", "expense"]);
const statuses = new Set(["planned", "paid", "canceled"]);
const invoiceStatuses = new Set(["draft", "open", "paid", "void"]);

async function financeContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "finance")) throw new Error("Finans modülüne erişiminiz yok.");
  if (!context.isPlatformOwner && !["owner", "admin"].includes(context.membership.role)) throw new Error("Finans kayıtlarını yönetme yetkiniz yok.");
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

export async function addContractCostItem(formData:FormData){const {supabase,membership,userId}=await financeContext();const contractId=String(formData.get("contract_id")??"");const category=String(formData.get("category")??"").trim();const description=String(formData.get("description")??"").trim();const supplier=String(formData.get("supplier")??"").trim();const reference=String(formData.get("reference_no")??"").trim();const costDate=String(formData.get("cost_date")??"")||new Date().toISOString().slice(0,10);const status=String(formData.get("status")??"planned");const amount=Math.round(Number(formData.get("amount")??0)*100);if(!contractId||description.length<2||!Number.isFinite(amount)||amount<=0)throw new Error("Maliyet kalemi bilgileri eksik.");if(!new Set(["planned","paid"]).has(status))throw new Error("Maliyet durumu geçersiz.");const {data:contract}=await supabase.from("crm_contracts").select("id").eq("id",contractId).eq("organization_id",membership.organization_id).maybeSingle();if(!contract)throw new Error("Sözleşme bulunamadı.");const {error}=await supabase.from("contract_cost_items").insert({organization_id:membership.organization_id,contract_id:contractId,category:category||"Dış hizmet",description,supplier:supplier||null,amount,cost_date:costDate,status,reference_no:reference||null,created_by:userId});if(error)throw new Error("Maliyet kalemi eklenemedi: "+error.message);await syncContractCostSummary(supabase,membership.organization_id,userId,contractId);revalidatePath(`/panel/finance/costs/${contractId}`);revalidatePath("/panel/finance");revalidatePath("/panel/reporting")}

export async function deleteContractCostItem(formData:FormData){const {supabase,membership,userId}=await financeContext();const itemId=String(formData.get("item_id")??"");const contractId=String(formData.get("contract_id")??"");if(!itemId||!contractId)throw new Error("Maliyet kalemi seçilemedi.");const {error}=await supabase.from("contract_cost_items").delete().eq("id",itemId).eq("contract_id",contractId).eq("organization_id",membership.organization_id);if(error)throw new Error("Maliyet kalemi silinemedi: "+error.message);await syncContractCostSummary(supabase,membership.organization_id,userId,contractId);revalidatePath(`/panel/finance/costs/${contractId}`);revalidatePath("/panel/finance");revalidatePath("/panel/reporting")}

export async function updateContractCostItem(formData:FormData){const {supabase,membership,userId}=await financeContext();const itemId=String(formData.get("item_id")??"");const contractId=String(formData.get("contract_id")??"");const category=String(formData.get("category")??"").trim();const description=String(formData.get("description")??"").trim();const supplier=String(formData.get("supplier")??"").trim();const reference=String(formData.get("reference_no")??"").trim();const costDate=String(formData.get("cost_date")??"");const status=String(formData.get("status")??"planned");const amount=Math.round(Number(formData.get("amount")??0)*100);if(!itemId||!contractId||description.length<2||!costDate||!Number.isFinite(amount)||amount<=0)throw new Error("Maliyet kalemi bilgileri eksik.");if(!new Set(["planned","paid"]).has(status))throw new Error("Maliyet durumu geçersiz.");const {error}=await supabase.from("contract_cost_items").update({category:category||"Dış hizmet",description,supplier:supplier||null,amount,cost_date:costDate,status,reference_no:reference||null,updated_at:new Date().toISOString()}).eq("id",itemId).eq("contract_id",contractId).eq("organization_id",membership.organization_id);if(error)throw new Error("Maliyet kalemi güncellenemedi: "+error.message);await syncContractCostSummary(supabase,membership.organization_id,userId,contractId);revalidatePath(`/panel/finance/costs/${contractId}`);revalidatePath("/panel/finance");revalidatePath("/panel/reporting")}

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
      transaction_date: new Date().toISOString().slice(0, 10),
      due_date: dueDate,
      created_by: userId,
    });
    if (entryError) throw new Error("Finans kaydı oluşturuldu ama cari hareketi eklenemedi: " + entryError.message);
  }

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
      if (contract?.invoice_id) {
        await supabase.from("billing_invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", contract.invoice_id).eq("organization_id", membership.organization_id);
      }
      if (contract?.id) {
        const { data: plan } = await supabase.from("payment_plans").select("id").eq("organization_id", membership.organization_id).eq("contract_id", contract.id).maybeSingle();
        if (plan?.id) {
          const { data: pendingInstallments } = await supabase.from("payment_installments").select("id,amount").eq("organization_id", membership.organization_id).eq("payment_plan_id", plan.id).eq("status", "pending").order("installment_no", { ascending: true });
          let remaining = Number(transaction.amount);
          for (const installment of pendingInstallments ?? []) {
            if (remaining <= 0) break;
            await supabase.from("payment_installments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", installment.id).eq("organization_id", membership.organization_id);
            remaining -= Number(installment.amount);
          }
        }
      }
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
          transaction_date: new Date().toISOString().slice(0, 10),
          created_by: userId,
        });
        if (entryError) throw new Error("Ödeme işaretlendi ama cari bakiyesi güncellenemedi: " + entryError.message);
      }
    }
  }
  if (status !== "paid" && alreadyPaid) await supabase.from("account_entries").delete().eq("organization_id", membership.organization_id).eq("reference_no", `FIN:${transactionId}`);

  revalidatePath("/panel/finance");
  revalidatePath("/panel/reporting");
  revalidatePath("/panel/hr/commissions");
  revalidatePath("/panel");
}

export async function collectPaymentInstallment(formData: FormData) {
  const { supabase } = await financeContext();
  const installmentId = String(formData.get("installment_id") ?? "").trim();
  if (!installmentId) throw new Error("Taksit seçilemedi.");
  const { error } = await supabase.rpc("collect_payment_installment", { target_installment_id: installmentId });
  if (error) throw new Error("Tahsilat kaydedilemedi: " + error.message);
  revalidatePath("/panel/finance");
  revalidatePath("/panel/finance/payment-plans");
  revalidatePath("/panel/finance/accounts");
  revalidatePath("/panel/finance/invoices");
  revalidatePath("/panel/reporting");
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

export async function saveInstallmentPaymentLink(formData: FormData) {
  const { supabase, membership } = await financeContext();
  const installmentId = String(formData.get("installment_id") ?? "").trim();
  const contractId = String(formData.get("contract_id") ?? "").trim();
  const paymentUrl = String(formData.get("payment_url") ?? "").trim();
  if (!installmentId || !contractId) throw new Error("Taksit seçilemedi.");
  if (paymentUrl) {
    let parsed: URL;
    try { parsed = new URL(paymentUrl); } catch { throw new Error("Geçerli bir ödeme bağlantısı girin."); }
    if (parsed.protocol !== "https:") throw new Error("Ödeme bağlantısı HTTPS olmalıdır.");
  }
  const { data: installment } = await supabase.from("payment_installments").select("id,payment_plan_id")
    .eq("id", installmentId).eq("organization_id", membership.organization_id).maybeSingle();
  const { data: plan } = installment ? await supabase.from("payment_plans").select("id,contract_id")
    .eq("id", installment.payment_plan_id).eq("organization_id", membership.organization_id).eq("contract_id", contractId).maybeSingle() : { data: null };
  if (!installment || !plan) throw new Error("Taksit bu sözleşmeye ait değil.");
  const { error } = await supabase.from("payment_installments").update({ payment_url: paymentUrl || null })
    .eq("id", installmentId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Ödeme bağlantısı kaydedilemedi: " + error.message);
  revalidatePath(`/panel/crm/contracts/${contractId}`);
}

export async function recordInstallmentNotice(formData: FormData) {
  const { supabase, membership, userId } = await financeContext();
  const installmentId = String(formData.get("installment_id") ?? "").trim();
  const contractId = String(formData.get("contract_id") ?? "").trim();
  const kind = String(formData.get("kind") ?? "notice");
  if (!installmentId || !contractId || !new Set(["notice", "reminder"]).has(kind)) throw new Error("Bildirim bilgisi geçersiz.");
  const { data: installment } = await supabase.from("payment_installments").select("id,payment_url,payment_plan_id")
    .eq("id", installmentId).eq("organization_id", membership.organization_id).maybeSingle();
  const { data: plan } = installment ? await supabase.from("payment_plans").select("id")
    .eq("id", installment.payment_plan_id).eq("contract_id", contractId).eq("organization_id", membership.organization_id).maybeSingle() : { data: null };
  if (!installment?.payment_url || !plan) throw new Error("Ödeme bağlantısı bulunamadı.");
  const now = new Date().toISOString();
  const payload = kind === "reminder" ? { reminder_sent_at: now, notice_sent_by: userId } : { notice_sent_at: now, notice_sent_by: userId };
  const { error } = await supabase.from("payment_installments").update(payload)
    .eq("id", installmentId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Bildirim kaydedilemedi: " + error.message);
  revalidatePath(`/panel/crm/contracts/${contractId}`);
  return { success: true };
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
  revalidatePath(`/panel/crm/contracts/${contractId}`);
  revalidatePath("/panel/finance");
  revalidatePath("/panel/reporting");
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
        const { error: entryError } = await supabase.from("account_entries").insert({ organization_id: membership.organization_id, party_id: contract.party_id, entry_type: "credit", source_type: "payment", amount: collectionAmount, description: `${contract.contract_no} fatura tahsilatı`, reference_no: referenceNo, transaction_date: new Date().toISOString().slice(0, 10), created_by: userId });
        if (entryError) throw new Error("Fatura güncellendi ancak cari tahsilat işlenemedi: " + entryError.message);
      }
    }
    const { data: plan } = await supabase.from("payment_plans").select("id").eq("organization_id", membership.organization_id).eq("contract_id", contract.id).maybeSingle();
    if (plan?.id) {
      await supabase.from("payment_installments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("organization_id", membership.organization_id).eq("payment_plan_id", plan.id).eq("status", "pending");
      await supabase.from("payment_plans").update({ status: "completed" }).eq("organization_id", membership.organization_id).eq("id", plan.id);
    }
  }
  if (status !== "paid" && invoice.status === "paid") await supabase.from("account_entries").delete().eq("organization_id", membership.organization_id).eq("reference_no", referenceNo);
  revalidatePath("/panel/finance");
  revalidatePath("/panel/finance/invoices");
  revalidatePath("/panel/hr/commissions");
  revalidatePath("/panel/reporting");
  revalidatePath("/panel");
}
