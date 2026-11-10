/*
  YENİ TALEP FORMU — TARAYICI DÜZEYİ BİLEŞEN SINAMASI (10.11.2026, ortak form kontrolleri).

  CI'DA DEĞİL. UYGULAMA KABULÜ DEĞİLDİR: oturum, sunucu ve veritabanı yok.
  GERÇEK bileşenler (RequestEntryForm, PanelDrawer, FormAlani, GonderDugmesi,
  TarihSecici, OsNavigasyon) panelin GERÇEK derlenmiş CSS'iyle (CRM rotasının
  manifestosundan; önce `npm run build`) Chromium'da çizilir. Sunucu işlemi
  (talepOlusturDurumlu) bir TAKLİTTİR: gecikmesi ve sonucu sınamadan ayarlanır,
  kaç kez çağrıldığı sayılır. Müşteri geçmişi sorgusu boş döner.

  Kullanım: node scripts/talep-formu-tarayici.mjs
    BOYUTLAR=1363x936,1440x600,768x600,390x844  TEMALAR=light,dark
    EKRAN=<dizin> verilirse ekran görüntüleri oraya yazılır (depo dışında olmalı).
  Çıktı: senaryo başına GEÇTİ/KALDI ve ölçümler; çıkış kodu 1 = kalan var.
*/
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const KOK = path.resolve(import.meta.dirname, "..");
const EKRAN = process.env.EKRAN ? path.resolve(process.env.EKRAN) : null;
if (EKRAN && (EKRAN === KOK || EKRAN.startsWith(KOK + path.sep))) throw new Error("EKRAN depo dışında olmalı.");
if (EKRAN) fs.mkdirSync(EKRAN, { recursive: true });

function rotaCss(rota) {
  const dosya = path.join(KOK, ".next/server/app", rota, "page_client-reference-manifest.js");
  if (!fs.existsSync(dosya)) throw new Error(`Önce \`npm run build\` (${path.relative(KOK, dosya)} yok).`);
  const kum = {}; new Function("self", "globalThis", fs.readFileSync(dosya, "utf8"))(kum, kum);
  const m = Object.values(kum.__RSC_MANIFEST)[0];
  return (m.entryCSSFiles[`[project]/app/${rota}/page`] ?? []).map((x) => path.join(KOK, ".next", x.path ?? x));
}
const css = rotaCss("panel/crm");

const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "talep-formu-"));
const shim = path.join(dizin, "shim"); fs.mkdirSync(shim);
fs.writeFileSync(path.join(shim, "link.tsx"), `export default function Link({ href, children, prefetch, scroll, replace, ...p }) { return <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>; }`);
fs.writeFileSync(path.join(shim, "navigation.ts"), `export const usePathname = () => "/panel/crm"; export const useSearchParams = () => new URLSearchParams(); export const useRouter = () => ({ push(){}, replace(){}, refresh(){} });`);
fs.writeFileSync(path.join(shim, "image.tsx"), `export default function Image(p) { return <img {...p} />; }`);
// Sunucu işleminin taklidi: gecikme ve sonuç window'dan, çağrı sayılır.
fs.writeFileSync(path.join(shim, "actions.ts"), `
export async function talepOlusturDurumlu(_onceki, veri) {
  window.__cagri = (window.__cagri || 0) + 1;
  window.__sonVeri = Object.fromEntries(veri.entries());
  await new Promise((r) => setTimeout(r, window.__gecikme ?? 50));
  const s = window.__sonuc ?? { tamam: true };
  return { ...s, kimlik: Date.now() + Math.random() };
}
export async function createOpportunity() {}`);
fs.writeFileSync(path.join(shim, "gecmis.ts"), `export async function lookupCustomerHistory() { return { ok: true, items: [], match: null }; }`);

