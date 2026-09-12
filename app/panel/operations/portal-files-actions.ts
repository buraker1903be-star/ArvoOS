"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import {
  cleanPortalFileName, PORTAL_ACCESS_RULES, PORTAL_ALLOWED_MIME, PORTAL_BUCKET, PORTAL_EXTENSIONS,
  PORTAL_MAX_BYTES, PORTAL_MAX_FILES_PER_BATCH, PORTAL_OBJECT_NAME, portalExtension, type PortalAccessRule,
} from "./portal-files-shared";

// Müşteri portalı dosyaları (iş detayı kartı). Dosya tarayıcıdan doğrudan
// özel kovaya yüklenir (Vercel işlem gövdesi 50 MB'ı taşımaz; kova RLS'i
// yolu <kurum>/<iş>/ ile sınırlar). Buradaki işlem nesnenin depoda
// gerçekten olduğunu, boyutunu ve türünü depodan okuyup doğrular, sonra
// kaydı ekler. Yetki: işi görebilen herkes (yönetici ya da işin sorumlusu —
// private.arvo_can_access_workflow; tablo ve kova RLS'i de aynı kural).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function portalContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  assertModuleKeyAccess(context.membership.role, "operations", context.hiddenModuleKeys);
  return context;
}

type PortalContext = Awaited<ReturnType<typeof portalContext>>;

async function loadWorkflow({ supabase, membership }: PortalContext, workflowId: string) {
  if (!UUID.test(workflowId)) throw new Error("İş seçilmedi.");
  const { data: workflow } = await supabase.from("operation_workflows").select("id,contract_id")
    .eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!workflow) throw new Error("İş akışı bulunamadı ya da bu iş için yetkiniz yok.");
  const { data: contract } = await supabase.from("crm_contracts").select("id,tracking_code")
    .eq("organization_id", membership.organization_id)
    .or(workflow.contract_id ? `workflow_id.eq.${workflowId},id.eq.${workflow.contract_id}` : `workflow_id.eq.${workflowId}`)
    .limit(1).maybeSingle();
  return { workflow, contract: contract as { id: string; tracking_code: string | null } | null };
}

const isAccessRule = (value: string): value is PortalAccessRule => value in PORTAL_ACCESS_RULES;

type UploadedEntry = { path: string; name: string };

