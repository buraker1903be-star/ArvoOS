/*
  GENEL BAKIŞ YERLEŞİMİ — TARAYICI DÜZEYİ BİLEŞEN ÖLÇÜMÜ (10.11.2026, FX-01/02/03).

  CI'DA DEĞİL. UYGULAMA KABULÜ DEĞİLDİR: oturum, sunucu verisi, gerçek sayfa ve
  kabuğun sunucu bileşeni (layout.tsx) yok. Ölçülen şey, panelin GERÇEK derlenmiş
  CSS'i (.next/static altındaki *.css, `npm run build` sonrası) ile GERÇEK bileşenlerin
  (GenelBakis, SeriKarti, ListeKarti, ListeSatiri, GorunumSecici, OsNavigasyon,
  KurulumOzeti) sentetik veriyle Chromium'daki geometrisidir. Kabuk iskeleti
  (os-root > os-frame > os-bar + os-workspace > panel-content, dock) layout.tsx'teki
  sınıflarla elle kurulur. next/link, next/navigation, next/image basit karşılıkla.

  Kullanım: KOK=<depo> node scripts/genel-bakis-yerlesim-tarayici.mjs
    (önce `npm run build`; KOK verilmezse bu depo). Çıktı: JSON ölçümler.
  Kurulum bileşeni (os/kurulum-ozeti.tsx) yoksa eski kurulum kartı aynı sınıflarla
  çizilir — "önce" ölçümü için (8fa62a3).
*/
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const KOK = path.resolve(process.env.KOK ?? path.join(import.meta.dirname, ".."));
const yeniKurulum = fs.existsSync(path.join(KOK, "app/panel/os/kurulum-ozeti.tsx"));
/* Yalnızca rotanın GERÇEKTEN yüklediği CSS: .next/static altında 70'i aşkın
   dosya var (pazarlama sitesi dahil); hepsini bağlamak panelde olmayan genel
   kuralları da uygulardı. Liste Next'in rota manifestosundan (entryCSSFiles). */
function rotaCss(rota) {
  const dosya = path.join(KOK, ".next/server/app", rota, "page_client-reference-manifest.js");
  if (!fs.existsSync(dosya)) throw new Error(`Önce \`npm run build\` (${path.relative(KOK, dosya)} yok).`);
  const kum = { self: {} }; kum.globalThis = kum.self;
  new Function("self", "globalThis", fs.readFileSync(dosya, "utf8"))(kum.self, kum.self);
  const m = Object.values(kum.self.__RSC_MANIFEST)[0];
  return (m.entryCSSFiles[`[project]/app/${rota}/page`] ?? []).map((x) => path.join(KOK, ".next", x.path ?? x));
}
const cssler = { ana: rotaCss("panel"), crm: rotaCss("panel/crm/genel-bakis") };

const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "yerlesim-"));
const shim = path.join(dizin, "shim");
fs.mkdirSync(shim);
fs.writeFileSync(path.join(shim, "link.tsx"), `export default function Link({ href, children, prefetch, scroll, replace, ...p }) { return <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>; }`);
fs.writeFileSync(path.join(shim, "navigation.ts"), `export const usePathname = () => window.__yol || "/panel"; export const useSearchParams = () => new URLSearchParams(); export const useRouter = () => ({ push(){}, replace(){}, refresh(){} });`);
fs.writeFileSync(path.join(shim, "image.tsx"), `export default function Image({ src, alt, width, height, className }) { return <img src={src} alt={alt} width={width} height={height} className={className} />; }`);

