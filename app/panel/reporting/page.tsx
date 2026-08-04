import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import "./reporting.css";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount / 100);
const stageNames: Record<string, string> = { lead: "Aday", qualified: "Nitelikli", proposal: "Teklif", contract: "Sözleşme", payment: "Ödeme", won: "Kazanıldı", lost: "Kaybedildi" };
const opsStatusNames: Record<string, string> = { planned: "Planlandı", in_progress: "Devam ediyor", blocked: "Beklemede", completed: "Tamamlandı", cancelled: "İptal" };
const priorityNames: Record<string, string> = { low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" };
const monthNamesShort = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}
function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function resolveRange(range: string | undefined, customStart: string | undefined, customEnd: string | undefined) {
  const now = new Date();
  if (range === "gecen_ay") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start, end, key: "gecen_ay" };
  }
  if (range === "bu_yil") {
    return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31), key: "bu_yil" };
  }
  if (range === "ozel" && customStart && customEnd) {
    const [sy, sm, sd] = customStart.split("-").map(Number);
    const [ey, em, ed] = customEnd.split("-").map(Number);
    return { start: new Date(sy, sm - 1, sd), end: new Date(ey, em - 1, ed), key: "ozel" };
  }
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0), key: "bu_ay" };
}

type Opportunity = { id: string; stage: string; estimated_value: number; assigned_employee_id: string | null; created_at: string; updated_at: string };
type Employee = { id: string; full_name: string };
type Transaction = { transaction_type: "income" | "expense"; status: string; amount: number; created_at: string; due_date: string | null };
type Invoice = { status: string; total: number; created_at: string; paid_at: string | null; due_at: string | null };
type Workflow = { status: string; priority: string; start_date: string | null; due_date: string | null; created_at: string; updated_at: string };

