"use client";

export function PrintDocumentButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-hide"
      style={{
        border: "1px solid #cfd7cf",
        borderRadius: 10,
        background: "#fff",
        padding: "10px 14px",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      Yazdır / PDF Kaydet
    </button>
  );
}
