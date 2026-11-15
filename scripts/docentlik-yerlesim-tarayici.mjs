/*
  DOÇENTLİK ÇALIŞMA ALANI — TARAYICI DÜZEYİ BİLEŞEN ÖLÇÜMÜ (F6 PR6a, 15.11.2026).

  CI'DA DEĞİL. UYGULAMA KABULÜ DEĞİLDİR: oturum, Supabase, sunucu işlemi ve
  panelin sunucu kabuğu (layout.tsx) yok. Ölçülen şey, panelin GERÇEK
  derlenmiş CSS'i (`npm run build` sonrası .next/static, rotanın kendi CSS
  listesi) ile GERÇEK sayfa bileşenlerinin (app/panel/docentlik/page.tsx,
  faaliyetler/page.tsx, profil/page.tsx ve içlerindeki FaaliyetFormu,
  FaaliyetSil, PanelModal, TarihSecici) SENTETİK veriyle Chromium'daki
  geometrisi, kontrastı ve klavye davranışı. Veri işlevleri (veri.ts) ve
  sunucu işlemleri (actions.ts) burada taklit: özet yine GERÇEK
  docentlikOzeti (PR #318 çekirdeği) ile hesaplanıyor. Kabuk iskeleti
  (os-root > os-frame > os-workspace > panel-content) elle kuruluyor.

  Ölçümler (her ekran × boyut × tema):
    - sayfa yatay taşması ve görünür alanın dışına taşan öğe;
    - metin kontrastı (WCAG; 4,5 altı normal metin, 3 altı büyük metin);
    - Yeni faaliyet penceresi: açılıyor mu, form pencereye sığıyor mu,
      odak pencerede mi, Tab sırası alanları sırayla geziyor mu, Esc kapatıyor mu.

  Kullanım: KOK=<depo> node scripts/docentlik-yerlesim-tarayici.mjs
    (önce `npm run build`). Çıktı: JSON; sorun varsa çıkış kodu 1.
*/
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const KOK = path.resolve(process.env.KOK ?? path.join(import.meta.dirname, ".."));

function rotaCss(rota) {
  const dosya = path.join(KOK, ".next/server/app", rota, "page_client-reference-manifest.js");
  if (!fs.existsSync(dosya)) throw new Error(`Önce \`npm run build\` (${path.relative(KOK, dosya)} yok).`);
  const kum = { self: {} }; kum.globalThis = kum.self;
  new Function("self", "globalThis", fs.readFileSync(dosya, "utf8"))(kum.self, kum.self);
  const m = Object.values(kum.self.__RSC_MANIFEST)[0];
  return (m.entryCSSFiles[`[project]/app/${rota}/page`] ?? []).map((x) => path.join(KOK, ".next", x.path ?? x));
}
const cssler = {
  ana: rotaCss("panel/docentlik"),
  faaliyetler: rotaCss("panel/docentlik/faaliyetler"),
  profil: rotaCss("panel/docentlik/profil"),
};

const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "docentlik-yerlesim-"));
const shim = path.join(dizin, "shim");
fs.mkdirSync(shim);
fs.writeFileSync(path.join(shim, "link.tsx"), `export default function Link({ href, children, prefetch, scroll, replace, ...p }) { return <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>; }`);
fs.writeFileSync(path.join(shim, "navigation.ts"), `export const usePathname = () => "/panel/docentlik"; export const useSearchParams = () => new URLSearchParams(); export const useRouter = () => ({ push(){}, replace(){}, refresh(){} }); export function redirect(a) { throw new Error("redirect " + a); }`);
fs.writeFileSync(path.join(shim, "bos.ts"), `export {}; export const revalidatePath = () => {};`);

/* Taklit veri: uzun başlık, tavana takılan grup, doktora sonrası hedef (dolu);
   profil/faaliyet/hedef yok (bos). Özet GERÇEK docentlikOzeti ile. */
