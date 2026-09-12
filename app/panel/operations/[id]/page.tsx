import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { InternalComments } from "../../crm/internal-comments";
import { RecordHistory } from "../../crm/record-history";
import { addWorkflowStep, archiveWorkflow, assignWorkflow, deleteWorkflow, replyCustomerFileMessage, setWorkflowDueDate, setWorkflowStatus, toggleWorkflowStep, unarchiveWorkflow } from "../actions";
import { OpsIcon } from "../ops-shared";
import { PanelDrawer } from "../../components/panel-drawer";
import { ConfirmDeleteButton } from "../../accounts/confirm-delete-button";
import { formatPersonName } from "@/lib/format-name";
import { formatPhone } from "@/lib/format-phone";
import { formatSubject, initials } from "@/lib/table-format";
import { statusTone } from "@/lib/status-tone";
import { contractStatusLabel, proposalStatusLabel } from "../../crm/status-labels";
import { requestStageNames } from "../../crm/request-status";
import { MarkCustomerMessagesRead } from "./mark-messages-read";
import "../operations.css";
import "../../crm/request-page.css";
import "./detail.css";

type Step = { id: string; title: string; is_completed: boolean; sort_order: number; completed_at: string | null; completed_by: string | null };
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
    .select("id,title,assigned_employee_id,customer_name,description,status,priority,start_date,due_date,created_at,updated_at,archived_at,archived_by,operation_steps(id,title,is_completed,sort_order,completed_at,completed_by)")
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
    canAssign ? supabase.from("hr_employees").select("id,full_name").eq("organization_id", organizationId).eq("employment_status", "active").order("full_name") : Promise.resolve({ data: [] }),
    isArchived && workflow.archived_by
      ? supabase.from("hr_employees").select("full_name").eq("organization_id", organizationId).eq("user_id", workflow.archived_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (customerMessagesError) throw new Error("Müşteri mesajları okunamadı: " + customerMessagesError.message);
  const customerMessages = (customerMessagesData ?? []) as CustomerMessage[];
  const unreadCustomerMessages = customerMessages.filter((message) => message.sender_type === "customer" && !message.read_at).length;
  const contract = contractData as Contract | null;
  const employees = (employeeData ?? []) as { id: string; full_name: string }[];
  const assigneeRow = assignee as { id: string; full_name: string; job_title: string | null } | null;
  // Termini yöneticiler ve işin sorumlusu girebilir (actions.ts ile aynı kural)
  const canEditDue = canAssign || Boolean((me as { id?: string } | null)?.id && (me as { id: string }).id === workflow.assigned_employee_id);
  // Arşivleme de aynı kural (actions.ts isManagerOrAssignee)
  const canArchive = canEditDue;
  const archiverName = isArchived ? (workflow.archived_by ? formatPersonName((archiver as { full_name?: string } | null)?.full_name) || "Ekip üyesi" : "Otomatik (ödeme kapandı)") : null;

  const [opportunityResult, proposalResult, commentsResult] = await Promise.all([
    contract?.opportunity_id
      ? supabase.from("crm_opportunities").select("customer_name,contact_email,contact_phone,title,stage").eq("id", contract.opportunity_id).eq("organization_id", organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    contract?.proposal_id
      ? supabase.from("crm_proposals").select("id,proposal_no,status").eq("id", contract.proposal_id).eq("organization_id", organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    contract?.opportunity_id
      ? supabase.from("crm_internal_comments").select("id,body,created_at,created_by,context_type").eq("organization_id", organizationId).eq("opportunity_id", contract.opportunity_id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if ("error" in commentsResult && commentsResult.error) throw new Error("Kurum içi yorumlar okunamadı: " + commentsResult.error.message);
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
              {steps.map((step, index) => (
                <form action={toggleWorkflowStep} className={`opd-step${step.is_completed ? " is-done" : ""}`} key={step.id}>
                  <input type="hidden" name="step_id" value={step.id} />
                  <input type="hidden" name="workflow_id" value={workflow.id} />
                  <input type="hidden" name="is_completed" value={String(!step.is_completed)} />
                  <button type="submit" aria-pressed={step.is_completed}>
                    <span className="opd-check" aria-hidden="true">{step.is_completed ? <CheckIcon /> : null}</span>
                    <span className="opd-step-body">
                      <b>{step.title}</b>
                      <small>{step.is_completed ? `Tamamlandı · ${formatDate(step.completed_at, true)}` : `Adım ${index + 1}`}</small>
                    </span>
                  </button>
                </form>
              ))}
              {!steps.length ? <p className="opd-empty">Henüz görev yok. Aşağıdan ilk görevi ekleyin.</p> : null}
            </div>
            <form className="opd-add" action={addWorkflowStep}>
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <input name="title" required minLength={2} maxLength={180} placeholder="Yeni görev ekle" aria-label="Yeni görev" />
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
