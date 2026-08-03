import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ContractDocument } from "@/app/_components/contract-document";
import { ProposalDocument } from "@/app/_components/proposal-document";

const firstIp=(value:string|null)=>value?.split(",")[0]?.trim()||null;

export default async function DocumentPreviewPage({params}:{params:Promise<{type:string;id:string}>}){
 const {type,id}=await params;
 if(!["proposal","contract"].includes(type))notFound();
 const {supabase,membership,modules}=await getPanelContext();
 if(!modules.some(module=>["documents","crm"].includes(module.code)))throw new Error("Belge önizlemesine erişiminiz yok.");

 const requestHeaders=await headers();
 const accessIp=firstIp(requestHeaders.get("x-forwarded-for"))||requestHeaders.get("x-real-ip")||requestHeaders.get("cf-connecting-ip")||null;
 const host=requestHeaders.get("x-forwarded-host")||requestHeaders.get("host")||"arvo-os.com";
 const protocol=requestHeaders.get("x-forwarded-proto")||"https";
 const backLink=<Link href={`/panel/documents/${type}/${id}`} style={{textDecoration:"none",border:"1px solid #b8c0ba",borderRadius:10,background:"#fff",padding:"11px 16px",fontWeight:800,color:"#263632"}}>Yaşam döngüsüne dön</Link>;

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
  const row={...contract,customer_name:customer?.customer_name||"Müşteri",contact_phone:customer?.contact_phone||null,contact_email:customer?.contact_email||null,payment_schedule:proposal?.payment_schedule||[],organization_name:organization.name,organization_slug:organization.slug,organization_logo_url:organization.logo_url,organization_primary_color:organization.primary_color,organization_document_footer:organization.document_footer,organization_contact_email:organization.contact_email,organization_contact_phone:organization.contact_phone,organization_website_url:organization.website_url,organization_signature_stamp_url:organization.signature_stamp_url};
  await supabase.rpc("log_document_access",{target_document_type:"contract",target_document_id:id,target_access_type:"panel_preview",target_ip:accessIp,target_user_agent:requestHeaders.get("user-agent")?.slice(0,1000)||null,target_referrer:requestHeaders.get("referer")?.slice(0,1000)||null,target_metadata:{number:contract.contract_no,source:"document_center_shared_renderer"}});
  return <ContractDocument row={row} verificationUrl={`${protocol}://${host}/panel/documents/contract/${id}/preview`} toolbarLeft={backLink}/>;
 }

 const [{data:organization,error:organizationError},{data:proposal,error:proposalError}]=await Promise.all([
  supabase.from("organizations").select("name,logo_url,primary_color,document_footer,contact_email,contact_phone,website_url,signature_stamp_url").eq("id",membership.organization_id).maybeSingle(),
  supabase.from("crm_proposals").select("id,proposal_no,title,scope,amount,currency,payment_plan,payment_plan_type,payment_schedule,created_at,valid_until,estimated_delivery_date,net_amount,tax_amount,gross_amount,tax_status,status,crm_opportunities(customer_name,contact_email,contact_phone)").eq("id",id).eq("organization_id",membership.organization_id).maybeSingle(),
 ]);
 if(organizationError)throw new Error(`Kurum bilgileri okunamadı: ${organizationError.message}`);
 if(proposalError)throw new Error(`Teklif okunamadı: ${proposalError.message}`);
 if(!organization||!proposal)notFound();
 const customer=Array.isArray(proposal.crm_opportunities)?proposal.crm_opportunities[0]:proposal.crm_opportunities;
 const row={...proposal,customer_name:customer?.customer_name||"Müşteri",contact_phone:customer?.contact_phone||null,contact_email:customer?.contact_email||null,organization_name:organization.name,organization_logo_url:organization.logo_url,organization_primary_color:organization.primary_color,organization_document_footer:organization.document_footer,organization_contact_email:organization.contact_email,organization_contact_phone:organization.contact_phone,organization_website_url:organization.website_url,organization_signature_stamp_url:organization.signature_stamp_url};
 await supabase.rpc("log_document_access",{target_document_type:"proposal",target_document_id:id,target_access_type:"panel_preview",target_ip:accessIp,target_user_agent:requestHeaders.get("user-agent")?.slice(0,1000)||null,target_referrer:requestHeaders.get("referer")?.slice(0,1000)||null,target_metadata:{number:proposal.proposal_no,source:"document_center_shared_renderer"}});
 return <ProposalDocument row={row} verificationUrl={`${protocol}://${host}/panel/documents/proposal/${id}/preview`} toolbarLeft={backLink}/>;
}