const KURUM = "00000000-0000-4000-8000-0000000000a1";
fs.writeFileSync(path.join(shim, "veri.ts"), `
import { docentlikOzeti, kendiDonemi } from ${JSON.stringify(path.join(KOK, "lib/docentlik-islem.ts"))};
const bos = new URLSearchParams(location.search).get("veri") === "bos";
const K = (id, code, label, grup, puan, aktif = true) => ({ id, code, label, category_group: grup, points_per_unit: puan, is_active: aktif, temel_alan: null, alt_alan: null });
const kriterler = bos ? [] : [
  K("k1", "A1", "SCI-E, SSCI veya AHCI kapsamındaki dergilerde yayımlanmış özgün araştırma makalesi", "Uluslararası makale", 20),
  K("k2", "B3", "Ulusal hakemli dergide makale", "Ulusal makale", 8),
  K("k3", "C1", "TÜBİTAK veya AB çerçeve programı projesinde yürütücülük", "Projeler", 15),
  K("k4", "D2", "Lisansüstü ders", null, 2),
  K("k5", "Z9", "Pasife alınmış eski kriter", "Uluslararası makale", 10, false),
];
const profil = bos ? null : { doktora_tarihi: "2019-06-15", temel_alan: "Sosyal, Beşeri ve İdari Bilimler", alt_alan: null, updated_at: "2026-11-01T10:00:00Z" };
const uzun = "Yükseköğretim kurumlarında akademik performans ölçütlerinin çok düzeyli modellenmesi: Türkiye örneğinde boylamsal bir inceleme ve politika önerileri";
const satirlar = bos ? [] : Array.from({ length: 12 }, (_, i) => ({
  id: "00000000-0000-4000-8000-" + String(i).padStart(12, "0"), owner_id: "u", criteria_id: ["k1","k2","k3","k4","k5"][i % 5],
  title: i === 0 ? uzun : "Faaliyet " + (i + 1), unit_count: i % 4 === 3 ? "0.5" : "1", yazar_sayisi: (i % 3) + 1, baslica_yazar: i % 2 === 0,
  faaliyet_tarihi: i % 6 === 5 ? null : "202" + (i % 6) + "-0" + ((i % 9) + 1) + "-1" + (i % 9), notes: i === 0 ? "Dergi adı, cilt 12, sayı 3, sayfa 101–134; ortak yazarlar: üç kurumdan dört araştırmacı. " + uzun : null,
  computed_points: [20, 8, 15, 1, 10][i % 5] / ((i % 3) + 1), paylasim_katsayisi: 1, kural_surumu: "arvolab-2026-10-27", belge_yolu: null,
  created_at: "2026-11-0" + ((i % 9) + 1) + "T10:00:00Z", updated_at: "2026-11-0" + ((i % 9) + 1) + "T10:00:00.123456+00:00",
}));
const hedefler = bos ? [] : [
  { organization_id: ${JSON.stringify(KURUM)}, grup: null, asgari_puan: 100, azami_puan: null, doktora_sonrasi: false },
  { organization_id: ${JSON.stringify(KURUM)}, grup: null, asgari_puan: 60, azami_puan: null, doktora_sonrasi: true },
  { organization_id: ${JSON.stringify(KURUM)}, grup: "Uluslararası makale", asgari_puan: 40, azami_puan: 45, doktora_sonrasi: false },
  { organization_id: ${JSON.stringify(KURUM)}, grup: "Projeler", asgari_puan: 30, azami_puan: null, doktora_sonrasi: false },
];
export async function docentlikOzetim() {
  return docentlikOzeti({
    faaliyetler: satirlar.map((f) => ({ ...f, donem: kendiDonemi(f.faaliyet_tarihi, profil?.doktora_tarihi ?? null) })),
    kriterler: kriterler.map((k) => ({ id: k.id, category_group: k.category_group })), hedefler, kurum: ${JSON.stringify(KURUM)},
    temelAlan: profil?.temel_alan ?? null, altAlan: profil?.alt_alan ?? null, doktoraTarihiBiliniyor: Boolean(profil?.doktora_tarihi),
  });
}
export async function profilim() { return profil; }
export async function faaliyetlerim() { return { satirlar, toplam: satirlar.length, sayfaBoyu: 50, aralikDisi: false }; }
export async function kriterlerTumu() { return kriterler; }
`);
/* Taklit işlemler çağrıları kaydeder; sonuç window.__sonuc ile seçilir ("basari" | "hata").
   runPanelAction hatada undefined döndürür (mesaj çerezle bildirilir) — burada da öyle. */
