import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { StatusLookupForm } from "./lookup-form";
import "./status-lookup.css";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `İş Durumu Sorgula — ${slug}` };
}

export default async function StatusLookupPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ code?: string }> }) {
  const { slug } = await params;
  const { code } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_organization_branding", { p_slug: slug });
  const org = Array.isArray(data) ? data[0] : data;

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
        <p>Sözleşmenizin güncel durumunu görmek için size gönderilen takip kodunu girin.</p>
        <StatusLookupForm orgSlug={slug} prefillCode={code} />
      </div>
    </main>
  );
}
