import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ContractDocument } from "@/app/_components/contract-document";
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

 const requestHeaders=await headers();
 const accessIp=firstIp(requestHeaders.get("x-forwarded-for"))||requestHeaders.get("x-real-ip")||requestHeaders.get("cf-connecting-ip")||null;

 if(type==="contract"){
  const [{data:organization,error:organizationError},{data:contract,error:contractError}]=await Promise.all([
   supabase.from("organizations").select("name,slug,logo_url,primary_color,document_footer,contact_email,contact_phone,website_url,signature_stamp_url").eq("id",membership.organization_id).maybeSingle(),
   supabase.from("crm_contracts").select("id,contract_no,title,scope,amount,currency,payment_plan,start_date,due_date,status,created_at,signed_name,signed_at,signed_signature_data,contract_template_key,contract_template_version,crm_opportunities(customer_name,contact_email,contact_phone),crm_proposals(payment_schedule)").eq("id",id).eq("organization_id",membership.organization_id).maybeSingle(),
  ]);
  if(organizationError)throw new Error(`Kurum bilgileri okunamadı: ${organizationError.message}`);
  if(contractError)throw new Error(`Sözleşme okunamadı: ${contractError.message}`);
  if(!organization||!contract)notFound();

  const customer=Array.isArray(contract.crm_opportunities)?contract.crm_opportunities[0]:contract.crm_opportunities;
  const proposal=Array.isArray(contract.crm_proposals)?contract.crm_proposals[0]:contract.crm_proposals;
  const h=requestHeaders;
  const host=h.get("x-forwarded-host")||h.get("host")||"arvo-os.com";
  const protocol=h.get("x-forwarded-proto")||"https";
  const verificationUrl=`${protocol}://${host}/panel/documents/contract/${id}/preview`;
  const row={
   ...contract,
   customer_name:customer?.customer_name||"Müşteri",
   contact_phone:customer?.contact_phone||null,
   contact_email:customer?.contact_email||null,
   payment_schedule:proposal?.payment_schedule||[],
   organization_name:organization.name,
   organization_slug:organization.slug,
   organization_logo_url:organization.logo_url,
   organization_primary_color:organization.primary_color,
   organization_document_footer:organization.document_footer,
   organization_contact_email:organization.contact_email,
   organization_contact_phone:organization.contact_phone,
   organization_website_url:organization.website_url,
   organization_signature_stamp_url:organization.signature_stamp_url,
  };
  await supabase.rpc("log_document_access",{target_document_type:"contract",target_document_id:id,target_access_type:"panel_preview",target_ip:accessIp,target_user_agent:h.get("user-agent")?.slice(0,1000)||null,target_referrer:h.get("referer")?.slice(0,1000)||null,target_metadata:{number:contract.contract_no,source:"document_center_shared_renderer"}});
  return <ContractDocument
   row={row}
   verificationUrl={verificationUrl}
   toolbarLeft={<Link href={`/panel/documents/contract/${id}`} style={{textDecoration:"none",border:"1px solid #b8c0ba",borderRadius:10,background:"#fff",padding:"11px 16px",fontWeight:800,color:"#263632"}}>Yaşam döngüsüne dön</Link>}
  />;
 }

 const [{data:organization,error:organizationError},{data:proposal,error:proposalError}]=await Promise.all([
  supabase.from("organizations").select("name,logo_url,primary_color,document_footer,contact_email,contact_phone,website_url,signature_stamp_url").eq("id",membership.organization_id).maybeSingle(),
  supabase.from("crm_proposals").select("id,proposal_no,title,scope,amount,currency,payment_plan,payment_schedule,created_at,valid_until,net_amount,tax_amount,gross_amount,status,crm_opportunities(customer_name,contact_email,contact_phone)").eq("id",id).eq("organization_id",membership.organization_id).maybeSingle(),
 ]);
 if(organizationError)throw new Error(`Kurum bilgileri okunamadı: ${organizationError.message}`);
 if(proposalError)throw new Error(`Teklif okunamadı: ${proposalError.message}`);
 if(!organization||!proposal)notFound();
 const customer=Array.isArray(proposal.crm_opportunities)?proposal.crm_opportunities[0]:proposal.crm_opportunities;
 const schedule=normalizePaymentSchedule(proposal.payment_schedule);
 const total=Number(proposal.gross_amount||proposal.amount||0);
 const paymentRows=schedule.length?schedule:[{sequence:1,label:proposal.payment_plan||"Ödeme",due_date:proposal.valid_until||"",amount:total,percentage:100}];
 const brand=/^#[0-9a-fA-F]{6}$/.test(organization.primary_color||"")?organization.primary_color:"#173f35";
 await supabase.rpc("log_document_access",{target_document_type:"proposal",target_document_id:id,target_access_type:"panel_preview",target_ip:accessIp,target_user_agent:requestHeaders.get("user-agent")?.slice(0,1000)||null,target_referrer:requestHeaders.get("referer")?.slice(0,1000)||null,target_metadata:{number:proposal.proposal_no,source:"document_center"}});
 return <main style={{minHeight:"100vh",background:"#edf1ef",padding:"24px 12px 48px",color:"#263632",fontFamily:"Arial,Helvetica,sans-serif"}}>
  <style>{`*{box-sizing:border-box}.toolbar{width:210mm;max-width:100%;margin:0 auto 12px;display:flex;justify-content:space-between;gap:10px}.sheet{width:210mm;min-height:297mm;max-width:100%;margin:auto;background:#fff;box-shadow:0 18px 50px rgba(25,48,39,.12);padding:14mm}.header{display:flex;justify-content:space-between;gap:12mm;align-items:flex-start;padding-bottom:7mm;border-bottom:1px solid #dce4e0}.logo{max-width:76mm;max-height:20mm;object-fit:contain;object-position:left top}.fallback{font-size:24px;font-weight:800;color:${brand}}.meta{text-align:right;font-size:10px;color:#697670;line-height:1.7}.meta strong{display:block;font-size:16px;color:${brand}}h1{font-size:28px;color:${brand};margin:8mm 0 2mm}.subtitle{font-size:11px;color:#697670;margin-bottom:6mm}.section{margin-bottom:5mm}.section h2{font-size:10px;letter-spacing:.12em;color:${brand};margin:0 0 2mm}.card{border:1px solid #dde5e1;border-radius:10px;background:#fbfcfb;padding:4mm}.grid{display:grid;grid-template-columns:1.3fr 1fr 1.2fr;gap:4mm}.field small{display:block;font-size:8.5px;color:#8a9591;margin-bottom:1mm}.field strong,.field span{font-size:10px}.scope{white-space:pre-wrap;font-size:9.5px;line-height:1.55}.table{width:100%;border-collapse:collapse}.table th{font-size:8.5px;background:#f2f6f4;color:#60706a;text-align:left;padding:2.5mm}.table td{font-size:9.5px;padding:2.5mm;border-bottom:1px solid #e7ece9}.table th:last-child,.table td:last-child{text-align:right}.summary{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.total{font-size:24px;font-weight:800;color:${brand}}.stamp{width:100%;height:28mm;object-fit:contain}.footer{margin-top:8mm;padding-top:5mm;border-top:1px solid #dde5e1;display:grid;grid-template-columns:1.2fr 1.4fr 1fr;gap:6mm;font-size:8px;color:#697570;line-height:1.45}@page{size:A4;margin:0}@media print{body{background:#fff}.print-hide{display:none!important}.toolbar{display:none}.sheet{width:210mm;min-height:297mm;box-shadow:none;margin:0}.card,.section{break-inside:avoid}}@media(max-width:760px){.sheet{width:100%;padding:20px}.grid,.summary,.footer{grid-template-columns:1fr}}`}</style>
  <div className="toolbar print-hide"><Link href={`/panel/documents/proposal/${id}`} style={{textDecoration:"none",border:"1px solid #b8c0ba",borderRadius:10,background:"#fff",padding:"11px 16px",fontWeight:800,color:"#263632"}}>Yaşam döngüsüne dön</Link><PrintDocumentButton documentType="proposal" documentId={proposal.id} documentNumber={proposal.proposal_no}/></div>
  <article className="sheet">
   <header className="header"><div>{organization.logo_url?<img className="logo" src={organization.logo_url} alt={`${organization.name} logosu`}/>:<div className="fallback">{organization.name}</div>}</div><div className="meta"><strong>{proposal.proposal_no}</strong><span>Düzenleme: {date(proposal.created_at)}</span><br/><span>Geçerlilik: {date(proposal.valid_until)}</span></div></header>
   <h1>Hizmet Teklifi</h1><div className="subtitle">{customer?.customer_name||"Müşteri"} için hazırlanmıştır.</div>
   <section className="section"><h2>MÜŞTERİ BİLGİLERİ</h2><div className="card grid"><div className="field"><small>Ad Soyad / Unvan</small><strong>{customer?.customer_name||"—"}</strong></div><div className="field"><small>Telefon</small><span>{customer?.contact_phone||"—"}</span></div><div className="field"><small>E-posta</small><span>{customer?.contact_email||"—"}</span></div></div></section>
   <section className="section"><h2>HİZMET KAPSAMI</h2><div className="card scope">{proposal.scope||"Kapsam belirtilmedi."}</div></section>
   <section className="section summary"><div className="card"><h2>GENEL TOPLAM</h2><div className="total">{money(total,proposal.currency)}</div><p style={{fontSize:9,color:"#697670"}}>{proposal.payment_plan||"Ödeme planı belirtilmedi"}</p></div><div className="card"><h2>ÖDEME PLANI</h2><table className="table"><thead><tr><th>No</th><th>Açıklama</th><th>Vade</th><th>Tutar</th></tr></thead><tbody>{paymentRows.map(item=><tr key={`${item.sequence}-${item.due_date}`}><td>{item.sequence}</td><td>{item.label}</td><td>{date(item.due_date)}</td><td>{money(item.amount,proposal.currency)}</td></tr>)}</tbody></table></div></section>
   <section className="section"><h2>ONAY</h2><div className="card">{organization.signature_stamp_url?<img className="stamp" src={organization.signature_stamp_url} alt="Firma kaşe ve imzası"/>:<strong>{organization.name}</strong>}</div></section>
   <footer className="footer"><div><strong>{organization.name}</strong><br/>{organization.document_footer||"Profesyonel hizmetler"}</div><div><strong>İletişim</strong><br/>{[organization.contact_phone,organization.contact_email,organization.website_url].filter(Boolean).join(" · ")||"—"}</div><div><strong>Belge Durumu</strong><br/>{proposal.status}</div></footer>
  </article>
 </main>;
}