const a = (p) => JSON.stringify(path.join(KOK, p));
fs.writeFileSync(path.join(dizin, "giris.tsx"), `
import { createRoot } from "react-dom/client";
import { PanelDrawer } from ${a("app/panel/components/panel-drawer.tsx")};
import { RequestEntryForm } from ${a("app/panel/crm/request-entry-form.tsx")};
import { OsNavigasyon } from ${a("app/panel/os/os-navigasyon.tsx")};
const uygulamalar = [
  { key: "home", label: "Ana ekran", href: "/panel", ikon: "home", yollar: [] },
  { key: "crm", label: "CRM", href: "/panel/crm/genel-bakis", ikon: "crm", yollar: ["/panel/crm"] },
  { key: "operations", label: "Operasyon", href: "/panel/operations", ikon: "operations", yollar: ["/panel/operations"] },
  { key: "finance", label: "Finans", href: "/panel/finance", ikon: "finance", yollar: ["/panel/finance"] },
];
const temsilciler = [
  { id: "t1", full_name: "Ayşe Nur Karadeniz", job_title: "Kıdemli satış danışmanı" },
  { id: "t2", full_name: "Mehmet Ali Yılmazoğlu", job_title: "Kurumsal müşteri ilişkileri ve akademik danışmanlık koordinatörü" },
];
const turler = [{ code: "tez", name: "Tez", is_default: true, hizmet_turleri: ["Tez Danışmanlığı"] }, { code: "makale", name: "Makale", is_default: false }];
const hizmetler = ["Tez Danışmanlığı", "İstatistiksel Analiz ve Raporlama (SPSS, AMOS, SmartPLS ile yapısal eşitlik modellemesi)", "Makale Çevirisi", "Diğer"];
function Kabuk() {
  return <div className="panel-root os-root"><main className="panel-frame os-frame">
    <header className="os-bar"><a className="os-brand" href="/panel"><i>A</i><span><b>Prova Kurum</b></span></a></header>
    <section className="os-workspace"><div className="panel-content crm-page-stack">
      <PanelDrawer triggerLabel="Yeni talep" kicker="YENİ KAYIT" triggerClassName="panel-primary crm-new-request-trigger" title="Talep Girişi" description="Müşteri ve talep bilgilerini girin.">
        <RequestEntryForm academicMode salesRepresentatives={temsilciler} canAssign calismaTurleri={turler} hizmetTurleri={hizmetler} />
      </PanelDrawer>
    </div></section>
    <OsNavigasyon uygulamalar={uygulamalar} digerUygulamalar={[]} />
  </main></div>;
}
createRoot(document.getElementById("kok")).render(<Kabuk />);
`);
await build({
  entryPoints: [path.join(dizin, "giris.tsx")], bundle: true, outfile: path.join(dizin, "paket.js"), format: "iife",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '""' }, logLevel: "error",
  nodePaths: [path.join(KOK, "node_modules")],
  alias: { "next/link": path.join(shim, "link.tsx"), "next/navigation": path.join(shim, "navigation.ts"), "next/image": path.join(shim, "image.tsx"), "@": KOK },
  plugins: [{ name: "taklit", setup(b) {
    b.onResolve({ filter: /^\.\/actions$/ }, (x) => x.importer.endsWith("request-entry-form.tsx") ? { path: path.join(shim, "actions.ts") } : undefined);
    b.onResolve({ filter: /^\.\/customer-history-actions$/ }, () => ({ path: path.join(shim, "gecmis.ts") }));
  } }],
  loader: { ".css": "empty" },
});
for (const tema of ["light", "dark"]) fs.writeFileSync(path.join(dizin, `${tema}.html`), `<!doctype html><html lang="tr" data-theme="${tema}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css.map((d) => `<link rel="stylesheet" href="file://${d}">`).join("")}</head><body><div id="kok"></div><script src="paket.js"></script></body></html>`);

const sonuclar = [];
let kalan = 0;
const kaydet = (senaryo, ad, gecti, olcum) => { sonuclar.push({ senaryo, ad, gecti, olcum }); if (!gecti) kalan++; };

