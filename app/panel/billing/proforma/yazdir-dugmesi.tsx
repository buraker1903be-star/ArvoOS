"use client";

/* Raporlardaki düğmenin ikizi: o düğmenin stili raporlar CSS'inde ve bu
   rotaya yüklenmiyor (sayfa kullandığı CSS'i kendisi import etmeli). */
export function YazdirDugmesi() {
  return <button type="button" className="panel-primary" onClick={() => window.print()}>Yazdır / PDF olarak kaydet</button>;
}
