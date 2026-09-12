import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractDocument } from "@/app/_components/contract-document";
import { pdfFileName } from "@/app/_components/legal/format";
import { requestOrigin } from "@/app/_components/request-origin";
import { loadPublicContract } from "../load";

// Yalnızca A4 belge: panel/sayfa arayüzü yok, açılınca yazdırma (PDF)
// penceresi kendiliğinden açılır. Yetkilendirme sözleşme sayfasıyla aynı
// token üzerinden yapılır; erişim kaydını üst layout tutar.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const loaded = await loadPublicContract(token);
  return { title: loaded ? pdfFileName("Sozlesme", loaded.row.contract_no) : "Sözleşme", robots: { index: false, follow: false } };
}

export default async function PublicContractPdfPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadPublicContract(token);
  if (!loaded) notFound();
  const origin = await requestOrigin();
  return <ContractDocument
    row={loaded.row}
    audit={loaded.audit}
    auditAvailable={loaded.auditAvailable}
    verificationUrl={`${origin}/sozlesme/${token}`}
    verificationHash={loaded.verificationHash}
    proposalLink={loaded.links?.proposal_share_token ? { token: loaded.links.proposal_share_token, no: loaded.links.proposal_no } : null}
    mode="print"
    backHref={`/sozlesme/${encodeURIComponent(token)}`}
  />;
}
