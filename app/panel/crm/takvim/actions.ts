"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";

const managerRoles = new Set(["owner", "admin", "manager"]);

async function resolveContext() {
  const { supabase, membership, userId, modules, hiddenModuleKeys } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  assertModuleKeyAccess(membership.role, "crm", hiddenModuleKeys);
  const isManager = managerRoles.has(membership.role);
  const { data: ownEmployee } = await supabase.from("hr_employees").select("id").eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle();
  return { supabase, organizationId: membership.organization_id, isManager, ownEmployeeId: ownEmployee?.id ?? null, userId };
}

function toTimestamp(dateValue: string, timeValue: string) {
  if (!dateValue) throw new Error("Randevu tarihi zorunludur.");
  const time = timeValue || "09:00";
  const iso = new Date(`${dateValue}T${time}:00`);
  if (Number.isNaN(iso.getTime())) throw new Error("Geçerli bir tarih/saat girin.");
  return iso.toISOString();
}

async function createAppointment__impl(formData: FormData) {
  const { supabase, organizationId, isManager, ownEmployeeId, userId } = await resolveContext();
  const requestedEmployeeId = String(formData.get("employee_id") ?? "").trim();
  const employeeId = isManager && requestedEmployeeId ? requestedEmployeeId : ownEmployeeId;
  if (!employeeId) throw new Error("Randevunun bağlı olacağı bir personel bulunamadı. Önce Ekip Yönetimi'nden panel erişiminizi tanımlayın.");

  const title = String(formData.get("title") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const startsAt = toTimestamp(String(formData.get("starts_date") ?? ""), String(formData.get("starts_time") ?? ""));
  const endsTimeRaw = String(formData.get("ends_time") ?? "").trim();
  const endsAt = endsTimeRaw ? toTimestamp(String(formData.get("starts_date") ?? ""), endsTimeRaw) : null;

  if (title.length < 2 || title.length > 160) throw new Error("Randevu konusu 2–160 karakter olmalı.");

  const { error } = await supabase.from("crm_appointments").insert({
    organization_id: organizationId,
    employee_id: employeeId,
    title,
    contact_name: contactName || null,
    contact_phone: contactPhone || null,
    note: note || null,
    starts_at: startsAt,
    ends_at: endsAt,
    created_by: userId,
  });
  if (error) throw new Error("Randevu oluşturulamadı: " + error.message);

  revalidatePath("/panel/crm/takvim");
  redirect(String(formData.get("return_to") ?? "/panel/crm/takvim"));
}

async function updateAppointmentStatus__impl(formData: FormData) {
  const { supabase, organizationId } = await resolveContext();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!appointmentId) throw new Error("Randevu seçilmedi.");
  if (!["planned", "done", "cancelled"].includes(status)) throw new Error("Geçersiz durum.");
  const { error } = await supabase.from("crm_appointments").update({ status, updated_at: new Date().toISOString() }).eq("id", appointmentId).eq("organization_id", organizationId);
  if (error) throw new Error("Randevu durumu güncellenemedi: " + error.message);
  revalidatePath("/panel/crm/takvim");
}

async function deleteAppointment__impl(formData: FormData) {
  const { supabase, organizationId } = await resolveContext();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  if (!appointmentId) throw new Error("Randevu seçilmedi.");
  const { error } = await supabase.from("crm_appointments").delete().eq("id", appointmentId).eq("organization_id", organizationId);
  if (error) throw new Error("Randevu silinemedi: " + error.message);
  revalidatePath("/panel/crm/takvim");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function createAppointment(...args: Parameters<typeof createAppointment__impl>) {
  return runPanelAction(() => createAppointment__impl(...args), "Randevu oluşturuldu");
}
export async function updateAppointmentStatus(...args: Parameters<typeof updateAppointmentStatus__impl>) {
  return runPanelAction(() => updateAppointmentStatus__impl(...args));
}
export async function deleteAppointment(...args: Parameters<typeof deleteAppointment__impl>) {
  return runPanelAction(() => deleteAppointment__impl(...args));
}
