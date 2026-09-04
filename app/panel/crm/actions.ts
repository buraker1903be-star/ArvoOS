"use server";

import { revalidatePath } from "next/cache";
import { diffFields, logActivity } from "@/lib/activity-log";
import { requestStageNames } from "./request-status";
import { getPanelContext } from "@/lib/panel-context";

const defaultProbability: Record<string, number> = {
  lead: 10,
  qualified: 25,
  proposal: 50,
  lost: 0,
};
const text = (formData: FormData, key: string, max = 500) =>
  String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
async function crmContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "crm"))
    throw new Error("CRM modülüne erişiminiz yok.");
  return context;
}
async function getStageConfiguration(
  supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"],
  organizationId: string,
) {
  const { data, error } = await supabase
    .from("organization_crm_stages")
    .select("code,probability")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (error) throw new Error("CRM aşamaları okunamadı: " + error.message);
  return new Map(
    (data ?? []).map((item) => [String(item.code), Number(item.probability)]),
  );
}
async function validateSalesEmployee(
  supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"],
  organizationId: string,
  employeeId: string,
) {
  if (!employeeId) return { employeeId: null, userId: null };
  const { data, error } = await supabase
    .from("hr_employees")
    .select("id,user_id")
    .eq("organization_id", organizationId)
    .eq("id", employeeId)
    .eq("employment_status", "active")
    .eq("can_receive_sales_requests", true)
    .maybeSingle();
  if (error)
    throw new Error("Satış temsilcisi doğrulanamadı: " + error.message);
  if (!data)
    throw new Error("Seçilen personel satış talebi almaya yetkili değil.");
  return { employeeId: data.id, userId: data.user_id ?? null };
}

