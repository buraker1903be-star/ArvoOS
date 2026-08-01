import type { SupabaseSession } from "@/lib/supabase-auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://scgjhsyygkmntxytkjbf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_S0jBPDJuvwLuHI3TzyGllQ_PVlBAslN";

type RequestOptions = RequestInit & { accessToken: string };
async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const { accessToken, headers, ...rest } = options;
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...rest, headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...headers } });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(error?.message || `İrsaliye isteği başarısız oldu (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type SalesDeliveryNote = {
  id: string; organization_id: string; shipment_id: string; sales_order_id: string; customer_id: string;
  delivery_note_no: string; status: "draft" | "issued" | "cancelled"; issue_date: string; delivery_date: string | null;
  delivery_address: string | null; carrier_name: string | null; tracking_no: string | null; notes: string | null;
  issued_at: string | null; created_at: string;
  customer: { id: string; name: string; address: string | null; city: string | null } | null;
  order: { id: string; order_no: string } | null;
  shipment: { id: string; shipment_no: string } | null;
  items: Array<{ id: string; description: string; quantity: number; unit: string; item: { id: string; name: string; sku: string } | null }>;
};

export function getSalesDeliveryNotes(session: SupabaseSession, organizationId: string) {
  const select = encodeURIComponent("id,organization_id,shipment_id,sales_order_id,customer_id,delivery_note_no,status,issue_date,delivery_date,delivery_address,carrier_name,tracking_no,notes,issued_at,created_at,customer:crm_customers(id,name,address,city),order:sales_orders(id,order_no),shipment:sales_shipments(id,shipment_no),items:sales_delivery_note_items(id,description,quantity,unit,item:inventory_items(id,name,sku))");
  return request<SalesDeliveryNote[]>(`/rest/v1/sales_delivery_notes?select=${select}&organization_id=eq.${organizationId}&order=issue_date.desc,created_at.desc`, { method: "GET", accessToken: session.access_token });
}

export function createSalesDeliveryNote(session: SupabaseSession, organizationId: string, value: { shipment_id: string; delivery_note_no: string; issue_date: string; delivery_date?: string | null; delivery_address?: string; notes?: string }) {
  return request<string>("/rest/v1/rpc/create_sales_delivery_note", { method: "POST", accessToken: session.access_token, body: JSON.stringify({
    target_organization_id: organizationId, target_shipment_id: value.shipment_id, target_delivery_note_no: value.delivery_note_no,
    target_issue_date: value.issue_date, target_delivery_date: value.delivery_date || null,
    target_delivery_address: value.delivery_address || "", target_notes: value.notes || "",
  }) });
}

export function setSalesDeliveryNoteStatus(session: SupabaseSession, organizationId: string, deliveryNoteId: string, status: SalesDeliveryNote["status"]) {
  return request<void>("/rest/v1/rpc/set_sales_delivery_note_status", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ target_organization_id: organizationId, target_delivery_note_id: deliveryNoteId, target_status: status }) });
}
