import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { InternalComments } from "../../crm/internal-comments";
import { RecordHistory } from "../../crm/record-history";
import { addWorkflowStep, archiveWorkflow, assignStep, assignWorkflow, deleteWorkflow, replyCustomerFileMessage, setStepDueDate, setStepStatus, setWorkflowDueDate, setWorkflowStatus, toggleWorkflowStep, unarchiveWorkflow } from "../actions";
import { STEP_STATUSES, STEP_STATUS_LABELS, STEP_STATUS_TONES, hatirlatmaDurumu, type StepStatus } from "@/lib/is-adimlari";
import { OpsIcon, todayIstanbul } from "../ops-shared";
import { PanelDrawer } from "../../components/panel-drawer";
import { ConfirmDeleteButton } from "../../accounts/confirm-delete-button";
import { formatPersonName } from "@/lib/format-name";
import { formatPhone } from "@/lib/format-phone";
import { formatSubject, initials } from "@/lib/table-format";
import { statusTone } from "@/lib/status-tone";
import { contractStatusLabel, proposalStatusLabel } from "../../crm/status-labels";
import { requestStageNames } from "../../crm/request-status";
import { MarkCustomerMessagesRead } from "./mark-messages-read";
import { PortalFilesCard, type StaffPortalFile, type StaffPortalPayment } from "./portal-files";
import type { PortalAccessRule } from "../portal-files-shared";
import "../operations.css";
import "../../crm/request-page.css";
import "./detail.css";

type Step = { id: string; title: string; is_completed: boolean; sort_order: number; completed_at: string | null; completed_by: string | null; due_date: string | null; status: StepStatus; assigned_employee_id: string | null };
type Workflow = { id: string; title: string; assigned_employee_id: string | null; customer_name: string | null; description: string | null; status: string; priority: string; start_date: string | null; due_date: string | null; created_at: string; updated_at: string; archived_at: string | null; archived_by: string | null; operation_steps: Step[] };
type Contract = { id: string; contract_no: string; proposal_id: string | null; opportunity_id: string; status: string; tracking_code: string | null; share_token: string | null };
type Opportunity = { customer_name: string; contact_email: string | null; contact_phone: string | null; title: string | null; stage: string | null };
type Proposal = { id: string; proposal_no: string; status: string };
type Comment = { id: string; body: string; created_at: string; created_by: string; context_type: "request" | "proposal" | "contract" | "operation" };
type CustomerMessage = { id: string; sender_type: "customer" | "staff"; sender_name: string; body: string; created_at: string; read_at: string | null };
type Activity = { id: string; title: string; detail: string; at: string; kind: "created" | "step" | "comment" };

