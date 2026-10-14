import { notFound, redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

/*
  KİRACI DOSYALARI KALDIRILDI (14.10.2026, kurum sahibinin isteği:
  "kiracı dosyaları sayfasını kaldıralım, yer kaplıyor").

  Bu adres kiracı listesi ve tek kiracının dosyasıydı. İkisi de
  Müşteriler'de: liste Müşteriler'in kendisi, dosya müşteri detayının
  "Kurum Ayarları" penceresi (kurum ayarları formu, panel modülleri,
  ürün köprüleri, kurulum adımları, sahibe giriş bağlantısı); kullanıcılar
  ve lisans kendi pencerelerinde. Yeni müşteri sihirbazı Müşteriler'in
  başlığında.

  Adres YÖNLENDİRME olarak kalıyor: e-postalarda, yer imlerinde ve eski
  bildirimlerde ?organization= bağlantıları var; kırılmasınlar.
  ?filtre=kurulum Kurulum Yönetimi'ne, ?filtre=dikkat Müşteriler'e gidiyor.
*/
export default async function EskiKiraciSayfasi({ searchParams }: { searchParams: Promise<{ organization?: string; provisioned?: string; filtre?: string }> }) {
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { organization, provisioned, filtre } = await searchParams;
  if (organization && /^[0-9a-f-]{36}$/i.test(organization)) {
    redirect(`/panel/platform/musteriler/${organization}?pencere=ayarlar${provisioned === "1" ? "&provisioned=1" : ""}`);
  }
  if (filtre === "kurulum") redirect("/panel/platform/kurulumlar?asama=devam");
  redirect("/panel/platform/musteriler");
}
