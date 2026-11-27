/*
  PANELMODAL ODAK TUZAĞI — TARAYICI DÜZEYİ REGRESYON SINAMASI (F6 PR6a, 15.11.2026).

  CI'DA DEĞİL. app/panel/components/panel-modal.tsx'e bağlanan ortak odak
  tuzağının (useOdakTuzagi) öteki pencere kullanımlarını bozmadığını GERÇEK
  React 19 ve Chromium'da sınar. Bileşenler gerçek (PanelModal, PanelDrawer,
  OnayPenceresi, GonderDugmesi); sunucu işlemleri taklit async işlevlerdir.
  UYGULAMA KABULÜ DEĞİLDİR: oturum ve gerçek sayfa yok.

  Senaryolar talep/teklif ekranlarındaki kalıpları taklit ediyor:
    - basaridaKapan'lı form penceresi (talep listesindeki "Kaldır", teklif ve
      sözleşme detayındaki pencereler): ilk odak, Tab/Shift+Tab döngüsü,
      Esc, odağın tetikleyiciye dönüşü, gönderim sırasında ve hatada davranış;
    - iç içe pencere (prim penceresi gibi): Esc yalnızca üsttekini kapatır;
    - pencere içinde onay penceresi (yerel <dialog>);
    - adresten açılan pencere (baslangicAcik, dugmesiz: kanal ve derin bağlantı);
    - çekmecenin (PanelDrawer) içinden açılan pencere: kapanınca çekmece
      kullanılabilir kalır;
    - her şey kapanınca kabukta inert kalmaz.

  Kullanım: node scripts/panel-modal-odak-tarayici.mjs  (çıkış 0 = hepsi geçti)
*/
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const KOK = path.resolve(process.env.KOK ?? path.join(import.meta.dirname, ".."));
const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "panel-modal-odak-"));
const shim = path.join(dizin, "shim");
fs.mkdirSync(shim);
fs.writeFileSync(path.join(shim, "navigation.ts"), `export const useRouter = () => ({ push(){}, replace(){}, refresh(){} }); export const usePathname = () => "/panel"; export const useSearchParams = () => new URLSearchParams();`);
const a = (p) => JSON.stringify(path.join(KOK, p));
fs.writeFileSync(path.join(dizin, "giris.tsx"), `
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PanelModal } from ${a("app/panel/components/panel-modal.tsx")};
import { PanelDrawer } from ${a("app/panel/components/panel-drawer.tsx")};
import { OnayPenceresi } from ${a("app/panel/components/onay-penceresi.tsx")};
import { GonderDugmesi } from ${a("app/panel/components/gonder-dugmesi.tsx")};
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
window.__ayar = { basari: true }; window.__cagri = 0;
/* runPanelAction gibi: başarıda panelin bildirimi "arvo:action-success" yayar (flash-toast). */
async function islem() { window.__cagri += 1; await bekle(400); if (window.__ayar.basari) window.dispatchEvent(new CustomEvent("arvo:action-success")); }
function OnayDugmesi() {
  const [acik, setAcik] = useState(false);
  return <><button type="button" id="onay-ac" onClick={() => setAcik(true)}>Onay iste</button>
    <OnayPenceresi istek={acik ? { baslik: "Emin misiniz?", metin: "Deneme", onayEtiketi: "Evet" } : null} onIptal={() => setAcik(false)} onOnay={() => setAcik(false)} /></>;
}
function Uygulama() {
  return <div className="panel-root">
    <header><button type="button" id="dis-dugme">Dışarıdaki düğme</button><a href="#x" id="dis-baglanti">Dış bağlantı</a></header>
    <main>
      <PanelModal triggerLabel="Form penceresi" title="Form" boy="orta" basaridaKapan>
        <form action={islem} id="form-a"><label>Ad <input name="ad" id="ad" /></label><label>Not <textarea name="not" /></label>
          <OnayDugmesi />
          <PanelModal triggerLabel="İç pencere" title="İç" boy="dar"><input id="ic-girdi" /><button type="button">İç düğme</button></PanelModal>
          <GonderDugmesi>Kaydet</GonderDugmesi></form>
      </PanelModal>
      <PanelModal triggerLabel="Adresten" title="Derin bağlantı" dugmesiz baslangicAcik={new URLSearchParams(location.search).has("derin")}><input id="derin-girdi" /></PanelModal>
      <PanelDrawer triggerLabel="Çekmece" title="Çekmece">
        <input id="cekmece-girdi" />
        <PanelModal triggerLabel="Çekmecedeki pencere" title="Çekmecedeki"><input id="cp-girdi" /></PanelModal>
      </PanelDrawer>
    </main>
  </div>;
}
createRoot(document.getElementById("kok")).render(<Uygulama />);
`);
await build({
  entryPoints: [path.join(dizin, "giris.tsx")], bundle: true, outdir: dizin, entryNames: "paket", format: "iife",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error",
  nodePaths: [path.join(KOK, "node_modules")], alias: { "next/navigation": path.join(shim, "navigation.ts"), "@": KOK },
});
const css = fs.existsSync(path.join(dizin, "paket.css")) ? '<link rel="stylesheet" href="paket.css">' : "";
fs.writeFileSync(path.join(dizin, "index.html"), `<!doctype html><meta charset="utf-8">${css}<div id="kok"></div><script src="paket.js"></script>`);

