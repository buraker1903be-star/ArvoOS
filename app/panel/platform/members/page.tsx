import { notFound, redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

/*
  KURUM BAZINDA ÜYELER KALDIRILDI (14.10.2026, kurum sahibinin isteği).

  Bu sayfa dört ürünün kullanıcılarını kurum kurum listeliyordu. Aynı dizin
  (lib/member-directory) Kullanıcılar sayfasında aktif / pasif / davet
  sekmeleriyle duruyor; bir kurumun üyeleri ve erişim anahtarları müşteri
  detayının Kullanıcılar penceresinde. Üçüncü bir liste yer kaplıyordu.

  Adres yönlendirme olarak kalıyor: eski bağlantılar kırılmasın. Erişim
  işlemi (./actions uyeErisimiDegistir) müşteri detayı kullandığı için
  yerinde.
*/
export default async function EskiUyelerSayfasi() {
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  redirect("/panel/platform/kullanicilar");
}
