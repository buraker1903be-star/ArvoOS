import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { addWorkflowComment, addWorkflowStep, replyCustomerFileMessage, setWorkflowStatus, toggleWorkflowStep } from "../actions";
import "../operations.css";

type Step={id:string;title:string;is_completed:boolean;sort_order:number;completed_at:string|null;completed_by:string|null};
type Workflow={id:string;title:string;customer_name:string|null;description:string|null;status:string;priority:string;start_date:string|null;due_date:string|null;created_at:string;updated_at:string;operation_steps:Step[]};
type Contract={id:string;contract_no:string;proposal_id:string|null;opportunity_id:string;status:string};
type Opportunity={customer_name:string;contact_email:string|null;contact_phone:string|null;title:string|null;stage:string|null};
type Proposal={id:string;proposal_no:string;status:string};
type Comment={id:string;body:string;created_at:string;created_by:string|null};
type CustomerMessage={id:string;sender_type:"customer"|"staff";sender_name:string;body:string;created_at:string;read_at:string|null};
type Activity={id:string;title:string;detail:string;at:string;kind:"created"|"step"|"comment"};

const statusNames:Record<string,string>={planned:"Planlandı",in_progress:"Devam ediyor",blocked:"Beklemede",completed:"Tamamlandı",cancelled:"İptal"};
const priorityNames:Record<string,string>={low:"Düşük",normal:"Normal",high:"Yüksek",urgent:"Acil"};
const formatDate=(value?:string|null,withTime=false)=>value?new Date(value.includes("T")?value:`${value}T12:00:00`).toLocaleString("tr-TR",withTime?{dateStyle:"medium",timeStyle:"short"}:{dateStyle:"medium"}):"—";

