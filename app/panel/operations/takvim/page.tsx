import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { OperationsTabs } from "../operations-tabs";
import { hatirlatmaDurumu, isDurumAdi } from "@/lib/is-adimlari";
import { todayIstanbul } from "../ops-shared";
import "../../crm/takvim.css";

/*
  Takvim yalnızca İŞİN termin tarihini gösteriyordu. Sekiz aşamalı bir tez
  takvimde tek bir nokta olarak görünüyor, ara teslimler hiç görünmüyordu —
  oysa operasyoncunun "hangi maddenin tarihi yaklaşıyor" diye bakacağı yer
  burası.

  Artık AŞAMA tarihleri de takvime düşüyor; işin termini ile aşama teslimi
  ayrı gösteriliyor, aşamanın sorumlusu da yazıyor ("kimin hangi işi").
  Tamamlanmış aşama takvimi doldurmasın diye gösterilmiyor: geçmiş teslim
  planlama kararına girmiyor, geçmişi kayıt geçmişi tutuyor.
*/
const weekdayNames = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

type AdimSatiri = { id: string; title: string; due_date: string | null; is_completed: boolean; assigned_employee_id: string | null };
type Workflow = { id: string; title: string; customer_name: string | null; status: string; priority: string; start_date: string | null; due_date: string | null; operation_steps?: AdimSatiri[] };

/** Takvime düşen bir madde: işin termini ya da bir aşamanın teslimi. */
type Madde = {
  anahtar: string;
  tarih: string;
  tur: "is" | "asama";
  baslik: string;
  isId: string;
  isBasligi: string;
  musteri: string;
  durum: string;
  sorumlu: string | null;
  uyari: "due_soon" | "overdue" | null;
};

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

  /*
    Termin süzgeci sorgudan kalktı: bir işin termini aralığın dışında olsa
    bile AŞAMASI bu ayda olabiliyor (uzun bir tezin ara teslimi). Süzme
    aşağıda madde madde yapılıyor.
  */
  const [{ data, error }, { data: employees }] = await Promise.all([
    supabase.from("operation_workflows")
      .select("id,title,customer_name,status,priority,start_date,due_date,operation_steps(id,title,due_date,is_completed,assigned_employee_id)")
      .eq("organization_id", membership.organization_id)
      // İptal edilen ve arşive gönderilen işler takvimde görünmez
      .not("status", "in", "(cancelled,archived)"),
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  const workflows = (data ?? []) as Workflow[];
  const sorumlular = new Map(((employees ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]));

  const bugun = todayIstanbul();
  const aralikBas = toDateKey(rangeStart);
  const aralikSon = toDateKey(rangeEnd);
  const aralikta = (gun: string | null) => Boolean(gun) && gun! >= aralikBas && gun! <= aralikSon;

  const maddeler: Madde[] = [];
  for (const wf of workflows) {
    const musteri = wf.customer_name || "Kurum içi iş";
    if (aralikta(wf.due_date)) {
      maddeler.push({
        anahtar: `is-${wf.id}`, tarih: wf.due_date!, tur: "is", baslik: wf.title,
        isId: wf.id, isBasligi: wf.title, musteri, durum: wf.status, sorumlu: null, uyari: null,
      });
    }
    for (const adim of wf.operation_steps ?? []) {
      // Tamamlanan aşama takvimi doldurmasın: geçmiş teslim planlama kararına girmiyor.
      if (adim.is_completed || !aralikta(adim.due_date)) continue;
      maddeler.push({
        anahtar: `adim-${adim.id}`, tarih: adim.due_date!, tur: "asama", baslik: adim.title,
        isId: wf.id, isBasligi: wf.title, musteri, durum: wf.status,
        sorumlu: adim.assigned_employee_id ? sorumlular.get(adim.assigned_employee_id) ?? null : null,
        // Eşik gece bildirimiyle aynı (lib/is-adimlari.ts): ekran ile uyarı ayrışmasın.
        uyari: hatirlatmaDurumu({ due_date: adim.due_date, is_completed: adim.is_completed }, bugun),
      });
    }
  }

  const byDate = new Map<string, Madde[]>();
  for (const madde of maddeler) {
    if (!byDate.has(madde.tarih)) byDate.set(madde.tarih, []);
    byDate.get(madde.tarih)!.push(madde);
  }
  // Gün içinde işin termini üstte: o günün asıl olayı teslimdir.
  for (const liste of byDate.values()) {
    liste.sort((a, b) => (a.tur === b.tur ? a.baslik.localeCompare(b.baslik, "tr") : a.tur === "is" ? -1 : 1));
  }

  const withParams = (extra: Record<string, string>) => {
    const usp = new URLSearchParams({ ay: monthQuery, tarih: selectedKey, ...extra });
    return `/panel/operations/takvim?${usp.toString()}`;
  };

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">OPERASYON / TAKVİM</small><h1>İş Takvimi</h1><p>İşlerin terminleri ve aşamalarının teslim tarihleri. Yaklaşan ve geciken aşamalar işaretli. (CRM randevu takviminden ayrıdır.)</p></div>
      <div className="panel-page-actions"><span className="status-pill">{maddeler.length} madde</span></div>
    </div>
    <OperationsTabs active="takvim" />
    <div className="module-tab-panel">

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
              {/* Aşama maddesi işin terminiyle karışmasın: önüne işaret konuyor. */}
              {dayItems.slice(0, 2).map((madde) => (
                <em key={madde.anahtar} data-tur={madde.tur} data-tone={madde.uyari ?? undefined}>
                  {madde.tur === "asama" ? "› " : ""}{madde.baslik}
                </em>
              ))}
              {dayItems.length > 2 ? <small>+{dayItems.length - 2} daha</small> : null}
            </Link>
          );
        })}
      </div>
    </section>

    <section className="panel-card">
      <div className="section-heading compact"><div><small className="panel-kicker">SEÇİLİ GÜN</small><h2>{selectedDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" })}</h2></div></div>
      <div className="appointment-list">
        {(byDate.get(selectedKey) ?? []).length ? (byDate.get(selectedKey) ?? []).map((madde) => (
          <article key={madde.anahtar} className={`appointment-row status-${madde.durum === "completed" ? "done" : madde.durum === "cancelled" ? "cancelled" : "planned"}`}>
            {/* İşin termini mi bir aşamanın teslimi mi: ilk bakışta ayrılmalı. */}
            <div className="appointment-time"><b>{madde.tur === "is" ? "Termin" : "Aşama"}</b></div>
            <div className="appointment-body">
              <div className="appointment-heading">
                <h4>{madde.baslik}</h4>
                {madde.uyari ? (
                  <span className="status-pill" data-tone={madde.uyari === "overdue" ? "danger" : "warning"}>
                    {madde.uyari === "overdue" ? "Gecikti" : "Yaklaştı"}
                  </span>
                ) : <span className="status-pill">{isDurumAdi(madde.durum)}</span>}
              </div>
              <p>
                {madde.musteri}
                {madde.tur === "asama" ? ` · ${madde.isBasligi}` : ""}
                {/* "Kimin hangi işi" sorusunun yanıtı burada. */}
                {madde.sorumlu ? ` · ${madde.sorumlu}` : madde.tur === "asama" ? " · sorumlu atanmadı" : ""}
              </p>
            </div>
            <div className="appointment-actions"><Link className="panel-secondary" href={`/panel/operations/${madde.isId}`}>İşi aç</Link></div>
          </article>
        )) : <p className="panel-empty">Bu gün için terminli iş ya da aşama yok.</p>}
      </div>
    </section>
    </div>
  </div>;
}
