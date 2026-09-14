import type { getPanelContext } from "@/lib/panel-context";

type PanelSupabase = Awaited<ReturnType<typeof getPanelContext>>["supabase"];

const extensionByType: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Kurum görselini (logo, kaşe-imza) "organization-assets" deposuna yükler ve
 * herkese açık adresini döndürür. Dosya seçilmediyse null. SVG kabul edilmez
 * (herkese açık depoda betik taşıyabilir). Aynı adla üzerine yazılır; adres
 * sonundaki ?v= önbelleği tazeler.
 */
export async function uploadOrganizationImage(
  supabase: PanelSupabase,
  organizationId: string,
  file: FormDataEntryValue | null,
  name: "logo" | "signature-stamp",
  label: string,
): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  const extension = extensionByType[file.type];
  if (!extension) throw new Error(`${label} PNG, JPG veya WEBP olmalıdır.`);
  if (file.size > MAX_BYTES) throw new Error(`${label} en fazla 5 MB olabilir.`);

  const objectPath = `${organizationId}/${name}.${extension}`;
  const { error } = await supabase.storage
    .from("organization-assets")
    .upload(objectPath, await file.arrayBuffer(), { contentType: file.type, upsert: true, cacheControl: "3600" });
  if (error) throw new Error(`${label} yüklenemedi: ${error.message}`);

  const { data } = supabase.storage.from("organization-assets").getPublicUrl(objectPath);
  return `${data.publicUrl}?v=${Date.now()}`;
}
