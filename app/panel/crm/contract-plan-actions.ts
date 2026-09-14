"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity-log";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext as getBasePanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { addendumErrorMessage, isIsoDate, workPlanIssue } from "@/lib/work-plan";

// Sözleşme iş planı (ara teslim takvimi) ve ek protokol işlemleri.
// Kurallar veritabanında: 20260914090000_contract_work_plan_addenda.sql
//
// DİKKAT: "use server" dosyasında `export type { X }` (yeniden dışa aktarma)
// yazmayın; modül yüklenirken çöküyor. `export type X = {...}` sorunsuz.

export type ContractPlanState = { error: string | null; success: string | null };

async function getPanelContext() {
  const context = await getBasePanelContext();
  assertModuleKeyAccess(context.membership.role, "crm", context.hiddenModuleKeys);
  return context;
}

const text = (formData: FormData, key: string, max = 4000) => String(formData.get(key) ?? "").trim().slice(0, max);
const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return null;
  }
};
const fail = (error: string): ContractPlanState => ({ error, success: null });
const MIGRATION_HINT = "Veritabanı güncellemesi (20260914090000_contract_work_plan_addenda) uygulanmış mı kontrol edin.";

/** İmza öncesi sözleşmeye ara teslim takvimi yazar; boş liste takvimi kaldırır. */
export async function updateContractWorkPlan(_previousState: ContractPlanState, formData: FormData): Promise<ContractPlanState> {
  const contractId = text(formData, "contract_id", 80);
  const plan = parseJson(text(formData, "work_plan", 20000));
  if (!contractId) return fail("Sözleşme bulunamadı.");
  const issue = workPlanIssue(plan);
  if (issue) return fail(issue);
  const items = plan as { title: string; due_date: string }[];

  const { supabase, membership, userId } = await getPanelContext();
  const { data: current } = await supabase
    .from("crm_contracts")
    .select("id,status")
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!current) return fail("Sözleşme bulunamadı veya bu sözleşmeye erişiminiz yok.");
  if (["signed", "completed"].includes(current.status)) return fail("Bu sözleşme imzalandı; iş planını değiştirmek için Ek Protokol oluşturun.");
  if (["rejected", "cancelled"].includes(current.status)) return fail("Reddedilen veya iptal edilen sözleşmenin iş planı değiştirilemez.");

  // RLS satırı sessizce elerse güncelleme 0 satır döner; .select ile yakalanır.
  const { data, error } = await supabase
    .from("crm_contracts")
    .update({ work_plan: items.length ? items : null, updated_at: new Date().toISOString() })
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .select("id,opportunity_id")
    .maybeSingle();
  if (error) {
    return fail(addendumErrorMessage(error.message, error.message.includes("work_plan") ? `İş planı kaydedilemedi. ${MIGRATION_HINT}` : `İş planı kaydedilemedi: ${error.message}`));
  }
  if (!data) return fail("Sözleşme güncellenemedi; bu sözleşmeyi düzenleme yetkiniz olmayabilir.");

  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "update",
    entityType: "crm_contract",
    entityId: data.id,
    opportunityId: data.opportunity_id,
    note: items.length ? `İş planı güncellendi (${items.length} ara teslim)` : "İş planı kaldırıldı",
  });
  revalidatePath(`/panel/crm/contracts/${contractId}`);
  return { error: null, success: items.length ? "İş planı kaydedildi; sözleşmede ve müşterinin takip sayfasında görünür." : "İş planı kaldırıldı." };
}

/** İmzalı sözleşme için ek protokol oluşturur ve müşterinin onayına sunar. */
export async function createContractAddendum(_previousState: ContractPlanState, formData: FormData): Promise<ContractPlanState> {
  const contractId = text(formData, "contract_id", 80);
  const plan = parseJson(text(formData, "work_plan", 20000));
  const dates = parseJson(text(formData, "payment_dates", 5000));
  const note = text(formData, "note", 2000);
  if (!contractId) return fail("Sözleşme bulunamadı.");
  const issue = workPlanIssue(plan);
  if (issue) return fail(issue);
  const dateRows = Array.isArray(dates) ? (dates as { sequence?: unknown; due_date?: unknown }[]) : null;
  if (!dateRows || dateRows.some((row) => !Number.isInteger(Number(row?.sequence)) || !isIsoDate(row?.due_date))) {
    return fail("Ödeme tarihleri okunamadı. Tarihleri kontrol edin.");
  }
  if (!(plan as unknown[]).length && !dateRows.length) {
    return fail("Ek protokola en az bir ara teslim ya da değişen bir taksit vadesi girin.");
  }

  const { supabase, membership, userId } = await getPanelContext();
  const { data: addendumId, error } = await supabase.rpc("arvo_create_contract_addendum", {
    p_contract_id: contractId,
    p_work_plan: plan,
    p_payment_dates: dateRows.map((row) => ({ sequence: Number(row.sequence), due_date: row.due_date })),
    p_note: note || null,
  });
  if (error) {
    console.error("arvo_create_contract_addendum failed", { code: error.code, message: error.message });
    return fail(addendumErrorMessage(error.message, error.message.includes("arvo_create_contract_addendum") ? `Ek protokol oluşturulamadı. ${MIGRATION_HINT}` : `Ek protokol oluşturulamadı: ${error.message}`));
  }

  const { data: addendum } = await supabase
    .from("crm_contract_addenda")
    .select("addendum_no,opportunity_id")
    .eq("id", String(addendumId))
    .maybeSingle();
  if (addendum) {
    await logActivity(supabase, {
      organizationId: membership.organization_id,
      actorUserId: userId,
      action: "update",
      entityType: "crm_contract",
      entityId: contractId,
      opportunityId: addendum.opportunity_id,
      note: `Ek Protokol ${addendum.addendum_no} müşterinin onayına sunuldu`,
    });
  }
  revalidatePath(`/panel/crm/contracts/${contractId}`);
  const label = addendum ? `Ek Protokol ${addendum.addendum_no}` : "Ek protokol";
  return { error: null, success: `${label} müşterinin onayına sunuldu. Sözleşme bağlantısını müşteriye iletin; onay sözleşme sayfasından verilir.` };
}