fs.writeFileSync(path.join(shim, "actions.ts"), `
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
window.__cagrilar = [];
const kaydet = (ad, fd) => window.__cagrilar.push({ ad, alanlar: Object.fromEntries(fd ? fd.entries() : []) });
const sonuc = (deger) => (window.__sonuc === "hata" ? undefined : deger);
export async function faaliyetEkle(fd) { kaydet("ekle", fd); await bekle(250); return sonuc({ id: "x", tekrar: false }); }
export async function faaliyetDuzenle(fd) { kaydet("duzenle", fd); await bekle(250); return sonuc({ id: "x", tekrar: false }); }
export async function faaliyetSil(fd) { kaydet("sil", fd); await bekle(50); return sonuc({ silindi: true }); }
export async function profilKaydet(fd) { kaydet("profil", fd); await bekle(50); }
`);

const a = (p) => JSON.stringify(path.join(KOK, p));
fs.writeFileSync(path.join(dizin, "giris.tsx"), `
import { createRoot } from "react-dom/client";
import Ana from ${a("app/panel/docentlik/page.tsx")};
import Faaliyetler from ${a("app/panel/docentlik/faaliyetler/page.tsx")};
import Profil from ${a("app/panel/docentlik/profil/page.tsx")};
/* file:// altında modül betiği yüklenmiyor (CORS); paket iife, üst düzey await yerine async işlev. */
(async () => {
const ekran = new URLSearchParams(location.search).get("ekran") || "ana";
const sayfa = ekran === "faaliyetler" ? await Faaliyetler({ searchParams: Promise.resolve({}) }) : ekran === "profil" ? await Profil() : await Ana();
createRoot(document.getElementById("kok")).render(
  <div className="panel-root os-root"><main className="panel-frame os-frame">
    <header className="os-bar"><a className="os-brand" href="/panel"><i>A</i><span><b>Prova Kurum</b></span></a></header>
    <section className="os-workspace"><div className="panel-content">{sayfa}</div></section>
  </main></div>);
window.__hazir = true;
})().catch((e) => { window.__hata = String(e && e.stack || e); console.error(e); });
`);
const stubEklentisi = {
  name: "docentlik-taklit",
  setup(b) {
    b.onResolve({ filter: /^(\.\.?\/)+(veri|actions)$/ }, (args) =>
      args.importer.includes(`${path.sep}app${path.sep}panel${path.sep}docentlik`) ? { path: path.join(shim, `${path.basename(args.path)}.ts`) } : undefined);
    b.onResolve({ filter: /^server-only$|^next\/cache$/ }, () => ({ path: path.join(shim, "bos.ts") }));
  },
};
await build({
  entryPoints: [path.join(dizin, "giris.tsx")], bundle: true, outfile: path.join(dizin, "paket.js"), format: "iife",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error", target: "es2022",
  nodePaths: [path.join(KOK, "node_modules")], plugins: [stubEklentisi],
  alias: { "next/link": path.join(shim, "link.tsx"), "next/navigation": path.join(shim, "navigation.ts"), "@": KOK },
  loader: { ".css": "empty" },
});
const html = (tema, ekran) => `<!doctype html><html lang="tr" data-theme="${tema}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${cssler[ekran].map((d) => `<link rel="stylesheet" href="file://${d}">`).join("")}</head><body><div id="kok"></div><script src="paket.js"></script></body></html>`;
for (const tema of ["light", "dark"]) for (const e of Object.keys(cssler)) fs.writeFileSync(path.join(dizin, `${tema}-${e}.html`), html(tema, e));

