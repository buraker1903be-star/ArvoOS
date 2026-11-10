/*
  ORTAK GÖNDERİM DÜĞMESİ — TARAYICI DÜZEYİ BİLEŞEN SINAMASI (10.11.2026).

  CI'DA DEĞİL. app/panel/components/gonder-dugmesi.tsx'i GERÇEK React 19 ve
  gerçek Chromium'da (Playwright) çalıştırır; form işlemi sunucu yerine
  taklit bir async işlevdir (gerçek kayıt, ödeme ya da ağ yok). Bu bir
  UYGULAMA testi değildir: oturum, sunucu işlemi ve sayfa düzeni burada
  yok; yalnızca düğmenin işlem durumuna bağlı kilidini sınar.

  Senaryolar:
    1. Hızlı çift tıklama → işlem bir kez çalışır.
    2. 9 sn süren işlem → 6,5 sn'de hâlâ kilitli (eski 6 sn kilidi burada
       açılırdı); 8 sn'den sonra "Hâlâ işleniyor"; bitince yeniden açılır.
    3. Hata → düğme hemen açılır, yeniden deneme işlemi bir kez daha çalıştırır.
    4. Bağımsız iki form → biri işlenirken öteki kilitlenmez.
    5. Aynı formda Enter ile örtük gönderim işlem sürerken yeni işlem başlatmaz.

  Kullanım: node scripts/gonder-dugmesi-tarayici.mjs  (çıkış kodu 0 = hepsi geçti)
  Gereksinim: npm ci; Playwright ve Chromium (bu depoda kurulu).
*/
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// Playwright bu ortamda global kurulu (require ile her dizinden bulunuyor); depoda bağımlılık değil.
const { chromium } = createRequire(import.meta.url)("playwright");

const KOK = path.resolve(import.meta.dirname, "..");
const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "gonder-dugmesi-"));
const giris = path.join(dizin, "giris.tsx");
fs.writeFileSync(giris, `
import { createRoot } from "react-dom/client";
import { GonderDugmesi } from ${JSON.stringify(path.join(KOK, "app/panel/components/gonder-dugmesi.tsx"))};
const sayac = { a: 0, b: 0 };
const ayar = { sure: 300, hata: false };
window.__sayac = sayac; window.__ayar = ayar;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
async function islemA() {
  sayac.a += 1;
  await bekle(ayar.sure);
  // runPanelAction gibi: hata fırlatılmaz, sonuç olarak döner (Next'te çerezle bildirilir).
  if (ayar.hata) { window.__sonHata = true; return; }
}
async function islemB() { sayac.b += 1; await bekle(300); }
function Uygulama() {
  return (<>
    <form id="a" action={islemA}><input id="a-girdi" name="x" defaultValue="1" /><GonderDugmesi>Kaydet</GonderDugmesi></form>
    <form id="b" action={islemB}><GonderDugmesi>Başka form</GonderDugmesi></form>
  </>);
}
createRoot(document.getElementById("kok")).render(<Uygulama />);
`);
await build({
  entryPoints: [giris], bundle: true, outfile: path.join(dizin, "paket.js"), format: "iife",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error",
  nodePaths: [path.join(KOK, "node_modules")],
});
// Bileşenin kendi CSS'i (gonder-dugmesi.css) esbuild'de ayrı dosyaya çıkıyor; bağlanmazsa
// gecikmeli etiket sınanmış olmaz (ilk sürümde bağlı değildi ve kontrol yanlışlıkla geçiyordu).
const css = fs.existsSync(path.join(dizin, "paket.css")) ? '<link rel="stylesheet" href="paket.css">' : "";
if (!css) throw new Error("gonder-dugmesi.css pakete girmedi");
fs.writeFileSync(path.join(dizin, "index.html"), `<!doctype html><meta charset="utf-8">${css}<div id="kok"></div><script src="paket.js"></script>`);

const sonuclar = [];
const kontrol = (ad, kosul, ayrinti = "") => sonuclar.push([kosul ? "GEÇTİ" : "KALDI", ad, ayrinti]);

