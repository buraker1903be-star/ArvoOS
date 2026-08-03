import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { moveOpportunity } from "./actions";
import { createProposal } from "./sales-actions";
import { RequestEntryForm } from "./request-entry-form";
import "./crm.css";

type SearchParams = Promise<{ arama?: string; durum?: string }>;
type Stage = { code: string; name: string; probability: number; is_terminal: boolean; sort_order?: number };
type RequestDetails = { service_type?: string; academic_level?: string; university?: string; department?: string; language?: string; scope?: string };
type Opportunity = { id:string; title:string; customer_name:string; contact_email:string|null; contact_phone:string|null; stage:string; estimated_value:number; probability:number; expected_close_date:string|null; source:string|null; notes:string|null; lost_reason:string|null; request_details:RequestDetails|null; updated_at:string };

const defaultColumns: Stage[] = [
  { code:"lead",name:"Yeni",probability:10,is_terminal:false },{ code:"qualified",name:"İnceleniyor",probability:25,is_terminal:false },
  { code:"proposal",name:"Teklif Hazırlanıyor",probability:50,is_terminal:false },{ code:"contract",name:"Sözleşme",probability:70,is_terminal:false },
  { code:"payment",name:"Tahsilat",probability:90,is_terminal:false },{ code:"won",name:"Kabul Edildi",probability:100,is_terminal:true },
  { code:"lost",name:"Vazgeçildi",probability:0,is_terminal:true },
];
const money=(value:number)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:0}).format(value/100);
const clean=(value?:string)=>(value??"").trim().replace(/\s+/g," ").slice(0,100);

