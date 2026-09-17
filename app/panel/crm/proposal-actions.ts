// Teklif işlemleri. Ortak yardımcılar: sales-shared.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { flashSuccess, runPanelAction } from "@/lib/panel-action";
import { diffFields, logActivity } from "@/lib/activity-log";
import { proposalStatusLabel } from "./status-labels";
import {
  scheduleDateIssue,
} from "@/lib/payment-schedule";
import {
  DELETE_ROLES,
  amount,
  ensureRepresentative,
  getPanelContext,
  proposalErrorMessage,
  text,
  type CreateProposalState,
} from "./sales-shared";
import { TAX_STATUSES, rescaleSchedule, splitTax } from "@/lib/sales-amounts";


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
  const scheduleIssue = scheduleDateIssue(paymentSchedule);
  if (scheduleIssue) return { error: scheduleIssue };

  // Plan istemciden geldiği gibi yazılıyordu; toplamı sunucuda hiç
  // doğrulanmıyordu. Kötü niyet gerekmiyor, normal kullanımda da tutmuyordu:
  // özel planda taksitler Math.round(brüt × yüzde / 100) ile hesaplanıyor ve
  // yuvarlama sapıyor. 1000,01 TL, KDV hariç, %50/%50 iki taksit →
  // brüt 120001 kuruş, taksitler 60001 + 60001 = 120002 kuruş. Sapma imzadan
  // sonra düzeltilmeden belgeye basılıyor (donmuş plan yeniden ölçeklenmez).
  //
  // Güncelleme akışı bunu rescaleSchedule ile zaten yapıyordu; eksik olan
  // yalnızca oluşturmaydı.
  const totals = splitTax(proposalAmount, taxStatus);
  const reconciledSchedule = rescaleSchedule(paymentSchedule, totals.gross, paymentPlanType);

  const { supabase, membership, userId } = await getPanelContext();
  const representativeError = await ensureRepresentative(supabase, membership.organization_id, opportunityId, text(formData, "assigned_employee_id", 80));
  if (representativeError) return { error: representativeError };
  const { data, error } = await supabase.rpc("create_crm_proposal_v2", {
    target_opportunity_id: opportunityId,
    proposal_title: title,
    proposal_scope: scope,
    proposal_amount: proposalAmount,
    proposal_tax_status: taxStatus,
    proposal_payment_plan_type: paymentPlanType,
    proposal_payment_plan: paymentPlan || null,
    proposal_payment_schedule: reconciledSchedule,
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

  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "create",
    entityType: "crm_proposal",
    entityId: String(row?.proposal_id ?? row?.id ?? ""),
    opportunityId,
    note: "Teklif oluşturuldu",
  });
  if (!row?.access_token) {
    console.error("create_crm_proposal_v2 returned no access token", { data });
    return {
      error: "Teklif oluşturuldu ancak paylaşım bağlantısı hazırlanamadı.",
    };
  }

  revalidatePath("/panel/crm");
  revalidatePath("/panel/crm/proposals");
  // Oluşturma sırasında üretilen token'ı kalıcı olarak saklıyoruz.
  // Aksi halde: bu token kullanıcıya gösteriliyor ve müşteriye
  // gönderiliyor, ama yalnızca hash'i saklandığı için "Müşteriye Gönder"
  // butonuna basıldığında issue_crm_proposal_link share_token'ı boş
  // görüp YENİ bir token üretiyor ve gönderilmiş link ölüyor.
  const newProposalId = String(row?.proposal_id ?? row?.id ?? "");
  if (newProposalId) {
    await supabase
      .from("crm_proposals")
      .update({ share_token: row.access_token })
      .eq("id", newProposalId)
      .eq("organization_id", membership.organization_id)
      .is("share_token", null);
  }

  await flashSuccess("Teklif oluşturuldu");
  redirect(
    `/panel/crm/proposals?share=${encodeURIComponent(row.access_token)}`,
  );
}


