"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { diffFields, logActivity } from "@/lib/activity-log";
import { reportActionFailure } from "@/lib/action-diagnostics";
import { requestStageNames } from "./request-status";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { noteReturningCustomer } from "./customer-history-query";

const defaultProbability: Record<string, number> = {
  lead: 10,
  qualified: 25,
  proposal: 50,
  lost: 0,
};
const text = (formData: FormData, key: string, max = 500) =>
  String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
async function crmContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "crm"))
    throw new Error("CRM modülüne erişiminiz yok.");
  assertModuleKeyAccess(context.membership.role, "crm", context.hiddenModuleKeys);
  return context;
}
/*
  YORUM İŞLEMİNİN MODÜL KAPISI.

  Kurum içi yorum kutusu iki yüzeyde birden duruyor: CRM kayıtlarında
  (talep, teklif, sözleşme) ve OPERASYONDAKİ iş detayında. İşlem ise
  hepsi için crmContext() çağırıyordu, yani CRM modülü olmayan bir
  operasyon personeli işi açabiliyor ama o sayfadaki yoruma yazamıyordu
  — hata RLS'e varmadan, modül kapısında dönüyordu. 02.10.2026'da üç
  kişi tam bu yüzden yazamadı ve sebep RLS'te arandı.

  Kapı artık yüzeye göre: iş bağlamındaki yorum operasyon modülünü,
  geri kalanı CRM'i istiyor. Yetkiyi yine veritabanı politikası
  belirliyor; bu yalnızca "bu ekran bu kullanıcıda açık mı" sorusu.
*/
async function yorumContext(contextType: string) {
  const context = await getPanelContext();
  const modul = contextType === "operation" ? "operations" : "crm";
  if (!context.modules.some((module) => module.code === modul))
    throw new Error(
      modul === "operations"
        ? "Operasyon modülüne erişiminiz yok."
        : "CRM modülüne erişiminiz yok.",
    );
  assertModuleKeyAccess(context.membership.role, modul, context.hiddenModuleKeys);
  return context;
}

async function getStageConfiguration(
  supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"],
  organizationId: string,
) {
  const { data, error } = await supabase
    .from("organization_crm_stages")
    .select("code,probability")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (error) throw new Error("CRM aşamaları okunamadı: " + error.message);
  return new Map(
    (data ?? []).map((item) => [String(item.code), Number(item.probability)]),
  );
}
async function validateSalesEmployee(
  supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"],
  organizationId: string,
  employeeId: string,
) {
  if (!employeeId) return { employeeId: null, userId: null };
  const { data, error } = await supabase
    .from("hr_employees")
    .select("id,user_id")
    .eq("organization_id", organizationId)
    .eq("id", employeeId)
    .eq("employment_status", "active")
    .eq("can_receive_sales_requests", true)
    .maybeSingle();
  if (error)
    throw new Error("Satış temsilcisi doğrulanamadı: " + error.message);
  if (!data)
    throw new Error("Seçilen personel satış talebi almaya yetkili değil.");
  return { employeeId: data.id, userId: data.user_id ?? null };
}

/*
  ÇALIŞMA TÜRÜ. İşin görev listesini belirliyor
  (organization_step_template_sets). Bileşik yabancı anahtar
  zaten kurumun kendi türünü zorunlu tutuyor, ama hata "foreign key
  violation" olurdu; satışçı ne olduğunu anlamalı. Boş = öntanımlı tür.
*/
async function calismaTuruCoz(
  supabase: Awaited<ReturnType<typeof crmContext>>["supabase"],
  organizationId: string,
  formData: FormData,
): Promise<string | null> {
  const kod = text(formData, "step_template_set", 40);
  if (!kod) return null;
  const { data } = await supabase
    .from("organization_step_template_sets").select("code")
    .eq("organization_id", organizationId).eq("code", kod).maybeSingle();
  if (!data) throw new Error("Seçilen çalışma türü bulunamadı.");
  return kod;
}

