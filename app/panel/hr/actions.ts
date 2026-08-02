"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

function text(formData: FormData, key: string, max = 180) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function requireAdmin(role: string) {
  if (!["owner", "admin"].includes(role)) throw new Error("Bu işlem yalnızca kurum sahibi veya yöneticisi tarafından yapılabilir.");
}

export async function createDepartment(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  requireAdmin(membership.role);
  const name = text(formData, "name", 120);
  const code = text(formData, "code", 20);
  if (name.length < 2) throw new Error("Departman adı en az 2 karakter olmalıdır.");
  const { error } = await supabase.from("hr_departments").insert({ organization_id: membership.organization_id, name, code: code || null });
  if (error) throw new Error("Departman oluşturulamadı: " + error.message);
  revalidatePath("/panel/hr");
}

export async function createEmployee(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  requireAdmin(membership.role);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Oturum doğrulanamadı.");
  const firstName = text(formData, "first_name", 80);
  const lastName = text(formData, "last_name", 80);
  if (!firstName || !lastName) throw new Error("Ad ve soyad zorunludur.");
  const { error } = await supabase.from("hr_employees").insert({
    organization_id: membership.organization_id,
    department_id: text(formData, "department_id") || null,
    employee_no: text(formData, "employee_no", 40) || null,
    first_name: firstName,
    last_name: lastName,
    email: text(formData, "email", 180) || null,
    phone: text(formData, "phone", 40) || null,
    position_title: text(formData, "position_title", 120) || null,
    employment_type: text(formData, "employment_type", 20) || "full_time",
    employment_status: "active",
    hire_date: text(formData, "hire_date", 10) || null,
    created_by: userData.user.id,
  });
  if (error) throw new Error("Personel oluşturulamadı: " + error.message);
  revalidatePath("/panel/hr");
}

export async function createLeaveRequest(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Oturum doğrulanamadı.");
  const employeeId = text(formData, "employee_id");
  const startDate = text(formData, "start_date", 10);
  const endDate = text(formData, "end_date", 10);
  const totalDays = Number(text(formData, "total_days", 10).replace(",", "."));
  if (!employeeId || !startDate || !endDate || !Number.isFinite(totalDays) || totalDays <= 0) throw new Error("İzin bilgileri eksik veya geçersiz.");
  const { error } = await supabase.from("hr_leave_requests").insert({
    organization_id: membership.organization_id,
    employee_id: employeeId,
    leave_type: text(formData, "leave_type", 20) || "annual",
    start_date: startDate,
    end_date: endDate,
    total_days: totalDays,
    reason: text(formData, "reason", 1000) || null,
    created_by: userData.user.id,
  });
  if (error) throw new Error("İzin talebi oluşturulamadı: " + error.message);
  revalidatePath("/panel/hr");
}

export async function reviewLeaveRequest(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  requireAdmin(membership.role);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Oturum doğrulanamadı.");
  const requestId = text(formData, "request_id");
  const status = text(formData, "status", 20);
  if (!requestId || !["approved", "rejected"].includes(status)) throw new Error("Geçersiz izin işlemi.");
  const { error } = await supabase.from("hr_leave_requests").update({ status, reviewed_by: userData.user.id, reviewed_at: new Date().toISOString() }).eq("id", requestId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("İzin talebi güncellenemedi: " + error.message);
  revalidatePath("/panel/hr");
}
