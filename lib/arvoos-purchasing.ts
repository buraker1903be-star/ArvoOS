import type { SupabaseSession } from "@/lib/supabase-auth";
import { supabaseRequest } from "@/lib/supabase-rest";

async function rpc<T>(session: SupabaseSession, functionName: string, body: Record<string, unknown>): Promise<T> {
  return supabaseRequest<T>(`/rest/v1/rpc/${functionName}`, {
    method: "POST",
    accessToken: session.access_token,
    errorMessage: "Satın alma işlemi başarısız oldu",
    body: JSON.stringify(body),
  });
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
