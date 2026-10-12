"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { parseTurkishAmount } from "@/lib/turkish-amount";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { assertYetki } from "@/lib/yetkiler";
import { beklenenPrimler, dagitimDenetle, dagitimOku, type DagitimKalemi } from "@/lib/prim-is-dagilimi";
import { primVerisi } from "./prim-verisi";

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
  assertYetki(context.yetkiler, "hr.prim.yonet");
  assertModuleKeyAccess(context.membership.role, "hr", context.hiddenModuleKeys);
  return context;
}

/*
  Ödemenin işlere dağılımı (lib/prim-is-dagilimi). Form dağıtım alanını
  yalnızca özellik açıkken gönderiyor (dagitim_acik); gönderilmediyse
  dağıtıma dokunulmuyor — düzenleme, okunamayan bir dağıtımı boş sanıp
  silmesin. İzinli işler personelin KENDİ primlerinden: başka bir
  personelin işine ödeme dağıtılamaz.
*/
async function dagitimHazirla(supabase: Awaited<ReturnType<typeof primContext>>["supabase"], orgId: string, employeeId: string, tutar: number, formData: FormData): Promise<DagitimKalemi[] | null> {
  if (formData.get("dagitim_acik") !== "1") return null;
  const kalemler = dagitimOku(String(formData.get("dagitim") ?? ""));
  if ("hata" in kalemler) throw new Error(kalemler.hata);
  if (!kalemler.length) return [];
  const veri = await primVerisi(supabase, orgId);
  // Hak edilmiş primi olan işler ve henüz hak edilmemiş (avans ödenebilecek) açık işler.
  const girdi = veri.beklenenGirdisi(employeeId);
  const izinli = new Set([
    ...veri.accruals.filter((a) => a.employeeId === employeeId && a.contractId).map((a) => a.contractId as string),
    ...(girdi ? beklenenPrimler(girdi, veri.accruals).map((b) => b.contractId) : []),
  ]);
  const hata = dagitimDenetle(tutar, kalemler, izinli);
  if (hata) throw new Error(hata);
  return kalemler;
}

async function dagitimYaz(supabase: Awaited<ReturnType<typeof primContext>>["supabase"], paymentId: string, kalemler: DagitimKalemi[]) {
  const { error } = await supabase.rpc("arvo_prim_odemesi_dagit", {
    p_payment_id: paymentId,
    p_kalemler: kalemler.map((k) => ({ contract_id: k.contractId, amount: k.amount })),
  });
  if (error) throw new Error(`Ödemenin işlere dağılımı kaydedilemedi: ${error.message}`);
}

// Prim artık personel detayındaki pencerede (2026-10); listenin "Prim bakiyesi" sütunu da.
const refresh = () => {
  revalidatePath("/panel/hr/[id]", "page");
  revalidatePath("/panel/hr");
};

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
  const dagitim = await dagitimHazirla(supabase, membership.organization_id, employeeId, amount, formData);

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
  /* Dağıtım yazılamazsa ödeme geri alınır: kullanıcı işleri seçti, "kaydedildi"
     deyip dağıtımsız bırakmak seçtiğini sessizce kaybetmek olurdu. Gider kaydı
     henüz açılmadığı için geri alınacak başka bir şey yok. */
  if (dagitim?.length) {
    try {
      await dagitimYaz(supabase, payment.id, dagitim);
    } catch (hata) {
      await supabase.from("hr_commission_payments").delete().eq("id", payment.id).eq("organization_id", membership.organization_id);
      throw hata;
    }
  }

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