export async function createOpportunity(formData: FormData) {
  const { supabase, userId, membership } = await crmContext();
  const title = text(formData, "title", 180);
  const customerName = text(formData, "customer_name", 180);
  const selectedServiceType = text(formData, "service_type", 120);
  const customServiceType = text(formData, "other_service_type", 120);
  if (title.length < 2)
    throw new Error("Talep konusu en az 2 karakter olmalıdır.");
  if (customerName.length < 2)
    throw new Error("Müşteri veya kurum adı en az 2 karakter olmalıdır.");
  if (selectedServiceType === "Diğer" && customServiceType.length < 2)
    throw new Error("Diğer hizmet türünü yazmalısınız.");
  const canAssign = ["owner", "admin", "manager"].includes(membership.role);
  let assignment;
  if (canAssign) {
    assignment = await validateSalesEmployee(
      supabase,
      membership.organization_id,
      text(formData, "assigned_employee_id", 80),
    );
  } else {
    const { data: employee, error: employeeError } = await supabase
      .from("hr_employees")
      .select("id,user_id")
      .eq("organization_id", membership.organization_id)
      .eq("user_id", userId)
      .eq("employment_status", "active")
      .eq("can_receive_sales_requests", true)
      .maybeSingle();
    if (employeeError)
      throw new Error(
        "Satış personeli bilgisi okunamadı: " + employeeError.message,
      );
    if (!employee)
      throw new Error(
        "Hesabınız aktif bir satış personeli kaydıyla eşleşmiyor.",
      );
    assignment = { employeeId: employee.id, userId: employee.user_id };
  }
  const stageMap = await getStageConfiguration(
    supabase,
    membership.organization_id,
  );
  const details = {
    customer_type: text(formData, "customer_type", 40),
    university: text(formData, "university", 180),
    department: text(formData, "department", 180),
    academic_level: text(formData, "academic_level", 80),
    service_type:
      selectedServiceType === "Diğer" ? customServiceType : selectedServiceType,
    language: text(formData, "language", 80),
    scope: text(formData, "scope", 4000),
  };
  // --- GEÇİCİ TEŞHİS ---
  // RLS reddinin sebebini bulmak için eklendi. Politika şunu istiyor:
  //   created_by = auth.uid()  VE  (yetkili üye  VEYA  kayıt bana atanmış)
  // Aşağıdaki üç değer, bu koşulun neden sağlanmadığını gösterecek.
  // Sorun çözülünce bu blok kaldırılacak.
  const { data: probeUser } = await supabase.auth.getUser();
  const { data: probeMembership } = await supabase
    .from("organization_memberships")
    .select("role,is_active")
    .eq("organization_id", membership.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  console.log("[TALEP-TESHIS]", JSON.stringify({
    contextUserId: userId,
    authUserId: probeUser?.user?.id ?? null,
    esitMi: probeUser?.user?.id === userId,
    organizationId: membership.organization_id,
    contextRole: membership.role,
    dbRole: probeMembership?.role ?? "UYELIK OKUNAMADI",
    dbAktif: probeMembership?.is_active ?? null,
    assignedEmployeeId: assignment.employeeId,
  }));
  // --- GEÇİCİ TEŞHİS SONU ---

  const { error } = await supabase.from("crm_opportunities").insert({
    organization_id: membership.organization_id,
    title,
    customer_name: customerName,
    contact_email: text(formData, "contact_email", 240) || null,
    contact_phone: text(formData, "contact_phone", 80) || null,
    source: text(formData, "source", 160) || null,
    notes: text(formData, "notes", 4000) || null,
    expected_close_date: text(formData, "expected_close_date", 20) || null,
    estimated_value: 0,
    probability: stageMap.get("lead") ?? defaultProbability.lead,
    stage: "lead",
    request_details: details,
    assigned_employee_id: assignment.employeeId,
    owner_user_id: assignment.userId,
    created_by: userId,
  });
  if (error) throw new Error("Talep oluşturulamadı: " + error.message);

  // Kaydı ayrı bir sorguyla okuyoruz. insert(...).select(...) kullanmak
  // insert'i "eklenen satırı geri döndür" moduna sokuyor ve SELECT
  // politikasının da geçmesini şart koşuyordu; o politika atama kısıtlı
  // olduğu için kayıt oluşturmayı riske atıyordu. Geçmiş kaydı, talebin
  // kendisinden daha az önemli: okunamazsa sessizce atlanıyor.
  const { data: created } = await supabase
    .from("crm_opportunities")
    .select("id,title,customer_name")
    .eq("organization_id", membership.organization_id)
    .eq("created_by", userId)
    .eq("title", title)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (created?.id) {
    await logActivity(supabase, {
      organizationId: membership.organization_id,
      actorUserId: userId,
      action: "create",
      entityType: "crm_opportunity",
      entityId: created.id,
      opportunityId: created.id,
      note: `${created.customer_name} · ${created.title}`,
    });
  }

  revalidatePath("/panel/crm");
  revalidatePath("/panel");
}

export async function updateOpportunity(formData: FormData) {
  const { supabase, membership, userId } = await crmContext();
  const opportunityId = text(formData, "opportunity_id", 80);
  const currentDetails = JSON.parse(
    text(formData, "current_details", 10000) || "{}",
  );
  const requestDetails = {
    ...currentDetails,
    service_type: text(formData, "service_type", 180),
    academic_level: text(formData, "academic_level", 80),
    university: text(formData, "university", 180),
    department: text(formData, "department", 180),
    language: text(formData, "language", 80),
    scope: text(formData, "scope", 4000),
  };
  const canAssign = ["owner", "admin", "manager"].includes(membership.role);
  const assignment = canAssign
    ? await validateSalesEmployee(
        supabase,
        membership.organization_id,
        text(formData, "assigned_employee_id", 80),
      )
    : null;
  // Değişikliği yazabilmek için önceki hali gerekiyor.
  const { data: before } = await supabase
    .from("crm_opportunities")
    .select("title,customer_name,contact_email,contact_phone,source,notes,expected_close_date,assigned_employee_id,stage")
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("crm_opportunities")
    .update({
      title: text(formData, "title", 180),
      customer_name: text(formData, "customer_name", 180),
      contact_email: text(formData, "contact_email", 240) || null,
      contact_phone: text(formData, "contact_phone", 80) || null,
      source: text(formData, "source", 160) || null,
      notes: text(formData, "notes", 4000) || null,
      expected_close_date: text(formData, "expected_close_date", 20) || null,
      request_details: requestDetails,
      ...(canAssign
        ? {
            assigned_employee_id: assignment!.employeeId,
            owner_user_id: assignment!.userId,
          }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .select("id,title,customer_name,contact_email,contact_phone,source,notes,expected_close_date,assigned_employee_id,stage")
    .maybeSingle();
  if (error) throw new Error("Talep güncellenemedi: " + error.message);
  if (!data) throw new Error("Talep bulunamadı veya yetkiniz yok.");

  // Geçmişte "a1b2c3… → d4e5f6…" yazmasın diye temsilci id'lerini
  // okunabilir isme çeviriyoruz.
  const employeeIds = [before?.assigned_employee_id, data.assigned_employee_id]
    .filter((value): value is string => Boolean(value));
  const { data: employeeRows } = employeeIds.length
    ? await supabase
        .from("hr_employees")
        .select("id,full_name")
        .eq("organization_id", membership.organization_id)
        .in("id", employeeIds)
    : { data: [] };
  const employeeNames = new Map((employeeRows ?? []).map((e) => [e.id, e.full_name]));

  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "update",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    opportunityId,
    changes: diffFields(before, data, [
      "title", "customer_name", "contact_email", "contact_phone",
      "source", "notes", "expected_close_date", "assigned_employee_id", "stage",
    ], { assigned_employee_id: (v) => employeeNames.get(v) ?? (v ? "Atandı" : "Atanmadı") }),
  });

  revalidatePath("/panel/crm");
  revalidatePath(`/panel/crm/requests/${opportunityId}`);
}

export async function archiveOpportunity(formData: FormData) {
  const { supabase, membership, userId } = await crmContext();
  if (!["owner", "admin", "manager"].includes(membership.role))
    throw new Error(
      "Talep silme işlemi yalnızca yöneticiler tarafından yapılabilir.",
    );
  const opportunityId = text(formData, "opportunity_id", 80);
  // Silinen kaydın adı geçmişte görünsün diye önceden okuyoruz;
  // sonrasında satır artık okunamayacak.
  const { data: archivedRow } = await supabase
    .from("crm_opportunities")
    .select("title,customer_name")
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("crm_opportunities")
    .update({
      stage: "lost",
      probability: 0,
      lost_reason:
        text(formData, "archive_reason", 500) ||
        "Talep iptal edilerek arşivlendi.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Talep arşivlenemedi: " + error.message);
  if (!data) throw new Error("Talep bulunamadı veya yetkiniz yok.");

  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "archive",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    opportunityId,
    note: archivedRow
      ? `${archivedRow.customer_name} · ${archivedRow.title} arşivlendi`
      : "Talep arşivlendi",
  });

  revalidatePath("/panel/crm");
  revalidatePath("/panel/crm/proposals");
  revalidatePath("/panel");
}
export async function moveOpportunity(formData: FormData) {
  const { supabase, membership, userId } = await crmContext();
  const opportunityId = text(formData, "opportunity_id", 80);
  const stage = text(formData, "stage", 80);
  if (!new Set(["lead", "qualified", "proposal", "lost"]).has(stage))
    throw new Error("Geçersiz talep durumu.");
  const lostReason = text(formData, "lost_reason", 500);
  if (stage === "lost" && lostReason.length < 2)
    throw new Error("Arşiv nedeni girilmelidir.");
  const stageMap = await getStageConfiguration(
    supabase,
    membership.organization_id,
  );
  const { data: beforeStage } = await supabase
    .from("crm_opportunities")
    .select("stage")
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("crm_opportunities")
    .update({
      stage,
      probability: stageMap.get(stage) ?? defaultProbability[stage] ?? 0,
      lost_reason: stage === "lost" ? lostReason : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Talep durumu güncellenemedi: " + error.message);
  if (!data)
    throw new Error("Talep bulunamadı veya bu kaydı güncelleme yetkiniz yok.");

  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "stage",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    opportunityId,
    changes: [{
      field: "stage", label: "Aşama",
      from: requestStageNames[beforeStage?.stage ?? ""] ?? (beforeStage?.stage ?? ""),
      to: requestStageNames[stage] ?? stage,
    }],
    note: stage === "lost" && lostReason ? `Kayıp nedeni: ${lostReason}` : undefined,
  });

  revalidatePath("/panel/crm");
  revalidatePath(`/panel/crm/requests/${opportunityId}`);
  revalidatePath("/panel");
}

export async function addInternalComment(formData: FormData) {
  const { supabase, membership, userId } = await crmContext();
  const opportunityId = text(formData, "opportunity_id", 80);
  const contextType = text(formData, "context_type", 20);
  const contextId = text(formData, "context_id", 80);
  const body = text(formData, "body", 4000);
  if (!opportunityId || !contextId || !new Set(["request", "proposal", "contract", "operation"]).has(contextType))
    throw new Error("Yorumun bağlı olduğu CRM kaydı geçersiz.");
  if (!body) throw new Error("Yorum metni boş bırakılamaz.");

  const { data: opportunity, error: opportunityError } = await supabase
    .from("crm_opportunities")
    .select("id")
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (opportunityError || !opportunity) throw new Error("Talep zinciri bulunamadı veya bu kayda erişiminiz yok.");

  const { error } = await supabase.from("crm_internal_comments").insert({
    organization_id: membership.organization_id,
    opportunity_id: opportunityId,
    context_type: contextType,
    context_id: contextId,
    body,
    created_by: userId,
  });
  if (error) throw new Error("Kurum içi yorum eklenemedi: " + error.message);

  revalidatePath(`/panel/crm/requests/${opportunityId}`);
  revalidatePath("/panel/crm/proposals");
  revalidatePath("/panel/crm/contracts");
  if (contextType === "operation") revalidatePath(`/panel/operations/${contextId}`);
}

/**
 * Yalnızca satış temsilcisini değiştirir.
 *
 * updateOpportunity tüm alanları birden yazdığı için "sadece atama yap"
 * amacıyla kullanılamaz — başlık, müşteri adı ve iletişim bilgileri
 * boşalırdı. Bu yüzden ayrı ve dar kapsamlı bir action.
 */
export async function assignOpportunity(formData: FormData) {
  const { supabase, membership, userId } = await crmContext();
  if (!["owner", "admin", "manager"].includes(membership.role)) {
    throw new Error("Temsilci atama yetkiniz yok.");
  }
  const opportunityId = text(formData, "opportunity_id", 80);
  const assignment = await validateSalesEmployee(
    supabase,
    membership.organization_id,
    text(formData, "assigned_employee_id", 80),
  );
  const { data, error } = await supabase
    .from("crm_opportunities")
    .update({
      assigned_employee_id: assignment.employeeId,
      owner_user_id: assignment.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Temsilci atanamadı: " + error.message);
  if (!data) throw new Error("Talep bulunamadı veya yetkiniz yok.");

  const { data: assigned } = await supabase
    .from("hr_employees")
    .select("full_name")
    .eq("id", assignment.employeeId ?? "")
    .maybeSingle();
  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "assign",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    opportunityId,
    note: assigned?.full_name ? `${assigned.full_name} atandı` : "Temsilci değiştirildi",
  });

  revalidatePath("/panel/crm");
  revalidatePath(`/panel/crm/requests/${opportunityId}`);
}

/** Yorum sayfalarının tamamını tazeler; yorum zinciri dört yerde birden görünüyor. */
function revalidateCommentChain(opportunityId: string, contextType: string, contextId: string) {
  revalidatePath(`/panel/crm/requests/${opportunityId}`);
  revalidatePath("/panel/crm/proposals");
  revalidatePath("/panel/crm/contracts");
  if (contextType === "proposal") revalidatePath(`/panel/crm/proposals/${contextId}`);
  if (contextType === "contract") revalidatePath(`/panel/crm/contracts/${contextId}`);
  if (contextType === "operation") revalidatePath(`/panel/operations/${contextId}`);
}

/**
 * Kendi yorumunu düzenler.
 *
 * Yetki kontrolünü burada da yapıyoruz ama asıl güvence RLS'te:
 * "authors edit own crm internal comments" politikası created_by
 * eşleşmeyen satırı hiç döndürmüyor.
 */
export async function updateInternalComment(formData: FormData) {
  const { supabase, membership, userId } = await crmContext();
  const commentId = text(formData, "comment_id", 80);
  const body = text(formData, "body", 4000);
  const opportunityId = text(formData, "opportunity_id", 80);
  const contextType = text(formData, "context_type", 20);
  const contextId = text(formData, "context_id", 80);
  if (!commentId) throw new Error("Yorum seçilmedi.");
  if (!body) throw new Error("Yorum metni boş bırakılamaz.");

  const { data, error } = await supabase
    .from("crm_internal_comments")
    .update({ body, edited_at: new Date().toISOString() })
    .eq("id", commentId)
    .eq("organization_id", membership.organization_id)
    .eq("created_by", userId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Yorum güncellenemedi: " + error.message);
  if (!data) throw new Error("Yorum bulunamadı veya yalnızca kendi yorumunuzu düzenleyebilirsiniz.");

  revalidateCommentChain(opportunityId, contextType, contextId);
}

/**
 * Yorumu siler. Kendi yorumu herkes, başkasınınkini yönetici silebilir;
 * ayrımı RLS politikası yapıyor.
 */
export async function deleteInternalComment(formData: FormData) {
  const { supabase, membership } = await crmContext();
  const commentId = text(formData, "comment_id", 80);
  const opportunityId = text(formData, "opportunity_id", 80);
  const contextType = text(formData, "context_type", 20);
  const contextId = text(formData, "context_id", 80);
  if (!commentId) throw new Error("Yorum seçilmedi.");

  const { data, error } = await supabase
    .from("crm_internal_comments")
    .delete()
    .eq("id", commentId)
    .eq("organization_id", membership.organization_id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Yorum silinemedi: " + error.message);
  if (!data) throw new Error("Yorum bulunamadı veya silme yetkiniz yok.");

  revalidateCommentChain(opportunityId, contextType, contextId);
}
