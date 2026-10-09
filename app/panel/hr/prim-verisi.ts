import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAccrualRows, type AccrualRow } from "@/lib/commission-accruals";
import type { RateHistoryRow } from "@/lib/commission-allocation";
import type { CommissionPayment } from "@/lib/commission-ledger";

/*
  PRİM VERİSİ (2026-10): personel detayındaki prim penceresi ve personel
  listesinin "Prim bakiyesi" sütunu aynı tahakkuku okuyor. Eskiden Prim
  Hesaplama ve Prim Hesabı sayfaları sorguları ayrı ayrı yazıyordu; ikisi
  personel detayına taşınınca tek yere toplandı.

  Tahakkuk kurumun TÜM geçmişinden hesaplanıyor (tahsilatlar sözleşmelere
  en eski vadeden dağıtılıyor, lib/commission-accruals.ts); tek personel
  için bile sorgular kurum geneli. Sınırlı (.limit) sorgu yok: bakiye bir
  toplam ve sınırlı listeden toplam almak yanlış rakam verir.
*/

export type PrimPersoneli = { id: string; full_name: string; job_title: string | null; employment_status: string; commission_rate: number; operation_commission_rate: number };

export async function primVerisi(supabase: SupabaseClient, orgId: string) {
  const [employeeResult, opportunityResult, contractResult, operationResult, collectionResult, rateResult, paymentResult] = await Promise.all([
    supabase.from("hr_employees").select("id,full_name,job_title,employment_status,commission_rate,operation_commission_rate").eq("organization_id", orgId).order("full_name"),
    supabase.from("crm_opportunities").select("id,customer_name,assigned_employee_id").eq("organization_id", orgId),
    supabase.from("crm_contracts").select("id,contract_no,opportunity_id,party_id,amount,signed_at,created_at").eq("organization_id", orgId).in("status", ["signed", "completed"]),
    supabase.from("hr_operation_commissions").select("id,employee_id,workflow_id,contract_id,base_amount,commission_rate,commission_amount,status,accrued_at").eq("organization_id", orgId).neq("status", "cancelled"),
    // Yalnızca gerçek ödemeler (payment) ve iadeler (adjustment borç kaydı) prim matrahıdır.
    supabase.from("account_entries").select("id,party_id,entry_type,amount,transaction_date").eq("organization_id", orgId).or("and(entry_type.eq.credit,source_type.eq.payment),and(entry_type.eq.debit,source_type.eq.adjustment)"),
    // Oran geçmişi okunamazsa bugünkü oranla devam edilir.
    supabase.from("hr_employee_commission_rates").select("employee_id,commission_rate,valid_from").eq("organization_id", orgId),
    supabase.from("hr_commission_payments").select("id,employee_id,amount,paid_on,method,note").eq("organization_id", orgId).order("paid_on", { ascending: false }),
  ]);
  if (employeeResult.error) throw new Error("Personeller okunamadı: " + employeeResult.error.message);
  if (contractResult.error) throw new Error("Sözleşmeler okunamadı: " + contractResult.error.message);
  if (operationResult.error) throw new Error("Operasyon primleri okunamadı: " + operationResult.error.message);
  if (collectionResult.error) throw new Error("Tahsilatlar okunamadı: " + collectionResult.error.message);
  if (paymentResult.error) throw new Error("Prim ödemeleri okunamadı: " + paymentResult.error.message);

  const employees = (employeeResult.data ?? []) as PrimPersoneli[];
  const accruals: AccrualRow[] = buildAccrualRows({
    employees,
    opportunities: opportunityResult.data ?? [],
    contracts: contractResult.data ?? [],
    operations: operationResult.data ?? [],
    collections: collectionResult.data ?? [],
    rateHistory: (rateResult.data ?? []) as RateHistoryRow[],
  });
  const payments: CommissionPayment[] = (paymentResult.data ?? []).map((row) => ({
    id: row.id as string,
    employeeId: row.employee_id as string,
    amount: Number(row.amount),
    paidOn: row.paid_on as string,
    method: row.method as string,
    note: (row.note as string | null) ?? null,
  }));
  return { employees, accruals, payments };
}
