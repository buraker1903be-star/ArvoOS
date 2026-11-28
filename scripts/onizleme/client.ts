// Önizleme: @/lib/supabase/client yerine (sahte-istemci.ts).
import { sahteIstemci } from "./sahte-istemci";
export function createClient() {
  return sahteIstemci() as never;
}
