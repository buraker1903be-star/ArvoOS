import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { addWorkflowComment, addWorkflowStep, setWorkflowStatus, toggleWorkflowStep } from "../actions";
import "../operations.css";

type Step = {
  id: string;
  title: string;
  is_completed: boolean;
  sort_order: number;
  completed_at: string | null;
  completed_by: string | null;
};

type Workflow = {
  id: string;
  title: string;
  customer_name: string | null;
  description: string | null;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  operation_steps: Step[];
};

type Contract = {
  id: string;
  contract_no: string;
  proposal_id: string | null;
  opportunity_id: string;
  status: string;
  amount: number;
  currency: string;
};

type Opportunity = {
  customer_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  title: string | null;
  stage: string | null;
};

type Proposal = {
  id: string;
  proposal_no: string;
  status: string;
};

type Comment = {
  id: string;
  body: string;
  created_at: string;
  created_by: string | null;
};

const statusNames: Record<string, string> = {
  planned: "Planlandı",
  in_progress: "Devam ediyor",
  blocked: "Beklemede",
  completed: "Tamamlandı",
  cancelled: "İptal",
};

const priorityNames: Record<string, string> = {
  low: "Düşük",
  normal: "Normal",
  high: "Yüksek",
  urgent: "Acil",
};

const formatDate = (value?: string | null, withTime = false) => {
  if (!value) return "—";
  return new Date(value.includes("T") ? value : `${value}T12:00:00`).toLocaleString("tr-TR", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" });
};

const money = (value: number, currency: string) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: currency || "TRY",
}).format(Number(value || 0) / 100);

