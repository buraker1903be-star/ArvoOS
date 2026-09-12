import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { StatusLookupForm } from "./lookup-form";
import { OrgLookupShell } from "./lookup-shell";
import "./status-lookup.css";

type Params={slug:string};
export async function generateMetadata({params}:{params:Promise<Params>}):Promise<Metadata>{const {slug}=await params;return {title:`İş Durumu Sorgula — ${slug}`}}
export default async function StatusLookupPage({params,searchParams}:{params:Promise<Params>;searchParams:Promise<{code?:string}>}){
 const {slug}=await params;const {code}=await searchParams;const supabase=await createClient();const {data}=await supabase.rpc("get_public_organization_branding",{p_slug:slug});const org=Array.isArray(data)?data[0]:data;if(!org)notFound();
 return (
  <OrgLookupShell org={org} title="Dosya Takibi" description="Dosyanızın güncel durumunu görmek için WhatsApp üzerinden size iletilen 6 haneli takip kodunu girin.">
   <StatusLookupForm orgSlug={slug} prefillCode={code}/>
  </OrgLookupShell>
 );
}
