import { redirect } from "next/navigation";

// Eski giriş sayfası (tarayıcıda saklanan oturumla çalışıyordu) kaldırıldı;
// panel çerez tabanlı /login kullanıyor. Eski yer imleri ve e-postalardaki
// linkler 404 vermesin diye yönlendiriyoruz.
export default function LegacyLoginRedirect() {
  redirect("/login");
}
