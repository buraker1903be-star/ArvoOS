import Link from "next/link";
import type { ReactNode } from "react";
import { getPanelContext } from "@/lib/panel-context";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { formatPersonName } from "@/lib/format-name";
import { FinanceTabs, canManageCosts } from "../finance-navigation";
import { buildAccountBalances } from "../account-balances";
import "../../crm/crm.css";
import "../../operations/overview.css";

// Finans genel bakış: tahsilat odaklı günlük ekran. Açık bakiye, bu ay
// tahsilat, gecikmiş ve yaklaşan taksitler, en yüksek açık bakiyeli cariler
// ve son tahsilatlar. Kart dili operasyon/CRM genel bakışıyla aynı.
// Rakamlar sekmelerle aynı kuralla: bakiyeler Cari Hesaplar'daki
// buildAccountBalances ile, gecikme PAYTR Tahsilatları'ndaki kuralla
// (ödenmemiş ve vadesi bugünden önce) hesaplanır.

type Entry = { id: string; entry_type: "debit" | "credit"; amount: number; description: string; source_type: string | null; transaction_date: string };
type Party = { id: string; name: string; phone: string | null; email: string | null; account_entries: Entry[] };
type Customer = { customer_name: string } | { customer_name: string }[] | null;
type Contract = { id: string; party_id: string | null; amount: number; contract_no: string; title: string; payment_plan_id: string | null; crm_opportunities: Customer };
type Installment = { id: string; payment_plan_id: string; installment_no: number; due_date: string | null; amount: number; status: string };
type CreditRow = { id: string; amount: number; transaction_date: string; description: string; party_id: string; account_parties: { name: string } | { name: string }[] | null };
type Tone = "info" | "gold" | "success" | "danger" | "warning" | "brand" | "neutral";

const LIST_LIMIT = 5;
const UPCOMING_DAYS = 14;
const money = (amount: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(amount || 0) / 100);
const customerOf = (value: Customer) => formatPersonName(Array.isArray(value) ? value[0]?.customer_name : value?.customer_name) || "Müşteri";
const partyNameOf = (value: CreditRow["account_parties"]) => (Array.isArray(value) ? value[0]?.name : value?.name) || "Cari";
/** İki tarih anahtarı (YYYY-AA-GG) arasındaki gün farkı. */
const dayDiff = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
/** Tahsilat kayıtlarında saat yok, yalnızca tarih: "bugün", "dün", "5 gün önce". */
const daysAgoLabel = (dateKey: string, today: string) => {
  const days = dayDiff(dateKey, today);
  return days <= 0 ? "bugün" : days === 1 ? "dün" : `${days} gün önce`;
};
const shortDate = (value: string) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));

const iconPaths: Record<string, ReactNode> = {
  scale: <><path d="M12 4v16" /><path d="M5 20h14" /><path d="M4 9h16" /><path d="m7 9-3 6h6Z" /><path d="m17 9-3 6h6Z" /></>,
  wallet: <><rect x="2.5" y="5.5" width="19" height="14" rx="2.5" /><path d="M16 12.5h2.5" /><path d="M2.5 9.5h19" /></>,
  alert: <><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6" /><path d="M9 12h6" /></>,
  percent: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M21 20a6 6 0 0 0-4-5.6" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
};
function FinOvIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}

