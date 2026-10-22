import { getPanelContext } from "@/lib/panel-context";
import { modulGerek, yetkiGerek } from "@/lib/modul-kapisi";
import { assertModuleAccess } from "@/lib/role-permissions";
import "./analitik.css";

/*
  Kapı sayfa düzeninde: /panel/analitik altındaki her ekran buradan
  geçer. Modül ayrı satılıyor; kurumda kapalıysa "modül kapalı" ekranı
  kimin açabileceğini yazar (lib/modul-kapisi.ts).
*/
export default async function AnalitikLayout({ children }: { children: React.ReactNode }) {
  const { membership, hiddenModuleKeys, modules, izin } = await getPanelContext();
  modulGerek(modules, "analitik");
  assertModuleAccess(membership.role, "/panel/analitik", hiddenModuleKeys);
  yetkiGerek(izin("analitik.gor") || izin("analitik.yonet"), "analitik");
  return <>{children}</>;
}
