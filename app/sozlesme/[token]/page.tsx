import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContractDocument } from "@/app/_components/contract-document";
import { ContractSignatureForm } from "./signature-form";

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
 const notice=query.created
  ?"Teklif kabul edildi. Sözleşme imzaya hazırlandı."
  :query.signed
   ?"Sözleşme imzalandı ve iş akışı oluşturuldu."
   :null;
 return <ContractDocument
  row={row}
  verificationUrl={verificationUrl}
  notice={notice}
  errorMessage={query.error||null}
  signatureForm={<ContractSignatureForm token={token}/>}
 />;
}
