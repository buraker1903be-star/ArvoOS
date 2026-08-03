"use client";

export function PrintDocumentButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-hide"
      style={{
        border: "1px solid #b8c0ba",
        borderRadius: 10,
        background: "#fff",
        padding: "11px 16px",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      PDF Olarak İndir
    </button>
  );
}
