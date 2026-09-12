import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProposalDocument } from "@/app/_components/proposal-document";
import { pdfFileName } from "@/app/_components/legal/format";
import { requestAudit, requestOrigin } from "@/app/_components/request-origin";
import { loadPublicProposal } from "../load";

// Yalnızca A4 belge; açılınca yazdırma (PDF) penceresi kendiliğinden açılır.
// Yetkilendirme teklif sayfasıyla aynı token üzerinden yapılır.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const loaded = await loadPublicProposal(token);
  return { title: loaded ? pdfFileName("Teklif", loaded.row.proposal_no) : "Teklif", robots: { index: false, follow: false } };
}

export default async function PublicProposalPdfPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadPublicProposal(token);
  if (!loaded) notFound();
  const audit = await requestAudit();
  try {
    await loaded.supabase.rpc("log_public_document_access", {
      public_token: token,
      target_document_type: "proposal",
      target_access_type: "public_view",
      target_ip: audit.ip,
      target_user_agent: audit.userAgent,
      target_referrer: audit.referrer,
      target_metadata: { number: loaded.row.proposal_no, source: "public_proposal_pdf", format: "pdf" },
    });
  } catch {
    // Erişim kaydı PDF'i engellememeli.
  }
  const origin = await requestOrigin();
  return <ProposalDocument
    row={loaded.row}
    decision={loaded.decision}
    verificationUrl={`${origin}/teklif/${token}`}
    mode="print"
    backHref={`/teklif/${encodeURIComponent(token)}`}
  />;
}
