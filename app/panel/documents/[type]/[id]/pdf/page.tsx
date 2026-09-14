import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractDocument } from "@/app/_components/contract-document";
import { ProposalDocument } from "@/app/_components/proposal-document";
import { pdfFileName } from "@/app/_components/legal/format";
import { loadPanelDocument } from "../load";

// Panelden A4/PDF: belge panel arayüzünün üstünde tam ekran açılır,
// yazdırmada panel çerçevesi tamamen gizlenir (document-styles.ts).
export async function generateMetadata({ params }: { params: Promise<{ type: string; id: string }> }): Promise<Metadata> {
  const { type, id } = await params;
  if (!["proposal", "contract"].includes(type)) return { title: "Belge" };
  const document = await loadPanelDocument(type, id);
  return { title: document ? pdfFileName(document.type === "contract" ? "Sozlesme" : "Teklif", document.number) : "Belge", robots: { index: false, follow: false } };
}

export default async function DocumentPdfPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!["proposal", "contract"].includes(type)) notFound();
  const document = await loadPanelDocument(type, id);
  if (!document) notFound();
  const backHref = `/panel/documents/${type}/${id}/preview`;
  if (document.type === "contract") {
    return <ContractDocument workPlan={document.workPlan} addenda={document.addenda} row={document.row} audit={document.audit} auditAvailable={document.auditAvailable} verificationUrl={document.verificationUrl} verificationHash={document.verificationHash} mode="print" overlay backHref={backHref} />;
  }
  return <ProposalDocument row={document.row} decision={document.decision} verificationUrl={document.verificationUrl} mode="print" overlay backHref={backHref} />;
}
