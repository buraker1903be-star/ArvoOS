import type { SupabaseSession } from "@/lib/supabase-auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://scgjhsyygkmntxytkjbf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_S0jBPDJuvwLuHI3TzyGllQ_PVlBAslN";

async function rpc<T>(session: SupabaseSession, functionName: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(error?.message || `Satın alma işlemi başarısız oldu (${response.status}).`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function receivePurchaseRequest(
  session: SupabaseSession,
  organizationId: string,
  requestId: string,
  warehouseId: string,
  receiptNo: string,
  receiptDate: string,
  note: string,
) {
  return rpc<string>(session, "receive_purchase_request", {
    target_organization_id: organizationId,
    target_request_id: requestId,
    target_warehouse_id: warehouseId,
    target_receipt_no: receiptNo,
    target_receipt_date: receiptDate,
    target_note: note,
  });
}
