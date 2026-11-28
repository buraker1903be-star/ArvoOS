/*
  Önizleme: @/lib/supabase/proxy yerine.

  Gerçek ara katman oturumu çerezden çözüyor ve host kurallarını
  uyguluyor; önizlemede oturum yok ve host localhost — o yol her panel
  isteğini /login'e indiriyordu. Burada yalnızca O KISIM atlanıyor.

  ESKİ ADRES YÖNLENDİRMELERİ ÇALIŞIYOR: kural saf bir modülde
  (lib/konsol/eski-adresler) ve ara katmanın işi. Önizlemede
  atlansaydı, düzeltilen yumuşak yönlendirme hatası burada hâlâ
  görünür, yani kabul betiği düzeltmeyi hiç sınayamazdı.
*/
import { NextResponse, type NextRequest } from "next/server";
/* Göreli: `@/lib/...` yazılsaydı alias bunu kendine çevirmezdi ama
   öteki önizleme dosyalarıyla aynı üslup kalsın. */
import { eskiKonsolAdresi } from "../../lib/konsol/eski-adresler";

export async function updateSession(request: NextRequest) {
  const eski = eskiKonsolAdresi({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  });
  if (eski) return NextResponse.redirect(new URL(eski, request.url), 308);
  return NextResponse.next();
}
