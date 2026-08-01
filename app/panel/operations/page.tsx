import { getPanelContext } from "@/lib/panel-context";
import { addWorkflowStep, createWorkflow, setWorkflowStatus, toggleWorkflowStep } from "./actions";
import "./operations.css";

const statusNames: Record<string, string> = {
  planned: "Planlandı",
  in_progress: "Devam ediyor",
  blocked: "Beklemede",
  completed: "Tamamlandı",
  cancelled: "İptal",
};
const priorityNames: Record<string, string> = { low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" };

type Step = { id: string; title: string; is_completed: boolean; sort_order: number };
type Workflow = {
  id: string; title: string; customer_name: string | null; description: string | null;
  status: string; priority: string; start_date: string | null; due_date: string | null;
  created_at: string; operation_steps: Step[];
};

export default async function OperationsPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");

  const { data, error } = await supabase.from("operation_workflows")
    .select("id,title,customer_name,description,status,priority,start_date,due_date,created_at,operation_steps(id,title,is_completed,sort_order)")
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false });

  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  const workflows = (data ?? []) as Workflow[];
  const activeCount = workflows.filter((item) => item.status === "in_progress").length;
  const blockedCount = workflows.filter((item) => item.status === "blocked").length;
  const completedCount = workflows.filter((item) => item.status === "completed").length;
  const allSteps = workflows.flatMap((item) => item.operation_steps ?? []);
  const progress = allSteps.length ? Math.round(allSteps.filter((step) => step.is_completed).length / allSteps.length * 100) : 0;

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">OPERASYON VE İŞ AKIŞLARI</small><h1>İşlerin ilerlemesini canlı yönetin</h1><p>İşi oluşturun, adımlara bölün; tamamlanan her madde ilerleme oranına otomatik yansısın.</p></div>
      <span className="status-pill">{workflows.length} iş akışı</span>
    </div>

    <section className="ops-metrics">
      <article><small>DEVAM EDEN</small><strong>{activeCount}</strong><span>Aktif iş akışı</span></article>
      <article><small>BEKLEYEN</small><strong>{blockedCount}</strong><span>Aksiyon gerekiyor</span></article>
      <article><small>TAMAMLANAN</small><strong>{completedCount}</strong><span>Kapanan işler</span></article>
      <article><small>GENEL İLERLEME</small><strong>%{progress}</strong><span>Adım bazlı hesaplama</span></article>
    </section>

    <section className="ops-layout">
      <article className="panel-card ops-create">
        <small>YENİ İŞ AKIŞI</small><h3>Operasyona iş ekle</h3>
        <form className="panel-form" action={createWorkflow}>
          <label className="wide">İş başlığı<input name="title" required minLength={2} maxLength={180} placeholder="Örn. Müşteri teslimat süreci" /></label>
          <label className="wide">Müşteri / kurum<input name="customer_name" maxLength={160} placeholder="İsteğe bağlı" /></label>
          <label>Öncelik<select name="priority" defaultValue="normal"><option value="low">Düşük</option><option value="normal">Normal</option><option value="high">Yüksek</option><option value="urgent">Acil</option></select></label>
          <label>Durum<select name="status" defaultValue="planned"><option value="planned">Planlandı</option><option value="in_progress">Devam ediyor</option><option value="blocked">Beklemede</option></select></label>
          <label>Başlangıç<input name="start_date" type="date" /></label>
          <label>Termin<input name="due_date" type="date" /></label>
          <label className="wide">Açıklama<textarea name="description" maxLength={1500} /></label>
          <label className="wide">İlk adımlar<textarea name="steps" placeholder={"Her satıra bir adım yazın\nÖrn. İhtiyaç analizi\nTeklif onayı\nTeslimat"} /></label>
          <button className="panel-primary wide" type="submit">İş akışını oluştur</button>
        </form>
      </article>

      <section className="ops-list">
        {workflows.length ? workflows.map((workflow) => {
          const steps = [...(workflow.operation_steps ?? [])].sort((a,b) => a.sort_order - b.sort_order);
          const done = steps.filter((step) => step.is_completed).length;
          const percentage = steps.length ? Math.round(done / steps.length * 100) : 0;
          return <article className="panel-card ops-workflow" key={workflow.id}>
            <div className="ops-workflow-head">
              <div><small>{priorityNames[workflow.priority] ?? workflow.priority} ÖNCELİK</small><h3>{workflow.title}</h3><p>{workflow.customer_name || "Kurum içi iş"}{workflow.due_date ? " · Termin " + new Date(workflow.due_date + "T00:00:00").toLocaleDateString("tr-TR") : ""}</p></div>
              <span className={"ops-status status-" + workflow.status}>{statusNames[workflow.status] ?? workflow.status}</span>
            </div>
            <div className="ops-progress"><div><span style={{ width: percentage + "%" }} /></div><b>%{percentage}</b><small>{done}/{steps.length} adım</small></div>
            {workflow.description ? <p className="ops-description">{workflow.description}</p> : null}
            <div className="ops-steps">
              {steps.map((step) => <form action={toggleWorkflowStep} key={step.id}>
                <input type="hidden" name="step_id" value={step.id} />
                <input type="hidden" name="is_completed" value={String(!step.is_completed)} />
                <button className={step.is_completed ? "completed" : ""} type="submit"><i>{step.is_completed ? "✓" : ""}</i><span>{step.title}</span></button>
              </form>)}
              {!steps.length ? <p>Henüz adım eklenmedi.</p> : null}
            </div>
            <div className="ops-actions">
              <form className="ops-add-step" action={addWorkflowStep}><input type="hidden" name="workflow_id" value={workflow.id} /><input name="title" required minLength={2} maxLength={180} placeholder="Yeni adım" /><button type="submit">Adım ekle</button></form>
              <form action={setWorkflowStatus}><input type="hidden" name="workflow_id" value={workflow.id} /><select name="status" defaultValue={workflow.status}><option value="planned">Planlandı</option><option value="in_progress">Devam ediyor</option><option value="blocked">Beklemede</option><option value="completed">Tamamlandı</option><option value="cancelled">İptal</option></select><button type="submit">Durumu kaydet</button></form>
            </div>
          </article>;
        }) : <div className="panel-card panel-empty">Henüz iş akışı yok. İlk işi soldaki formdan oluşturun.</div>}
      </section>
    </section>
  </>;
}
