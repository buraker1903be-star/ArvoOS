import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProposalDocument } from "@/app/_components/proposal-document";
import { respondToProposal } from "./actions";

export async function generateMetadata({params}:{params:Promise<{token:string}>}):Promise<Metadata>{
 const {token}=await params;
 const supabase=await createClient();
 const {data}=await supabase.rpc("get_public_crm_proposal",{public_token:token});
 const row=Array.isArray(data)?data[0]:data;
 if(!row)return {title:"Teklif",robots:{index:false,follow:false}};
 const h=await headers();
 const host=h.get("x-forwarded-host")||h.get("host")||"app.arvo-os.com";
 const protocol=h.get("x-forwarded-proto")||"https";
 const origin=`${protocol}://${host}`;
 const organizationName=String(row.organization_name||"ArvoOS");
 const logo=row.organization_logo_url?new URL(String(row.organization_logo_url),origin).toString():new URL("/arvoos-logo.png",origin).toString();
 const title=`${organizationName} | Teklif`;
 const description=`${organizationName} tarafından hazırlanan teklif belgesini güvenli bağlantı üzerinden inceleyin.`;
 const url=`${origin}/teklif/${token}`;
 return {
  title,
  description,
  alternates:{canonical:url},
  openGraph:{title,description,type:"website",url,siteName:organizationName,images:[{url:logo,alt:`${organizationName} logosu`}]},
  twitter:{card:"summary_large_image",title,description,images:[logo]},
  robots:{index:false,follow:false},
 };
}

const firstIp=(value:string|null)=>value?.split(",")[0]?.trim()||null;
const statuses:Record<string,string>={draft:"Taslak",sent:"Gönderildi",accepted:"Kabul edildi",rejected:"Reddedildi",expired:"Süresi doldu",archived:"Arşivlendi"};

export default async function PublicProposalPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{result?:string}>}){
 const {token}=await params;
 const {result}=await searchParams;
 const supabase=await createClient();
 const {data,error}=await supabase.rpc("get_public_crm_proposal",{public_token:token});
 const row=Array.isArray(data)?data[0]:data;
 if(error||!row)notFound();
 await supabase.rpc("mark_crm_proposal_viewed",{public_token:token});
 const requestHeaders=await headers();
 await supabase.rpc("log_public_document_access",{
  public_token:token,
  target_document_type:"proposal",
  target_access_type:"public_view",
  target_ip:firstIp(requestHeaders.get("x-forwarded-for"))||requestHeaders.get("x-real-ip")||requestHeaders.get("cf-connecting-ip")||null,
  target_user_agent:requestHeaders.get("user-agent")?.slice(0,1000)||null,
  target_referrer:requestHeaders.get("referer")?.slice(0,1000)||null,
  target_metadata:{number:row.proposal_no,source:"public_proposal_shared_renderer"},
 });
 const host=requestHeaders.get("x-forwarded-host")||requestHeaders.get("host")||"arvo-os.com";
 const protocol=requestHeaders.get("x-forwarded-proto")||"https";
 const verificationUrl=`${protocol}://${host}/teklif/${token}`;
 const locked=["accepted","rejected","expired","archived"].includes(row.status);
 const actions=!locked
  ?<form action={respondToProposal.bind(null,token)} className="print-hide" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginTop:"20px"}}>
    <button name="decision" value="accept" style={{height:42,border:0,borderRadius:9,background:"#15803d",color:"#fff",fontWeight:800}}>TEKLİFİ KABUL EDİYORUM</button>
    <button name="decision" value="reject" style={{height:42,border:0,borderRadius:9,background:"#b91c1c",color:"#fff",fontWeight:800}}>TEKLİFİ REDDEDİYORUM</button>
   </form>
  :<div className="elite-notice print-hide">{statuses[row.status]||`Teklif durumu: ${row.status}`}</div>;
 return <ProposalDocument
  row={row}
  verificationUrl={verificationUrl}
  notice={result?`İşleminiz kaydedildi: ${result}`:null}
  actions={actions}
 />;
}
