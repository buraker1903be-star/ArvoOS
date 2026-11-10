/*
  PENCERE ODAĞI — TARAYICI DÜZEYİ BİLEŞEN SINAMASI (10.11.2026, PR #316 · F-01).

  CI'DA DEĞİL. UYGULAMA KABULÜ DEĞİLDİR. Gönderim YAPILMAZ (sunucu işlemleri
  taklit; gerçek gönderim yok — taklit işlem yalnızca
  "gönderim sürerken" senaryosunda bekleme durumunu kurmak için bir kez çağrılır).

  F-01: Yeni talep açıkken Tab, "Talebi kaydet"ten sonra pencereden çıkıp
  Vercel Preview araç çubuğuna (vercel-live-feedback), sayfaya (BODY) ve
  arka plandaki kapatma katmanına gidiyordu. Bu betik iki durumu ayrı ayrı
  koşar: `body`ye pencere kabuğunun DIŞINDA odaklanabilir bir öğe eklenmiş
  (Preview araç çubuğu benzeri: gölge DOM'da düğmeli özel öğe) ve eklenmemiş.

  Pencereler: Yeni talep (gerçek RequestEntryForm), Yeni teklif ve Direkt
  sözleşme (gerçek ProposalBuilderForm), Talebi düzenle (TEMSİLİ: gerçek
  form sunucu sayfasının içinde yazılı, aynı yapı — kayit-formu, tarih
  seçici, kaydet çubuğu — elle kuruldu). Hepsi gerçek PanelDrawer'da, CRM
  rotasının gerçek derlenmiş CSS'iyle (önce `npm run build`).

  Kullanım: node scripts/pencere-odak-tarayici.mjs   (BOYUTLAR=1363x936,390x844)
*/
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const KOK = path.resolve(import.meta.dirname, "..");
function rotaCss(rota) {
  const dosya = path.join(KOK, ".next/server/app", rota, "page_client-reference-manifest.js");
  if (!fs.existsSync(dosya)) throw new Error(`Önce \`npm run build\` (${path.relative(KOK, dosya)} yok).`);
  const kum = {}; new Function("self", "globalThis", fs.readFileSync(dosya, "utf8"))(kum, kum);
  const m = Object.values(kum.__RSC_MANIFEST)[0];
  return (m.entryCSSFiles[`[project]/app/${rota}/page`] ?? []).map((x) => path.join(KOK, ".next", x.path ?? x));
}
const css = [...new Set([...rotaCss("panel/crm"), ...rotaCss("panel/crm/requests/[id]")])];

const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "pencere-odak-"));
const shim = path.join(dizin, "shim"); fs.mkdirSync(shim);
fs.writeFileSync(path.join(shim, "link.tsx"), `export default function Link({ href, children, prefetch, scroll, replace, ...p }) { return <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>; }`);
fs.writeFileSync(path.join(shim, "navigation.ts"), `export const usePathname = () => "/panel/crm"; export const useSearchParams = () => new URLSearchParams(); export const useRouter = () => ({ push(){}, replace(){}, refresh(){} });`);
fs.writeFileSync(path.join(shim, "image.tsx"), `export default function Image(p) { return <img {...p} />; }`);
// Taklit işlemler: çağrılırsa sayılır (bu sınamada hiç çağrılmamalı).
const taklit = `const say = async () => { window.__cagri = (window.__cagri || 0) + 1; await new Promise((r) => setTimeout(r, window.__gecikme ?? 50)); };
export async function talepOlusturDurumlu() { await say(); return { tamam: false, hata: "taklit", alan: null, kimlik: Date.now() }; }
export async function createOpportunity() { await say(); }
export async function createProposal() { await say(); return { error: null }; }
export async function createContractDirectly() { await say(); return { error: null }; }
export async function lookupCustomerHistory() { return { ok: true, items: [], match: null }; }`;
fs.writeFileSync(path.join(shim, "taklit.ts"), taklit);

