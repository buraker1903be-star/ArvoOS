import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { StatusLookupForm } from "../durum/[slug]/lookup-form";
import "../durum/[slug]/status-lookup.css";

export const metadata: Metadata = { title: "İş Durumu Sorgula" };

export default async function CustomDomainStatusLookupPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host")?.split(":")[0] ?? "";

  const supabase = await createClient();
  const { data: organizationId } = await supabase.rpc("resolve_organization_by_domain", { p_domain: host });
  if (!organizationId) notFound();

  const { data: orgData } = await supabase.rpc("get_public_organization_branding_by_id", { p_org_id: organizationId });
  const org = Array.isArray(orgData) ? orgData[0] : orgData;
  if (!org) notFound();

  const accentColor = org.primary_color || "#183f31";

  return (
    <main className="status-lookup-shell" style={{ "--status-accent": accentColor } as React.CSSProperties}>
      <div className="status-lookup-card-wrap">
        {org.logo_url ? (
          <img src={org.logo_url} alt={org.name} className="status-lookup-logo" />
        ) : (
          <h1 className="status-lookup-org-name">{org.name}</h1>
        )}
        <h2>İş Durumu Sorgulama</h2>
        <p>Sözleşmenizin güncel durumunu görmek için kayıtlı telefon numaranızın son 4 hanesini girin.</p>
        <StatusLookupForm orgSlug={org.slug} />
      </div>
    </main>
  );
}
