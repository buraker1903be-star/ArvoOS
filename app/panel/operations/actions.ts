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
  const steps = String(formData.get("steps") ?? "").split(/\r?\n/).map((step) => step.trim()).filter(Boolean).slice(0, 30);

  if (title.length < 2 || title.length > 180) throw new Error("İş başlığı 2–180 karakter olmalı.");
  if (!statuses.has(status) || status === "completed" || status === "cancelled") throw new Error("Geçersiz başlangıç durumu.");
  if (!priorities.has(priority)) throw new Error("Geçersiz öncelik.");
  if (startDate && dueDate && dueDate < startDate) throw new Error("Termin başlangıç tarihinden önce olamaz.");

  const { data: workflow, error } = await supabase.from("operation_workflows").insert({
    organization_id: membership.organization_id, title,
    customer_name: customerName || null, description: description || null,
    status, priority, start_date: startDate, due_date: dueDate, created_by: userId,
  }).select("id").single();
  if (error || !workflow) throw new Error("İş akışı oluşturulamadı: " + (error?.message ?? "Bilinmeyen hata"));

  if (steps.length) {
    const { error: stepError } = await supabase.from("operation_steps").insert(steps.map((step, index) => ({
      organization_id: membership.organization_id, workflow_id: workflow.id, title: step, sort_order: index,
    })));
    if (stepError) {
      await supabase.from("operation_workflows").delete().eq("id", workflow.id);
      throw new Error("İş adımları oluşturulamadı: " + stepError.message);
    }
  }
  revalidatePath("/panel/operations");
  revalidatePath("/panel");
}

export async function addWorkflowStep(formData: FormData) {
  const { supabase, membership } = await operationContext();
  const workflowId = String(formData.get("workflow_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2 || title.length > 180) throw new Error("Adım adı 2–180 karakter olmalı.");

  const { data: workflow } = await supabase.from("operation_workflows").select("id").eq("id", workflowId).eq("organization_id", membership.organization_id).single();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  const { count } = await supabase.from("operation_steps").select("id", { count: "exact", head: true }).eq("workflow_id", workflowId);
  const { error } = await supabase.from("operation_steps").insert({ organization_id: membership.organization_id, workflow_id: workflowId, title, sort_order: count ?? 0 });
  if (error) throw new Error("Adım eklenemedi: " + error.message);
  revalidatePath("/panel/operations");
}

export async function toggleWorkflowStep(formData: FormData) {
  const { supabase, userId, membership } = await operationContext();
  const stepId = String(formData.get("step_id") ?? "");
  const completed = String(formData.get("is_completed") ?? "") === "true";
  const { error } = await supabase.from("operation_steps").update({
    is_completed: completed, completed_by: completed ? userId : null, completed_at: completed ? new Date().toISOString() : null,
  }).eq("id", stepId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("İş adımı güncellenemedi: " + error.message);
  revalidatePath("/panel/operations");
  revalidatePath("/panel");
}

export async function setWorkflowStatus(formData: FormData) {
  const { supabase, membership } = await operationContext();
  const workflowId = String(formData.get("workflow_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!statuses.has(status)) throw new Error("Geçersiz durum.");
  const { error } = await supabase.from("operation_workflows").update({ status, updated_at: new Date().toISOString() })
    .eq("id", workflowId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("İş durumu güncellenemedi: " + error.message);
  revalidatePath("/panel/operations");
  revalidatePath("/panel");
}