async function createOpportunity__impl(formData: FormData) {
  const context = await crmContext();
  const { supabase, userId, membership, yetkiler } = context;
  const title = text(formData, "title", 180);
  const customerName = text(formData, "customer_name", 180);
  const selectedServiceType = text(formData, "service_type", 120);
  const customServiceType = text(formData, "other_service_type", 120);
  if (title.length < 2)
    throw new Error("Talep konusu en az 2 karakter olmalıdır.");
  if (customerName.length < 2)
    throw new Error("Müşteri veya kurum adı en az 2 karakter olmalıdır.");
  if (selectedServiceType === "Diğer" && customServiceType.length < 2)
    throw new Error("Diğer hizmet türünü yazmalısınız.");
  const canAssign = yetkiler.has("crm.kayit.ata");
  let assignment;
  if (canAssign) {
    assignment = await validateSalesEmployee(
      supabase,
      membership.organization_id,
      text(formData, "assigned_employee_id", 80),
    );
  } else {
    const { data: employee, error: employeeError } = await supabase
      .from("hr_employees")
      .select("id,user_id")
      .eq("organization_id", membership.organization_id)
      .eq("user_id", userId)
      .eq("employment_status", "active")
      .eq("can_receive_sales_requests", true)
      .maybeSingle();
    if (employeeError)
      throw new Error(
        "Satış personeli bilgisi okunamadı: " + employeeError.message,
      );
    if (!employee)
      throw new Error(
        "Hesabınız aktif bir satış personeli kaydıyla eşleşmiyor.",
      );
    assignment = { employeeId: employee.id, userId: employee.user_id };
  }
  const stageMap = await getStageConfiguration(
    supabase,
    membership.organization_id,
  );
  const details = {
    customer_type: text(formData, "customer_type", 40),
    university: text(formData, "university", 180),
    department: text(formData, "department", 180),
    academic_level: text(formData, "academic_level", 80),
    service_type:
      selectedServiceType === "Diğer" ? customServiceType : selectedServiceType,
    language: text(formData, "language", 80),
    scope: text(formData, "scope", 4000),
  };
  const calismaTuru = await calismaTuruCoz(supabase, membership.organization_id, formData);
  const { error } = await supabase.from("crm_opportunities").insert({
    organization_id: membership.organization_id,
    step_template_set: calismaTuru,
    title,
    customer_name: customerName,
    contact_email: text(formData, "contact_email", 240) || null,
    contact_phone: text(formData, "contact_phone", 80) || null,
    source: text(formData, "source", 160) || null,
    notes: text(formData, "notes", 4000) || null,
    expected_close_date: text(formData, "expected_close_date", 20) || null,
    estimated_value: 0,
    probability: stageMap.get("lead") ?? defaultProbability.lead,
    stage: "lead",
    request_details: details,
    assigned_employee_id: assignment.employeeId,
    owner_user_id: assignment.userId,
    created_by: userId,
  });
  if (error) {
    reportActionFailure("createOpportunity", error, {
      organizationId: membership.organization_id,
      role: membership.role,
      createdBy: userId,
      assignedEmployeeId: assignment.employeeId,
      ownerUserId: assignment.userId,
      canAssign,
    });
    throw new Error("Talep oluşturulamadı: " + error.message);
  }

  // Kaydı ayrı bir sorguyla okuyoruz. insert(...).select(...) kullanmak
  // insert'i "eklenen satırı geri döndür" moduna sokuyor ve SELECT
  // politikasının da geçmesini şart koşuyordu; o politika atama kısıtlı
  // olduğu için kayıt oluşturmayı riske atıyordu. Geçmiş kaydı, talebin
  // kendisinden daha az önemli: okunamazsa sessizce atlanıyor.
  const { data: created } = await supabase
    .from("crm_opportunities")
    .select("id,title,customer_name")
    .eq("organization_id", membership.organization_id)
    .eq("created_by", userId)
    .eq("title", title)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (created?.id) {
    await logActivity(supabase, {
      organizationId: membership.organization_id,
      actorUserId: userId,
      action: "create",
      entityType: "crm_opportunity",
      entityId: created.id,
      opportunityId: created.id,
      note: `${created.customer_name} · ${created.title}`,
    });
    // Geri dönen müşteri: telefon geçmiş kayıtlarla eşleşiyorsa talebe kurum
    // içi not düşer; yorum tetikleyicisi atanan temsilciye ve yöneticilere
    // bildirim gönderir. Hata talebin kaydını bozmaz.
    await noteReturningCustomer(context, {
      opportunityId: created.id,
      phone: text(formData, "contact_phone", 80) || null,
    });
    await postaYazismasiniBagla(context, created.id, text(formData, "posta_thread_id", 200));
  }

  revalidatePath("/panel/crm");
  revalidatePath("/panel");
}

