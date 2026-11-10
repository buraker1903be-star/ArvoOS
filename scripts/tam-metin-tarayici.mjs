/*
  KISALTILMIŞ ADIN TAMAMI — TARAYICI DÜZEYİ BİLEŞEN SINAMASI (10.11.2026, NAV-01).

  CI'DA DEĞİL. app/panel/os/tam-metin-dugmesi.tsx'i gerçek React ve gerçek
  Chromium'da, panelin GERÇEK CSS'iyle (panel-tokens.css + dashboard.css)
  ve genel bakış satırının sınıf yapısıyla çalıştırır. Uygulama testi
  DEĞİLDİR (oturum, veri, sayfa yok); yalnızca düğmenin davranışını sınar:
    1. Uzun ad iki satırda kısaltılır ve "Tamamını göster" görünür.
    2. Kısa adda düğme yok, yer de kaplamaz.
    3. Düğmeye dokunmak (tap) satırın bağlantısını çalıştırmaz; metin açılır.
    4. Klavye: Tab ile düğmeye gelinir, Enter açar/kapatır.
  Kullanım: node scripts/tam-metin-tarayici.mjs  (çıkış kodu 0 = hepsi geçti)
*/
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// Playwright bu ortamda global kurulu; depoda bağımlılık değil.
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const KOK = path.resolve(import.meta.dirname, "..");
const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "tam-metin-"));
const UZUN = "Prof. Dr. Ayşe Nur Karadeniz-Yılmazoğlu · Doktora Tezi Danışmanlığı ve Uzun Başlıklı Bir Araştırma Projesi";
fs.writeFileSync(path.join(dizin, "giris.tsx"), `
import { createRoot } from "react-dom/client";
import { TamMetinDugmesi } from ${JSON.stringify(path.join(KOK, "app/panel/os/tam-metin-dugmesi.tsx"))};
function Satir({ id, ad }) {
  return <li id={id}><a className="dash-col-row" href={"#gitti-" + id}><span className="dash-col-main"><b>{ad}</b><small>Müşteri · Durum</small></span><span className="status-pill">3 gün kaldı</span></a><TamMetinDugmesi /></li>;
}
createRoot(document.getElementById("kok")).render(
  <section className="dash-cols dash-cols--esnek"><article className="dash-card dash-col"><ul className="dash-col-list">
    <Satir id="uzun" ad={${JSON.stringify(UZUN)}} />
    <Satir id="kisa" ad="Ali Veli" />
  </ul></article></section>
);
`);
await build({
  entryPoints: [path.join(dizin, "giris.tsx")], bundle: true, outfile: path.join(dizin, "paket.js"), format: "iife",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error", nodePaths: [path.join(KOK, "node_modules")],
});
const css = ["app/panel/panel-tokens.css", "app/panel/dashboard.css"].map((d) => fs.readFileSync(path.join(KOK, d), "utf8")).join("\n");
fs.writeFileSync(path.join(dizin, "index.html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style><body class="panel-root" style="margin:16px"><div id="kok" style="width:300px"></div><script src="paket.js"></script>`);

const sonuclar = [];
const kontrol = (ad, kosul, ayrinti = "") => sonuclar.push([kosul ? "GEÇTİ" : "KALDI", ad, ayrinti]);
const tarayici = await chromium.launch();
// Dokunmatik telefon öykünmesi: tap gerçek dokunma olaylarıyla.
const baglam = await tarayici.newContext({ ...devices["iPhone 13"] });
const sayfa = await baglam.newPage();
await sayfa.goto(`file://${path.join(dizin, "index.html")}`);
await sayfa.waitForTimeout(300);

const uzunDugme = sayfa.locator("#uzun .dash-tam-metin button");
const kisaDugme = sayfa.locator("#kisa .dash-tam-metin button");
const uzunAd = sayfa.locator("#uzun .dash-col-main b");
const kisaltilmis = () => uzunAd.evaluate((b) => b.scrollHeight > b.clientHeight + 1);

kontrol("Uzun ad kısaltılmış", await kisaltilmis());
kontrol("Uzun adda 'Tamamını göster' görünür", await uzunDugme.isVisible());
kontrol("Kısa adda düğme yok ve yer kaplamıyor", (await kisaDugme.count()) === 0 && !(await sayfa.locator("#kisa .dash-tam-metin").isVisible()));
await uzunDugme.tap();
await sayfa.waitForTimeout(150);
kontrol("Dokunma bağlantıyı çalıştırmadı", !(await sayfa.evaluate(() => location.hash)).startsWith("#gitti"), await sayfa.evaluate(() => location.hash));
kontrol("Dokunma metni açtı (kısaltma yok, aria-expanded=true)", !(await kisaltilmis()) && (await uzunDugme.getAttribute("aria-expanded")) === "true");
await uzunDugme.tap();
await sayfa.waitForTimeout(150);
kontrol("İkinci dokunma kapattı", (await kisaltilmis()) && (await uzunDugme.textContent()) === "Tamamını göster");

// Klavye
await sayfa.locator("#uzun a").focus();
await sayfa.keyboard.press("Tab");
kontrol("Tab bağlantıdan düğmeye geçer", await uzunDugme.evaluate((d) => d === document.activeElement));
await sayfa.keyboard.press("Enter");
await sayfa.waitForTimeout(150);
kontrol("Enter metni açtı, bağlantıya gitmedi", !(await kisaltilmis()) && !(await sayfa.evaluate(() => location.hash)).startsWith("#gitti"));

await tarayici.close();
fs.rmSync(dizin, { recursive: true, force: true });
const g = Math.max(...sonuclar.map((s) => s[1].length));
for (const [d, ad, ay] of sonuclar) console.log(`${d.padEnd(6)} ${ad.padEnd(g)}  ${ay}`);
console.log(`\n${sonuclar.filter((s) => s[0] === "GEÇTİ").length}/${sonuclar.length} geçti (bileşen düzeyi; uygulama testi değil)`);
if (sonuclar.some((s) => s[0] !== "GEÇTİ")) process.exit(1);
