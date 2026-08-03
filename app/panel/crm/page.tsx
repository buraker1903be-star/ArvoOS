import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { archiveOpportunity, moveOpportunity, updateOpportunity } from "./actions";
import { createProposal } from "./sales-actions";
import { RequestEntryForm } from "./request-entry-form";
import { requestStageNames, requestStages } from "./request-status";
import "./crm.css";

type SearchParams = Promise<{ arama?: string; durum?: string }>;
type RequestDetails = { service_type?: string; academic_level?: string; university?: string; department?: string; language?: string; scope?: string };
type Opportunity = { id:string; title:string; customer_name:string; contact_email:string|null; contact_phone:string|null; stage:string; estimated_value:number; probability:number; expected_close_date:string|null; source:string|null; notes:string|null; lost_reason:string|null; request_details:RequestDetails|null; updated_at:string };

const clean=(value?:string)=>(value??"").trim().replace(/\s+/g," ").slice(0,100);
const activeStageCodes=new Set(["lead","qualified"]);

export default async function RequestsPage({searchParams}:{searchParams:SearchParams}){
  const {arama:rawSearch,durum:rawStage}=await searchParams;
  const search=clean(rawSearch).toLocaleLowerCase("tr-TR");
  const selectedStage=clean(rawStage);
  const {supabase,membership,modules}=await getPanelContext();
  if(!modules.some((module)=>module.code==="crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const [{data,error},{data:configuredStages,error:stageError}]=await Promise.all([
    supabase.from("crm_opportunities").select("id,title,customer_name,contact_email,contact_phone,stage,estimated_value,probability,expected_close_date,source,notes,lost_reason,request_details,updated_at").eq("organization_id",membership.organization_id).order("updated_at",{ascending:false}),
    supabase.from("organization_crm_stages").select("code").eq("organization_id",membership.organization_id).eq("is_active",true),
  ]);
  if(error) throw new Error("Talepler okunamadı: "+error.message);
  if(stageError) throw new Error("Talep ayarları okunamadı: "+stageError.message);
  const academicMode=(configuredStages??[]).some((stage)=>stage.code==="academic_review");
  const allRows=(data??[]) as Opportunity[];
  const rows=allRows.filter((item)=>{
    const haystack=[item.customer_name,item.title,item.contact_email,item.contact_phone,item.request_details?.service_type].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
    const stageMatches=selectedStage==="tumu"?true:selectedStage?item.stage===selectedStage:activeStageCodes.has(item.stage);
    return(!search||haystack.includes(search))&&stageMatches;
  });
  const newRequests=allRows.filter((item)=>item.stage==="lead").length;
  const reviewing=allRows.filter((item)=>item.stage==="qualified").length;
  const transferred=allRows.filter((item)=>item.stage==="proposal").length;
  const archived=allRows.filter((item)=>item.stage==="lost").length;

  return <div className="crm-page-stack">
    <div className="panel-pagehead"><div><small className="panel-kicker">TALEP YÖNETİMİ</small><h1>Talepler</h1><p>Yeni talepleri inceleyin, teklif aşamasına devredin veya iptal edilenleri arşivleyin.</p></div><div className="panel-page-actions"><span className="status-pill">{rows.length} kayıt</span><PanelDrawer triggerLabel="+ Yeni talep" title={academicMode?"Talep Girişi":"Yeni talep"} description="Müşteri ve talep bilgilerini kaydedin."><RequestEntryForm academicMode={academicMode}/></PanelDrawer></div></div>

    <section className="crm-metrics"><article><small>YENİ TALEP</small><strong>{newRequests}</strong><span>İlk değerlendirmeyi bekliyor</span></article><article><small>TALEP İNCELENİYOR</small><strong>{reviewing}</strong><span>İnceleme sürecinde</span></article><article><small>TEKLİFLERE DEVREDİLDİ</small><strong>{transferred}</strong><span>Teklifler bölümünde</span></article><article><small>ARŞİVLENDİ</small><strong>{archived}</strong><span>İptal edilen kayıtlar</span></article></section>

    <section className="panel-card crm-filter-card"><form action="/panel/crm" method="get" className="crm-filter-form"><label><span>Müşteri / talep ara</span><input type="search" name="arama" defaultValue={rawSearch??""} placeholder="Müşteri, konu, telefon veya e-posta"/></label><label><span>Durum</span><select name="durum" defaultValue={selectedStage}><option value="">Aktif Talepler</option><option value="tumu">Tüm Kayıtlar</option>{requestStages.map((stage)=><option value={stage.code} key={stage.code}>{stage.name}</option>)}</select></label><div><button className="panel-primary" type="submit">Filtrele</button><a className="panel-secondary" href="/panel/crm">Temizle</a></div></form></section>

    <section className="crm-record-list">{rows.map((item)=>{
      const details=item.request_details??{};
      const proposalForm=<form className="panel-form" action={createProposal}><input type="hidden" name="opportunity_id" value={item.id}/><label>Teklif başlığı<input name="title" required defaultValue={item.title}/></label><label>Teklif tutarı<input name="amount" type="number" min="0" step="0.01" required/></label><label className="wide">Hizmet kapsamı<textarea name="scope" required defaultValue={details.scope||item.notes||item.title}/></label><label>Ödeme planı<input name="payment_plan" placeholder="Örn. %50 başlangıç, %50 teslim"/></label><label>Geçerlilik tarihi<input name="valid_until" type="date"/></label><div className="wide panel-form-actions"><button className="panel-primary" type="submit">Teklifi oluştur</button></div></form>;
      const preview=<div className="crm-request-preview"><span>{requestStageNames[item.stage]??item.stage}</span><h3>{item.customer_name}</h3><h4>{item.title}</h4><dl><div><dt>Hizmet</dt><dd>{details.service_type||"Belirtilmedi"}</dd></div><div><dt>Telefon</dt><dd>{item.contact_phone||"Belirtilmedi"}</dd></div><div><dt>E-posta</dt><dd>{item.contact_email||"Belirtilmedi"}</dd></div><div><dt>Üniversite</dt><dd>{details.university||"Belirtilmedi"}</dd></div><div><dt>Bölüm</dt><dd>{details.department||"Belirtilmedi"}</dd></div><div><dt>Teslim</dt><dd>{item.expected_close_date?new Date(item.expected_close_date+"T00:00:00").toLocaleDateString("tr-TR"):"Belirtilmedi"}</dd></div></dl>{details.scope?<p>{details.scope}</p>:null}{item.notes?<p>{item.notes}</p>:null}</div>;
      const editForm=<form className="panel-form" action={updateOpportunity}><input type="hidden" name="opportunity_id" value={item.id}/><input type="hidden" name="current_details" value={JSON.stringify(details)}/><label>Talep konusu<input name="title" required defaultValue={item.title}/></label><label>Müşteri / kurum<input name="customer_name" required defaultValue={item.customer_name}/></label><label>Hizmet türü<input name="service_type" defaultValue={details.service_type||""}/></label><label>Telefon<input name="contact_phone" defaultValue={item.contact_phone||""}/></label><label>E-posta<input name="contact_email" type="email" defaultValue={item.contact_email||""}/></label><label>Üniversite<input name="university" defaultValue={details.university||""}/></label><label>Bölüm / alan<input name="department" defaultValue={details.department||""}/></label><label>Akademik düzey<input name="academic_level" defaultValue={details.academic_level||""}/></label><label>Çalışma dili<input name="language" defaultValue={details.language||"Türkçe"}/></label><label className="wide">Kapsam<textarea name="scope" defaultValue={details.scope||""}/></label><label>Teslim tarihi<input name="expected_close_date" type="date" defaultValue={item.expected_close_date||""}/></label><label>Talep kaynağı<input name="source" defaultValue={item.source||""}/></label><label className="wide">Ek not<textarea name="notes" defaultValue={item.notes||""}/></label><div className="wide panel-form-actions"><button className="panel-primary" type="submit">Değişiklikleri kaydet</button></div></form>;
      return <article className="panel-card crm-record crm-request-card" key={item.id}><div className="crm-record-main"><div className="crm-record-heading"><span className="crm-record-number">TLP-{item.id.slice(0,8).toUpperCase()}</span><span className="status-pill">{requestStageNames[item.stage]??item.stage}</span></div><h2>{item.customer_name}</h2><h3>{item.title}</h3><div className="crm-record-meta"><span>{item.contact_phone||"Telefon yok"}</span><span>{item.contact_email||"E-posta yok"}</span><span>{item.source||"Kaynak belirtilmedi"}</span></div>{details.service_type?<p><b>{details.service_type}</b>{details.academic_level?` · ${details.academic_level}`:""}{details.university?` · ${details.university}`:""}</p>:null}{details.scope?<p>{details.scope}</p>:item.notes?<p>{item.notes}</p>:null}</div><aside className="crm-request-actions"><small>TALEP İŞLEMLERİ</small>{item.stage==="proposal"?<Link className="panel-primary" href="/panel/crm/proposals">Tekliflere Git</Link>:<PanelDrawer triggerLabel="Teklif Oluştur" title={`${item.customer_name} için teklif`} description="Teklif tutarını ve kapsamını belirleyin. Kaydedildiğinde talep otomatik olarak Tekliflere Devredildi durumuna geçer.">{proposalForm}</PanelDrawer>}<PanelDrawer triggerLabel="Önizle" title="Talep Önizleme">{preview}</PanelDrawer><PanelDrawer triggerLabel="Düzenle" title="Talebi Düzenle" description="Talep bilgilerini güncelleyin.">{editForm}</PanelDrawer><form action={archiveOpportunity}><input type="hidden" name="opportunity_id" value={item.id}/><input type="hidden" name="archive_reason" value="Talep kullanıcı tarafından iptal edilerek arşivlendi."/><button className="panel-danger" type="submit">Sil / Arşivle</button></form><form className="crm-status-form" action={moveOpportunity}><input type="hidden" name="opportunity_id" value={item.id}/><label>Durum<select name="stage" defaultValue={item.stage}>{requestStages.map((stage)=><option value={stage.code} key={stage.code}>{stage.name}</option>)}</select></label><input name="lost_reason" placeholder="Arşivlenecekse nedeni"/><button className="panel-secondary" type="submit">Durumu Güncelle</button></form></aside></article>;
    })}{!rows.length?<section className="panel-card crm-empty-state"><h2>Eşleşen talep bulunamadı</h2><p>Arama ifadesini veya durum filtresini değiştirin.</p></section>:null}</section>
  </div>;
}
