import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Sunucuya özel (service role) Supabase istemcisi. Yalnızca sunucu
 * işlemlerinde ve sunucu bileşenlerinde kullanılır; RLS'i atlar, bu yüzden
 * çağıran taraf yetkiyi (ör. kurucu kontrolü) kendisi yapmalıdır.
 * Anahtar tanımlı değilse null döner; çağıran taraf bunu kullanıcıya açıklar.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Yeni biçim (sb_secret_…) ya da eski service_role anahtarı
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
