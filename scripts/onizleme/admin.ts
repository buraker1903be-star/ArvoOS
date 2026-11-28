// Önizleme: @/lib/supabase/admin yerine.
import { sahteIstemci } from "./sahte-istemci";
import { dbIstemcisi, SAHIP } from "./db-istemci";

/*
  Yönetici istemcisi RLS'i ATLAR. Önizlemenin veritabanı kipinde bu
  "veritabanı sahibi" demek: oturum kurulmuyor, politikalar
  uygulanmıyor — canlıdaki service_role gibi.
*/
const DB = process.env.ARVOOS_ONIZLEME_DB === "1";

export function createAdminClient() {
  return (DB ? dbIstemcisi(SAHIP) : sahteIstemci()) as never;
}