/*
  Postadan açılan talep: yazışmayı yeni talebe bağlar.

  Bağ KURULMAZSA talep yine açılmış olur — postadan gelen bilgiyle
  oluşan kayıt, bağdan daha önemli. O yüzden hata fırlatılmıyor, yalnızca
  günlüğe yazılıyor; kullanıcı bağı yazışma ekranından elle de kurabilir.

  Yetki posta tarafından: yazışmanın müşteri bağını değiştirmek
  posta.yonet istiyor (konusmayiKayitBagla ile aynı kural). Yetkisi
  olmayan kişi talebi açabilir ama bağı kuramaz; düğme de ona
  gösterilmiyor.
*/
async function postaYazismasiniBagla(
  context: Awaited<ReturnType<typeof crmContext>>,
  opportunityId: string,
  threadId: string,
) {
  if (!threadId || !context.yetkiler.has("posta.yonet")) return;
  const { error } = await context.supabase
    .from("mail_threads")
    .update({ opportunity_id: opportunityId })
    .eq("organization_id", context.membership.organization_id)
    .eq("thread_id", threadId);
  if (error) console.error("[crm] postadan açılan talep yazışmaya bağlanamadı:", error.message);
  else revalidatePath(`/panel/posta/${threadId}`);
}

async function updateOpportunity__impl(formData: FormData) {
  const { supabase, membership, userId, yetkiler } = await crmContext();
  const opportunityId = text(formData, "opportunity_id", 80);
  // Değişikliği yazabilmek için önceki hali gerekiyor.
  const { data: before } = await supabase
    .from("crm_opportunities")
    .select("title,customer_name,contact_email,contact_phone,source,notes,expected_close_date,assigned_employee_id,stage")
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!before) throw new Error("Talep bulunamadı veya yetkiniz yok.");

  // Yalnızca formda gönderilen alanlar yazılır. Eskiden düzenleme formunda
  // olmayan notlar, kaynak, teslim tarihi ve akademik bilgiler her kayıtta
  // boşaltılıyordu.
  const currentDetails = JSON.parse(
    text(formData, "current_details", 10000) || "{}",
  );
  const requestDetails: Record<string, unknown> = { ...currentDetails };
  for (const [key, max] of [
    ["service_type", 180], ["academic_level", 80], ["university", 180],
    ["department", 180], ["language", 80], ["scope", 4000],
  ] as const) {
    if (formData.has(key)) requestDetails[key] = text(formData, key, max);
  }
  const updates: Record<string, unknown> = {
    request_details: requestDetails,
    updated_at: new Date().toISOString(),
  };
  // Formda yoksa dokunulmuyor: türü olan bir fırsat, türü sormayan bir
  // düzenleme formundan geçince türünü kaybetmemeli.
  if (formData.has("step_template_set")) {
    updates.step_template_set = await calismaTuruCoz(supabase, membership.organization_id, formData);
  }
  for (const [key, max, nullable] of [
    ["title", 180, false], ["customer_name", 180, false],
    ["contact_email", 240, true], ["contact_phone", 80, true],
    ["source", 160, true], ["notes", 4000, true], ["expected_close_date", 20, true],
  ] as const) {
    if (formData.has(key)) updates[key] = nullable ? text(formData, key, max) || null : text(formData, key, max);
  }

  // Temsilci yalnızca gerçekten değiştiyse güncellenir. Eskiden atanmış
  // temsilci listede yoksa (pasif / satışa kapalı) açılır liste boş değer
  // gönderiyor ve alakasız her kayıtta talep sessizce atamasız kalıyordu.
  const canAssign = yetkiler.has("crm.kayit.ata");
  const requestedAssignee = text(formData, "assigned_employee_id", 80);
  if (
    canAssign &&
    formData.has("assigned_employee_id") &&
    requestedAssignee !== (before.assigned_employee_id ?? "")
  ) {
    const assignment = await validateSalesEmployee(
      supabase,
      membership.organization_id,
      requestedAssignee,
    );
    updates.assigned_employee_id = assignment.employeeId;
    updates.owner_user_id = assignment.userId;
  }

  const { data, error } = await supabase
    .from("crm_opportunities")
    .update(updates)
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .select("id,title,customer_name,contact_email,contact_phone,source,notes,expected_close_date,assigned_employee_id,stage")
    .maybeSingle();
  if (error) {
    reportActionFailure("updateOpportunity", error, {
      organizationId: membership.organization_id,
      role: membership.role,
      opportunityId,
      canAssign,
    });
    throw new Error("Talep güncellenemedi: " + error.message);
  }
  // RLS eledi: satışçı yalnızca KENDİSİNE atanmış talebi arşivleyebilir.
  if (!data)
    throw new Error(
      "Talep bulunamadı veya bu talebi arşivleme yetkiniz yok. " +
        "Talep size atanmamışsa yöneticinize başvurun.",
    );

  // Geçmişte "a1b2c3… → d4e5f6…" yazmasın diye temsilci id'lerini
  // okunabilir isme çeviriyoruz.
  const employeeIds = [before?.assigned_employee_id, data.assigned_employee_id]
    .filter((value): value is string => Boolean(value));
  const { data: employeeRows } = employeeIds.length
    ? await supabase
        .from("hr_employees")
        .select("id,full_name")
        .eq("organization_id", membership.organization_id)
        .in("id", employeeIds)
    : { data: [] };
  const employeeNames = new Map((employeeRows ?? []).map((e) => [e.id, e.full_name]));

  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "update",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    opportunityId,
    changes: diffFields(before, data, [
      "title", "customer_name", "contact_email", "contact_phone",
      "source", "notes", "expected_close_date", "assigned_employee_id", "stage",
    ], { assigned_employee_id: (v) => employeeNames.get(v) ?? (v ? "Atandı" : "Atanmadı") }),
  });

  revalidatePath("/panel/crm");
  revalidatePath(`/panel/crm/requests/${opportunityId}`);
}

