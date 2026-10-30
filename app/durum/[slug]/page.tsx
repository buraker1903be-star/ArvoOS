import { notFound } from "next/navigation";
import { kurumOnizlemesi } from "@/lib/kurum-onizleme";
import { requestOrigin } from "@/app/_components/request-origin";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { slugMarkasi } from "@/lib/takip-markasi";
import { StatusLookupForm } from "./lookup-form";
import { OrgLookupShell } from "./lookup-shell";
import "./status-lookup.css";

type Params={slug:string};
/* Başlıkta slug değil kurumun ADI: müşteri sekmede "akademikmerkez"
   gibi bir anahtar değil, tanıdığı kurumu görmeli. Sekme simgesi de
   kurumun logosu. Kurum bulunamazsa genel başlık (sayfa zaten 404). */
export async function generateMetadata({params}:{params:Promise<Params>}):Promise<Metadata>{
 const {slug}=await params;
 const supabase=await createClient();
 /* Marka tek kaynaktan ve 60 sn önbellekli (lib/takip-markasi):
    başlık, yerleşim ve sayfa aynı istekte tek sorgu yapıyor. */
 const org=await slugMarkasi(supabase,slug);
 if(!org)return {title:"İş Durumu Sorgula"};
 const baslik=`${org.name} | İş Durumu Sorgula`;
 const aciklama=`${org.name} dosyanızın güncel durumunu takip kodunuzla görüntüleyin.`;
 return {
  title:baslik,
  description:aciklama,
  // Bağlantı önizlemesi de kurumun (lib/kurum-onizleme): yoksa kökteki ArvoOS logosu çıkıyordu.
  ...kurumOnizlemesi({kurumAdi:org.name,logoUrl:org.logo_url,baslik,aciklama,koken:await requestOrigin(),yol:`/durum/${slug}`}),
  ...(org.logo_url?{icons:{icon:org.logo_url}}:{}),
 };
}
export default async function StatusLookupPage({params,searchParams}:{params:Promise<Params>;searchParams:Promise<{code?:string}>}){
 const {slug}=await params;const {code}=await searchParams;const supabase=await createClient();
 /* Kurumun varlığı YERLEŞİMDE denetleniyor (yumuşak 404 notu
    orada); buradaki kontrol yalnızca tipi daraltıyor. */
 const org=await slugMarkasi(supabase,slug);if(!org)notFound();
 return (
  <OrgLookupShell org={org} title="Dosya Takibi" description="Dosyanızın güncel durumunu görmek için WhatsApp üzerinden size iletilen 6 haneli takip kodunu girin.">
   <StatusLookupForm orgSlug={slug} prefillCode={code}/>
  </OrgLookupShell>
 );
}