async function registerPortalFiles__impl(formData: FormData) {
  const context = await portalContext();
  const { supabase, membership, userId } = context;
  const workflowId = String(formData.get("workflow_id") ?? "");
  const accessRule = String(formData.get("access_rule") ?? "after_full_payment");
  const note = String(formData.get("note") ?? "").trim();
  if (!isAccessRule(accessRule)) throw new Error("Geçersiz erişim kuralı.");
  if (note.length > 500) throw new Error("Not en fazla 500 karakter olabilir.");

  let entries: UploadedEntry[];
  try {
    entries = JSON.parse(String(formData.get("files") ?? "[]")) as UploadedEntry[];
  } catch {
    throw new Error("Yüklenen dosyalar okunamadı.");
  }
  if (!Array.isArray(entries) || !entries.length) throw new Error("Gönderilecek dosya seçilmedi.");
  if (entries.length > PORTAL_MAX_FILES_PER_BATCH) throw new Error(`Tek seferde en fazla ${PORTAL_MAX_FILES_PER_BATCH} dosya gönderilebilir.`);

  const { workflow, contract } = await loadWorkflow(context, workflowId);
  const prefix = `${membership.organization_id}/${workflow.id}/`;
  const paths = entries.map((entry) => String(entry?.path ?? ""));
  const cleanup = () => supabase.storage.from(PORTAL_BUCKET).remove(paths.filter((path) => path.startsWith(prefix)));

  try {
    if (!contract) throw new Error("Bu iş bir sözleşmeye bağlı değil; müşteri portalı kapalı.");

    const rows = [];
    for (const entry of entries) {
      const path = String(entry?.path ?? "");
      const name = cleanPortalFileName(String(entry?.name ?? ""));
      if (!path.startsWith(prefix) || !PORTAL_OBJECT_NAME.test(path.slice(prefix.length))) throw new Error("Dosya yolu bu işe ait değil.");
      const ext = portalExtension(name);
      if (!name || !ext) throw new Error(`${name || "Dosya"}: bu dosya türü desteklenmiyor.`);
      if (!path.endsWith(`.${ext}`)) throw new Error(`${name}: dosya uzantısı yüklenen dosyayla eşleşmiyor.`);

      // Boyut ve tür tarayıcıdan değil, depodan okunur.
      const { data: info, error: infoError } = await supabase.storage.from(PORTAL_BUCKET).info(path);
      if (infoError || !info) throw new Error(`${name}: dosya depoda bulunamadı, lütfen yeniden yükleyin.`);
      const size = Number(info.size ?? 0);
      const mime = String(info.contentType ?? "").split(";")[0].trim().toLowerCase();
      if (!size || size > PORTAL_MAX_BYTES) throw new Error(`${name}: dosya 50 MB sınırını aşıyor ya da boş.`);
      if (!PORTAL_ALLOWED_MIME.has(mime)) throw new Error(`${name}: bu dosya türü desteklenmiyor.`);

      rows.push({
        organization_id: membership.organization_id,
        workflow_id: workflow.id,
        storage_path: path,
        file_name: name,
        mime_type: mime || PORTAL_EXTENSIONS[ext],
        size_bytes: size,
        note: note || null,
        access_rule: accessRule,
      });
    }

    const { data: inserted, error } = await supabase.from("operation_customer_files").insert(rows).select("id");
    if (error) throw new Error("Dosya kaydedilemedi: " + error.message);
    if ((inserted?.length ?? 0) !== rows.length) throw new Error("Dosya kaydedilemedi: bu iş için yetkiniz yok.");

    // Müşteri yazışmasına otomatik bilgi notu (takip ekranında görünür).
    const names = rows.map((row) => row.file_name);
    const listed = names.length > 3 ? `${names.slice(0, 3).join(", ")} ve ${names.length - 3} dosya daha` : names.join(", ");
    const body = `Size ${names.length > 1 ? `${names.length} yeni dosya` : "yeni bir dosya"} gönderildi: ${listed}.`
      + (accessRule === "after_full_payment" ? " Ödemeniz tamamlandığında “Dosyalarınız” bölümünden indirebilirsiniz." : " “Dosyalarınız” bölümünden indirebilirsiniz.");
    const { data: employee } = await supabase.from("hr_employees").select("full_name")
      .eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle();
    const { error: messageError } = await supabase.from("customer_file_messages").insert({
      organization_id: membership.organization_id,
      contract_id: contract.id,
      workflow_id: workflow.id,
      sender_type: "staff",
      sender_user_id: userId,
      sender_name: employee?.full_name || "Operasyon Ekibi",
      body: body.slice(0, 2000),
    });
    // Dosya gönderildi; bilgi mesajı yan etkidir, başarısızlığı işlemi geri almaz.
    if (messageError) console.error("[portal-files] bilgi mesajı yazılamadı", messageError.message);
  } catch (error) {
    await cleanup();
    throw error;
  }

  revalidatePath(`/panel/operations/${workflow.id}`);
  return { ok: true as const };
}

async function setPortalFileAccessRule__impl(formData: FormData) {
  const { supabase, membership } = await portalContext();
  const fileId = String(formData.get("file_id") ?? "");
  const workflowId = String(formData.get("workflow_id") ?? "");
  const accessRule = String(formData.get("access_rule") ?? "");
  if (!UUID.test(fileId) || !UUID.test(workflowId)) throw new Error("Dosya seçilmedi.");
  if (!isAccessRule(accessRule)) throw new Error("Geçersiz erişim kuralı.");
  const { data, error } = await supabase.from("operation_customer_files").update({ access_rule: accessRule })
    .eq("id", fileId).eq("workflow_id", workflowId).eq("organization_id", membership.organization_id).is("deleted_at", null)
    .select("id");
  if (error) throw new Error("Erişim kuralı güncellenemedi: " + error.message);
  // RLS engellediğinde güncelleme sessizce 0 satır döner
  if (!data?.length) throw new Error("Erişim kuralı güncellenemedi: dosya bulunamadı ya da yetkiniz yok.");
  revalidatePath(`/panel/operations/${workflowId}`);
}

