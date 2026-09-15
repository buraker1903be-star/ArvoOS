import Link from "next/link";

// Finans modülünün tek sekme dizisi. Eskiden ana sayfa kendi dizisini
// çiziyordu; bu dosyadaki ikinci dizi (Özet · Tahsilat Planları · Faturalar ·
// Banka) hiçbir sayfada kullanılmıyordu ve "?tab=banka" okunmuyordu.
export type FinanceTabKey = "genel-bakis" | "cari" | "paytr" | "maliyet" | "raporlar";

type PanelAccess = {
  membership: { role: string };
  modules: { code: string }[];
  hiddenModuleKeys: ReadonlySet<string>;
};

/** İş maliyetleri yalnızca Kurum Sahibi ve Yönetici'ye açık. */
export const canManageCosts = (context: PanelAccess) => ["owner", "admin"].includes(context.membership.role);

/**
 * Raporlar sekmesi: kurumda Raporlar modülü açık olmalı ve rolün "Raporlar"
 * yetkisi kapatılmamış olmalı (Kurum Sahibi kısıtlanamaz). Finans kapısı
 * (sahip/yönetici) zaten ayrıca uygulanıyor.
 */
export const canSeeFinanceReports = (context: PanelAccess) =>
  context.modules.some((module) => module.code === "reporting") &&
  (context.membership.role === "owner" || !context.hiddenModuleKeys.has("reports"));

export function FinanceTabs({ active, context }: { active: FinanceTabKey; context: PanelAccess }) {
  const tabs: { key: FinanceTabKey; href: string; label: string }[] = [
    { key: "genel-bakis", href: "/panel/finance/genel-bakis", label: "Genel Bakış" },
    { key: "cari", href: "/panel/finance", label: "Cari Hesaplar" },
    { key: "paytr", href: "/panel/finance?gorunum=paytr", label: "PAYTR Tahsilatları" },
    ...(canManageCosts(context) ? [{ key: "maliyet" as const, href: "/panel/finance?gorunum=maliyet", label: "İş Maliyetleri" }] : []),
    ...(canSeeFinanceReports(context) ? [{ key: "raporlar" as const, href: "/panel/finance/raporlar", label: "Raporlar" }] : []),
  ];
  return (
    <nav className="module-tabs fin-tabs" aria-label="Finans bölümleri">
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} className={tab.key === active ? "active" : ""} aria-current={tab.key === active ? "page" : undefined}>{tab.label}</Link>
      ))}
    </nav>
  );
}