async function archiveOpportunity__impl(formData: FormData) {
  const { supabase, membership, userId, yetkiler } = await crmContext();
  /*
    Arşivleme artık "talep yönetimi"nden ayrı bir yetenek. Kayıt silinmiyor
    (aşama "lost", sebep lost_reason'a yazılıyor), bu yüzden satış personeli
    de kendi talebini kapatabiliyor. HANGİ talebi kapatabileceğini RLS
    söylüyor: yönetici hepsini, satışçı yalnızca kendisine atanmış olanı
    (members_update_assigned_crm_opportunities).
  */
  if (!yetkiler.has("crm.talep.arsivle"))
    throw new Error("Talep arşivleme yetkiniz yok.");
  const opportunityId = text(formData, "opportunity_id", 80);
  /*
    Sebep artık formdan geliyor (talep detayındaki arşiv çekmecesi). Boş
    gelirse eski sabit metne düşüyor: eylem başka bir yerden sebepsiz
    çağrılsa bile lost_reason boş kalmasın.
  */
  const sebep = text(formData, "archive_reason", 500) || "Talep iptal edilerek arşivlendi.";
  // Silinen kaydın adı geçmişte görünsün diye önceden okuyoruz;
  // sonrasında satır artık okunamayacak.
  const { data: archivedRow } = await supabase
    .from("crm_opportunities")
    .select("title,customer_name")
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("crm_opportunities")
    .update({
      stage: "lost",
      probability: 0,
      lost_reason: sebep,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .select("id")
    .maybeSingle();
  if (error) {
    reportActionFailure("archiveOpportunity", error, {
      organizationId: membership.organization_id,
      role: membership.role,
      opportunityId,
    });
    throw new Error("Talep arşivlenemedi: " + error.message);
  }
  // RLS eledi: satışçı yalnızca KENDİSİNE atanmış talebi arşivleyebilir.
  if (!data)
    throw new Error(
      "Talep bulunamadı veya bu talebi arşivleme yetkiniz yok. " +
        "Talep size atanmamışsa yöneticinize başvurun.",
    );

  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "archive",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    opportunityId,
    /*
      Sebep kayıt geçmişine de yazılıyor: aşama sonradan değişse bile
      talebin neden kapandığı kaybolmasın. lost_reason tek satır, geçmiş
      ise zaman damgalı ve aktörlü.
    */
    note: [
      archivedRow
        ? `${archivedRow.customer_name} · ${archivedRow.title} arşivlendi`
        : "Talep arşivlendi",
      sebep,
    ].join(" · "),
  });

  revalidatePath("/panel/crm");
  revalidatePath("/panel/crm/proposals");
  revalidatePath("/panel");
  // "Sil" talep detayından çağrılıyor; arşivlenen talepte kalmak yerine
  // listeye dönülür.
  redirect("/panel/crm");
}
export async function moveOpportunity(formData: FormData) {
  const { supabase, membership, userId } = await crmContext();
  const opportunityId = text(formData, "opportunity_id", 80);
  const stage = text(formData, "stage", 80);
  if (!new Set(["lead", "qualified", "proposal", "lost"]).has(stage))
    throw new Error("Geçersiz talep durumu.");
  const lostReason = text(formData, "lost_reason", 500);
  if (stage === "lost" && lostReason.length < 2)
    throw new Error("Arşiv nedeni girilmelidir.");
  const stageMap = await getStageConfiguration(
    supabase,
    membership.organization_id,
  );
  const { data: beforeStage } = await supabase
    .from("crm_opportunities")
    .select("stage")
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("crm_opportunities")
    .update({
      stage,
      probability: stageMap.get(stage) ?? defaultProbability[stage] ?? 0,
      lost_reason: stage === "lost" ? lostReason : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .select("id")
    .maybeSingle();
  if (error) {
    reportActionFailure("moveOpportunity", error, {
      organizationId: membership.organization_id,
      role: membership.role,
      opportunityId,
      stage,
    });
    throw new Error("Talep durumu güncellenemedi: " + error.message);
  }
  if (!data)
    throw new Error("Talep bulunamadı veya bu kaydı güncelleme yetkiniz yok.");

  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "stage",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    opportunityId,
    changes: [{
      field: "stage", label: "Aşama",
      from: requestStageNames[beforeStage?.stage ?? ""] ?? (beforeStage?.stage ?? ""),
      to: requestStageNames[stage] ?? stage,
    }],
    note: stage === "lost" && lostReason ? `Kayıp nedeni: ${lostReason}` : undefined,
  });

  revalidatePath("/panel/crm");
  revalidatePath(`/panel/crm/requests/${opportunityId}`);
  revalidatePath("/panel");
}

