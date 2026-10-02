import Link from "next/link";

// Finans modülünün tek sekme dizisi. Eskiden ana sayfa kendi dizisini
// çiziyordu; bu dosyadaki ikinci dizi (Özet · Tahsilat Planları · Faturalar ·
// Banka) hiçbir sayfada kullanılmıyordu ve "?tab=banka" okunmuyordu.
export type FinanceTabKey = "genel-bakis" | "cari" | "paytr" | "maliyet" | "raporlar";

/*
  Sekme görünürlüğü artık rol listesinden değil yetenek anahtarından geliyor.
  Eskiden "İş Maliyetleri" ve "Raporlar" sabit olarak Kurum Sahibi +
  Yönetici'ye açıktı; bir kurum kendi yöneticisinden maliyeti almak ya da
  satış şefine raporu açmak isterse yapamıyordu — kural koddaydı.
*/
type PanelAccess = {
  modules: { code: string }[];
  yetkiler: ReadonlySet<string>;
};

export const canManageCosts = (context: PanelAccess) => context.yetkiler.has("finance.maliyet.yonet");

/** Raporlar sekmesi: kurumda Raporlama modülü açık + rolde rapor yetkisi var. */
export const canSeeFinanceReports = (context: PanelAccess) =>
  context.modules.some((module) => module.code === "reporting") &&
  context.yetkiler.has("finance.rapor.gor");

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