/* Sayfada: yatay taşma, görünür alanın dışına taşan öğe (kaydırma kabı içindekiler hariç), kontrast. */
const olc = () => {
  const s = document.scrollingElement;
  const vw = document.documentElement.clientWidth;
  const kaydiranAta = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return p !== document.body && p !== document.documentElement; } return false; };
  const tasan = [...document.querySelectorAll(".docentlik-sayfa *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1) && !kaydiranAta(e); })
    .slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")} ${Math.round(e.getBoundingClientRect().right)}>${vw}`);
  /* Hesaplanan renk "rgb(…)" ya da color-mix'ten gelen "color(srgb r g b / a)" (0–1 ölçeği)
     olabilir; ikincisini rgb gibi okumak koyu bir zemin uyduruyordu (yanlış alarm). */
  const rgb = (c) => {
    const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
    if (c.startsWith("color(srgb")) return { r: m[0] * 255, g: m[1] * 255, b: m[2] * 255, a: m[3] ?? 1 };
    return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 };
  };
  const parlaklik = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const zemin = (e) => { const katmanlar = []; for (let p = e; p; p = p.parentElement) { const c = rgb(getComputedStyle(p).backgroundColor); if (c.a > 0) { katmanlar.push(c); if (c.a >= 1) break; } } let z = { r: 255, g: 255, b: 255 }; for (const c of katmanlar.reverse()) z = { r: c.r * c.a + z.r * (1 - c.a), g: c.g * c.a + z.g * (1 - c.a), b: c.b * c.a + z.b * (1 - c.a) }; return z; };
  const oran = (e) => { const cs = getComputedStyle(e); const y = rgb(cs.color); const z = zemin(e); const on = { r: y.r * y.a + z.r * (1 - y.a), g: y.g * y.a + z.g * (1 - y.a), b: y.b * y.a + z.b * (1 - y.a) }; const [l1, l2] = [parlaklik(on), parlaklik(z)].sort((x, w) => w - x); return (l1 + 0.05) / (l2 + 0.05); };
  const metinler = [...document.querySelectorAll(".docentlik-sayfa :is(h1,h2,p,dt,dd,small,b,td,th,a,label,span,li,legend)")]
    .filter((e) => e.offsetParent !== null && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  const dusuk = metinler.map((e) => { const cs = getComputedStyle(e); const buyuk = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700); return { e, o: oran(e), esik: buyuk ? 3 : 4.5 }; })
    .filter((x) => x.o < x.esik).slice(0, 6).map((x) => `${x.e.tagName.toLowerCase()}.${[...x.e.classList].join(".")} "${x.e.textContent.trim().slice(0, 30)}" ${x.o.toFixed(2)}`);
  const enDusuk = Math.min(...metinler.map(oran));
  /* Kaydırma kabının İÇİNDE taşma da sorun: yarım genişlikteki kartta tablonun son
     sütunu görünmüyordu ve sayfa taşması sayılmıyordu (ilk ölçümde gözle bulundu). */
  const icTasma = [...document.querySelectorAll(".docentlik-sayfa :is(.crm-table-wrap,.panel-card,.docentlik-sekmeler)")]
    .filter((e) => e.offsetParent !== null && e.scrollWidth > e.clientWidth + 1 && !e.classList.contains("docentlik-sekmeler"))
    .map((e) => {
      /* Taşmanın kaynağı: kabın sağ kenarını aşan en derin öğe (teşhis için). */
      const sag = e.getBoundingClientRect().right;
      const suclu = [...e.querySelectorAll("*")].filter((x) => x.getBoundingClientRect().right > sag + 1).pop();
      return `${e.className.split(" ")[0]} ${e.scrollWidth}/${e.clientWidth}${suclu ? ` ← ${suclu.tagName.toLowerCase()}.${[...suclu.classList].join(".")}` : ""}`;
    });
  return { yatay: `${s.scrollWidth}/${s.clientWidth}`, yatayTasma: s.scrollWidth > s.clientWidth + 1, tasan, icTasma, metin: metinler.length, enDusukKontrast: Number(enDusuk.toFixed(2)), dusukKontrast: dusuk };
};

