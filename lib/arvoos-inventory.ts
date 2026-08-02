import type { SupabaseSession } from "@/lib/supabase-auth";
import { supabaseRequest } from "@/lib/supabase-rest";

function request<T>(path: string, options: RequestInit & { accessToken: string }) {
  return supabaseRequest<T>(path, { ...options, errorMessage: "Stok isteği başarısız oldu" });
}

export type InventoryItem = {
  id: string; organization_id: string; item_type: "product" | "service"; name: string; sku: string;
  barcode: string | null; unit: string; category: string | null; purchase_price: number; sale_price: number;
  currency: string; minimum_stock: number; is_active: boolean; created_at: string; updated_at: string;
};

export type Warehouse = {
  id: string; organization_id: string; name: string; code: string; location: string | null; is_active: boolean;
};

export type InventoryBalance = {
  organization_id: string; warehouse_id: string; item_id: string; quantity: number; updated_at: string;
  warehouse: { id: string; name: string; code: string } | null;
  item: { id: string; name: string; sku: string; unit: string; minimum_stock: number; item_type: "product" | "service" } | null;
};

export type StockMovement = {
  id: string; organization_id: string; warehouse_id: string; destination_warehouse_id: string | null; item_id: string;
  movement_type: "in" | "out" | "transfer" | "adjustment"; quantity: number; unit_cost: number | null;
  note: string | null; movement_date: string; created_at: string;
  warehouse: { name: string; code: string } | null; destination: { name: string; code: string } | null;
  item: { name: string; sku: string; unit: string } | null;
};

export type Supplier = {
  id: string; organization_id: string; name: string; tax_number: string | null; tax_office: string | null;
  email: string | null; phone: string | null; city: string | null; address: string | null; contact_name: string | null;
  payment_terms: string | null; is_active: boolean; created_at: string; updated_at: string;
};

export type PurchaseRequest = {
  id: string; organization_id: string; request_no: string; supplier_id: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "ordered" | "partially_received" | "received" | "cancelled";
  requested_by: string; approved_by: string | null; requested_date: string; needed_date: string | null;
  currency: string; notes: string | null; created_at: string; updated_at: string;
  supplier: { id: string; name: string } | null;
  items: Array<{ id: string; description: string; quantity: number; unit: string; unit_price: number; received_quantity: number; item_id: string | null }>;
};

function upsert<T>(session: SupabaseSession, table: string, organizationId: string, value: Record<string, unknown> & { id?: string }) {
  const body = { ...value, organization_id: organizationId };
  if (value.id) {
    const { id, ...changes } = body;
    return request<T>(`/rest/v1/${table}?id=eq.${id}&organization_id=eq.${organizationId}`, {
      method: "PATCH", accessToken: session.access_token, headers: { Prefer: "return=representation" }, body: JSON.stringify(changes),
    });
  }
  return request<T>(`/rest/v1/${table}`, {
    method: "POST", accessToken: session.access_token, headers: { Prefer: "return=representation" }, body: JSON.stringify(body),
  });
}

