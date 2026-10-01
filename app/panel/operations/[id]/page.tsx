import Link from "next/link";
import { Fragment, Suspense, type CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { InternalComments } from "../../crm/internal-comments";
import { RecordHistory } from "../../crm/record-history";
import { tarihleriDagit } from "@/lib/tarih-dagitimi";
import { addWorkflowStep, archiveWorkflow, assignStep, assignWorkflow, deleteWorkflow, distributeStepDates, setStepDueDate, setRevisionDays, setStepStatus, setWaitingParty, setWorkflowDueDate, setWorkflowStatus, toggleWorkflowStep, unarchiveWorkflow } from "../actions";
import { IS_DURUM_ADLARI, STEP_STATUSES, STEP_STATUS_LABELS, STEP_STATUS_TONES, asamalaraBol, hatirlatmaDurumu, type StepStatus } from "@/lib/is-adimlari";
// Öncelik adları ve tonları ops-shared'da: burada ikinci bir kopyası vardı.
import { OpsIcon, dueBadge, priorityNames, priorityTones, todayIstanbul } from "../ops-shared";
import { PanelDrawer } from "../../components/panel-drawer";
import { PanelModal } from "../../components/panel-modal";
import { MusteriKunyesi } from "./musteri-kunyesi";
import type { Kunye } from "@/lib/musteri-kunyesi";
import { BEKLEYEN_TARAFLAR, BEKLEYEN_TARAF_ADLARI, BEKLEYEN_TARAF_TONLARI, beklemeOzeti, bekleyenTarafMi } from "@/lib/bekleyen-taraf";
import { REVIZYON_TONLARI, revizyonBilgisi, revizyonOzeti } from "@/lib/revizyon";
import { ConfirmDeleteButton } from "../../accounts/confirm-delete-button";
import { formatPersonName } from "@/lib/format-name";
import { formatPhone } from "@/lib/format-phone";
import { formatSubject, initials } from "@/lib/table-format";
import { statusTone } from "@/lib/status-tone";
import { contractStatusLabel, proposalStatusLabel } from "../../crm/status-labels";
import { requestStageNames } from "../../crm/request-status";
import { MarkCustomerMessagesRead } from "./mark-messages-read";
import { MusteriSohbeti } from "./musteri-sohbet";
import { AnindaForm, AnindaYedek } from "./aninda";
import { PortalFilesCard, type StaffPortalFile, type StaffPortalPayment } from "./portal-files";
import type { PortalAccessRule } from "../portal-files-shared";
import "../operations.css";
import "../../crm/request-page.css";
import "./detail.css";

type Step = { id: string; title: string; is_completed: boolean; sort_order: number; completed_at: string | null; completed_by: string | null; due_date: string | null; status: StepStatus; assigned_employee_id: string | null; phase_title: string | null };
type Workflow = { id: string; step_template_set: string | null; waiting_party: string; waiting_note: string | null; waiting_since: string | null; revision_days: number | null; delivered_at: string | null; revision_until: string | null; title: string; assigned_employee_id: string | null; customer_name: string | null; description: string | null; status: string; priority: string; start_date: string | null; due_date: string | null; created_at: string; updated_at: string; archived_at: string | null; archived_by: string | null; operation_steps: Step[] };
type Contract = { id: string; contract_no: string; proposal_id: string | null; opportunity_id: string; status: string; tracking_code: string | null; share_token: string | null };
type Opportunity = { customer_name: string; contact_email: string | null; contact_phone: string | null; title: string | null; stage: string | null; kunye: Kunye | null };
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
// Adlar tek kaynakta (lib/is-adimlari.ts): liste dört yerde ayrı yazılıydı.
const statusNames = IS_DURUM_ADLARI;
const moneyFormat = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

const formatDate = (value?: string | null, withTime = false) =>
  value
    ? new Intl.DateTimeFormat("tr-TR", withTime ? { timeZone: TZ, dateStyle: "medium", timeStyle: "short" } : { timeZone: TZ, dateStyle: "long" }).format(
        new Date(value.includes("T") ? value : `${value}T12:00:00`),
      )
    : "—";

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

export default async function OperationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sekme?: string; pencere?: string }>;
}) {
  const { id } = await params;
  const { sekme: istenenSekme, pencere: istenenPencere } = await searchParams;
  const { supabase, membership, modules, userId } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;
  const { data: workflowData, error: workflowError } = await supabase
    .from("operation_workflows")
    .select("id,title,assigned_employee_id,customer_name,description,status,priority,start_date,due_date,created_at,updated_at,archived_at,archived_by,step_template_set,waiting_party,waiting_note,waiting_since,revision_days,delivered_at,revision_until,operation_steps(id,title,is_completed,sort_order,completed_at,completed_by,due_date,status,assigned_employee_id,phase_title)")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();
  if (workflowError || !workflowData) notFound();
  const workflow = workflowData as Workflow;
  const steps = [...(workflow.operation_steps ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const completedCount = steps.filter((step) => step.is_completed).length;
  const progress = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;
  /*
    "Tarihleri dağıt" ÖNİZLEMESİ. Aynı saf fonksiyon sunucu işleminde de
    çalışıyor, yani düğmenin üstünde yazan sayı ile yapılacak iş birebir
    aynı. Tahmini ayrı hesaplamak ikisinin ayrışmasına açık kapı olurdu.
  */
  const dagitim = tarihleriDagit(steps, { baslangic: workflow.start_date, termin: workflow.due_date });
  /*
    AŞAMA BAŞLIKLARI. Müşterinin (AkademikMerkez) operasyon tablosu iki
    seviyeli: aşama ve altındaki görevler. Liste yine DÜZ basılıyor, başlık
    grubun ilk görevinin üstüne giriyor — görevlerin tek bir sırası var ve
    her biri kendi satırında duruyor; iç içe kutular tarih, sorumlu ve durum
    denetimlerini dar ekranda iyice sıkıştırırdı.
  */

  const bekleyenTaraf = bekleyenTarafMi(workflow.waiting_party) ? workflow.waiting_party : "us";

  const grupBaslari = new Map<string, { no: number | null; baslik: string; biten: number; toplam: number }>();
  for (const grup of asamalaraBol(steps)) {
    if (!grup.baslik) continue;
    grupBaslari.set(grup.adimlar[0].id, {
      no: grup.no,
      baslik: grup.baslik,
      biten: grup.adimlar.filter((adim) => adim.is_completed).length,
      toplam: grup.adimlar.length,
    });
  }
  const canAssign = ["owner", "admin", "manager"].includes(membership.role);
  const canDelete = ["owner", "admin"].includes(membership.role);

  const isArchived = workflow.status === "archived";
  const [{ data: contractData }, { data: customerMessagesData, error: customerMessagesError }, { data: assignee }, { data: me }, { data: employeeData }, { data: archiver }] = await Promise.all([
    supabase.from("ops_contracts").select("id,contract_no,proposal_id,opportunity_id,status,tracking_code,share_token").eq("workflow_id", workflow.id).eq("organization_id", organizationId).maybeSingle(),
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

  /*
    DERİN BAĞLANTI. Sekmeler kalktı; yerlerine ortada açılan pencereler
    geldi. Adres yine hangi pencerenin açılacağını söyleyebiliyor:
    genel bakıştaki "müşteri mesajı var" satırı buraya bağlanıyor.
    Eski ?sekme=musteri bağlantıları çalışmaya devam ediyor.
  */
  const acilacakPencere =
    istenenPencere === "evrak" || istenenPencere === "mesajlar" || istenenPencere === "kayitlar"
      ? istenenPencere
      : istenenSekme === "musteri"
        ? "mesajlar"
        : istenenSekme === "kayitlar"
          ? "kayitlar"
          : null;
  const contract = contractData as Contract | null;
  const employees = (employeeData ?? []) as { id: string; full_name: string }[];
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  // Saat bileşen gövdesinde okunmaz (react-hooks/purity); yardımcı ops-shared'da.
  const bugunIstanbul = todayIstanbul();
  /*
    Revizyon penceresi TÜRETİLMİŞ: teslim anı + gün sayısı (veritabanı
    yazıyor). Ekran yalnızca gün sayısını değiştirtiyor; elle tarih
    yazdırsaydık teslim ertelendiğinde o tarih sessizce yanlış kalırdı.
  */
  const revizyon = revizyonBilgisi(workflow.revision_until, bugunIstanbul);
  const revizyonYazi = revizyonOzeti(workflow.revision_until, bugunIstanbul);
  const assigneeRow = assignee as { id: string; full_name: string; job_title: string | null } | null;
  // Termini yöneticiler ve işin sorumlusu girebilir (actions.ts ile aynı kural)
  const canEditDue = canAssign || Boolean((me as { id?: string } | null)?.id && (me as { id: string }).id === workflow.assigned_employee_id);
  // Arşivleme de aynı kural (actions.ts isManagerOrAssignee)
  const canArchive = canEditDue;
  const archiverName = isArchived ? (workflow.archived_by ? formatPersonName((archiver as { full_name?: string } | null)?.full_name) || "Ekip üyesi" : "Otomatik (ödeme kapandı)") : null;

  const [opportunityResult, proposalResult, commentsResult, portalFilesResult, portalPaymentResult, portalDownloadsResult] = await Promise.all([
    contract?.opportunity_id
      ? supabase.from("ops_opportunities").select("customer_name,contact_email,contact_phone,title,stage,kunye").eq("id", contract.opportunity_id).eq("organization_id", organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    contract?.proposal_id
      ? supabase.from("ops_proposals").select("id,proposal_no,status").eq("id", contract.proposal_id).eq("organization_id", organizationId).maybeSingle()
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
  /*
    Termin ops-shared/dueBadge'den. Burada dördüncü bir kopya duruyordu
    ("İş tamamlandı", "Teslim tarihi girilmemiş", uzak termin yeşil) ve
    pano, işler, genel bakış hep başka cümle kuruyordu. Tek kaynak.
  */
  const due = dueBadge(workflow.due_date, bugunIstanbul, workflow.status);
  const activities: Activity[] = [
    { id: `created-${workflow.id}`, title: "İş akışı oluşturuldu", detail: customerName, at: workflow.created_at, kind: "created" as const },
    ...steps.filter((step) => step.completed_at).map((step) => ({ id: `step-${step.id}`, title: "Görev tamamlandı", detail: step.title, at: step.completed_at!, kind: "step" as const })),
    ...comments.map((comment) => ({ id: `comment-${comment.id}`, title: "Yorum eklendi", detail: comment.body.length > 90 ? `${comment.body.slice(0, 90)}…` : comment.body, at: comment.created_at, kind: "comment" as const })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  return (
    <div className="opd">
      <AnindaYedek />

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
        /* Çapa değil ADRES: mesajlar artık kapalı bir pencerenin içinde,
           #musteri-mesajlari hiçbir yere kaydırmaz. */
        <Link className="opd-alert" href={`/panel/operations/${workflow.id}?pencere=mesajlar`}>
          <span className="opd-alert-dot" aria-hidden="true" />
          <span><b>Müşteriden {unreadCustomerMessages} yeni mesaj var</b><small>Okuyup yanıtlamak için mesajlara gidin</small></span>
          <span aria-hidden="true">›</span>
        </Link>
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
          <span>{due.label}</span>
          {canEditDue ? (
            <form className="opd-due-form" action={setWorkflowDueDate}>
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <input key={workflow.due_date ?? "yok"} type="date" name="due_date" defaultValue={workflow.due_date ?? ""} min={workflow.start_date ?? undefined} required aria-label="Termin tarihi" />
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

      {/*
        DURUM ŞERİDİ. Burada üç segmentli denetim ve kendini paragraflarla
        açıklayan bir kart vardı; 300px yer kaplıyor, asıl iş olan görev
        listesini ekranın altına itiyordu. Oysa bu üç alan NADİREN değişir,
        sürekli GÖRÜNMESİ gerekir — kart değil şerit işi.

        Şerit yapışkan: görev listesinde aşağı inerken "top kimde" ve iş
        durumu gözden kaybolmuyor.
      */}
      <div className="opd-serit">
              <AnindaForm action={setWorkflowStatus} className="opd-ff">
                <input type="hidden" name="workflow_id" value={workflow.id} />
                <label className="opd-ff-etiket" htmlFor="is-durumu">Durum</label>
                <select key={workflow.status} id="is-durumu" name="status" defaultValue={workflow.status} disabled={isArchived} data-tone={statusTone(workflow.status)}>
                  {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </AnindaForm>

              <AnindaForm action={setWaitingParty} className="opd-ff opd-ff-genis">
                <input type="hidden" name="workflow_id" value={workflow.id} />
                <label className="opd-ff-etiket" htmlFor="bekleyen-taraf">Top kimde</label>
                <select key={bekleyenTaraf} id="bekleyen-taraf" name="waiting_party" defaultValue={bekleyenTaraf} disabled={isArchived} data-tone={BEKLEYEN_TARAF_TONLARI[bekleyenTaraf]}>
                  {BEKLEYEN_TARAFLAR.map((taraf) => (
                    <option key={taraf} value={taraf}>{BEKLEYEN_TARAF_ADLARI[taraf]}</option>
                  ))}
                </select>
                {/* "Ne bekleniyor" yalnızca top bizde değilken sorulur. */}
                {bekleyenTaraf === "us" ? null : (
                  <input key={workflow.waiting_note ?? "bos"} type="text" name="waiting_note" defaultValue={workflow.waiting_note ?? ""} maxLength={200} disabled={isArchived} placeholder="Ne bekleniyor?" aria-label="Beklenen şey" />
                )}
                <span className="opd-ff-not">{beklemeOzeti(bekleyenTaraf, workflow.waiting_since, bugunIstanbul)}</span>
              </AnindaForm>

              <AnindaForm action={setRevisionDays} className="opd-ff">
                <input type="hidden" name="workflow_id" value={workflow.id} />
                <label className="opd-ff-etiket" htmlFor="revizyon-gun">Revizyon</label>
                <select key={workflow.revision_days ?? "varsayilan"} id="revizyon-gun" name="revision_days" defaultValue={workflow.revision_days ? String(workflow.revision_days) : ""} disabled={isArchived}>
                  <option value="">Kurum varsayılanı</option>
                  {[30, 45, 60, 90, 180].map((gun) => <option key={gun} value={gun}>{gun} gün</option>)}
                </select>
        {revizyon && revizyonYazi ? <span className="opd-ff-not" data-tone={REVIZYON_TONLARI[revizyon.durum]}>{revizyonYazi}</span> : null}
        </AnindaForm>
      </div>

      {/*
        İKİ SÜTUN. Sekmeler bir şeyi çözmüş, bir şeyi bozmuştu: sayfa
        kısaldı ama operasyoncu görevleri işlerken müşterinin ne yazdığını
        ya da evrağın gidip gitmediğini göremiyordu — her biri bir tık
        ötede, aynı anda ikisi birden görünmüyor.

        Şimdi asıl iş (görevler) solda kalıcı; sağ ray "bu işte başka ne
        var" sorusunu tek bakışta yanıtlıyor. Nadiren açılan ama açılınca
        içinde vakit geçirilen üç ekran (evrak teslimi, müşteri
        mesajlaşması, kayıt geçmişi) sayfada yer tutmak yerine ortada
        açılan pencereye taşındı.
      */}
      <div className="opd-duzen">
          <section className="opd-card opd-gorevler">
            <header className="opd-card-head">
              <div><h2>Görevler</h2><p>{completedCount}/{steps.length} tamamlandı · tamamlamak için dokunun</p></div>
              <strong className="opd-big">%{progress}</strong>
            </header>
            {/*
              TARİHLERİ DAĞIT. Canlıda işlerin hiçbirinde aşama tarihi
              yoktu; tek tek girmek iş başına sekiz giriş demek ve kimse
              yapmıyordu. Elle girilmiş tarihler çapa olarak korunuyor,
              yani düğme daha önce yapılan planlamayı ezmiyor.
            */}
            {canEditDue && steps.length ? (
              <div className="opd-dagit">
                {dagitim.atamalar.length ? (
                  <>
                    <p>
                      Tarihsiz {dagitim.atamalar.length} aşama, işin{" "}
                      {workflow.start_date ? `${formatDate(workflow.start_date)} – ` : ""}
                      {formatDate(workflow.due_date)} takvimine dağıtılacak. Girilmiş tarihler korunuyor.
                      {dagitim.atlanan ? ` ${dagitim.atlanan} aşama için aralık tanımlı değil, tarihsiz kalacak.` : ""}
                    </p>
                    <form action={distributeStepDates}>
                      <input type="hidden" name="workflow_id" value={workflow.id} />
                      <button type="submit">Tarihleri dağıt</button>
                    </form>
                  </>
                ) : dagitim.atlanan ? (
                  <p>
                    {dagitim.atlanan} aşama tarihsiz.{" "}
                    {workflow.due_date
                      ? "Dağıtmak için aşamaların arasında bir aralık gerekiyor; işin başlangıç tarihini girin."
                      : "Dağıtmak için önce işin teslim tarihini girin."}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="opd-steps">
              {steps.map((step) => {
                /*
                  Adımın kendi gecikmesi. İşin termini bir tarihti; oysa
                  dokuz parçalı bir tezde geciken şey genelde iş değil, tek
                  bir bölüm oluyor ve o gecikme hiçbir yerde görünmüyordu.
                */
                const uyari = hatirlatmaDurumu(step, bugunIstanbul);
                const stepAssignee = step.assigned_employee_id ? employeeNames.get(step.assigned_employee_id) ?? null : null;
                const grup = grupBaslari.get(step.id);
                return (
                  <Fragment key={step.id}>
                    {grup ? (
                      <h3 className="opd-phase">
                        {grup.no ? <span className="opd-phase-no" aria-hidden="true">{grup.no}</span> : null}
                        <span className="opd-phase-name">{grup.baslik}</span>
                        <small>{grup.biten}/{grup.toplam} görev</small>
                      </h3>
                    ) : null}
                    <div className={`opd-step${step.is_completed ? " is-done" : ""}`}>
                      <form action={toggleWorkflowStep}>
                        <input type="hidden" name="step_id" value={step.id} />
                        <input type="hidden" name="workflow_id" value={workflow.id} />
                        <input type="hidden" name="is_completed" value={String(!step.is_completed)} />
                        <button type="submit" aria-pressed={step.is_completed}>
                          <span className="opd-check" aria-hidden="true">{step.is_completed ? <CheckIcon /> : null}</span>
                          <span className="opd-step-body">
                            <b>{step.title}</b>
                            {/*
                              Alt satır artık görevin ÖZETİ: durum, tarih,
                              sorumlu. Eskiden "Adım 7 · Teslim 12.10" yazıyordu;
                              sıra numarası aşama başlıkları gelince
                              gereksizleşti, durum ve sorumlu ise ancak satır
                              açılınca görünüyordu.
                            */}
                            {step.is_completed ? (
                              <small>Tamamlandı · {formatDate(step.completed_at, true)}</small>
                            ) : null}
                          </span>
                          {uyari ? (
                            <span className="opd-step-flag" data-tone={uyari === "overdue" ? "danger" : "warning"}>
                              {uyari === "overdue" ? "Gecikti" : "Yaklaştı"}
                            </span>
                          ) : null}
                        </button>
                      </form>
                      {isArchived ? null : (
                      /*
                        DENETİMLER SATIRIN İÇİNDE VE ANINDA KAYDEDİYOR.

                        Önce dört durum düğmesi + tarih formu + sorumlu
                        seçicisi vardı; her birinin kendi "Kaydet"i, hepsi
                        ayrı satırda. Bir görevi planlamak üç tıklama ve üç
                        sayfa gidiş-gelişi, yirmi görevde altmış tıklama
                        demekti. Sonra bunları açılır bölüme koydum; yer
                        kazandı ama tıklama sayısı arttı.

                        Şimdi üçü de satırın sağında, değişince kaydeden
                        alanlar. Durum dört düğme yerine tek seçim: dört
                        düğme 240px yer kaplıyor ve aynı anda yalnızca biri
                        anlamlı.
                      */
                      <div className="opd-step-meta">
                        <AnindaForm action={setStepStatus} className="opd-ff">
                          <input type="hidden" name="step_id" value={step.id} />
                          <select key={step.status} name="status" defaultValue={step.status} data-tone={STEP_STATUS_TONES[step.status]} aria-label={`${step.title} durumu`}>
                            {STEP_STATUSES.map((value) => (
                              <option key={value} value={value}>{STEP_STATUS_LABELS[value]}</option>
                            ))}
                          </select>
                        </AnindaForm>
                        {canEditDue ? (
                          <AnindaForm action={setStepDueDate} className="opd-ff">
                            <input type="hidden" name="step_id" value={step.id} />
                            <input key={step.due_date ?? "yok"} type="date" name="due_date" defaultValue={step.due_date ?? ""} aria-label={`${step.title} teslim tarihi`} />
                          </AnindaForm>
                        ) : null}
                        {canAssign ? (
                          <AnindaForm action={assignStep} className="opd-ff">
                            <input type="hidden" name="step_id" value={step.id} />
                            {/*
                            REACT 19 EYLEMDEN SONRA FORMU SIFIRLIYOR ve
                            kontrolsüz alanda sıfırlama MOUNT anındaki
                            değere dönüyor; defaultValue sonradan değişse
                            de DOM'u güncellemiyor. Sunucu doğru değeri
                            döndürüyordu ama ekran eskisini gösteriyor,
                            sayfa yenilenince düzeliyordu. key sunucudan
                            gelen değere bağlı: değer değişince alan
                            yeniden kuruluyor.
                          */}
                            <select key={step.assigned_employee_id ?? "yok"} name="assigned_employee_id" defaultValue={step.assigned_employee_id ?? ""} aria-label={`${step.title} sorumlusu`}>
                              <option value="">Sorumlu yok</option>
                              {employees.map((employee) => (
                                <option key={employee.id} value={employee.id}>{formatPersonName(employee.full_name)}</option>
                              ))}
                            </select>
                          </AnindaForm>
                        ) : stepAssignee ? <span className="opd-step-hint">{formatPersonName(stepAssignee)}</span> : null}
                      </div>
                      )}
                    </div>
                  </Fragment>
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

          <div className="opd-dugmeler">
            {/*
              MÜŞTERİ NİHAİ EVRAK TESLİMİ. Düğmenin rengi ödeme durumunu
              söylüyor: kırmızıysa müşterinin ödemesi kapanmamış ve
              "ödeme tamamlanınca açılır" kuralındaki dosyalar müşteride
              kilitli görünecek. Bunu öğrenmek için pencereyi açmak
              gerekmesin diye renk dışarıda.
            */}
            <PanelModal
              triggerClassName="opd-ray-btn opd-ray-btn-genis"
              triggerTone={!portalPayment.hasContract ? "neutral" : portalPayment.settled ? "success" : "danger"}
              triggerLabel="Müşteri Nihai Evrak Teslimi"
              triggerNote={
                !portalPayment.hasContract
                  ? "Sözleşmesiz iş"
                  : portalPayment.settled
                    ? `Ödeme tamamlandı · ${portalFiles.length} dosya`
                    : `Ödeme bekleniyor · ${portalFiles.length} dosya`
              }
              title="Müşteri nihai evrak teslimi"
              description="Müşterinin takip ekranındaki “Dosyalarınız” bölümüne giden dosyalar."
              kicker="OPERASYON"
              boy="genis"
              baslangicAcik={acilacakPencere === "evrak"}
            >
              {portalSetupMissing ? (
                <p className="opd-pf-banner" data-tone="warning" role="status"><b>Kurulum bekleniyor</b><span>Veritabanı güncellemesi (20260912203000_customer_portal_files) henüz çalıştırılmadı. Çalıştırıldığında dosya gönderimi burada açılır.</span></p>
              ) : (
                <PortalFilesCard workflowId={workflow.id} organizationId={organizationId} payment={portalPayment} files={portalFiles} downloadsConfigured={portalDownloadsConfigured} />
              )}
            </PanelModal>

            <div className="opd-ray-ikili">
              <PanelModal
                triggerClassName="opd-ray-btn"
                triggerTone={unreadCustomerMessages ? "danger" : "brand"}
                triggerLabel="Müşteri Mesajları"
                triggerBadge={unreadCustomerMessages ? String(unreadCustomerMessages) : null}
                triggerNote={customerMessages.length ? `${customerMessages.length} mesaj` : "Mesaj yok"}
                title="Müşteri mesajları"
                description="Müşterinin takip ekranından yazdıkları ve ekibin yanıtları."
                kicker="MÜŞTERİ"
                boy="sohbet"
                baslangicAcik={acilacakPencere === "mesajlar"}
              >
                {/*
                  Okundu işareti PENCERE AÇILINCA. Mesajlar sayfanın içinde
                  dururken sayfayı açmak okumak sayılıyordu; okunmamış
                  rozeti kimse görmeden sönüyordu. Pencere içeriği yalnızca
                  açıkken basıldığı için bu etki de yalnızca o an çalışır.
                */}
                <MarkCustomerMessagesRead workflowId={workflow.id} unread={unreadCustomerMessages} />
                <MusteriSohbeti
                  workflowId={workflow.id}
                  messages={customerMessages}
                  customerName={customerName}
                  canReply={Boolean(contract)}
                  bugun={bugunIstanbul}
                />
              </PanelModal>

              {/* Kayıt geçmişi okunur bir kayıt: rengi değişmiyor, bekleyen iş taşımıyor. */}
              <PanelModal
                triggerClassName="opd-ray-btn"
                triggerTone="neutral"
                triggerLabel="Kayıt Geçmişi"
                triggerNote={`${activities.length} hareket`}
                title="Kayıt geçmişi"
                description="İş akışının kendi olayları. Teklif ve sözleşme zinciri bilerek dışarıda: tutar bilgisi taşıyor."
                kicker="OPERASYON"
                boy="sohbet"
                baslangicAcik={acilacakPencere === "kayitlar"}
              >
                {/*
                  TEK KAYDIRICI, İKİ BÖLÜM. Önce iki liste başlıksız
                  art arda akıyordu ve "Kayıt geçmişi" iki kez
                  yazıyordu (pencere başlığı + listenin kendi başlığı).
                  Artık adları bölüm başlıklarında, kaydırma tek yerde.
                */}
                <div className="opd-kayit">
                  <h3 className="opd-kayit-baslik">Son hareketler <small>{activities.length}</small></h3>
                  <ul className="opd-activity">
                    {activities.map((activity) => (
                      <li key={activity.id} data-kind={activity.kind}>
                        <i aria-hidden="true">{activity.kind === "created" ? "+" : activity.kind === "step" ? <CheckIcon /> : "•"}</i>
                        <span><b>{activity.title}</b><small>{activity.detail}</small><time>{formatDate(activity.at, true)}</time></span>
                      </li>
                    ))}
                  </ul>
                  <h3 className="opd-kayit-baslik">Alan değişiklikleri</h3>
                  {/*
                    Suspense ŞART. Kayıt geçmişi kendi sorgularını yapıyor ve
                    pencere kapalıyken de sunucuda basılıyor (istemci bileşenine
                    çocuk olarak geçen sunucu bileşeni her zaman çalışır).
                  */}
                  <Suspense fallback={<p className="opd-empty">Yükleniyor…</p>}>
                    <RecordHistory workflowId={workflow.id} baslik={false} />
                  </Suspense>
                </div>
              </PanelModal>
            </div>
          </div>

          <aside className="opd-ray">
          <section className="opd-card opd-kunye">
          {/*
            Künye içerik olarak aynı kaldı, yeri değişti: görev listesinin
            altında değil sağ rayda. Katlanabilirliği duruyor ama varsayılan
            AÇIK — rayda yer var ve sözleşme numarasıyla takip kodu en çok
            bakılan iki alan.
          */}
          <details className="opd-katla" open>
              <summary>
                <span>Künye ve bağlantılar</span>
                <small>{contract?.contract_no ?? "Sözleşmesiz"}</small>
              </summary>
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
            </details>
          </section>

            {/*
              Künyenin hemen altında: operasyon sözleşmeyi ve teklifi
              göremiyor, müşteri hakkında bildikleri bu kart.
            */}
            <MusteriKunyesi
              kunye={(opportunity?.kunye ?? null) as Kunye | null}
              opportunityId={contract?.opportunity_id ?? null}
              workflowId={workflow.id}
              duzenlenebilir={canEditDue}
            />

            {/*
              KURUM İÇİ YORUMLAR SOHBET OLARAK. Müşteri mesajlarıyla yan
              yana durduğu için aynı kalıpta: eskiden yeniye sıralı,
              yazma alanı altta. İki ekran farklı göründüğünde hangisinin
              müşteriye gittiği karışıyordu.
            */}
            {contract?.opportunity_id ? (
              <InternalComments opportunityId={contract.opportunity_id} contextType="operation" contextId={workflow.id} gorunum="sohbet" />
            ) : null}
          </aside>
      </div>
    </div>
  );
}
