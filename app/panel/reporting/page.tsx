import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PrintReportButton } from "./print-report-button";
import "./reporting.css";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount / 100);
const percent = (value: number) => `%${Math.round(value)}`;
const monthNames = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
function pad(value: number) { return String(value).padStart(2, "0"); }
function dateKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function resolveRange(range?: string, customStart?: string, customEnd?: string) {
  const now = new Date();
  if (range === "gecen_ay") return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0), key: range };
  if (range === "bu_yil") return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31), key: range };
  if (range === "ozel" && customStart && customEnd) return { start: new Date(`${customStart}T00:00:00`), end: new Date(`${customEnd}T23:59:59`), key: range };
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0), key: "bu_ay" };
}

type Opportunity = { id: string; stage: string; estimated_value: number; source: string | null; lost_reason: string | null; created_at: string; updated_at: string };
type Proposal = { id: string; opportunity_id: string; amount: number; status: string; superseded_by: string | null; created_at: string };
type Contract = { id: string; opportunity_id: string | null; amount: number; status: string; signed_at: string | null; created_at: string };
type Transaction = { transaction_type: "income" | "expense"; status: string; amount: number; paid_at: string | null; created_at: string };

export default async function ReportingPage({ searchParams }: { searchParams: Promise<{ aralik?: string; baslangic?: string; bitis?: string }> }) {
  const params = await searchParams;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "reporting")) throw new Error("Raporlar modülüne erişiminiz yok.");
  const { start, end, key } = resolveRange(params.aralik, params.baslangic, params.bitis);
  const startKey = dateKey(start); const endKey = dateKey(end);
  const inRange = (value: string | null) => Boolean(value && value.slice(0, 10) >= startKey && value.slice(0, 10) <= endKey);
  const trendStart = new Date(end.getFullYear(), end.getMonth() - 5, 1);
  const queryStart = start < trendStart ? start : trendStart;
  const organizationId = membership.organization_id;

  const [opportunityResult, proposalResult, contractResult, transactionResult] = await Promise.all([
    supabase.from("crm_opportunities").select("id,stage,estimated_value,source,lost_reason,created_at,updated_at").eq("organization_id", organizationId),
    supabase.from("crm_proposals").select("id,opportunity_id,amount,status,superseded_by,created_at").eq("organization_id", organizationId).gte("created_at", queryStart.toISOString()),
    supabase.from("crm_contracts").select("id,opportunity_id,amount,status,signed_at,created_at").eq("organization_id", organizationId).gte("created_at", queryStart.toISOString()),
    supabase.from("finance_transactions").select("transaction_type,status,amount,paid_at,created_at").eq("organization_id", organizationId).gte("created_at", queryStart.toISOString()),
  ]);
  if (opportunityResult.error) throw new Error(`CRM raporu okunamadı: ${opportunityResult.error.message}`);
  const opportunities = (opportunityResult.data ?? []) as Opportunity[];
  const proposals = (proposalResult.data ?? []) as Proposal[];
  const contracts = (contractResult.data ?? []) as Contract[];
  const transactions = (transactionResult.data ?? []) as Transaction[];
  const incoming = opportunities.filter((row) => inRange(row.created_at));
  const reachedStages = new Set(["qualified", "proposal", "contract", "payment", "won", "lost"]);
  const qualifiedStages = new Set(["qualified", "proposal", "contract", "payment", "won"]);
  const reached = incoming.filter((row) => reachedStages.has(row.stage));
  const qualified = incoming.filter((row) => qualifiedStages.has(row.stage));
  const proposalOpportunityIds = new Set(proposals.filter((row) => inRange(row.created_at) && !row.superseded_by).map((row) => row.opportunity_id));
  const proposalCount = proposalOpportunityIds.size;
  const signedContracts = contracts.filter((row) => row.status === "signed" && inRange(row.signed_at ?? row.created_at));
  const signedOpportunityIds = new Set(signedContracts.map((row) => row.opportunity_id).filter((value): value is string => Boolean(value)));
  const wonOpportunities = opportunities.filter((row) => row.stage === "won" && inRange(row.updated_at));
  const saleOpportunityIds = new Set([...wonOpportunities.map((row) => row.id), ...signedOpportunityIds]);
  const sales = saleOpportunityIds.size;
  const salesValue = signedContracts.length ? signedContracts.reduce((sum, row) => sum + Number(row.amount), 0) : wonOpportunities.reduce((sum, row) => sum + Number(row.estimated_value), 0);
  const conversion = reached.length ? (sales / reached.length) * 100 : 0;
  const averageSale = sales ? salesValue / sales : 0;
  const paidTransactions = transactions.filter((row) => row.status === "paid" && inRange(row.paid_at ?? row.created_at));
  const revenue = paidTransactions.filter((row) => row.transaction_type === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const expense = paidTransactions.filter((row) => row.transaction_type === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const acquisitionCost = sales ? expense / sales : 0;
  const profit = revenue - expense;
  const profitMargin = revenue ? (profit / revenue) * 100 : 0;
  const lost = opportunities.filter((row) => row.stage === "lost" && inRange(row.updated_at));
  const referralLeads = incoming.filter((row) => (row.source ?? "").toLocaleLowerCase("tr-TR").includes("referans"));
  const referralSales = referralLeads.filter((row) => saleOpportunityIds.has(row.id)).length;

  const lostReasonMap = new Map<string, number>();
  for (const row of lost) { const reason = row.lost_reason?.trim() || "Neden belirtilmedi"; lostReasonMap.set(reason, (lostReasonMap.get(reason) ?? 0) + 1); }
  const lostReasons = [...lostReasonMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  const maxLostReason = Math.max(1, ...lostReasons.map((row) => row.count));
  const funnel = [
    { label: "Gelen lead", value: incoming.length, detail: "Yeni müşteri adayı" },
    { label: "Ulaşılan", value: reached.length, detail: incoming.length ? `${percent((reached.length / incoming.length) * 100)} erişim` : "—" },
    { label: "Nitelikli lead", value: qualified.length, detail: reached.length ? `${percent((qualified.length / reached.length) * 100)} nitelikli` : "—" },
    { label: "Teklif", value: proposalCount, detail: qualified.length ? `${percent((proposalCount / qualified.length) * 100)} teklif` : "—" },
    { label: "Satış", value: sales, detail: reached.length ? `${percent(conversion)} dönüşüm` : "—" },
  ];
  const maxFunnel = Math.max(1, ...funnel.map((row) => row.value));
  const transitionRates = funnel.slice(0, -1).map((row, index) => ({ from: row.label, to: funnel[index + 1].label, rate: row.value ? (funnel[index + 1].value / row.value) * 100 : 0 }));
  const weakestStep = [...transitionRates].sort((a, b) => a.rate - b.rate)[0];
  const months = Array.from({ length: 6 }, (_, index) => { const date = new Date(end.getFullYear(), end.getMonth() - (5 - index), 1); return { key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`, label: monthNames[date.getMonth()], leads: 0, sales: 0 }; });
  for (const row of opportunities) { const bucket = months.find((month) => month.key === row.created_at.slice(0, 7)); if (bucket) bucket.leads += 1; }
  for (const row of opportunities.filter((item) => item.stage === "won")) { const bucket = months.find((month) => month.key === row.updated_at.slice(0, 7)); if (bucket) bucket.sales += 1; }
  const maxTrend = Math.max(1, ...months.map((row) => row.leads));
  const rangeLabel = key === "bu_ay" ? "Bu ay" : key === "gecen_ay" ? "Geçen ay" : key === "bu_yil" ? "Bu yıl" : `${start.toLocaleDateString("tr-TR")} – ${end.toLocaleDateString("tr-TR")}`;

  return <>
    <div className="panel-pagehead report-pagehead"><div><small className="panel-kicker">YÖNETİCİ RAPORLARI</small><h1>Satış ve Kârlılık</h1><p>Meral’in günlük takip etmesi gereken satış hunisi, maliyet ve gerçek kâr göstergeleri.</p></div><div className="panel-page-actions"><span className="status-pill">{rangeLabel}</span><PrintReportButton /></div></div>
    <section className="report-range-bar panel-card"><nav className="report-range-tabs" aria-label="Rapor dönemi"><Link className={key === "bu_ay" ? "active" : ""} href="/panel/reporting?aralik=bu_ay">Bu Ay</Link><Link className={key === "gecen_ay" ? "active" : ""} href="/panel/reporting?aralik=gecen_ay">Geçen Ay</Link><Link className={key === "bu_yil" ? "active" : ""} href="/panel/reporting?aralik=bu_yil">Bu Yıl</Link></nav><form className="report-custom-range" method="get"><input type="hidden" name="aralik" value="ozel"/><input name="baslangic" type="date" defaultValue={params.baslangic} required/><span>–</span><input name="bitis" type="date" defaultValue={params.bitis} required/><button className="panel-secondary" type="submit">Uygula</button></form></section>
    <section className="report-kpi-grid">
      <article className="report-kpi"><small>GELEN LEAD</small><strong>{incoming.length}</strong><p>Kaç kişi geldi?</p></article><article className="report-kpi"><small>ULAŞILAN</small><strong>{reached.length}</strong><p>{incoming.length ? `${percent((reached.length / incoming.length) * 100)} erişim oranı` : "Görüşme yok"}</p></article><article className="report-kpi"><small>NİTELİKLİ LEAD</small><strong>{qualified.length}</strong><p>Gerçek müşteri adayı</p></article><article className="report-kpi"><small>TEKLİF</small><strong>{proposalCount}</strong><p>Tekil müşteriye teklif</p></article><article className="report-kpi accent"><small>SATIŞ</small><strong>{sales}</strong><p>{money(salesValue)} satış değeri</p></article>
      <article className="report-kpi accent"><small>DÖNÜŞÜM</small><strong>{percent(conversion)}</strong><p>Görüşmeden satışa</p></article><article className="report-kpi"><small>ORTALAMA SATIŞ</small><strong>{money(averageSale)}</strong><p>Müşteri başına</p></article><article className="report-kpi warning"><small>MÜŞTERİ EDİNME MALİYETİ</small><strong>{money(acquisitionCost)}</strong><p>Satış başına gider</p></article><article className={`report-kpi ${profit >= 0 ? "success" : "danger"}`}><small>GERÇEK KÂR</small><strong>{money(profit)}</strong><p>{percent(profitMargin)} kâr marjı</p></article><article className="report-kpi"><small>REFERANS</small><strong>{referralLeads.length}</strong><p>{referralSales} referans satışı</p></article>
    </section>
    <div className="report-main-grid">
      <section className="panel-card report-card report-funnel-card"><header><div><small className="panel-kicker">SATIŞ HUNİSİ</small><h2>Lead’den satışa dönüşüm</h2></div><Link href="/panel/crm" className="panel-text-link">CRM’i aç →</Link></header><div className="report-funnel">{funnel.map((row, index) => <article key={row.label}><div><b>{row.label}</b><span>{row.detail}</span></div><div className="report-funnel-track"><i style={{ width: `${Math.max(4, (row.value / maxFunnel) * 100)}%` }}/></div><strong>{row.value}</strong>{index < funnel.length - 1 ? <em>{row.value ? percent((funnel[index + 1].value / row.value) * 100) : "%0"}</em> : null}</article>)}</div></section>
      <section className="panel-card report-card report-analysis"><header><div><small className="panel-kicker">YÖNETİCİ ANALİZİ</small><h2>Bu dönem ne söylüyor?</h2></div></header><div className="report-insights"><article><i>1</i><div><b>En zayıf geçiş</b><p>{weakestStep ? `${weakestStep.from} → ${weakestStep.to} dönüşümü ${percent(weakestStep.rate)}.` : "Yeterli veri yok."}</p></div></article><article><i>2</i><div><b>Satış ekonomisi</b><p>{sales ? `Bir satış ortalama ${money(averageSale)}, edinme maliyeti ${money(acquisitionCost)}.` : "Satış oluştuğunda ekonomi analizi başlayacak."}</p></div></article><article><i>3</i><div><b>Kârlılık</b><p>{profit >= 0 ? `${money(revenue)} tahsilata karşılık ${money(expense)} gider; ${money(profit)} kaldı.` : `Giderler tahsilatı ${money(Math.abs(profit))} aşıyor.`}</p></div></article><article><i>4</i><div><b>Referans gücü</b><p>{referralLeads.length ? `${referralLeads.length} referans lead’in ${referralSales} tanesi satışa döndü.` : "Bu dönemde referans kaynaklı lead kaydı yok."}</p></div></article></div></section>
    </div>
    <div className="report-bottom-grid">
      <section className="panel-card report-card"><header><div><small className="panel-kicker">6 AYLIK EĞİLİM</small><h2>Lead ve satış</h2></div></header><div className="report-trend" aria-label="Altı aylık lead ve satış grafiği">{months.map((month) => <article key={month.key}><div className="report-trend-bars"><i className="lead" style={{ height: `${Math.max(3, (month.leads / maxTrend) * 100)}%` }} title={`${month.leads} lead`}/><i className="sale" style={{ height: `${Math.max(3, (month.sales / maxTrend) * 100)}%` }} title={`${month.sales} satış`}/></div><b>{month.label}</b><span>{month.leads}/{month.sales}</span></article>)}</div><div className="report-legend"><span><i className="lead"/>Lead</span><span><i className="sale"/>Satış</span></div></section>
      <section className="panel-card report-card"><header><div><small className="panel-kicker">KAYBEDİLEN MÜŞTERİ</small><h2>Neden kaybedildi?</h2></div><strong className="report-lost-total">{lost.length}</strong></header><div className="report-lost-list">{lostReasons.map((row) => <article key={row.reason}><div><b>{row.reason}</b><span>{row.count} müşteri</span></div><div><i style={{ width: `${(row.count / maxLostReason) * 100}%` }}/></div></article>)}{!lostReasons.length ? <p className="report-empty">Bu dönemde kaybedilen müşteri yok.</p> : null}</div></section>
    </div>
  </>;
}
