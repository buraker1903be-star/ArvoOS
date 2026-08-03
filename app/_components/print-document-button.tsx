"use client";

import { useState } from "react";

type PrintDocumentButtonProps = {
  documentType?: "proposal" | "contract";
  documentId?: string;
  documentNumber?: string;
};

export function PrintDocumentButton({ documentType, documentId, documentNumber }: PrintDocumentButtonProps) {
  const [busy, setBusy] = useState(false);

  const handlePrint = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (documentType && documentId) {
        await fetch("/api/documents/access-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentType,
            documentId,
            accessType: "pdf_print",
            metadata: {
              number: documentNumber || null,
              source: "print_document_button",
            },
          }),
          keepalive: true,
        });
      }
    } catch {
      // Logging must never block the user's print flow.
    } finally {
      setBusy(false);
      window.print();
    }
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={busy}
      className="print-hide"
      style={{
        border: "1px solid #b8c0ba",
        borderRadius: 10,
        background: "#fff",
        padding: "11px 16px",
        fontWeight: 800,
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? "Hazırlanıyor..." : "PDF Olarak İndir"}
    </button>
  );
}
