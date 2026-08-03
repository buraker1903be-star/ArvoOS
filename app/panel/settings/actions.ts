"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const text=(formData:FormData,key:string,max=500)=>String(formData.get(key)??"").trim().slice(0,max);

export async function updateDocumentBranding(formData:FormData){
  const {supabase,membership}=await getPanelContext();
  if(!["owner","admin"].includes(membership.role)) throw new Error("Kurumsal kimlik ayarlarını değiştirme yetkiniz yok.");
  const primaryColor=text(formData,"primary_color",20)||"#183f31";
  if(!/^#[0-9a-fA-F]{6}$/.test(primaryColor)) throw new Error("Kurumsal renk geçersiz.");
  const {error}=await supabase.from("organizations").update({
    logo_url:text(formData,"logo_url",1000)||null,
    primary_color:primaryColor,
    document_footer:text(formData,"document_footer",500)||null,
    contact_email:text(formData,"contact_email",240)||null,
    contact_phone:text(formData,"contact_phone",80)||null,
    website_url:text(formData,"website_url",500)||null,
    updated_at:new Date().toISOString(),
  }).eq("id",membership.organization_id);
  if(error) throw new Error("Kurumsal kimlik kaydedilemedi: "+error.message);
  revalidatePath("/panel/settings");
}
