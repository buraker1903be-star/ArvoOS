"use server";

import { createClient } from "@/lib/supabase/server";

export type LookupState={error:string|null;results:{contract_no:string;contract_title:string;contract_status:string;workflow_status:string|null;last_update:string;total_amount:number;paid_amount:number;remaining_amount:number;progress_percentage:number}[]|null};

export async function lookupStatus(orgSlug:string,_previousState:LookupState,formData:FormData):Promise<LookupState>{
 const code=String(formData.get("tracking_code")??"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
 if(code.length!==6)return {error:"Lütfen size gönderilen 6 haneli takip kodunu girin.",results:null};
 const supabase=await createClient();
 const {data,error}=await supabase.rpc("lookup_contract_by_tracking_code",{p_org_slug:orgSlug,p_tracking_code:code});
 if(error)return {error:"Sorgulama yapılamadı, lütfen tekrar deneyin.",results:null};
 if(!data||data.length===0)return {error:"Bu takip koduyla eşleşen aktif bir sözleşme bulunamadı.",results:null};
 return {error:null,results:data};
}
