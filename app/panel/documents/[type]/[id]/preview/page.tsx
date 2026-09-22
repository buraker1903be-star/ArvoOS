import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ContractDocument } from "@/app/_components/contract-document";
import { ProposalDocument } from "@/app/_components/proposal-document";
import { requestAudit } from "@/app/_components/request-origin";
import { loadPanelDocument } from "../load";

export default async function DocumentPreviewPage({params}:{params:Promise<{type:string;id:string}>}){
 const {type,id}=await params;
 if(!["proposal","contract"].includes(type))notFound();
 const document=await loadPanelDocument(type,id);
 if(!document)notFound();
 const {supabase}=await getPanelContext();
 const audit=await requestAudit();
 await supabase.rpc("log_document_access",{target_document_type:type,target_document_id:id,target_access_type:"panel_preview",target_ip:audit.ip,target_user_agent:audit.userAgent,target_referrer:audit.referrer,target_metadata:{number:document.number,source:"document_center_shared_renderer"}});
 const backLink=<Link className="doc-btn" href={`/panel/documents/${type}/${id}`}>← Yaşam döngüsüne dön</Link>;
 const pdfHref=`/panel/documents/${type}/${id}/pdf`;
 if(document.type==="contract"){
  return <ContractDocument workPlan={document.workPlan} addenda={document.addenda} row={document.row} audit={document.audit} auditAvailable={document.auditAvailable} verificationUrl={document.verificationUrl} verificationHash={document.verificationHash} toolbarLeft={backLink} pdfHref={pdfHref} logDocumentId={id}/>;
 }
 return <ProposalDocument row={document.row} decision={document.decision} verificationUrl={document.verificationUrl} toolbarLeft={backLink} pdfHref={pdfHref} logDocumentId={id}/>;
}
