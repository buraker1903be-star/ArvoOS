/*
  ARVOLAB REFERANS EKRANLARI (27.11.2026, kapanış turu · madde 1).

  Brief üç ArvoLab ekranını (Ana Sayfa, Kaynaklar, Analiz Merkezi)
  GERÇEK bileşenleri ve stil bağlamıyla istiyor. Sentetik bileşen
  karşılaştırması (scripts/bilesen-karsilastirma.mjs) kontrol
  ÖLÇÜLERİ için yeterliydi ama "bu ekran yöneticinin işine göre nasıl
  duruyor" sorusunu cevaplamıyor.

  ArvoLab'ın kendi önizleme kipi kullanılıyor: gerçek Next sunucusu,
  gerçek bileşenler, sahte Supabase (scripts/onizleme/*).

    cd ../ArvoLab && ARVOLAB_ONIZLEME=1 npx next dev -p 3123

  Sonra:  node scripts/arvolab-referans.mjs <cikti-dizini> [taban]

  Sekme şeridi AYRICA yakınlaştırılıyor: Analiz Merkezi'nin ince alt
  çizgili sekmeleri ArvoOS ürün detayının şeridiyle karşılaştırılacak
  (brief'in özellikle istediği kabul).
*/
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
const { chromium } = req("playwright");
const fs = req("fs"), path = req("path");

const cikti = process.argv[2];
const TABAN = process.argv[3] ?? "http://localhost:3123";
if (!cikti) { console.error("Kullanım: node scripts/arvolab-referans.mjs <cikti-dizini> [taban]"); process.exit(1); }
fs.mkdirSync(cikti, { recursive: true });

const EKRANLAR = [
  { ad: "ana-sayfa", yol: "/dashboard", baslik: "Ana Sayfa" },
  { ad: "kaynaklar", yol: "/dashboard/literature", baslik: "Kaynaklar" },
  { ad: "analiz-merkezi", yol: "/dashboard/analysis", baslik: "Analiz Merkezi" },
];

/* Sekme şeridinin ölçüsü: ArvoOS'un .urd-serit'iyle sayıyla
   karşılaştırılacak, göz kararıyla değil. */
const SERIT_OLCUSU = `(() => {
  const serit = document.querySelector(".analiz-sekmeler") || document.querySelector('[role="tablist"]');
  if (!serit) return null;
  const sec = serit.querySelector('[aria-selected="true"]') || serit.firstElementChild;
  const cs = sec ? getComputedStyle(sec) : null;
  const ss = getComputedStyle(serit);
  return {
    seritAltCizgi: ss.borderBottomWidth + " " + ss.borderBottomColor,
    sekmeYuksekligi: sec ? Math.round(sec.getBoundingClientRect().height) : null,
    seciliAltCizgi: cs ? cs.borderBottomWidth : null,
    seciliAgirlik: cs ? cs.fontWeight : null,
    yazi: cs ? cs.fontSize : null,
    dolgu: cs ? cs.paddingLeft + " / " + cs.paddingRight : null,
    aralik: ss.gap,
  };
})()`;

const tarayici = await chromium.launch();
const olculer = {};
for (const tema of ["acik", "koyu"]) {
  for (const e of EKRANLAR) {
    const ctx = await tarayici.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: tema === "koyu" ? "dark" : "light",
    });
    const s = await ctx.newPage();
    const hatalar = [];
    s.on("pageerror", (h) => hatalar.push(String(h).slice(0, 160)));
    await s.goto(TABAN + e.yol, { waitUntil: "domcontentloaded", timeout: 60000 });
    /* Tema ArvoLab'da da kök öznitelikten: sistem tercihi yetmiyor. */
    await s.evaluate((t) => document.documentElement.setAttribute("data-theme", t), tema === "koyu" ? "dark" : "light");
    await s.waitForTimeout(2500);
    await s.screenshot({ path: path.join(cikti, `arvolab-${e.ad}-1440x900-${tema}.png`) });
    if (e.ad === "analiz-merkezi") {
      const olcu = await s.evaluate(SERIT_OLCUSU);
      olculer[tema] = olcu;
      const serit = s.locator(".analiz-sekmeler").first();
      if (await serit.count()) {
        await serit.screenshot({ path: path.join(cikti, `arvolab-sekme-seridi-${tema}.png`) }).catch(() => {});
      }
    }
    console.log(`${e.ad} ${tema}`, hatalar.length ? `HATA: ${hatalar[0]}` : "tamam");
    await ctx.close();
  }
}
fs.writeFileSync(path.join(cikti, "arvolab-sekme-olcusu.json"), JSON.stringify(olculer, null, 1));
console.log("sekme ölçüsü:", JSON.stringify(olculer.acik));
await tarayici.close();
