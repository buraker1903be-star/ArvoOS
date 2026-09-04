import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * CRM kayıt geçmişi.
 *
 * "Güncellendi" yazmak işe yaramıyor; kim neyi neyden neye çevirdi
 * görünmeli. Bu yüzden değişikliği alan alan çıkarıp metadata'ya
 * yazıyoruz.
 *
 * Kayıt tutma asla asıl işlemi bozmamalı: log yazılamazsa hata
 * fırlatmıyoruz, çünkü kullanıcının teklifi kaydedilmiş olur ve
 * ekranda anlamsız bir hata görür.
 */

export type FieldChange = { field: string; label: string; from: string; to: string };

export type CrmEntityType = "crm_opportunity" | "crm_proposal" | "crm_contract";

/** Alan adlarının Türkçe karşılıkları; geçmiş ekranında bu isimler görünür. */
export const FIELD_LABELS: Record<string, string> = {
  title: "Başlık",
  customer_name: "Müşteri",
  contact_email: "E-posta",
  contact_phone: "Telefon",
  source: "Kaynak",
  notes: "Not",
  scope: "Kapsam",
  amount: "Tutar",
  currency: "Para birimi",
  payment_plan: "Ödeme planı",
  payment_plan_type: "Ödeme planı tipi",
  valid_until: "Geçerlilik",
  start_date: "Başlangıç",
  due_date: "Teslim",
  expected_close_date: "Tahmini kapanış",
  status: "Durum",
  stage: "Aşama",
  assigned_employee_id: "Satış temsilcisi",
  service_type: "Hizmet",
  academic_level: "Akademik seviye",
  department: "Bölüm",
  customer_address: "Adres",
  customer_tax_number: "Vergi no",
  customer_tax_office: "Vergi dairesi",
};

function normalize(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * İki kayıt arasındaki farkı çıkarır.
 *
 * Yalnızca `fields` listesindeki alanlara bakar: kaydın tamamını
 * karşılaştırmak updated_at gibi teknik alanları da geçmişe düşürürdü.
 */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: string[],
  resolve?: Record<string, (value: string) => string>,
): FieldChange[] {
  if (!before || !after) return [];
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const from = normalize(before[field]);
    const to = normalize(after[field]);
    if (from === to) continue;
    const map = resolve?.[field];
    changes.push({
      field,
      label: FIELD_LABELS[field] ?? field,
      from: map ? map(from) : from,
      to: map ? map(to) : to,
    });
  }
  return changes;
}

export async function logActivity(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    actorUserId: string;
    action: string;
    entityType: CrmEntityType;
    entityId: string;
    /** Zincirin kökü. Geçmiş sorgusu ve RLS politikası bunu kullanıyor. */
    opportunityId: string;
    changes?: FieldChange[];
    note?: string;
  },
): Promise<void> {
  // Değişiklik yoksa kayıt açma; "hiçbir şey değişmedi" satırları
  // geçmişi doldurup okunmaz hale getiriyor.
  if (input.action === "update" && !input.changes?.length) return;

  const { error } = await supabase.from("activity_logs").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: {
      opportunity_id: input.opportunityId,
      changes: input.changes ?? [],
      note: input.note ?? null,
    },
  });

  if (error) {
    // Bilinçli olarak yutuluyor — bkz. dosya başındaki not.
    console.error("Kayıt geçmişi yazılamadı:", error.message);
  }
}
