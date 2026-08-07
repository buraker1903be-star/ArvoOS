import { headers } from "next/headers";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { StatusLookupForm } from "../durum/[slug]/lookup-form";
import "../durum/[slug]/status-lookup.css";

export const metadata: Metadata = { title: "Dosya Takibi" };

export default async function TrackingPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = (forwardedHost || requestHeaders.get("host") || "").split(":")[0].toLowerCase();
  const supabase = await createClient();

  let org: { slug: string; name: string; logo_url: string | null; primary_color: string | null } | null = null;
  const { data: organizationId } = await supabase.rpc("resolve_organization_by_domain", { p_domain: host });

  if (organizationId) {
    const { data: orgData } = await supabase.rpc("get_public_organization_branding_by_id", { p_org_id: organizationId });
    org = (Array.isArray(orgData) ? orgData[0] : orgData) ?? null;
  }

  const accentColor = org?.primary_color || "#183f31";
  return (
    <main className="status-lookup-shell" style={{ "--status-accent": accentColor } as React.CSSProperties}>
      <div className="status-lookup-card-wrap">
        {org?.logo_url ? <img src={org.logo_url} alt={org.name} className="status-lookup-logo" /> : <h1 className="status-lookup-org-name">{org?.name || "ArvoOS"}</h1>}
        <h2>Dosya Takibi</h2>
        <p>Dosyanızın güncel durumunu görmek için WhatsApp üzerinden size iletilen 6 haneli takip kodunu girin.</p>
        <StatusLookupForm orgSlug={org?.slug || ""} prefillCode={code} />
      </div>
    </main>
  );
}
