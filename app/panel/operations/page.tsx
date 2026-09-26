import Link from "next/link";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { formatSubject, initials } from "@/lib/table-format";
import { statusTone } from "@/lib/status-tone";
import { relativeTime } from "../crm/last-contact";
import { PanelDrawer } from "../components/panel-drawer";
import { OperationsTabs } from "./operations-tabs";
import { WorkflowCreateForm } from "./workflow-create-form";
import { OpsIcon, activeStatuses, addDaysKey, dueBadge, shortDate, stepProgress, todayIstanbul, workflowStatusNames } from "./ops-shared";
import "../crm/crm.css";
import "./operations.css";
import "./overview.css";

// Operasyon genel bakış: operasyoncunun günlük ekranı. Yeni gelen işler,
// devam eden işler, termini yaklaşan işler ve müşteriden gelen okunmamış
// mesajlar kartlar halinde; her kartta ilk 5 kayıt ve "Tümünü gör".
// Veri, işler tablosuyla aynı kapsamda: kurum filtresi + RLS (yönetici
// değilse yalnızca sorumlusu olduğu işler).

type Workflow = {
  id: string;
  title: string;
  customer_name: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  assigned_employee_id: string | null;
  operation_steps: { is_completed: boolean }[] | null;
};
type MessageRow = {
  id: string;
  workflow_id: string;
  sender_name: string | null;
  body: string;
  created_at: string;
  operation_workflows: { id: string; title: string; customer_name: string | null; status: string } | { id: string; title: string; customer_name: string | null; status: string }[] | null;
};
type Tone = "info" | "gold" | "success" | "danger" | "warning" | "brand" | "neutral";

const LIST_LIMIT = 5;
/* Mesaj ÖNİZLEME penceresi. Kutucuktaki toplam buradan gelmiyor; ayrı ve
   sınırsız bir sayım sorgusundan geliyor. */
const MESAJ_ONIZLEME = 500;
const ISLER = "/panel/operations/isler";

