// Sunucuya özel: takip koduyla müşteri portalı dosyalarını okur. Yalnızca
// "use server" işlem dosyalarından (app/takip/actions.ts, app/durum/[slug]/actions.ts)
// içe aktarılır. Kilit ve kalan bakiye veritabanında hesaplanır
// (list_customer_portal_files); depolama yolu hiç dönmez.

import { createClient } from "@/lib/supabase/server";

export type CustomerPortalFile = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  note: string | null;
  created_at: string;
  locked: boolean;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_url: string | null;
};

export async function fetchCustomerPortalFiles(code: string): Promise<CustomerPortalFile[]> {
  const normalizedCode = String(code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalizedCode.length < 6) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_customer_portal_files", { p_tracking_code: normalizedCode });
  if (error) throw error;
  return ((data ?? []) as CustomerPortalFile[]).map((file) => ({
    ...file,
    size_bytes: Number(file.size_bytes),
    total_amount: Number(file.total_amount ?? 0),
    paid_amount: Number(file.paid_amount ?? 0),
    remaining_amount: Number(file.remaining_amount ?? 0),
    // Yalnızca https ödeme bağlantıları müşteriye gösterilir.
    payment_url: file.payment_url && /^https:\/\//i.test(file.payment_url) ? file.payment_url : null,
  }));
}
