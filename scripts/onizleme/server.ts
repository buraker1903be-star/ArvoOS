// Önizleme: @/lib/supabase/server yerine (sahte-istemci.ts).
import { sahteIstemci } from "./sahte-istemci";
export async function createClient() {
  return sahteIstemci() as never;
}
