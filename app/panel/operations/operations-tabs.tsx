import Link from "next/link";

const tabs = [
  { key: "is-akisi", href: "/panel/operations", label: "İş Akışı" },
  { key: "gantt", href: "/panel/operations/gantt", label: "Gantt Çizelgesi" },
  { key: "takvim", href: "/panel/operations/takvim", label: "Takvim" },
] as const;

export function OperationsTabs({ active }: { active: (typeof tabs)[number]["key"] }) {
  return (
    <div className="module-tabs">
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} className={tab.key === active ? "active" : ""}>{tab.label}</Link>
      ))}
    </div>
  );
}
