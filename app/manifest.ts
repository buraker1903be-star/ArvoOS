import type { MetadataRoute } from "next";

// Ana ekrana eklenen panel: tarayıcı çubuğu olmadan (standalone) açılır.
// Renkler panel-tokens.css'teki iOS zemini (#f2f2f7) ile aynı; açılış
// ekranı ile panel arasında renk sıçraması olmaz. Yön serbest: tablette
// yatay kullanım da destekleniyor (eskiden dikeye kilitliydi).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/panel",
    name: "ArvoOS",
    short_name: "ArvoOS",
    description: "Kurumunuzun mobil yönetim ve operasyon merkezi.",
    lang: "tr",
    dir: "ltr",
    start_url: "/panel",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#f2f2f7",
    theme_color: "#f2f2f7",
    orientation: "any",
    categories: ["business", "productivity"],
    // PNG'ler: Android ana ekran + açılış ekranı 192/512 ister; maskable
    // sürümde logo güvenli alanda (%80 daire) kalır, kenarlar kırpılabilir.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
