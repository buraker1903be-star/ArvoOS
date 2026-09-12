import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContractDocument } from "@/app/_components/contract-document";
import { ContractSignatureForm } from "./signature-form";

export async function generateMetadata({params}:{params:Promise<{token:string}>}):Promise<Metadata>{
 const {token}=await params;
 const supabase=await createClient();
 const {data}=await supabase.rpc("get_public_crm_contract",{public_token:token});
 const row=Array.isArray(data)?data[0]:data;
 if(!row)return {title:"Sözleşme",robots:{index:false,follow:false}};
 const h=await headers();
 const host=h.get("x-forwarded-host")||h.get("host")||"app.arvo-os.com";
 const protocol=h.get("x-forwarded-proto")||"https";
 const origin=`${protocol}://${host}`;
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
 missing:"Ad soyad ve açık onay gereklidir.",
 signature:"Lütfen mavi imza alanına imzanızı çiziniz.",
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
 const supabase=await createClient();
 const {data,error}=await supabase.rpc("get_public_crm_contract",{public_token:token});
 const row=Array.isArray(data)?data[0]:data;
 if(error||!row)notFound();
 await supabase.rpc("mark_crm_contract_viewed",{public_token:token});
 const h=await headers();
 const host=h.get("x-forwarded-host")||h.get("host")||"arvo-os.com";
 const protocol=h.get("x-forwarded-proto")||"https";
 const verificationUrl=`${protocol}://${host}/sozlesme/${token}`;
 // Müşteri, sözleşmeden teklife de ulaşabilsin: iki belge ayrı ayrı
 // erişilebilir kalmalı.
 const {data:linkRows}=await supabase.rpc("arvo_public_contract_links",{public_token:token});
 const links=Array.isArray(linkRows)?linkRows[0]:linkRows;
 // Yalnızca taslak/gönderilmiş ve imzalanmamış sözleşme imzaya açık.
 const signable=!row.signed_at&&["draft","sent"].includes(row.status);
 const notice=query.created
  ?"Teklif kabul edildi. Sözleşme imzaya hazırlandı."
  :query.signed
   ?"Sözleşme imzalandı ve iş akışı oluşturuldu."
   :closedNotices[row.status]??null;
 return <ContractDocument
  row={row}
  verificationUrl={verificationUrl}
  notice={notice}
  errorMessage={query.error?contractErrors[query.error]??null:null}
  proposalLink={links?.proposal_share_token?{token:links.proposal_share_token,no:links.proposal_no}:null}
  signatureForm={signable?<ContractSignatureForm token={token}/>:null}
 />;
}