export default async function RequestsPage({searchParams}:{searchParams:SearchParams}){
  const {arama:rawSearch,durum:rawStage}=await searchParams;
  const search=clean(rawSearch).toLocaleLowerCase("tr-TR"); const selectedStage=clean(rawStage);
  const {supabase,membership,modules}=await getPanelContext();
  if(!modules.some((module)=>module.code==="crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const [{data,error},{data:configuredStages,error:stageError}]=await Promise.all([
    supabase.from("crm_opportunities").select("id,title,customer_name,contact_email,contact_phone,stage,estimated_value,probability,expected_close_date,source,notes,lost_reason,request_details,updated_at").eq("organization_id",membership.organization_id).order("updated_at",{ascending:false}),
    supabase.from("organization_crm_stages").select("code,name,probability,sort_order,is_terminal").eq("organization_id",membership.organization_id).eq("is_active",true).order("sort_order"),
  ]);
  if(error) throw new Error("Talepler okunamadı: "+error.message); if(stageError) throw new Error("Talep durumları okunamadı: "+stageError.message);
  const stages=((configuredStages?.length?configuredStages:defaultColumns)??[]) as Stage[]; const stageMap=new Map(stages.map((s)=>[s.code,s]));
  const academicMode=stages.some((s)=>s.code==="academic_review"); const terminalCodes=new Set(stages.filter((s)=>s.is_terminal).map((s)=>s.code)); const allRows=(data??[]) as Opportunity[];
  const rows=allRows.filter((item)=>{const haystack=[item.customer_name,item.title,item.contact_email,item.contact_phone,item.request_details?.service_type].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");return(!search||haystack.includes(search))&&(selectedStage==="tumu"?true:selectedStage?item.stage===selectedStage:!terminalCodes.has(item.stage));});
  const active=allRows.filter((i)=>!terminalCodes.has(i.stage)); const newRequests=allRows.filter((i)=>i.stage==="lead"); const archived=allRows.filter((i)=>terminalCodes.has(i.stage)); const activeValue=active.reduce((s,i)=>s+i.estimated_value,0);

  return <div className="crm-page-stack">
    <div className="panel-pagehead"><div><small className="panel-kicker">TALEP YÖNETİMİ</small><h1>Talepler</h1><p>Gelen başvuruları görüntüleyin, filtreleyin ve teklif aşamasına hazırlayın.</p></div><div className="panel-page-actions"><span className="status-pill">{rows.length} kayıt</span><PanelDrawer triggerLabel="+ Yeni talep" title={academicMode?"Talep Girişi":"Yeni talep"} description="Müşteri ve talep bilgilerini kaydedin."><RequestEntryForm academicMode={academicMode}/></PanelDrawer></div></div>
    <section className="crm-metrics"><article><small>YENİ TALEP</small><strong>{newRequests.length}</strong><span>İlk değerlendirmeyi bekliyor</span></article><article><small>AKTİF TALEP</small><strong>{active.length}</strong><span>Satış sürecinde</span></article><article><small>AKTİF DEĞER</small><strong>{money(activeValue)}</strong><span>Devam eden talepler</span></article><article><small>ARŞİV</small><strong>{archived.length}</strong><span>Kabul veya vazgeçilen</span></article></section>
    <section className="panel-card crm-filter-card"><form action="/panel/crm" method="get" className="crm-filter-form"><label><span>Müşteri / talep ara</span><input type="search" name="arama" defaultValue={rawSearch??""} placeholder="Müşteri, konu, telefon veya e-posta"/></label><label><span>Durum</span><select name="durum" defaultValue={selectedStage}><option value="">Aktif Talepler</option><option value="tumu">Tüm Kayıtlar</option>{stages.map((s)=><option value={s.code} key={s.code}>{s.name}</option>)}</select></label><div><button className="panel-primary" type="submit">Filtrele</button><a className="panel-secondary" href="/panel/crm">Temizle</a></div></form></section>
    <section className="crm-record-list">{rows.map((item)=>{const details=item.request_details??{};const stage=stageMap.get(item.stage);const proposalForm=<form className="panel-form" action={createProposal}><input type="hidden" name="opportunity_id" value={item.id}/><label>Teklif başlığı<input name="title" required defaultValue={item.title}/></label><label>Teklif tutarı<input name="amount" type="number" min="0" step="0.01" required defaultValue={(item.estimated_value/100).toFixed(2)}/></label><label className="wide">Hizmet kapsamı<textarea name="scope" required defaultValue={details.scope||item.notes||item.title}/></label><label>Ödeme planı<input name="payment_plan" placeholder="Örn. %50 başlangıç, %50 teslim"/></label><label>Geçerlilik tarihi<input name="valid_until" type="date"/></label><div className="wide panel-form-actions"><button className="panel-primary" type="submit">Teklifi oluştur</button></div></form>;return <article className="panel-card crm-record" key={item.id}><div className="crm-record-main"><div className="crm-record-heading"><span className="crm-record-number">TLP-{item.id.slice(0,8).toUpperCase()}</span><span className="status-pill">{stage?.name??item.stage}</span></div><h2>{item.customer_name}</h2><h3>{item.title}</h3><div className="crm-record-meta"><span>{item.contact_phone||"Telefon yok"}</span><span>{item.contact_email||"E-posta yok"}</span><span>{item.source||"Kaynak belirtilmedi"}</span></div>{details.service_type?<p><b>{details.service_type}</b>{details.academic_level?` · ${details.academic_level}`:""}{details.university?` · ${details.university}`:""}</p>:null}{item.notes?<p>{item.notes}</p>:null}<div className="panel-page-actions"><PanelDrawer triggerLabel="Teklif oluştur" title={`${item.customer_name} için teklif`} description="Teklif bilgilerini düzenleyip müşteri paylaşım bağlantısını oluşturun.">{proposalForm}</PanelDrawer></div></div><aside className="crm-record-side"><small>BEKLENEN DEĞER</small><strong>{money(item.estimated_value)}</strong>{item.expected_close_date?<span>Teslim: {new Date(item.expected_close_date+"T00:00:00").toLocaleDateString("tr-TR")}</span>:<span>Teslim tarihi yok</span>}<form action={moveOpportunity}><input type="hidden" name="opportunity_id" value={item.id}/><label>Durum<select name="stage" defaultValue={item.stage}>{stages.map((o)=><option value={o.code} key={o.code}>{o.name}</option>)}</select></label><label>Kayıp nedeni<input name="lost_reason" placeholder="Vazgeçildiyse belirtin"/></label><button className="panel-secondary" type="submit">Güncelle</button></form></aside></article>})}{!rows.length?<section className="panel-card crm-empty-state"><h2>Eşleşen talep bulunamadı</h2><p>Arama ifadesini veya durum filtresini değiştirin.</p></section>:null}</section>
  </div>;
}