export default async function OperationsOverviewPage({ searchParams }: { searchParams: Promise<{ arama?: string; durum?: string }> }) {
  // Eski bağlantılar (/panel/operations?arama=…&durum=…) işler tablosuna gider
  const params = await searchParams;
  const legacy = new URLSearchParams();
  if (params.arama) legacy.set("arama", params.arama);
  if (params.durum) legacy.set("durum", params.durum);
  if (legacy.size) redirect(`${ISLER}?${legacy.toString()}`);

  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;
  const today = todayIstanbul();
  const weekEnd = addDaysKey(today, 7);

  const [{ data, error }, { data: employeeData, error: employeeError }, { data: messageData, error: messageError }, { count: archivedCount }, { count: okunmamisSayisi }] = await Promise.all([
    supabase.from("operation_workflows")
      .select("id,title,customer_name,status,priority,due_date,created_at,updated_at,assigned_employee_id,operation_steps(is_completed)")
      .eq("organization_id", organizationId)
      .in("status", [...activeStatuses])
      .order("created_at", { ascending: false }),
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", organizationId).eq("employment_status", "active"),
    // !inner: mesajın işi RLS'te görünmüyorsa (başkasının işi) mesaj da gelmez
    supabase.from("customer_file_messages")
      .select("id,workflow_id,sender_name,body,created_at,operation_workflows!inner(id,title,customer_name,status)")
      .eq("organization_id", organizationId)
      .eq("sender_type", "customer")
      .is("read_at", null)
      .neq("operation_workflows.status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(MESAJ_ONIZLEME),
    supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "archived"),
    /*
      Okunmamış mesaj sayısı AYRI ve sınırsız sorguda. Yukarıdaki liste
      önizleme için sınırlı; sayısını ondan almak, sınır aşıldığında
      kutucuğun sessizce "500"de donması demekti (aynı sayfada arşiv sayısı
      zaten bu teknikle alınıyor).
    */
    supabase.from("customer_file_messages")
      .select("id,operation_workflows!inner(id)", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("sender_type", "customer")
      .is("read_at", null)
      .neq("operation_workflows.status", "cancelled"),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  if (messageError) throw new Error("Müşteri mesajları okunamadı: " + messageError.message);

  const workflows = (data ?? []) as Workflow[];
  const employeeName = new Map(((employeeData ?? []) as { id: string; full_name: string }[]).map((row) => [row.id, formatPersonName(row.full_name)]));
  const assigneeOf = (workflow: Workflow) => (workflow.assigned_employee_id ? employeeName.get(workflow.assigned_employee_id) ?? "Pasif personel" : null);
  const canManage = ["owner", "admin", "manager"].includes(membership.role);

  // Kartlar
  const planned = workflows.filter((workflow) => workflow.status === "planned");
  const unassignedPlanned = planned.filter((workflow) => !workflow.assigned_employee_id).length;
  // Atanmamış yeni işler üstte, sonra en yeni
  const plannedList = [...planned].sort((a, b) => Number(Boolean(a.assigned_employee_id)) - Number(Boolean(b.assigned_employee_id)) || b.created_at.localeCompare(a.created_at));

  const ongoing = workflows.filter((workflow) => workflow.status === "in_progress" || workflow.status === "blocked");
  const blockedCount = ongoing.filter((workflow) => workflow.status === "blocked").length;
  const ongoingList = [...ongoing].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || b.updated_at.localeCompare(a.updated_at));

  const dueList = workflows.filter((workflow) => workflow.due_date && workflow.due_date <= weekEnd).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const overdueCount = dueList.filter((workflow) => workflow.due_date! < today).length;
  const dueSoonCount = dueList.length - overdueCount;

  const messages = ((messageData ?? []) as unknown as MessageRow[]).map((row) => ({ ...row, workflow: Array.isArray(row.operation_workflows) ? row.operation_workflows[0] : row.operation_workflows }));
  // İş başına tek satır: en son mesaj + o işteki okunmamış sayısı.
  const threads = new Map<string, { latest: (typeof messages)[number]; count: number }>();
  /*
    tuzak-tamam: bu sayı bilerek ÖNİZLEME penceresinden (son MESAJ_ONIZLEME
    mesaj) geliyor. Kutucuktaki TOPLAM artık ayrı ve sınırsız bir sayım
    sorgusundan; buradaki liste ve iş başına sayı yalnızca en yeni mesajları
    göstermek için. Pencere dolduğunda "kaç işte" metni "en az" diye
    yazılıyor, sayı kesinmiş gibi sunulmuyor.
  */
  for (const message of messages) {
    const thread = threads.get(message.workflow_id);
    if (thread) thread.count += 1;
    else threads.set(message.workflow_id, { latest: message, count: 1 });
  }
  const threadList = [...threads.values()];
  /*
    Kutucuktaki sayı kesin sorgudan; liste yalnızca önizleme. Sayım
    alınamazsa listeden düşülüyor — en azından eldeki kadarını söylemek,
    hiç söylememekten iyi.
  */
  const unreadTotal = okunmamisSayisi ?? messages.length;
  /* Liste sınıra dayandıysa "kaç işte" sayısı da alt sınırdır. */
  const onizlemeKesildi = messages.length >= MESAJ_ONIZLEME;
  const isSayisiMetni = `${onizlemeKesildi ? "en az " : ""}${threads.size} işte okunmamış`;

  const withSteps = workflows.filter((workflow) => (workflow.operation_steps ?? []).length);
  const averageProgress = withSteps.length ? Math.round(withSteps.reduce((sum, workflow) => sum + stepProgress(workflow.operation_steps).percentage, 0) / withSteps.length) : 0;
  const unassignedTotal = workflows.filter((workflow) => !workflow.assigned_employee_id).length;

  const widgets: { label: string; value: string | number; note: string; href: string; icon: string; tone: Tone }[] = [
    { label: "Aktif iş", value: workflows.length, note: unassignedTotal ? `${unassignedTotal} iş atanmamış` : "Hepsinin sorumlusu var", href: ISLER, icon: "briefcase", tone: "brand" },
    { label: "Bu hafta teslim", value: dueSoonCount, note: "Önümüzdeki 7 gün", href: `${ISLER}?termin=yaklasan`, icon: "clock", tone: "gold" },
    { label: "Geciken teslim", value: overdueCount, note: overdueCount ? "Termini geçti" : "Geciken iş yok", href: `${ISLER}?termin=geciken`, icon: "alert", tone: overdueCount ? "danger" : "success" },
    { label: "Müşteri mesajı", value: unreadTotal, note: unreadTotal ? isSayisiMetni : "Hepsi okundu", href: `${ISLER}?mesaj=yeni`, icon: "message", tone: unreadTotal ? "danger" : "info" },
    { label: "Ortalama ilerleme", value: `%${averageProgress}`, note: "Aktif işlerin görevleri", href: `${ISLER}?durum=devam`, icon: "progress", tone: "success" },
  ];

  const parts = [
    planned.length ? `${planned.length} yeni iş` : null,
    overdueCount ? `${overdueCount} geciken teslim` : null,
    dueSoonCount ? `bu hafta ${dueSoonCount} teslim` : null,
    unreadTotal ? `${unreadTotal} okunmamış müşteri mesajı` : null,
  ].filter(Boolean);
  const summary = parts.length ? `Şu an ${parts.join(", ")} var.` : "Bekleyen acil bir iş yok, her şey yolunda.";

  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div><small className="panel-kicker">OPERASYON / GENEL BAKIŞ</small><h1>Genel bakış</h1><p>{summary}</p></div>
        <div className="panel-page-actions">
          <Link className="panel-secondary" href={ISLER}>Tüm işler</Link>
          {canManage ? <PanelDrawer triggerLabel="+ Yeni iş" kicker="YENİ KAYIT" title="Yeni iş" description="İş başlığını, önceliğini ve terminini belirleyin."><WorkflowCreateForm /></PanelDrawer> : null}
        </div>
      </div>
      <OperationsTabs active="genel-bakis" />
      <div className="module-tab-panel opsov">
        <section className="opsov-widgets" aria-label="Özet">
          {widgets.map((widget) => (
            <Link className="opsov-widget" data-tone={widget.tone} href={widget.href} key={widget.label}>
              <span className="opsov-widget-icon"><OpsIcon name={widget.icon} /></span>
              <small>{widget.label}</small>
              <strong>{widget.value}</strong>
              <span className="opsov-widget-note">{widget.note}</span>
            </Link>
          ))}
        </section>

        <section className="opsov-grid">
          {/* Yeni gelen işler */}
          <article className="opsov-card" data-tone="info">
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><OpsIcon name="inbox" /></span>
              <div><h2>Yeni gelen işler</h2><p>{unassignedPlanned ? `${unassignedPlanned} iş sorumlu bekliyor` : "Planlanan, henüz başlamamış işler"}</p></div>
              <b className="opsov-count">{planned.length}</b>
            </header>
            {plannedList.length ? (
              <ul className="opsov-list">
                {plannedList.slice(0, LIST_LIMIT).map((workflow) => {
                  const assignee = assigneeOf(workflow);
                  return (
                    <li key={workflow.id} className={assignee ? undefined : "is-flagged"} data-flag="gold">
                      <Link className="opsov-row" href={`/panel/operations/${workflow.id}`}>
                        <span className="opsov-row-main"><b title={workflow.title}>{formatSubject(workflow.title)}</b><small>{workflow.customer_name || "Kurum içi iş"} · {relativeTime(workflow.created_at)}</small></span>
                        <span className="opsov-row-side">
                          {assignee ? <span className="opsov-person" title={assignee}><i aria-hidden="true">{initials(assignee)}</i><span>{assignee}</span></span> : <span className="status-pill" data-tone="gold">Atanmamış</span>}
                        </span>
                        <OpsIcon name="chevron" size={14} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="opsov-empty"><OpsIcon name="check" size={20} />Yeni iş yok. Sözleşmesi onaylanan işler burada belirir.</p>}
            <Link className="opsov-more" href={`${ISLER}?durum=planned`}>Tümünü gör<OpsIcon name="chevron" size={14} /></Link>
          </article>

          {/* Devam eden işler */}
          <article className="opsov-card" data-tone="success">
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><OpsIcon name="progress" /></span>
              <div><h2>Devam eden işler</h2><p>{blockedCount ? `${blockedCount} iş beklemede` : "Üzerinde çalışılan işler"}</p></div>
              <b className="opsov-count">{ongoing.length}</b>
            </header>
            {ongoingList.length ? (
              <ul className="opsov-list">
                {ongoingList.slice(0, LIST_LIMIT).map((workflow) => {
                  const progress = stepProgress(workflow.operation_steps);
                  const assignee = assigneeOf(workflow);
                  return (
                    <li key={workflow.id} className={workflow.status === "blocked" ? "is-flagged" : undefined} data-flag="warning">
                      <Link className="opsov-row" href={`/panel/operations/${workflow.id}`}>
                        <span className="opsov-row-main"><b title={workflow.title}>{formatSubject(workflow.title)}</b><small>{workflow.customer_name || "Kurum içi iş"} · {assignee ?? "Atanmamış"}</small></span>
                        <span className="opsov-row-side opsov-progress">
                          {workflow.status === "blocked" ? <span className="status-pill" data-tone={statusTone(workflow.status)}>{workflowStatusNames[workflow.status]}</span> : null}
                          <span className="opsov-bar" aria-hidden="true"><i style={{ "--p": `${progress.percentage}%` } as CSSProperties} /></span>
                          <em>%{progress.percentage}</em>
                        </span>
                        <OpsIcon name="chevron" size={14} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="opsov-empty"><OpsIcon name="check" size={20} />Şu an devam eden iş yok.</p>}
            <Link className="opsov-more" href={`${ISLER}?durum=devam`}>Tümünü gör<OpsIcon name="chevron" size={14} /></Link>
          </article>

          {/* Teslim tarihi yaklaşan */}
          <article className="opsov-card" data-tone={overdueCount ? "danger" : "gold"}>
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><OpsIcon name="clock" /></span>
              <div><h2>Teslim tarihi yaklaşan</h2><p>{overdueCount ? `${overdueCount} gecikmiş · ${dueSoonCount} bu hafta` : "Önümüzdeki 7 gün içinde teslim"}</p></div>
              <b className="opsov-count">{dueList.length}</b>
            </header>
            {dueList.length ? (
              <ul className="opsov-list">
                {dueList.slice(0, LIST_LIMIT).map((workflow) => {
                  const badge = dueBadge(workflow.due_date!, today);
                  return (
                    <li key={workflow.id} className={badge.late ? "is-flagged" : undefined} data-flag="danger">
                      <Link className="opsov-row" href={`/panel/operations/${workflow.id}`}>
                        <span className="opsov-row-main"><b title={workflow.title}>{formatSubject(workflow.title)}</b><small>{workflow.customer_name || "Kurum içi iş"} · {assigneeOf(workflow) ?? "Atanmamış"}</small></span>
                        <span className="opsov-row-side opsov-due">
                          <time dateTime={workflow.due_date!}>{shortDate(workflow.due_date)}</time>
                          <span className="status-pill" data-tone={badge.tone}>{badge.label}</span>
                        </span>
                        <OpsIcon name="chevron" size={14} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="opsov-empty"><OpsIcon name="check" size={20} />Bu hafta teslimi olan ya da geciken iş yok.</p>}
            <Link className="opsov-more" href={`${ISLER}?termin=yaklasan`}>Tümünü gör<OpsIcon name="chevron" size={14} /></Link>
          </article>

          {/* Müşteriden gelen mesajlar */}
          <article className="opsov-card" data-tone={unreadTotal ? "danger" : "brand"}>
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><OpsIcon name="message" /></span>
              <div><h2>Müşteriden gelen mesajlar</h2><p>{unreadTotal ? `${isSayisiMetni} mesaj` : "Takip ekranından yazılanlar"}</p></div>
              <b className="opsov-count">{unreadTotal}</b>
            </header>
            {threadList.length ? (
              <ul className="opsov-list">
                {threadList.slice(0, LIST_LIMIT).map(({ latest, count }) => {
                  const sender = formatPersonName(latest.sender_name || latest.workflow?.customer_name) || "Müşteri";
                  return (
                    <li key={latest.workflow_id} className="is-flagged" data-flag="danger">
                      <Link className="opsov-row opsov-message" href={`/panel/operations/${latest.workflow_id}#musteri-mesajlari`}>
                        <span className="opsov-avatar" aria-hidden="true">{initials(sender)}</span>
                        <span className="opsov-row-main">
                          <b>{sender}<small> · {formatSubject(latest.workflow?.title ?? "İş")}</small></b>
                          <span className="opsov-excerpt">{latest.body}</span>
                        </span>
                        <span className="opsov-row-side opsov-message-side">
                          <time dateTime={latest.created_at}>{relativeTime(latest.created_at)}</time>
                          {count > 1 ? <em className="opsov-badge">{count}</em> : <em className="opsov-badge">Yeni</em>}
                        </span>
                        <OpsIcon name="chevron" size={14} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="opsov-empty"><OpsIcon name="check" size={20} />Okunmamış müşteri mesajı yok.</p>}
            <Link className="opsov-more" href={`${ISLER}?mesaj=yeni`}>Tümünü gör<OpsIcon name="chevron" size={14} /></Link>
          </article>
        </section>

        <p className="opsov-foot">
          <OpsIcon name="archive" size={16} />
          <span>Tamamlanan işleri “Arşivle” ile aktif listeden kaldırabilirsiniz.</span>
          <Link href="/panel/operations/arsiv">Arşiv ({archivedCount ?? 0})</Link>
        </p>
      </div>
    </div>
  );
}
