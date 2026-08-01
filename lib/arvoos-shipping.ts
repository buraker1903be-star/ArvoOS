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
    throw new Error(error?.message || `Sevkiyat isteği başarısız oldu (${response.status}).`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type SalesShipment = {
  id: string;
  organization_id: string;
  sales_order_id: string;
  warehouse_id: string;
  shipment_no: string;
  status: "draft" | "ready" | "shipped" | "cancelled";
  shipment_date: string;
  tracking_no: string | null;
  carrier_name: string | null;
  notes: string | null;
  shipped_at: string | null;
  created_at: string;
  order: { id: string; order_no: string; customer: { id: string; name: string } | null } | null;
  warehouse: { id: string; name: string; code: string } | null;
  items: Array<{
    id: string;
    sales_order_item_id: string;
    item_id: string;
    quantity: number;
    order_item: { id: string; description: string; quantity: number; fulfilled_quantity: number; unit: string } | null;
    item: { id: string; name: string; sku: string; unit: string } | null;
  }>;
};

export function getSalesShipments(session: SupabaseSession, organizationId: string) {
  const select = encodeURIComponent("id,organization_id,sales_order_id,warehouse_id,shipment_no,status,shipment_date,tracking_no,carrier_name,notes,shipped_at,created_at,order:sales_orders(id,order_no,customer:crm_customers(id,name)),warehouse:inventory_warehouses(id,name,code),items:sales_shipment_items(id,sales_order_item_id,item_id,quantity,order_item:sales_order_items(id,description,quantity,fulfilled_quantity,unit),item:inventory_items(id,name,sku,unit))");
  return request<SalesShipment[]>(`/rest/v1/sales_shipments?select=${select}&organization_id=eq.${organizationId}&order=shipment_date.desc,created_at.desc`, {
    method: "GET",
    accessToken: session.access_token,
  });
}

export function createSalesShipment(session: SupabaseSession, organizationId: string, value: {
  sales_order_id: string;
  warehouse_id: string;
  shipment_no: string;
  shipment_date: string;
  tracking_no?: string;
  carrier_name?: string;
  notes?: string;
  sales_order_item_id: string;
  quantity: number;
}) {
  return request<string>("/rest/v1/rpc/create_sales_shipment", {
    method: "POST",
    accessToken: session.access_token,
    body: JSON.stringify({
      target_organization_id: organizationId,
      target_sales_order_id: value.sales_order_id,
      target_warehouse_id: value.warehouse_id,
      target_shipment_no: value.shipment_no,
      target_shipment_date: value.shipment_date,
      target_tracking_no: value.tracking_no || "",
      target_carrier_name: value.carrier_name || "",
      target_notes: value.notes || "",
      target_sales_order_item_id: value.sales_order_item_id,
      target_quantity: value.quantity,
    }),
  });
}

export function setSalesShipmentStatus(session: SupabaseSession, organizationId: string, shipmentId: string, status: SalesShipment["status"]) {
  return request<void>("/rest/v1/rpc/set_sales_shipment_status", {
    method: "POST",
    accessToken: session.access_token,
    body: JSON.stringify({
      target_organization_id: organizationId,
      target_shipment_id: shipmentId,
      target_status: status,
    }),
  });
}