async function updatePortalFileNote__impl(formData: FormData) {
  const { supabase, membership } = await portalContext();
  const fileId = String(formData.get("file_id") ?? "");
  const workflowId = String(formData.get("workflow_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!UUID.test(fileId) || !UUID.test(workflowId)) throw new Error("Dosya seçilmedi.");
  if (note.length > 500) throw new Error("Not en fazla 500 karakter olabilir.");
  const { data, error } = await supabase.from("operation_customer_files").update({ note: note || null })
    .eq("id", fileId).eq("workflow_id", workflowId).eq("organization_id", membership.organization_id).is("deleted_at", null)
    .select("id");
  if (error) throw new Error("Not kaydedilemedi: " + error.message);
  if (!data?.length) throw new Error("Not kaydedilemedi: dosya bulunamadı ya da yetkiniz yok.");
  revalidatePath(`/panel/operations/${workflowId}`);
}

// Yumuşak silme: kayıt ve nesne denetim için kalır, müşteri artık göremez
// ve indiremez (liste ve indirme kapısı deleted_at'e bakar).
async function removePortalFile__impl(formData: FormData) {
  const { supabase, membership } = await portalContext();
  const fileId = String(formData.get("file_id") ?? "");
  const workflowId = String(formData.get("workflow_id") ?? "");
  if (!UUID.test(fileId) || !UUID.test(workflowId)) throw new Error("Dosya seçilmedi.");
  const { data, error } = await supabase.from("operation_customer_files").update({ deleted_at: new Date().toISOString() })
    .eq("id", fileId).eq("workflow_id", workflowId).eq("organization_id", membership.organization_id).is("deleted_at", null)
    .select("id");
  if (error) throw new Error("Dosya kaldırılamadı: " + error.message);
  if (!data?.length) throw new Error("Dosya kaldırılamadı: dosya bulunamadı ya da yetkiniz yok.");
  revalidatePath(`/panel/operations/${workflowId}`);
}

/** Kayda dönüşmeyen yarım yüklemeleri temizler (yükleme iptal/hata). */
export async function discardPortalUploads(workflowId: string, paths: string[]) {
  const { supabase, membership } = await portalContext();
  if (!UUID.test(String(workflowId))) return;
  const prefix = `${membership.organization_id}/${workflowId}/`;
  const safe = (Array.isArray(paths) ? paths : []).map(String)
    .filter((path) => path.startsWith(prefix) && PORTAL_OBJECT_NAME.test(path.slice(prefix.length)))
    .slice(0, PORTAL_MAX_FILES_PER_BATCH);
  if (!safe.length) return;
  // Kaydı olan dosya asla silinmez.
  const { data: registered } = await supabase.from("operation_customer_files").select("storage_path").in("storage_path", safe);
  const keep = new Set((registered ?? []).map((row) => row.storage_path as string));
  const orphans = safe.filter((path) => !keep.has(path));
  if (orphans.length) await supabase.storage.from(PORTAL_BUCKET).remove(orphans);
}

export async function registerPortalFiles(...args: Parameters<typeof registerPortalFiles__impl>) {
  return runPanelAction(() => registerPortalFiles__impl(...args), "Dosya müşteriye gönderildi");
}
export async function setPortalFileAccessRule(...args: Parameters<typeof setPortalFileAccessRule__impl>) {
  return runPanelAction(() => setPortalFileAccessRule__impl(...args), "Erişim kuralı güncellendi");
}
export async function updatePortalFileNote(...args: Parameters<typeof updatePortalFileNote__impl>) {
  return runPanelAction(() => updatePortalFileNote__impl(...args), "Not kaydedildi");
}
export async function removePortalFile(...args: Parameters<typeof removePortalFile__impl>) {
  return runPanelAction(() => removePortalFile__impl(...args), "Dosya kaldırıldı");
}