export default async function OperationDetailPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const {supabase,membership,modules}=await getPanelContext();
 if(!modules.some(module=>module.code==="operations"))throw new Error("Operasyon modülüne erişiminiz yok.");
 const {data:workflowData,error:workflowError}=await supabase.from("operation_workflows").select("id,title,customer_name,description,status,priority,start_date,due_date,created_at,updated_at,operation_steps(id,title,is_completed,sort_order,completed_at,completed_by)").eq("id",id).eq("organization_id",membership.organization_id).single();
 if(workflowError||!workflowData)notFound();
 const workflow=workflowData as Workflow;
 const steps=[...(workflow.operation_steps??[])].sort((a,b)=>a.sort_order-b.sort_order);
 const completedCount=steps.filter(step=>step.is_completed).length;
 const progress=steps.length?Math.round(completedCount/steps.length*100):0;
 const [{data:contractData},{data:commentsData,error:commentsError},{data:customerMessagesData,error:customerMessagesError}]=await Promise.all([
  supabase.from("crm_contracts").select("id,contract_no,proposal_id,opportunity_id,status").eq("workflow_id",workflow.id).eq("organization_id",membership.organization_id).maybeSingle(),
  supabase.from("operation_workflow_comments").select("id,body,created_at,created_by").eq("workflow_id",workflow.id).eq("organization_id",membership.organization_id).order("created_at",{ascending:false}),
  supabase.from("customer_file_messages").select("id,sender_type,sender_name,body,created_at,read_at").eq("workflow_id",workflow.id).eq("organization_id",membership.organization_id).order("created_at",{ascending:true}),
 ]);
 if(commentsError)throw new Error("İş yorumları okunamadı: "+commentsError.message);
 if(customerMessagesError)throw new Error("Müşteri mesajları okunamadı: "+customerMessagesError.message);
 const comments=(commentsData??[]) as Comment[];
 const customerMessages=(customerMessagesData??[]) as CustomerMessage[];
 const unreadCustomerMessages=customerMessages.filter(message=>message.sender_type==="customer"&&!message.read_at).length;
 const contract=contractData as Contract|null;
 let opportunity:Opportunity|null=null;
 let proposal:Proposal|null=null;
 const [opportunityResult,proposalResult]=await Promise.all([
  contract?.opportunity_id?supabase.from("crm_opportunities").select("customer_name,contact_email,contact_phone,title,stage").eq("id",contract.opportunity_id).eq("organization_id",membership.organization_id).maybeSingle():Promise.resolve({data:null}),
  contract?.proposal_id?supabase.from("crm_proposals").select("id,proposal_no,status").eq("id",contract.proposal_id).eq("organization_id",membership.organization_id).maybeSingle():Promise.resolve({data:null}),
 ]);
 opportunity=opportunityResult.data as Opportunity|null;
 proposal=proposalResult.data as Proposal|null;
 const customerName=opportunity?.customer_name||workflow.customer_name||"Kurum içi iş";
 const activities:Activity[]=[
  {id:`created-${workflow.id}`,title:"İş akışı oluşturuldu",detail:customerName,at:workflow.created_at,kind:"created" as const},
  ...steps.filter(step=>step.completed_at).map(step=>({id:`step-${step.id}`,title:"Görev tamamlandı",detail:step.title,at:step.completed_at!,kind:"step" as const})),
  ...comments.map(comment=>({id:`comment-${comment.id}`,title:"Yorum eklendi",detail:comment.body.length>90?`${comment.body.slice(0,90)}…`:comment.body,at:comment.created_at,kind:"comment" as const})),
 ].sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime()).slice(0,12);

 return <div className="ops-detail-page">
  <div className="panel-pagehead ops-detail-pagehead">
   <div><small className="panel-kicker">OPERASYON / İŞ DETAYI</small><h1>{workflow.title}</h1><p>{workflow.description||`${customerName} için oluşturulan iş akışı ve ekip çalışma alanı.`}</p></div>
   <div className="panel-page-actions"><Link className="panel-secondary" href="/panel/operations">← İşlere dön</Link><span className="status-pill">{statusNames[workflow.status]??workflow.status}</span><span className={`priority priority-${workflow.priority}`}>{priorityNames[workflow.priority]??workflow.priority}</span></div>
  </div>

  <section className="ops-detail-metrics">
   <article className="panel-card"><small>MÜŞTERİ</small><strong>{customerName}</strong><span>{opportunity?.contact_phone||"Telefon bilgisi yok"}</span></article>
   <article className="panel-card"><small>İLERLEME</small><strong>%{progress}</strong><span>{completedCount}/{steps.length} görev tamamlandı</span></article>
   <article className="panel-card"><small>BAŞLANGIÇ</small><strong>{formatDate(workflow.start_date)}</strong><span>İş başlangıç tarihi</span></article>
   <article className="panel-card"><small>TERMİN</small><strong>{formatDate(workflow.due_date)}</strong><span>Planlanan teslim tarihi</span></article>
  </section>

  <div className="ops-detail-layout">
   <div className="ops-detail-main">
    <section className="panel-card ops-detail-card ops-detail-workflow-card">
     <div className="ops-detail-section-head"><div><small className="panel-kicker">GÖREVLER / AŞAMALAR</small><h2>İş Akışı</h2></div><strong>%{progress}</strong></div>
     <div className="ops-progress ops-detail-progress"><div><span style={{width:`${progress}%`}}/></div><b>{completedCount}/{steps.length}</b></div>
     <div className="ops-detail-timeline">
      {steps.map((step,index)=><form action={toggleWorkflowStep} className={step.is_completed?"ops-detail-step completed":"ops-detail-step"} key={step.id}>
       <input type="hidden" name="step_id" value={step.id}/><input type="hidden" name="workflow_id" value={workflow.id}/><input type="hidden" name="is_completed" value={String(!step.is_completed)}/>
       <button type="submit"><i>{step.is_completed?"✓":index+1}</i><span><b>{step.title}</b><small>{step.is_completed?`Tamamlandı: ${formatDate(step.completed_at,true)}`:"Tamamlanmayı bekliyor"}</small></span><em>{step.completed_by?"Sorumlu kayıtlı":"Sorumlu atanmamış"}</em></button>
      </form>)}
     </div>
     <form className="ops-detail-add" action={addWorkflowStep}><input type="hidden" name="workflow_id" value={workflow.id}/><input name="title" required minLength={2} maxLength={180} placeholder="Yeni görev ekle"/><button className="panel-primary" type="submit">Görev Ekle</button></form>
    </section>

    <section className="panel-card ops-detail-card">
     <div className="ops-detail-section-head"><div><small className="panel-kicker">EKİP İLETİŞİMİ</small><h2>Yorumlar ve İş Günlüğü</h2></div><span className="status-pill">{comments.length} yorum</span></div>
     <form className="ops-detail-comment-form" action={addWorkflowComment}><input type="hidden" name="workflow_id" value={workflow.id}/><textarea name="body" required minLength={1} maxLength={2000} placeholder="Yapılan işlemi, müşteri görüşmesini veya ekip notunu yazın..."/><div><button className="panel-primary" type="submit">Yorum Ekle</button></div></form>
     <div className="ops-detail-comments">{comments.length?comments.map(comment=><article key={comment.id}><div className="ops-comment-avatar">E</div><div><header><strong>Ekip Üyesi</strong><time>{formatDate(comment.created_at,true)}</time></header><p>{comment.body}</p></div></article>):<div className="ops-column-empty">Henüz yorum eklenmemiş.</div>}</div>
    </section>

    <section className="panel-card ops-detail-card ops-customer-messages">
     <div className="ops-detail-section-head"><div><small className="panel-kicker">MÜŞTERİ İLETİŞİMİ</small><h2>Dosya Mesajları</h2></div><span className="status-pill">{unreadCustomerMessages?`${unreadCustomerMessages} yeni mesaj`:`${customerMessages.length} mesaj`}</span></div>
     <p className="ops-customer-message-note">Müşterinin takip ekranından gönderdiği sorular ve operasyon ekibinin yanıtları.</p>
     <div className="ops-customer-message-list">{customerMessages.length?customerMessages.map(message=><article className={message.sender_type==="customer"?"customer-message":"staff-message"} key={message.id}><header><strong>{message.sender_type==="customer"?"Müşteri":message.sender_name}</strong><time>{formatDate(message.created_at,true)}</time></header><p>{message.body}</p></article>):<div className="ops-column-empty">Müşteriden henüz mesaj gelmemiş.</div>}</div>
     {contract?<form className="ops-customer-reply-form" action={replyCustomerFileMessage}><input type="hidden" name="workflow_id" value={workflow.id}/><textarea name="body" required minLength={2} maxLength={2000} placeholder="Müşteriye dosyası hakkında yanıt yazın..."/><div><small>Yanıt müşterinin takip ekranında görünecektir.</small><button className="panel-primary" type="submit">Yanıtı Gönder</button></div></form>:null}
    </section>
   </div>

   <aside className="ops-detail-side">
    <section className="panel-card ops-detail-card"><small className="panel-kicker">MÜŞTERİ</small><h2>Müşteri Bilgileri</h2><dl className="ops-detail-list"><div><dt>Ad / Kurum</dt><dd>{customerName}</dd></div><div><dt>Telefon</dt><dd>{opportunity?.contact_phone||"—"}</dd></div><div><dt>E-posta</dt><dd>{opportunity?.contact_email||"—"}</dd></div><div><dt>CRM Aşaması</dt><dd>{opportunity?.stage||"—"}</dd></div></dl></section>
    <section className="panel-card ops-detail-card"><small className="panel-kicker">KAYITLAR</small><h2>Bağlı Kayıtlar</h2><dl className="ops-detail-list"><div><dt>Sözleşme</dt><dd>{contract?.contract_no||"Bağlı değil"}</dd></div><div><dt>Sözleşme Durumu</dt><dd>{contract?.status||"—"}</dd></div><div><dt>Teklif</dt><dd>{proposal?.proposal_no||"Bağlı değil"}</dd></div><div><dt>Teklif Durumu</dt><dd>{proposal?.status||"—"}</dd></div></dl></section>
    <section className="panel-card ops-detail-card"><small className="panel-kicker">YÖNETİM</small><h2>İş Durumu</h2><form className="ops-detail-status" action={setWorkflowStatus}><input type="hidden" name="workflow_id" value={workflow.id}/><select name="status" defaultValue={workflow.status}><option value="planned">Planlandı</option><option value="in_progress">Devam ediyor</option><option value="blocked">Beklemede</option><option value="completed">Tamamlandı</option><option value="cancelled">İptal</option></select><button className="panel-primary" type="submit">Güncelle</button></form></section>
    <section className="panel-card ops-detail-card"><small className="panel-kicker">AKTİVİTE</small><h2>Son Hareketler</h2><div className="ops-activity-list">{activities.map(activity=><article key={activity.id} className={`activity-${activity.kind}`}><i>{activity.kind==="created"?"＋":activity.kind==="step"?"✓":"•"}</i><div><strong>{activity.title}</strong><p>{activity.detail}</p><time>{formatDate(activity.at,true)}</time></div></article>)}</div></section>
    <section className="panel-card ops-detail-card"><small className="panel-kicker">ZAMAN</small><h2>İş Bilgileri</h2><dl className="ops-detail-list"><div><dt>Oluşturulma</dt><dd>{formatDate(workflow.created_at,true)}</dd></div><div><dt>Son Güncelleme</dt><dd>{formatDate(workflow.updated_at,true)}</dd></div></dl></section>
   </aside>
  </div>
 </div>;
}