async function addInternalComment__impl(formData: FormData) {
  const contextType = text(formData, "context_type", 20);
  const { supabase, membership, userId } = await yorumContext(contextType);
  const opportunityId = text(formData, "opportunity_id", 80);
  const contextId = text(formData, "context_id", 80);
  const body = text(formData, "body", 4000);
  if (!opportunityId || !contextId || !new Set(["request", "proposal", "contract", "operation"]).has(contextType))
    throw new Error("Yorumun bağlı olduğu CRM kaydı geçersiz.");
  if (!body) throw new Error("Yorum metni boş bırakılamaz.");

  /*
    FIRSAT ÖN KONTROLÜ KALDIRILDI.

    Burada yazmadan önce fırsat satırı okunuyordu. Bu okuma, INSERT
    politikasının birebir kopyasıydı:
      created_by = auth.uid()
      AND organization_id = private.arvo_firsat_kurumu(opportunity_id)
      AND private.arvo_can_access_opportunity(opportunity_id)
    Yani güvenliğe hiçbir şey eklemiyordu — ama kendi başına kırılabilen
    fazladan bir kapıydı ve 01–02.10.2026'da iki kez tam olarak onu yaptı:
    önce tutar daraltması yüzünden crm_opportunities'i okuyamaz oldu,
    sonra ops_* görünümüne çevrilmesine rağmen üretimde yine boş döndü.
    Operasyon personeli kendi işine not yazamadı.

    Karar: yetkiyi TEK yer söylesin, o da politikanın kendisi. Veritabanı
    reddederse 42501 ile geri döner ve aşağıda anlaşılır bir cümleye
    çevrilir. Elle yazılmış ikinci bir kapı, veritabanının izin verdiği
    işi sessizce engelleyebiliyor.
  */
  // context_id formdan geliyor ve doğrulanmıyordu: yalnızca opportunity_id
  // denetleniyordu. Satır kendi organization_id'mizle yazıldığı için sızıntı
  // yok, ama yorum kuruma ait olmayan bir belge kimliğine bağlanabiliyordu —
  // hiçbir ekranda görünmeyen, silinemeyen bir kayıt.
  /*
    "request" YÜZEYİNDE context_id FIRSATIN KENDİSİDİR.

    CRM talep detay sayfası kaydı crm_opportunities'ten okuyor ve
    bileşene contextId olarak o fırsatın kimliğini veriyor
    (requests/[id]/page.tsx). Burada crm_requests'e bakılıyordu; o ayrı
    bir tablo, fırsatla hiçbir bağı yok, aranan kimlik orada hiçbir zaman
    bulunamıyor. Sonuç: bu sayfadan yorum yazmak role bakmaksızın
    HERKESE kapalıydı, kurum sahibi dahil. Ölçüldü: crm_requests 0 satır.

    Doğru kaynağa (ops_opportunities) çevirmek de yanlış olurdu: context_id
    ile opportunity_id aynı kayıt olduğundan o okuma INSERT politikasının
    kopyası olur — yukarıda kaldırdığım kapının aynısı. Burada SORGU değil
    EŞİTLİK denetleniyor: veritabanına gitmeden, kırılacak bir şey olmadan.
  */
  if (contextType === "request" && contextId !== opportunityId)
    throw new Error("Yorumun bağlı olduğu CRM kaydı geçersiz.");

  // context_id formdan geliyor ve doğrulanmıyordu: yalnızca opportunity_id
  // denetleniyordu. Satır kendi organization_id'mizle yazıldığı için sızıntı
  // yok, ama yorum kuruma ait olmayan bir belge kimliğine bağlanabiliyordu —
  // hiçbir ekranda görünmeyen, silinemeyen bir kayıt. Fırsatın KENDİSİ olan
  // "request" yüzeyi yukarıda eşitlikle karşılandı.
  const contextTables: Record<string, string | null> = {
    request: null,
    // Teklif, sözleşme ve iş AYRI kayıtlar: bunlarda okuma gerçekten
    // gerekiyor, çünkü INSERT politikası context_id'ye bakmıyor.
    proposal: "ops_proposals",
    contract: "ops_contracts",
    operation: "operation_workflows",
  };
  const contextTable = contextTables[contextType];
  if (contextTable) {
    const { data: context, error: contextError } = await supabase
      .from(contextTable)
      .select("id")
      .eq("id", contextId)
      .eq("organization_id", membership.organization_id)
      .maybeSingle();
    if (contextError || !context) {
      reportActionFailure("addInternalComment.baglamKapisi", contextError, {
        organizationId: membership.organization_id,
        role: membership.role,
        opportunityId,
        contextType,
        contextId,
        kaynak: contextTable,
      });
      if (contextError)
        throw new Error(
          `Yorumun bağlı olduğu kayıt okunamadı (${contextError.code ?? "kodsuz"}): ${contextError.message}`,
        );
      /*
        HANGİ KAYIT OLDUĞU MESAJDA YAZIYOR. Eski cümle "CRM kaydı" diyordu
        ve dört ayrı kaynağa karşılık geliyordu; kullanıcı hatayı
        bildirdiğinde hangisinde düştüğü anlaşılmıyordu.
      */
      const kaynakAdi: Record<string, string> = {
        proposal: "teklif",
        contract: "sözleşme",
        operation: "iş",
      };
      throw new Error(
        `Yorumun bağlı olduğu ${kaynakAdi[contextType] ?? contextType} kaydı bulunamadı ` +
          "veya bu kayda erişiminiz yok. (Bu işin sorumlusu siz değilseniz yöneticinizden " +
          "sizi işe atamasını isteyin.)",
      );
    }
  }

  const { error } = await supabase.from("crm_internal_comments").insert({
    organization_id: membership.organization_id,
    opportunity_id: opportunityId,
    context_type: contextType,
    context_id: contextId,
    body,
    created_by: userId,
  });
  if (error) {
    // 42501: satır düzeyi güvenlik reddetti — yetki gerçekten yok.
    if (error.code === "42501") {
      reportActionFailure("addInternalComment.rlsRed", error, {
        organizationId: membership.organization_id,
        role: membership.role,
        opportunityId,
        contextType,
      });
      throw new Error("Bu kaydın yorumlarını yazma yetkiniz yok.");
    }
    reportActionFailure("addInternalComment", error, {
      organizationId: membership.organization_id,
      role: membership.role,
      opportunityId,
      contextType,
      contextId,
    });
    throw new Error("Kurum içi yorum eklenemedi: " + error.message);
  }

  revalidatePath(`/panel/crm/requests/${opportunityId}`);
  revalidatePath("/panel/crm/proposals");
  revalidatePath("/panel/crm/contracts");
  // Yorum hangi belgenin sayfasından eklendiyse o detay da tazelenmeli;
  // eskiden yalnızca operasyon detayı yenileniyor, teklif ve sözleşme
  // sayfasında yeni yorum ancak sert yenilemeyle görünüyordu.
  if (contextType === "proposal") revalidatePath(`/panel/crm/proposals/${contextId}`);
  if (contextType === "contract") revalidatePath(`/panel/crm/contracts/${contextId}`);
  if (contextType === "operation") revalidatePath(`/panel/operations/${contextId}`);
}

