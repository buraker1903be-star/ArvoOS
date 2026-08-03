"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signContract(token:string,formData:FormData){
  const signerName=String(formData.get("signer_name")??"").trim().slice(0,180);
  const accepted=String(formData.get("accepted")??"")==="on";
  if(signerName.length<2||!accepted) throw new Error("Sözleşmeyi imzalamak için ad soyad ve onay gereklidir.");
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("sign_crm_contract",{public_token:token,signer_name:signerName});
  if(error) throw new Error("Sözleşme imzalanamadı.");
  const row=Array.isArray(data)?data[0]:data;
  redirect(`/sozlesme/${encodeURIComponent(token)}?signed=1&workflow=${encodeURIComponent(row?.workflow_id??"")}`);
}
