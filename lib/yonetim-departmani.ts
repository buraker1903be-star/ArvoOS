/*
  "Bu kişi Yönetim departmanında mı" sorusunun TEK sorgusu.

  Yönetim departmanındaki çalışan veritabanı tetikleyicisiyle Kurum
  Sahibi (owner) oluyor (private.arvo_sync_management_owner). Rolünü
  panelden değiştirmeye çalışmak bu yüzden sessizce geri alınır; ekip
  eylemleri ve yetki profilleri önce buraya bakıp anlaşılır bir hata
  veriyor.

  Kural metni saf modülde (lib/management-department.ts, testli); bu
  dosya yalnızca onu veritabanına uyguluyor. Sorgu ekip eylemlerinde
  yazılmıştı; profil uygulama da aynı korumayı istediği için ortaya
  alındı — güvenlik kuralının iki kopyası, birinin eskimesi demek.
*/
import type { SupabaseClient } from "@supabase/supabase-js";
import { isManagementDepartmentName, MANAGEMENT_EMPLOYMENT_STATUSES } from "@/lib/management-department";

export async function yonetimDepartmanindaMi(
  supabase: SupabaseClient,
  organizationId: string,
  column: "id" | "user_id",
  value: string,
): Promise<boolean> {
  const { data: employees } = await supabase.from("hr_employees")
    .select("department_id,employment_status")
    .eq("organization_id", organizationId)
    .eq(column, value);
  const departmentIds = (employees ?? [])
    .filter((employee) => employee.department_id && MANAGEMENT_EMPLOYMENT_STATUSES.includes(employee.employment_status))
    .map((employee) => employee.department_id as string);
  if (!departmentIds.length) return false;
  const { data: departments } = await supabase.from("hr_departments")
    .select("name")
    .eq("organization_id", organizationId)
    .in("id", departmentIds);
  return (departments ?? []).some((department) => isManagementDepartmentName(department.name));
}