/*
  Prim ödemesini DÜZENLEME (12.10.2026). Eskiden yanlış girilen ödeme
  yalnızca silinip yeniden girilebiliyordu; bu sırada finanstaki gider
  kaydı da silinip yeniden açılıyor, kayıt tarihi ve kimliği değişiyordu.

  Gider kaydı ödemeyle aynı kalır: tutar, tarih ve açıklama ona da yazılır.
  Yöntem mahsuba dönerse gider kalkar (mahsup para çıkışı değil),
  mahsuptan başka bir yönteme dönerse gider açılır.
*/
async function primOdemesiDuzenle__impl(formData: FormData) {
  const { supabase, membership, userId } = await primContext();
  const id = String(formData.get("id") ?? "");
  const lira = parseTurkishAmount(String(formData.get("amount") ?? ""));
  const amount = Number.isFinite(lira) ? Math.round(lira * 100) : 0;
  const paidOn = String(formData.get("paid_on") ?? "");
  const method = String(formData.get("method") ?? "havale");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);

  if (!UUID.test(id)) throw new Error("Kayıt bulunamadı.");
  if (!amount || amount <= 0) throw new Error("Ödenen tutarı yazın (ör. 8.500).");
  if (!DATE.test(paidOn)) throw new Error("Ödeme tarihi geçersiz.");
  if (!METHODS.has(method)) throw new Error("Ödeme yöntemi geçersiz.");

  const { data: payment, error: readError } = await supabase
    .from("hr_commission_payments").select("id,employee_id,finance_transaction_id")
    .eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (readError) throw new Error(`Prim ödemesi okunamadı: ${readError.message}`);
  if (!payment) throw new Error("Kayıt bulunamadı.");
  // Önce denetle: tutar küçülüp dağıtımın altına düşmüşse ödeme hiç değişmesin.
  const dagitim = await dagitimHazirla(supabase, membership.organization_id, payment.employee_id as string, amount, formData);

  // RLS engellediğinde update hata vermez, 0 satır döner; ayrıca bakılıyor.
  const { data: saved, error } = await supabase.from("hr_commission_payments")
    .update({ amount, paid_on: paidOn, method, note: note || null })
    .eq("id", id).eq("organization_id", membership.organization_id)
    .select("id");
  if (error) throw new Error(`Prim ödemesi kaydedilemedi: ${error.message}`);
  if (!saved?.length) throw new Error("Prim ödemesi kaydedilemedi: bu işlem için yetkiniz yok.");
  if (dagitim) await dagitimYaz(supabase, id, dagitim);

  // Gider kaydı: ödeme kaydedildi; gider yazılamazsa ödeme geri alınmaz (yukarıdaki ilke).
  const giderId = payment.finance_transaction_id as string | null;
  if (method === "mahsup") {
    if (giderId) {
      const { error: silHata } = await supabase.from("finance_transactions").delete().eq("id", giderId).eq("organization_id", membership.organization_id);
      if (silHata) console.error("[prim] gider kaydı kaldırılamadı", silHata.message);
      else await supabase.from("hr_commission_payments").update({ finance_transaction_id: null }).eq("id", id);
    }
  } else if (giderId) {
    const { error: giderHata } = await supabase.from("finance_transactions")
      .update({ amount, due_date: paidOn, paid_at: paidOn, notes: note || null, updated_at: new Date().toISOString() })
      .eq("id", giderId).eq("organization_id", membership.organization_id);
    if (giderHata) console.error("[prim] gider kaydı güncellenemedi", giderHata.message);
  } else {
    const { data: employee } = await supabase
      .from("hr_employees").select("full_name")
      .eq("id", payment.employee_id).eq("organization_id", membership.organization_id).maybeSingle();
    const ad = employee?.full_name ?? "Personel";
    const { data: transaction, error: financeError } = await supabase.from("finance_transactions").insert({
      organization_id: membership.organization_id,
      transaction_type: "expense",
      status: "paid",
      title: `Prim ödemesi · ${ad}`,
      counterparty: ad,
      category: "Personel Primi",
      amount,
      currency: "TRY",
      due_date: paidOn,
      paid_at: paidOn,
      notes: note || null,
      created_by: userId ?? null,
    }).select("id").single();
    if (financeError) console.error("[prim] gider kaydı yazılamadı", financeError.message);
    else await supabase.from("hr_commission_payments").update({ finance_transaction_id: transaction.id }).eq("id", id);
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
export async function primOdemesiDuzenle(...args: Parameters<typeof primOdemesiDuzenle__impl>) {
  return runPanelAction(() => primOdemesiDuzenle__impl(...args), "Prim ödemesi güncellendi");
}
export async function primOdemesiSil(...args: Parameters<typeof primOdemesiSil__impl>) {
  return runPanelAction(() => primOdemesiSil__impl(...args), "Prim ödemesi silindi");
}