const a = (p) => JSON.stringify(path.join(KOK, p));
fs.writeFileSync(path.join(dizin, "giris.tsx"), `
import { createRoot } from "react-dom/client";
import { GenelBakis, ListeKarti, ListeSatiri, SeriKarti } from ${a("app/panel/os/genel-bakis.tsx")};
import { GorunumSecici } from ${a("app/panel/os/gorunum-secici.tsx")};
import { OsNavigasyon } from ${a("app/panel/os/os-navigasyon.tsx")};
${yeniKurulum ? `import { KurulumOzeti } from ${a("app/panel/os/kurulum-ozeti.tsx")};` : ""}
const sayfa = new URLSearchParams(location.search).get("sayfa") || "ana";
window.__yol = sayfa === "crm" ? "/panel/crm/genel-bakis" : "/panel";
const gun = (i) => { const d = new Date(Date.UTC(2026, 10, 10 - (13 - i))); return d; };
const seri = { days: Array.from({ length: 14 }, (_, i) => ({ key: "g" + i, day: String(i + 1), title: "Gün " + (i + 1), count: [2,5,1,0,3,4,6,2,1,3,5,2,4,3][i], isToday: i === 13 })), total: 41, previous: 33, max: 6, aralik: "28 Eki – 10 Kas", oncekiAralik: "14–27 Eki" };
const uygulamalar = [
  { key: "home", label: "Ana ekran", href: "/panel", ikon: "home", yollar: [] },
  { key: "crm", label: "CRM", href: "/panel/crm/genel-bakis", ikon: "crm", yollar: ["/panel/crm"], bolumler: [{ key: "genel-bakis", label: "Genel Bakış", href: "/panel/crm/genel-bakis" }, { key: "talepler", label: "Talepler", href: "/panel/crm" }, { key: "teklifler", label: "Teklifler", href: "/panel/crm/proposals" }, { key: "sozlesmeler", label: "Sözleşmeler", href: "/panel/crm/contracts" }] },
  { key: "operations", label: "Operasyon", href: "/panel/operations", ikon: "operations", yollar: ["/panel/operations"] },
  { key: "finance", label: "Finans", href: "/panel/finance", ikon: "finance", yollar: ["/panel/finance"] },
  { key: "hr", label: "İK", href: "/panel/hr", ikon: "hr", yollar: ["/panel/hr"] },
  { key: "settings", label: "Ayarlar", href: "/panel/settings", ikon: "settings", yollar: ["/panel/settings"] },
];
const isler = [
  ["Yüksek Lisans Tezi Danışmanlığı — İstatistik Bölümü Revizyonu", "Ayşe Nur Karadeniz", "12 gün gecikti", "danger"],
  ["Doktora Tezi Biçimsel Düzenleme", "Mehmet Ali Yılmazoğlu", "3 gün gecikti", "danger"],
  ["Makale Çevirisi ve Dergi Gönderimi", "Zeynep Kaya", "Bugün teslim", "warning"],
  ["Veri Analizi — Anket Çalışması", "Can Demir", "2 gün kaldı", "warning"],
  ["Literatür Taraması Danışmanlığı", "Elif Şahin", "9 gün kaldı", "info"],
  ["Araştırma Tasarımı Görüşmesi", "Burak Öztürk", "21 gün kaldı", "info"],
];
const satir = ([t, m, r, tone], i) => <ListeSatiri key={i} href={"/panel/operations/" + i} baslik={t} alt={<><span className="dash-col-musteri">{m}</span> · Devam ediyor</>} sag={<span className="status-pill" data-tone={tone}>{r}</span>} />;
const grup = (liste) => [
  { anahtar: "gecikmis", baslik: "Gecikmiş", ton: "danger", satirlar: liste.slice(0, 2).map(satir) },
  { anahtar: "yaklasan", baslik: "Yaklaşan", satirlar: liste.slice(2).map((x, i) => satir(x, i + 2)) },
];
function EskiKurulum() {
  const adimlar = [["Kurum ve marka", "Resmi ad, iletişim, logo ve marka rengi", true], ["Resmi bilgiler ve IBAN", "5/8 zorunlu alan dolu", false], ["Logo ve kaşe-imza", "Kaşe-imza görseli eksik", false], ["İlk talebinizi girin", "Teklif, sözleşme ve takip buradan başlar", false]];
  return <section className="dash-card dash-setup" aria-label="Kurulum"><header className="dash-card-head"><div><h2>Kurulumu tamamlayın</h2><p>Teklif, sözleşme ve müşteri takip ekranınızın eksiksiz görünmesi için 3 zorunlu adım kaldı.</p></div><div className="dash-setup-progress"><b>1/4</b><span><i /></span><small>4 zorunlu adımdan 1 tanesi tamamlandı</small></div></header>
    <ol className="dash-setup-list">{adimlar.map(([b, n, d], i) => <li key={i}><a className={"dash-setup-step" + (d ? " is-done" : "")} href="#"><span className="dash-setup-dot">{i + 1}</span><span className="dash-setup-text"><b>{b}</b><small>{n}</small><span className="dash-setup-go">Tamamla</span></span></a></li>)}</ol>
    <div className="dash-setup-istege"><small className="dash-setup-istege-bas">İsteğe bağlı · kurulum ilerlemesine sayılmaz</small><ul className="dash-setup-list"><li><a className="dash-setup-step is-istege" href="#"><span className="dash-setup-dot">+</span><span className="dash-setup-text"><b>Ekibinizi davet edin</b><small>Satış ve operasyon ekibinizi ekleyin</small><span className="dash-setup-go">Davet et</span></span></a></li></ul></div></section>;
}
function Kurulum() {
  ${yeniKurulum ? `return <KurulumOzeti tamamlanan={1} toplam={4} yuzde={25} ozet="4 zorunlu adımdan 1 tanesi tamamlandı" devamHref="/panel/settings"><ol className="dash-setup-list"><li><a className="dash-setup-step" href="#"><span className="dash-setup-text"><b>Resmi bilgiler</b></span></a></li></ol></KurulumOzeti>;` : "return <EskiKurulum />;"}
}
function Ana() {
  const paneller = [
    { anahtar: "kurulum", etiket: "Kurulum", yer: "ust", icerik: <Kurulum /> },
    { anahtar: "talepler", etiket: "Talepler", yer: "ust", icerik: <SeriKarti baslik="Yeni talepler" alt="Son 14 gün" seri={seri} adet="talep" /> },
    { anahtar: "operasyon", etiket: "Operasyon", yer: "liste", icerik: <ListeKarti baslik="Operasyon" alt="Termini en yakın 6 iş" bos="Açık operasyon yok." href="/panel/operations/isler" hrefEtiket="Tüm işler" sayi={6} gruplar={grup(isler)} /> },
    { anahtar: "asamalar", etiket: "Aşamalar", yer: "liste", icerik: <ListeKarti baslik="Aşama tarihleri" alt="Tarihi en yakın 6 aşama" bos="Tarihi girilmiş açık aşama yok." href="/panel/operations/takvim" hrefEtiket="Takvimde gör" sayi={6} gruplar={grup(isler)} /> },
    { anahtar: "mesajlar", etiket: "Mesajlar", yer: "liste", grup: "iletisim", icerik: <ListeKarti baslik="Müşteri mesajları" alt="Gelen müşteri mesajları, son 6" bos="Müşterilerden mesaj yok." href="/panel/operations/isler" hrefEtiket="İşlere git" sayi={0} /> },
    { anahtar: "posta", etiket: "Posta", yer: "liste", grup: "iletisim", icerik: <ListeKarti baslik="Gelen postalar" alt="Gelen müşteri e-postaları" bos="Ortak posta kutusu henüz bağlı değil." href="/panel/settings" hrefEtiket="Posta kutusunu bağla" sayi={0} /> },
  ];
  return <GenelBakis sinif="dash-sabit" ust={<span className="dash-tarih">10 Kasım Salı</span>} baslik="İyi günler, Deniz"><GorunumSecici etiket="Ana ekran görünümü" paneller={paneller} /></GenelBakis>;
}
function Crm() {
  const kart = (b, n, dolu) => <ListeKarti baslik={b} alt="Açıklama" bos="Bu listede kayıt yok." href="/panel/crm" hrefEtiket="Tümü" sayi={dolu ? 6 : 0}>{dolu ? isler.map(satir) : null}</ListeKarti>;
  const paneller = [
    { anahtar: "talepler", etiket: "Talepler", yer: "ust", icerik: <SeriKarti baslik="Yeni talepler" alt="Son 14 gün" seri={seri} adet="talep" /> },
    { anahtar: "yeni", etiket: "Yeni talepler", yer: "liste", icerik: kart("Yeni talepler", 1, true) },
    { anahtar: "teklif", etiket: "Teklifler", yer: "liste", icerik: kart("Yanıt bekleyen teklifler", 2, false) },
    { anahtar: "imza", etiket: "İmza bekleyen", yer: "liste", icerik: kart("İmza bekleyen sözleşmeler", 3, false) },
    { anahtar: "imzali", etiket: "İmzalananlar", yer: "liste", icerik: kart("Son imzalanan sözleşmeler", 4, true) },
  ];
  return <GenelBakis gizliBaslik="CRM genel bakış" sinif="dash-sabit"><GorunumSecici etiket="CRM görünümü" paneller={paneller} /></GenelBakis>;
}
function Kabuk() {
  return <div className="panel-root os-root"><main className="panel-frame os-frame">
    <header className="os-bar"><a className="os-brand" href="/panel"><i>A</i><span><b>Prova Kurum</b></span></a></header>
    <section className="os-workspace">${'{'}/* bölüm menüsü CRM'de layout'ta; burada yükseklik payı CSS tahmininden */${'}'}<div className="panel-content">{sayfa === "crm" ? <Crm /> : <Ana />}</div></section>
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
  loader: { ".css": "empty" },
});
const html = (tema, s) => `<!doctype html><html lang="tr" data-theme="${tema}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${cssler[s].map((d) => `<link rel="stylesheet" href="file://${d}">`).join("")}</head><body><div id="kok"></div><script src="paket.js"></script></body></html>`;
for (const tema of ["acik", "koyu"]) for (const s of ["ana", "crm"]) fs.writeFileSync(path.join(dizin, `${tema}-${s}.html`), html(tema === "acik" ? "light" : "dark", s));

const olc = () => {
  const r = (e) => e ? Math.round(e.getBoundingClientRect().height) : null;
  const s = document.scrollingElement;
  const kartlar = [...document.querySelectorAll(".dash-gorunum-panel")].filter((p) => p.offsetParent !== null).map((p) => {
    const kart = p.firstElementChild;
    const govde = kart?.querySelector(".dash-col-govde");
    const gr = govde?.getBoundingClientRect();
    const tam = govde ? [...govde.querySelectorAll("li")].filter((li) => { const l = li.getBoundingClientRect(); return l.top >= gr.top - 1 && l.bottom <= gr.bottom + 1; }).length : null;
    return { panel: p.id.replace("gorunum-", ""), kart: r(kart), kartKaydirma: kart ? `${kart.scrollHeight}/${kart.clientHeight}` : null, govde: r(govde), tamGorunenKayit: tam, kayit: govde ? govde.querySelectorAll("li").length : null, yatayTasma: kart ? kart.scrollWidth > kart.clientWidth + 1 : null };
  });
  const dock = document.querySelector(".os-dock")?.getBoundingClientRect();
  const icerikAlt = Math.max(...[...document.querySelectorAll(".dash-card")].filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect().bottom));
  return { sayfaYatay: `${s.scrollWidth}/${s.clientWidth}`, sayfaDikey: `${s.scrollHeight}/${s.clientHeight}`, dockUstu: Math.round(dock?.top ?? 0), icerikAlt: Math.round(icerikAlt), dockOrtuyor: icerikAlt > (dock?.top ?? Infinity) + 1, kartlar };
};

