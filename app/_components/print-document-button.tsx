"use client";

type PrintDocumentButtonProps = {
  /** A4 yazdırma (PDF) rotası: /teklif/<token>/pdf, /sozlesme/<token>/pdf, /panel/documents/<tür>/<id>/pdf */
  href: string;
  documentType?: "proposal" | "contract";
  /** Yalnızca panelde verilir; oturumlu erişim kaydı için. */
  documentId?: string;
  documentNumber?: string;
  label?: string;
};

// "PDF olarak indir": belgeyi yalnızca A4 kâğıttan oluşan ayrı bir sayfada
// açar; o sayfa tarayıcının yazdırma penceresini kendiliğinden açar ve
// kaydedilecek dosyanın adını belge numarasıyla belirler.
export function PrintDocumentButton({ href, documentType, documentId, documentNumber, label = "PDF olarak indir" }: PrintDocumentButtonProps) {
  const logAccess = () => {
    if (!documentType || !documentId) return;
    try {
      void fetch("/api/documents/access-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType,
          documentId,
          accessType: "pdf_print",
          metadata: { number: documentNumber || null, source: "pdf_download_link" },
        }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Kayıt hatası indirmeyi engellememeli.
    }
  };

  return (
    <a href={href} target="_blank" rel="noopener" onClick={logAccess} className="doc-btn doc-btn-primary print-hide">
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v8m0 0 3-3m-3 3L5 7M3 12.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {label}
    </a>
  );
}
