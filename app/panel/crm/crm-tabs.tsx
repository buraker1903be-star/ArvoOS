import Link from "next/link";

const tabs = [
  { key: "talepler", href: "/panel/crm", label: "Talepler" },
  { key: "teklifler", href: "/panel/crm/proposals", label: "Teklifler" },
  { key: "sozlesmeler", href: "/panel/crm/contracts", label: "Sözleşmeler" },
  { key: "takvim", href: "/panel/crm/takvim", label: "Takvim" },
] as const;

export function CrmTabs({ active }: { active: (typeof tabs)[number]["key"] }) {
  return (
    <div className="module-tabs">
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} className={tab.key === active ? "active" : ""}>{tab.label}</Link>
      ))}
    </div>
  );
}
