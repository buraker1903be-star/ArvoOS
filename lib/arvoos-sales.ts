import type { SupabaseSession } from "@/lib/supabase-auth";
import { supabaseRequest } from "@/lib/supabase-rest";

function request<T>(path: string, options: RequestInit & { accessToken: string }) {
  return supabaseRequest<T>(path, { ...options, errorMessage: "Satış isteği başarısız oldu" });
}

export type SalesOrder = {
  id: string; organization_id: string; customer_id: string; order_no: string;
  status: "draft" | "confirmed" | "partially_fulfilled" | "fulfilled" | "cancelled";
  order_date: string; expected_delivery_date: string | null; currency: string; notes: string | null;
  created_at: string; updated_at: string;
  customer: { id: string; name: string } | null;
  items: Array<{ id: string; item_id: string | null; description: string; quantity: number; fulfilled_quantity: number; unit: string; unit_price: number; tax_rate: number }>;
};

export function getSalesOrders(session: SupabaseSession, organizationId: string) {
  const select = encodeURIComponent("id,organization_id,customer_id,order_no,status,order_date,expected_delivery_date,currency,notes,created_at,updated_at,customer:crm_customers(id,name),items:sales_order_items(id,item_id,description,quantity,fulfilled_quantity,unit,unit_price,tax_rate)");
  return request<SalesOrder[]>(`/rest/v1/sales_orders?select=${select}&organization_id=eq.${organizationId}&order=order_date.desc,created_at.desc`, { method: "GET", accessToken: session.access_token });
}

export function createSalesOrder(session: SupabaseSession, organizationId: string, value: {
  customer_id: string; order_no: string; order_date: string; expected_delivery_date?: string | null; currency: string; notes?: string;
  item_id?: string | null; description: string; quantity: number; unit: string; unit_price: number; tax_rate: number;
}) {
  return request<string>("/rest/v1/rpc/create_sales_order", { method: "POST", accessToken: session.access_token, body: JSON.stringify({
    target_organization_id: organizationId, target_customer_id: value.customer_id, target_order_no: value.order_no,
    target_order_date: value.order_date, target_expected_delivery_date: value.expected_delivery_date || null,
    target_currency: value.currency, target_notes: value.notes || "", target_item_id: value.item_id || null,
    target_description: value.description, target_quantity: value.quantity, target_unit: value.unit,
    target_unit_price: value.unit_price, target_tax_rate: value.tax_rate,
  }) });
}

export function setSalesOrderStatus(session: SupabaseSession, organizationId: string, orderId: string, status: SalesOrder["status"]) {
  return request<void>("/rest/v1/rpc/set_sales_order_status", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ target_organization_id: organizationId, target_order_id: orderId, target_status: status }) });
}