/**
 * Müşterinin takip ekranından yazdığı mesaja sözleşme sayfasından yanıt.
 * İmzadan önce iş akışı olmadığı için yanıt yalnızca sözleşmeye bağlanır;
 * iş oluşunca mesajlar veritabanında işe bağlanır.
 */
export async function replyContractMessage(formData: FormData) {
  await runPanelAction(async () => {
    const contractId = text(formData, "contract_id", 80);
    const body = text(formData, "body", 2000);
    if (body.length < 2) throw new Error("Yanıt 2–2000 karakter olmalı.");
    const { supabase, membership, userId } = await getPanelContext();
    const [{ data: contract }, { data: employee }] = await Promise.all([
      supabase.from("crm_contracts").select("id,workflow_id,status").eq("id", contractId).eq("organization_id", membership.organization_id).maybeSingle(),
      supabase.from("hr_employees").select("full_name").eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle(),
    ]);
    if (!contract) throw new Error("Sözleşme bulunamadı veya bu sözleşmeye erişiminiz yok.");
    if (["rejected", "cancelled"].includes(contract.status)) throw new Error("Reddedilen veya iptal edilen sözleşmede mesajlaşma kapalı.");
    const { error } = await supabase.from("customer_file_messages").insert({
      organization_id: membership.organization_id,
      contract_id: contract.id,
      workflow_id: contract.workflow_id,
      sender_type: "staff",
      sender_user_id: userId,
      sender_name: employee?.full_name || "Müşteri Temsilcisi",
      body,
    });
    if (error) throw new Error("Müşteriye yanıt gönderilemedi: " + error.message);
    await supabase
      .from("customer_file_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("contract_id", contract.id)
      .eq("organization_id", membership.organization_id)
      .eq("sender_type", "customer")
      .is("read_at", null);
    revalidatePath(`/panel/crm/contracts/${contract.id}`);
  }, "Yanıt müşteriye gönderildi");
}

/**
 * İmza öncesi takibi sözleşme bazında açar/kapatır. Varsayılan kapalı:
 * müşteri takip ekranına imzadan sonra girer. İmzalı sözleşmede her zaman açık.
 */
export async function setTrackingBeforeSignature(formData: FormData) {
  const open = text(formData, "open", 2) === "1";
  await runPanelAction(async () => {
    const contractId = text(formData, "contract_id", 80);
    const { supabase, membership, userId } = await getPanelContext();
    const { data, error } = await supabase
      .from("crm_contracts")
      .update({ tracking_open_before_signature: open, updated_at: new Date().toISOString() })
      .eq("id", contractId)
      .eq("organization_id", membership.organization_id)
      .in("status", ["draft", "sent"])
      .select("id,opportunity_id")
      .maybeSingle();
    if (error) {
      throw new Error(error.message.includes("tracking_open_before_signature")
        ? "Takip ayarı kaydedilemedi. Veritabanı güncellemesi (20260914170000_tracking_open_toggle) uygulanmış mı kontrol edin."
        : `Takip ayarı kaydedilemedi: ${error.message}`);
    }
    if (!data) throw new Error("Takip ayarı yalnızca imza bekleyen sözleşmede değiştirilir veya bu sözleşmeyi düzenleme yetkiniz yok.");
    await logActivity(supabase, {
      organizationId: membership.organization_id,
      actorUserId: userId,
      action: "update",
      entityType: "crm_contract",
      entityId: data.id,
      opportunityId: data.opportunity_id,
      note: open ? "İmza öncesi takip açıldı" : "İmza öncesi takip kapatıldı",
    });
    revalidatePath(`/panel/crm/contracts/${contractId}`);
  }, open ? "İmza öncesi takip açıldı" : "İmza öncesi takip kapatıldı");
}

/** Onay bekleyen ek protokolü geri çeker. */
export async function cancelContractAddendum(formData: FormData) {
  await runPanelAction(async () => {
    const addendumId = text(formData, "addendum_id", 80);
    const { supabase, membership, userId } = await getPanelContext();
    const { data, error } = await supabase.rpc("arvo_cancel_contract_addendum", { p_addendum_id: addendumId });
    if (error) throw new Error(addendumErrorMessage(error.message, "Ek protokol geri çekilemedi."));
    if (data !== "cancelled") throw new Error("Bu ek protokol artık onay beklemiyor; geri çekilemez.");
    const { data: addendum } = await supabase
      .from("crm_contract_addenda")
      .select("addendum_no,opportunity_id,contract_id")
      .eq("id", addendumId)
      .maybeSingle();
    if (addendum) {
      await logActivity(supabase, {
        organizationId: membership.organization_id,
        actorUserId: userId,
        action: "update",
        entityType: "crm_contract",
        entityId: addendum.contract_id,
        opportunityId: addendum.opportunity_id,
        note: `Ek Protokol ${addendum.addendum_no} geri çekildi`,
      });
      revalidatePath(`/panel/crm/contracts/${addendum.contract_id}`);
    }
  }, "Ek protokol geri çekildi");
}
