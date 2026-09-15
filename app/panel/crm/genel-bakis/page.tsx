import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { formatSubject, initials } from "@/lib/table-format";
import { PanelDrawer } from "../../components/panel-drawer";
import { RequestEntryForm } from "../request-entry-form";
import { CrmTabs } from "../crm-tabs";
import { daysSince, relativeTime, waitingLabel } from "../last-contact";
import { canSeeFinanceReports } from "../../finance/finance-navigation";
import "../crm.css";
import "../../operations/overview.css";
import "./overview.css";

// CRM genel bakış: satışçının günlük ekranı. Yeni talepler, müşteri yanıtı
// bekleyen teklifler, imza bekleyen sözleşmeler ve son 30 günün satış hunisi.
// Kart dili operasyon genel bakışıyla aynı (operations/overview.css).
// Veri, CRM listeleriyle aynı kapsamda: kurum filtresi + RLS.

type Opportunity = { id: string; title: string; customer_name: string; stage: string; assigned_employee_id: string | null; created_at: string };
type Customer = { customer_name: string } | { customer_name: string }[] | null;
type Proposal = {
  id: string; proposal_no: string; amount: number; currency: string; status: string; archive_reason: string | null;
  valid_until: string | null; sent_at: string | null; view_count: number; responded_at: string | null; created_at: string;
  superseded_by: string | null; opportunity_id: string; crm_opportunities: Customer;
};
type Contract = {
  id: string; contract_no: string; amount: number; currency: string; status: string; proposal_id: string | null;
  sent_at: string | null; view_count: number; signed_at: string | null; created_at: string; crm_opportunities: Customer;
};
type Representative = { id: string; full_name: string; job_title: string | null; can_receive_sales_requests: boolean };
type Tone = "info" | "gold" | "success" | "danger" | "warning" | "brand" | "neutral";

const TZ = "Europe/Istanbul";
const LIST_LIMIT = 5;
// Teklif öncesi aşamalar (genel ve akademik kurumlar)
const NEW_STAGES = new Set(["lead", "qualified", "pre_review", "academic_review"]);

const money = (amount: number, currency = "TRY") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount || 0) / 100);
const dayKey = (value: string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(value));
const customerOf = (value: Customer) => formatPersonName(Array.isArray(value) ? value[0]?.customer_name : value?.customer_name) || "Müşteri";

// Zamana bağlı değerler (saat bileşen gövdesinde okunmaz)
function timeWindow() {
  const now = Date.now();
  const today = dayKey(now);
  return { today, monthKey: today.slice(0, 7), since30: now - 30 * 86400000, since90: now - 90 * 86400000 };
}
/** Geçerlilik tarihine kalan gün (bugün = 0, geçmişse negatif). */
const daysUntil = (dateKey: string, today: string) => Math.round((Date.parse(dateKey) - Date.parse(today)) / 86400000);

const iconPaths: Record<string, ReactNode> = {
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></>,
  sign: <><path d="M4 20h16" /><path d="m14.5 4.5 3 3L9 16l-4 1 1-4Z" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
  trend: <><path d="M4 16.5 9 11l3.5 3.5L20 7" /><path d="M15 7h5v5" /></>,
  funnel: <path d="M4 5h16l-6 7.5V19l-4 1.5v-8Z" />,
  chevron: <path d="m9 18 6-6-6-6" />,
};
function CrmIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}

