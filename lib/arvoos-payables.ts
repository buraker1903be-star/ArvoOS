import type { SupabaseSession } from "@/lib/supabase-auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://scgjhsyygkmntxytkjbf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_S0jBPDJuvwLuHI3TzyGllQ_PVlBAslN";

type RequestOptions = RequestInit & { accessToken: string };

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const { accessToken, headers, ...rest } = options;
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...rest,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(error?.message || `Tedarikçi borcu isteği başarısız oldu (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type SupplierInvoice = {
  id: string;
  organization_id: string;
  supplier_id: string;
  purchase_request_id: string | null;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  status: "open" | "partially_paid" | "paid" | "cancelled";
  notes: string | null;
  created_at: string;
  supplier: { id: string; name: string } | null;
  purchase_request: { id: string; request_no: string } | null;
};

export function getSupplierInvoices(session: SupabaseSession, organizationId: string) {
  const select = encodeURIComponent("id,organization_id,supplier_id,purchase_request_id,invoice_no,invoice_date,due_date,currency,subtotal,tax_amount,total_amount,paid_amount,status,notes,created_at,supplier:suppliers(id,name),purchase_request:purchase_requests(id,request_no)");
  return request<SupplierInvoice[]>(`/rest/v1/supplier_invoices?select=${select}&organization_id=eq.${organizationId}&order=due_date.asc.nullslast,invoice_date.desc`, {
    method: "GET",
    accessToken: session.access_token,
  });
}

export function createSupplierInvoice(session: SupabaseSession, organizationId: string, value: {
  supplier_id: string;
  purchase_request_id?: string | null;
  invoice_no: string;
  invoice_date: string;
  due_date?: string | null;
  currency: string;
  subtotal: number;
  tax_amount: number;
  notes?: string;
}) {
  return request<string>("/rest/v1/rpc/create_supplier_invoice", {
    method: "POST",
    accessToken: session.access_token,
    body: JSON.stringify({
      target_organization_id: organizationId,
      target_supplier_id: value.supplier_id,
      target_purchase_request_id: value.purchase_request_id || null,
      target_invoice_no: value.invoice_no,
      target_invoice_date: value.invoice_date,
      target_due_date: value.due_date || null,
      target_currency: value.currency,
      target_subtotal: value.subtotal,
      target_tax_amount: value.tax_amount,
      target_notes: value.notes || "",
    }),
  });
}

export function paySupplierInvoice(session: SupabaseSession, organizationId: string, value: {
  invoice_id: string;
  account_id: string;
  amount: number;
  payment_date: string;
  reference_no?: string;
}) {
  return request<string>("/rest/v1/rpc/pay_supplier_invoice", {
    method: "POST",
    accessToken: session.access_token,
    body: JSON.stringify({
      target_organization_id: organizationId,
      target_invoice_id: value.invoice_id,
      target_account_id: value.account_id,
      target_amount: value.amount,
      target_payment_date: value.payment_date,
      target_reference_no: value.reference_no || "",
    }),
  });
}
