import Link from "next/link";

export type FinanceSection = "overview" | "accounts" | "plans" | "invoices" | "banking";

export function FinanceNavigation({ active, hasAccounts = true, hasBanking = true }: { active: FinanceSection; hasAccounts?: boolean; hasBanking?: boolean }) {
  const items = [
    { key: "overview" as const, label: "Özet", href: "/panel/finance" },
    ...(hasAccounts ? [{ key: "accounts" as const, label: "Cari Hesaplar", href: "/panel/finance?tab=cari" }] : []),
    { key: "plans" as const, label: "Tahsilat Planları", href: "/panel/finance/payment-plans" },
    { key: "invoices" as const, label: "Faturalar", href: "/panel/finance/invoices" },
    ...(hasBanking ? [{ key: "banking" as const, label: "Banka", href: "/panel/finance?tab=banka" }] : []),
  ];
  return <nav className="finance-tabs" aria-label="Finans bölümleri">{items.map((item) => <Link className={active === item.key ? "active" : ""} href={item.href} key={item.key}>{item.label}</Link>)}</nav>;
}