const tarayici = await chromium.launch();
const sayfa = await tarayici.newPage();
await sayfa.goto(`file://${path.join(dizin, "index.html")}`);
const A = sayfa.locator("#a button");
const B = sayfa.locator("#b button");
const sayac = () => sayfa.evaluate(() => ({ ...window.__sayac }));
const ayarla = (a) => sayfa.evaluate((x) => Object.assign(window.__ayar, x), a);

// 1. Hızlı çift tıklama
await ayarla({ sure: 600, hata: false });
await A.click(); await A.click({ force: true, timeout: 200 }).catch(() => {});
await A.dblclick({ force: true, timeout: 200 }).catch(() => {});
await sayfa.waitForTimeout(900);
kontrol("Hızlı çift tıklama → işlem bir kez", (await sayac()).a === 1, `çağrı: ${(await sayac()).a}`);
kontrol("İşlem bitince düğme açık", await A.isEnabled());

// 2. 9 sn süren işlem
await ayarla({ sure: 9000 });
const once = (await sayac()).a;
await A.click();
await sayfa.waitForTimeout(1000);
const uzunGorunur = () => sayfa.locator("#a .gonder-bekleme-uzun").isVisible();
const kisaGorunur = () => sayfa.locator("#a .gonder-bekleme-kisa").isVisible();
kontrol("1 sn'de yalnızca kısa bekleme metni görünür", (await kisaGorunur()) && !(await uzunGorunur()));
await sayfa.waitForTimeout(5500);
await A.click({ force: true, timeout: 200 }).catch(() => {});
kontrol("6,5 sn'de hâlâ kilitli, ikinci gönderim yok", (await A.isDisabled()) && (await sayac()).a === once + 1, `devre dışı: ${await A.isDisabled()}`);
await sayfa.waitForTimeout(2000);
kontrol("8 sn'yi aşınca belirsizlik açıklanıyor (uzun metin görünür, kısa gizli, düğme hâlâ kilitli)", (await uzunGorunur()) && !(await kisaGorunur()) && (await A.isDisabled()));
await sayfa.waitForTimeout(1000);
kontrol("İşlem bitince yeniden açık, etiket geri döndü", (await A.isEnabled()) && (await A.textContent()) === "Kaydet", await A.textContent());

// 3. Hata sonrası yeniden deneme
await ayarla({ sure: 300, hata: true });
const once3 = (await sayac()).a;
await A.click();
await sayfa.waitForTimeout(500);
kontrol("Hatadan sonra düğme açık", await A.isEnabled());
await ayarla({ hata: false });
await A.click();
await sayfa.waitForTimeout(500);
kontrol("Yeniden deneme işlemi bir kez daha çalıştırdı", (await sayac()).a === once3 + 2, `çağrı farkı: ${(await sayac()).a - once3}`);

// 4. Bağımsız formlar
await ayarla({ sure: 1500 });
await A.click();
await sayfa.waitForTimeout(100);
kontrol("A işlenirken B kilitli değil", await B.isEnabled());
await B.click();
await sayfa.waitForTimeout(500);
kontrol("B kendi işlemini çalıştırdı", (await sayac()).b === 1);
await sayfa.waitForTimeout(1200);

// 5. Enter ile örtük gönderim
await ayarla({ sure: 1000 });
const once5 = (await sayac()).a;
await A.click();
await sayfa.locator("#a-girdi").press("Enter");
await sayfa.waitForTimeout(1300);
kontrol("İşlem sürerken Enter yeni işlem başlatmadı", (await sayac()).a === once5 + 1, `çağrı farkı: ${(await sayac()).a - once5}`);

await tarayici.close();
fs.rmSync(dizin, { recursive: true, force: true });
const g = Math.max(...sonuclar.map((s) => s[1].length));
for (const [d, ad, ay] of sonuclar) console.log(`${d.padEnd(6)} ${ad.padEnd(g)}  ${ay}`);
console.log(`\n${sonuclar.filter((s) => s[0] === "GEÇTİ").length}/${sonuclar.length} geçti (bileşen düzeyi; uygulama testi değil)`);
if (sonuclar.some((s) => s[0] !== "GEÇTİ")) process.exit(1);
