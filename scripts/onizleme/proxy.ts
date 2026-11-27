/*
  Önizleme: @/lib/supabase/proxy yerine. Ara katman oturumu çerezden
  çözüyor ve host kurallarını uyguluyor; önizlemede oturum yok ve host
  localhost — gerçek ara katman her panel isteğini /login'e indiriyordu.
  Burada istek olduğu gibi geçiyor.
*/
import { NextResponse } from "next/server";
/* İmza gerçek modülle aynı kalsın diye istek parametresi duruyor ama
   okunmuyor; adı yazılmadı, yoksa lint "kullanılmıyor" diyor. */
export async function updateSession() {
  return NextResponse.next();
}
