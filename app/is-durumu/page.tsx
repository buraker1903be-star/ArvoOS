import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { StatusLookupForm } from "../durum/[slug]/lookup-form";
import { OrgLookupShell } from "../durum/[slug]/lookup-shell";
import "../durum/[slug]/status-lookup.css";

export const metadata: Metadata = { title: "İş Durumu Sorgula" };

export default async function CustomDomainStatusLookupPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host")?.split(":")[0] ?? "";

  const supabase = await createClient();
  const { data: organizationId } = await supabase.rpc("resolve_organization_by_domain", { p_domain: host });
  if (!organizationId) notFound();

  const { data: orgData } = await supabase.rpc("get_public_organization_branding_by_id", { p_org_id: organizationId });
  const org = Array.isArray(orgData) ? orgData[0] : orgData;
  if (!org) notFound();

  return (
    <OrgLookupShell org={org} title="İş Durumu Sorgulama" description="Sözleşmenizin güncel durumunu görmek için size gönderilen takip kodunu girin.">
      <StatusLookupForm orgSlug={org.slug} prefillCode={code} />
    </OrgLookupShell>
  );
}