const sonuclar = [];
const kontrol = (ad, kosul, ayrinti = "") => sonuclar.push([kosul ? "GEÇTİ" : "KALDI", ad, ayrinti]);
const tarayici = await chromium.launch();
const sayfa = await tarayici.newPage();
await sayfa.goto(`file://${path.join(dizin, "index.html")}`);

const odak = () => sayfa.evaluate(() => { const e = document.activeElement; return { id: e?.id || null, metin: (e?.getAttribute("aria-label") || e?.textContent || "").trim().slice(0, 24), pencerede: Boolean(e?.closest(".panel-modal-root")), tag: e?.tagName }; });
const acikPencere = () => sayfa.evaluate(() => document.querySelectorAll(".panel-modal-root").length);
/* Kabuğa (panel-root'un doğrudan çocukları) eklenen inert; kapalı çekmecenin kendi
   <aside inert>'i bilerek sayılmıyor (PanelDrawer kapalıyken içeriğini öyle tutar). */
const inertSayisi = () => sayfa.evaluate(() => [...document.querySelector(".panel-root").children].filter((e) => e.hasAttribute("inert")).length);
/* Tab ile gezinirken pencere DIŞINDAKİ bir denetime düşülüyor mu (body/belge kabul: tarayıcı arayüzü). */
async function gez(tus, kez) {
  const kacan = [];
  for (let i = 0; i < kez; i++) {
    await sayfa.keyboard.press(tus);
    const o = await odak();
    if (!o.pencerede && o.tag !== "BODY" && o.tag !== "HTML") kacan.push(o.id || o.metin);
  }
  return kacan;
}
const bekle = (ms) => sayfa.waitForTimeout(ms);

// 1. İlk odak, Tab / Shift+Tab, Esc, odak dönüşü
await sayfa.getByRole("button", { name: "Form penceresi" }).click();
await bekle(100);
let o = await odak();
kontrol("açılışta odak pencerede (kapat düğmesi)", o.pencerede && o.metin === "Kapat", JSON.stringify(o));
kontrol("açıkken kabuğun kalanı inert", await sayfa.evaluate(() => document.querySelector("header").closest("[inert]") !== null));
kontrol("Tab ×15 pencereden kaçmıyor", (await gez("Tab", 15)).length === 0);
kontrol("Shift+Tab ×15 pencereden kaçmıyor", (await gez("Shift+Tab", 15)).length === 0);
await sayfa.keyboard.press("Escape"); await bekle(80);
o = await odak();
kontrol("Esc pencereyi kapatıyor", (await acikPencere()) === 0);
kontrol("kapanınca odak tetikleyiciye dönüyor", o.metin === "Form penceresi", JSON.stringify(o));
kontrol("kapanınca inert kalmıyor", (await inertSayisi()) === 0, String(await inertSayisi()));

// 2. İç içe pencere
await sayfa.getByRole("button", { name: "Form penceresi" }).click(); await bekle(80);
await sayfa.getByRole("button", { name: "İç pencere" }).click(); await bekle(100);
o = await odak();
kontrol("iç pencere açılınca odak iç pencerede", (await acikPencere()) === 2 && o.metin === "Kapat", JSON.stringify(o));
kontrol("iç pencerede Tab kaçmıyor (iki pencere de odaklanabilir)", (await gez("Tab", 8)).length === 0);
await sayfa.locator("#ic-girdi").click();
kontrol("iç pencerenin alanı kullanılabilir (inert değil)", (await odak()).id === "ic-girdi");
await sayfa.keyboard.press("Escape"); await bekle(120);
o = await odak();
kontrol("Esc yalnızca üstteki pencereyi kapatıyor", (await acikPencere()) === 1);
kontrol("iç pencere kapanınca odak dış penceredeki tetikleyiciye", o.metin === "İç pencere" && o.pencerede, JSON.stringify(o));
await sayfa.locator("#ad").click();
kontrol("dış pencere hâlâ kullanılabilir", (await odak()).id === "ad");