export default async function CrmOverviewPage() {
  const { supabase, membership, modules, hiddenModuleKeys, isPlatformOwner } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;
  const canAssign = ["owner", "admin", "manager"].includes(membership.role);
  // Raporlar Finans sekmesi: Finans kapısından (sahip/yönetici) geçemeyene bağlantı gösterilmez
  const canSeeReports = (isPlatformOwner || ["owner", "admin"].includes(membership.role)) && canSeeFinanceReports({ membership, modules, hiddenModuleKeys });
  const time = timeWindow();

  const [
    { data: opportunityData, error: opportunityError },
    { data: proposalData, error: proposalError },
    { data: contractData, error: contractError },
    { data: employeeData, error: employeeError },
    { data: stageData },
  ] = await Promise.all([
    supabase.from("crm_opportunities").select("id,title,customer_name,stage,assigned_employee_id,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("crm_proposals").select("id,proposal_no,amount,currency,status,archive_reason,valid_until,sent_at,view_count,responded_at,created_at,superseded_by,opportunity_id,crm_opportunities(customer_name)").eq("organization_id", organizationId),
    supabase.from("crm_contracts").select("id,contract_no,amount,currency,status,proposal_id,sent_at,view_count,signed_at,created_at,crm_opportunities(customer_name)").eq("organization_id", organizationId),
    supabase.from("hr_employees").select("id,full_name,job_title,can_receive_sales_requests").eq("organization_id", organizationId).eq("employment_status", "active").order("full_name"),
    supabase.from("organization_crm_stages").select("code").eq("organization_id", organizationId).eq("is_active", true),
  ]);
  if (opportunityError) throw new Error("Talepler okunamadı: " + opportunityError.message);
  if (proposalError) throw new Error("Teklifler okunamadı: " + proposalError.message);
  if (contractError) throw new Error("Sözleşmeler okunamadı: " + contractError.message);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);

  const opportunities = (opportunityData ?? []) as Opportunity[];
  const proposals = (proposalData ?? []) as unknown as Proposal[];
  const contracts = (contractData ?? []) as unknown as Contract[];
  const employees = (employeeData ?? []) as Representative[];
  const employeeName = new Map(employees.map((row) => [row.id, formatPersonName(row.full_name)]));
  const salesRepresentatives = employees.filter((row) => row.can_receive_sales_requests).map(({ id, full_name, job_title }) => ({ id, full_name, job_title }));
  const academicMode = (stageData ?? []).some((row: { code: string }) => row.code === "academic_review");

  // ---- Yeni talepler: atanmamışlar üstte, sonra en yeni
  const newRequests = opportunities
    .filter((row) => NEW_STAGES.has(row.stage))
    .sort((a, b) => Number(Boolean(a.assigned_employee_id)) - Number(Boolean(b.assigned_employee_id)) || b.created_at.localeCompare(a.created_at));
  const unassignedCount = newRequests.filter((row) => !row.assigned_employee_id).length;

  // ---- Müşteri yanıtı bekleyen teklifler: süresi en yakın olan üstte
  const pendingProposals = proposals
    .filter((row) => row.status === "sent" && !row.superseded_by)
    .sort((a, b) => (a.valid_until ?? "9999").localeCompare(b.valid_until ?? "9999") || (a.sent_at ?? "").localeCompare(b.sent_at ?? ""));
  const pendingProposalValue = pendingProposals.filter((row) => row.currency === "TRY").reduce((sum, row) => sum + Number(row.amount), 0);
  const expiringCount = pendingProposals.filter((row) => row.valid_until && daysUntil(row.valid_until, time.today) <= 3).length;

  // ---- İmza bekleyen sözleşmeler: en uzun bekleyen üstte
  const pendingContracts = contracts
    .filter((row) => row.status === "sent")
    .sort((a, b) => (a.sent_at ?? "").localeCompare(b.sent_at ?? ""));
  const lateContracts = pendingContracts.filter((row) => (daysSince(row.sent_at) ?? 0) >= 7).length;

  // ---- Bu ay imzalanan
  const signed = contracts.filter((row) => ["signed", "completed"].includes(row.status) && row.signed_at);
  const signedThisMonth = signed.filter((row) => dayKey(row.signed_at!).startsWith(time.monthKey));
  const signedThisMonthValue = signedThisMonth.filter((row) => row.currency === "TRY").reduce((sum, row) => sum + Number(row.amount), 0);

  // ---- Teklif kabul oranı (son 90 gün, müşteri kararına göre). Arşiv
  // tetikleyicisi kabul/reddi archive_reason'a yazar; canlı sözleşmesi
  // olan teklif de kabul edilmiş sayılır.
  const liveContractProposals = new Set(contracts.filter((row) => row.proposal_id && !["rejected", "cancelled"].includes(row.status)).map((row) => row.proposal_id as string));
  const outcomeOf = (row: Proposal) => {
    if (liveContractProposals.has(row.id) || row.status === "accepted" || row.archive_reason === "accepted") return "accepted";
    if (row.status === "rejected" || row.archive_reason === "rejected") return "rejected";
    return null;
  };
  const decided = proposals.filter((row) => !row.superseded_by && outcomeOf(row) && Date.parse(row.responded_at ?? row.sent_at ?? row.created_at) >= time.since90);
  const acceptedCount = decided.filter((row) => outcomeOf(row) === "accepted").length;
  const acceptanceRate = decided.length ? Math.round((acceptedCount / decided.length) * 100) : null;

  // ---- Satış hunisi (son 30 gün)
  const inLast30 = (value: string | null) => Boolean(value) && Date.parse(value!) >= time.since30;
  const funnel = [
    { key: "talep", label: "Yeni talep", count: opportunities.filter((row) => inLast30(row.created_at)).length },
    { key: "teklif", label: "Teklif gönderildi", count: new Set(proposals.filter((row) => inLast30(row.sent_at)).map((row) => row.opportunity_id)).size },
    { key: "sozlesme", label: "Sözleşme gönderildi", count: contracts.filter((row) => inLast30(row.sent_at)).length },
    { key: "imza", label: "İmzalandı", count: signed.filter((row) => inLast30(row.signed_at)).length },
  ];
  const funnelMax = Math.max(1, ...funnel.map((step) => step.count));

  const widgets: { label: string; value: string | number; note: string; href: string; icon: string; tone: Tone }[] = [
    { label: "Yeni talep", value: newRequests.length, note: unassignedCount ? `${unassignedCount} talep atanmamış` : "Hepsinin temsilcisi var", href: "/panel/crm", icon: "inbox", tone: "info" },
    { label: "Yanıt bekleyen teklif", value: pendingProposals.length, note: pendingProposals.length ? `${money(pendingProposalValue)} teklif değeri` : "Bekleyen teklif yok", href: "/panel/crm/proposals?status=sent", icon: "doc", tone: "gold" },
    { label: "İmza bekleyen", value: pendingContracts.length, note: lateContracts ? `${lateContracts} tanesi 7+ gündür bekliyor` : "Geciken imza yok", href: "/panel/crm/contracts?status=sent", icon: "sign", tone: lateContracts ? "danger" : "brand" },
    { label: "Bu ay imzalanan", value: signedThisMonth.length, note: signedThisMonth.length ? money(signedThisMonthValue) : "Henüz imza yok", href: "/panel/crm/contracts", icon: "check", tone: "success" },
    { label: "Teklif kabul oranı", value: acceptanceRate === null ? "—" : `%${acceptanceRate}`, note: decided.length ? `Son 90 gün · ${acceptedCount}/${decided.length} teklif` : "Son 90 günde karar yok", href: "/panel/crm/proposals", icon: "trend", tone: "brand" },
  ];

  const parts = [
    newRequests.length ? `${newRequests.length} yeni talep` : null,
    unassignedCount ? `${unassignedCount} atanmamış talep` : null,
    expiringCount ? `${expiringCount} teklifin süresi doluyor` : null,
    lateContracts ? `${lateContracts} sözleşme 7+ gündür imza bekliyor` : null,
  ].filter(Boolean);
  const summary = parts.length ? `Şu an ${parts.join(", ")}.` : "Bekleyen acil bir satış işi yok, her şey yolunda.";

  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div><small className="panel-kicker">CRM / GENEL BAKIŞ</small><h1>Genel bakış</h1><p>{summary}</p></div>
        <div className="panel-page-actions">
          <Link className="panel-secondary" href="/panel/crm">Tüm talepler</Link>
          <PanelDrawer triggerLabel="+ Yeni talep" kicker="YENİ KAYIT" triggerClassName="panel-primary" title={academicMode ? "Talep Girişi" : "Yeni talep"} description="Müşteri ve talep bilgilerini kaydedin.">
            <RequestEntryForm academicMode={academicMode} salesRepresentatives={salesRepresentatives} canAssign={canAssign} />
          </PanelDrawer>
        </div>
      </div>
      <CrmTabs active="genel-bakis" />
      <div className="module-tab-panel opsov crmov">
        <section className="opsov-widgets" aria-label="Özet">
          {widgets.map((widget) => (
            <Link className="opsov-widget" data-tone={widget.tone} href={widget.href} key={widget.label}>
              <span className="opsov-widget-icon"><CrmIcon name={widget.icon} /></span>
              <small>{widget.label}</small>
              <strong>{widget.value}</strong>
              <span className="opsov-widget-note">{widget.note}</span>
            </Link>
          ))}
        </section>

        <section className="opsov-grid">
          {/* Yeni talepler */}
          <article className="opsov-card" data-tone="info">
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><CrmIcon name="inbox" /></span>
              <div><h2>Yeni talepler</h2><p>{unassignedCount ? `${unassignedCount} talep temsilci bekliyor` : "Teklif öncesi aşamadaki talepler"}</p></div>
              <b className="opsov-count">{newRequests.length}</b>
            </header>
            {newRequests.length ? (
              <ul className="opsov-list">
                {newRequests.slice(0, LIST_LIMIT).map((row) => {
                  const assignee = row.assigned_employee_id ? employeeName.get(row.assigned_employee_id) ?? "Pasif personel" : null;
                  return (
                    <li key={row.id} className={assignee ? undefined : "is-flagged"} data-flag="gold">
                      <Link className="opsov-row" href={`/panel/crm/requests/${row.id}`}>
                        <span className="opsov-row-main"><b>{formatPersonName(row.customer_name) || "Müşteri"}</b><small title={row.title}>{formatSubject(row.title)} · {relativeTime(row.created_at)}</small></span>
                        <span className="opsov-row-side">
                          {assignee ? <span className="opsov-person" title={assignee}><i aria-hidden="true">{initials(assignee)}</i><span>{assignee}</span></span> : <span className="status-pill" data-tone="gold">Atanmamış</span>}
                        </span>
                        <CrmIcon name="chevron" size={14} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="opsov-empty"><CrmIcon name="check" size={20} />Yeni talep yok. Girilen talepler burada belirir.</p>}
            <Link className="opsov-more" href="/panel/crm">Tümünü gör<CrmIcon name="chevron" size={14} /></Link>
          </article>

          {/* Müşteri yanıtı bekleyen teklifler */}
          <article className="opsov-card" data-tone={expiringCount ? "warning" : "gold"}>
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><CrmIcon name="doc" /></span>
              <div><h2>Yanıt bekleyen teklifler</h2><p>{expiringCount ? `${expiringCount} teklifin süresi 3 gün içinde doluyor` : "Müşteriye gönderilmiş, karar bekleyen"}</p></div>
              <b className="opsov-count">{pendingProposals.length}</b>
            </header>
            {pendingProposals.length ? (
              <ul className="opsov-list">
                {pendingProposals.slice(0, LIST_LIMIT).map((row) => {
                  const left = row.valid_until ? daysUntil(row.valid_until, time.today) : null;
                  const badge = left !== null && left < 0 ? { tone: "danger", label: "Süresi doldu" }
                    : left !== null && left <= 3 ? { tone: "warning", label: left === 0 ? "Son gün" : `Son ${left} gün` }
                    : !row.view_count ? { tone: "info", label: "Açılmadı" }
                    : { tone: "success", label: "Görüldü" };
                  return (
                    <li key={row.id} className={left !== null && left <= 3 ? "is-flagged" : undefined} data-flag={left !== null && left < 0 ? "danger" : "warning"}>
                      <Link className="opsov-row" href={`/panel/crm/proposals/${row.id}`}>
                        <span className="opsov-row-main"><b>{customerOf(row.crm_opportunities)}</b><small>{row.proposal_no} · {waitingLabel(row.sent_at) ?? "gönderildi"}</small></span>
                        <span className="opsov-row-side opsov-amount">
                          <strong>{money(row.amount, row.currency)}</strong>
                          <span className="status-pill" data-tone={badge.tone}>{badge.label}</span>
                        </span>
                        <CrmIcon name="chevron" size={14} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="opsov-empty"><CrmIcon name="check" size={20} />Yanıt bekleyen teklif yok.</p>}
            <Link className="opsov-more" href="/panel/crm/proposals?status=sent">Tümünü gör<CrmIcon name="chevron" size={14} /></Link>
          </article>

          {/* İmza bekleyen sözleşmeler */}
          <article className="opsov-card" data-tone={lateContracts ? "danger" : "brand"}>
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><CrmIcon name="sign" /></span>
              <div><h2>İmza bekleyen sözleşmeler</h2><p>{lateContracts ? `${lateContracts} sözleşme 7 günden uzun süredir bekliyor` : "Müşteriye gönderilmiş, imzalanmamış"}</p></div>
              <b className="opsov-count">{pendingContracts.length}</b>
            </header>
            {pendingContracts.length ? (
              <ul className="opsov-list">
                {pendingContracts.slice(0, LIST_LIMIT).map((row) => {
                  const late = (daysSince(row.sent_at) ?? 0) >= 7;
                  const badge = late ? { tone: "danger", label: "Gecikti" } : !row.view_count ? { tone: "info", label: "Açılmadı" } : { tone: "success", label: "Görüldü" };
                  return (
                    <li key={row.id} className={late ? "is-flagged" : undefined} data-flag="danger">
                      <Link className="opsov-row" href={`/panel/crm/contracts/${row.id}`}>
                        <span className="opsov-row-main"><b>{customerOf(row.crm_opportunities)}</b><small>{row.contract_no} · {waitingLabel(row.sent_at) ?? "gönderildi"}</small></span>
                        <span className="opsov-row-side opsov-amount">
                          <strong>{money(row.amount, row.currency)}</strong>
                          <span className="status-pill" data-tone={badge.tone}>{badge.label}</span>
                        </span>
                        <CrmIcon name="chevron" size={14} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="opsov-empty"><CrmIcon name="check" size={20} />İmza bekleyen sözleşme yok.</p>}
            <Link className="opsov-more" href="/panel/crm/contracts?status=sent">Tümünü gör<CrmIcon name="chevron" size={14} /></Link>
          </article>

          {/* Satış hunisi */}
          <article className="opsov-card" data-tone="success">
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><CrmIcon name="funnel" /></span>
              <div><h2>Satış hunisi</h2><p>Son 30 gün · talepten imzaya</p></div>
              <b className="opsov-count">{funnel[3].count}</b>
            </header>
            <ol className="crmov-funnel">
              {funnel.map((step, index) => {
                const previous = index ? funnel[index - 1].count : 0;
                const note = index === 0
                  ? "Son 30 günde girilen talepler"
                  : previous ? `Önceki adımın %${Math.round((step.count / previous) * 100)}’i` : "Önceki adımda kayıt yok";
                return (
                  <li key={step.key}>
                    <div className="crmov-funnel-top"><span>{step.label}</span><b>{step.count}</b></div>
                    <div className="crmov-funnel-track"><i style={{ "--w": `${step.count ? Math.max(4, (step.count / funnelMax) * 100) : 0}%` } as CSSProperties} /></div>
                    <small>{note}</small>
                  </li>
                );
              })}
            </ol>
            {canSeeReports ? <Link className="opsov-more" href="/panel/finance/raporlar">Raporlara git<CrmIcon name="chevron" size={14} /></Link> : null}
          </article>
        </section>
      </div>
    </div>
  );
}