export function getInventoryItems(session: SupabaseSession, organizationId: string) {
  return request<InventoryItem[]>(`/rest/v1/inventory_items?select=*&organization_id=eq.${organizationId}&order=name.asc`, { method: "GET", accessToken: session.access_token });
}
export function saveInventoryItem(session: SupabaseSession, organizationId: string, item: Partial<InventoryItem>) {
  return upsert<InventoryItem[]>(session, "inventory_items", organizationId, item as Record<string, unknown> & { id?: string });
}
export function getWarehouses(session: SupabaseSession, organizationId: string) {
  return request<Warehouse[]>(`/rest/v1/inventory_warehouses?select=*&organization_id=eq.${organizationId}&order=name.asc`, { method: "GET", accessToken: session.access_token });
}
export function saveWarehouse(session: SupabaseSession, organizationId: string, warehouse: Partial<Warehouse>) {
  return upsert<Warehouse[]>(session, "inventory_warehouses", organizationId, warehouse as Record<string, unknown> & { id?: string });
}
export function getInventoryBalances(session: SupabaseSession, organizationId: string) {
  const select = encodeURIComponent("organization_id,warehouse_id,item_id,quantity,updated_at,warehouse:inventory_warehouses(id,name,code),item:inventory_items(id,name,sku,unit,minimum_stock,item_type)");
  return request<InventoryBalance[]>(`/rest/v1/inventory_balances?select=${select}&organization_id=eq.${organizationId}&order=updated_at.desc`, { method: "GET", accessToken: session.access_token });
}
export function getStockMovements(session: SupabaseSession, organizationId: string) {
  const select = encodeURIComponent("id,organization_id,warehouse_id,destination_warehouse_id,item_id,movement_type,quantity,unit_cost,note,movement_date,created_at,warehouse:inventory_warehouses!stock_movements_warehouse_id_fkey(name,code),destination:inventory_warehouses!stock_movements_destination_warehouse_id_fkey(name,code),item:inventory_items(name,sku,unit)");
  return request<StockMovement[]>(`/rest/v1/stock_movements?select=${select}&organization_id=eq.${organizationId}&order=movement_date.desc,created_at.desc&limit=100`, { method: "GET", accessToken: session.access_token });
}
export function recordStockMovement(session: SupabaseSession, organizationId: string, movement: { warehouse_id: string; destination_warehouse_id?: string | null; item_id: string; movement_type: StockMovement["movement_type"]; quantity: number; unit_cost?: number | null; note?: string; movement_date: string }) {
  return request<string>("/rest/v1/rpc/record_stock_movement", { method: "POST", accessToken: session.access_token, body: JSON.stringify({
    target_organization_id: organizationId, target_warehouse_id: movement.warehouse_id,
    target_destination_warehouse_id: movement.destination_warehouse_id || null, target_item_id: movement.item_id,
    target_movement_type: movement.movement_type, target_quantity: movement.quantity, target_unit_cost: movement.unit_cost ?? null,
    target_reference_type: "manual", target_reference_id: null, target_note: movement.note || "", target_movement_date: movement.movement_date,
  }) });
}
export function getSuppliers(session: SupabaseSession, organizationId: string) {
  return request<Supplier[]>(`/rest/v1/suppliers?select=*&organization_id=eq.${organizationId}&order=name.asc`, { method: "GET", accessToken: session.access_token });
}
export function saveSupplier(session: SupabaseSession, organizationId: string, supplier: Partial<Supplier>) {
  return upsert<Supplier[]>(session, "suppliers", organizationId, supplier as Record<string, unknown> & { id?: string });
}
export function getPurchaseRequests(session: SupabaseSession, organizationId: string) {
  const select = encodeURIComponent("id,organization_id,request_no,supplier_id,status,requested_by,approved_by,requested_date,needed_date,currency,notes,created_at,updated_at,supplier:suppliers(id,name),items:purchase_request_items(id,description,quantity,unit,unit_price,received_quantity,item_id)");
  return request<PurchaseRequest[]>(`/rest/v1/purchase_requests?select=${select}&organization_id=eq.${organizationId}&order=created_at.desc`, { method: "GET", accessToken: session.access_token });
}
export function createPurchaseRequest(session: SupabaseSession, organizationId: string, userId: string, requestValue: { request_no: string; supplier_id?: string | null; requested_date: string; needed_date?: string | null; currency: string; notes?: string; item: { item_id?: string | null; description: string; quantity: number; unit: string; unit_price: number } }) {
  return request<PurchaseRequest[]>("/rest/v1/purchase_requests?select=*", { method: "POST", accessToken: session.access_token, headers: { Prefer: "return=representation" }, body: JSON.stringify({
    organization_id: organizationId, request_no: requestValue.request_no, supplier_id: requestValue.supplier_id || null,
    status: "draft", requested_by: userId, requested_date: requestValue.requested_date, needed_date: requestValue.needed_date || null,
    currency: requestValue.currency, notes: requestValue.notes || null,
  }) }).then(async (rows) => {
    const saved = rows[0];
    await request("/rest/v1/purchase_request_items", { method: "POST", accessToken: session.access_token, body: JSON.stringify({
      organization_id: organizationId, purchase_request_id: saved.id, item_id: requestValue.item.item_id || null,
      description: requestValue.item.description, quantity: requestValue.item.quantity, unit: requestValue.item.unit, unit_price: requestValue.item.unit_price,
    }) });
    return rows;
  });
}
export function setPurchaseRequestStatus(session: SupabaseSession, organizationId: string, requestId: string, status: PurchaseRequest["status"]) {
  return request<void>("/rest/v1/rpc/set_purchase_request_status", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ target_organization_id: organizationId, target_request_id: requestId, target_status: status }) });
}