const sonuc = {};
const tarayici = await chromium.launch();
for (const [w, h] of (process.env.BOYUTLAR ?? "1363x936,1440x900,1440x600,768x600,390x844").split(",").map((b) => b.split("x").map(Number))) {
  for (const tema of (process.env.TEMALAR ?? "acik,koyu").split(",")) {
    for (const s of ["ana", "crm"]) {
      const sayfa = await tarayici.newPage({ viewport: { width: w, height: h } });
      await sayfa.goto(`file://${path.join(dizin, `${tema}-${s}.html`)}?sayfa=${s}`);
      await sayfa.waitForTimeout(300);
      const o = await sayfa.evaluate(olc);
      // Kurulum: eski kartta başlık kaydırmayla kayıyor mu; yenide pencere ve odak dönüşü.
      if (s === "ana") {
        if (!yeniKurulum) {
          o.kurulumBaslik = await sayfa.evaluate(() => { const k = document.querySelector(".dash-setup"); if (!k) return null; const once = Math.round(k.querySelector("h2").getBoundingClientRect().top); const p = k.closest(".dash-gorunum-panel"); (p.scrollHeight > p.clientHeight ? p : k).scrollTop = 999; return { once, sonra: Math.round(k.querySelector("h2").getBoundingClientRect().top), kart: `${k.scrollHeight}/${k.clientHeight}` }; });
        } else if (await sayfa.locator(".dash-kurulum").isVisible()) {
          const once = await sayfa.evaluate(() => Math.round(document.querySelector(".dash-kurulum h2").getBoundingClientRect().top));
          await sayfa.locator(".dash-kurulum button.panel-secondary").click();
          const acik = await sayfa.evaluate(() => { const d = document.querySelector(".dash-kurulum-pencere"); return { acik: d.open, odakIcinde: d.contains(document.activeElement) }; });
          await sayfa.keyboard.press("Escape");
          const kapandi = await sayfa.evaluate(() => ({ acik: document.querySelector(".dash-kurulum-pencere").open, odakDugmede: document.activeElement?.textContent === "Adımları göster" }));
          o.kurulum = { baslikTop: once, pencere: acik, kapaninca: kapandi };
        }
        // Son kayda erişim: Operasyon gövdesini sona kaydır.
        o.sonKayit = await sayfa.evaluate(() => { const g = document.querySelector("#gorunum-operasyon .dash-col-govde"); if (!g || g.offsetParent === null) return null; g.scrollTop = g.scrollHeight; const li = [...g.querySelectorAll("li")].pop(); const a = li.getBoundingClientRect(), b = g.getBoundingClientRect(); return a.bottom <= b.bottom + 1 && a.top >= b.top - 1; });
      }
      // Görünüm seçici açıksa (dar/kısa ekran) her paneli sırayla seçip ölç:
      // varsayılan seçim yalnızca ilk paneli gösteriyor, listeler görünmüyor.
      const secici = sayfa.locator(".dash-gorunum-sec");
      if (await secici.isVisible()) {
        o.secimler = {};
        for (const d of await secici.locator("button").all()) {
          if (!(await d.isVisible())) continue;
          await d.click();
          await sayfa.waitForTimeout(50);
          const m = await sayfa.evaluate(olc);
          m.sonKayit = await sayfa.evaluate(() => { const g = [...document.querySelectorAll(".dash-gorunum-panel.is-secili .dash-col-govde")].find((e) => e.offsetParent !== null); if (!g || !g.querySelector("li")) return null; g.scrollTop = g.scrollHeight; const li = [...g.querySelectorAll("li")].pop(); const a = li.getBoundingClientRect(), b = g.getBoundingClientRect(); return a.bottom <= b.bottom + 1 && a.top >= b.top - 1; });
          o.secimler[(await d.textContent()).trim()] = m;
        }
      }
      sonuc[`${w}x${h} ${tema} ${s}`] = o;
      await sayfa.close();
    }
  }
}
await tarayici.close();
fs.rmSync(dizin, { recursive: true, force: true });
console.log(JSON.stringify({ kok: KOK, yeniKurulum, not: "bileşen düzeyi ölçüm; uygulama kabulü değil", sonuc }, null, 1));
