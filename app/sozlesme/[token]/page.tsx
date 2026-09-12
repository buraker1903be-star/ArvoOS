import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractDocument, contractCustomerKind } from "@/app/_components/contract-document";
import { requestOrigin } from "@/app/_components/request-origin";
import { ContractSignatureForm } from "./signature-form";
import { loadPublicContract } from "./load";

export async function generateMetadata({params}:{params:Promise<{token:string}>}):Promise<Metadata>{
 const {token}=await params;
 const loaded=await loadPublicContract(token);
 const row=loaded?.row;
 if(!row)return {title:"Sözleşme",robots:{index:false,follow:false}};
 const origin=await requestOrigin();
 const organizationName=String(row.organization_name||"ArvoOS");
 const logo=row.organization_logo_url?new URL(String(row.organization_logo_url),origin).toString():new URL("/arvoos-logo.png",origin).toString();
 const title=`${organizationName} | Sözleşme`;
 const description=`${organizationName} tarafından hazırlanan sözleşme belgesini güvenli bağlantı üzerinden inceleyin.`;
 const url=`${origin}/sozlesme/${token}`;
 return {
  title,
  description,
  alternates:{canonical:url},
  openGraph:{title,description,type:"website",url,siteName:organizationName,images:[{url:logo,alt:`${organizationName} logosu`}]},
  twitter:{card:"summary_large_image",title,description,images:[logo]},
  robots:{index:false,follow:false},
 };
}

// URL'deki hata kodları sabit mesajlara çevrilir; bilinmeyen kod gösterilmez.
const contractErrors:Record<string,string>={
 missing:"Ad soyad bilgisi gereklidir.",
 consent:"Lütfen zorunlu onay beyanlarının tamamını işaretleyin.",
 signature:"Lütfen imza alanına imzanızı çiziniz.",
 closed:"Bu sözleşme artık imzaya açık değil. Sorunuz varsa bizimle iletişime geçin.",
 failed:"Sözleşme imzalanamadı. Lütfen tekrar deneyin; sorun devam ederse bizimle iletişime geçin.",
};
const closedNotices:Record<string,string>={
 cancelled:"Bu sözleşme iptal edildi ve imzaya kapalıdır.",
 rejected:"Bu sözleşme reddedildi ve imzaya kapalıdır.",
};

export default async function PublicContractPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{signed?:string;workflow?:string;created?:string;error?:string}>}){
 const {token}=await params;
 const query=await searchParams;
 const loaded=await loadPublicContract(token);
 if(!loaded)notFound();
 const {supabase,row,audit,auditAvailable,links,verificationHash}=loaded;
 await supabase.rpc("mark_crm_contract_viewed",{public_token:token});
 const origin=await requestOrigin();
 // Yalnızca taslak/gönderilmiş ve imzalanmamış sözleşme imzaya açık.
 const signable=!row.signed_at&&["draft","sent"].includes(row.status);
 const notice=query.created
  ?"Teklif kabul edildi. Sözleşme onayınıza hazırlandı; belgenin sonundaki imza alanından onaylayabilirsiniz."
  :query.signed
   ?"Sözleşme imzalandı. İmzalı nüshayı “PDF olarak indir” ile kaydedebilirsiniz."
   :closedNotices[row.status]??null;
 return <ContractDocument
  row={row}
  audit={audit}
  auditAvailable={auditAvailable}
  verificationUrl={`${origin}/sozlesme/${token}`}
  verificationHash={verificationHash}
  pdfHref={`/sozlesme/${encodeURIComponent(token)}/pdf`}
  notice={notice}
  errorMessage={query.error?contractErrors[query.error]??null:null}
  proposalLink={links?.proposal_share_token?{token:links.proposal_share_token,no:links.proposal_no}:null}
  signatureForm={signable?<ContractSignatureForm token={token} consumer={contractCustomerKind(row)==="consumer"}/>:null}
 />;
}
