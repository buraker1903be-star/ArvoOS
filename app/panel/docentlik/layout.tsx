import { getPanelContext } from "@/lib/panel-context";
import { modulGerek, modulGerekKosullu } from "@/lib/modul-kapisi";
import { isNavigationGroupHiddenForRole } from "@/lib/role-permissions";

/*
  DOÇENTLİK KAPISI (F6 PR4). /panel/docentlik altındaki her ekran buradan
  geçer; yetkinin üç katmanından ikisi burada (sunucu), üçüncüsü RLS.

  1. Modül kurumda açık mı. `modules` kurumun açık organization_modules
     satırları; Doçentlik kuruma özel olduğu için izin listesinde OLMAYAN
     bir kurumda bu satır açık olamaz (20261114190657'nin tetikleyicisi
     kapalıya çeviriyor). Yani "listede var" = izin listesinde VE açık.
     Veriyi asıl koruyan yine RLS (private.modul_kurumda_acik).
  2. Kişide ya da rolünde modül gizlenmiş mi (Kurum Sahibi hariç).

  Kurucu kendiliğinden görmez: kurucu konsolu Arvo'nun kendi kurumuyla
  çalışıyor ve orada modül yok. Kurucu AkademikMerkez'in üyesiyse o
  üyeliğin rolüyle girer — kurucu olduğu için değil.

  Kapalıysa çökme değil, "modül kapalı" ekranı (lib/modul-kapisi.ts).
  assertModuleAccess burada bilerek kullanılmıyor: fırlattığı hata
  üretimde "Bir sorun oluştu" ekranına dönüşüyor.
*/
export default async function DocentlikLayout({ children }: { children: React.ReactNode }) {
  const { membership, hiddenModuleKeys, modules } = await getPanelContext();
  modulGerek(modules, "docentlik");
  modulGerekKosullu(!isNavigationGroupHiddenForRole(membership.role, "docentlik", hiddenModuleKeys), "docentlik");
  return <>{children}</>;
}
