"use client";

import { useEffect, useSyncExternalStore } from "react";

/*
  A4 yazdırma sayfasının üst çubuğu (panel ve müşteri PDF sayfaları ortak).
  Sayfa açılınca görseller ve yazı tipleri yüklendikten sonra yazdırma
  penceresi kendiliğinden açılır; document.title belge numarasına
  ayarlandığı için tarayıcı PDF'i "Sozlesme-SOZ-2026-0012.pdf" gibi temiz
  bir adla kaydeder.

  12.10.2026: çubuk belgenin kimliğini ve kaydedilecek dosya adını
  gösteriyor; talimat yalnızca kullanıcının cihazına uyanı (eskiden üç
  platformun talimatı tek paragrafta, telefonda çubuğun yarısını
  kaplıyordu).
*/

type Platform = "ios" | "android" | "masaustu";

const TALIMAT: Record<Platform, string> = {
  masaustu: "Yazdırma penceresinde hedef olarak “PDF olarak kaydet”i seçin.",
  ios: "Paylaş → Yazdır → sağ üstteki Paylaş → “Dosyalara Kaydet”.",
  android: "⋮ → Paylaş → Yazdır → yazıcı olarak “PDF olarak kaydet”.",
};

/* Cihaz tarayıcıda okunur; sunucuda (ilk çizim) masaüstü talimatı. */
function platformOku(): Platform {
  const ua = navigator.userAgent;
  // iPadOS kendini masaüstü gibi tanıtıyor: dokunmatik Mac = iPad.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return /Android/.test(ua) ? "android" : "masaustu";
}
const degismez = () => () => {};

export function PrintAutorun({ fileName, backHref }: { fileName: string; backHref?: string | null }) {
  const platform = useSyncExternalStore(degismez, platformOku, (): Platform => "masaustu");

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
      <div className="doc-printbar-metin">
        <small>PDF olarak kaydet</small>
        <b>{fileName}.pdf</b>
        <p>{TALIMAT[platform]} Pencere açılmadıysa “Yazdır / PDF kaydet”e basın.</p>
      </div>
      <div className="doc-printbar-eylem">
        {backHref ? <a className="doc-btn" href={backHref}>← Belgeye dön</a> : null}
        <button type="button" className="doc-btn doc-btn-primary" onClick={() => window.print()}>Yazdır / PDF kaydet</button>
      </div>
    </div>
  );
}