// Yerleşim ölçümü: sayfa, pencere, başlık, kaydet çubuğu, dock, yatay taşma.
const yerlesim = () => {
  const s = document.scrollingElement, p = document.querySelector(".panel-drawer"), g = p.querySelector(".panel-drawer-body"), bas = p.querySelector(".panel-drawer-header"), eylem = p.querySelector(".kayit-formu-eylem"), dugme = eylem.querySelector("button[type=submit]");
  const r = (e) => e.getBoundingClientRect();
  const db = r(dugme), ust = document.elementFromPoint(db.left + db.width / 2, db.top + db.height / 2);
  const tasan = [...p.querySelectorAll("*")].filter((e) => { const x = r(e); return x.width && (x.right > r(p).right + 1 || x.left < r(p).left - 1); }).slice(0, 3).map((e) => e.className || e.tagName);
  return {
    sayfaYatay: `${s.scrollWidth}/${s.clientWidth}`, sayfaDikey: `${s.scrollHeight}/${s.clientHeight}`,
    pencere: [Math.round(r(p).top), Math.round(r(p).bottom), Math.round(r(p).left), Math.round(r(p).right)], ekranIcinde: r(p).top >= -1 && r(p).bottom <= innerHeight + 1 && r(p).left >= -1 && r(p).right <= innerWidth + 1,
    govdeYatay: g.scrollWidth - g.clientWidth, govdeKayar: g.scrollHeight > g.clientHeight + 1,
    basUst: Math.round(r(bas).top), eylemAlt: Math.round(r(eylem).bottom), eylemGorunur: r(eylem).bottom <= Math.min(innerHeight, r(p).bottom) + 1,
    dugmeTiklanabilir: Boolean(ust && dugme.contains(ust)), tasan,
  };
};

