import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../components/panel-drawer";
import { AppointmentForm } from "./appointment-form";
import { updateAppointmentStatus, deleteAppointment } from "./actions";
import { CrmTabs } from "../crm-tabs";
import "../takvim.css";

const managerRoles = new Set(["owner", "admin", "manager"]);
const weekdayNames = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const statusLabels: Record<string, string> = { planned: "Planlandı", done: "Tamamlandı", cancelled: "İptal" };

type Employee = { id: string; full_name: string; job_title: string | null };
type Appointment = {
  id: string;
  employee_id: string;
  title: string;
  contact_name: string | null;
  contact_phone: string | null;
  note: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
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
  const firstWeekday = (monthStart.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), i - firstWeekday + 1);
    cells.push({ date, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), day), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
  }
  return cells;
}

function AppointmentRow({ appointment, canManageAll, employeeName }: { appointment: Appointment; canManageAll: boolean; employeeName?: string }) {
  const time = new Date(appointment.starts_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const endTime = appointment.ends_at ? new Date(appointment.ends_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <article className={`appointment-row status-${appointment.status}`}>
      <div className="appointment-time"><b>{time}</b>{endTime ? <small>– {endTime}</small> : null}</div>
      <div className="appointment-body">
        <div className="appointment-heading"><h4>{appointment.title}</h4><span className="status-pill">{statusLabels[appointment.status] ?? appointment.status}</span></div>
        <p>{[appointment.contact_name, appointment.contact_phone].filter(Boolean).join(" · ") || "Kişi belirtilmedi"}{canManageAll && employeeName ? ` · ${employeeName}` : ""}</p>
        {appointment.note ? <p className="appointment-note">{appointment.note}</p> : null}
      </div>
      <div className="appointment-actions">
        {appointment.status !== "done" ? <form action={updateAppointmentStatus}><input type="hidden" name="appointment_id" value={appointment.id} /><input type="hidden" name="status" value="done" /><button className="panel-secondary" type="submit">Tamamlandı</button></form> : null}
        {appointment.status === "planned" ? <form action={updateAppointmentStatus}><input type="hidden" name="appointment_id" value={appointment.id} /><input type="hidden" name="status" value="cancelled" /><button className="panel-secondary" type="submit">İptal</button></form> : null}
        <form action={deleteAppointment}><input type="hidden" name="appointment_id" value={appointment.id} /><button className="panel-danger" type="submit">Sil</button></form>
      </div>
    </article>
  );
}

export default async function CrmCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; ay?: string; tarih?: string; calisan?: string }> }) {
  const params = await searchParams;
  const view = params.view === "liste" ? "liste" : "ay";
  const { supabase, membership, userId, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const isManager = managerRoles.has(membership.role);

  const { data: ownEmployee } = await supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle();

  const employeesPromise = isManager
    ? supabase.from("hr_employees").select("id,full_name,job_title").eq("organization_id", membership.organization_id).eq("employment_status", "active").eq("can_receive_sales_requests", true).order("full_name")
    : Promise.resolve({ data: [] as Employee[], error: null });

  const monthStart = parseMonthParam(params.ay);
  const selectedDate = parseDateParam(params.tarih);
  const rangeStart = view === "ay" ? new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 25) : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  const rangeEnd = view === "ay" ? new Date(monthStart.getFullYear(), monthStart.getMonth() + 2, 5) : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 14);

  let query = supabase.from("crm_appointments").select("id,employee_id,title,contact_name,contact_phone,note,starts_at,ends_at,status")
    .eq("organization_id", membership.organization_id)
    .gte("starts_at", rangeStart.toISOString()).lt("starts_at", rangeEnd.toISOString())
    .order("starts_at", { ascending: true });
  if (isManager && params.calisan) query = query.eq("employee_id", params.calisan);

  const [{ data: appointmentData, error: appointmentError }, { data: employeeData }] = await Promise.all([query, employeesPromise]);
  if (appointmentError) throw new Error("Randevular okunamadı: " + appointmentError.message);
  const appointments = (appointmentData ?? []) as Appointment[];
  const employees = (employeeData ?? []) as Employee[];
  const employeeNameMap = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  if (ownEmployee) employeeNameMap.set(ownEmployee.id, ownEmployee.full_name);

  const byDate = new Map<string, Appointment[]>();
  for (const appointment of appointments) {
    const key = toDateKey(new Date(appointment.starts_at));
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(appointment);
  }

  const todayKey = toDateKey(new Date());
  const monthQuery = `${monthStart.getFullYear()}-${pad(monthStart.getMonth() + 1)}`;
  const prevMonth = `${new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1).getFullYear()}-${pad(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1).getMonth() + 1)}`;
  const nextMonth = `${new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1).getFullYear()}-${pad(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1).getMonth() + 1)}`;
  const selectedKey = toDateKey(selectedDate);
  const withParams = (extra: Record<string, string>) => {
    const usp = new URLSearchParams({ view, ay: monthQuery, tarih: selectedKey, ...(params.calisan ? { calisan: params.calisan } : {}), ...extra });
    return `/panel/crm/takvim?${usp.toString()}`;
  };

  const listDays: { key: string; date: Date }[] = [];
  if (view === "liste") {
    for (let i = 0; i < 14; i++) {
      const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + i);
      listDays.push({ key: toDateKey(date), date });
    }
  }

  const drawer = <PanelDrawer triggerLabel="+ Yeni randevu" title="Yeni randevu" description="Randevu bilgilerini girin.">
    <AppointmentForm isManager={isManager} employees={employees} defaultDate={selectedKey} returnTo={withParams({})} />
  </PanelDrawer>;

  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div><small className="panel-kicker">CRM / TAKVİM</small><h1>Satış Takvimi</h1><p>{isManager ? "Tüm ekibin randevularını görüntüleyin." : "Kendi randevularınızı ve notlarınızı yönetin."}</p></div>
        <div className="panel-page-actions">
          <span className="status-pill">{appointments.length} randevu</span>
          {drawer}
        </div>
      </div>
      <CrmTabs active="takvim" />
      <div className="module-tab-panel">

      <div className="calendar-toolbar">
        <div className="calendar-view-toggle">
          <Link className={view === "ay" ? "active" : ""} href={withParams({ view: "ay" })}>Aylık</Link>
          <Link className={view === "liste" ? "active" : ""} href={withParams({ view: "liste" })}>Liste</Link>
        </div>
        {isManager && employees.length ? (
          <form className="calendar-filter" method="get">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="ay" value={monthQuery} />
            <input type="hidden" name="tarih" value={selectedKey} />
            <select name="calisan" defaultValue={params.calisan ?? ""}>
              <option value="">Tüm ekip</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
            </select>
            <button className="panel-secondary" type="submit">Filtrele</button>
          </form>
        ) : null}
      </div>

      {view === "ay" ? (
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
              const dayAppointments = byDate.get(key) ?? [];
              return (
                <Link key={key} href={withParams({ tarih: key })} className={["calendar-day", inMonth ? "" : "outside", key === todayKey ? "today" : "", key === selectedKey ? "selected" : ""].filter(Boolean).join(" ")}>
                  <span className="calendar-day-number">{date.getDate()}</span>
                  {dayAppointments.slice(0, 2).map((appointment) => <em key={appointment.id}>{appointment.title}</em>)}
                  {dayAppointments.length > 2 ? <small>+{dayAppointments.length - 2} daha</small> : null}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {view === "ay" ? (
        <section className="panel-card">
          <div className="section-heading compact"><div><small className="panel-kicker">SEÇİLİ GÜN</small><h2>{selectedDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" })}</h2></div></div>
          <div className="appointment-list">
            {(byDate.get(selectedKey) ?? []).length ? (byDate.get(selectedKey) ?? []).map((appointment) => <AppointmentRow key={appointment.id} appointment={appointment} canManageAll={isManager} employeeName={employeeNameMap.get(appointment.employee_id)} />) : <p className="panel-empty">Bu gün için randevu yok.</p>}
          </div>
        </section>
      ) : (
        <section className="panel-card">
          <div className="appointment-day-groups">
            {listDays.map(({ key, date }) => {
              const dayAppointments = byDate.get(key) ?? [];
              if (!dayAppointments.length && key !== todayKey) return null;
              return (
                <div className="appointment-day-group" key={key}>
                  <h3>{date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}{key === todayKey ? <span className="status-pill">Bugün</span> : null}</h3>
                  <div className="appointment-list">
                    {dayAppointments.length ? dayAppointments.map((appointment) => <AppointmentRow key={appointment.id} appointment={appointment} canManageAll={isManager} employeeName={employeeNameMap.get(appointment.employee_id)} />) : <p className="panel-empty">Randevu yok.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}
