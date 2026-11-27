// Önizleme: @/lib/supabase/admin yerine. Yönetici istemcisi de sahte.
import { sahteIstemci } from "./sahte-istemci";
export function createAdminClient() {
  return sahteIstemci() as never;
}
