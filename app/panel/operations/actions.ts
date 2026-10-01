"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { PORTAL_BUCKET } from "./portal-files-shared";
import { isDurumAdi, isStepStatus, STEP_STATUS_LABELS } from "@/lib/is-adimlari";
import { BEKLEYEN_TARAF_ADLARI, bekleyenTarafMi, type BekleyenTaraf } from "@/lib/bekleyen-taraf";
import { tasimaPlani } from "@/lib/operasyon-panosu";
import { tarihleriDagit } from "@/lib/tarih-dagitimi";
import { logActivity, type FieldChange } from "@/lib/activity-log";

// Elle seçilebilen durumlar. "archived" burada yok: arşive yalnızca
// archiveWorkflow ile (ve yalnızca tamamlanan iş) gidilir, veritabanı
// (guard_operation_workflow_archive) da aynı kuralı uygular.
const statuses = new Set(["planned", "in_progress", "blocked", "completed", "cancelled"]);
const priorities = new Set(["low", "normal", "high", "urgent"]);
const MANAGER_ROLES = ["owner", "admin", "manager"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OperationContext = Awaited<ReturnType<typeof getPanelContext>>;

async function operationContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  assertModuleKeyAccess(context.membership.role, "operations", context.hiddenModuleKeys);
  return context;
}

// Genel bakış, işler, arşiv, pano, takvim ve iş detayı tek düzen altında:
// "layout" ile hepsi birlikte tazelenir. Ana sayfa özetleri de işleri sayıyor.
function revalidateOperations() {
  revalidatePath("/panel/operations", "layout");
  revalidatePath("/panel");
}

// Yöneticiler her işte, diğerleri yalnızca sorumlusu oldukları işte
// yetkili (termin ve arşiv işlemleri). RLS (members_update_assigned_operation_workflows)
// da aynı kuralı uygular.
async function isManagerOrAssignee({ supabase, membership, userId }: OperationContext, assignedEmployeeId: string | null) {
  if (MANAGER_ROLES.includes(membership.role)) return true;
  if (!assignedEmployeeId) return false;
  const { data: me } = await supabase.from("hr_employees").select("id").eq("organization_id", membership.organization_id).eq("user_id", userId).eq("employment_status", "active").maybeSingle();
  return Boolean(me?.id && me.id === assignedEmployeeId);
}

async function createWorkflow__impl(formData: FormData) {
  const { supabase, userId, membership } = await operationContext();
  const title = String(formData.get("title") ?? "").trim();
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "planned");
  const priority = String(formData.get("priority") ?? "normal");
  const startDate = String(formData.get("start_date") ?? "") || null;
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const assignedEmployeeId = String(formData.get("assigned_employee_id") ?? "") || null;
  const templateSet = String(formData.get("step_template_set") ?? "").trim() || null;
  if (title.length < 2 || title.length > 180) throw new Error("İş başlığı 2–180 karakter olmalı.");
  if (!statuses.has(status) || status === "completed" || status === "cancelled") throw new Error("Geçersiz başlangıç durumu.");
  if (!priorities.has(priority)) throw new Error("Geçersiz öncelik.");
  if (startDate && dueDate && dueDate < startDate) throw new Error("Termin başlangıç tarihinden önce olamaz.");
  if (!MANAGER_ROLES.includes(membership.role)) throw new Error("İş oluşturmak için yönetici yetkisi gerekiyor.");
  if (assignedEmployeeId) {
    const { data: employee } = await supabase.from("hr_employees").select("id").eq("id", assignedEmployeeId).eq("organization_id", membership.organization_id).eq("employment_status", "active").maybeSingle();
    if (!employee) throw new Error("Atanacak aktif personel bulunamadı.");
  }
  /*
    Çalışma türü işin görev listesini belirliyor (add_standard_operation_steps).
    Bileşik yabancı anahtar zaten kurumun kendi türünü zorunlu tutuyor, ama
    hata mesajı "foreign key violation" olurdu; kullanıcı ne olduğunu
    anlamalı. Boş = kurumun öntanımlı türü.
  */
  if (templateSet) {
    const { data: tur } = await supabase.from("organization_step_template_sets").select("code")
      .eq("organization_id", membership.organization_id).eq("code", templateSet).maybeSingle();
    if (!tur) throw new Error("Seçilen çalışma türü bulunamadı.");
  }
  const { error } = await supabase.from("operation_workflows").insert({ organization_id: membership.organization_id, title, customer_name: customerName || null, description: description || null, status, priority, start_date: startDate, due_date: dueDate, assigned_employee_id: assignedEmployeeId, step_template_set: templateSet, created_by: userId });
  if (error) throw new Error("İş akışı oluşturulamadı: " + error.message);
  revalidateOperations();
}

async function assignWorkflow__impl(formData: FormData) {
  const { supabase, membership } = await operationContext();
  if (!MANAGER_ROLES.includes(membership.role)) throw new Error("Operasyon atamak için yönetici yetkisi gerekiyor.");
  const workflowId = String(formData.get("workflow_id") ?? "");
  const assignedEmployeeId = String(formData.get("assigned_employee_id") ?? "") || null;
  if (assignedEmployeeId) {
    const { data: employee } = await supabase.from("hr_employees").select("id").eq("id", assignedEmployeeId).eq("organization_id", membership.organization_id).eq("employment_status", "active").maybeSingle();
    if (!employee) throw new Error("Atanacak aktif personel bulunamadı.");
  }
  const { data, error } = await supabase.from("operation_workflows").update({ assigned_employee_id: assignedEmployeeId, updated_at: new Date().toISOString() }).eq("id", workflowId).eq("organization_id", membership.organization_id).select("id").maybeSingle();
  if (error) throw new Error("Operasyon sorumlusu güncellenemedi: " + error.message);
  if (!data) throw new Error("İş akışı bulunamadı.");
  revalidateOperations();
}

