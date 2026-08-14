import type { Metadata } from "next";
import { TakipForm } from "./takip-form";
import "../durum/[slug]/status-lookup.css";

export const metadata: Metadata = { title: "Dosya Takibi" };

export default async function TakipPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;

  return (
    <main className="status-lookup-shell">
      <div className="status-lookup-card-wrap">
        <h1 className="status-lookup-org-name">Dosya Takibi</h1>
        <h2>İş Durumu Sorgulama</h2>
        <p>Dosyanızın güncel durumunu görmek için WhatsApp üzerinden size iletilen takip kodunu girin.</p>
        <TakipForm prefillCode={code} />
      </div>
    </main>
  );
}
