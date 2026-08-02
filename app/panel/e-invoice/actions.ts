"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const documentTypes = new Set(["e_invoice", "e_archive"]);

export async function createSalesInvoice(formData: FormData) {
  const { supabase, organization, membership } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Fatura oluşturma yetkiniz yok.");

  const documentType = String(formData.get("document_type") ?? "");
  const prefix = String(formData.get("prefix") ?? "").trim().toUpperCase();
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const taxNumber = String(formData.get("tax_number") ?? "").replace(/\D/g, "").slice(0, 11);
  const taxOffice = String(formData.get("tax_office") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().slice(0, 180);
  const address = String(formData.get("address") ?? "").trim().slice(0, 1000);
  const description = String(formData.get("description") ?? "").trim();
  const quantity = Number(formData.get("quantity") ?? 1);
  const unitPriceTl = Number(String(formData.get("unit_price") ?? "").replace(",", "."));
  const vatRate = Number(formData.get("vat_rate") ?? 20);

  if (!documentTypes.has(documentType)) throw new Error("Geçerli belge türü seçin.");
  if (!/^[A-Z0-9]{3}$/.test(prefix)) throw new Error("Seri kodu üç harf veya rakam olmalıdır.");
  if (customerName.length < 2) throw new Error("Müşteri adı zorunludur.");
  if (description.length < 2) throw new Error("Hizmet açıklaması zorunludur.");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Geçerli miktar girin.");
  if (!Number.isFinite(unitPriceTl) || unitPriceTl < 0) throw new Error("Geçerli birim fiyat girin.");
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) throw new Error("KDV oranı geçersiz.");

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Oturum doğrulanamadı.");

  const unitPrice = Math.round(unitPriceTl * 100);
  const subtotal = Math.round(quantity * unitPrice);
  const taxTotal = Math.round(subtotal * vatRate / 100);
  const grandTotal = subtotal + taxTotal;

  const { data: invoiceNo, error: noError } = await supabase.rpc("next_invoice_number", {
    p_organization_id: organization.id,
    p_document_type: documentType,
    p_prefix: prefix,
  });
  if (noError || !invoiceNo) throw new Error("Fatura numarası üretilemedi.");

  const { data: invoice, error: invoiceError } = await supabase.from("sales_invoices").insert({
    organization_id: organization.id,
    document_type: documentType,
    status: "draft",
    invoice_no: invoiceNo,
    customer_name: customerName,
    tax_number: taxNumber || null,
    tax_office: taxOffice || null,
    email: email || null,
    address: address || null,
    subtotal,
    tax_total: taxTotal,
    grand_total: grandTotal,
    created_by: userData.user.id,
  }).select("id").single();
  if (invoiceError || !invoice) throw new Error("Fatura oluşturulamadı: " + (invoiceError?.message ?? "bilinmeyen hata"));

  const { error: lineError } = await supabase.from("sales_invoice_lines").insert({
    sales_invoice_id: invoice.id,
    organization_id: organization.id,
    description,
    quantity,
    unit_price: unitPrice,
    vat_rate: vatRate,
    line_total: subtotal,
  });
  if (lineError) {
    await supabase.from("sales_invoices").delete().eq("id", invoice.id).eq("organization_id", organization.id);
    throw new Error("Fatura satırı oluşturulamadı: " + lineError.message);
  }

  revalidatePath("/panel/e-invoice");
}

export async function updateSalesInvoiceStatus(formData: FormData) {
  const { supabase, organization, membership } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Fatura güncelleme yetkiniz yok.");
  const invoiceId = String(formData.get("invoice_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!new Set(["draft", "ready", "canceled"]).has(status)) throw new Error("Geçersiz durum.");
  const { error } = await supabase.from("sales_invoices").update({ status, updated_at: new Date().toISOString() }).eq("id", invoiceId).eq("organization_id", organization.id);
  if (error) throw new Error("Fatura güncellenemedi: " + error.message);
  revalidatePath("/panel/e-invoice");
}
