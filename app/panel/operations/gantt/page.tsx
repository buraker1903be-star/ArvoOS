import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import "../../gantt.css";

const statusNames: Record<string, string> = { planned: "Planlandı", in_progress: "Devam ediyor", blocked: "Beklemede", completed: "Tamamlandı", cancelled: "İptal" };

type Workflow = { id: string; title: string; customer_name: string | null; status: string; priority: string; start_date: string | null; due_date: string | null };

function pad(value: number) {
  return String(value).padStart(2, "0");
}
function parseMonthParam(value: string | undefined) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
function monthLabel(date: Date) {
  return date.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}
function toDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export default async function OperationsGanttPage({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const params = await searchParams;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");

  const monthStart = parseMonthParam(params.ay);
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), daysInMonth);
  const monthQuery = `${monthStart.getFullYear()}-${pad(monthStart.getMonth() + 1)}`;
  const prevMonth = `${new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1).getFullYear()}-${pad(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1).getMonth() + 1)}`;
  const nextMonth = `${new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1).getFullYear()}-${pad(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1).getMonth() + 1)}`;

  const { data, error } = await supabase.from("operation_workflows")
    .select("id,title,customer_name,status,priority,start_date,due_date")
    .eq("organization_id", membership.organization_id)
    .neq("status", "cancelled")
    .order("start_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  const all = (data ?? []) as Workflow[];

  const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthStartKey = monthKey(monthStart);
  const monthEndKey = monthKey(monthEnd);

  const plotted = all.filter((wf) => {
    if (!wf.due_date) return false;
    const start = wf.start_date ?? wf.due_date;
    return start <= monthEndKey && wf.due_date >= monthStartKey;
  });
  const undated = all.filter((wf) => !wf.due_date);
  const todayKey = monthKey(new Date());
  const gridTemplateColumns = `200px repeat(${daysInMonth}, minmax(22px, 1fr))`;

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">OPERASYON / GANTT</small><h1>Gantt Çizelgesi</h1><p>İşlerin başlangıç ve termin tarihlerini takvim üzerinde görün.</p></div>
      <div className="panel-page-actions"><span className="status-pill">{plotted.length} iş</span></div>
    </div>

    <section className="panel-card gantt-card">
      <div className="calendar-month-nav">
        <Link className="panel-icon-button" href={`/panel/operations/gantt?ay=${prevMonth}`} aria-label="Önceki ay">‹</Link>
        <b>{monthLabel(monthStart)}</b>
        <Link className="panel-icon-button" href={`/panel/operations/gantt?ay=${nextMonth}`} aria-label="Sonraki ay">›</Link>
      </div>

      {plotted.length ? (
        <div className="gantt-scroll">
          <div className="gantt-grid" style={{ gridTemplateColumns }}>
            <div className="gantt-corner" style={{ gridRow: 1, gridColumn: 1 }} />
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const key = `${monthQuery}-${pad(day)}`;
              return <div key={day} className={key === todayKey ? "gantt-day-head today" : "gantt-day-head"} style={{ gridRow: 1, gridColumn: day + 1 }}>{day}</div>;
            })}
            {plotted.map((wf, index) => {
              const row = index + 2;
              const rawStart = wf.start_date ?? wf.due_date!;
              const rawEnd = wf.due_date!;
              const startDate = toDate(rawStart < monthStartKey ? monthStartKey : rawStart);
              const endDate = toDate(rawEnd > monthEndKey ? monthEndKey : rawEnd);
              const startCol = startDate.getDate() + 1;
              const endCol = endDate.getDate() + 2;
              return [
                <Link href={`/panel/operations/${wf.id}`} className="gantt-row-label" key={`${wf.id}-label`} style={{ gridRow: row, gridColumn: 1 }}>
                  <b>{wf.title}</b><small>{wf.customer_name || "Kurum içi"}</small>
                </Link>,
                <div key={`${wf.id}-track`} className="gantt-row-track" style={{ gridRow: row, gridColumn: `2 / ${daysInMonth + 2}` }} />,
                <div
                  key={`${wf.id}-bar`}
                  className={`gantt-bar status-${wf.status} priority-${wf.priority}`}
                  style={{ gridRow: row, gridColumn: `${startCol} / ${endCol}` }}
                  title={`${wf.title} · ${statusNames[wf.status] ?? wf.status}`}
                >
                  <span>{statusNames[wf.status] ?? wf.status}</span>
                </div>,
              ];
            })}
          </div>
        </div>
      ) : <p className="panel-empty">Bu ay için tarihli iş bulunmuyor.</p>}

      <div className="gantt-legend">
        <span className="status-planned">Planlandı</span>
        <span className="status-in_progress">Devam ediyor</span>
        <span className="status-blocked">Beklemede</span>
        <span className="status-completed">Tamamlandı</span>
      </div>
    </section>

    {undated.length ? (
      <section className="panel-card">
        <div className="section-heading compact"><div><small className="panel-kicker">TARİHSİZ İŞLER</small><h2>Termini belirlenmemiş</h2></div></div>
        <div className="module-control-list">
          {undated.map((wf) => <div className="module-control" key={wf.id}>
            <div><b>{wf.title}</b><small>{wf.customer_name || "Kurum içi iş"}</small></div>
            <Link className="panel-secondary" href={`/panel/operations/${wf.id}`}>Aç</Link>
          </div>)}
        </div>
      </section>
    ) : null}
  </div>;
}