const a = (p) => JSON.stringify(path.join(KOK, p));
fs.writeFileSync(path.join(dizin, "giris.tsx"), `
import { createRoot } from "react-dom/client";
import { PanelDrawer } from ${a("app/panel/components/panel-drawer.tsx")};
import { TarihSecici } from ${a("app/panel/components/tarih-secici.tsx")};
import { RequestEntryForm } from ${a("app/panel/crm/request-entry-form.tsx")};
import { ProposalBuilderForm } from ${a("app/panel/crm/proposal-builder-form.tsx")};
import { OsNavigasyon } from ${a("app/panel/os/os-navigasyon.tsx")};
const uygulamalar = [
  { key: "home", label: "Ana ekran", href: "/panel", ikon: "home", yollar: [] },
  { key: "crm", label: "CRM", href: "/panel/crm/genel-bakis", ikon: "crm", yollar: ["/panel/crm"] },
  { key: "operations", label: "Operasyon", href: "/panel/operations", ikon: "operations", yollar: ["/panel/operations"] },
];
const temsilciler = [{ id: "t1", full_name: "Ayşe Nur Karadeniz", job_title: "Satış" }];
/* TEMSİLİ "Talebi düzenle": gerçek form requests/[id]/page.tsx'te (sunucu bileşeni). */
function DuzenleTemsili() {
  return <form className="panel-form kayit-formu" onSubmit={(e) => { e.preventDefault(); window.__cagri = (window.__cagri || 0) + 1; }}>
    <p className="wide kayit-formu-bolum">Talep</p>
    <label className="wide"><span>Talep konusu<b className="req" aria-hidden="true">*</b></span><input name="title" required defaultValue="Yüksek lisans tezi analiz desteği" /></label>
    <p className="wide kayit-formu-bolum">Müşteri</p>
    <label><span>Müşteri / kurum</span><input name="customer_name" defaultValue="Ayşe Nur Karadeniz" /></label>
    <label>Telefon<input name="contact_phone" type="tel" /></label>
    <label>E-posta<input name="contact_email" type="email" /></label>
    <label>Planlanan teslim tarihi<TarihSecici name="expected_close_date" /></label>
    <label className="wide">İç not<textarea name="notes" /></label>
    <div className="wide panel-form-actions kayit-formu-eylem"><p>Değişiklik kayıt geçmişine yazılır.</p><button className="panel-primary">Değişiklikleri kaydet</button></div>
  </form>;
}
function Kabuk() {
  return <div className="panel-root os-root"><main className="panel-frame os-frame">
    <header className="os-bar"><a className="os-brand" href="/panel"><i>A</i><span><b>Prova Kurum</b></span></a><button type="button" className="panel-secondary" id="arka-dugme">Arkadaki düğme</button></header>
    <section className="os-workspace"><div className="panel-content crm-page-stack" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <PanelDrawer triggerLabel="Yeni talep" kicker="YENİ KAYIT" triggerClassName="panel-primary t-talep" title="Talep Girişi">
        <RequestEntryForm academicMode salesRepresentatives={temsilciler} canAssign calismaTurleri={[]} hizmetTurleri={["Tez Danışmanlığı", "Diğer"]} />
      </PanelDrawer>
      <PanelDrawer triggerLabel="Düzenle" kicker="TALEP" triggerClassName="panel-secondary t-duzenle" title="Talebi düzenle"><DuzenleTemsili /></PanelDrawer>
      <PanelDrawer triggerLabel="Yeni teklif" kicker="YENİ TEKLİF" triggerClassName="panel-secondary t-teklif" title="Ayşe için teklif">
        <ProposalBuilderForm opportunityId="o1" title="Tez analizi" scope="Bölüm 3-4" representatives={temsilciler} needsRepresentative={false} />
      </PanelDrawer>
      <PanelDrawer triggerLabel="Direkt sözleşme" kicker="DİREKT SÖZLEŞME" triggerClassName="panel-secondary t-sozlesme" title="Ayşe için sözleşme">
        <ProposalBuilderForm opportunityId="o1" title="Tez analizi" scope="Bölüm 3-4" representatives={temsilciler} needsRepresentative={false} mode="contract" />
      </PanelDrawer>
    </div></section>
    <OsNavigasyon uygulamalar={uygulamalar} digerUygulamalar={[]} />
  </main></div>;
}
// Preview araç çubuğu benzeri: kabuğun DIŞINDA, body'nin çocuğu, gölge DOM'da düğme.
if (new URLSearchParams(location.search).get("dis") === "1") {
  class DisOge extends HTMLElement { connectedCallback() { const k = this.attachShadow({ mode: "open" }); k.innerHTML = '<button type="button">Geri bildirim</button>'; } }
  customElements.define("vercel-live-feedback", DisOge);
  document.body.appendChild(document.createElement("vercel-live-feedback"));
}
createRoot(document.getElementById("kok")).render(<Kabuk />);
`);
await build({
  entryPoints: [path.join(dizin, "giris.tsx")], bundle: true, outfile: path.join(dizin, "paket.js"), format: "iife",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '""' }, logLevel: "error",
  nodePaths: [path.join(KOK, "node_modules")],
  alias: { "next/link": path.join(shim, "link.tsx"), "next/navigation": path.join(shim, "navigation.ts"), "next/image": path.join(shim, "image.tsx"), "@": KOK },
  plugins: [{ name: "taklit", setup(b) {
    b.onResolve({ filter: /^\.\/(actions|proposal-actions|contract-actions|customer-history-actions)$/ }, () => ({ path: path.join(shim, "taklit.ts") }));
  } }],
  loader: { ".css": "empty" },
});
fs.writeFileSync(path.join(dizin, "sayfa.html"), `<!doctype html><html lang="tr" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css.map((d) => `<link rel="stylesheet" href="file://${d}">`).join("")}</head><body><div id="kok"></div><script src="paket.js"></script></body></html>`);

