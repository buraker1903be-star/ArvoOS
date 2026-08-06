"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const maxFileSize = 15 * 1024 * 1024; // 15 MB

async function hrDocContext() {
  const context = await getPanelContext();
  if (!["owner", "admin"].includes(context.membership.role)) throw new Error("Özlük dosyalarını yönetme yetkiniz yok.");
  return context;
}

export async function uploadEmployeeDocument(formData: FormData) {
  const { supabase, membership, userId } = await hrDocContext();
  const employeeId = String(formData.get("employee_id") ?? "").trim();
  if (!employeeId) throw new Error("Personel seçilmedi.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Bir dosya seçin.");
  if (file.size > maxFileSize) throw new Error("Dosya en fazla 15 MB olabilir.");

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_ ığĞşŞıİöÖüÜçÇ]/g, "_").slice(0, 180);
  const storagePath = `${membership.organization_id}/${employeeId}/${Date.now()}-${safeName}`;
  const buffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage.from("hr-documents").upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw new Error("Dosya yüklenemedi: " + uploadError.message);

  const { error } = await supabase.from("hr_employee_documents").insert({
    organization_id: membership.organization_id,
    employee_id: employeeId,
    file_name: file.name.slice(0, 255),
    storage_path: storagePath,
    file_size: file.size,
    content_type: file.type || null,
    uploaded_by: userId,
  });
  if (error) {
    await supabase.storage.from("hr-documents").remove([storagePath]);
    throw new Error("Dosya kaydı oluşturulamadı: " + error.message);
  }

  revalidatePath("/panel/hr");
}

export async function deleteEmployeeDocument(formData: FormData) {
  const { supabase, membership } = await hrDocContext();
  const documentId = String(formData.get("document_id") ?? "").trim();
  if (!documentId) throw new Error("Dosya seçilmedi.");

  const { data: doc, error: fetchError } = await supabase.from("hr_employee_documents")
    .select("storage_path").eq("id", documentId).eq("organization_id", membership.organization_id).maybeSingle();
  if (fetchError || !doc) throw new Error("Dosya bulunamadı.");

  const { error } = await supabase.from("hr_employee_documents").delete().eq("id", documentId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Dosya silinemedi: " + error.message);

  await supabase.storage.from("hr-documents").remove([doc.storage_path]);
  revalidatePath("/panel/hr");
}
