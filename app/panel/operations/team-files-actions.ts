"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import {
  cleanPortalFileName, PORTAL_ALLOWED_MIME, PORTAL_EXTENSIONS, PORTAL_MAX_BYTES,
  PORTAL_MAX_FILES_PER_BATCH, PORTAL_OBJECT_NAME, portalExtension,
} from "./portal-files-shared";
import { TEAM_BUCKET } from "./team-files-shared";

/*
  İŞİN EKİP İÇİ DOSYALARI (13.10.2026; tablo 20261013065421). Sahadan
  çekilen fotoğraf ve belge: müşteri görmez. Müşteri dosyalarıyla
  (portal-files-actions.ts) aynı kurgu: dosya tarayıcıdan doğrudan özel
  kovaya yüklenir (Vercel işlem gövdesi 50 MB'ı taşımaz), burada nesnenin
  depoda olduğu, boyutu ve türü DEPODAN okunup doğrulanır, sonra kayıt
  eklenir. Yetki: işi görebilen (yönetici ya da işin sorumlusu —
  private.arvo_can_access_workflow; kova ve tablo RLS'i de aynı kural).
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ekipDosyaBaglami() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  assertModuleKeyAccess(context.membership.role, "operations", context.hiddenModuleKeys);
  return context;
}

type YuklenenDosya = { path: string; name: string };

async function registerTeamFiles__impl(formData: FormData) {
  const { supabase, membership } = await ekipDosyaBaglami();
  const workflowId = String(formData.get("workflow_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!UUID.test(workflowId)) throw new Error("İş seçilmedi.");
  if (note.length > 500) throw new Error("Not en fazla 500 karakter olabilir.");

  let entries: YuklenenDosya[];
  try {
    entries = JSON.parse(String(formData.get("files") ?? "[]")) as YuklenenDosya[];
  } catch {
    throw new Error("Yüklenen dosyalar okunamadı.");
  }
  if (!Array.isArray(entries) || !entries.length) throw new Error("Gönderilecek dosya seçilmedi.");
  if (entries.length > PORTAL_MAX_FILES_PER_BATCH) throw new Error(`Tek seferde en fazla ${PORTAL_MAX_FILES_PER_BATCH} dosya eklenebilir.`);

  const { data: workflow } = await supabase.from("operation_workflows").select("id")
    .eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!workflow) throw new Error("İş bulunamadı ya da bu iş için yetkiniz yok.");

  const prefix = `${membership.organization_id}/${workflow.id}/`;
  const paths = entries.map((entry) => String(entry?.path ?? ""));
  // Kayıt oluşmazsa nesne kovada izsiz kalmasın.
  const cleanup = async () => {
    const targets = paths.filter((path) => path.startsWith(prefix));
    if (!targets.length) return;
    const { error } = await supabase.storage.from(TEAM_BUCKET).remove(targets);
    if (error) console.error("[ekip-dosyalari] yarım kalan yükleme temizlenemedi", { paths: targets, message: error.message });
  };

  try {
    const rows = [];
    for (const entry of entries) {
      const path = String(entry?.path ?? "");
      const name = cleanPortalFileName(String(entry?.name ?? ""));
      if (!path.startsWith(prefix) || !PORTAL_OBJECT_NAME.test(path.slice(prefix.length))) throw new Error("Dosya yolu bu işe ait değil.");
      const ext = portalExtension(name);
      if (!name || !ext) throw new Error(`${name || "Dosya"}: bu dosya türü desteklenmiyor.`);
      if (!path.endsWith(`.${ext}`)) throw new Error(`${name}: dosya uzantısı yüklenen dosyayla eşleşmiyor.`);

      const { data: info, error: infoError } = await supabase.storage.from(TEAM_BUCKET).info(path);
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
      });
    }

    const { data: inserted, error } = await supabase.from("operation_team_files").insert(rows).select("id");
    if (error) throw new Error("Dosya kaydedilemedi: " + error.message);
    if ((inserted?.length ?? 0) !== rows.length) throw new Error("Dosya kaydedilemedi: bu iş için yetkiniz yok.");
  } catch (error) {
    await cleanup();
    throw error;
  }

  revalidatePath(`/panel/operations/${workflow.id}`);
  return { ok: true as const };
}

async function removeTeamFile__impl(formData: FormData) {
  const { supabase, membership } = await ekipDosyaBaglami();
  const fileId = String(formData.get("file_id") ?? "");
  const workflowId = String(formData.get("workflow_id") ?? "");
  if (!UUID.test(fileId) || !UUID.test(workflowId)) throw new Error("Dosya seçilmedi.");
  // Kayıt geri alınamaz şekilde işaretlenir (tetikleyici tarihi ve kişiyi yazar).
  const { data, error } = await supabase.from("operation_team_files").update({ deleted_at: new Date().toISOString() })
    .eq("id", fileId).eq("workflow_id", workflowId).eq("organization_id", membership.organization_id).is("deleted_at", null).select("id");
  if (error) throw new Error("Dosya kaldırılamadı: " + error.message);
  if (!data?.length) throw new Error("Dosya kaldırılamadı: kayıt bulunamadı ya da yetkiniz yok.");
  revalidatePath(`/panel/operations/${workflowId}`);
}

export async function registerTeamFiles(...args: Parameters<typeof registerTeamFiles__impl>) {
  return runPanelAction(() => registerTeamFiles__impl(...args), "Dosya işe eklendi");
}
export async function removeTeamFile(...args: Parameters<typeof removeTeamFile__impl>) {
  return runPanelAction(() => removeTeamFile__impl(...args), "Dosya kaldırıldı");
}
