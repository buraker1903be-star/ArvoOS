import { NextResponse } from "next/server";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { PORTAL_BUCKET } from "../../../portal-files-shared";

// Personel için müşteri portalı dosyası önizleme/indirme. Personel ödeme
// kilidinden bağımsız her zaman açabilir; yetki tablo ve kova RLS'inden
// gelir (yönetici ya da işin sorumlusu). 60 sn'lik imzalı URL'ye yönlendirir.
// ?download=1 → ek olarak iner, yoksa tarayıcıda açılır.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  if (!UUID.test(id) || !UUID.test(fileId)) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 404 });

  const { supabase, membership, modules, hiddenModuleKeys } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) return NextResponse.json({ error: "Operasyon modülüne erişiminiz yok." }, { status: 403 });
  try {
    assertModuleKeyAccess(membership.role, "operations", hiddenModuleKeys);
  } catch {
    return NextResponse.json({ error: "Bu modüle erişim yetkiniz yok." }, { status: 403 });
  }

  const { data: file, error } = await supabase.from("operation_customer_files")
    .select("storage_path,file_name")
    .eq("id", fileId)
    .eq("workflow_id", id)
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !file) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const { data: signed, error: signError } = await supabase.storage
    .from(PORTAL_BUCKET)
    .createSignedUrl(file.storage_path, 60, download ? { download: file.file_name } : undefined);
  if (signError || !signed?.signedUrl) return NextResponse.json({ error: "Dosya bağlantısı oluşturulamadı." }, { status: 500 });

  return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
