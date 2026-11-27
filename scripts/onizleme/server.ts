// Önizleme: @/lib/supabase/server yerine.
import { sahteIstemci } from "./sahte-istemci";
import { dbIstemcisi } from "./db-istemci";

/*
  İKİ ÖNİZLEME KİPİ:
   - varsayılan: örnek veriden okuyan, yazmaları simüle eden sahte
     istemci (hızlı; görsel tarama ve düzen ölçümü için).
   - ARVOOS_ONIZLEME_DB=1: altında PGlite, canlı şema, RLS ve gerçek
     tetikleyiciler. Yazmalar KALICI; arayüzden başlatılan bir işlemin
     kayda geçtiği ancak böyle gösterilebiliyor.
*/
const DB = process.env.ARVOOS_ONIZLEME_DB === "1";

export async function createClient() {
  return (DB ? dbIstemcisi() : sahteIstemci()) as never;
}
