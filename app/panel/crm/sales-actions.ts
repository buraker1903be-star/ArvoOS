"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

const text = (formData: FormData, key: string, max = 4000) =>
  String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
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
    paymentSchedule = JSON.parse(
      text(formData, "payment_schedule", 10000) || "[]",
    );
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
    return {
      error: "Teklif oluşturuldu ancak paylaşım bağlantısı hazırlanamadı.",
    };
  }

  revalidatePath("/panel/crm");
  revalidatePath("/panel/crm/proposals");
  redirect(
    `/panel/crm/proposals?share=${encodeURIComponent(row.access_token)}`,
  );
}

// Talep sayfasından "Direkt Sözleşme Oluştur" ile çağrılır: fiyat/ödeme
// planı yine teklif kaydı olarak tutulur (iç kayıt, raporlama için), ama
// müşterinin online onaylamasını beklemeden aynı işlemde sözleşmeye
// dönüştürülür.
export async function createContractDirectly(
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
    paymentSchedule = JSON.parse(
      text(formData, "payment_schedule", 10000) || "[]",
    );
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
    return { error: "Sözleşme bilgileri eksik veya geçersiz." };
  }

  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin", "manager"].includes(membership.role))
    return { error: "Bu işlem için yetkiniz yok." };

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
    console.error("create_crm_proposal_v2 failed (direct contract)", {
      code: error.code,
      message: error.message,
      opportunityId,
      paymentPlanType,
      taxStatus,
    });
    return { error: proposalErrorMessage(error.message) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.access_token) {
    return { error: "Kayıt oluşturuldu ancak sözleşmeye dönüştürülemedi." };
  }

  const { data: acceptData, error: acceptError } = await supabase.rpc(
    "respond_to_crm_proposal",
    {
      public_token: row.access_token,
      decision: "accept",
    },
  );
  if (acceptError) {
    return { error: "Sözleşmeye dönüştürülemedi: " + acceptError.message };
  }
  const acceptRow = Array.isArray(acceptData) ? acceptData[0] : acceptData;
  if (acceptRow?.result_status !== "accepted") {
    return { error: "Sözleşmeye dönüştürülemedi, durumu kontrol edin." };
  }

  revalidatePath("/panel/crm");
  revalidatePath("/panel/crm/proposals");
  revalidatePath("/panel/crm/contracts");
  redirect(
    `/panel/crm/contracts${acceptRow?.contract_token ? `?share=${encodeURIComponent(acceptRow.contract_token)}` : ""}`,
  );
}

