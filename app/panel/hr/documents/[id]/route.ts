import { NextResponse } from "next/server";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership, hiddenModuleKeys } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Bu dosyaya erişim yetkiniz yok." }, { status: 403 });
  }
  // Route handler'lar app/panel/hr/layout.tsx'i çalıştırmaz; Yetkilendirme'den
  // İK'sı kapatılmış bir admin, sayfalara giremediği hâlde özlük dosyasını
  // bu adresten indirebiliyordu. Kontrol sunucu işlemlerindekiyle aynı.
  try {
    assertModuleKeyAccess(membership.role, "hr", hiddenModuleKeys);
  } catch {
    return NextResponse.json({ error: "Bu modüle erişim yetkiniz yok." }, { status: 403 });
  }

  const { data: doc, error } = await supabase.from("hr_employee_documents")
    .select("storage_path,file_name")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (error || !doc) {
    return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("hr-documents")
    .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Dosya bağlantısı oluşturulamadı." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
