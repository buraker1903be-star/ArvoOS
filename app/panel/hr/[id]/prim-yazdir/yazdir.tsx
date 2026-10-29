"use client";

import { useEffect } from "react";

/*
  Prim dökümünün PDF sayfası açılınca yazdırma penceresi kendiliğinden
  açılır; document.title dosya adı olur, tarayıcı PDF'i bu adla kaydeder.
  Ortak PrintAutorun'un çubuğu belge CSS'ine bağlı ve bu rotaya
  yüklenmiyor (sayfa kullandığı CSS'i kendisi import etmeli).
*/
export function PrimYazdir({ dosyaAdi }: { dosyaAdi: string }) {
  useEffect(() => {
    document.title = dosyaAdi;
    const zamanlayici = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(zamanlayici);
  }, [dosyaAdi]);
  return <button type="button" className="panel-primary" onClick={() => window.print()}>Yazdır / PDF olarak kaydet</button>;
}