export async function updateProposal(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
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

  // Talep aşamasında girilen müşteri/hizmet bilgileri de aynı formdan
  // düzenlenebilsin diye bağlı fırsat (crm_opportunities) kaydı da
  // güncelleniyor — Talepler sayfasına geri dönmeye gerek kalmıyor.
  const opportunityId = text(formData, "opportunity_id", 80);
  if (opportunityId) {
    const currentDetails = JSON.parse(
      text(formData, "current_details", 10000) || "{}",
    );
    const requestDetails = {
      ...currentDetails,
      service_type: text(formData, "service_type", 180),
      academic_level: text(formData, "academic_level", 80),
      university: text(formData, "university", 180),
      department: text(formData, "department", 180),
    };
    const { error: opportunityError } = await supabase
      .from("crm_opportunities")
      .update({
        customer_name: text(formData, "customer_name", 180),
        contact_phone: text(formData, "contact_phone", 80) || null,
        contact_email: text(formData, "contact_email", 240) || null,
        request_details: requestDetails,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opportunityId)
      .eq("organization_id", membership.organization_id);
    if (opportunityError)
      throw new Error(
        "Müşteri bilgileri güncellenemedi: " + opportunityError.message,
      );
  }

  revalidatePath("/panel/crm/proposals");
  revalidatePath("/panel/crm");
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
  if (error)
    throw new Error("Teklif revizyonu oluşturulamadı: " + error.message);
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/panel/crm/proposals");
  redirect(
    `/panel/crm/proposals?share=${encodeURIComponent(row?.access_token ?? "")}`,
  );
}

export async function issueProposalLink(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  const proposalId = text(formData, "proposal_id", 80);
  const { data, error } = await supabase.rpc("issue_crm_proposal_link", {
    target_proposal_id: proposalId,
  });
  if (error)
    throw new Error("Teklif bağlantısı oluşturulamadı: " + error.message);
  revalidatePath("/panel/crm/proposals");
  revalidatePath(`/panel/crm/proposals/${proposalId}`);
  revalidatePath("/panel/crm");
  const { data: info } = await supabase
    .from("crm_proposals")
    .select(
      "proposal_no,title,amount,currency,crm_opportunities(customer_name,contact_email)",
    )
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  const docNo = info?.proposal_no ?? "";
  const customer = info?.crm_opportunities as {
    customer_name?: string;
    contact_email?: string;
  } | null;
  const params = new URLSearchParams({
    share: String(data ?? ""),
    doc_no: docNo,
    customer_name: customer?.customer_name ?? "",
    customer_email: customer?.contact_email ?? "",
    title: info?.title ?? "",
    amount: String(info?.amount ?? ""),
    currency: info?.currency ?? "TRY",
  });
  // Detay sayfasından çağrıldıysa oraya dön; eskiden her durumda
  // listeye atıyordu ve kullanıcı bulunduğu sayfadan kopuyordu.
  const backTo = text(formData, "redirect_to", 200);
  if (backTo.startsWith("/panel/crm/proposals/")) {
    redirect(`${backTo}?${params.toString()}`);
  }
  redirect(`/panel/crm/proposals?${params.toString()}`);
}

export async function updateContract(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
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

  // Kurumsal müşteri adres/vergi bilgisi — ayrı, basit bir güncelleme
  // olarak tutuluyor ki mevcut, kanıtlanmış RPC'ye dokunmayalım.
  const { error: partyInfoError } = await supabase
    .from("crm_contracts")
    .update({
      customer_address: text(formData, "customer_address", 500) || null,
      customer_tax_number: text(formData, "customer_tax_number", 40) || null,
      customer_tax_office: text(formData, "customer_tax_office", 120) || null,
    })
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id);
  if (partyInfoError)
    throw new Error(
      "Adres/vergi bilgisi kaydedilemedi: " + partyInfoError.message,
    );

  // Talep aşamasında girilen müşteri/hizmet bilgileri de aynı formdan
  // düzenlenebilsin diye bağlı fırsat (crm_opportunities) kaydı da
  // güncelleniyor — Talepler sayfasına geri dönmeye gerek kalmıyor.
  const opportunityId = text(formData, "opportunity_id", 80);
  if (opportunityId) {
    const currentDetails = JSON.parse(
      text(formData, "current_details", 10000) || "{}",
    );
    const requestDetails = {
      ...currentDetails,
      service_type: text(formData, "service_type", 180),
      academic_level: text(formData, "academic_level", 80),
      university: text(formData, "university", 180),
      department: text(formData, "department", 180),
    };
    const { error: opportunityError } = await supabase
      .from("crm_opportunities")
      .update({
        customer_name: text(formData, "customer_name", 180),
        contact_phone: text(formData, "contact_phone", 80) || null,
        contact_email: text(formData, "contact_email", 240) || null,
        request_details: requestDetails,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opportunityId)
      .eq("organization_id", membership.organization_id);
    if (opportunityError)
      throw new Error(
        "Müşteri bilgileri güncellenemedi: " + opportunityError.message,
      );
  }

  revalidatePath("/panel/crm/contracts");
  revalidatePath("/panel/crm");
}

export type UpdateContractPlanState = {
  error: string | null;
  success: boolean;
};

// İmzalanmış bir sözleşmenin ödeme planı, müşteri talebiyle (örn. "3 taksit
// yapalım") değişebiliyor — bu artık teklife dokunmadan, doğrudan
// sözleşme üzerinde, aynı hesaplama mantığıyla revize edilebiliyor.
export async function updateContractPaymentPlan(
  _previousState: UpdateContractPlanState,
  formData: FormData,
): Promise<UpdateContractPlanState> {
  const { supabase, membership } = await getPanelContext();
  const contractId = text(formData, "contract_id", 80);
  const planType = text(formData, "payment_plan_type", 20);
  const planText = text(formData, "payment_plan_text", 2000);
  if (!["cash", "half", "third", "custom"].includes(planType))
    return { error: "Geçersiz ödeme planı.", success: false };

  let schedule: unknown;
  try {
    schedule = JSON.parse(text(formData, "payment_schedule", 10000) || "[]");
  } catch {
    return { error: "Ödeme planı okunamadı.", success: false };
  }

  const { error } = await supabase
    .from("crm_contracts")
    .update({
      payment_plan_type: planType,
      payment_plan: planText || null,
      payment_schedule: schedule,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id);
  if (error)
    return {
      error: "Ödeme planı kaydedilemedi: " + error.message,
      success: false,
    };

  revalidatePath("/panel/crm/contracts");
  return { error: null, success: true };
}

export async function issueContractLink(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  const contractId = text(formData, "contract_id", 80);
  const { data, error } = await supabase.rpc("issue_crm_contract_link", {
    target_contract_id: contractId,
  });
  if (error)
    throw new Error("Sözleşme bağlantısı oluşturulamadı: " + error.message);
  revalidatePath("/panel/crm/contracts");
  revalidatePath(`/panel/crm/contracts/${contractId}`);
  revalidatePath("/panel/crm");
  const { data: info } = await supabase
    .from("crm_contracts")
    .select(
      "contract_no,title,amount,currency,crm_opportunities(customer_name,contact_email)",
    )
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  const docNo = info?.contract_no ?? "";
  const customer = info?.crm_opportunities as {
    customer_name?: string;
    contact_email?: string;
  } | null;
  const params = new URLSearchParams({
    share: String(data ?? ""),
    doc_no: docNo,
    customer_name: customer?.customer_name ?? "",
    customer_email: customer?.contact_email ?? "",
    title: info?.title ?? "",
    amount: String(info?.amount ?? ""),
    currency: info?.currency ?? "TRY",
  });
  redirect(`/panel/crm/contracts?${params.toString()}`);
}

// Sözleşmeler tablosundan hızlıca "Reddedildi" veya "İptal" olarak
// işaretlemek için — imzalanmış veya zaten kesinleşmiş sözleşmelerde
// kullanılamaz (bu ikisinin gerçek finans/operasyon etkisi var, tek
// tıkla değiştirilmemeli).
export async function markContractStatus(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin", "manager"].includes(membership.role))
    throw new Error("Bu işlem için yetkiniz yok.");
  const contractId = text(formData, "contract_id", 80);
  const status = text(formData, "status", 20);
  if (!contractId) throw new Error("Sözleşme seçilmedi.");
  if (!["rejected", "cancelled"].includes(status))
    throw new Error("Geçersiz durum.");

  const { data: current } = await supabase
    .from("crm_contracts")
    .select("status")
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (
    current &&
    ["signed", "completed", "rejected", "cancelled"].includes(current.status)
  ) {
    throw new Error("Bu sözleşme zaten kesinleşmiş, durumu değiştirilemez.");
  }

  const { error } = await supabase
    .from("crm_contracts")
    .update({ status })
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id);
  if (error)
    throw new Error("Sözleşme durumu güncellenemedi: " + error.message);
  revalidatePath("/panel/crm/contracts");
}

// Sözleşmeyi kalıcı olarak siler. Bağlı bir iş akışı (operasyon) veya
// ödeme planı varsa, gerçek finans/operasyon verisi kaybolmasın diye
// silinemez.
export async function deleteContract(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin", "manager"].includes(membership.role))
    throw new Error("Bu işlem için yetkiniz yok.");
  const contractId = text(formData, "contract_id", 80);
  if (!contractId) throw new Error("Sözleşme seçilmedi.");

  const [{ data: linkedWorkflow }, { data: linkedPlan }] = await Promise.all([
    supabase
      .from("operation_workflows")
      .select("id")
      .eq("contract_id", contractId)
      .eq("organization_id", membership.organization_id)
      .maybeSingle(),
    supabase
      .from("payment_plans")
      .select("id")
      .eq("contract_id", contractId)
      .eq("organization_id", membership.organization_id)
      .maybeSingle(),
  ]);
  if (linkedWorkflow)
    throw new Error(
      "Bu sözleşmeye bağlı bir iş akışı var, önce onu arşivleyin veya bu sözleşmeyi silmeyin.",
    );
  if (linkedPlan)
    throw new Error(
      "Bu sözleşmeye bağlı bir ödeme planı var, önce onu silin veya bu sözleşmeyi silmeyin.",
    );

  const { error } = await supabase
    .from("crm_contracts")
    .delete()
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id);
  if (error) throw new Error("Sözleşme silinemedi: " + error.message);
  revalidatePath("/panel/crm/contracts");
}

