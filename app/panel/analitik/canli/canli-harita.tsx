"use client";

import { useState } from "react";
import { DUNYA_YOLU, HARITA_GENISLIK, HARITA_YUKSEKLIK, haritaX, haritaY } from "@/lib/dunya-haritasi";

/*
  CANLI ZİYARET HARİTASI (22.10.2026).

  HARİTA KENDİ ÇİZİMİMİZ (ArvoARC'takiyle aynı yol, lib/dunya-haritasi.ts):
  dış karo servisi yok — ücret yok, ziyaretçi başına dışarıya istek yok.

  İSTEMCİ BİLEŞENİ, çünkü sayfa 15 saniyede bir tazeleniyor: kıta yolu
  ~60 KB ve sunucu bileşeninde çizilse her tazelemede yeniden inerdi.
  Burada JS paketinde bir kez geliyor; tazelemede yalnızca noktalar
  değişiyor.

  "YAKIN" GÖRÜNÜM noktaların çevresine odaklanıyor: ziyaretçilerin
  çoğu Türkiye'den ve dünya görünümünde hepsi tek bir beneğe biniyordu.
  En dar pencere ~50° boylam; tek noktada bile çevresi görünsün.
*/
export type HaritaNoktasi = { enlem: number; boylam: number; sehir: string | null; ulke: string | null; adet: number; dakika: number };

const EN_DAR = 140;

function yakinPencere(noktalar: HaritaNoktasi[]) {
  const xs = noktalar.map((n) => haritaX(n.boylam));
  const ys = noktalar.map((n) => haritaY(n.enlem));
  let gen = Math.max(EN_DAR, (Math.max(...xs) - Math.min(...xs)) * 1.5);
  let yuk = Math.max(gen / 2, (Math.max(...ys) - Math.min(...ys)) * 1.5);
  gen = Math.min(HARITA_GENISLIK, Math.max(gen, yuk * 2));
  yuk = gen / 2;
  const ortaX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const ortaY = (Math.max(...ys) + Math.min(...ys)) / 2;
  const x = Math.min(Math.max(0, ortaX - gen / 2), HARITA_GENISLIK - gen);
  const y = Math.min(Math.max(0, ortaY - yuk / 2), HARITA_YUKSEKLIK - yuk);
  return { x, y, gen, yuk };
}

export function CanliHarita({ noktalar }: { noktalar: HaritaNoktasi[] }) {
  const [gorunum, setGorunum] = useState<"yakin" | "dunya">("yakin");
  const yakin = gorunum === "yakin" && noktalar.length > 0;
  const pencere = yakin ? yakinPencere(noktalar) : { x: 0, y: 0, gen: HARITA_GENISLIK, yuk: HARITA_YUKSEKLIK };
  /* Nokta boyu ekranda sabit kalsın: yakınlaşınca viewBox küçülüyor. */
  const k = pencere.gen / HARITA_GENISLIK;
  const enCok = Math.max(1, ...noktalar.map((n) => n.adet));
  /* Büyükten küçüğe çizilir: küçük nokta büyüğün altında kaybolmasın. */
  const sirali = [...noktalar].sort((a, b) => b.adet - a.adet);

  return (
    <div className="an-harita">
      <div className="an-harita-arac" role="group" aria-label="Harita görünümü">
        <button type="button" className="an-hap" aria-pressed={gorunum === "yakin"} onClick={() => setGorunum("yakin")} disabled={!noktalar.length}>Yakın</button>
        <button type="button" className="an-hap" aria-pressed={gorunum === "dunya"} onClick={() => setGorunum("dunya")}>Dünya</button>
      </div>
      <svg
        viewBox={`${pencere.x} ${pencere.y} ${pencere.gen} ${pencere.yuk}`}
        role="img"
        aria-label={noktalar.length ? `Son bir saatte ${noktalar.length} konumdan ziyaret` : "Son bir saatte konumlu ziyaret yok"}
        preserveAspectRatio="xMidYMid meet"
      >
        <path className="an-kita" d={DUNYA_YOLU} strokeWidth={0.6 * k} />
        {sirali.map((n) => {
          const r = (3 + 7 * Math.sqrt(n.adet / enCok)) * k;
          /* Yeni ziyaret parlak, bir saatlik soluk. */
          const saydam = 1 - Math.min(n.dakika, 60) / 90;
          return (
            <g key={`${n.enlem},${n.boylam}`} transform={`translate(${haritaX(n.boylam)} ${haritaY(n.enlem)})`}>
              {n.dakika <= 2 ? <circle className="an-dalga" r={r} style={{ ["--k" as string]: k }} /> : null}
              <circle className="an-nokta" r={r} opacity={saydam} strokeWidth={1.2 * k}>
                <title>{`${[n.sehir, n.ulke].filter(Boolean).join(", ") || "Bilinmeyen konum"} · ${n.adet} ziyaretçi · ${n.dakika ? `${n.dakika} dk önce` : "şimdi"}`}</title>
              </circle>
              {yakin && n.sehir && n.adet === sirali[0].adet ? (
                <text className="an-etiket" y={-r - 4 * k} fontSize={11 * k} textAnchor="middle">{n.sehir}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {!noktalar.length ? <p className="an-harita-bos">Son bir saatte konumu bilinen ziyaret yok.</p> : null}
    </div>
  );
}
