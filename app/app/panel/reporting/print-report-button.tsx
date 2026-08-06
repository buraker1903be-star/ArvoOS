"use client";

export function PrintReportButton() {
  return (
    <button type="button" className="panel-secondary report-print-button" onClick={() => window.print()}>
      🖨 Yazdır / PDF olarak kaydet
    </button>
  );
}