// 3. Pencere içinde onay penceresi (<dialog>)
await sayfa.locator("#onay-ac").click(); await bekle(100);
kontrol("onay penceresi açılıyor ve odak onun içinde", await sayfa.evaluate(() => { const d = document.querySelector("dialog"); return Boolean(d?.open && d.contains(document.activeElement)); }));
await sayfa.getByRole("button", { name: "Vazgeç" }).click(); await bekle(80);
kontrol("onay penceresi kapanınca form penceresi açık", (await acikPencere()) === 1 && !(await sayfa.evaluate(() => document.querySelector("dialog")?.open)));

// 4. Form gönderimi: hata → pencere açık, inert sürüyor; başarı → kapanır, odak tetikleyiciye
await sayfa.evaluate(() => { window.__ayar.basari = false; window.__cagri = 0; });
await sayfa.locator("#ad").fill("Deneme");
await sayfa.locator("#form-a button[type=submit]").click();
await bekle(100);
kontrol("gönderim sürerken düğme kilitli", await sayfa.evaluate(() => document.querySelector("#form-a button[type=submit]")?.disabled === true));
await bekle(500);
kontrol("hatada pencere açık kalıyor, kabuk hâlâ inert", (await acikPencere()) === 1 && (await sayfa.evaluate(() => document.querySelector("header").closest("[inert]") !== null)));
await sayfa.evaluate(() => { window.__ayar.basari = true; });
await sayfa.locator("#form-a button[type=submit]").click();
await bekle(700);
o = await odak();
kontrol("başarıda pencere kapanıyor (basaridaKapan)", (await acikPencere()) === 0);
kontrol("başarıdan sonra odak tetikleyiciye dönüyor", o.metin === "Form penceresi", JSON.stringify(o));
kontrol("işlem iki kez çalıştı (hata + yeniden deneme), fazlası yok", (await sayfa.evaluate(() => window.__cagri)) === 2);
kontrol("başarıdan sonra inert kalmıyor", (await inertSayisi()) === 0);

// 5. Çekmecenin içinden pencere
await sayfa.getByRole("button", { name: "Çekmece" }).click(); await bekle(120);
await sayfa.getByRole("button", { name: "Çekmecedeki pencere" }).click(); await bekle(120);
await sayfa.locator("#cp-girdi").click();
kontrol("çekmecedeki pencerenin alanı kullanılabilir", (await odak()).id === "cp-girdi");
/* Kapat düğmesiyle: çekmecenin kendi Esc dinleyicisi en üstteki katmanı sormuyor
   ve Esc ikisini birden kapatıyor — bu odak tuzağından ÖNCE de böyleydi (ayrı konu). */
await sayfa.locator(".panel-modal-root .panel-modal-close").click(); await bekle(100);
kontrol("pencere kapandı, çekmece açık", (await acikPencere()) === 0 && (await sayfa.evaluate(() => !document.querySelector(".panel-drawer-root aside")?.hasAttribute("inert"))));
await sayfa.locator("#cekmece-girdi").click();
kontrol("pencereden sonra çekmece kullanılabilir (inert'ten kurtuldu)", (await odak()).id === "cekmece-girdi");

// 6. Adresten açılan pencere (dugmesiz + baslangicAcik)
const sayfa2 = await tarayici.newPage();
await sayfa2.goto(`file://${path.join(dizin, "index.html")}?derin=1`);
await sayfa2.waitForTimeout(200);
const o2 = await sayfa2.evaluate(() => ({ pencere: document.querySelectorAll(".panel-modal-root").length, odakPencerede: Boolean(document.activeElement?.closest(".panel-modal-root")), inert: document.querySelector("header").closest("[inert]") !== null }));
kontrol("adresten açılan pencere: odak içeride, kabuk inert", o2.pencere === 1 && o2.odakPencerede && o2.inert, JSON.stringify(o2));
await sayfa2.keyboard.press("Escape"); await sayfa2.waitForTimeout(80);
kontrol("adresten açılan pencere Esc ile kapanıyor, inert kalmıyor", await sayfa2.evaluate(() => document.querySelectorAll(".panel-modal-root").length === 0 && [...document.querySelector(".panel-root").children].every((e) => !e.hasAttribute("inert"))));

await tarayici.close();
fs.rmSync(dizin, { recursive: true, force: true });
for (const [d, ad, ay] of sonuclar) console.log(`${d}  ${ad}${ay ? `  (${ay})` : ""}`);
const kalan = sonuclar.filter(([d]) => d === "KALDI").length;
console.log(`\n${sonuclar.length - kalan}/${sonuclar.length} geçti`);
process.exit(kalan ? 1 : 0);
