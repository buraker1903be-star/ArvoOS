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

export default async function StatusLookupPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name,logo_url,primary_color")
    .eq("slug", slug)
    .maybeSingle();

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
        <StatusLookupForm orgSlug={slug} />
      </div>
    </main>
  );
}
