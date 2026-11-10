"use client";

import { usePathname } from "next/navigation";

/*
  Panel yükleme iskeleti (app/panel/loading.tsx tek sınır). Gerekçe ve
  ölçüler loading.tsx'teki yorumda. İstemci bileşeni, çünkü iskeletin
  ŞEKLİ hangi genel bakışa gidildiğine bağlı: yükleme sınırı yolu
  sunucuda bilmiyor, usePathname gidilen adresi veriyor.
*/
const SATIR = [0, 1, 2, 3];

export function PanelIskeleti() {
  /* Operasyon genel bakışı kartları eşit yükseklikte dizer ve dört liste
     gösterir (dashboard.css · .dash-esit); iskelet de aynı şekli alır ki
     yüklenince göz kayması olmasın. Başlık o sayfada gizli. */
  const esit = usePathname() === "/panel/operations";
  return (
    <div className={esit ? "panel-skeleton skel-genel skel-genel--esit" : "panel-skeleton skel-genel"} aria-hidden="true">
      <div className="skel-hero">
        <div className="skel skel-kicker" />
        <div className="skel skel-title" />
      </div>
      <div className="skel-sekmeler">
        <div className="skel" />
        <div className="skel" />
        <div className="skel" />
      </div>
      <div className="skel-kart">
        <div className="skel skel-kart-bas" />
        <div className="skel skel-kart-alt" />
        <div className="skel skel-cubuklar" />
      </div>
      <div className="skel-izgara">
        {(esit ? [0, 1, 2, 3] : [0, 1, 2]).map((kart) => (
          <div className="skel-kart" key={kart}>
            <div className="skel skel-kart-bas" />
            <div className="skel skel-kart-alt" />
            {SATIR.map((satir) => <div className="skel skel-satir" key={satir} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
