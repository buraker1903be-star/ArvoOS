import { notFound, redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

/*
  LİSANS VE KOTA SAYFASI KALDIRILDI (14.10.2026, kurum sahibinin isteği).

  Aynı ekran (kota şeridi, ürün satırları, düzenleme pencereleri, erişim
  anahtarları) müşteri detayının Lisanslar penceresi: ikisi de
  ./lisans-bolumu'nu çiziyordu. Ayrı sayfa, kurum seçicisiyle ikinci bir
  yol olarak yer kaplıyordu.

  Adres yönlendirme olarak kalıyor (eski bağlantılar kırılmasın). Lisans
  işlemleri (./actions) ve bileşenleri yerinde: pencere onları kullanıyor.
*/
export default async function EskiLisansSayfasi({ searchParams }: { searchParams: Promise<{ organization?: string }> }) {
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { organization } = await searchParams;
  if (organization && /^[0-9a-f-]{36}$/i.test(organization)) redirect(`/panel/platform/musteriler/${organization}?pencere=lisanslar`);
  redirect("/panel/platform/musteriler");
}