export default async function FinanceOverviewPage() {
  const context = await getPanelContext();
  const { supabase, membership, modules, hiddenModuleKeys } = context;
  if (!modules.some((m) => m.code === "finance") || !modules.some((m) => m.code === "accounts"))
    throw new Error("Finans ve cari hesap modülü erişimi gerekli.");
  const organizationId = membership.organization_id;
  const access = { membership, modules, hiddenModuleKeys };
  const showCosts = canManageCosts(access);
  const today = todayInIstanbul();
  const monthKey = today.slice(0, 7);

  const [
    { data: partyData, error: partyError },
    { data: contractData, error: contractError },
    { data: installmentData, error: installmentError },
    { data: creditData, error: creditError },
    { data: costData },
  ] = await Promise.all([
    supabase.from("account_parties")
      .select("id,name,phone,email,account_entries(id,entry_type,amount,description,source_type,transaction_date)")
      .eq("organization_id", organizationId).eq("is_active", true).in("party_type", ["customer", "both"]),
    supabase.from("crm_contracts")
      .select("id,party_id,amount,contract_no,title,payment_plan_id,crm_opportunities(customer_name)")
      .eq("organization_id", organizationId).in("status", ["signed", "completed"]),
    supabase.from("payment_installments").select("id,payment_plan_id,installment_no,due_date,amount,status").eq("organization_id", organizationId).order("due_date"),
    supabase.from("account_entries")
      .select("id,amount,transaction_date,description,party_id,account_parties(name)")
      .eq("organization_id", organizationId).eq("entry_type", "credit")
      .order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(LIST_LIMIT),
    showCosts ? supabase.from("contract_cost_items").select("amount,status").eq("organization_id", organizationId) : Promise.resolve({ data: [] as { amount: number; status: string }[] }),
  ]);
  if (partyError) throw new Error("Cari hesaplar okunamadı: " + partyError.message);
  if (contractError) throw new Error("Sözleşme bakiyeleri okunamadı: " + contractError.message);
  if (installmentError) throw new Error("Ödeme taksitleri okunamadı: " + installmentError.message);
  if (creditError) throw new Error("Tahsilatlar okunamadı: " + creditError.message);

  const contracts = (contractData ?? []) as unknown as Contract[];
  const { accounts, totals } = buildAccountBalances((partyData ?? []) as Party[], contracts);
  const openAccounts = accounts.filter((account) => account.balance > 0).sort((a, b) => b.balance - a.balance);

  // Bu ay tahsilat: müşteri carilerine giren ödemeler
  const monthCredits = accounts.flatMap((account) => account.entries).filter((entry) => entry.entry_type === "credit" && entry.transaction_date.startsWith(monthKey));
  const monthCollections = monthCredits.reduce((sum, entry) => sum + Number(entry.amount), 0);

  // Taksitler: yalnızca imzalı sözleşmenin ödeme planındakiler (PAYTR sekmesiyle aynı)
  const contractByPlan = new Map(contracts.filter((row) => row.payment_plan_id).map((row) => [row.payment_plan_id as string, row]));
  const installments = ((installmentData ?? []) as Installment[])
    .filter((row) => row.status !== "paid" && contractByPlan.has(row.payment_plan_id))
    .map((row) => ({ ...row, contract: contractByPlan.get(row.payment_plan_id)! }));
  const overdue = installments.filter((row) => row.due_date && row.due_date < today).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const upcoming = installments.filter((row) => row.due_date && row.due_date >= today && dayDiff(today, row.due_date) <= UPCOMING_DAYS);
  const overdueSum = overdue.reduce((sum, row) => sum + Number(row.amount), 0);
  const upcomingSum = upcoming.reduce((sum, row) => sum + Number(row.amount), 0);

  const unpaidCost = ((costData ?? []) as { amount: number; status: string }[]).filter((row) => row.status !== "paid").reduce((sum, row) => sum + Number(row.amount), 0);
  const collectionRate = totals.debt ? Math.round((totals.collections / totals.debt) * 100) : null;
  const credits = (creditData ?? []) as unknown as CreditRow[];

  const widgets: { label: string; value: string; note: string; href: string; icon: string; tone: Tone }[] = [
    { label: "Açık bakiye", value: money(totals.balance), note: openAccounts.length ? `${openAccounts.length} caride tahsilat bekliyor` : "Tüm cariler kapalı", href: "/panel/finance?durum=acik", icon: "scale", tone: "gold" },
    { label: "Bu ay tahsilat", value: money(monthCollections), note: monthCredits.length ? `${monthCredits.length} ödeme alındı` : "Bu ay henüz tahsilat yok", href: "/panel/finance", icon: "wallet", tone: "success" },
    { label: "Gecikmiş ödeme", value: money(overdueSum), note: overdue.length ? `${overdue.length} taksitin vadesi geçti` : "Geciken ödeme yok", href: "/panel/finance?gorunum=paytr", icon: "alert", tone: overdue.length ? "danger" : "success" },
    { label: `${UPCOMING_DAYS} gün içinde vade`, value: money(upcomingSum), note: upcoming.length ? `${upcoming.length} taksit yaklaşıyor` : "Yaklaşan vade yok", href: "/panel/finance?gorunum=paytr", icon: "calendar", tone: "info" },
    showCosts
      ? { label: "Ödenmemiş maliyet", value: money(unpaidCost), note: unpaidCost ? "İşlere bağlı bekleyen giderler" : "Bekleyen maliyet yok", href: "/panel/finance?gorunum=maliyet", icon: "receipt", tone: unpaidCost ? "warning" : "brand" }
      : { label: "Tahsilat oranı", value: collectionRate === null ? "—" : `%${collectionRate}`, note: "Sözleşme toplamına göre", href: "/panel/finance", icon: "percent", tone: "brand" },
  ];

  const parts = [
    overdue.length ? `${overdue.length} gecikmiş taksit (${money(overdueSum)})` : null,
    upcoming.length ? `${UPCOMING_DAYS} gün içinde ${upcoming.length} vade` : null,
    openAccounts.length ? `${openAccounts.length} caride ${money(totals.balance)} açık bakiye` : null,
  ].filter(Boolean);
  const summary = parts.length ? `Şu an ${parts.join(", ")} var.` : "Bekleyen tahsilat ya da geciken ödeme yok.";

  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div><small className="panel-kicker">FİNANS / GENEL BAKIŞ</small><h1>Genel bakış</h1><p>{summary}</p></div>
        <div className="panel-page-actions">
          <Link className="panel-secondary" href="/panel/finance">Cari hesaplar</Link>
          <Link className="panel-primary" href="/panel/finance?gorunum=paytr">Tahsilatlar</Link>
        </div>
      </div>
      <FinanceTabs active="genel-bakis" context={access} />
      <div className="module-tab-panel opsov crmov">
        <section className="opsov-widgets" aria-label="Özet">
          {widgets.map((widget) => (
            <Link className="opsov-widget" data-tone={widget.tone} href={widget.href} key={widget.label}>
              <span className="opsov-widget-icon"><FinOvIcon name={widget.icon} /></span>
              <small>{widget.label}</small>
              <strong>{widget.value}</strong>
              <span className="opsov-widget-note">{widget.note}</span>
            </Link>
          ))}
        </section>

        <section className="opsov-grid">
          {/* Gecikmiş ödemeler */}
          <article className="opsov-card" data-tone={overdue.length ? "danger" : "success"}>
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><FinOvIcon name="alert" /></span>
              <div><h2>Gecikmiş ödemeler</h2><p>{overdue.length ? `${money(overdueSum)} vadesi geçmiş tahsilat` : "Vadesi geçmiş taksit yok"}</p></div>
              <b className="opsov-count">{overdue.length}</b>
            </header>
            {overdue.length ? (
              <ul className="opsov-list">
                {overdue.slice(0, LIST_LIMIT).map((row) => {
                  const late = dayDiff(row.due_date!, today);
                  return (
                    <li key={row.id} className="is-flagged" data-flag="danger">
                      <Link className="opsov-row" href={`/panel/crm/contracts/${row.contract.id}`}>
                        <span className="opsov-row-main"><b>{customerOf(row.contract.crm_opportunities)}</b><small>{row.contract.contract_no} · {row.installment_no}. taksit · vade {shortDate(row.due_date!)}</small></span>
                        <span className="opsov-row-side opsov-amount">
                          <strong>{money(row.amount)}</strong>
                          <span className="status-pill" data-tone="danger">{late} gün gecikti</span>
                        </span>
                        <FinOvIcon name="chevron" size={14} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="opsov-empty"><FinOvIcon name="check" size={20} />Vadesi geçmiş ödeme yok.</p>}
            <Link className="opsov-more" href="/panel/finance?gorunum=paytr">Tümünü gör<FinOvIcon name="chevron" size={14} /></Link>
          </article>

          {/* Yaklaşan vadeler */}
          <article className="opsov-card" data-tone="info">
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><FinOvIcon name="calendar" /></span>
              <div><h2>Yaklaşan vadeler</h2><p>{upcoming.length ? `${UPCOMING_DAYS} gün içinde ${money(upcomingSum)} tahsilat` : `Önümüzdeki ${UPCOMING_DAYS} gün`}</p></div>
              <b className="opsov-count">{upcoming.length}</b>
            </header>
            {upcoming.length ? (
              <ul className="opsov-list">
                {upcoming.slice(0, LIST_LIMIT).map((row) => {
                  const left = dayDiff(today, row.due_date!);
                  return (
                    <li key={row.id} className={left <= 2 ? "is-flagged" : undefined} data-flag="warning">
                      <Link className="opsov-row" href={`/panel/crm/contracts/${row.contract.id}`}>
                        <span className="opsov-row-main"><b>{customerOf(row.contract.crm_opportunities)}</b><small>{row.contract.contract_no} · {row.installment_no}. taksit · vade {shortDate(row.due_date!)}</small></span>
                        <span className="opsov-row-side opsov-amount">
                          <strong>{money(row.amount)}</strong>
                          <span className="status-pill" data-tone={left <= 2 ? "warning" : "info"}>{left === 0 ? "Bugün" : `${left} gün kaldı`}</span>
                        </span>
                        <FinOvIcon name="chevron" size={14} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="opsov-empty"><FinOvIcon name="check" size={20} />Önümüzdeki {UPCOMING_DAYS} günde vadesi gelen taksit yok.</p>}
            <Link className="opsov-more" href="/panel/finance?gorunum=paytr">Tümünü gör<FinOvIcon name="chevron" size={14} /></Link>
          </article>

          {/* Açık bakiyeli cariler */}
          <article className="opsov-card" data-tone="gold">
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><FinOvIcon name="users" /></span>
              <div><h2>Açık bakiyeli cariler</h2><p>{openAccounts.length ? "En yüksek açık bakiye üstte" : "Tahsilat bekleyen cari yok"}</p></div>
              <b className="opsov-count">{openAccounts.length}</b>
            </header>
            {openAccounts.length ? (
              <ul className="opsov-list">
                {openAccounts.slice(0, LIST_LIMIT).map((account) => (
                  <li key={account.id}>
                    <Link className="opsov-row" href={`/panel/accounts/${account.id}`}>
                      <span className="opsov-row-main"><b>{account.name}</b><small>Sözleşme {money(account.debt)} · tahsil edilen {money(account.collections)}</small></span>
                      <span className="opsov-row-side opsov-amount">
                        <strong>{money(account.balance)}</strong>
                        <span className="status-pill" data-tone="warning">Tahsilat bekliyor</span>
                      </span>
                      <FinOvIcon name="chevron" size={14} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="opsov-empty"><FinOvIcon name="check" size={20} />Tüm carilerin bakiyesi kapalı.</p>}
            <Link className="opsov-more" href="/panel/finance?durum=acik">Tümünü gör<FinOvIcon name="chevron" size={14} /></Link>
          </article>

          {/* Son tahsilatlar */}
          <article className="opsov-card" data-tone="success">
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><FinOvIcon name="wallet" /></span>
              <div><h2>Son tahsilatlar</h2><p>{monthCollections ? `Bu ay ${money(monthCollections)} tahsil edildi` : "Carilere işlenen son ödemeler"}</p></div>
              <b className="opsov-count">{monthCredits.length}</b>
            </header>
            {credits.length ? (
              <ul className="opsov-list">
                {credits.map((row) => (
                  <li key={row.id}>
                    <Link className="opsov-row" href={`/panel/accounts/${row.party_id}`}>
                      <span className="opsov-row-main"><b>{partyNameOf(row.account_parties)}</b><small title={row.description}>{row.description} · {daysAgoLabel(row.transaction_date, today)}</small></span>
                      <span className="opsov-row-side opsov-amount">
                        <strong className="opsov-amount-in">+{money(row.amount)}</strong>
                        <span className="status-pill" data-tone="success">{shortDate(row.transaction_date)}</span>
                      </span>
                      <FinOvIcon name="chevron" size={14} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="opsov-empty"><FinOvIcon name="wallet" size={20} />Henüz tahsilat kaydı yok. Cari hesaplardan “+ Tahsilat” ile eklenir.</p>}
            <Link className="opsov-more" href="/panel/finance">Cari hesaplara git<FinOvIcon name="chevron" size={14} /></Link>
          </article>
        </section>
      </div>
    </div>
  );
}