/*
  Doçentlik formunun istemci davranışı (sunucu işlemleri taklit):
   - hata (DP001 vb.; runPanelAction undefined döndürür) → pencere açık, anahtar KORUNUR;
   - aynı formun yeniden gönderimi aynı anahtarı taşır; başarıdan sonra form sıfırlanır,
     sonraki gönderim YENİ anahtar alır;
   - çift tıklama tek çağrı;
   - silme: onay penceresinde Vazgeç → çağrı yok; Sil → tek çağrı, doğru kayıt kimliği.
  DP001/DP002 METİNLERİ sunucuda (lib/docentlik-islem → faaliyetYazimHatasi, birim testli);
  bildirimin ekrana ulaşması gerçek oturum ister (UNVERIFIED).
*/
async function formDurumlari(sayfa) {
  const s = {};
  const cagrilar = () => sayfa.evaluate(() => window.__cagrilar.map((c) => ({ ad: c.ad, anahtar: c.alanlar.istek_anahtari ?? null, id: c.alanlar.faaliyet_id ?? null })));
  const sifirla = () => sayfa.evaluate(() => { window.__cagrilar.length = 0; });
  const gonder = () => sayfa.locator("form.docentlik-form button[type=submit]").click();
  await sayfa.getByRole("button", { name: "Yeni faaliyet" }).first().click();
  await sayfa.waitForTimeout(150);
  await sayfa.locator("form.docentlik-form select[name=kriter_id]").selectOption("k1");
  await sayfa.locator("form.docentlik-form input[name=baslik]").fill("Sentetik makale");
  await sifirla();
  await sayfa.evaluate(() => { window.__sonuc = "hata"; });
  await gonder(); await sayfa.waitForTimeout(400);
  await gonder(); await sayfa.waitForTimeout(400);
  let c = await cagrilar();
  s["hata: iki gönderim, ikisi de aynı anahtar"] = c.length === 2 && Boolean(c[0].anahtar) && c[0].anahtar === c[1].anahtar || c;
  s["hata: pencere açık, alanlar korunuyor"] = (await sayfa.locator("form.docentlik-form input[name=baslik]").inputValue()) === "Sentetik makale";
  await sayfa.evaluate(() => { window.__sonuc = "basari"; });
  await gonder(); await sayfa.waitForTimeout(400);
  c = await cagrilar();
  s["başarı: düzeltilmiş gönderim AYNI anahtarı taşır (hata anahtarı tüketmez)"] = c.length === 3 && c[2].anahtar === c[0].anahtar || c;
  const ilkAnahtar = c[0]?.anahtar ?? null;
  s["başarı: form sıfırlandı"] = (await sayfa.locator("form.docentlik-form input[name=baslik]").inputValue()) === "";
  await sayfa.locator("form.docentlik-form select[name=kriter_id]").selectOption("k2");
  await sayfa.locator("form.docentlik-form input[name=baslik]").fill("İkinci faaliyet");
  await sifirla();
  /* Çift tıklama: ikinci tık işlem sürerken (düğme kilitli). */
  await gonder();
  await sayfa.locator("form.docentlik-form button[type=submit]").click({ force: true, timeout: 300 }).catch(() => {});
  await sayfa.waitForTimeout(500);
  c = await cagrilar();
  s["çift tıklama: tek çağrı"] = c.length === 1 || c;
  s["yeni faaliyet YENİ anahtar alır"] = c.length === 1 && c[0].anahtar && c[0].anahtar !== ilkAnahtar || c;
  await sayfa.keyboard.press("Escape");
  await sayfa.waitForTimeout(150);
  // Silme onayı
  await sifirla();
  await sayfa.locator(".docentlik-tehlike").first().click();
  await sayfa.waitForTimeout(150);
  s["silme: onay penceresi açılıyor"] = await sayfa.evaluate(() => Boolean([...document.querySelectorAll("dialog")].find((d) => d.open)));
  await sayfa.getByRole("button", { name: "Vazgeç" }).click();
  await sayfa.waitForTimeout(150);
  s["silme: Vazgeç → çağrı yok"] = (await cagrilar()).length === 0;
  await sayfa.locator(".docentlik-tehlike").first().click();
  await sayfa.waitForTimeout(150);
  await sayfa.locator("dialog[open] button[type=submit]").click();
  await sayfa.waitForTimeout(300);
  c = await cagrilar();
  s["silme: onay → tek çağrı, doğru kayıt"] = c.length === 1 && c[0].ad === "sil" && c[0].id === "00000000-0000-4000-8000-000000000000" || c;
  return s;
}

