"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const statuses = new Set(["planned", "in_progress", "blocked", "completed", "cancelled"]);
const priorities = new Set(["low", "normal", "high", "urgent"]);

async function operationContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  return context;
}

export async function createWorkflow(formData: FormData) {
  const { supabase, userId, membership } = await operationContext();
  const title = String(formData.get("title") ?? "").trim();
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "planned");
  const priority = String(formData.get("priority") ?? "normal");
  const startDate = String(formData.get("start_date") ?? "") || null;
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const assignedEmployeeId = String(formData.get("assigned_employee_id") ?? "") || null;
  if (title.length < 2 || title.length > 180) throw new Error("İş başlığı 2–180 karakter olmalı.");
  if (!statuses.has(status) || status === "completed" || status === "cancelled") throw new Error("Geçersiz başlangıç durumu.");
  if (!priorities.has(priority)) throw new Error("Geçersiz öncelik.");
  if (startDate && dueDate && dueDate < startDate) throw new Error("Termin başlangıç tarihinden önce olamaz.");
  if (!["owner", "admin", "manager"].includes(membership.role)) throw new Error("İş oluşturmak için yönetici yetkisi gerekiyor.");
  if (assignedEmployeeId) {
    const { data: employee } = await supabase.from("hr_employees").select("id").eq("id", assignedEmployeeId).eq("organization_id", membership.organization_id).eq("employment_status", "active").maybeSingle();
    if (!employee) throw new Error("Atanacak aktif personel bulunamadı.");
  }
  const { error } = await supabase.from("operation_workflows").insert({ organization_id: membership.organization_id, title, customer_name: customerName || null, description: description || null, status, priority, start_date: startDate, due_date: dueDate, assigned_employee_id: assignedEmployeeId, created_by: userId });
  if (error) throw new Error("İş akışı oluşturulamadı: " + error.message);
  revalidatePath("/panel/operations"); revalidatePath("/panel");
}

export async function assignWorkflow(formData: FormData) {
  const { supabase, membership } = await operationContext();
  if (!["owner", "admin", "manager"].includes(membership.role)) throw new Error("Operasyon atamak için yönetici yetkisi gerekiyor.");
  const workflowId = String(formData.get("workflow_id") ?? "");
  const assignedEmployeeId = String(formData.get("assigned_employee_id") ?? "") || null;
  if (assignedEmployeeId) {
    const { data: employee } = await supabase.from("hr_employees").select("id").eq("id", assignedEmployeeId).eq("organization_id", membership.organization_id).eq("employment_status", "active").maybeSingle();
    if (!employee) throw new Error("Atanacak aktif personel bulunamadı.");
  }
  const { data, error } = await supabase.from("operation_workflows").update({ assigned_employee_id: assignedEmployeeId, updated_at: new Date().toISOString() }).eq("id", workflowId).eq("organization_id", membership.organization_id).select("id").maybeSingle();
  if (error) throw new Error("Operasyon sorumlusu güncellenemedi: " + error.message);
  if (!data) throw new Error("İş akışı bulunamadı.");
  revalidatePath("/panel/operations"); revalidatePath(`/panel/operations/${workflowId}`);
}