// Müşteri telefon/whatsapp üzerinden zaten sözlü onay verdiğinde, ayrı bir
// "teklifi online onayla" beklemeden doğrudan sözleşmeye geçmek için.
// Aynı, zaten kanıtlanmış kabul mantığını (respond_to_crm_proposal) müşteri
// linkine gitmeden, personel adına tetikler.
export async function fastTrackProposalToContract(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin", "manager"].includes(membership.role))
    throw new Error("Bu işlem için yetkiniz yok.");
  const proposalId = text(formData, "proposal_id", 80);
  if (!proposalId) throw new Error("Teklif seçilmedi.");

  // access_token yalnızca hash'lenmiş halde saklanıyor (güvenlik), bu yüzden
  // müşteri linkini oluşturan aynı, kanıtlanmış RPC ile taze bir token
  // üretip hemen kabul kararını da aynı işlemde kaydediyoruz.
  const { data: freshToken, error: linkError } = await supabase.rpc(
    "issue_crm_proposal_link",
    { target_proposal_id: proposalId },
  );
  if (linkError || !freshToken)
    throw new Error(
      "Sözleşmeye dönüştürülemedi: " +
        (linkError?.message ?? "bağlantı oluşturulamadı"),
    );

  const { data, error } = await supabase.rpc("respond_to_crm_proposal", {
    public_token: String(freshToken),
    decision: "accept",
  });
  if (error) throw new Error("Sözleşmeye dönüştürülemedi: " + error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.result_status !== "accepted")
    throw new Error("Teklif kabul edilemedi, durumunu kontrol edin.");

  revalidatePath("/panel/crm/proposals");
  revalidatePath("/panel/crm/contracts");
  redirect(
    `/panel/crm/contracts${row?.contract_token ? `?share=${encodeURIComponent(row.contract_token)}` : ""}`,
  );
}

