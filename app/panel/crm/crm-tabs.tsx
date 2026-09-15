import Link from "next/link";

// CRM modülünün sekmeleri. "Genel Bakış" satışçının günlük özet ekranı
// (/panel/crm/genel-bakis); talepler tablosu modülün giriş adresinde
// (/panel/crm) kalır, çünkü panelin birçok yeri oraya bağlanıyor.
const tabs = [
  { key: "genel-bakis", href: "/panel/crm/genel-bakis", label: "Genel Bakış" },
  { key: "talepler", href: "/panel/crm", label: "Talepler" },
  { key: "teklifler", href: "/panel/crm/proposals", label: "Teklifler" },
  { key: "sozlesmeler", href: "/panel/crm/contracts", label: "Sözleşmeler" },
  { key: "takvim", href: "/panel/crm/takvim", label: "Takvim" },
] as const;

export type CrmTabKey = (typeof tabs)[number]["key"];

export function CrmTabs({ active }: { active: CrmTabKey }) {
  return (
    <div className="module-tabs">
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} className={tab.key === active ? "active" : ""} aria-current={tab.key === active ? "page" : undefined}>{tab.label}</Link>
      ))}
    </div>
  );
}