const tarayici = await chromium.launch();
for (const [w, h] of (process.env.BOYUTLAR ?? "1363x936,1440x600,768x600,390x844").split(",").map((b) => b.split("x").map(Number))) {
  for (const tema of (process.env.TEMALAR ?? "light,dark").split(",")) {
    const etiket = `${w}x${h} ${tema}`;
    const sayfa = await tarayici.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: EKRAN ? 2 : 1 });
    await sayfa.goto(`file://${path.join(dizin, tema + ".html")}`);
    await sayfa.evaluate(() => { window.__gecikme = 50; window.__sonuc = { tamam: true }; window.__cagri = 0; });
    const tetik = sayfa.locator(".crm-new-request-trigger");
    await tetik.click(); await sayfa.waitForTimeout(600);
    const form = sayfa.locator("form.request-entry-form");
    const ekran = async (ad) => { if (EKRAN) await sayfa.screenshot({ path: path.join(EKRAN, `${w}x${h}-${tema}-${ad}.png`) }); };

    try {
    // 1. Yerleşim: açılış ve gövde sona kaydırılınca.
    const once = await sayfa.evaluate(yerlesim);
    await ekran("1-acilis");
    const g = sayfa.locator(".panel-drawer-body"); const gb = await g.boundingBox();
    await sayfa.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); for (let i = 0; i < 12; i++) await sayfa.mouse.wheel(0, 500); await sayfa.waitForTimeout(200);
    const sonra = await sayfa.evaluate(yerlesim);
    await sayfa.mouse.wheel(0, 3000); await sayfa.mouse.wheel(3000, 0);
    const sayfaKonum = await sayfa.evaluate(() => ({ x: scrollX, y: scrollY }));
    const yer = [once, sonra];
    kaydet(etiket, "yerleşim: sayfa kaymaz, yatay taşma yok, başlık sabit, kaydet çubuğu görünür ve dock örtmez",
      yer.every((o) => o.sayfaYatay.split("/")[0] === o.sayfaYatay.split("/")[1] && o.sayfaDikey.split("/")[0] === o.sayfaDikey.split("/")[1] && o.ekranIcinde && o.govdeYatay <= 1 && !o.tasan.length && o.eylemGorunur && o.dugmeTiklanabilir)
        && once.basUst === sonra.basUst && sayfaKonum.x === 0 && sayfaKonum.y === 0,
      { once, sonra, sayfaKonum });
    await g.evaluate((e) => { e.scrollTop = 0; });

    // 2. Klavye: pencereden Tab ile bütün adlı alanlara ve kaydet düğmesine ulaşılır.
    await sayfa.locator(".panel-drawer").focus();
    const ziyaret = new Set(); let dugmeye = false;
    for (let i = 0; i < 40 && !dugmeye; i++) {
      await sayfa.keyboard.press("Tab");
      const o = await sayfa.evaluate(() => { const e = document.activeElement; return { ad: e?.getAttribute("name") || e?.closest(".form-alani")?.querySelector("[name]")?.getAttribute("name") || null, dugme: e?.matches?.("button[type=submit]") ?? false, icinde: Boolean(e?.closest(".panel-drawer")) }; });
      if (!o.icinde) break;
      if (o.ad) ziyaret.add(o.ad);
      dugmeye = o.dugme;
    }
    const beklenen = await form.evaluate((f) => [...new Set([...f.elements].filter((e) => e.name && e.type !== "hidden" && !e.closest("[hidden]") && e.offsetParent !== null).map((e) => e.name))]);
    const eksik = beklenen.filter((ad) => !ziyaret.has(ad));
    kaydet(etiket, "klavye: Tab ile bütün alanlar ve Talebi kaydet", dugmeye && !eksik.length, { ziyaret: [...ziyaret], eksik });

    // 3. Boş zorunlu alanlarla gönderim: sunucu çağrılmaz, alan altı hata + özet + ilk alana odak.
    await sayfa.locator("button[type=submit]").click(); await sayfa.waitForTimeout(400);
    const bos = await sayfa.evaluate(() => {
      const f = document.querySelector("form.request-entry-form");
      const hatali = [...f.querySelectorAll("[aria-invalid=true]")].map((e) => ({ ad: e.name, bagli: (e.getAttribute("aria-describedby") || "").split(" ").some((id) => document.getElementById(id)?.classList.contains("form-alani-hata")) }));
      // Görsel: hatalı alanın çerçevesi hata metniyle aynı renkte (özgüllükte ezilmesin); boş seçim kutusu soluk.
      const tehlike = getComputedStyle(f.querySelector(".form-alani-hata")).color;
      const cerceve = [...f.querySelectorAll("[aria-invalid=true]")].filter((e) => !e.classList.contains("tsc-kutu")).map((e) => getComputedStyle(e).borderTopColor === tehlike);
      const bosSecim = getComputedStyle(f.querySelector("[name=service_type]")).color !== getComputedStyle(f.querySelector("[name=customer_type]")).color;
      return { cagri: window.__cagri, hatali, odak: document.activeElement?.name, ozet: f.querySelector(".form-ozet")?.textContent?.trim() ?? null, simge: Boolean(f.querySelector(".form-alani-hata svg")), metin: f.querySelector(".form-alani-hata")?.textContent?.trim(), kirmiziCerceve: cerceve.every(Boolean) && cerceve.length > 0, bosSecimSoluk: bosSecim };
    });
    await ekran("2-bos-gonderim");
    kaydet(etiket, "boş zorunlu alan: sunucu çağrılmaz, hata alana bağlı, simgeli ve kırmızı çerçeveli; boş seçim soluk; ilk hatalı alana odak; özet görünür",
      bos.cagri === 0 && bos.hatali.length >= 3 && bos.hatali.every((x) => x.bagli) && bos.odak === bos.hatali[0].ad && Boolean(bos.ozet) && bos.simge && bos.kirmiziCerceve && bos.bosSecimSoluk, bos);

    // 4. Alanı düzeltince hatası kalkar; geçersiz e-posta kendi metnini alır.
    const uzun = "Yüksek Lisans Tezi Danışmanlığı — İstatistik Bölümü Revizyonu ve Yapısal Eşitlik Modellemesi ile Hipotez Testleri Raporu";
    await sayfa.fill("[name=customer_name]", "Ayşe Nur Karadeniz-Yılmazoğlu Akademik Danışmanlık ve Eğitim Hizmetleri Limited Şirketi");
    await sayfa.fill("[name=contact_email]", "ayse@");
    await sayfa.selectOption("[name=service_type]", { index: 2 });
    await sayfa.fill("[name=title]", uzun);
    await sayfa.fill("[name=scope]", "Bölüm 3 ve 4: analiz, tablolar ve yorumlar. ".repeat(12));
    await sayfa.locator("button[type=submit]").click(); await sayfa.waitForTimeout(300);
    const eposta = await sayfa.evaluate(() => ({ cagri: window.__cagri, hatali: [...document.querySelectorAll("form [aria-invalid=true]")].map((e) => e.name), metin: document.querySelector("[name=contact_email]")?.closest(".form-alani")?.querySelector(".form-alani-hata")?.textContent?.trim(), odak: document.activeElement?.name, yatay: (() => { const f = document.querySelector(".panel-drawer-body"); return f.scrollWidth - f.clientWidth; })() }));
    kaydet(etiket, "düzeltilen alanların hatası kalkar; geçersiz e-posta açıklamalı; uzun değer taşmaz", eposta.cagri === 0 && eposta.hatali.join() === "contact_email" && /e-posta adresi/.test(eposta.metin ?? "") && eposta.odak === "contact_email" && eposta.yatay <= 1, eposta);
    await sayfa.fill("[name=contact_email]", "ayse@ornek.com");

    // 5. Sunucu hatası: değerler korunur, form içinde hata kutusu, sunucu bir kez çağrılır.
    await sayfa.evaluate(() => { window.__sonuc = { tamam: false, hata: "Hesabınız aktif bir satış personeli kaydıyla eşleşmiyor.", alan: null }; window.__gecikme = 300; });
    await sayfa.locator("button[type=submit]").click(); await sayfa.waitForTimeout(900);
    const sunucu = await sayfa.evaluate(() => ({
      // Hata kutusu kaydet çubuğunda tam satır mı, çubuk pencerenin üçte birini aşıyor mu (telefonda eşit pay kuralı sıkıştırıyordu).
      ozetGenislik: Math.round(document.querySelector(".form-ozet").getBoundingClientRect().width / document.querySelector(".kayit-formu-eylem").clientWidth * 100),
      cubukOrani: Math.round(document.querySelector(".kayit-formu-eylem").getBoundingClientRect().height / document.querySelector(".panel-drawer").getBoundingClientRect().height * 100),
      cagri: window.__cagri, ad: document.querySelector("[name=customer_name]").value, konu: document.querySelector("[name=title]").value, hizmet: document.querySelector("[name=service_type]").value, ozet: document.querySelector(".form-ozet")?.textContent?.trim(), acik: document.querySelector(".panel-drawer-root").classList.contains("open") }));
    await ekran("3-sunucu-hatasi");
    kaydet(etiket, "sunucu hatası: değerler korunur, hata form içinde tam satır, kaydet çubuğu formu örtmez, pencere açık", sunucu.cagri === 1 && sunucu.ad.length > 10 && sunucu.konu === uzun && Boolean(sunucu.hizmet) && /satış personeli/.test(sunucu.ozet ?? "") && sunucu.acik && sunucu.ozetGenislik >= 80 && sunucu.cubukOrani <= 40, sunucu);

    // 6. Sunucunun alan mesajı ilgili alanın altına düşer ve oraya gidilir.
    await sayfa.evaluate(() => { window.__sonuc = { tamam: false, hata: "Talep konusu en az 2 karakter olmalıdır.", alan: "title" }; });
    await sayfa.locator("button[type=submit]").click(); await sayfa.waitForTimeout(900);
    const alanHata = await sayfa.evaluate(() => ({ cagri: window.__cagri, odak: document.activeElement?.name, metin: document.querySelector("[name=title]").closest(".form-alani").querySelector(".form-alani-hata")?.textContent?.trim() }));
    kaydet(etiket, "sunucunun alan hatası alanın altında, odak o alanda", alanHata.cagri === 2 && alanHata.odak === "title" && /Talep konusu/.test(alanHata.metin ?? ""), alanHata);

    // 7. Uzun bekleme + hızlı çift tıklama + Enter: tek çağrı, düğme kilitli, 8 sn sonra "Hâlâ işleniyor".
    await sayfa.evaluate(() => { window.__sonuc = { tamam: false, hata: "Bağlantı zaman aşımına uğradı.", alan: null }; window.__gecikme = 9000; });
    const dugme = sayfa.locator(".kayit-formu-eylem button[type=submit]");
    const bostaZemin = await dugme.evaluate((b) => getComputedStyle(b).backgroundColor);
    await dugme.click(); await dugme.click({ force: true }).catch(() => {}); await sayfa.locator("[name=title]").press("Enter");
    await sayfa.waitForTimeout(300);
    const kilit = await sayfa.evaluate(() => ({ cagri: window.__cagri, disabled: document.querySelector(".kayit-formu-eylem button[type=submit]").disabled, metin: document.querySelector(".kayit-formu-eylem button[type=submit]").innerText.trim() }));
    await sayfa.waitForTimeout(8200);
    const uzunEtiket = await sayfa.evaluate(() => {
      const b = document.querySelector(".kayit-formu-eylem button[type=submit]"), br = b.getBoundingClientRect();
      const m = b.querySelector(".gonder-bekleme-uzun").getBoundingClientRect();
      // Etiket düğmenin içinde kalır; bekleyen düğme soluklaşmaz (devre dışı görünümü okunurluğu düşürüyordu).
      return { disabled: b.disabled, metin: b.innerText.trim(), icinde: m.left >= br.left - 1 && m.right <= br.right + 1 && m.top >= br.top - 1 && m.bottom <= br.bottom + 1, opaklik: Number(getComputedStyle(b).opacity), zemin: getComputedStyle(b).backgroundColor,
        // WCAG kontrastı: yazı ile zemin (devre dışı görünümü gri zemin + soluk yazıyla bunu düşürüyordu).
        kontrast: (() => { const l = (c) => { const [r, g, b2] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b2; }; const st = getComputedStyle(b); const [x, y] = [l(st.color), l(st.backgroundColor)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); })() };
    });
    await ekran("4-uzun-bekleme");
    await sayfa.waitForTimeout(1200);
    const bitti = await sayfa.evaluate(() => ({ cagri: window.__cagri, disabled: document.querySelector(".kayit-formu-eylem button[type=submit]").disabled }));
    kaydet(etiket, "uzun bekleme ve çift gönderim: tek çağrı, süre boyunca kilitli, 8 sn'de 'Hâlâ işleniyor', bitince açılır",
      kilit.cagri === 3 && kilit.disabled && /Kaydediliyor/.test(kilit.metin) && uzunEtiket.disabled && /Hâlâ işleniyor/.test(uzunEtiket.metin) && uzunEtiket.icinde && uzunEtiket.opaklik >= 0.95 && uzunEtiket.kontrast >= 4.5 && bitti.cagri === 3 && !bitti.disabled, { kilit, uzunEtiket, bostaZemin, bitti });

    // 8. Seçici ve tarih: klavyeyle seçim; tarih seçicide Esc yalnızca takvimi kapatır, odak kutuya döner.
    await sayfa.locator("[name=customer_type]").focus(); await sayfa.keyboard.press("ArrowDown"); await sayfa.waitForTimeout(100);
    const secim = await sayfa.evaluate(() => document.querySelector("[name=customer_type]").value);
    const tarih = sayfa.locator(".request-entry-form .tsc-kutu");
    await tarih.click(); await sayfa.waitForTimeout(250);
    const takvimAcik = await sayfa.evaluate(() => { const t = document.querySelector(".tsc-takvim, [role=dialog].tsc-pencere, .tsc-acilir"); const r = t?.getBoundingClientRect(); return t ? { var: true, ekranIcinde: r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1 } : { var: false }; });
    await sayfa.keyboard.press("Escape"); await sayfa.waitForTimeout(200);
    const esc = await sayfa.evaluate(() => ({ pencereAcik: document.querySelector(".panel-drawer-root").classList.contains("open"), odakKutuda: document.activeElement?.classList.contains("tsc-kutu"), takvimKapali: !document.querySelector(".tsc[data-acik]") }));
    kaydet(etiket, "seçici: klavyeyle seçim; takvim ekranda, Esc yalnızca takvimi kapatır, odak kutuda", secim === "Kurumsal" && takvimAcik.var && takvimAcik.ekranIcinde && esc.pencereAcik && esc.odakKutuda && esc.takvimKapali, { secim, takvimAcik, esc });

    // 9. Başarı: form sıfırlanır, pencere kapanır, odak tetik düğmesine döner.
    await sayfa.evaluate(() => { window.__sonuc = { tamam: true }; window.__gecikme = 200; });
    await sayfa.locator(".kayit-formu-eylem button[type=submit]").click(); await sayfa.waitForTimeout(1200);
    const basari = await sayfa.evaluate(() => ({ cagri: window.__cagri, ad: document.querySelector("[name=customer_name]").value, konu: document.querySelector("[name=title]").value, acik: document.querySelector(".panel-drawer-root").classList.contains("open"), hata: document.querySelectorAll("form [aria-invalid=true]").length, ozet: Boolean(document.querySelector(".form-ozet")), odak: document.activeElement?.className ?? "" }));
    kaydet(etiket, "başarı yalnızca sunucu 'tamam' deyince: form sıfır, hata yok, pencere kapalı", basari.cagri === 4 && basari.ad === "" && basari.konu === "" && !basari.acik && basari.hata === 0 && !basari.ozet, basari);

    // 10. Esc pencereyi kapatır, odak tetik düğmesine döner.
    await tetik.click(); await sayfa.waitForTimeout(600);
    await sayfa.keyboard.press("Escape"); await sayfa.waitForTimeout(500);
    const kapat = await sayfa.evaluate(() => ({ acik: document.querySelector(".panel-drawer-root").classList.contains("open"), odakTetikte: document.activeElement?.classList.contains("crm-new-request-trigger") }));
    kaydet(etiket, "Esc pencereyi kapatır, odak 'Yeni talep' düğmesine döner", !kapat.acik && kapat.odakTetikte, kapat);
    } catch (e) {
      // Beklenen yapı yoksa (ör. eski form) sınama yarıda kalır: kalan senaryolar sayılmaz, bu satır KALDI.
      kaydet(etiket, "sınama yarıda kaldı (beklenen öğe yok ya da etkileşim başarısız)", false, { hata: e.message.split("\n")[0] });
    }

    await sayfa.close();
  }
}
await tarayici.close();
fs.rmSync(dizin, { recursive: true, force: true });
for (const s of sonuclar) console.log(`${s.gecti ? "GEÇTİ" : "KALDI"}  ${s.senaryo}  ${s.ad}${s.gecti ? "" : "\n    " + JSON.stringify(s.olcum)}`);
console.log(`\n${sonuclar.length - kalan}/${sonuclar.length} geçti (bileşen düzeyi; sunucu taklit; uygulama kabulü değil)`);
process.exit(kalan ? 1 : 0);