async function updateProposal__impl(formData: FormData) {
  const { supabase, membership, userId } = await getPanelContext();
  const proposalId = text(formData, "proposal_id", 80);
  const enteredAmount = amount(formData, "amount");
  if (!Number.isFinite(enteredAmount) || enteredAmount < 0)
    throw new Error("Teklif tutarı geçersiz.");
  // RPC'nin içine giremediğimiz için değişikliği burada çıkarıyoruz.
  const { data: before } = await supabase
    .from("crm_proposals")
    .select("opportunity_id,title,scope,amount,currency,payment_plan,valid_until,status,tax_status,payment_plan_type,payment_schedule")
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!before) throw new Error("Teklif bulunamadı veya erişiminiz yok.");

  // KDV durumu bilinmeyen eski kayıtlarda tutar olduğu gibi (brüt) alınır
  // ve KDV durumu yazılmaz; aksi halde fiyat sessizce %20 artardı.
  const requestedTax = text(formData, "tax_status", 20);
  const taxStatus: string | null = TAX_STATUSES.has(requestedTax)
    ? requestedTax
    : TAX_STATUSES.has(before.tax_status)
      ? before.tax_status
      : null;
  const totals = splitTax(enteredAmount, taxStatus ?? "exempt");

  const { error } = await supabase.rpc("update_crm_proposal", {
    target_proposal_id: proposalId,
    proposal_title: text(formData, "title", 180),
    proposal_scope: text(formData, "scope"),
    proposal_amount: totals.gross,
    proposal_payment_plan: text(formData, "payment_plan", 500) || null,
    proposal_valid_until: text(formData, "valid_until", 20) || null,
  });
  if (error) throw new Error("Teklif güncellenemedi: " + error.message);

  // update_crm_proposal yalnızca amount'u güncelliyor. Müşteri belgesi
  // ise gross_amount / net_amount ve payment_schedule'dan okuyor; bunlar
  // eski kalınca müşteriye eski tutar gidiyordu.
  const { error: totalsError } = await supabase
    .from("crm_proposals")
    .update({
      amount: totals.gross,
      net_amount: totals.net,
      tax_amount: totals.tax,
      gross_amount: totals.gross,
      payment_schedule: rescaleSchedule(
        before.payment_schedule,
        totals.gross,
        before.payment_plan_type,
      ),
      ...(taxStatus
        ? { tax_status: taxStatus, tax_rate: taxStatus === "exempt" ? 0 : 20 }
        : {}),
    })
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id);
  if (totalsError)
    throw new Error("Teklif tutarları güncellenemedi: " + totalsError.message);

  const { data: after } = await supabase
    .from("crm_proposals")
    .select("opportunity_id,title,scope,amount,currency,payment_plan,valid_until,status")
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (before && after) {
    await logActivity(supabase, {
      organizationId: membership.organization_id,
      actorUserId: userId,
      action: "update",
      entityType: "crm_proposal",
      entityId: proposalId,
      opportunityId: String(after.opportunity_id ?? before.opportunity_id ?? ""),
      changes: diffFields(before, after, ["title","scope","amount","currency","payment_plan","valid_until","status"]),
    });
  }

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


async function issueProposalLink__impl(formData: FormData) {
  const { supabase, membership, userId } = await getPanelContext();
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
      "proposal_no,title,amount,currency,opportunity_id,crm_opportunities(customer_name,contact_email)",
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
  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "send",
    entityType: "crm_proposal",
    entityId: proposalId,
    opportunityId: String(info?.opportunity_id ?? ""),
    note: "Müşteri bağlantısı oluşturuldu ve gönderime hazırlandı",
  });

  // Detay sayfasından çağrıldıysa oraya dön; eskiden her durumda
  // listeye atıyordu ve kullanıcı bulunduğu sayfadan kopuyordu.
  const backTo = text(formData, "redirect_to", 200);
  if (backTo.startsWith("/panel/crm/proposals/")) {
    redirect(`${backTo}?${params.toString()}`);
  }
  redirect(`/panel/crm/proposals?${params.toString()}`);
}


// Müşteri telefon/whatsapp üzerinden zaten sözlü onay verdiğinde, ayrı bir
// "teklifi online onayla" beklemeden doğrudan sözleşmeye geçmek için.
// Aynı, zaten kanıtlanmış kabul mantığını (respond_to_crm_proposal) müşteri
// linkine gitmeden, personel adına tetikler.
async function fastTrackProposalToContract__impl(formData: FormData) {
  const { supabase, membership, userId } = await getPanelContext();
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

  const { data: converted } = await supabase
    .from("crm_proposals")
    .select("proposal_no,opportunity_id")
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "convert",
    entityType: "crm_proposal",
    entityId: proposalId,
    opportunityId: String(converted?.opportunity_id ?? ""),
    note: converted
      ? `${converted.proposal_no} sözleşmeye dönüştürüldü`
      : "Teklif sözleşmeye dönüştürüldü",
  });
  if (row?.result_status !== "accepted")
    throw new Error("Teklif kabul edilemedi, durumunu kontrol edin.");

  revalidatePath("/panel/crm/proposals");
  revalidatePath("/panel/crm/contracts");
  if (row?.contract_id && row?.contract_token) {
    await supabase
      .from("crm_contracts")
      .update({ share_token: row.contract_token })
      .eq("id", row.contract_id)
      .eq("organization_id", membership.organization_id)
      .is("share_token", null);
  }

  redirect(
    `/panel/crm/contracts${row?.contract_token ? `?share=${encodeURIComponent(row.contract_token)}` : ""}`,
  );
}


