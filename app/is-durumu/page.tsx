import { headers } from "next/headers";
import { getLoginBrand } from "@/lib/login-branding";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { StatusLookupForm } from "../durum/[slug]/lookup-form";
import { OrgLookupShell } from "../durum/[slug]/lookup-shell";
import "../durum/[slug]/status-lookup.css";
import { kurumSimgeleri } from "@/lib/kurum-simgesi";
import { alanAdiKurumu } from "@/lib/alan-adi-kurumu";
import { kurumMarkasi } from "@/lib/takip-markasi";

/*
  Sekme başlığı ve simgesi kurumun: kendi alan adında açılan bu ekran
  kurumun logosunu ve rengini zaten gösteriyordu ama sekmede hâlâ genel
  bir başlık vardı. Paylaşılan adreste genel başlık kalıyor.
*/
export async function generateMetadata(): Promise<Metadata> {
  const marka = await getLoginBrand();
  if (!marka) return { title: "İş Durumu Sorgula", description: "Takip kodunuzla işinizin güncel durumunu görüntüleyin." };
  return {
    title: `${marka.name} | İş Durumu Sorgula`,
    description: `${marka.name} işinizin güncel durumunu takip kodunuzla görüntüleyin.`,
    // Sekme simgesi logo değil: yatay logo 16×16 kareye sıkışıyordu (lib/kurum-simgesi).
    icons: kurumSimgeleri(marka),
  };
}

export default async function CustomDomainStatusLookupPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host")?.split(":")[0] ?? "";

  const supabase = await createClient();
  const organizationId = await alanAdiKurumu(supabase, host);
  if (!organizationId) notFound();

  /* Varlık denetimi YERLEŞİMDE (yumuşak 404 notu orada); burada
     marka yalnızca okunuyor ve aynı istekte tek sorgu yapılıyor. */
  const org = await kurumMarkasi(supabase, organizationId);
  if (!org) notFound();

  return (
    <OrgLookupShell org={org} title="İş Durumu Sorgulama" description="Sözleşmenizin güncel durumunu görmek için size gönderilen takip kodunu girin.">
      <StatusLookupForm orgSlug={org.slug} prefillCode={code} />
    </OrgLookupShell>
  );
}