// Teklifler tablosundan hızlıca "Reddedildi" veya "Süre Doldu" olarak
// işaretlemek için — kabul edilmiş veya zaten kilitli tekliflerde
// kullanılamaz.
export async function markProposalStatus(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin", "manager"].includes(membership.role))
    throw new Error("Bu işlem için yetkiniz yok.");
  const proposalId = text(formData, "proposal_id", 80);
  const status = text(formData, "status", 20);
  if (!proposalId) throw new Error("Teklif seçilmedi.");
  if (!["rejected", "expired"].includes(status))
    throw new Error("Geçersiz durum.");

  const { data: current } = await supabase
    .from("crm_proposals")
    .select("status")
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (
    current &&
    ["accepted", "rejected", "archived"].includes(current.status)
  ) {
    throw new Error("Bu teklif zaten kesinleşmiş, durumu değiştirilemez.");
  }

  const { error } = await supabase
    .from("crm_proposals")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id);
  if (error) throw new Error("Teklif durumu güncellenemedi: " + error.message);
  revalidatePath("/panel/crm/proposals");
}

// Teklifi kalıcı olarak siler. Kabul edilip gerçek bir sözleşmeye
// dönüşmüş teklifler, veri bütünlüğünü bozmamak için silinemez.
export async function deleteProposal(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin", "manager"].includes(membership.role))
    throw new Error("Bu işlem için yetkiniz yok.");
  const proposalId = text(formData, "proposal_id", 80);
  if (!proposalId) throw new Error("Teklif seçilmedi.");

  const { data: linkedContract } = await supabase
    .from("crm_contracts")
    .select("id")
    .eq("proposal_id", proposalId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (linkedContract)
    throw new Error(
      "Bu teklife bağlı bir sözleşme var, önce sözleşmeyi silin veya bu teklifi silmeyin.",
    );

  const { error } = await supabase
    .from("crm_proposals")
    .delete()
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id);
  if (error) throw new Error("Teklif silinemedi: " + error.message);
  revalidatePath("/panel/crm/proposals");
}

/**
 * Teklifi bir sebeple kapatır.
 *
 * markProposalStatus yalnızca "rejected" ve "expired" kabul ediyordu;
 * yanlışlıkla açılmış kayıtlar için bir yol yoktu. Burada üçüncü bir
 * seçenek olarak "hatalı kayıt" da arşive alınıyor.
 *
 * Silme bilinçli olarak buraya dahil edilmedi: geri alınamaz bir işlem
 * olduğu için ayrı bir onay adımından geçmeli (deleteProposal).
 */
export async function resolveProposal(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin", "manager"].includes(membership.role))
    throw new Error("Bu işlem için yetkiniz yok.");
  const proposalId = text(formData, "proposal_id", 80);
  const resolution = text(formData, "resolution", 20);
  if (!proposalId) throw new Error("Teklif seçilmedi.");

  const plan: Record<string, { status: string; archiveReason: string | null }> = {
    rejected: { status: "rejected", archiveReason: "rejected" },
    expired: { status: "expired", archiveReason: "expired" },
    invalid: { status: "archived", archiveReason: "manual" },
  };
  const chosen = plan[resolution];
  if (!chosen) throw new Error("Geçersiz iptal sebebi.");

  const { data: current } = await supabase
    .from("crm_proposals")
    .select("status")
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (current && ["accepted", "rejected", "archived"].includes(current.status)) {
    throw new Error("Bu teklif zaten kesinleşmiş, durumu değiştirilemez.");
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("crm_proposals")
    .update({
      status: chosen.status,
      responded_at: now,
      archived_at: now,
      archive_reason: chosen.archiveReason,
    })
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id);
  if (error) throw new Error("Teklif kapatılamadı: " + error.message);
  revalidatePath("/panel/crm/proposals");
  revalidatePath(`/panel/crm/proposals/${proposalId}`);
}
