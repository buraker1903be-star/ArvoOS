import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { OperationsTabs } from "../operations-tabs";
import "../../crm/takvim.css";

const statusNames: Record<string, string> = { planned: "Planlandı", in_progress: "Devam ediyor", blocked: "Beklemede", completed: "Tamamlandı", cancelled: "İptal" };
const weekdayNames = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

type Workflow = { id: string; title: string; customer_name: string | null; status: string; priority: string; start_date: string | null; due_date: string | null };

function pad(value: number) {
  return String(value).padStart(2, "0");
}
function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function parseMonthParam(value: string | undefined) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
function parseDateParam(value: string | undefined) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
function monthLabel(date: Date) {
  return date.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}
function buildMonthGrid(monthStart: Date) {
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), i - firstWeekday + 1), inMonth: false });
  for (let day = 1; day <= daysInMonth; day++) cells.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), day), inMonth: true });
  while (cells.length % 7 !== 0) { const last = cells[cells.length - 1].date; cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false }); }
  return cells;
}

export default async function OperationsCalendarPage({ searchParams }: { searchParams: Promise<{ ay?: string; tarih?: string }> }) {
  const params = await searchParams;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");

  const monthStart = parseMonthParam(params.ay);
  const selectedDate = parseDateParam(params.tarih);
  const monthQuery = `${monthStart.getFullYear()}-${pad(monthStart.getMonth() + 1)}`;
  const prevMonth = `${new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1).getFullYear()}-${pad(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1).getMonth() + 1)}`;
  const nextMonth = `${new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1).getFullYear()}-${pad(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1).getMonth() + 1)}`;
  const selectedKey = toDateKey(selectedDate);
  const todayKey = toDateKey(new Date());

  const rangeStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 25);
  const rangeEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 2, 5);

  const { data, error } = await supabase.from("operation_workflows")
    .select("id,title,customer_name,status,priority,start_date,due_date")
    .eq("organization_id", membership.organization_id)
    .neq("status", "cancelled")
    .not("due_date", "is", null)
    .gte("due_date", toDateKey(rangeStart)).lte("due_date", toDateKey(rangeEnd))
    .order("due_date", { ascending: true });
  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  const workflows = (data ?? []) as Workflow[];

  const byDate = new Map<string, Workflow[]>();
  for (const wf of workflows) {
    const key = wf.due_date!;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(wf);
  }

  const withParams = (extra: Record<string, string>) => {
    const usp = new URLSearchParams({ ay: monthQuery, tarih: selectedKey, ...extra });
    return `/panel/operations/takvim?${usp.toString()}`;
  };

  return <div className="crm-page-stack">
    <OperationsTabs active="takvim" />
    <div className="panel-pagehead">
      <div><small className="panel-kicker">OPERASYON / TAKVİM</small><h1>İş Takvimi</h1><p>İşlerin termin tarihlerini takvim üzerinde görün. (CRM randevu takviminden ayrıdır.)</p></div>
      <div className="panel-page-actions"><span className="status-pill">{workflows.length} iş</span></div>
    </div>

    <section className="panel-card calendar-card">
      <div className="calendar-month-nav">
        <Link className="panel-icon-button" href={withParams({ ay: prevMonth })} aria-label="Önceki ay">‹</Link>
        <b>{monthLabel(monthStart)}</b>
        <Link className="panel-icon-button" href={withParams({ ay: nextMonth })} aria-label="Sonraki ay">›</Link>
      </div>
      <div className="calendar-grid calendar-weekdays">{weekdayNames.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">
        {buildMonthGrid(monthStart).map(({ date, inMonth }) => {
          const key = toDateKey(date);
          const dayItems = byDate.get(key) ?? [];
          return (
            <Link key={key} href={withParams({ tarih: key })} className={["calendar-day", inMonth ? "" : "outside", key === todayKey ? "today" : "", key === selectedKey ? "selected" : ""].filter(Boolean).join(" ")}>
              <span className="calendar-day-number">{date.getDate()}</span>
              {dayItems.slice(0, 2).map((wf) => <em key={wf.id}>{wf.title}</em>)}
              {dayItems.length > 2 ? <small>+{dayItems.length - 2} daha</small> : null}
            </Link>
          );
        })}
      </div>
    </section>

    <section className="panel-card">
      <div className="section-heading compact"><div><small className="panel-kicker">SEÇİLİ GÜN</small><h2>{selectedDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" })}</h2></div></div>
      <div className="appointment-list">
        {(byDate.get(selectedKey) ?? []).length ? (byDate.get(selectedKey) ?? []).map((wf) => (
          <article key={wf.id} className={`appointment-row status-${wf.status === "completed" ? "done" : wf.status === "cancelled" ? "cancelled" : "planned"}`}>
            <div className="appointment-time"><b>Termin</b></div>
            <div className="appointment-body">
              <div className="appointment-heading"><h4>{wf.title}</h4><span className="status-pill">{statusNames[wf.status] ?? wf.status}</span></div>
              <p>{wf.customer_name || "Kurum içi iş"}{wf.start_date ? ` · Başlangıç: ${new Date(wf.start_date + "T00:00:00").toLocaleDateString("tr-TR")}` : ""}</p>
            </div>
            <div className="appointment-actions"><Link className="panel-secondary" href={`/panel/operations/${wf.id}`}>İşi aç</Link></div>
          </article>
        )) : <p className="panel-empty">Bu gün için terminli iş yok.</p>}
      </div>
    </section>
  </div>;
}
