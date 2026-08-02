"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

export async function createPaytrOrder(formData: FormData) {
  const { supabase, organization, membership } = await getPanelContext();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("PayTR ödemesini yalnızca kurum sahibi veya yöneticisi başlatabilir.");
  }

  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const customerName = String(formData.get("customer_name") ?? "").trim().slice(0, 60);
  const customerPhone = String(formData.get("customer_phone") ?? "").trim().slice(0, 20);
  const customerAddress = String(formData.get("customer_address") ?? "").trim().slice(0, 400);
  const customerEmail = String(formData.get("customer_email") ?? "").trim().toLowerCase().slice(0, 100);

  if (!invoiceId || customerName.length < 2 || customerPhone.length < 7 || customerAddress.length < 5 || !customerEmail.includes("@")) {
    throw new Error("PayTR ödeme bilgilerini eksiksiz doldurun.");
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("billing_invoices")
    .select("id,total,currency,status")
    .eq("id", invoiceId)
    .eq("organization_id", organization.id)
    .eq("status", "open")
    .maybeSingle();
  if (invoiceError || !invoice || invoice.total <= 0) throw new Error("Ödenebilir açık fatura bulunamadı.");

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Oturum doğrulanamadı.");

  const merchantOid = `ARV${Date.now()}${crypto.randomBytes(5).toString("hex")}`.slice(0, 64);
  const { error } = await supabase.from("paytr_payment_orders").insert({
    organization_id: organization.id,
    invoice_id: invoice.id,
    merchant_oid: merchantOid,
    amount: invoice.total,
    currency: invoice.currency === "TRY" ? "TL" : invoice.currency,
    customer_email: customerEmail,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_address: customerAddress,
    created_by: authData.user.id,
  });
  if (error) throw new Error(`PayTR siparişi oluşturulamadı: ${error.message}`);

  redirect(`/panel/billing/paytr?order=${merchantOid}`);
}