// Sonradan eklenen adım (tez bittikten sonra istenen sunum dosyası gibi):
// listenin sonuna gider ve isteğe bağlı bir teslim tarihi alabilir.
async function addWorkflowStep__impl(formData: FormData) {
  const { supabase, membership } = await operationContext();
  const workflowId = String(formData.get("workflow_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const dueDate = stepDueDate(formData.get("due_date"));
  if (title.length < 2 || title.length > 180) throw new Error("Adım adı 2–180 karakter olmalı.");
  const { data: workflow } = await supabase.from("operation_workflows").select("id").eq("id", workflowId).eq("organization_id", membership.organization_id).single();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  const { count } = await supabase.from("operation_steps").select("id", { count: "exact", head: true }).eq("workflow_id", workflowId);
  const { error } = await supabase.from("operation_steps").insert({ organization_id: membership.organization_id, workflow_id: workflowId, title, sort_order: (count ?? 0) * 10 + 10, due_date: dueDate });
  if (error) throw new Error("Adım eklenemedi: " + error.message);
  revalidateOperations();
}

/** Form alanından gün anahtarı; boş bırakmak "tarihi yok" demektir. */
function stepDueDate(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Geçerli bir teslim tarihi seçin.");
  return value;
}

/*
  Adımın satırı ve bağlı olduğu iş. Adım kimliği istemciden geliyor; kurum
  her iki sorguda da süzülüyor.

  İki ayrı sorgu, gömülü ilişki (operation_steps → operation_workflows)
  DEĞİL: o yön bileşik yabancı anahtar üzerinden kurulu
  (workflow_id, organization_id) ve PostgREST'in ilişkiyi hangi adla
  çözeceğine güvenmek, hata verse bile ancak canlıda görülecek bir
  bağımlılık olurdu. İki sorgu bir eylem başına; maliyeti yok.
*/
async function stepRow(supabase: OperationContext["supabase"], organizationId: string, stepId: string) {
  const { data: step } = await supabase
    // title/due_date/status/assigned_employee_id: geçmişe "neyden neye"
    // yazabilmek için ÖNCEKİ değer gerekiyor (kayitDus).
    .from("operation_steps").select("id,workflow_id,title,due_date,status,assigned_employee_id")
    .eq("id", stepId).eq("organization_id", organizationId).maybeSingle();
  if (!step) throw new Error("İş adımı bulunamadı.");
  const { data: workflow } = await supabase
    .from("operation_workflows").select("id,status,assigned_employee_id")
    .eq("id", step.workflow_id).eq("organization_id", organizationId).maybeSingle();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  if (workflow.status === "archived") throw new Error("Arşivdeki işin adımları değiştirilemez; önce arşivden çıkarın.");
  return {
    stepId: step.id as string,
    workflowId: step.workflow_id as string,
    assignedEmployeeId: workflow.assigned_employee_id as string | null,
    title: step.title as string,
    dueDate: (step.due_date as string | null) ?? null,
    status: step.status as string,
    stepAssigneeId: (step.assigned_employee_id as string | null) ?? null,
  };
}

/*
  Operasyon olaylarını kayıt geçmişine yazar.

  Neden ayrı yardımcı: hiçbir operasyon işlemi kayıt düşmüyordu ve iş
  detayındaki "Kayıt geçmişi" panosu bu yüzden her zaman boştu. Operasyoncunun
  takip etmek istediği şey tam olarak burada birikiyor: bir aşamanın tarihi
  kaç kez ötelendi, durumu kim değiştirdi, sorumlusu ne zaman değişti.

  Değişiklikler ELLE kuruluyor, diffFields ile değil: FIELD_LABELS'ta
  assigned_employee_id "Satış temsilcisi" diye etiketli ve operasyonda o ad
  yanlış olur. Etiketi çağrı yerinde vermek iki modülü birbirine
  bağlamaktan iyi.

  Kayıt akışı düşürmez: logActivity hatayı kendi içinde yutuyor, yani
  geçmiş yazılamazsa kullanıcının işlemi yine tamamlanır.
*/
async function kayitDus(
  context: OperationContext,
  input: { workflowId: string; action: string; changes?: FieldChange[]; note?: string; stepId?: string; stepTitle?: string },
) {
  await logActivity(context.supabase, {
    organizationId: context.membership.organization_id,
    actorUserId: context.userId,
    action: input.action,
    entityType: "operation_workflow",
    entityId: input.workflowId,
    changes: input.changes,
    note: input.note,
    stepId: input.stepId,
    stepTitle: input.stepTitle,
  });
}

/** "boş" yerine okunur bir değer: geçmişte "— → 12 Ekim" anlaşılır. */
const gunMetni = (deger: string | null) => (deger ? deger : "tarih yok");

/*
  Adımın durumu. Uygulama artık is_completed DEĞİL status yazıyor: iki
  sütundan yazılabilir olanı odur, onay kutusunu veritabanı tetikleyicisi
  dolduruyor (arvo_operation_step_status_sync). İkisini birden yazmak, ara
  durumu ("kontrolde") sessizce kaybettiren bir yol açardı.
*/
/*
  PANODA KARTI BAŞKA BİR KOLONA SÜRÜKLEMEK.

  Kartın kolonu "tamamlanmayan ilk adım"dan türüyor, dolayısıyla taşıma tek
  bir adımı değil BİR DİZİ adımı değiştiriyor: hedeften öncekiler kapanır,
  hedef ve sonrası açılır (gerekçesi lib/operasyon-panosu.ts'te). Plan
  burada YENİDEN hesaplanıyor — istemcinin gönderdiği liste kullanılmıyor,
  yoksa doğrudan çağrılan bir istek istediği adımı kapatabilirdi.

  Tek kayıt düşüyor, adım başına değil: üç aşamayı kapatan bir sürükleme
  geçmişe üç satır yazsaydı, elle yapılan tek tek işaretlemelerle
  karışırdı. Hangi adımların değiştiği kaydın kendi içinde yazılı.
*/
async function moveWorkflowToStage__impl(formData: FormData) {
  const context = await operationContext();
  const { supabase, userId, membership } = context;
  const workflowId = String(formData.get("workflow_id") ?? "");
  const hedefHam = String(formData.get("stage") ?? "");
  if (!UUID.test(workflowId)) throw new Error("Geçersiz iş kimliği.");

  const { data: workflow } = await supabase
    .from("operation_workflows").select("id,status,assigned_employee_id,title")
    .eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  if (workflow.status === "archived") throw new Error("Arşivdeki işin aşamaları değiştirilemez; önce arşivden çıkarın.");
  if (!(await isManagerOrAssignee(context, workflow.assigned_employee_id as string | null))) {
    throw new Error("İşi başka aşamaya taşımayı yalnızca yöneticiler ve işin sorumlusu yapabilir.");
  }

  const { data: adimlar, error: adimHatasi } = await supabase
    .from("operation_steps").select("id,title,sort_order,due_date,is_completed,assigned_employee_id,status")
    .eq("workflow_id", workflowId).eq("organization_id", membership.organization_id);
  if (adimHatasi) throw new Error("İş adımları okunamadı: " + adimHatasi.message);

  // "__tamamlandi__" sentinel'i panodan geliyor; başlık olarak yorumlanamaz.
  const plan = tasimaPlani((adimlar ?? []) as Parameters<typeof tasimaPlani>[0], hedefHam === "__tamamlandi__" ? null : hedefHam);
  if (!plan) throw new Error("Bu işte böyle bir aşama yok; kart bu kolona taşınamıyor.");
  if (!plan.tamamlanacak.length && !plan.acilacak.length) return;

  const adlar = new Map(((adimlar ?? []) as { id: string; title: string }[]).map((a) => [a.id, a.title]));
  /*
    İki toplu güncelleme. Sırası önemli: önce açmak, sonra kapatmak, aradaki
    bir hatada işin "hepsi bitti" görünmesini engelliyor — yarım kalan taşıma
    işi olduğundan İLERİ değil GERİ bırakır, yani kimse bitmemiş bir işi
    tamamlanmış sanmaz.
  */
  for (const [idler, status] of [[plan.acilacak, "planned"], [plan.tamamlanacak, "done"]] as const) {
    if (!idler.length) continue;
    const { data, error } = await supabase
      .from("operation_steps")
      .update({ status, completed_by: status === "done" ? userId : null })
      .in("id", idler).eq("organization_id", membership.organization_id).select("id");
    if (error) throw new Error("Aşama güncellenemedi: " + error.message);
    // RLS engellediğinde güncelleme sessizce 0 satır döner
    if (data?.length !== idler.length) throw new Error("Aşama güncellenemedi: bu iş için yetkiniz yok.");
  }

  const isim = (idler: string[]) => idler.map((id) => adlar.get(id) ?? id).join(", ");
  await kayitDus(context, {
    workflowId,
    action: "stage_move",
    stepTitle: plan.hedefAdi ?? "Tamamlandı",
    note: plan.hedefAdi ? `Pano: “${plan.hedefAdi}” aşamasına taşındı` : "Pano: tamamlandı olarak işaretlendi",
    changes: [
      ...(plan.tamamlanacak.length
        ? [{ field: "completed", label: "Tamamlanan aşamalar", from: "", to: isim(plan.tamamlanacak) }]
        : []),
      ...(plan.acilacak.length
        ? [{ field: "reopened", label: "Yeniden açılan aşamalar", from: "", to: isim(plan.acilacak) }]
        : []),
    ],
  });
  revalidateOperations();
}

/*
  AŞAMA TARİHLERİNİ İŞİN TAKVİMİNE DAĞITMAK.

  Canlıda sekiz işin sekizinde de aşama tarihi boştu; elle girmek sekiz iş
  × sekiz aşama demek ve kimse yapmıyordu. Dağıtım kuralı ve neyin
  uydurulmadığı lib/tarih-dagitimi.ts'te — ELLE GİRİLMİŞ tarihler çapa
  olarak korunuyor, tamamlanmış aşamalara ileri tarih yazılmıyor, işin
  başlangıcı ya da termini yoksa o boşluk dağıtılmıyor.

  Plan burada yeniden hesaplanıyor; istemciden tarih listesi alınmıyor.
*/
async function distributeStepDates__impl(formData: FormData) {
  const context = await operationContext();
  const { supabase, membership } = context;
  const workflowId = String(formData.get("workflow_id") ?? "");
  if (!UUID.test(workflowId)) throw new Error("Geçersiz iş kimliği.");

  const { data: workflow } = await supabase
    .from("operation_workflows").select("id,status,assigned_employee_id,start_date,due_date")
    .eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  if (workflow.status === "archived") throw new Error("Arşivdeki işin tarihleri değiştirilemez; önce arşivden çıkarın.");
  if (!(await isManagerOrAssignee(context, workflow.assigned_employee_id as string | null))) {
    throw new Error("Aşama tarihlerini yalnızca yöneticiler ve işin sorumlusu dağıtabilir.");
  }
  if (!workflow.due_date) throw new Error("Önce işin teslim tarihini girin: aşamalar onunla işin başlangıcı arasına dağıtılıyor.");

  const { data: adimlar, error: adimHatasi } = await supabase
    .from("operation_steps").select("id,sort_order,due_date,is_completed")
    .eq("workflow_id", workflowId).eq("organization_id", membership.organization_id);
  if (adimHatasi) throw new Error("İş adımları okunamadı: " + adimHatasi.message);

  const { atamalar } = tarihleriDagit((adimlar ?? []) as Parameters<typeof tarihleriDagit>[0], {
    baslangic: (workflow.start_date as string | null) ?? null,
    termin: workflow.due_date as string,
  });
  if (!atamalar.length) throw new Error("Dağıtılacak tarihsiz aşama yok.");

  /*
    Aynı tarihe düşen aşamalar tek ifadede güncelleniyor: sekiz aşama için
    sekiz istek yerine en çok birkaç istek. Sıra önemsiz, her grup bağımsız.
  */
  const gruplar = new Map<string, string[]>();
  for (const atama of atamalar) gruplar.set(atama.tarih, [...(gruplar.get(atama.tarih) ?? []), atama.id]);
  for (const [tarih, idler] of gruplar) {
    const { data, error } = await supabase
      .from("operation_steps").update({ due_date: tarih })
      .in("id", idler).eq("organization_id", membership.organization_id).select("id");
    if (error) throw new Error("Aşama tarihi kaydedilemedi: " + error.message);
    // RLS engellediğinde güncelleme sessizce 0 satır döner
    if (data?.length !== idler.length) throw new Error("Aşama tarihi kaydedilemedi: bu iş için yetkiniz yok.");
  }

  await kayitDus(context, {
    workflowId,
    action: "step_dates",
    note: `${atamalar.length} aşamanın tarihi işin takvimine dağıtıldı`,
    changes: [{
      field: "due_date",
      label: "Dağıtılan aralık",
      from: gunMetni((workflow.start_date as string | null) ?? null),
      to: gunMetni(workflow.due_date as string),
    }],
  });
  revalidateOperations();
}

async function setStepStatus__impl(formData: FormData) {
  const context = await operationContext();
  const { supabase, membership } = context;
  const stepId = String(formData.get("step_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!isStepStatus(status)) throw new Error("Geçersiz adım durumu.");
  const step = await stepRow(supabase, membership.organization_id, stepId);
  const { data, error } = await supabase.from("operation_steps").update({ status }).eq("id", stepId).eq("organization_id", membership.organization_id).select("id");
  if (error) throw new Error("Adım durumu güncellenemedi: " + error.message);
  // RLS engellediğinde güncelleme sessizce 0 satır döner
  if (!data?.length) throw new Error("Adım durumu güncellenemedi: bu iş için yetkiniz yok.");
  if (step.status !== status) {
    await kayitDus(context, {
      workflowId: step.workflowId,
      action: "step_status",
      stepId: step.stepId,
      stepTitle: step.title,
      changes: [{
        field: "status",
        label: "Aşama durumu",
        from: STEP_STATUS_LABELS[step.status as keyof typeof STEP_STATUS_LABELS] ?? step.status,
        to: STEP_STATUS_LABELS[status] ?? status,
      }],
    });
  }
  revalidateOperations();
}

// Adımın teslim tarihi. İşin terminiyle aynı kural: yöneticiler ve işin
// sorumlusu belirler (setWorkflowDueDate ile tutarlı).
async function setStepDueDate__impl(formData: FormData) {
  const context = await operationContext();
  const { supabase, membership } = context;
  const stepId = String(formData.get("step_id") ?? "");
  const dueDate = stepDueDate(formData.get("due_date"));
  const step = await stepRow(supabase, membership.organization_id, stepId);
  if (!(await isManagerOrAssignee(context, step.assignedEmployeeId))) throw new Error("Adım tarihini yalnızca yöneticiler ve işin sorumlusu belirleyebilir.");
  const { data, error } = await supabase.from("operation_steps").update({ due_date: dueDate }).eq("id", stepId).eq("organization_id", membership.organization_id).select("id");
  if (error) throw new Error("Adım tarihi kaydedilemedi: " + error.message);
  if (!data?.length) throw new Error("Adım tarihi kaydedilemedi: bu iş için yetkiniz yok.");
  /*
    Ötelenen tarih operasyoncunun en çok izlediği şey: "bu bölüm üç kez
    ertelendi" sorusunun cevabı yalnızca burada birikiyor.
  */
  if (step.dueDate !== dueDate) {
    await kayitDus(context, {
      workflowId: step.workflowId,
      action: "step_due",
      stepId: step.stepId,
      stepTitle: step.title,
      changes: [{ field: "due_date", label: "Aşama teslim tarihi", from: gunMetni(step.dueDate), to: gunMetni(dueDate) }],
    });
  }
  revalidateOperations();
}

// Adımın sorumlusu: bir tezin literatür kısmıyla analiz kısmını farklı
// kişiler yapabiliyor; işin tek sorumlusu bunu anlatmaya yetmiyordu.
async function assignStep__impl(formData: FormData) {
  const context = await operationContext();
  const { supabase, membership } = context;
  if (!MANAGER_ROLES.includes(membership.role)) throw new Error("Adıma sorumlu atamak için yönetici yetkisi gerekiyor.");
  const stepId = String(formData.get("step_id") ?? "");
  const employeeId = String(formData.get("assigned_employee_id") ?? "") || null;
  const step = await stepRow(supabase, membership.organization_id, stepId);
  if (employeeId) {
    const { data: employee } = await supabase.from("hr_employees").select("id").eq("id", employeeId).eq("organization_id", membership.organization_id).eq("employment_status", "active").maybeSingle();
    if (!employee) throw new Error("Atanacak aktif personel bulunamadı.");
  }
  const { data, error } = await supabase.from("operation_steps").update({ assigned_employee_id: employeeId }).eq("id", stepId).eq("organization_id", membership.organization_id).select("id");
  if (error) throw new Error("Adım sorumlusu güncellenemedi: " + error.message);
  if (!data?.length) throw new Error("Adım sorumlusu güncellenemedi: bu iş için yetkiniz yok.");
  if (step.stepAssigneeId !== employeeId) {
    // Kimlik değil AD yazılıyor: geçmişte uuid okunmuyor.
    const adi = async (id: string | null) => {
      if (!id) return "atanmadı";
      const { data: kisi } = await supabase.from("hr_employees").select("full_name").eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
      return (kisi?.full_name as string | undefined) ?? "bilinmeyen personel";
    };
    await kayitDus(context, {
      workflowId: step.workflowId,
      action: "step_assign",
      stepId: step.stepId,
      stepTitle: step.title,
      changes: [{ field: "assigned_employee_id", label: "Aşama sorumlusu", from: await adi(step.stepAssigneeId), to: await adi(employeeId) }],
    });
  }
  revalidateOperations();
}

async function toggleWorkflowStep__impl(formData: FormData) {
  const context = await operationContext();
  const { supabase, userId, membership } = context;
  const stepId = String(formData.get("step_id") ?? "");
  const completed = String(formData.get("is_completed") ?? "") === "true";
  const step = await stepRow(supabase, membership.organization_id, stepId);
  /*
    Onay kutusu da artık status yazıyor; is_completed ondan türüyor.
    "planned"a döndürmek yerine geri alma tetikleyiciye bırakılsaydı ara
    durum korunurdu ama kullanıcı kutuyu kapattığında listede hâlâ
    "Kontrolde" görünürdü — tek dokunuşla kapatmanın anlamı "başa dön".
    completed_by yine de gönderiliyor: tetikleyici boşsa auth.uid() yazar,
    burada zaten biliniyor.
  */
  const { data, error } = await supabase.from("operation_steps").update({ status: completed ? "done" : "planned", completed_by: completed ? userId : null }).eq("id", stepId).eq("organization_id", membership.organization_id).select("id");
  if (error) throw new Error("İş adımı güncellenemedi: " + error.message);
  // RLS engellediğinde güncelleme sessizce 0 satır döner
  if (!data?.length) throw new Error("İş adımı güncellenemedi: bu iş için yetkiniz yok.");
  await kayitDus(context, {
    workflowId: step.workflowId,
    action: completed ? "step_done" : "step_undone",
    stepId: step.stepId,
    stepTitle: step.title,
    note: completed ? "Aşama tamamlandı" : "Aşama yeniden açıldı",
  });
  revalidateOperations();
}

/*
  "Top kimde". İşin durumundan (status) ayrı: 'blocked' işin ilerlemediğini
  söyler, bekleyen taraf ilerlemeyi KİMİN sürdüreceğini. Devam eden bir iş
  de müşteriden yanıt bekliyor olabilir.

  Yetki işin durumuyla aynı: yönetici ya da işin sorumlusu. Bekleyen tarafı
  değiştirmek gecikmenin kime yazıldığını değiştiriyor — herkese açık
  olsaydı bir işin gecikmesi tek tıkla müşterinin üstüne atılabilirdi.
*/
async function setWaitingParty__impl(formData: FormData) {
  const context = await operationContext();
  const { supabase, membership } = context;
  const workflowId = String(formData.get("workflow_id") ?? "");
  const taraf = String(formData.get("waiting_party") ?? "");
  const not = String(formData.get("waiting_note") ?? "").trim().slice(0, 200);
  if (!bekleyenTarafMi(taraf)) throw new Error("Geçersiz bekleyen taraf.");

  const { data: workflow } = await supabase
    .from("operation_workflows").select("id,status,assigned_employee_id,waiting_party")
    .eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  if (workflow.status === "archived") throw new Error("Arşivdeki iş güncellenemez; önce arşivden çıkarın.");
  if (!(await isManagerOrAssignee(context, workflow.assigned_employee_id as string | null))) {
    throw new Error("Bekleyen tarafı yönetici ya da işin sorumlusu değiştirebilir.");
  }

  const { data, error } = await supabase
    .from("operation_workflows")
    // Not yalnızca beklenen taraf bizim dışımızdayken anlamlı; tetikleyici
    // 'us' durumunda zaten temizliyor.
    .update({ waiting_party: taraf, waiting_note: taraf === "us" ? null : not || null, updated_at: new Date().toISOString() })
    .eq("id", workflowId).eq("organization_id", membership.organization_id).neq("status", "archived")
    .select("id");
  if (error) throw new Error("Bekleyen taraf güncellenemedi: " + error.message);
  if (!data?.length) throw new Error("Bekleyen taraf güncellenemedi: bu iş için yetkiniz yok.");

  if (workflow.waiting_party !== taraf) {
    await kayitDus(context, {
      workflowId,
      action: "waiting_party",
      changes: [{
        field: "waiting_party",
        label: "Bekleyen taraf",
        from: BEKLEYEN_TARAF_ADLARI[workflow.waiting_party as BekleyenTaraf] ?? String(workflow.waiting_party),
        to: BEKLEYEN_TARAF_ADLARI[taraf],
      }],
      note: taraf === "us" ? undefined : not || undefined,
    });
  }
  revalidateOperations();
}

/*
  İşe özel revizyon süresi. Boş bırakılırsa kurumun varsayılanı geçerli;
  pencereyi veritabanı türetiyor (teslim anı + gün), burada yalnızca gün
  sayısı yazılıyor. Elle tarih yazdırsaydık teslim ertelendiğinde o tarih
  sessizce yanlış kalırdı.
*/
async function setRevisionDays__impl(formData: FormData) {
  const context = await operationContext();
  const { supabase, membership } = context;
  const workflowId = String(formData.get("workflow_id") ?? "");
  const ham = String(formData.get("revision_days") ?? "").trim();
  const gun = ham === "" ? null : Number(ham);
  if (gun !== null && (!Number.isInteger(gun) || gun < 1 || gun > 3650)) {
    throw new Error("Revizyon süresi 1 ile 3650 gün arasında olmalı; boş bırakırsanız kurum varsayılanı geçerli olur.");
  }
  const { data: workflow } = await supabase
    .from("operation_workflows").select("id,status,assigned_employee_id,revision_days")
    .eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  if (!(await isManagerOrAssignee(context, workflow.assigned_employee_id as string | null))) {
    throw new Error("Revizyon süresini yönetici ya da işin sorumlusu değiştirebilir.");
  }
  const { data, error } = await supabase
    .from("operation_workflows")
    .update({ revision_days: gun, updated_at: new Date().toISOString() })
    .eq("id", workflowId).eq("organization_id", membership.organization_id).select("id");
  if (error) throw new Error("Revizyon süresi güncellenemedi: " + error.message);
  if (!data?.length) throw new Error("Revizyon süresi güncellenemedi: bu iş için yetkiniz yok.");
  if (workflow.revision_days !== gun) {
    await kayitDus(context, {
      workflowId,
      action: "revision_days",
      changes: [{
        field: "revision_days",
        label: "Revizyon süresi",
        from: workflow.revision_days ? `${workflow.revision_days} gün` : "Kurum varsayılanı",
        to: gun ? `${gun} gün` : "Kurum varsayılanı",
      }],
    });
  }
  revalidateOperations();
}

async function setWorkflowStatus__impl(formData: FormData) {
  const context = await operationContext();
  const { supabase, membership } = context;
  const workflowId = String(formData.get("workflow_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status === "archived") throw new Error("İşi arşive göndermek için “Arşivle” düğmesini kullanın.");
  if (!statuses.has(status)) throw new Error("Geçersiz durum.");
  const { data: workflow } = await supabase.from("operation_workflows").select("id,status").eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  if (workflow.status === "archived") throw new Error("Arşivdeki işin durumu değiştirilemez; önce arşivden çıkarın.");
  const { data, error } = await supabase.from("operation_workflows").update({ status, updated_at: new Date().toISOString() }).eq("id", workflowId).eq("organization_id", membership.organization_id).neq("status", "archived").select("id");
  if (error) throw new Error("İş durumu güncellenemedi: " + error.message);
  if (!data?.length) throw new Error("İş durumu güncellenemedi: bu iş için yetkiniz yok.");
  if (workflow.status !== status) {
    await kayitDus(context, {
      workflowId,
      action: "status",
      changes: [{ field: "status", label: "İş durumu", from: isDurumAdi(String(workflow.status)), to: isDurumAdi(status) }],
    });
  }
  revalidateOperations();
}

// Arşiv: yalnızca tamamlanan iş arşive gider ve aktif işler tablosundan
// çıkar. Arşivlenen iş hâlâ "tamamlanmış" sayılır (prim, müşteri takibi).
// Yöneticiler ve işin sorumlusu yapabilir. updated_at'e dokunulmaz: müşteri
// takip ekranındaki "son güncelleme" arşivleme yüzünden değişmesin.
async function archiveWorkflow__impl(formData: FormData) {
  const context = await operationContext();
  const { supabase, userId, membership } = context;
  const workflowId = String(formData.get("workflow_id") ?? "").slice(0, 80);
  if (!workflowId) throw new Error("İş seçilmedi.");
  const { data: workflow } = await supabase.from("operation_workflows").select("id,status,assigned_employee_id").eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  if (!(await isManagerOrAssignee(context, workflow.assigned_employee_id))) throw new Error("İşi yalnızca yöneticiler ve işin sorumlusu arşivleyebilir.");
  if (workflow.status === "archived") throw new Error("Bu iş zaten arşivde.");
  if (workflow.status !== "completed") throw new Error("Yalnızca tamamlanan işler arşivlenebilir.");
  const { data, error } = await supabase.from("operation_workflows")
    .update({ status: "archived", archived_at: new Date().toISOString(), archived_by: userId })
    .eq("id", workflowId).eq("organization_id", membership.organization_id).eq("status", "completed")
    .select("id");
  if (error) throw new Error("İş arşivlenemedi: " + error.message);
  if (!data?.length) throw new Error("İş arşivlenemedi: iş artık tamamlandı durumunda değil ya da yetkiniz yok.");
  revalidateOperations();
}

async function unarchiveWorkflow__impl(formData: FormData) {
  const context = await operationContext();
  const { supabase, membership } = context;
  const workflowId = String(formData.get("workflow_id") ?? "").slice(0, 80);
  if (!workflowId) throw new Error("İş seçilmedi.");
  const { data: workflow } = await supabase.from("operation_workflows").select("id,status,assigned_employee_id").eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  if (!(await isManagerOrAssignee(context, workflow.assigned_employee_id))) throw new Error("İşi yalnızca yöneticiler ve işin sorumlusu arşivden çıkarabilir.");
  if (workflow.status !== "archived") throw new Error("Bu iş arşivde değil.");
  const { data, error } = await supabase.from("operation_workflows")
    .update({ status: "completed", archived_at: null, archived_by: null })
    .eq("id", workflowId).eq("organization_id", membership.organization_id).eq("status", "archived")
    .select("id");
  if (error) throw new Error("İş arşivden çıkarılamadı: " + error.message);
  if (!data?.length) throw new Error("İş arşivden çıkarılamadı: iş artık arşivde değil ya da yetkiniz yok.");
  revalidateOperations();
}

// Termin (teslim tarihi): termini girilmemiş işlere tarih girilebilsin diye.
// Yöneticiler ve işin atanmış sorumlusu belirleyebilir; veritabanı
// (members_update_assigned_operation_workflows) da aynı kuralı uygular.
async function setWorkflowDueDate__impl(formData: FormData) {
  const context = await operationContext();
  const { supabase, membership } = context;
  const workflowId = String(formData.get("workflow_id") ?? "");
  const dueDate = String(formData.get("due_date") ?? "").trim() || null;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("Geçerli bir termin tarihi seçin.");
  const { data: workflow } = await supabase.from("operation_workflows").select("id,start_date,assigned_employee_id").eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  if (!(await isManagerOrAssignee(context, workflow.assigned_employee_id))) throw new Error("Termini yalnızca yöneticiler ve işin sorumlusu belirleyebilir.");
  if (dueDate && workflow.start_date && dueDate < workflow.start_date) throw new Error("Termin başlangıç tarihinden önce olamaz.");
  const { data, error } = await supabase.from("operation_workflows").update({ due_date: dueDate, updated_at: new Date().toISOString() }).eq("id", workflowId).eq("organization_id", membership.organization_id).select("id");
  if (error) throw new Error("Termin kaydedilemedi: " + error.message);
  // RLS engellediğinde güncelleme sessizce 0 satır döner
  if (!data?.length) throw new Error("Termin kaydedilemedi: bu iş için yetkiniz yok.");
  revalidateOperations();
}

// İş detayı açılınca müşterinin okunmamış mesajları okundu sayılır; işler
// listesindeki kırmızı belirteç söner. Sayfayı yeniden çizdirmemek için
// revalidate edilmez (liste ve genel bakış her açılışta taze okunur).
export async function markCustomerMessagesRead(workflowId: string) {
  const { supabase, membership } = await operationContext();
  const id = String(workflowId).slice(0, 80);
  // workflowId istemciden geliyor ve customer_file_messages'ın RLS'i işe değil
  // kuruma göre yazıyor: doğrulama olmadan herhangi bir üye, sorumlusu olmadığı
  // bir işin okunmamış belirtecini söndürebiliyordu.
  const { data: workflow, error: workflowError } = await supabase
    .from("operation_workflows").select("id")
    .eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (workflowError) throw new Error("İş akışı okunamadı: " + workflowError.message);
  if (!workflow) return;

  const { error } = await supabase
    .from("customer_file_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("workflow_id", id)
    .eq("organization_id", membership.organization_id)
    .eq("sender_type", "customer")
    .is("read_at", null);
  if (error) throw new Error("Mesajlar okundu olarak işaretlenemedi: " + error.message);
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

async function replyCustomerFileMessage__impl(formData: FormData) {
  const { supabase, userId, membership } = await operationContext();
  const workflowId = String(formData.get("workflow_id") ?? "");
  // Aşağıda .or() filtresinin içine gömülüyor; biçim doğrulanmazsa form
  // verisi PostgREST filtre söz dizimine karışır. portal-files-actions.ts
  // aynı kontrolü yapıyor.
  if (!UUID.test(workflowId)) throw new Error("İş seçilmedi.");
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 2 || body.length > 2000) throw new Error("Yanıt 2–2000 karakter olmalı.");
  const [{ data: workflow }, { data: employee }] = await Promise.all([
    supabase.from("operation_workflows").select("id,contract_id").eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle(),
    supabase.from("hr_employees").select("full_name").eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle(),
  ]);
  if (!workflow) throw new Error("İş akışı bulunamadı.");
  // Sözleşme–iş bağlantısı iki yönde de kurulabiliyor: sözleşmenin
  // workflow_id'si ya da işin contract_id'si. Burada yalnızca işin
  // contract_id'sine bakılıyordu, oysa sayfa formu sözleşmenin workflow_id'si
  // üzerinden gösteriyor (page.tsx:91). İki yön ayrıştığında ya form
  // görünmüyor ya da her gönderim hata veriyordu. portal-files-actions.ts
  // ikisini zaten birlikte arıyor; aynı kural buraya da uygulanıyor.
  const { data: contract, error: contractError } = await supabase.from("crm_contracts").select("id")
    .eq("organization_id", membership.organization_id)
    .or(workflow.contract_id ? `workflow_id.eq.${workflowId},id.eq.${workflow.contract_id}` : `workflow_id.eq.${workflowId}`)
    .limit(1).maybeSingle();
  if (contractError) throw new Error("Sözleşme okunamadı: " + contractError.message);
  if (!contract) throw new Error("Bu işe bağlı müşteri sözleşmesi bulunamadı.");

  const { error } = await supabase.from("customer_file_messages").insert({
    organization_id: membership.organization_id,
    contract_id: contract.id,
    workflow_id: workflowId,
    sender_type: "staff",
    sender_user_id: userId,
    sender_name: employee?.full_name || "Operasyon Ekibi",
    body,
  });
  if (error) throw new Error("Müşteriye yanıt gönderilemedi: " + error.message);
  const { error: readError } = await supabase.from("customer_file_messages").update({ read_at: new Date().toISOString() }).eq("workflow_id", workflowId).eq("organization_id", membership.organization_id).eq("sender_type", "customer").is("read_at", null);
  // Yanıt gitti; okundu işareti konamadıysa akışı kesmeye değmez ama sessiz
  // kalmamalı, yoksa belirteç neden sönmüyor anlaşılmaz.
  if (readError) console.error("[operations] müşteri mesajları okundu işaretlenemedi", readError);
  // Genel bakıştaki "Müşteriden gelen mesajlar" kartı da tazelensin
  revalidateOperations();
}

// Yanlışlıkla oluşturulmuş bir iş akışını kalıcı olarak siler. Sadece
// yönetici yetkisiyle kullanılabilir; adımlar ve yorumlar birlikte
// silinir, bağlı bir sözleşme varsa o sözleşmenin iş akışı bağlantısı
// (workflow_id) kopartılır ki sözleşme kaydı bozulmasın.
async function deleteWorkflow__impl(formData: FormData) {
  const { supabase, membership, userId } = await operationContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Bu işlem için yönetici yetkisi gerekiyor.");
  const workflowId = String(formData.get("workflow_id") ?? "");
  if (!workflowId) throw new Error("İş akışı seçilmedi.");

  const { data: workflow } = await supabase.from("operation_workflows").select("id").eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!workflow) throw new Error("İş akışı bulunamadı.");

  // Silme yetkisi, HİÇBİR ŞEYE DOKUNMADAN ÖNCE doğrulanır.
  //
  // Paneldeki rol get_my_workspaces RPC'sinden geliyor; tablodaki RLS silme
  // politikası ise AKTİF bir organization_memberships satırında owner/admin
  // arıyor. İkisi ayrıştığında (üyelik pasifleşmiş, rol oturum ortasında
  // değişmiş) asıl silme 0 satır dönüyordu — ama adımlar, yorumlar ve
  // sözleşme bağlantısı o noktada çoktan yok edilmiş oluyordu. Kullanıcı
  // hatayı görüyor, işin görev listesi ve yazışma geçmişi geri gelmiyordu.
  const { data: canDelete, error: permissionError } = await supabase
    .from("organization_memberships").select("role")
    .eq("organization_id", membership.organization_id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (permissionError) throw new Error("Silme yetkisi doğrulanamadı: " + permissionError.message);
  if (!canDelete) throw new Error("İş akışı silinemedi: silme yetkiniz yok.");

  // Prim tahakkuk etmişse silme veritabanında zaten reddediliyor
  // (hr_operation_commissions.workflow_id "on delete restrict"). Burada
  // önceden bakılmazsa ret, adımlar ve yorumlar silindikten SONRA geliyor.
  const { data: commission, error: commissionError } = await supabase
    .from("hr_operation_commissions").select("id")
    .eq("organization_id", membership.organization_id)
    .eq("workflow_id", workflowId)
    .maybeSingle();
  if (commissionError) throw new Error("Prim kaydı denetlenemedi: " + commissionError.message);
  if (commission) throw new Error("Bu işe prim tahakkuk ettiği için silinemez. Önce prim kaydını kaldırın.");

  // Dosya yolları ana kayıt silinmeden önce okunur: operation_customer_files
  // satırları "on delete cascade" ile gidiyor ve kaskat çalıştıktan sonra
  // depodaki nesnelerin yolunu gösteren hiçbir kayıt kalmıyordu. Nesneler
  // özel kovada sonsuza kadar duruyordu — ne denetlenebiliyor ne
  // temizlenebiliyordu. Silme başarısız olursa depoya dokunulmaz.
  const { data: portalFiles, error: portalFilesError } = await supabase
    .from("operation_customer_files").select("storage_path")
    .eq("organization_id", membership.organization_id)
    .eq("workflow_id", workflowId);
  if (portalFilesError) throw new Error("Müşteri dosyaları okunamadı: " + portalFilesError.message);

  const { error: unlinkError } = await supabase.from("crm_contracts").update({ workflow_id: null }).eq("workflow_id", workflowId).eq("organization_id", membership.organization_id);
  if (unlinkError) throw new Error("Sözleşme bağlantısı kopartılamadı: " + unlinkError.message);
  const { error: commentError } = await supabase.from("operation_workflow_comments").delete().eq("workflow_id", workflowId).eq("organization_id", membership.organization_id);
  if (commentError) throw new Error("İş akışı yorumları silinemedi: " + commentError.message);
  const { error: stepError } = await supabase.from("operation_steps").delete().eq("workflow_id", workflowId).eq("organization_id", membership.organization_id);
  if (stepError) throw new Error("İş akışı adımları silinemedi: " + stepError.message);

  const { data: deleted, error } = await supabase.from("operation_workflows").delete().eq("id", workflowId).eq("organization_id", membership.organization_id).select("id");
  // hr_operation_commissions.workflow_id "on delete restrict": prim tahakkuk
  // etmiş bir iş silinemez ve bu doğru davranıştır.
  if (error) throw new Error("İş akışı silinemedi: " + error.message);
  if (!deleted?.length) throw new Error("İş akışı silinemedi: kayıt bulunamadı veya silme yetkiniz yok.");

  // Kayıtlar gitti; depodaki nesneler de gitsin. Bu noktada iş silinmiş
  // durumda, temizlik başarısız olursa akışı kesmeye değmez ama sessiz
  // kalmamalı: yolu gösteren kayıt artık yok, elle bulunması gerekir.
  const orphanPaths = (portalFiles ?? []).map((file) => file.storage_path).filter(Boolean);
  if (orphanPaths.length) {
    const { error: storageError } = await supabase.storage.from(PORTAL_BUCKET).remove(orphanPaths);
    if (storageError) console.error("[operations] iş silindi ama müşteri dosyaları depodan kaldırılamadı", { workflowId, paths: orphanPaths, message: storageError.message });
  }

  revalidateOperations();
  revalidatePath("/panel/crm/contracts");
  // Detay sayfasında kalırsak silinen kayıt yeniden okunur ve 404 döner.
  redirect("/panel/operations/isler");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function createWorkflow(...args: Parameters<typeof createWorkflow__impl>) {
  return runPanelAction(() => createWorkflow__impl(...args), "İş oluşturuldu");
}
export async function assignWorkflow(...args: Parameters<typeof assignWorkflow__impl>) {
  return runPanelAction(() => assignWorkflow__impl(...args), "Sorumlu atandı");
}
export async function addWorkflowStep(...args: Parameters<typeof addWorkflowStep__impl>) {
  return runPanelAction(() => addWorkflowStep__impl(...args), "Görev eklendi");
}
export async function toggleWorkflowStep(...args: Parameters<typeof toggleWorkflowStep__impl>) {
  return runPanelAction(() => toggleWorkflowStep__impl(...args));
}
export async function setRevisionDays(...args: Parameters<typeof setRevisionDays__impl>) {
  return runPanelAction(() => setRevisionDays__impl(...args), "Revizyon süresi güncellendi");
}
export async function setWaitingParty(...args: Parameters<typeof setWaitingParty__impl>) {
  return runPanelAction(() => setWaitingParty__impl(...args), "Bekleyen taraf güncellendi");
}
export async function setWorkflowStatus(...args: Parameters<typeof setWorkflowStatus__impl>) {
  return runPanelAction(() => setWorkflowStatus__impl(...args));
}
export async function archiveWorkflow(...args: Parameters<typeof archiveWorkflow__impl>) {
  return runPanelAction(() => archiveWorkflow__impl(...args), "İş arşivlendi");
}
export async function unarchiveWorkflow(...args: Parameters<typeof unarchiveWorkflow__impl>) {
  return runPanelAction(() => unarchiveWorkflow__impl(...args), "İş arşivden çıkarıldı");
}
export async function replyCustomerFileMessage(...args: Parameters<typeof replyCustomerFileMessage__impl>) {
  return runPanelAction(() => replyCustomerFileMessage__impl(...args), "Yanıt müşteriye gönderildi");
}
export async function setWorkflowDueDate(...args: Parameters<typeof setWorkflowDueDate__impl>) {
  return runPanelAction(() => setWorkflowDueDate__impl(...args), "Termin kaydedildi");
}
export async function distributeStepDates(...args: Parameters<typeof distributeStepDates__impl>) {
  return runPanelAction(() => distributeStepDates__impl(...args), "Aşama tarihleri dağıtıldı");
}
export async function moveWorkflowToStage(...args: Parameters<typeof moveWorkflowToStage__impl>) {
  return runPanelAction(() => moveWorkflowToStage__impl(...args), "İş yeni aşamaya taşındı");
}
export async function setStepStatus(...args: Parameters<typeof setStepStatus__impl>) {
  return runPanelAction(() => setStepStatus__impl(...args));
}
export async function setStepDueDate(...args: Parameters<typeof setStepDueDate__impl>) {
  return runPanelAction(() => setStepDueDate__impl(...args), "Adım tarihi kaydedildi");
}
export async function assignStep(...args: Parameters<typeof assignStep__impl>) {
  return runPanelAction(() => assignStep__impl(...args), "Adım sorumlusu atandı");
}
export async function deleteWorkflow(...args: Parameters<typeof deleteWorkflow__impl>) {
  return runPanelAction(() => deleteWorkflow__impl(...args));
}