// Odaktaki öğeyi tanımla: pencere içi mi, dış öğe mi, arka plan mı.
const odak = () => {
  const e = document.activeElement;
  const pencere = document.querySelector(".panel-drawer-root.open .panel-drawer");
  const dis = e?.tagName === "VERCEL-LIVE-FEEDBACK";
  return {
    etiket: dis ? "VERCEL-LIVE-FEEDBACK" : e === document.body ? "BODY" : e?.classList.contains("panel-drawer-backdrop") ? "ARKA-PLAN-KATMANI" : (e?.getAttribute("name") || e?.getAttribute("aria-label") || e?.textContent?.trim().slice(0, 24) || e?.tagName),
    alan: Boolean(e?.getAttribute?.("name") && e.matches("input,select,textarea")) || Boolean(e?.classList?.contains("tsc-kutu")),
    icinde: Boolean(pencere && e && pencere.contains(e)), takvimde: Boolean(e?.closest(".tsc-takvim")),
    kapat: Boolean(e?.classList.contains("panel-drawer-close")), gonder: Boolean(e?.matches?.(".panel-drawer-root.open .panel-form-actions button:not([type=button])")),
  };
};
// Pencerenin klavyeyle ulaşılabilir kontrolleri (DOM sırası).
const kontroller = () => [...document.querySelectorAll(".panel-drawer-root.open .panel-drawer :is(a[href],button,input,select,textarea,[tabindex])")]
  .filter((e) => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && !e.closest("[inert]") && !(e.type === "hidden")).length;

const sonuclar = []; let kalan = 0;
const kaydet = (senaryo, ad, gecti, olcum) => { sonuclar.push({ senaryo, ad, gecti, olcum }); if (!gecti) kalan++; };
const pencereler = [["Yeni talep", ".t-talep"], ["Talebi düzenle (temsili)", ".t-duzenle"], ["Yeni teklif", ".t-teklif"], ["Direkt sözleşme", ".t-sozlesme"]];

