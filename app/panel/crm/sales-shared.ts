// Teklif ve sözleşme işlemlerinin ortak yardımcıları (oturum bağlamı, form
// okuma, rol listeleri, temsilci ataması).
//
// Bu dosya bilerek "use server" DEĞİL: Next, server action dosyalarından
// yalnızca async fonksiyon dışa aktarılmasına izin verir, o yüzden sabitler
// ve tipler burada durur.
//
// Tutar hesapları burada değil, lib/sales-amounts.ts içinde: burası Supabase
// ve Next'e bağlı olduğu için birim testten import edilemez.

import { getPanelContext as getBasePanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";

// Teklif ve sözleşme işlemleri CRM modülüne bağlı; Yetkilendirme'den CRM'i
// kapatılmış bir rol bu işlemleri arka planda da çağıramasın.
export async function getPanelContext() {
  const context = await getBasePanelContext();
  assertModuleKeyAccess(context.membership.role, "crm", context.hiddenModuleKeys);
  return context;
}

/** Teklif ve direkt sözleşme formlarının ortak useActionState durumu. */
export type CreateProposalState = {
  error: string | null;
};

export const text = (formData: FormData, key: string, max = 4000) =>
  String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
export const amount = (formData: FormData, key: string) =>
  Math.round(Number(formData.get(key) ?? 0) * 100);

// Silme RLS politikası (crm_delete_policies) yalnızca owner/admin'e izin
// veriyor. Uygulama tarafı da aynı listeyi kullanmalı; aksi halde manager
// "Sil"e basıyor, RLS satırı sessizce eliyor ve kayıt silinmemiş oluyor.
export const DELETE_ROLES = ["owner", "admin"];
/* Yönetici rolleri kuruma ait her kayda erişir; diğerleri yalnızca
   kendilerine atanmış olanlara (private.arvo_can_access_opportunity ile
   aynı ayrım). */
export const MANAGER_ROLES = ["owner", "admin", "manager"];

// Teklif / direkt sözleşme oluşturmadan önce talebin satış temsilcisi
// olmalı. Atanmamışsa formdaki seçim zorunlu; seçilen temsilci talebe atanır
// (atama bildirimi tetikleyiciyle gider). Hata metni döner, sorun yoksa null.
export async function ensureRepresentative(
  supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"],
  organizationId: string,
  opportunityId: string,
  selectedEmployeeId: string,
): Promise<string | null> {
  const { data: opportunity } = await supabase
    .from("crm_opportunities")
    .select("id,assigned_employee_id")
    .eq("id", opportunityId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!opportunity) return "Talep bulunamadı veya bu talebe erişiminiz yok.";
  if (opportunity.assigned_employee_id) return null;
  if (!selectedEmployeeId) return "Bu talebe henüz satış temsilcisi atanmamış. Devam etmeden önce bir satış temsilcisi seçin.";
  const { data: employee } = await supabase
    .from("hr_employees")
    .select("id")
    .eq("id", selectedEmployeeId)
    .eq("organization_id", organizationId)
    .eq("employment_status", "active")
    .eq("can_receive_sales_requests", true)
    .maybeSingle();
  if (!employee) return "Seçilen satış temsilcisi aktif değil veya satış talebi alamıyor.";
  const { data: updated, error } = await supabase
    .from("crm_opportunities")
    .update({ assigned_employee_id: selectedEmployeeId, updated_at: new Date().toISOString() })
    .eq("id", opportunityId)
    .eq("organization_id", organizationId)
    .select("id");
  // RLS engellediğinde güncelleme sessizce 0 satır döner
  if (error || !updated?.length) return "Satış temsilcisi atanamadı. Bu işlem için yetkinizi kontrol edin.";
  return null;
}

export function proposalErrorMessage(message: string) {
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

