import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

/*
  Analitik takip kodu (/k.js) ve olay ucu (/api/k) ara katmanın DIŞINDA
  (22.10.2026): kurum sitelerindeki her sayfa açılışında çağrılıyorlar,
  oturum çözmeleri gerekmiyor ve ara katmanın Supabase çağrısı her
  ziyarete gecikme ve maliyet eklerdi.
*/
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|k\\.js$|api/k$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