/**
 * Yalnızca satış temsilcisini değiştirir.
 *
 * updateOpportunity tüm alanları birden yazdığı için "sadece atama yap"
 * amacıyla kullanılamaz — başlık, müşteri adı ve iletişim bilgileri
 * boşalırdı. Bu yüzden ayrı ve dar kapsamlı bir action.
 */
async function assignOpportunity__impl(formData: FormData) {
  const { supabase, membership, userId, yetkiler } = await crmContext();
  if (!yetkiler.has("crm.kayit.ata")) {
    throw new Error("Temsilci atama yetkiniz yok.");
  }
  const opportunityId = text(formData, "opportunity_id", 80);
  const assignment = await validateSalesEmployee(
    supabase,
    membership.organization_id,
    text(formData, "assigned_employee_id", 80),
  );
  const { data, error } = await supabase
    .from("crm_opportunities")
    .update({
      assigned_employee_id: assignment.employeeId,
      owner_user_id: assignment.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId)
    .eq("organization_id", membership.organization_id)
    .select("id")
    .maybeSingle();
  if (error) {
    reportActionFailure("assignOpportunity", error, {
      organizationId: membership.organization_id,
      role: membership.role,
      opportunityId,
      assignedEmployeeId: assignment.employeeId,
    });
    throw new Error("Temsilci atanamadı: " + error.message);
  }
  // RLS eledi: satışçı yalnızca KENDİSİNE atanmış talebi arşivleyebilir.
  if (!data)
    throw new Error(
      "Talep bulunamadı veya bu talebi arşivleme yetkiniz yok. " +
        "Talep size atanmamışsa yöneticinize başvurun.",
    );

  const { data: assigned } = await supabase
    .from("hr_employees")
    .select("full_name")
    .eq("id", assignment.employeeId ?? "")
    .maybeSingle();
  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "assign",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    opportunityId,
    note: assigned?.full_name ? `${assigned.full_name} atandı` : "Temsilci değiştirildi",
  });

  revalidatePath("/panel/crm");
  revalidatePath(`/panel/crm/requests/${opportunityId}`);
}