const sorunlar = [];
const sonuc = {};
const tarayici = await chromium.launch();
const BOYUTLAR = (process.env.BOYUTLAR ?? "1440x900,1024x768,768x1024,390x844").split(",").map((b) => b.split("x").map(Number));
const EKRANLAR = [["ana", "dolu"], ["ana", "bos"], ["faaliyetler", "dolu"], ["faaliyetler", "bos"], ["profil", "dolu"], ["profil", "bos"]];
for (const [w, h] of BOYUTLAR) for (const tema of ["light", "dark"]) for (const [ekran, veri] of EKRANLAR) {
  const anahtar = `${w}x${h} ${tema} ${ekran}/${veri}`;
  const sayfa = await tarayici.newPage({ viewport: { width: w, height: h } });
  const hatalar = [];
  sayfa.on("pageerror", (e) => hatalar.push(e.message));
  sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
  await sayfa.goto(`file://${path.join(dizin, `${tema}-${ekran}.html`)}?ekran=${ekran}&veri=${veri}`);
  await sayfa.waitForFunction(() => window.__hazir === true || window.__hata, null, { timeout: 10000 }).catch(() => {});
  const hata = await sayfa.evaluate(() => window.__hata || null);
  if (hata || hatalar.length) { console.error(anahtar, hata, hatalar); }
  await sayfa.waitForTimeout(150);
  const o = await sayfa.evaluate(olc);
  o.hatalar = hatalar;

  // Yeni faaliyet penceresi (ana ve faaliyetler; dolu veride kriter var).
  if (ekran !== "profil" && veri === "dolu") {
    await sayfa.getByRole("button", { name: "Yeni faaliyet" }).first().click();
    await sayfa.waitForTimeout(200);
    o.pencere = await sayfa.evaluate(() => {
      const d = [...document.querySelectorAll("dialog, [role=dialog]")].find((x) => x.offsetParent !== null || x.open);
      if (!d) return { acik: false };
      const f = d.querySelector("form.docentlik-form");
      const r = d.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      return { acik: true, odakIcinde: d.contains(document.activeElement), form: Boolean(f), pencereGenislik: `${Math.round(r.left)}..${Math.round(r.right)}/${vw}`,
        formYatayTasma: f ? f.scrollWidth > f.clientWidth + 1 : null, pencereTasma: r.right > vw + 1 || r.left < -1 };
    });
    // Tab sırası: formun alanları sırayla (kriter → başlık → birim → yazar → …).
    const sira = [];
    await sayfa.locator("form.docentlik-form select[name=kriter_id]").focus();
    for (let i = 0; i < 9; i++) {
      sira.push(await sayfa.evaluate(() => { const e = document.activeElement; return e?.getAttribute("name") || e?.getAttribute("aria-label") || e?.textContent?.trim().slice(0, 20) || e?.tagName; }));
      await sayfa.keyboard.press("Tab");
    }
    o.tabSirasi = sira;
    /* Odak pencerede kalmalı: Tab ile pencere DIŞINDAKİ bir denetime düşmek, ekranı
       kaplayan pencerenin arkasında görünmeyen düğmelere basmak demek. */
    o.odakKacti = await sayfa.evaluate(async () => {
      const kok = document.querySelector(".panel-modal-root");
      const kacan = [];
      for (let i = 0; i < 20; i++) {
        document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));
      }
      // Gerçek Tab tarayıcının işi; burada inert'i doğrudan sınıyoruz: pencere dışındaki her odaklanabilir öğe inert altında mı?
      const disari = [...document.querySelectorAll(".panel-root a[href], .panel-root button, .panel-root input, .panel-root select, .panel-root textarea")]
        .filter((e) => !kok.contains(e) && !e.closest("[inert]") && !e.disabled && e.offsetParent !== null);
      for (const e of disari.slice(0, 3)) kacan.push(e.textContent.trim().slice(0, 20) || e.tagName);
      return kacan;
    });
    // Tek yazarda başlıca seçimi kapalı, 3 yazarda açık.
    await sayfa.locator("form.docentlik-form input[name=yazar_sayisi]").fill("3");
    o.baslicaAcik3 = await sayfa.evaluate(() => !document.querySelector("form.docentlik-form fieldset").disabled);
    await sayfa.locator("form.docentlik-form input[name=yazar_sayisi]").fill("1");
    o.baslicaKapali1 = await sayfa.evaluate(() => document.querySelector("form.docentlik-form fieldset").disabled);
    o.pencereOlcum = await sayfa.evaluate(olc);
    await sayfa.keyboard.press("Escape");
    await sayfa.waitForTimeout(200);
    o.escKapatti = await sayfa.evaluate(() => !document.querySelector("form.docentlik-form"));
    o.odakGeriDondu = await sayfa.evaluate(() => document.activeElement?.textContent?.includes("Yeni faaliyet") ?? false);
  }
  /* Silme düğmesinin tehlike rengi (iki temada da --danger; panelin ikincil düğme kuralı eziyordu). */
  if (ekran === "faaliyetler" && veri === "dolu") {
    o.silRengi = await sayfa.evaluate(() => {
      const d = document.querySelector(".docentlik-tehlike");
      const olcu = document.createElement("span"); olcu.style.color = "var(--danger)"; d.parentElement.appendChild(olcu);
      const beklenen = getComputedStyle(olcu).color; olcu.remove();
      return { renk: getComputedStyle(d).color, beklenen };
    });
  }
  /* Form durumları: yalnızca bir boyut/temada (mantık boyuta bağlı değil). */
  if (ekran === "faaliyetler" && veri === "dolu" && w === BOYUTLAR[0][0] && tema === "light") o.formDurumlari = await formDurumlari(sayfa);
  sonuc[anahtar] = o;
  if (o.silRengi && o.silRengi.renk !== o.silRengi.beklenen) sorunlar.push(`${anahtar}: Sil düğmesi tehlike renginde değil ${JSON.stringify(o.silRengi)}`);
  if (o.formDurumlari) for (const [ad, gecti] of Object.entries(o.formDurumlari)) if (gecti !== true) sorunlar.push(`${anahtar}: form durumu "${ad}" ${JSON.stringify(gecti)}`);
  if (o.icTasma.length) sorunlar.push(`${anahtar}: kart/tablo içinde yatay taşma ${o.icTasma.join(", ")}`);
  if (o.yatayTasma || o.tasan.length) sorunlar.push(`${anahtar}: yatay taşma ${o.yatay} ${o.tasan.join(", ")}`);
  if (o.dusukKontrast.length) sorunlar.push(`${anahtar}: düşük kontrast ${o.dusukKontrast.join(" | ")}`);
  if (o.hatalar.length) sorunlar.push(`${anahtar}: konsol/sayfa hatası ${o.hatalar.join(" | ")}`);
  if (o.pencere && (!o.pencere.acik || !o.pencere.odakIcinde || o.pencere.formYatayTasma || o.pencere.pencereTasma)) sorunlar.push(`${anahtar}: pencere ${JSON.stringify(o.pencere)}`);
  if (o.pencereOlcum?.dusukKontrast.length) sorunlar.push(`${anahtar}: pencerede düşük kontrast ${o.pencereOlcum.dusukKontrast.join(" | ")}`);
  if (o.escKapatti === false) sorunlar.push(`${anahtar}: Esc pencereyi kapatmadı`);
  if (o.odakKacti?.length) sorunlar.push(`${anahtar}: pencere açıkken arkadaki denetimler odaklanabilir: ${o.odakKacti.join(", ")}`);
  if (o.odakGeriDondu === false) sorunlar.push(`${anahtar}: pencere kapanınca odak açan düğmeye dönmedi`);
  if (o.pencere && (!o.baslicaAcik3 || !o.baslicaKapali1)) sorunlar.push(`${anahtar}: başlıca yazar seçimi yazar sayısına uymuyor`);
  if (process.env.GORUNTU) await sayfa.screenshot({ path: path.join(process.env.GORUNTU, `${anahtar.replace(/[ /]/g, "_")}.png`), fullPage: true });
  await sayfa.close();
}
await tarayici.close();
fs.rmSync(dizin, { recursive: true, force: true });
console.log(JSON.stringify({ kok: KOK, not: "bileşen düzeyi ölçüm (sentetik veri, gerçek CSS); uygulama kabulü değil", sorunlar, sonuc }, null, 1));
process.exit(sorunlar.length ? 1 : 0);