const tarayici = await chromium.launch();
for (const [w, h] of (process.env.BOYUTLAR ?? "1363x936,390x844").split(",").map((b) => b.split("x").map(Number))) for (const dis of ["0", "1"]) for (const [ad, tetik] of pencereler) {
  const etiket = `${w}x${h} ${dis === "1" ? "dış öğe VAR" : "dış öğe yok"} · ${ad}`;
  const sayfa = await tarayici.newPage({ viewport: { width: w, height: h } });
  await sayfa.goto(`file://${path.join(dizin, "sayfa.html")}?dis=${dis}`);
  await sayfa.evaluate(() => { window.__cagri = 0; });
  try {
    await sayfa.locator(tetik).click(); await sayfa.waitForTimeout(600);
    const ilk = await sayfa.evaluate(odak);
    const n = await sayfa.evaluate(kontroller);

    // İleri Tab: n+3 adım; pencereden hiç çıkmamalı, son kontrolden sonra ilk kontrole dönmeli.
    const ileri = [];
    for (let i = 0; i < n + 3; i++) { await sayfa.keyboard.press("Tab"); ileri.push(await sayfa.evaluate(odak)); }
    const disari = ileri.filter((o) => !o.icinde);
    const sarma = ileri.some((o, i) => i > 0 && ileri[i - 1].gonder && o.kapat);
    kaydet(etiket, "açılışta odak ilk form alanında (fareli cihaz)", ilk.icinde && ilk.alan, { ilk });
    kaydet(etiket, "ileri Tab: pencereden çıkmaz; son kontrolden sonra ilk kontrol (Kapat)", !disari.length && sarma, { ilk, kontrol: n, disari: disari.map((o) => o.etiket).slice(0, 4), sarma });

    // Geri Tab: Kapat'tan Shift+Tab son kontrole (gönder düğmesi) gider.
    await sayfa.locator(".panel-drawer-root.open .panel-drawer-close").focus();
    await sayfa.keyboard.press("Shift+Tab");
    const geri = await sayfa.evaluate(odak);
    const geriDizi = [geri];
    for (let i = 0; i < n + 2; i++) { await sayfa.keyboard.press("Shift+Tab"); geriDizi.push(await sayfa.evaluate(odak)); }
    kaydet(etiket, "geri Tab: Kapat'tan son kontrole; pencereden çıkmaz", geri.gonder && geriDizi.every((o) => o.icinde), { geri: geri.etiket, disari: geriDizi.filter((o) => !o.icinde).map((o) => o.etiket).slice(0, 4) });

    // Kaydırırken odaklanan alan görünür: her Tab'da odaktaki alan gövdenin görünen kısmında ve kaydet çubuğunun ÜSTÜNDE.
    await sayfa.locator(".panel-drawer-root.open .panel-drawer-close").focus();
    const gizli = [];
    for (let i = 0; i < n; i++) {
      await sayfa.keyboard.press("Tab"); await sayfa.waitForTimeout(30);
      const g = await sayfa.evaluate(() => {
        const e = document.activeElement, govde = document.querySelector(".panel-drawer-root.open .panel-drawer-body");
        if (!govde?.contains(e) || e.closest(".panel-form-actions")) return null;
        const r = e.getBoundingClientRect(), gr = govde.getBoundingClientRect();
        const cubuk = govde.querySelector(".panel-form-actions")?.getBoundingClientRect();
        const alt = Math.min(gr.bottom, cubuk && cubuk.top > gr.top ? cubuk.top : gr.bottom);
        return r.top >= gr.top - 1 && r.bottom <= alt + 1 ? null : `${e.getAttribute("name") || e.tagName} (${Math.round(r.top)}–${Math.round(r.bottom)}, görünen ${Math.round(gr.top)}–${Math.round(alt)}; kaydırma ${Math.round(govde.scrollTop)}/${govde.scrollHeight - govde.clientHeight}, pay ${getComputedStyle(govde).scrollPaddingBottom})`;
      });
      if (g) gizli.push(g);
    }
    kaydet(etiket, "Tab ile gezerken odaklanan alan görünür (kaydet çubuğunun altında kalmaz)", !gizli.length, { gizli: gizli.slice(0, 3) });

    // Takvim: açılır, Esc yalnızca takvimi kapatır; ikinci Esc pencereyi kapatır, odak açan düğmeye döner.
    const kutu = sayfa.locator(".panel-drawer-root.open .tsc-kutu").first();
    let takvim = { atlandi: true };
    if (await kutu.count()) {
      await kutu.scrollIntoViewIfNeeded(); await kutu.click(); await sayfa.waitForTimeout(250);
      const acik = await sayfa.evaluate(() => Boolean(document.querySelector(".tsc[data-acik]")));
      await sayfa.keyboard.press("Escape"); await sayfa.waitForTimeout(150);
      const birinci = await sayfa.evaluate(() => ({ takvim: Boolean(document.querySelector(".tsc[data-acik]")), pencere: Boolean(document.querySelector(".panel-drawer-root.open")) }));
      takvim = { acik, birinci };
    }
    await sayfa.keyboard.press("Escape"); await sayfa.waitForTimeout(500);
    const kapandi = await sayfa.evaluate((t) => ({ pencere: Boolean(document.querySelector(".panel-drawer-root.open")), odakTetikte: document.activeElement?.matches(t) }), tetik);
    kaydet(etiket, "takvim: ilk Esc takvimi, ikinci Esc pencereyi kapatır; odak açan düğmeye döner",
      (takvim.atlandi || (takvim.acik && !takvim.birinci.takvim && takvim.birinci.pencere)) && !kapandi.pencere && kapandi.odakTetikte, { takvim, kapandi });

    // Yalnızca Yeni talep: hata alanları belirdikten sonra ve gönderim sürerken (düğme devre dışı) döngü bozulmaz.
    if (tetik === ".t-talep") {
      await sayfa.locator(tetik).click(); await sayfa.waitForTimeout(600);
      await sayfa.locator(".panel-drawer-root.open .panel-form-actions button:not([type=button])").click(); await sayfa.waitForTimeout(300);
      const n2 = await sayfa.evaluate(kontroller); const dizi = [];
      for (let i = 0; i < n2 + 3; i++) { await sayfa.keyboard.press("Tab"); dizi.push(await sayfa.evaluate(odak)); }
      kaydet(etiket, "hata alanları belirdikten sonra Tab döngüsü pencerede kalır", dizi.every((o) => o.icinde) && dizi.some((o) => o.kapat), { disari: dizi.filter((o) => !o.icinde).map((o) => o.etiket) });
      // Gönderim sürerken: zorunlu alanları doldur, 4 sn'lik taklit işlem başlat, Tab döngüsü devre dışı düğmeyi atlayıp sarmalı.
      await sayfa.fill("[name=customer_name]", "Ayşe Nur Karadeniz"); await sayfa.selectOption("[name=service_type]", { index: 1 });
      await sayfa.fill("[name=title]", "Tez analizi"); await sayfa.fill("[name=scope]", "Bölüm 3");
      await sayfa.evaluate(() => { window.__gecikme = 4000; });
      await sayfa.locator(".panel-drawer-root.open .panel-form-actions button:not([type=button])").click(); await sayfa.waitForTimeout(200);
      const n3 = await sayfa.evaluate(kontroller); const dizi2 = [];
      for (let i = 0; i < n3 + 3; i++) { await sayfa.keyboard.press("Tab"); dizi2.push(await sayfa.evaluate(odak)); }
      const devreDisi = await sayfa.evaluate(() => document.querySelector(".panel-drawer-root.open .panel-form-actions button:not([type=button])")?.disabled);
      kaydet(etiket, "gönderim sürerken (düğme devre dışı) Tab döngüsü pencerede kalır", devreDisi && dizi2.every((o) => o.icinde) && dizi2.some((o) => o.kapat), { devreDisi, disari: dizi2.filter((o) => !o.icinde).map((o) => o.etiket) });
      await sayfa.waitForTimeout(4200);
    }
  } catch (e) {
    kaydet(etiket, "sınama yarıda kaldı", false, { hata: e.message.split("\n")[0] });
  }
  await sayfa.close();
}
await tarayici.close();
fs.rmSync(dizin, { recursive: true, force: true });
for (const s of sonuclar) console.log(`${s.gecti ? "GEÇTİ" : "KALDI"}  ${s.senaryo} — ${s.ad}${s.gecti ? "" : "\n    " + JSON.stringify(s.olcum)}`);
console.log(`\n${sonuclar.length - kalan}/${sonuclar.length} geçti (bileşen düzeyi; gönderim yok; uygulama kabulü değil)`);
process.exit(kalan ? 1 : 0);