/** Yorum sayfalarının tamamını tazeler; yorum zinciri dört yerde birden görünüyor. */
function revalidateCommentChain(opportunityId: string, contextType: string, contextId: string) {
  revalidatePath(`/panel/crm/requests/${opportunityId}`);
  revalidatePath("/panel/crm/proposals");
  revalidatePath("/panel/crm/contracts");
  if (contextType === "proposal") revalidatePath(`/panel/crm/proposals/${contextId}`);
  if (contextType === "contract") revalidatePath(`/panel/crm/contracts/${contextId}`);
  if (contextType === "operation") revalidatePath(`/panel/operations/${contextId}`);
}

/**
 * Kendi yorumunu düzenler.
 *
 * Yetki kontrolünü burada da yapıyoruz ama asıl güvence RLS'te:
 * "authors edit own crm internal comments" politikası created_by
 * eşleşmeyen satırı hiç döndürmüyor.
 */
export async function updateInternalComment(formData: FormData) {
  const contextType = text(formData, "context_type", 20);
  const { supabase, membership, userId } = await yorumContext(contextType);
  const commentId = text(formData, "comment_id", 80);
  const body = text(formData, "body", 4000);
  const opportunityId = text(formData, "opportunity_id", 80);
  const contextId = text(formData, "context_id", 80);
  if (!commentId) throw new Error("Yorum seçilmedi.");
  if (!body) throw new Error("Yorum metni boş bırakılamaz.");

  const { data, error } = await supabase
    .from("crm_internal_comments")
    .update({ body, edited_at: new Date().toISOString() })
    .eq("id", commentId)
    .eq("organization_id", membership.organization_id)
    .eq("created_by", userId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Yorum güncellenemedi: " + error.message);
  if (!data) throw new Error("Yorum bulunamadı veya yalnızca kendi yorumunuzu düzenleyebilirsiniz.");

  revalidateCommentChain(opportunityId, contextType, contextId);
}

/**
 * Yorumu siler. Kendi yorumu herkes, başkasınınkini yönetici silebilir;
 * ayrımı RLS politikası yapıyor.
 */
async function deleteInternalComment__impl(formData: FormData) {
  const contextType = text(formData, "context_type", 20);
  const { supabase, membership } = await yorumContext(contextType);
  const commentId = text(formData, "comment_id", 80);
  const opportunityId = text(formData, "opportunity_id", 80);
  const contextId = text(formData, "context_id", 80);
  if (!commentId) throw new Error("Yorum seçilmedi.");

  const { data, error } = await supabase
    .from("crm_internal_comments")
    .delete()
    .eq("id", commentId)
    .eq("organization_id", membership.organization_id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Yorum silinemedi: " + error.message);
  if (!data) throw new Error("Yorum bulunamadı veya silme yetkiniz yok.");

  revalidateCommentChain(opportunityId, contextType, contextId);
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function createOpportunity(...args: Parameters<typeof createOpportunity__impl>) {
  return runPanelAction(() => createOpportunity__impl(...args), "Talep sisteme girildi");
}
export async function updateOpportunity(...args: Parameters<typeof updateOpportunity__impl>) {
  return runPanelAction(() => updateOpportunity__impl(...args), "Talep güncellendi");
}
export async function archiveOpportunity(...args: Parameters<typeof archiveOpportunity__impl>) {
  return runPanelAction(() => archiveOpportunity__impl(...args));
}
export async function addInternalComment(...args: Parameters<typeof addInternalComment__impl>) {
  return runPanelAction(() => addInternalComment__impl(...args), "Yorum kaydedildi");
}
export async function assignOpportunity(...args: Parameters<typeof assignOpportunity__impl>) {
  return runPanelAction(() => assignOpportunity__impl(...args), "Satış temsilcisi atandı");
}
export async function deleteInternalComment(...args: Parameters<typeof deleteInternalComment__impl>) {
  return runPanelAction(() => deleteInternalComment__impl(...args));
}
