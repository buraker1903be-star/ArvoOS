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
// Müşteriye görünen durum metinleri.
// Panel içi etiketler ("Arşivlendi" gibi) burada kullanılamaz: müşteri
// açısından bu "teklifiniz iptal oldu" demek. Oysa belge geçerli ve
// görüntülenmeye devam ediyor; sadece karar aşaması kapanmış oluyor.
const statuses:Record<string,string>={
 draft:"Bu teklif henüz taslak aşamasında.",
 sent:"Teklifiniz onayınızı bekliyor.",
 accepted:"Bu teklifi onayladınız. Süreç sözleşme aşamasına geçti; belge kayıtlarınız için burada erişilebilir kalmaya devam edecek.",
 rejected:"Bu teklif reddedildi. Belge kayıtlarınız için erişilebilir durumda.",
 expired:"Bu teklifin geçerlilik süresi doldu. Belge görüntülenebilir; yeni bir teklif için bizimle iletişime geçebilirsiniz.",
 archived:"Bu teklifin karar aşaması tamamlandı. Belge kayıtlarınız için erişilebilir kalmaya devam ediyor.",
};

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
 // Karar bilgisi (tarih + IP) ve varsa sözleşme bağlantısı.
 // Ayrı bir fonksiyondan geliyor: mevcut get_public_crm_proposal'a
 // dokunmak istemedik, canlı şema repodakiyle ayrışmış durumda.
 const {data:decisionRows}=await supabase.rpc("arvo_public_proposal_decision",{public_token:token});
 const decision=Array.isArray(decisionRows)?decisionRows[0]:decisionRows;
 const locked=["accepted","rejected","expired","archived"].includes(row.status);
 const actions=!locked
  ?<form action={respondToProposal.bind(null,token)} className="print-hide" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginTop:"20px"}}>
    <button name="decision" value="accept" style={{height:42,border:0,borderRadius:9,background:"#15803d",color:"#fff",fontWeight:800}}>TEKLİFİ KABUL EDİYORUM</button>
    <button name="decision" value="reject" style={{height:42,border:0,borderRadius:9,background:"#b91c1c",color:"#fff",fontWeight:800}}>TEKLİFİ REDDEDİYORUM</button>
   </form>
  :<div className="elite-notice print-hide">{statuses[row.status]||"Bu teklifin karar aşaması tamamlandı. Belge görüntülenebilir durumda."}</div>;
 return <ProposalDocument
  row={row}
  decision={decision??null}
  verificationUrl={verificationUrl}
  notice={result?`İşleminiz kaydedildi: ${result}`:null}
  actions={actions}
 />;
}
