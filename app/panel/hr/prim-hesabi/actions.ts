"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { parseTurkishAmount } from "@/lib/turkish-amount";
import { todayInIstanbul } from "@/lib/istanbul-date";

/*
  Prim ödemesi kaydı. Para hareketi olduğu için yalnızca Kurum Sahibi ve
  Yönetici; aynı kural RLS'te de var (hr_commission_payments).

  Ödeme finansa gider olarak düşer: personel maliyeti kârlılık raporlarında
  görünsün ve iki yerde ayrı kayıt tutulmasın. Gider kaydı yazılamazsa ödeme
  yine de kaydedilir — prim ödendiyse ödenmiştir; muhasebe kaydının eksik
  kalması, personelin bakiyesinin yanlış görünmesinden iyidir.
*/

const METHODS = new Set(["havale", "nakit", "mahsup", "diger"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function primContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  if (!["owner", "admin"].includes(context.membership.role)) throw new Error("Prim ödemesini yalnızca Kurum Sahibi veya Yönetici kaydedebilir.");
  assertModuleKeyAccess(context.membership.role, "hr", context.hiddenModuleKeys);
  return context;
}

const refresh = () => revalidatePath("/panel/hr/prim-hesabi");

async function primOdemesiKaydet__impl(formData: FormData) {
  const { supabase, membership, userId } = await primContext();
  const employeeId = String(formData.get("employee_id") ?? "");
  // parseTurkishAmount lira döndürür; para kuruş cinsinden tamsayı saklanır.
  const lira = parseTurkishAmount(String(formData.get("amount") ?? ""));
  const amount = Number.isFinite(lira) ? Math.round(lira * 100) : 0;
  const paidOn = String(formData.get("paid_on") ?? "") || todayInIstanbul();
  const method = String(formData.get("method") ?? "havale");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);

  if (!UUID.test(employeeId)) throw new Error("Personel seçin.");
  if (!amount || amount <= 0) throw new Error("Ödenen tutarı yazın (ör. 8.500).");
  if (!DATE.test(paidOn)) throw new Error("Ödeme tarihi geçersiz.");
  if (!METHODS.has(method)) throw new Error("Ödeme yöntemi geçersiz.");

  const { data: employee } = await supabase
    .from("hr_employees").select("id,full_name")
    .eq("id", employeeId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!employee) throw new Error("Personel bulunamadı.");

  const { data: payment, error } = await supabase.from("hr_commission_payments").insert({
    organization_id: membership.organization_id,
    employee_id: employeeId,
    amount,
    paid_on: paidOn,
    method,
    note: note || null,
    created_by: userId ?? null,
  }).select("id").single();
  if (error) throw new Error(`Prim ödemesi kaydedilemedi: ${error.message}`);

  // Mahsup gerçek bir para çıkışı değil (alacağa sayılıyor); gider yazmıyoruz.
  if (method !== "mahsup") {
    const { data: transaction, error: financeError } = await supabase.from("finance_transactions").insert({
      organization_id: membership.organization_id,
      transaction_type: "expense",
      status: "paid",
      title: `Prim ödemesi · ${employee.full_name}`,
      counterparty: employee.full_name,
      category: "Personel Primi",
      amount,
      currency: "TRY",
      due_date: paidOn,
      paid_at: paidOn,
      notes: note || null,
      created_by: userId ?? null,
    }).select("id").single();
    if (financeError) console.error("[prim] gider kaydı yazılamadı", financeError.message);
    else await supabase.from("hr_commission_payments").update({ finance_transaction_id: transaction.id }).eq("id", payment.id);
  }

  refresh();
}

async function primOdemesiSil__impl(formData: FormData) {
  const { supabase, membership } = await primContext();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new Error("Kayıt bulunamadı.");

  const { data: payment } = await supabase
    .from("hr_commission_payments").select("id,finance_transaction_id")
    .eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (!payment) throw new Error("Kayıt bulunamadı.");

  const { error } = await supabase.from("hr_commission_payments").delete().eq("id", id).eq("organization_id", membership.organization_id);
  if (error) throw new Error(`Kayıt silinemedi: ${error.message}`);
  // Gider kaydı ödemeyle birlikte kalkar; yoksa finansta karşılıksız bir
  // gider kalır ve kârlılık olduğundan düşük görünür.
  if (payment.finance_transaction_id) {
    await supabase.from("finance_transactions").delete().eq("id", payment.finance_transaction_id).eq("organization_id", membership.organization_id);
  }

  refresh();
}

export async function primOdemesiKaydet(...args: Parameters<typeof primOdemesiKaydet__impl>) {
  return runPanelAction(() => primOdemesiKaydet__impl(...args), "Prim ödemesi kaydedildi");
}
export async function primOdemesiSil(...args: Parameters<typeof primOdemesiSil__impl>) {
  return runPanelAction(() => primOdemesiSil__impl(...args), "Prim ödemesi silindi");
}
