import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProposalDocument } from "@/app/_components/proposal-document";
import { requestAudit, requestOrigin } from "@/app/_components/request-origin";
import { respondToProposal } from "./actions";
import { loadPublicProposal } from "./load";

export async function generateMetadata({params}:{params:Promise<{token:string}>}):Promise<Metadata>{
 const {token}=await params;
 const loaded=await loadPublicProposal(token);
 const row=loaded?.row;
 if(!row)return {title:"Teklif",robots:{index:false,follow:false}};
 const origin=await requestOrigin();
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

// URL'deki sonuç kodu sabit mesaja çevrilir. Eskiden "?result=..." içindeki
// her metin kurum logolu teklifin içinde gösteriliyordu.
const resultNotices:Record<string,string>={
 accepted:"İşleminiz kaydedildi: teklifi kabul ettiniz.",
 rejected:"İşleminiz kaydedildi: teklifi reddettiniz.",
};

export default async function PublicProposalPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{result?:string}>}){
 const {token}=await params;
 const {result}=await searchParams;
 const loaded=await loadPublicProposal(token);
 if(!loaded)notFound();
 const {supabase,row,decision}=loaded;
 await supabase.rpc("mark_crm_proposal_viewed",{public_token:token});
 const audit=await requestAudit();
 await supabase.rpc("log_public_document_access",{
  public_token:token,
  target_document_type:"proposal",
  target_access_type:"public_view",
  target_ip:audit.ip,
  target_user_agent:audit.userAgent,
  target_referrer:audit.referrer,
  target_metadata:{number:row.proposal_no,source:"public_proposal_shared_renderer"},
 });
 const origin=await requestOrigin();
 const locked=["accepted","rejected","expired","archived"].includes(row.status);
 const actions=!locked
  ?<div className="ad-actions print-hide">
    <form action={respondToProposal.bind(null,token)}>
     <button className="ad-accept" name="decision" value="accept">TEKLİFİ KABUL EDİYORUM</button>
     <button className="ad-reject" name="decision" value="reject">TEKLİFİ REDDEDİYORUM</button>
    </form>
    <p>Kararınız tarih-saat, IP adresi ve cihaz bilgisiyle kayıt altına alınır. Kabul ettiğinizde aynı kapsam ve bedelle hazırlanan sözleşme onayınıza sunulur.</p>
   </div>
  :<div className="ad-status print-hide">{statuses[row.status]||"Bu teklifin karar aşaması tamamlandı. Belge görüntülenebilir durumda."}</div>;
 return <ProposalDocument
  row={row}
  decision={decision}
  verificationUrl={`${origin}/teklif/${token}`}
  pdfHref={`/teklif/${encodeURIComponent(token)}/pdf`}
  notice={result?resultNotices[result]??null:null}
  actions={actions}
 />;
}
