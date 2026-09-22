"use client";

import { useEffect } from "react";

// A4 yazdırma sayfasının üst çubuğu. Sayfa açılınca görseller ve yazı
// tipleri yüklendikten sonra yazdırma penceresi kendiliğinden açılır;
// document.title belge numarasına ayarlandığı için tarayıcı PDF'i
// "Sozlesme-SOZ-2026-0012.pdf" gibi temiz bir adla kaydeder.
export function PrintAutorun({ fileName, backHref }: { fileName: string; backHref?: string | null }) {
  useEffect(() => {
    document.title = fileName;
    let cancelled = false;
    const run = async () => {
      try {
        await document.fonts?.ready;
      } catch {
        // yazı tipi beklenemese de yazdırmaya devam et
      }
      const pending = Array.from(document.images).filter((image) => !image.complete);
      await Promise.all(pending.map((image) => new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })));
      if (!cancelled) window.print();
    };
    const timer = window.setTimeout(() => void run(), 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fileName]);

  return (
    <div className="doc-printbar doc-noprint">
      <p><b>PDF olarak kaydetmek için</b> yazdırma penceresinde hedef olarak “PDF olarak kaydet”i seçin. iPhone / iPad: Paylaş → Yazdır → Paylaş → “Dosyalara Kaydet”. Android: ⋮ → Paylaş → Yazdır → “PDF olarak kaydet”.</p>
      {backHref ? <a className="doc-btn" href={backHref}>Belgeye dön</a> : null}
      <button type="button" className="doc-btn doc-btn-primary" onClick={() => window.print()}>Yazdır / PDF kaydet</button>
    </div>
  );
}