export async function addWorkflowStep(formData: FormData) {
  const { supabase, membership } = await operationContext();
  const workflowId = String(formData.get("workflow_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2 || title.length > 180) throw new Error("Adım adı 2–180 karakter olmalı.");
  const { data: workflow } = await supabase.from("operation_workflows").select("id").eq("id", workflowId).eq("organization_id", membership.organization_id).single();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  const { count } = await supabase.from("operation_steps").select("id", { count: "exact", head: true }).eq("workflow_id", workflowId);
  const { error } = await supabase.from("operation_steps").insert({ organization_id: membership.organization_id, workflow_id: workflowId, title, sort_order: (count ?? 0) * 10 + 10 });
  if (error) throw new Error("Adım eklenemedi: " + error.message);
  revalidatePath("/panel/operations"); revalidatePath(`/panel/operations/${workflowId}`);
}

export async function toggleWorkflowStep(formData: FormData) {
  const { supabase, userId, membership } = await operationContext();
  const stepId = String(formData.get("step_id") ?? "");
  const workflowId = String(formData.get("workflow_id") ?? "");
  const completed = String(formData.get("is_completed") ?? "") === "true";
  const { error } = await supabase.from("operation_steps").update({ is_completed: completed, completed_by: completed ? userId : null, completed_at: completed ? new Date().toISOString() : null }).eq("id", stepId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("İş adımı güncellenemedi: " + error.message);
  revalidatePath("/panel/operations"); revalidatePath("/panel"); if (workflowId) revalidatePath(`/panel/operations/${workflowId}`);
}

export async function setWorkflowStatus(formData: FormData) {
  const { supabase, membership } = await operationContext();
  const workflowId = String(formData.get("workflow_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!statuses.has(status)) throw new Error("Geçersiz durum.");
  const { error } = await supabase.from("operation_workflows").update({ status, updated_at: new Date().toISOString() }).eq("id", workflowId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("İş durumu güncellenemedi: " + error.message);
  revalidatePath("/panel/operations"); revalidatePath("/panel"); revalidatePath(`/panel/operations/${workflowId}`);
}

export async function addWorkflowComment(formData: FormData) {
  const { supabase, userId, membership } = await operationContext();
  const workflowId = String(formData.get("workflow_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 1 || body.length > 2000) throw new Error("Yorum 1–2000 karakter olmalı.");
  const { data: workflow } = await supabase.from("operation_workflows").select("id").eq("id", workflowId).eq("organization_id", membership.organization_id).single();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  const { error } = await supabase.from("operation_workflow_comments").insert({ organization_id: membership.organization_id, workflow_id: workflowId, body, created_by: userId });
  if (error) throw new Error("Yorum eklenemedi: " + error.message);
  revalidatePath(`/panel/operations/${workflowId}`);
}

export async function replyCustomerFileMessage(formData: FormData) {
  const { supabase, userId, membership } = await operationContext();
  const workflowId = String(formData.get("workflow_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 2 || body.length > 2000) throw new Error("Yanıt 2–2000 karakter olmalı.");
  const [{ data: workflow }, { data: employee }] = await Promise.all([
    supabase.from("operation_workflows").select("id,contract_id").eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle(),
    supabase.from("hr_employees").select("full_name").eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle(),
  ]);
  if (!workflow?.contract_id) throw new Error("Bu işe bağlı müşteri sözleşmesi bulunamadı.");
  const { error } = await supabase.from("customer_file_messages").insert({
    organization_id: membership.organization_id,
    contract_id: workflow.contract_id,
    workflow_id: workflowId,
    sender_type: "staff",
    sender_user_id: userId,
    sender_name: employee?.full_name || "Operasyon Ekibi",
    body,
  });
  if (error) throw new Error("Müşteriye yanıt gönderilemedi: " + error.message);
  await supabase.from("customer_file_messages").update({ read_at: new Date().toISOString() }).eq("workflow_id", workflowId).eq("sender_type", "customer").is("read_at", null);
  revalidatePath(`/panel/operations/${workflowId}`);
}

// Yanlışlıkla oluşturulmuş bir iş akışını kalıcı olarak siler. Sadece
// yönetici yetkisiyle kullanılabilir; adımlar ve yorumlar birlikte
// silinir, bağlı bir sözleşme varsa o sözleşmenin iş akışı bağlantısı
// (workflow_id) kopartılır ki sözleşme kaydı bozulmasın.
export async function deleteWorkflow(formData: FormData) {
  const { supabase, membership } = await operationContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Bu işlem için yönetici yetkisi gerekiyor.");
  const workflowId = String(formData.get("workflow_id") ?? "");
  if (!workflowId) throw new Error("İş akışı seçilmedi.");

  const { data: workflow } = await supabase.from("operation_workflows").select("id").eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!workflow) throw new Error("İş akışı bulunamadı.");

  await supabase.from("crm_contracts").update({ workflow_id: null }).eq("workflow_id", workflowId).eq("organization_id", membership.organization_id);
  await supabase.from("operation_workflow_comments").delete().eq("workflow_id", workflowId).eq("organization_id", membership.organization_id);
  await supabase.from("operation_steps").delete().eq("workflow_id", workflowId).eq("organization_id", membership.organization_id);

  const { error } = await supabase.from("operation_workflows").delete().eq("id", workflowId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("İş akışı silinemedi: " + error.message);

  revalidatePath("/panel/operations");
  revalidatePath("/panel");
  revalidatePath("/panel/crm/contracts");
}
