import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PrintDocumentButton } from "@/app/_components/print-document-button";
import { normalizePaymentSchedule } from "@/lib/payment-schedule";

const money=(value:number,currency:string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency}).format(Number(value||0)/100);
const date=(value?:string|null)=>value?new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString("tr-TR"):"—";
const firstIp=(value:string|null)=>value?.split(",")[0]?.trim()||null;

export default async function DocumentPreviewPage({params}:{params:Promise<{type:string;id:string}>}){
 const {type,id}=await params;
 if(!["proposal","contract"].includes(type))notFound();
 const {supabase,membership,modules}=await getPanelContext();
 if(!modules.some(module=>["documents","crm"].includes(module.code)))throw new Error("Belge önizlemesine erişiminiz yok.");
 const {data:organization,error:organizationError}=await supabase.from("organizations").select("name,logo_url,primary_color,document_footer,contact_email,contact_phone,website_url,signature_stamp_url").eq("id",membership.organization_id).maybeSingle();
 if(organizationError)throw new Error(`Kurum bilgileri okunamadı: ${organizationError.message}`);
 if(!organization)notFound();
 const brand=/^#[0-9a-fA-F]{6}$/.test(organization.primary_color||"")?organization.primary_color:"#173f35";
 let row:any=null;
 let customer:any=null;
 let schedule:any[]=[];
 let number="";
 let documentTitle="";
 let total=0;
 let currency="TRY";
 let createdAt:string|null=null;
 let validOrDue:string|null=null;
 let paymentPlan="";
 let scope="";
 if(type==="proposal"){
  const {data,error}=await supabase.from("crm_proposals").select("id,proposal_no,title,scope,amount,currency,payment_plan,payment_schedule,created_at,valid_until,net_amount,tax_amount,gross_amount,status,crm_opportunities(customer_name,contact_email,contact_phone)").eq("id",id).eq("organization_id",membership.organization_id).maybeSingle();
  if(error)throw new Error(`Teklif okunamadı: ${error.message}`);if(!data)notFound();row=data;customer=Array.isArray(data.crm_opportunities)?data.crm_opportunities[0]:data.crm_opportunities;schedule=normalizePaymentSchedule(data.payment_schedule);number=data.proposal_no;documentTitle="Hizmet Teklifi";total=Number(data.gross_amount||data.amount||0);currency=data.currency;createdAt=data.created_at;validOrDue=data.valid_until;paymentPlan=data.payment_plan||"";scope=data.scope||"";
 }else{
  const {data,error}=await supabase.from("crm_contracts").select("id,contract_no,title,scope,amount,currency,payment_plan,created_at,due_date,status,signed_name,signed_at,crm_opportunities(customer_name,contact_email,contact_phone),crm_proposals(payment_schedule)").eq("id",id).eq("organization_id",membership.organization_id).maybeSingle();
  if(error)throw new Error(`Sözleşme okunamadı: ${error.message}`);if(!data)notFound();row=data;customer=Array.isArray(data.crm_opportunities)?data.crm_opportunities[0]:data.crm_opportunities;const proposal=Array.isArray(data.crm_proposals)?data.crm_proposals[0]:data.crm_proposals;schedule=normalizePaymentSchedule(proposal?.payment_schedule);number=data.contract_no;documentTitle="Hizmet Sözleşmesi";total=Number(data.amount||0);currency=data.currency;createdAt=data.created_at;validOrDue=data.due_date;paymentPlan=data.payment_plan||"";scope=data.scope||"";
 }
 const paymentRows=schedule.length?schedule:[{sequence:1,label:paymentPlan||"Ödeme",due_date:validOrDue||"",amount:total,percentage:100}];
 const requestHeaders=await headers();
 const accessIp=firstIp(requestHeaders.get("x-forwarded-for"))||requestHeaders.get("x-real-ip")||requestHeaders.get("cf-connecting-ip")||null;
 await supabase.rpc("log_document_access",{
  target_document_type:type,
  target_document_id:id,
  target_access_type:"panel_preview",
  target_ip:accessIp,
  target_user_agent:requestHeaders.get("user-agent")?.slice(0,1000)||null,
  target_referrer:requestHeaders.get("referer")?.slice(0,1000)||null,
  target_metadata:{number,source:"document_center"},
 });
 return <main style={{minHeight:"100vh",background:"#edf1ef",padding:"24px 12px 48px",color:"#263632",fontFamily:"Arial,Helvetica,sans-serif"}}>
  <style>{`*{box-sizing:border-box}.toolbar{width:210mm;max-width:100%;margin:0 auto 12px;display:flex;justify-content:space-between;gap:10px}.sheet{width:210mm;min-height:297mm;max-width:100%;margin:auto;background:#fff;box-shadow:0 18px 50px rgba(25,48,39,.12);padding:14mm}.header{display:flex;justify-content:space-between;gap:12mm;align-items:flex-start;padding-bottom:7mm;border-bottom:1px solid #dce4e0}.logo{max-width:60mm;max-height:22mm;object-fit:contain}.fallback{font-size:24px;font-weight:800;color:${brand}}.meta{text-align:right;font-size:10px;color:#697670;line-height:1.7}.meta strong{display:block;font-size:16px;color:${brand}}h1{font-size:28px;color:${brand};margin:8mm 0 2mm}.subtitle{font-size:11px;color:#697670;margin-bottom:6mm}.section{margin-bottom:5mm}.section h2{font-size:10px;letter-spacing:.12em;color:${brand};margin:0 0 2mm}.card{border:1px solid #dde5e1;border-radius:10px;background:#fbfcfb;padding:4mm}.grid{display:grid;grid-template-columns:1.3fr 1fr 1.2fr;gap:4mm}.field small{display:block;font-size:8.5px;color:#8a9591;margin-bottom:1mm}.field strong,.field span{font-size:10px}.scope{white-space:pre-wrap;font-size:9.5px;line-height:1.55}.table{width:100%;border-collapse:collapse}.table th{font-size:8.5px;background:#f2f6f4;color:#60706a;text-align:left;padding:2.5mm}.table td{font-size:9.5px;padding:2.5mm;border-bottom:1px solid #e7ece9}.table th:last-child,.table td:last-child{text-align:right}.summary{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.total{font-size:24px;font-weight:800;color:${brand}}.signature{display:grid;grid-template-columns:1fr 1fr;gap:6mm;align-items:center}.stamp{width:100%;height:28mm;object-fit:contain}.footer{margin-top:8mm;padding-top:5mm;border-top:1px solid #dde5e1;display:grid;grid-template-columns:1.2fr 1.4fr 1fr;gap:6mm;font-size:8px;color:#697570;line-height:1.45}@page{size:A4;margin:0}@media print{body{background:#fff}.print-hide{display:none!important}.toolbar{display:none}.sheet{width:210mm;min-height:297mm;box-shadow:none;margin:0}.card,.section,.signature{break-inside:avoid}}@media(max-width:760px){.sheet{width:100%;padding:20px}.grid,.summary,.signature,.footer{grid-template-columns:1fr}}`}</style>
  <div className="toolbar print-hide"><Link href={`/panel/documents/${type}/${id}`} style={{textDecoration:"none",border:"1px solid #b8c0ba",borderRadius:10,background:"#fff",padding:"11px 16px",fontWeight:800,color:"#263632"}}>Yaşam döngüsüne dön</Link><PrintDocumentButton/></div>
  <article className="sheet">
   <header className="header"><div>{organization.logo_url?<img className="logo" src={organization.logo_url} alt={`${organization.name} logosu`}/>:<div className="fallback">{organization.name}</div>}</div><div className="meta"><strong>{number}</strong><span>Düzenleme: {date(createdAt)}</span><br/><span>{type==="proposal"?"Geçerlilik":"Teslim"}: {date(validOrDue)}</span></div></header>
   <h1>{documentTitle}</h1><div className="subtitle">{customer?.customer_name||"Müşteri"} için hazırlanmıştır.</div>
   <section className="section"><h2>MÜŞTERİ BİLGİLERİ</h2><div className="card grid"><div className="field"><small>Ad Soyad / Unvan</small><strong>{customer?.customer_name||"—"}</strong></div><div className="field"><small>Telefon</small><span>{customer?.contact_phone||"—"}</span></div><div className="field"><small>E-posta</small><span>{customer?.contact_email||"—"}</span></div></div></section>
   <section className="section"><h2>HİZMET KAPSAMI</h2><div className="card scope">{scope||"Kapsam belirtilmedi."}</div></section>
   <section className="section summary"><div className="card"><h2>GENEL TOPLAM</h2><div className="total">{money(total,currency)}</div><p style={{fontSize:9,color:"#697670"}}>{paymentPlan||"Ödeme planı belirtilmedi"}</p></div><div className="card"><h2>ÖDEME PLANI</h2><table className="table"><thead><tr><th>No</th><th>Açıklama</th><th>Vade</th><th>Tutar</th></tr></thead><tbody>{paymentRows.map(item=><tr key={`${item.sequence}-${item.due_date}`}><td>{item.sequence}</td><td>{item.label}</td><td>{date(item.due_date)}</td><td>{money(item.amount,currency)}</td></tr>)}</tbody></table></div></section>
   <section className="section"><h2>ONAY</h2><div className="card signature"><div><strong>{organization.name}</strong><p style={{fontSize:9,color:"#697670"}}>Firma kaşe ve imzası</p></div>{organization.signature_stamp_url?<img className="stamp" src={organization.signature_stamp_url} alt="Firma kaşe ve imzası"/>:<div style={{height:"28mm",border:"1px dashed #ccd5d0",borderRadius:8,display:"grid",placeItems:"center",fontSize:9,color:"#9ba59f"}}>KAŞE / İMZA</div>}</div></section>
   <footer className="footer"><div><strong>{organization.name}</strong><br/>{organization.document_footer||"Profesyonel hizmetler"}</div><div><strong>İletişim</strong><br/>{[organization.contact_phone,organization.contact_email,organization.website_url].filter(Boolean).join(" · ")||"—"}</div><div><strong>Belge Durumu</strong><br/>{row.status}</div></footer>
  </article>
 </main>;
}
