import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractDocument, contractCustomerKind } from "@/app/_components/contract-document";
import { requestOrigin } from "@/app/_components/request-origin";
import { ContractSignatureForm } from "./signature-form";
import { AddendumDecisionForm } from "./addendum-form";
import { loadPublicContract } from "./load";
import { todayInIstanbul } from "@/lib/istanbul-date";

export async function generateMetadata({params}:{params:Promise<{token:string}>}):Promise<Metadata>{
 const {token}=await params;
 const loaded=await loadPublicContract(token);
 const row=loaded?.row;
 // Anahtar çözülmediyse sayfa notFound() çağırıyor ve not-found.tsx
 // çiziliyor; sekme adı da onunla aynı şeyi söylemeli. Eskiden
 // "Sözleşme"/"Teklif" yazıyordu: ekranda "bağlantı geçersiz",
 // sekmede var olan bir belge vaadi.
 if(!row)return {title:"Bağlantı geçersiz",robots:{index:false,follow:false}};
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
  /* Sekme simgesi de kurumun: müşteri teklifi açtığında tarayıcı
     sekmesinde Arvo'nun değil, teklifi gönderen kurumun logosu
     görünsün. Kurumun logosu yoksa köke düşüyor (ArvoOS). */
  ...(row.organization_logo_url ? {icons:{icon:logo}} : {}),
  robots:{index:false,follow:false},
 };
}

// URL'deki hata kodları sabit mesajlara çevrilir; bilinmeyen kod gösterilmez.
const contractErrors:Record<string,string>={
 missing:"Ad soyad bilgisi gereklidir.",
 consent:"Lütfen zorunlu onay beyanlarının tamamını işaretleyin.",
 signature:"Lütfen imza alanına imzanızı çiziniz.",
 closed:"Bu sözleşme artık imzaya açık değil. Sorunuz varsa bizimle iletişime geçin.",
 expired:"Bu sözleşmenin imza süresi doldu. Güncel sözleşme için bizimle iletişime geçin.",
 failed:"Sözleşme imzalanamadı. Lütfen tekrar deneyin; sorun devam ederse bizimle iletişime geçin.",
 addendum_name:"Ek protokol için ad soyadınızı yazın.",
 addendum_consent:"Onaylamak için “Ek protokolü okudum ve onaylıyorum” kutusunu işaretleyin.",
 addendum_note:"Değişiklik isterken talebinizi kısaca yazın.",
 addendum_closed:"Bu ek protokol artık onaya açık değil.",
 addendum_failed:"Ek protokol yanıtınız kaydedilemedi. Lütfen tekrar deneyin; sorun devam ederse bizimle iletişime geçin.",
};
const closedNotices:Record<string,string>={
 cancelled:"Bu sözleşme iptal edildi ve imzaya kapalıdır.",
 rejected:"Bu sözleşme reddedildi ve imzaya kapalıdır.",
};

export default async function PublicContractPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{signed?:string;workflow?:string;created?:string;error?:string;addendum?:string}>}){
 const {token}=await params;
 const query=await searchParams;
 const loaded=await loadPublicContract(token);
 if(!loaded)notFound();
 const {supabase,row,audit,auditAvailable,links,verificationHash,workPlan,addenda,trackingCode,kurum,imzaSonTarihi}=loaded;
 await supabase.rpc("mark_crm_contract_viewed",{public_token:token});
 const origin=await requestOrigin();
 // Yalnızca taslak/gönderilmiş ve imzalanmamış sözleşme imzaya açık.
 const signable=!row.signed_at&&["draft","sent"].includes(row.status);
 // İmza son tarihi (03.11.2026): Türkiye günüyle geçtiyse imza alanı yerine açıklama; asıl red imza işlevinde.
 const sonGun=imzaSonTarihi?imzaSonTarihi.split("-").reverse().join("."):null;
 const suresiDoldu=Boolean(signable&&imzaSonTarihi&&imzaSonTarihi<todayInIstanbul());
 const pendingAddendum=addenda.find((addendum)=>addendum.status==="sent");
 const notice=query.addendum==="accepted"
  ?"Ek protokolü onayladınız. Güncel takvim, belgenin sonundaki “Ek Protokoller” bölümünde yer alır."
  :query.addendum==="rejected"
   ?"Değişiklik talebiniz iletildi. Ekibimiz takvimi güncelleyip onayınıza yeniden sunacak."
   :query.created
    ?"Teklif kabul edildi. Sözleşme onayınıza hazırlandı; belgenin sonundaki imza alanından onaylayabilirsiniz."
    :query.signed
     ?"Sözleşme imzalandı. İmzalı nüshayı “PDF olarak indir” ile kaydedebilirsiniz."
     :suresiDoldu
      ?`Bu sözleşmenin imza süresi ${sonGun} tarihinde doldu. Güncel sözleşme için bizimle iletişime geçin.`
      :closedNotices[row.status]??(pendingAddendum?`Onayınızı bekleyen Ek Protokol ${pendingAddendum.addendum_no} var. Belgenin sonundaki “Ek Protokoller” bölümünden inceleyip onaylayabilirsiniz.`:signable&&sonGun?`Bu sözleşmeyi en geç ${sonGun} tarihine kadar imzalayabilirsiniz.`:null);
 return <ContractDocument
  row={row}
  workPlan={workPlan}
  addenda={addenda}
  trackingCode={trackingCode}
  kurum={kurum}
  addendumActions={(addendum)=><AddendumDecisionForm token={token} addendum={addendum}/>}
  audit={audit}
  auditAvailable={auditAvailable}
  verificationUrl={`${origin}/sozlesme/${token}`}
  verificationHash={verificationHash}
  pdfHref={`/sozlesme/${encodeURIComponent(token)}/pdf`}
  notice={notice}
  errorMessage={query.error?contractErrors[query.error]??null:null}
  proposalLink={links?.proposal_share_token?{token:links.proposal_share_token,no:links.proposal_no}:null}
  signatureForm={signable&&!suresiDoldu?<ContractSignatureForm token={token} consumer={contractCustomerKind(row)==="consumer"}/>:null}
 />;
}
