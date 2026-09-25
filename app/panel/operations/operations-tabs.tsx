import Link from "next/link";

// Operasyon modülünün sekmeleri. "Genel bakış" modülün giriş sayfası
// (/panel/operations); aktif işler tablosu /panel/operations/isler'de,
// arşivlenen işler /panel/operations/arsiv'de.
const tabs = [
  { key: "genel-bakis", href: "/panel/operations", label: "Genel Bakış" },
  { key: "is-akisi", href: "/panel/operations/isler", label: "İşler" },
  { key: "gantt", href: "/panel/operations/gantt", label: "Gantt Çizelgesi" },
  { key: "takvim", href: "/panel/operations/takvim", label: "Takvim" },
  { key: "arsiv", href: "/panel/operations/arsiv", label: "Arşiv" },
  { key: "sablon", href: "/panel/operations/sablon", label: "Adım Şablonu" },
] as const;

export type OperationsTabKey = (typeof tabs)[number]["key"];

export function OperationsTabs({ active }: { active: OperationsTabKey }) {
  return (
    <div className="module-tabs">
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} className={tab.key === active ? "active" : ""} aria-current={tab.key === active ? "page" : undefined}>{tab.label}</Link>
      ))}
    </div>
  );
}