// Teklifler tablosundan hızlıca "Reddedildi" veya "Süre Doldu" olarak
// işaretlemek için — kabul edilmiş veya zaten kilitli tekliflerde
// kullanılamaz.
export async function markProposalStatus(formData: FormData) {
  const { supabase, membership, userId } = await getPanelContext();
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

  const { data: mp } = await supabase
    .from("crm_proposals").select("opportunity_id")
    .eq("id", proposalId).eq("organization_id", membership.organization_id).maybeSingle();
  await logActivity(supabase, {
    organizationId: membership.organization_id, actorUserId: userId,
    action: "status", entityType: "crm_proposal", entityId: proposalId,
    opportunityId: String(mp?.opportunity_id ?? ""),
    changes: [{ field: "status", label: "Durum",
      from: proposalStatusLabel(current?.status),
      to: proposalStatusLabel(status) }],
  });
  revalidatePath("/panel/crm/proposals");
}


// Teklifi kalıcı olarak siler. Kabul edilip gerçek bir sözleşmeye
// dönüşmüş teklifler, veri bütünlüğünü bozmamak için silinemez.
async function deleteProposal__impl(formData: FormData) {
  const { supabase, membership, userId } = await getPanelContext();
  if (!DELETE_ROLES.includes(membership.role))
    throw new Error("Bu işlem için yetkiniz yok.");
  const proposalId = text(formData, "proposal_id", 80);
  if (!proposalId) throw new Error("Teklif seçilmedi.");

  const { data: linkedContract } = await supabase
    .from("crm_contracts")
    .select("id")
    .eq("proposal_id", proposalId)
    .eq("organization_id", membership.organization_id)
    .limit(1);
  if (linkedContract?.length)
    throw new Error(
      "Bu teklife bağlı bir sözleşme var, önce sözleşmeyi silin veya bu teklifi silmeyin.",
    );

  // Silinen kaydın kimliği geçmişte kalsın diye önce okuyoruz.
  const { data: doomed } = await supabase
    .from("crm_proposals")
    .select("proposal_no,title,amount,currency,opportunity_id")
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  // RLS izin vermezse delete hata döndürmez, sadece 0 satır siler.
  const { data: deleted, error } = await supabase
    .from("crm_proposals")
    .delete()
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id)
    .select("id");
  if (error) throw new Error("Teklif silinemedi: " + error.message);
  if (!deleted?.length)
    throw new Error("Teklif silinemedi: kayıt bulunamadı veya silme yetkiniz yok.");

  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "delete",
    entityType: "crm_proposal",
    entityId: proposalId,
    opportunityId: String(doomed?.opportunity_id ?? ""),
    note: doomed ? `${doomed.proposal_no} · ${doomed.title} silindi` : "Teklif silindi",
  });

  revalidatePath("/panel/crm/proposals");
  revalidatePath("/panel/crm");
  // Detay sayfasında kalırsak silinen kayıt yeniden okunur ve 404 döner.
  redirect("/panel/crm/proposals");
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
async function resolveProposal__impl(formData: FormData) {
  const { supabase, membership, userId } = await getPanelContext();
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

  const { data: closed } = await supabase
    .from("crm_proposals")
    .select("opportunity_id")
    .eq("id", proposalId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "status",
    entityType: "crm_proposal",
    entityId: proposalId,
    opportunityId: String(closed?.opportunity_id ?? ""),
    changes: [{
      field: "status", label: "Durum",
      from: proposalStatusLabel(current?.status),
      to: proposalStatusLabel(chosen.status),
    }],
  });

  revalidatePath("/panel/crm/proposals");
  revalidatePath(`/panel/crm/proposals/${proposalId}`);
}


// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function updateProposal(...args: Parameters<typeof updateProposal__impl>) {
  return runPanelAction(() => updateProposal__impl(...args), "Teklif güncellendi");
}
export async function issueProposalLink(...args: Parameters<typeof issueProposalLink__impl>) {
  return runPanelAction(() => issueProposalLink__impl(...args));
}

export async function fastTrackProposalToContract(...args: Parameters<typeof fastTrackProposalToContract__impl>) {
  return runPanelAction(() => fastTrackProposalToContract__impl(...args), "Sözleşme oluşturuldu");
}
export async function deleteProposal(...args: Parameters<typeof deleteProposal__impl>) {
  return runPanelAction(() => deleteProposal__impl(...args));
}
export async function resolveProposal(...args: Parameters<typeof resolveProposal__impl>) {
  return runPanelAction(() => resolveProposal__impl(...args));
}