export default async function ReportingPage({ searchParams }: { searchParams: Promise<{ aralik?: string; baslangic?: string; bitis?: string }> }) {
  const params = await searchParams;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "reporting")) throw new Error("Raporlar modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;

  const { start: rangeStart, end: rangeEnd, key: rangeKey } = resolveRange(params.aralik, params.baslangic, params.bitis);
  const rangeStartKey = toDateKey(rangeStart);
  const rangeEndKey = toDateKey(rangeEnd);
  const inRange = (isoOrDate: string) => { const key = isoOrDate.slice(0, 10); return key >= rangeStartKey && key <= rangeEndKey; };

  const sixMonthsAgo = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() - 5, 1);

  const [{ data: oppData }, { data: employeeData }, { data: txData }, { data: invoiceData }, { data: workflowData }] = await Promise.all([
    supabase.from("crm_opportunities").select("id,stage,estimated_value,assigned_employee_id,created_at,updated_at").eq("organization_id", organizationId),
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", organizationId),
    supabase.from("finance_transactions").select("transaction_type,status,amount,created_at,due_date").eq("organization_id", organizationId).gte("created_at", sixMonthsAgo.toISOString()),
    supabase.from("billing_invoices").select("status,total,created_at,paid_at,due_at").eq("organization_id", organizationId).gte("created_at", sixMonthsAgo.toISOString()),
    supabase.from("operation_workflows").select("status,priority,start_date,due_date,created_at,updated_at").eq("organization_id", organizationId),
  ]);

  const opportunities = (oppData ?? []) as Opportunity[];
  const employees = (employeeData ?? []) as Employee[];
  const employeeNameMap = new Map(employees.map((e) => [e.id, e.full_name]));
  const transactions = (txData ?? []) as Transaction[];
  const invoices = (invoiceData ?? []) as Invoice[];
  const workflows = (workflowData ?? []) as Workflow[];

  // ---------- Satış / CRM ----------
  const wonInRange = opportunities.filter((o) => o.stage === "won" && inRange(o.updated_at));
  const lostInRange = opportunities.filter((o) => o.stage === "lost" && inRange(o.updated_at));
  const wonValue = wonInRange.reduce((sum, o) => sum + Number(o.estimated_value), 0);
  const winRate = wonInRange.length + lostInRange.length > 0 ? Math.round((wonInRange.length / (wonInRange.length + lostInRange.length)) * 100) : 0;
  const openPipeline = opportunities.filter((o) => !["won", "lost"].includes(o.stage));
  const pipelineValue = openPipeline.reduce((sum, o) => sum + Number(o.estimated_value), 0);
  const stageBuckets = ["lead", "qualified", "proposal", "contract", "payment"].map((stage) => ({
    stage, count: openPipeline.filter((o) => o.stage === stage).length, value: openPipeline.filter((o) => o.stage === stage).reduce((sum, o) => sum + Number(o.estimated_value), 0),
  }));
  const maxStageValue = Math.max(1, ...stageBuckets.map((b) => b.value));

  const repMap = new Map<string, { name: string; won: number; wonValue: number; lost: number }>();
  for (const o of [...wonInRange, ...lostInRange]) {
    const key = o.assigned_employee_id ?? "atanmadi";
    const name = o.assigned_employee_id ? (employeeNameMap.get(o.assigned_employee_id) ?? "Bilinmeyen") : "Atanmadı";
    const current = repMap.get(key) ?? { name, won: 0, wonValue: 0, lost: 0 };
    if (o.stage === "won") { current.won += 1; current.wonValue += Number(o.estimated_value); }
    else current.lost += 1;
    repMap.set(key, current);
  }
  const repRows = [...repMap.values()].sort((a, b) => b.wonValue - a.wonValue);

  // ---------- Finans ----------
  const paidIncomeInRange = transactions.filter((t) => t.transaction_type === "income" && t.status === "paid" && inRange(t.created_at)).reduce((sum, t) => sum + Number(t.amount), 0)
    + invoices.filter((i) => i.status === "paid" && i.paid_at && inRange(i.paid_at)).reduce((sum, i) => sum + Number(i.total), 0);
  const openReceivables = transactions.filter((t) => t.transaction_type === "income" && t.status === "planned").reduce((sum, t) => sum + Number(t.amount), 0)
    + invoices.filter((i) => ["draft", "open"].includes(i.status)).reduce((sum, i) => sum + Number(i.total), 0);
  const overdueReceivables = transactions.filter((t) => t.transaction_type === "income" && t.status === "planned" && t.due_date && t.due_date < toDateKey(new Date())).reduce((sum, t) => sum + Number(t.amount), 0)
    + invoices.filter((i) => ["draft", "open"].includes(i.status) && i.due_at && i.due_at.slice(0, 10) < toDateKey(new Date())).reduce((sum, i) => sum + Number(i.total), 0);

  const months: { key: string; label: string; income: number; expense: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: monthNamesShort[d.getMonth()], income: 0, expense: 0 });
  }
  for (const t of transactions) {
    if (t.status !== "paid") continue;
    const monthKey = t.created_at.slice(0, 7);
    const bucket = months.find((m) => m.key === monthKey);
    if (!bucket) continue;
    if (t.transaction_type === "income") bucket.income += Number(t.amount); else bucket.expense += Number(t.amount);
  }
  for (const i of invoices) {
    if (i.status !== "paid" || !i.paid_at) continue;
    const bucket = months.find((m) => m.key === i.paid_at!.slice(0, 7));
    if (bucket) bucket.income += Number(i.total);
  }
  const maxMonthAmount = Math.max(1, ...months.map((m) => Math.max(m.income, m.expense)));

  // ---------- Operasyon ----------
  const workflowsInRange = workflows.filter((w) => inRange(w.created_at));
  const completedInRange = workflows.filter((w) => w.status === "completed" && inRange(w.updated_at));
  const opsStatusBuckets = ["planned", "in_progress", "blocked", "completed"].map((status) => ({ status, count: workflows.filter((w) => w.status === status).length }));
  const maxOpsCount = Math.max(1, ...opsStatusBuckets.map((b) => b.count));
  const overdueOps = workflows.filter((w) => w.due_date && w.due_date < toDateKey(new Date()) && !["completed", "cancelled"].includes(w.status)).length;
  const completionDurations = completedInRange.filter((w) => w.start_date).map((w) => Math.max(0, Math.round((new Date(w.updated_at).getTime() - new Date(w.start_date! + "T00:00:00").getTime()) / 86400000)));
  const avgCompletionDays = completionDurations.length ? Math.round(completionDurations.reduce((sum, d) => sum + d, 0) / completionDurations.length) : null;
  const priorityBuckets = ["urgent", "high", "normal", "low"].map((priority) => ({ priority, count: workflows.filter((w) => w.priority === priority && !["completed", "cancelled"].includes(w.status)).length }));

  const rangeLabel = rangeKey === "bu_ay" ? "Bu ay" : rangeKey === "gecen_ay" ? "Geçen ay" : rangeKey === "bu_yil" ? "Bu yıl" : `${rangeStart.toLocaleDateString("tr-TR")} – ${rangeEnd.toLocaleDateString("tr-TR")}`;
  const rangeHref = (extra: Record<string, string>) => { const usp = new URLSearchParams({ aralik: rangeKey, ...(params.baslangic ? { baslangic: params.baslangic } : {}), ...(params.bitis ? { bitis: params.bitis } : {}), ...extra }); return `/panel/reporting?${usp.toString()}`; };

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">YÖNETİM</small><h1>Raporlar</h1><p>Satış, operasyon ve finans performansını tek bakışta inceleyin.</p></div>
      <div className="panel-page-actions"><span className="status-pill">{rangeLabel}</span></div>
    </div>

    <div className="report-range-bar">
      <div className="module-tabs">
        <Link className={rangeKey === "bu_ay" ? "active" : ""} href={rangeHref({ aralik: "bu_ay" })}>Bu Ay</Link>
        <Link className={rangeKey === "gecen_ay" ? "active" : ""} href={rangeHref({ aralik: "gecen_ay" })}>Geçen Ay</Link>
        <Link className={rangeKey === "bu_yil" ? "active" : ""} href={rangeHref({ aralik: "bu_yil" })}>Bu Yıl</Link>
      </div>
      <form className="report-custom-range" method="get">
        <input type="hidden" name="aralik" value="ozel" />
        <input name="baslangic" type="date" defaultValue={params.baslangic} required />
        <span>–</span>
        <input name="bitis" type="date" defaultValue={params.bitis} required />
        <button className="panel-secondary" type="submit">Özel aralık uygula</button>
      </form>
    </div>

    <section className="metric-strip">
      <article><div><small>KAZANILAN SATIŞ</small><strong>{money(wonValue)}</strong><p>{wonInRange.length} fırsat · {rangeLabel.toLowerCase()}</p></div></article>
      <article><div><small>KAZANMA ORANI</small><strong>%{winRate}</strong><p>{wonInRange.length} kazanıldı / {lostInRange.length} kaybedildi</p></div></article>
      <article><div><small>TAHSİL EDİLEN</small><strong>{money(paidIncomeInRange)}</strong><p>{money(openReceivables)} bekliyor</p></div></article>
      <article><div><small>TAMAMLANAN İŞ</small><strong>{completedInRange.length}</strong><p>{avgCompletionDays !== null ? `Ort. ${avgCompletionDays} gün` : "Süre verisi yok"}</p></div></article>
    </section>

    <div className="report-columns">
      <section className="panel-card report-card">
        <div className="section-heading compact"><div><small className="panel-kicker">SATIŞ</small><h2>Pipeline dağılımı</h2></div><Link className="panel-text-link" href="/panel/crm">CRM&apos;i aç →</Link></div>
        <div className="report-bars">
          {stageBuckets.map((bucket) => (
            <div className="report-bar-row" key={bucket.stage}>
              <span className="report-bar-label">{stageNames[bucket.stage]}</span>
              <div className="report-bar-track"><span style={{ width: `${(bucket.value / maxStageValue) * 100}%` }} /></div>
              <span className="report-bar-value">{money(bucket.value)}</span>
            </div>
          ))}
        </div>
        <p className="report-note">Açık pipeline toplamı: <b>{money(pipelineValue)}</b> · {openPipeline.length} fırsat</p>

        <div className="section-heading compact report-subheading"><div><small className="panel-kicker">TEMSİLCİ PERFORMANSI</small><h2>{rangeLabel}</h2></div></div>
        {repRows.length ? (
          <div className="report-rep-table">
            {repRows.map((rep) => (
              <div className="report-rep-row" key={rep.name}>
                <span className="report-rep-name">{rep.name}</span>
                <span className="report-rep-stat">{rep.won} kazanıldı</span>
                <span className="report-rep-stat">{rep.lost} kayıp</span>
                <strong>{money(rep.wonValue)}</strong>
              </div>
            ))}
          </div>
        ) : <p className="panel-empty">Bu aralıkta kazanılan/kaybedilen fırsat yok.</p>}
      </section>

      <section className="panel-card report-card">
        <div className="section-heading compact"><div><small className="panel-kicker">FİNANS</small><h2>Son 6 ay gelir / gider</h2></div><Link className="panel-text-link" href="/panel/finance">Finansı aç →</Link></div>
        <div className="report-month-chart">
          {months.map((m) => (
            <div className="report-month-col" key={m.key}>
              <div className="report-month-bars">
                <span className="income" style={{ height: `${(m.income / maxMonthAmount) * 100}%` }} title={money(m.income)} />
                <span className="expense" style={{ height: `${(m.expense / maxMonthAmount) * 100}%` }} title={money(m.expense)} />
              </div>
              <small>{m.label}</small>
            </div>
          ))}
        </div>
        <div className="report-legend"><span className="income">Gelir</span><span className="expense">Gider</span></div>

        <div className="section-heading compact report-subheading"><div><small className="panel-kicker">TAHSİLAT DURUMU</small><h2>Genel</h2></div></div>
        <div className="report-stat-list">
          <div><span>Bekleyen alacak</span><b>{money(openReceivables)}</b></div>
          <div><span className="danger">Vadesi geçmiş</span><b className="danger">{money(overdueReceivables)}</b></div>
        </div>
      </section>

      <section className="panel-card report-card">
        <div className="section-heading compact"><div><small className="panel-kicker">OPERASYON</small><h2>İş durumu dağılımı</h2></div><Link className="panel-text-link" href="/panel/operations">İşleri aç →</Link></div>
        <div className="report-bars">
          {opsStatusBuckets.map((bucket) => (
            <div className="report-bar-row" key={bucket.status}>
              <span className="report-bar-label">{opsStatusNames[bucket.status]}</span>
              <div className="report-bar-track"><span style={{ width: `${(bucket.count / maxOpsCount) * 100}%` }} /></div>
              <span className="report-bar-value">{bucket.count}</span>
            </div>
          ))}
        </div>
        <p className="report-note">{workflowsInRange.length} iş {rangeLabel.toLowerCase()} içinde oluşturuldu · <b className={overdueOps ? "danger" : ""}>{overdueOps} iş gecikmiş</b></p>

        <div className="section-heading compact report-subheading"><div><small className="panel-kicker">AKTİF ÖNCELİK DAĞILIMI</small><h2>Bekleyen işler</h2></div></div>
        <div className="report-stat-list">
          {priorityBuckets.map((bucket) => (
            <div key={bucket.priority}><span>{priorityNames[bucket.priority]}</span><b>{bucket.count}</b></div>
          ))}
        </div>
      </section>
    </div>
  </>;
}