const TZ = "Europe/Istanbul";
const statusOptions = [
  ["planned", "Planlandı"],
  ["in_progress", "Devam ediyor"],
  ["blocked", "Beklemede"],
  ["completed", "Tamamlandı"],
  ["cancelled", "İptal"],
] as const;
// "Arşivlendi" seçicide yok: arşive yalnızca tamamlanan iş "Arşivle" ile gider
const statusNames: Record<string, string> = { ...Object.fromEntries(statusOptions), archived: "Arşivlendi" };
const priorityNames: Record<string, string> = { low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" };
const priorityTones: Record<string, string> = { low: "info", normal: "neutral", high: "warning", urgent: "danger" };
const moneyFormat = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

const formatDate = (value?: string | null, withTime = false) =>
  value
    ? new Intl.DateTimeFormat("tr-TR", withTime ? { timeZone: TZ, dateStyle: "medium", timeStyle: "short" } : { timeZone: TZ, dateStyle: "long" }).format(
        new Date(value.includes("T") ? value : `${value}T12:00:00`),
      )
    : "—";

/** Termin durumu: kalan / geciken gün (İstanbul gününe göre) */
function dueInfo(due: string | null, status: string) {
  if (!due) return { tone: "neutral", hint: "Teslim tarihi girilmemiş", late: false };
  if (status === "completed" || status === "archived") return { tone: "success", hint: "İş tamamlandı", late: false };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { tone: "danger", hint: `${-days} gün gecikti`, late: true };
  if (days === 0) return { tone: "warning", hint: "Bugün teslim", late: false };
  if (days <= 3) return { tone: "warning", hint: `${days} gün kaldı`, late: false };
  return { tone: "success", hint: `${days} gün kaldı`, late: false };
}

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

export default async function OperationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership, modules, userId } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;
  const { data: workflowData, error: workflowError } = await supabase
    .from("operation_workflows")
    .select("id,title,assigned_employee_id,customer_name,description,status,priority,start_date,due_date,created_at,updated_at,archived_at,archived_by,operation_steps(id,title,is_completed,sort_order,completed_at,completed_by,due_date,status,assigned_employee_id)")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();
  if (workflowError || !workflowData) notFound();
  const workflow = workflowData as Workflow;
  const steps = [...(workflow.operation_steps ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const completedCount = steps.filter((step) => step.is_completed).length;
  const progress = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;
  const canAssign = ["owner", "admin", "manager"].includes(membership.role);
  const canDelete = ["owner", "admin"].includes(membership.role);

  const isArchived = workflow.status === "archived";
  const [{ data: contractData }, { data: customerMessagesData, error: customerMessagesError }, { data: assignee }, { data: me }, { data: employeeData }, { data: archiver }] = await Promise.all([
    supabase.from("crm_contracts").select("id,contract_no,proposal_id,opportunity_id,status,tracking_code,share_token").eq("workflow_id", workflow.id).eq("organization_id", organizationId).maybeSingle(),
    supabase.from("customer_file_messages").select("id,sender_type,sender_name,body,created_at,read_at").eq("workflow_id", workflow.id).eq("organization_id", organizationId).order("created_at", { ascending: true }),
    workflow.assigned_employee_id
      ? supabase.from("hr_employees").select("id,full_name,job_title").eq("id", workflow.assigned_employee_id).eq("organization_id", organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("hr_employees").select("id").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    /*
      Personel listesi artık YÖNETİCİ OLMAYANA da okunuyor: adımın
      sorumlusunu göstermek için ada ihtiyaç var ve eskiden liste yalnızca
      atama yetkisi olana geliyordu. Atama kutusu yine yalnızca yöneticiye
      çiziliyor (canAssign).
    */
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", organizationId).eq("employment_status", "active").order("full_name"),
    isArchived && workflow.archived_by
      ? supabase.from("hr_employees").select("full_name").eq("organization_id", organizationId).eq("user_id", workflow.archived_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (customerMessagesError) throw new Error("Müşteri mesajları okunamadı: " + customerMessagesError.message);
  const customerMessages = (customerMessagesData ?? []) as CustomerMessage[];
  const unreadCustomerMessages = customerMessages.filter((message) => message.sender_type === "customer" && !message.read_at).length;
  const contract = contractData as Contract | null;
  const employees = (employeeData ?? []) as { id: string; full_name: string }[];
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  // Saat bileşen gövdesinde okunmaz (react-hooks/purity); yardımcı ops-shared'da.
  const bugunIstanbul = todayIstanbul();
  const assigneeRow = assignee as { id: string; full_name: string; job_title: string | null } | null;
  // Termini yöneticiler ve işin sorumlusu girebilir (actions.ts ile aynı kural)
  const canEditDue = canAssign || Boolean((me as { id?: string } | null)?.id && (me as { id: string }).id === workflow.assigned_employee_id);
  // Arşivleme de aynı kural (actions.ts isManagerOrAssignee)
  const canArchive = canEditDue;
  const archiverName = isArchived ? (workflow.archived_by ? formatPersonName((archiver as { full_name?: string } | null)?.full_name) || "Ekip üyesi" : "Otomatik (ödeme kapandı)") : null;

  const [opportunityResult, proposalResult, commentsResult, portalFilesResult, portalPaymentResult, portalDownloadsResult] = await Promise.all([
    contract?.opportunity_id
      ? supabase.from("crm_opportunities").select("customer_name,contact_email,contact_phone,title,stage").eq("id", contract.opportunity_id).eq("organization_id", organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    contract?.proposal_id
      ? supabase.from("crm_proposals").select("id,proposal_no,status").eq("id", contract.proposal_id).eq("organization_id", organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    contract?.opportunity_id
      ? supabase.from("crm_internal_comments").select("id,body,created_at,created_by,context_type").eq("organization_id", organizationId).eq("opportunity_id", contract.opportunity_id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from("operation_customer_files").select("id,file_name,mime_type,size_bytes,note,access_rule,created_at,uploaded_by").eq("workflow_id", workflow.id).eq("organization_id", organizationId).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.rpc("portal_workflow_payment_status", { p_workflow_id: workflow.id }),
    supabase.from("operation_customer_file_downloads").select("file_id").eq("workflow_id", workflow.id).eq("outcome", "granted").limit(5000),
  ]);
  if ("error" in commentsResult && commentsResult.error) throw new Error("Kurum içi yorumlar okunamadı: " + commentsResult.error.message);

  // Müşteri portalı dosyaları. Migration (20260912203000) henüz çalışmadıysa
  // sayfa kırılmaz; kart kurulum uyarısı gösterir.
  const isMissingSchema = (error: { code?: string; message?: string } | null) =>
    Boolean(error && (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "") || /does not exist|schema cache/i.test(error.message ?? "")));
  const portalSetupMissing = isMissingSchema(portalFilesResult.error) || isMissingSchema(portalPaymentResult.error);
  if (!portalSetupMissing && portalFilesResult.error) throw new Error("Müşteri portalı dosyaları okunamadı: " + portalFilesResult.error.message);
  if (!portalSetupMissing && portalPaymentResult.error) throw new Error("Ödeme durumu okunamadı: " + portalPaymentResult.error.message);
  type PortalFileRow = { id: string; file_name: string; mime_type: string; size_bytes: number; note: string | null; access_rule: PortalAccessRule; created_at: string; uploaded_by: string | null };
  const portalFileRows = (portalSetupMissing ? [] : portalFilesResult.data ?? []) as PortalFileRow[];
  const uploaderIds = [...new Set(portalFileRows.map((file) => file.uploaded_by).filter((value): value is string => Boolean(value)))];
  const { data: uploaderData } = uploaderIds.length
    ? await supabase.from("hr_employees").select("user_id,full_name").eq("organization_id", organizationId).in("user_id", uploaderIds)
    : { data: [] };
  const uploaderNames = new Map(((uploaderData ?? []) as { user_id: string; full_name: string }[]).map((row) => [row.user_id, formatPersonName(row.full_name)]));
  const downloadCounts = new Map<string, number>();
  for (const row of (portalDownloadsResult.data ?? []) as { file_id: string | null }[]) {
    if (row.file_id) downloadCounts.set(row.file_id, (downloadCounts.get(row.file_id) ?? 0) + 1);
  }
  const portalFiles: StaffPortalFile[] = portalFileRows.map((file) => ({
    id: file.id,
    fileName: file.file_name,
    mimeType: file.mime_type,
    sizeBytes: Number(file.size_bytes),
    note: file.note,
    accessRule: file.access_rule,
    createdLabel: formatDate(file.created_at, true),
    uploaderName: (file.uploaded_by && uploaderNames.get(file.uploaded_by)) || "Ekip üyesi",
    downloads: downloadCounts.get(file.id) ?? 0,
  }));
  const paymentRow = (Array.isArray(portalPaymentResult.data) ? portalPaymentResult.data[0] : portalPaymentResult.data) as
    { has_contract: boolean; settled: boolean; total_amount: number | null; paid_amount: number | null; remaining_amount: number | null } | undefined;
  const portalPayment: StaffPortalPayment = {
    hasContract: Boolean(paymentRow?.has_contract ?? contract),
    settled: Boolean(paymentRow?.settled),
    // Tutarlar yalnızca yöneticilere döner (SQL de aynı kuralı uygular).
    remainingLabel: paymentRow?.remaining_amount != null ? moneyFormat.format(Number(paymentRow.remaining_amount) / 100) : null,
    paidPercent: paymentRow?.total_amount ? Math.min(100, Math.max(0, Math.round((Number(paymentRow.paid_amount ?? 0) / Number(paymentRow.total_amount)) * 100))) : null,
  };
  const portalDownloadsConfigured = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  const opportunity = opportunityResult.data as Opportunity | null;
  const proposal = proposalResult.data as Proposal | null;
  const comments = (commentsResult.data ?? []) as Comment[];
  const customerName = formatPersonName(opportunity?.customer_name || workflow.customer_name) || "Kurum içi iş";
  const contactLine = formatPhone(opportunity?.contact_phone) || opportunity?.contact_email || "İletişim bilgisi yok";
  const due = dueInfo(workflow.due_date, workflow.status);
  const activities: Activity[] = [
    { id: `created-${workflow.id}`, title: "İş akışı oluşturuldu", detail: customerName, at: workflow.created_at, kind: "created" as const },
    ...steps.filter((step) => step.completed_at).map((step) => ({ id: `step-${step.id}`, title: "Görev tamamlandı", detail: step.title, at: step.completed_at!, kind: "step" as const })),
    ...comments.map((comment) => ({ id: `comment-${comment.id}`, title: "Yorum eklendi", detail: comment.body.length > 90 ? `${comment.body.slice(0, 90)}…` : comment.body, at: comment.created_at, kind: "comment" as const })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  return (
    <div className="opd">
      <MarkCustomerMessagesRead workflowId={workflow.id} unread={unreadCustomerMessages} />

      <header className="opd-hero">
        <div className="opd-hero-main">
          <Link className="opd-back" href={isArchived ? "/panel/operations/arsiv" : "/panel/operations/isler"}>{isArchived ? "‹ Arşiv" : "‹ İşler"}</Link>
          <small className="panel-kicker">OPERASYON · İŞ DETAYI</small>
          <h1>{formatSubject(workflow.title)}</h1>
          <p>{customerName}{contract?.contract_no ? ` · ${contract.contract_no}` : ""}{workflow.description ? ` — ${workflow.description}` : ""}</p>
          <div className="opd-pills">
            <span className="status-pill" data-tone={statusTone(workflow.status)}>{statusNames[workflow.status] ?? workflow.status}</span>
            <span className="status-pill" data-tone={priorityTones[workflow.priority] ?? "neutral"}>Öncelik: {priorityNames[workflow.priority] ?? workflow.priority}</span>
            {due.late ? <span className="status-pill" data-tone="danger">Termin geçti</span> : null}
          </div>
        </div>
        <div className="panel-page-actions">
          {canAssign ? (
            <PanelDrawer triggerLabel="Sorumlu ata" kicker="OPERASYON" title={formatSubject(workflow.title)} description="Bu işi yürütecek personeli seçin." triggerClassName="panel-secondary">
              <form className="panel-form" action={assignWorkflow}>
                <input type="hidden" name="workflow_id" value={workflow.id} />
                <label className="wide">Operasyon sorumlusu
                  <select name="assigned_employee_id" defaultValue={workflow.assigned_employee_id ?? ""}>
                    <option value="">Atanmamış</option>
                    {employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.full_name}</option>)}
                  </select>
                </label>
                <div className="wide panel-form-actions"><button className="panel-primary">Atamayı kaydet</button></div>
              </form>
            </PanelDrawer>
          ) : null}
          {canArchive && workflow.status === "completed" ? (
            <form action={archiveWorkflow}>
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <button type="submit" className="panel-secondary opd-archive-action"><OpsIcon name="archive" size={16} />Arşivle</button>
            </form>
          ) : null}
          {canArchive && isArchived ? (
            <form action={unarchiveWorkflow}>
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <button type="submit" className="panel-secondary opd-archive-action"><OpsIcon name="unarchive" size={16} />Arşivden çıkar</button>
            </form>
          ) : null}
          {canDelete ? (
            <form action={deleteWorkflow}>
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <ConfirmDeleteButton label="Sil" confirmMessage={`${workflow.title} işini kalıcı olarak silmek istediğinize emin misiniz?`} />
            </form>
          ) : null}
        </div>
      </header>

      {unreadCustomerMessages ? (
        <a className="opd-alert" href="#musteri-mesajlari">
          <span className="opd-alert-dot" aria-hidden="true" />
          <span><b>Müşteriden {unreadCustomerMessages} yeni mesaj var</b><small>Okuyup yanıtlamak için mesajlara gidin</small></span>
          <span aria-hidden="true">›</span>
        </a>
      ) : null}

      {isArchived ? (
        <div className="opd-archived" role="status">
          <span className="opd-archived-icon"><OpsIcon name="archive" /></span>
          <span><b>Bu iş arşivde</b><small>{formatDate(workflow.archived_at, true)} · {archiverName} · Aktif işler tablosunda görünmez.</small></span>
        </div>
      ) : null}

      <section className="opd-widgets">
        <article className="opd-widget" data-tone="info">
          <small>Müşteri</small>
          <strong>{customerName}</strong>
          <span>{contactLine}</span>
        </article>
        <article className="opd-widget" data-tone="success">
          <small>İlerleme</small>
          <strong>%{progress}</strong>
          <div className="opd-bar" aria-hidden="true"><i style={{ "--p": `${progress}%` } as CSSProperties} /></div>
          <span>{completedCount}/{steps.length} görev tamamlandı</span>
        </article>
        <article className="opd-widget" data-tone={due.tone} id="termin">
          <small>Termin</small>
          <strong>{workflow.due_date ? formatDate(workflow.due_date) : "Belirlenmedi"}</strong>
          <span>{due.hint}</span>
          {canEditDue ? (
            <form className="opd-due-form" action={setWorkflowDueDate}>
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <input type="date" name="due_date" defaultValue={workflow.due_date ?? ""} min={workflow.start_date ?? undefined} required aria-label="Termin tarihi" />
              <button className={workflow.due_date ? "panel-secondary" : "panel-primary"} type="submit">{workflow.due_date ? "Güncelle" : "Termin belirle"}</button>
            </form>
          ) : !workflow.due_date ? <span className="opd-note">Termini yönetici ya da işin sorumlusu belirleyebilir.</span> : null}
        </article>
        <article className="opd-widget" data-tone="brand">
          <small>Sorumlu</small>
          {assigneeRow ? (
            <strong className="opd-person"><i aria-hidden="true">{initials(assigneeRow.full_name)}</i>{formatPersonName(assigneeRow.full_name)}</strong>
          ) : <strong className="opd-muted">Atanmamış</strong>}
          <span>{assigneeRow?.job_title || (assigneeRow ? "Operasyon sorumlusu" : canAssign ? "Yukarıdan sorumlu atayın" : "Henüz kimse atanmadı")}</span>
        </article>
      </section>

      <div className="opd-grid">
        <div className="opd-main">
          <section className="opd-card">
            <header className="opd-card-head">
              <div><h2>Görevler</h2><p>{completedCount}/{steps.length} tamamlandı · tamamlamak için dokunun</p></div>
              <strong className="opd-big">%{progress}</strong>
            </header>
            <div className="opd-steps">
              {steps.map((step, index) => {
                /*
                  Adımın kendi gecikmesi. İşin termini bir tarihti; oysa
                  dokuz parçalı bir tezde geciken şey genelde iş değil, tek
                  bir bölüm oluyor ve o gecikme hiçbir yerde görünmüyordu.
                */
                const uyari = hatirlatmaDurumu(step, bugunIstanbul);
                const stepAssignee = step.assigned_employee_id ? employeeNames.get(step.assigned_employee_id) ?? null : null;
                return (
                  <div className={`opd-step${step.is_completed ? " is-done" : ""}`} key={step.id}>
                    <form action={toggleWorkflowStep}>
                      <input type="hidden" name="step_id" value={step.id} />
                      <input type="hidden" name="workflow_id" value={workflow.id} />
                      <input type="hidden" name="is_completed" value={String(!step.is_completed)} />
                      <button type="submit" aria-pressed={step.is_completed}>
                        <span className="opd-check" aria-hidden="true">{step.is_completed ? <CheckIcon /> : null}</span>
                        <span className="opd-step-body">
                          <b>{step.title}</b>
                          <small>
                            {step.is_completed
                              ? `Tamamlandı · ${formatDate(step.completed_at, true)}`
                              : step.due_date
                                ? `Adım ${index + 1} · Teslim ${formatDate(step.due_date)}`
                                : `Adım ${index + 1} · Tarih girilmedi`}
                          </small>
                        </span>
                        {uyari ? (
                          <span className="opd-step-flag" data-tone={uyari === "overdue" ? "danger" : "warning"}>
                            {uyari === "overdue" ? "Gecikti" : "Yaklaştı"}
                          </span>
                        ) : null}
                      </button>
                    </form>
                    {isArchived ? null : (
                      <div className="opd-step-meta">
                        <div className="opd-step-states" role="group" aria-label={`${step.title} durumu`}>
                          {STEP_STATUSES.map((value) => (
                            <form action={setStepStatus} key={value}>
                              <input type="hidden" name="step_id" value={step.id} />
                              <input type="hidden" name="status" value={value} />
                              <button type="submit" data-tone={STEP_STATUS_TONES[value]} className={step.status === value ? "is-active" : ""} aria-pressed={step.status === value}>
                                {STEP_STATUS_LABELS[value]}
                              </button>
                            </form>
                          ))}
                        </div>
                        {canEditDue ? (
                          <form action={setStepDueDate} className="opd-step-date">
                            <input type="hidden" name="step_id" value={step.id} />
                            <input type="date" name="due_date" defaultValue={step.due_date ?? ""} aria-label={`${step.title} teslim tarihi`} />
                            <button type="submit">Kaydet</button>
                          </form>
                        ) : step.due_date ? null : <span className="opd-step-hint">Tarihi yönetici ya da işin sorumlusu girer.</span>}
                        {canAssign ? (
                          <form action={assignStep} className="opd-step-who">
                            <input type="hidden" name="step_id" value={step.id} />
                            <select name="assigned_employee_id" defaultValue={step.assigned_employee_id ?? ""} aria-label={`${step.title} sorumlusu`}>
                              <option value="">Sorumlu yok</option>
                              {employees.map((employee) => (
                                <option key={employee.id} value={employee.id}>{formatPersonName(employee.full_name)}</option>
                              ))}
                            </select>
                            <button type="submit">Ata</button>
                          </form>
                        ) : stepAssignee ? <span className="opd-step-hint">Sorumlu: {formatPersonName(stepAssignee)}</span> : null}
                      </div>
                    )}
                  </div>
                );
              })}
              {!steps.length ? <p className="opd-empty">Henüz görev yok. Aşağıdan ilk görevi ekleyin.</p> : null}
            </div>
            {/* Sonradan gelen adım: tez bittikten sonra istenen sunum dosyası gibi. */}
            <form className="opd-add" action={addWorkflowStep}>
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <input name="title" required minLength={2} maxLength={180} placeholder="Yeni görev ekle" aria-label="Yeni görev" />
              <input type="date" name="due_date" aria-label="Yeni görevin teslim tarihi" />
              <button className="panel-primary" type="submit">Ekle</button>
            </form>
          </section>

          <section className="opd-card">
            <header className="opd-card-head"><div><h2>İş durumu</h2><p>{isArchived ? "Arşivdeki işin durumu değiştirilemez" : workflow.status === "completed" ? "İş tamamlandı; arşive gönderip aktif listeden kaldırabilirsiniz" : "Durumu tek dokunuşla değiştirin"}</p></div></header>
            {isArchived ? (
              <p className="opd-empty">Durumu değiştirmek için önce işi arşivden çıkarın; iş tamamlandı durumuna döner.</p>
            ) : (
            <div className="opd-segment" role="group" aria-label="İş durumu">
              {statusOptions.map(([value, label]) => (
                <form action={setWorkflowStatus} key={value}>
                  <input type="hidden" name="workflow_id" value={workflow.id} />
                  <input type="hidden" name="status" value={value} />
                  <button type="submit" className={workflow.status === value ? "is-active" : ""} data-tone={statusTone(value)} aria-pressed={workflow.status === value}>{label}</button>
                </form>
              ))}
            </div>
            )}
          </section>

          {portalSetupMissing ? (
            <section className="opd-card opd-pf" id="musteri-dosyalari">
              <header className="opd-card-head"><div><h2>Müşteri portalı dosyaları</h2><p>Müşterinin takip ekranındaki “Dosyalarınız” bölümü</p></div></header>
              <p className="opd-pf-banner" data-tone="warning" role="status"><b>Kurulum bekleniyor</b><span>Veritabanı güncellemesi (20260912203000_customer_portal_files) henüz çalıştırılmadı. Çalıştırıldığında dosya gönderimi burada açılır.</span></p>
            </section>
          ) : (
            <PortalFilesCard workflowId={workflow.id} organizationId={organizationId} payment={portalPayment} files={portalFiles} downloadsConfigured={portalDownloadsConfigured} />
          )}

          <section className="opd-card opd-messages" id="musteri-mesajlari">
            <header className="opd-card-head">
              <div><h2>Müşteri mesajları</h2><p>Müşterinin takip ekranından yazdıkları ve ekibin yanıtları</p></div>
              {unreadCustomerMessages ? <span className="status-pill" data-tone="danger">{unreadCustomerMessages} yeni</span> : <span className="status-pill">{customerMessages.length} mesaj</span>}
            </header>
            <div className="opd-chat">
              {customerMessages.length ? customerMessages.map((message) => {
                const isCustomer = message.sender_type === "customer";
                const isNew = isCustomer && !message.read_at;
                return (
                  <article className={`opd-bubble ${isCustomer ? "is-customer" : "is-staff"}${isNew ? " is-new" : ""}`} key={message.id}>
                    <header><b>{isCustomer ? customerName : formatPersonName(message.sender_name)}</b><time>{formatDate(message.created_at, true)}</time>{isNew ? <em>Yeni</em> : null}</header>
                    <p>{message.body}</p>
                  </article>
                );
              }) : <p className="opd-empty">Müşteriden henüz mesaj gelmedi. Takip kodunu paylaştığınızda müşteri buradan yazabilir.</p>}
            </div>
            {contract ? (
              <form className="opd-reply" action={replyCustomerFileMessage}>
                <input type="hidden" name="workflow_id" value={workflow.id} />
                <textarea name="body" required minLength={2} maxLength={2000} placeholder="Müşteriye yanıt yazın…" aria-label="Müşteriye yanıt" />
                <div><small>Yanıt müşterinin takip ekranında görünür.</small><button className="panel-primary" type="submit">Yanıtı gönder</button></div>
              </form>
            ) : <p className="opd-empty">Bu iş bir sözleşmeye bağlı olmadığı için müşteri mesajlaşması kapalı.</p>}
          </section>

          {/* Yalnızca iş akışı olayları. CRM zinciri bilerek dışarıda: teklif ve
              sözleşme güncellemeleri tutar bilgisi taşıyor, operasyon ekibi
              fiyat görmemeli. */}
          <RecordHistory workflowId={workflow.id} />
        </div>

        <aside className="opd-side">
          <section className="opd-card">
            <header className="opd-card-head"><div><h2>Bilgiler</h2></div></header>
            <dl className="opd-list">
              <div><dt>Sözleşme</dt><dd>{contract ? (canAssign ? <Link href={`/panel/crm/contracts/${contract.id}`}>{contract.contract_no}</Link> : contract.contract_no) : "Bağlı değil"}</dd></div>
              <div><dt>Takip kodu</dt><dd>{contract?.tracking_code ? <code>{contract.tracking_code}</code> : "—"}</dd></div>
              <div><dt>Sözleşme durumu</dt><dd>{contract?.status ? contractStatusLabel(contract.status) : "—"}</dd></div>
              <div><dt>Teklif</dt><dd>{proposal?.proposal_no || "Bağlı değil"}</dd></div>
              <div><dt>Teklif durumu</dt><dd>{proposal?.status ? proposalStatusLabel(proposal.status) : "—"}</dd></div>
              <div><dt>CRM aşaması</dt><dd>{opportunity?.stage ? (requestStageNames[opportunity.stage] ?? opportunity.stage) : "—"}</dd></div>
              <div><dt>E-posta</dt><dd>{opportunity?.contact_email || "—"}</dd></div>
              <div><dt>Başlangıç</dt><dd>{formatDate(workflow.start_date)}</dd></div>
              <div><dt>Oluşturulma</dt><dd>{formatDate(workflow.created_at, true)}</dd></div>
              <div><dt>Son güncelleme</dt><dd>{formatDate(workflow.updated_at, true)}</dd></div>
            </dl>
          </section>
          {contract?.opportunity_id ? <InternalComments opportunityId={contract.opportunity_id} contextType="operation" contextId={workflow.id} /> : null}
          <section className="opd-card">
            <header className="opd-card-head"><div><h2>Son hareketler</h2></div></header>
            <ul className="opd-activity">
              {activities.map((activity) => (
                <li key={activity.id} data-kind={activity.kind}>
                  <i aria-hidden="true">{activity.kind === "created" ? "+" : activity.kind === "step" ? <CheckIcon /> : "•"}</i>
                  <span><b>{activity.title}</b><small>{activity.detail}</small><time>{formatDate(activity.at, true)}</time></span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