export default async function OperationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");

  const { data: workflowData, error: workflowError } = await supabase
    .from("operation_workflows")
    .select("id,title,customer_name,description,status,priority,start_date,due_date,created_at,updated_at,operation_steps(id,title,is_completed,sort_order,completed_at,completed_by)")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .single();

  if (workflowError || !workflowData) notFound();
  const workflow = workflowData as Workflow;
  const steps = [...(workflow.operation_steps ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const completedCount = steps.filter((step) => step.is_completed).length;
  const progress = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;

  const { data: contractData } = await supabase
    .from("crm_contracts")
    .select("id,contract_no,proposal_id,opportunity_id,status,amount,currency")
    .eq("workflow_id", workflow.id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  const contract = contractData as Contract | null;

  let opportunity: Opportunity | null = null;
  let proposal: Proposal | null = null;

  if (contract?.opportunity_id) {
    const { data } = await supabase
      .from("crm_opportunities")
      .select("customer_name,contact_email,contact_phone,title,stage")
      .eq("id", contract.opportunity_id)
      .eq("organization_id", membership.organization_id)
      .maybeSingle();
    opportunity = data as Opportunity | null;
  }

  if (contract?.proposal_id) {
    const { data } = await supabase
      .from("crm_proposals")
      .select("id,proposal_no,status")
      .eq("id", contract.proposal_id)
      .eq("organization_id", membership.organization_id)
      .maybeSingle();
    proposal = data as Proposal | null;
  }

  const { data: commentsData, error: commentsError } = await supabase
    .from("operation_workflow_comments")
    .select("id,body,created_at,created_by")
    .eq("workflow_id", workflow.id)
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false });
  if (commentsError) throw new Error("İş yorumları okunamadı: " + commentsError.message);
  const comments = (commentsData ?? []) as Comment[];

  return <div className="opd-page">
    <style>{`
      .opd-page{display:grid;gap:20px}.opd-back{width:max-content}.opd-hero{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:start;padding:24px;border:1px solid var(--panel-border,#e3e8ee);border-radius:18px;background:linear-gradient(145deg,#fff,#f7f9fb)}.opd-hero h1{margin:6px 0 8px;font-size:30px}.opd-hero p{margin:0;color:#667085;max-width:780px;line-height:1.6}.opd-badges{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}.opd-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(290px,.75fr);gap:20px;align-items:start}.opd-stack{display:grid;gap:20px}.opd-card{padding:22px;border:1px solid var(--panel-border,#e3e8ee);border-radius:16px;background:#fff}.opd-card h2{margin:0 0 16px;font-size:18px}.opd-progress-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:10px}.opd-progress-head strong{font-size:28px}.opd-progress-bar{height:10px;border-radius:99px;background:#edf1f5;overflow:hidden}.opd-progress-bar span{display:block;height:100%;background:#173f35;border-radius:inherit}.opd-checklist{display:grid;gap:10px;margin-top:18px}.opd-step form{margin:0}.opd-step button{width:100%;display:grid;grid-template-columns:28px 1fr auto;gap:12px;align-items:center;text-align:left;padding:14px;border:1px solid #e4e9ee;border-radius:12px;background:#fff}.opd-step button:hover{border-color:#b8c8c1}.opd-step button.completed{background:#f1f8f4;border-color:#b9dcc8}.opd-step i{width:24px;height:24px;border:1px solid #b7c2bc;border-radius:7px;display:grid;place-items:center;font-style:normal;color:#fff}.opd-step button.completed i{background:#17834f;border-color:#17834f}.opd-step b{font-size:13px}.opd-step small{display:block;margin-top:4px;color:#7a8690}.opd-add{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:14px}.opd-add input,.opd-comment-form textarea,.opd-status select{width:100%;border:1px solid #d7dee5;border-radius:10px;padding:11px 12px;background:#fff}.opd-add button,.opd-comment-form button,.opd-status button{border:0;border-radius:10px;padding:0 18px;background:#173f35;color:#fff;font-weight:750}.opd-info{display:grid;grid-template-columns:1fr 1fr;gap:12px}.opd-info div{padding:14px;border-radius:12px;background:#f7f9fb}.opd-info small{display:block;color:#7a8690;margin-bottom:5px}.opd-info strong{font-size:13px;word-break:break-word}.opd-links{display:grid;gap:10px}.opd-link{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #edf0f3}.opd-link:last-child{border-bottom:0}.opd-status{display:grid;grid-template-columns:1fr auto;gap:8px}.opd-comments{display:grid;gap:12px}.opd-comment{padding:14px;border:1px solid #e5e9ed;border-radius:12px;background:#fbfcfd}.opd-comment p{margin:0;white-space:pre-wrap;line-height:1.55}.opd-comment footer{margin-top:9px;color:#7a8690;font-size:12px}.opd-comment-form{display:grid;gap:10px}.opd-comment-form textarea{min-height:110px;resize:vertical}.opd-comment-form button{height:42px}.opd-empty{padding:20px;text-align:center;color:#7a8690;border:1px dashed #d6dde3;border-radius:12px}@media(max-width:950px){.opd-layout{grid-template-columns:1fr}.opd-hero{grid-template-columns:1fr}.opd-badges{justify-content:flex-start}}@media(max-width:620px){.opd-info{grid-template-columns:1fr}.opd-step button{grid-template-columns:28px 1fr}.opd-step button>small{grid-column:2}}
    `}</style>

    <Link className="panel-secondary opd-back" href="/panel/operations">← İşlere dön</Link>

    <section className="opd-hero">
      <div>
        <small className="panel-kicker">İŞ DETAYI</small>
        <h1>{workflow.title}</h1>
        <p>{workflow.description || "Bu iş için açıklama eklenmemiş."}</p>
      </div>
      <div className="opd-badges">
        <span className="status-pill">{statusNames[workflow.status] ?? workflow.status}</span>
        <span className={`priority priority-${workflow.priority}`}>{priorityNames[workflow.priority] ?? workflow.priority}</span>
        <span className="status-pill">%{progress} tamamlandı</span>
      </div>
    </section>

    <div className="opd-layout">
      <div className="opd-stack">
        <section className="opd-card">
          <div className="opd-progress-head"><div><small className="panel-kicker">GÖREVLER / AŞAMALAR</small><h2>{completedCount} / {steps.length} tamamlandı</h2></div><strong>%{progress}</strong></div>
          <div className="opd-progress-bar"><span style={{ width: `${progress}%` }} /></div>
          <div className="opd-checklist">
            {steps.map((step) => <div className="opd-step" key={step.id}>
              <form action={toggleWorkflowStep}>
                <input type="hidden" name="step_id" value={step.id}/>
                <input type="hidden" name="workflow_id" value={workflow.id}/>
                <input type="hidden" name="is_completed" value={String(!step.is_completed)}/>
                <button className={step.is_completed ? "completed" : ""} type="submit">
                  <i>{step.is_completed ? "✓" : ""}</i>
                  <span><b>{step.title}</b><small>{step.is_completed ? `Tamamlandı: ${formatDate(step.completed_at, true)}` : "Tamamlanmayı bekliyor"}</small></span>
                  <small>{step.completed_by ? "Sorumlu kayıtlı" : "Sorumlu atanmamış"}</small>
                </button>
              </form>
            </div>)}
          </div>
          <form className="opd-add" action={addWorkflowStep}>
            <input type="hidden" name="workflow_id" value={workflow.id}/>
            <input name="title" required minLength={2} maxLength={180} placeholder="Yeni görev ekle"/>
            <button type="submit">Ekle</button>
          </form>
        </section>

        <section className="opd-card">
          <h2>Yorumlar ve İş Günlüğü</h2>
          <form className="opd-comment-form" action={addWorkflowComment}>
            <input type="hidden" name="workflow_id" value={workflow.id}/>
            <textarea name="body" required minLength={1} maxLength={2000} placeholder="Yapılan işlemi, müşteri görüşmesini veya ekip notunu yazın..."/>
            <button type="submit">Yorum Ekle</button>
          </form>
          <div className="opd-comments" style={{ marginTop: 18 }}>
            {comments.length ? comments.map((comment) => <article className="opd-comment" key={comment.id}>
              <p>{comment.body}</p>
              <footer>{formatDate(comment.created_at, true)} · Ekip üyesi</footer>
            </article>) : <div className="opd-empty">Henüz yorum eklenmemiş.</div>}
          </div>
        </section>
      </div>

      <aside className="opd-stack">
        <section className="opd-card">
          <h2>Müşteri Bilgileri</h2>
          <div className="opd-info">
            <div><small>Müşteri</small><strong>{opportunity?.customer_name || workflow.customer_name || "Kurum içi iş"}</strong></div>
            <div><small>Telefon</small><strong>{opportunity?.contact_phone || "—"}</strong></div>
            <div><small>E-posta</small><strong>{opportunity?.contact_email || "—"}</strong></div>
            <div><small>CRM Aşaması</small><strong>{opportunity?.stage || "—"}</strong></div>
          </div>
        </section>

        <section className="opd-card">
          <h2>İş Bilgileri</h2>
          <div className="opd-info">
            <div><small>Başlangıç</small><strong>{formatDate(workflow.start_date)}</strong></div>
            <div><small>Termin</small><strong>{formatDate(workflow.due_date)}</strong></div>
            <div><small>Oluşturulma</small><strong>{formatDate(workflow.created_at, true)}</strong></div>
            <div><small>Son Güncelleme</small><strong>{formatDate(workflow.updated_at, true)}</strong></div>
          </div>
        </section>

        <section className="opd-card">
          <h2>Bağlı Kayıtlar</h2>
          <div className="opd-links">
            <div className="opd-link"><span>Sözleşme</span><strong>{contract?.contract_no || "Bağlı değil"}</strong></div>
            <div className="opd-link"><span>Sözleşme durumu</span><strong>{contract?.status || "—"}</strong></div>
            <div className="opd-link"><span>Teklif</span><strong>{proposal?.proposal_no || "Bağlı değil"}</strong></div>
            <div className="opd-link"><span>Teklif durumu</span><strong>{proposal?.status || "—"}</strong></div>
            <div className="opd-link"><span>Sözleşme bedeli</span><strong>{contract ? money(contract.amount, contract.currency) : "—"}</strong></div>
          </div>
        </section>

        <section className="opd-card">
          <h2>İş Durumu</h2>
          <form className="opd-status" action={setWorkflowStatus}>
            <input type="hidden" name="workflow_id" value={workflow.id}/>
            <select name="status" defaultValue={workflow.status}>
              <option value="planned">Planlandı</option>
              <option value="in_progress">Devam ediyor</option>
              <option value="blocked">Beklemede</option>
              <option value="completed">Tamamlandı</option>
              <option value="cancelled">İptal</option>
            </select>
            <button type="submit">Güncelle</button>
          </form>
        </section>
      </aside>
    </div>
  </div>;
}
