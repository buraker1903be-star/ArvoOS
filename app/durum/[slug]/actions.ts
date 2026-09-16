"use server";

import { openTrackingAccess, trackingAccessMessage } from "@/lib/tracking-access";
import { fetchCustomerPortalFiles, type CustomerPortalFile } from "../../takip/portal-files-data";

export type LookupState={error:string|null;results:{contract_no:string;contract_title:string;contract_status:string;workflow_status:string|null;last_update:string;total_amount:number;paid_amount:number;remaining_amount:number;progress_percentage:number}[]|null;
 /** Sorgulanan (normalize) takip kodu; dosya indirme isteğinde kullanılır. */
 code:string|null;
 /** Müşteri portalı dosyaları; null → bölüm gösterilmez. */
 files:CustomerPortalFile[]|null};

const empty={code:null,files:null} as const;

export async function lookupStatus(orgSlug:string,_previousState:LookupState,formData:FormData):Promise<LookupState>{
 const code=String(formData.get("tracking_code")??"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
 if(code.length!==6)return {error:"Lütfen size gönderilen 6 haneli takip kodunu girin.",results:null,...empty};
 const access=await openTrackingAccess(code);
 if(!access.ok)return {error:trackingAccessMessage(access.reason),results:null,...empty};
 const {supabase}=access;
 const {data,error}=await supabase.rpc("lookup_contract_by_tracking_code",{p_org_slug:orgSlug,p_tracking_code:code});
 if(error)return {error:"Sorgulama yapılamadı, lütfen tekrar deneyin.",results:null,...empty};
 if(!data||data.length===0)return {error:"Bu takip koduyla eşleşen aktif bir sözleşme bulunamadı.",results:null,...empty};
 // Dosyalar yalnızca bu kurumda eşleşen bir sözleşme bulunduğunda okunur.
 let files:CustomerPortalFile[]|null=null;
 try{files=await fetchCustomerPortalFiles(supabase,code)}catch(fileError){console.error("[durum] müşteri portalı dosyaları okunamadı",fileError);files=null}
 return {error:null,results:data,code,files};
}

export async function refreshLookupPortalFiles(code:string):Promise<CustomerPortalFile[]|null>{
 const normalized=String(code??"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
 if(normalized.length<6)return null;
 const access=await openTrackingAccess(normalized);
 if(!access.ok)return null;
 try{return await fetchCustomerPortalFiles(access.supabase,normalized)}catch{return null}
}
