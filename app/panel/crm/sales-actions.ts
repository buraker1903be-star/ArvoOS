"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

const text = (formData: FormData, key: string, max = 4000) =>
  String(formData.get(key) ?? "").trim().slice(0, max);
const amount = (formData: FormData, key: string) =>
  Math.round(Number(formData.get(key) ?? 0) * 100);

export type CreateProposalState = {
  error: string | null;
};

function proposalErrorMessage(message: string) {
  if (message.includes("invalid_payment_plan_type")) {
    return "Seçilen ödeme planı desteklenmiyor. Sayfayı yenileyip tekrar deneyin.";
  }
  if (message.includes("opportunity_not_found")) {
    return "Teklif oluşturulacak talep bulunamadı veya bu talebe erişiminiz yok.";
  }
  if (message.includes("invalid_tax_status")) {
    return "KDV durumu geçersiz.";
  }
  if (message.includes("invalid_amount")) {
    return "Teklif tutarı geçersiz.";
  }
  return "Teklif oluşturulamadı. Bilgileri kontrol edip tekrar deneyin.";
}

export async function createProposal(
  _previousState: CreateProposalState,
  formData: FormData,
): Promise<CreateProposalState> {
  const opportunityId = text(formData, "opportunity_id", 80);
  const title = text(formData, "title", 180);
  const scope = text(formData, "scope");
  const proposalAmount = amount(formData, "amount");
  const taxStatus = text(formData, "tax_status", 20);
  const paymentPlanType = text(formData, "payment_plan_type", 20);
  const paymentPlan = text(formData, "payment_plan", 1000);
  const validUntil = text(formData, "valid_until", 20) || null;
  const estimatedDeliveryDate =
    text(formData, "estimated_delivery_date", 20) || null;

  let paymentSchedule: unknown = [];
  try {
    paymentSchedule = JSON.parse(text(formData, "payment_schedule", 10000) || "[]");
  } catch {
    return { error: "Ödeme planı okunamadı. Ödeme planını yeniden oluşturun." };
  }

  if (
    !opportunityId ||
    title.length < 2 ||
    scope.length < 2 ||
    !Number.isFinite(proposalAmount) ||
    proposalAmount < 0
  ) {
    return { error: "Teklif bilgileri eksik veya geçersiz." };
  }

  const { supabase } = await getPanelContext();
  const { data, error } = await supabase.rpc("create_crm_proposal_v2", {
    target_opportunity_id: opportunityId,
    proposal_title: title,
    proposal_scope: scope,
    proposal_amount: proposalAmount,
    proposal_tax_status: taxStatus,
    proposal_payment_plan_type: paymentPlanType,
    proposal_payment_plan: paymentPlan || null,
    proposal_payment_schedule: paymentSchedule,
    proposal_valid_until: validUntil,
    proposal_estimated_delivery_date: estimatedDeliveryDate,
  });

  if (error) {
    console.error("create_crm_proposal_v2 failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      opportunityId,
      paymentPlanType,
      taxStatus,
    });
    return { error: proposalErrorMessage(error.message) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.access_token) {
    console.error("create_crm_proposal_v2 returned no access token", { data });
    return { error: "Teklif oluşturuldu ancak paylaşım bağlantısı hazırlanamadı." };
  }

  revalidatePath("/panel/crm");
  revalidatePath("/panel/crm/proposals");
  redirect(`/panel/crm/proposals?share=${encodeURIComponent(row.access_token)}`);
}

export async function updateProposal(formData: FormData) {
  const { supabase } = await getPanelContext();
  const proposalId = text(formData, "proposal_id", 80);
  const proposalAmount = amount(formData, "amount");
  const { error } = await supabase.rpc("update_crm_proposal", {
    target_proposal_id: proposalId,
    proposal_title: text(formData, "title", 180),
    proposal_scope: text(formData, "scope"),
    proposal_amount: proposalAmount,
    proposal_payment_plan: text(formData, "payment_plan", 500) || null,
    proposal_valid_until: text(formData, "valid_until", 20) || null,
  });
  if (error) throw new Error("Teklif güncellenemedi: " + error.message);
  revalidatePath("/panel/crm/proposals");
}

export async function createProposalRevision(formData: FormData) {
  const { supabase } = await getPanelContext();
  const proposalId = text(formData, "proposal_id", 80);
  const revisionReason = text(formData, "revision_reason", 1000);
  if (!proposalId) throw new Error("Revize edilecek teklif bulunamadı.");
  const { data, error } = await supabase.rpc("create_crm_proposal_revision", {
    target_proposal_id: proposalId,
    revision_reason: revisionReason || null,
  });
  if (error) throw new Error("Teklif revizyonu oluşturulamadı: " + error.message);
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/panel/crm/proposals");
  redirect(`/panel/crm/proposals?share=${encodeURIComponent(row?.access_token ?? "")}`);
}

export async function issueProposalLink(formData: FormData) {
  const proposalId = text(formData, "proposal_id", 80);
  if (!proposalId) {
    redirect("/panel/crm/proposals?share_error=missing_proposal");
  }

  const { supabase } = await getPanelContext();
  const { data, error } = await supabase.rpc("issue_crm_proposal_link", {
    target_proposal_id: proposalId,
  });

  if (error) {
    console.error("issue_crm_proposal_link failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      proposalId,
    });
    redirect("/panel/crm/proposals?share_error=link_failed");
  }

  const token = typeof data === "string" ? data.trim() : "";
  if (!token) {
    console.error("issue_crm_proposal_link returned an empty token", {
      proposalId,
      data,
    });
    redirect("/panel/crm/proposals?share_error=empty_token");
  }

  revalidatePath("/panel/crm/proposals");
  redirect(`/panel/crm/proposals?share=${encodeURIComponent(token)}`);
}

export async function updateContract(formData: FormData) {
  const { supabase } = await getPanelContext();
  const contractId = text(formData, "contract_id", 80);
  const contractAmount = amount(formData, "amount");
  const { error } = await supabase.rpc("update_crm_contract", {
    target_contract_id: contractId,
    contract_title: text(formData, "title", 180),
    contract_scope: text(formData, "scope"),
    contract_amount: contractAmount,
    contract_payment_plan: text(formData, "payment_plan", 500) || null,
    contract_start_date: text(formData, "start_date", 20) || null,
    contract_due_date: text(formData, "due_date", 20) || null,
  });
  if (error) throw new Error("Sözleşme güncellenemedi: " + error.message);
  revalidatePath("/panel/crm/contracts");
}

export async function issueContractLink(formData: FormData) {
  const { supabase } = await getPanelContext();
  const contractId = text(formData, "contract_id", 80);
  const { data, error } = await supabase.rpc("issue_crm_contract_link", {
    target_contract_id: contractId,
  });
  if (error) throw new Error("Sözleşme bağlantısı oluşturulamadı: " + error.message);
  revalidatePath("/panel/crm/contracts");
  redirect(`/panel/crm/contracts?share=${encodeURIComponent(String(data ?? ""))}`);
}
