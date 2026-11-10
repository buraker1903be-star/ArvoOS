/*
  MOBİL VE KISA EKRAN KABULÜ — GERÇEK UYGULAMA (10.11.2026, PR #314).

  CI'DA DEĞİL. Çalıştırma rehberi: docs/mobil-kabul-rehberi.md.

  Çalışan bir ArvoOS'a (Preview ya da yerel `next start`) GERÇEK bir oturumla
  bağlanır; ana ekranı ve CRM genel bakışı dört boyutta, açık ve koyu temada
  gezer. Bileşen düzeneğinden (genel-bakis-yerlesim-tarayici.mjs) farkı budur:
  veri, kabuk ve CSS sunucunun gerçekten verdiğidir.

  OTURUM: çerez kopyalanmaz. Görünür bir tarayıcı açılır, kullanıcı Vercel ve
  ArvoOS girişini KENDİSİ yapar; betik giriş bitene kadar bekler ve testi AYNI
  tarayıcı bağlamında sürdürür. Parola, belirteç ya da çerez hiçbir yere
  yazılmaz (terminal, rapor, git). Tarayıcı profili depo DIŞINDA bir dizinde
  tutulur ve varsayılan olarak koşu sonunda SİLİNİR; `--oturumu-sakla` ile
  saklanırsa bir sonraki koşu girişsiz başlar (temizlik rehberde).

  SALT OKUNUR. Giriş bittikten sonra GET/HEAD dışındaki her istek (server
  action'lar POST) tarayıcıda KESİLİR: betik kayıt, mesaj, görev, ayar,
  davet ya da ödeme üretemez. Yalnızca görünüm seçici, dock / Daha fazla /
  Uygulamalar, bölüm menüsü, "Adımları göster" ve "Tamamını göster"
  düğmelerine basar. Veri (uzun ad fikstürü) OLUŞTURMAZ: kısaltılmış ad yoksa
  o senaryo UNVERIFIED.

  KESİLEN İSTEK ÜRÜN HATASI DEĞİLDİR. Bir adım sırasında yazma isteği
  kesildiyse ve adım başarısız olduysa, başarısızlığın sebebi testin kendi
  kısıtı olabilir: o adım FAIL değil UNVERIFIED yazılır (kesilen isteklerin
  türüyle: oturum yenileme / server action / diğer). Kesilmesine rağmen adım
  geçtiyse arayüz o isteğe ihtiyaç duymadan çalışmıştır, PASS kalır. Oturum
  koşu ortasında düşerse (girişe yönlenme) kalan senaryolar UNVERIFIED.
  Çözüm yazmaya izin vermek DEĞİLDİR.

  Yakınlaştırma GERÇEK tarayıcı yakınlaştırmasıdır: küçük bir eklenti
  chrome.tabs.setZoom(2) çağırır (Ctrl+Artı ile aynı yol; innerWidth yarıya
  iner). CSS transform ya da deviceScaleFactor değildir. Dokunmatik ve sanal
  klavye SINANMAZ (emülasyon gerçek cihaz değildir) — betik hiçbir koşulda
  "tam kabul" yazmaz; en iyi sonuç "betik kapsamında PASS"tır.

  Çıkış kodu: 0 bütün senaryolar PASS · 1 FAIL var · 2 oturum/erişim yok ·
  3 FAIL yok ama UNVERIFIED var.
*/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const bayrak = (ad) => process.argv.includes(ad);
const KOK = path.resolve(import.meta.dirname, "..");
const icinde = (d) => d === KOK || d.startsWith(KOK + path.sep);

const BASE = (process.env.ARVO_URL || "").replace(/\/$/, "");
if (!/^https?:\/\//.test(BASE)) { console.error("ARVO_URL gerekli (http/https)."); process.exit(2); }
if (bayrak("--cerez-dosyasi") || process.env.ARVO_COOKIE) { console.error("Çerezle oturum kaldırıldı: tarayıcıda kendiniz giriş yapın (rehber: docs/mobil-kabul-rehberi.md)."); process.exit(2); }

const CIKTI = path.resolve(process.env.KABUL_CIKTI || fs.mkdtempSync(path.join(os.tmpdir(), "arvo-mobil-kabul-")));
if (icinde(CIKTI)) { console.error("KABUL_CIKTI depo içinde olamaz (ekran görüntüleri kişisel veri taşıyabilir)."); process.exit(2); }
fs.mkdirSync(CIKTI, { recursive: true });
const PROFIL = path.resolve(process.env.KABUL_PROFIL || path.join(os.homedir(), ".arvo-mobil-kabul", "profil"));
if (icinde(PROFIL)) { console.error("KABUL_PROFIL depo içinde olamaz (oturum çerezleri taşır)."); process.exit(2); }
const SAKLA = bayrak("--oturumu-sakla");
const GORUNMEZ = bayrak("--gorunmez"); // yalnızca saklanmış oturumla anlamlı
const GIRIS_SURESI = Number(process.env.GIRIS_DAKIKA || 10) * 60_000;

const BOYUTLAR = (process.env.BOYUTLAR ?? "390x844,768x600,1440x900,1440x600").split(",").map((b) => b.split("x").map(Number));
const TEMALAR = (process.env.TEMALAR ?? "light,dark").split(",");
const TUM_SAYFALAR = { ana: "/panel", crm: "/panel/crm/genel-bakis", ops: "/panel/operations" };
const SAYFALAR = Object.fromEntries((process.env.SAYFALAR ?? "ana,crm,ops").split(",").map((k) => [k, TUM_SAYFALAR[k]]).filter(([, v]) => v));
const ZOOM = !bayrak("--zoom-yok");

/* Gerçek yakınlaştırma eklentisi: geçici dizine yazılır. */
const ekDizin = fs.mkdtempSync(path.join(os.tmpdir(), "arvo-zoom-"));
fs.writeFileSync(path.join(ekDizin, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "kabul-zoom", version: "1", permissions: ["tabs"], background: { service_worker: "sw.js" } }));
fs.writeFileSync(path.join(ekDizin, "sw.js"), "self.zoomla=(z)=>chrome.tabs.query({}).then(t=>Promise.all(t.map(x=>chrome.tabs.setZoom(x.id,z))));");

fs.mkdirSync(PROFIL, { recursive: true });
const ctx = await chromium.launchPersistentContext(PROFIL, {
  headless: GORUNMEZ, ...(GORUNMEZ ? { channel: "chromium" } : {}), deviceScaleFactor: 2, viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${ekDizin}`, `--load-extension=${ekDizin}`],
});
const temizle = async () => {
  await ctx.close().catch(() => {});
  fs.rmSync(ekDizin, { recursive: true, force: true });
  if (!SAKLA) fs.rmSync(PROFIL, { recursive: true, force: true });
};
const alan = new URL(BASE);
const panelde = (u) => { try { const x = new URL(u); return x.host === alan.host && x.pathname.startsWith("/panel"); } catch { return false; } };

/* ---- giriş: kullanıcı görünür tarayıcıda kendisi yapar ---- */
// Giriş sırasında hiçbir istek KESİLMEZ (Vercel ve ArvoOS girişi POST'tur);
// koruma ancak panel açıldıktan sonra kurulur.
const giris = ctx.pages()[0] ?? await ctx.newPage();
await giris.goto(BASE + SAYFALAR.ana, { waitUntil: "domcontentloaded" }).catch(() => {});
if (!panelde(giris.url()) || !(await giris.locator(".os-dock").count())) {
  if (GORUNMEZ) { console.error("Saklanmış oturum geçersiz: --gorunmez olmadan yeniden çalıştırıp giriş yapın."); await temizle(); process.exit(2); }
  console.log(`Açılan tarayıcıda Vercel ve ArvoOS girişini TEST hesabıyla siz yapın.\nPanel (${SAYFALAR.ana}) açılınca test kendiliğinden başlar. Süre: ${GIRIS_SURESI / 60000} dk.`);
  try {
    await giris.waitForFunction(() => location.pathname.startsWith("/panel") && Boolean(document.querySelector(".os-dock")), null, { timeout: GIRIS_SURESI, polling: 1000 });
    if (!panelde(giris.url())) throw new Error("panel başka bir adreste açıldı");
  } catch (e) { console.error(`Giriş tamamlanmadı (${e.message.split("\n")[0]}).`); await temizle(); process.exit(2); }
}
console.log("Oturum açık. Bundan sonra yazma istekleri kesiliyor; tarayıcıya dokunmayın.");
// Giriş sekmesi açık kalır: görünür tarayıcıda son sekme kapanınca tarayıcı da kapanıyor.
await giris.goto("about:blank");

/* ---- salt okunur koruma ---- */
// Kesilen istek yalnızca yöntem + adres yolu olarak kaydedilir (sorgu dizesi
// belirteç taşıyabilir). Tür, sonucu yorumlamak için.
const kesilen = [];
const tur = (r) => /\/auth\/v1\/(token|user|logout)/.test(r.url()) ? "oturum yenileme" : r.headers()["next-action"] ? "server action" : "diğer";
await ctx.route("**/*", (r) => {
  const q = r.request();
  if (q.method() === "GET" || q.method() === "HEAD") return r.continue();
  let yol = q.url(); try { const u = new URL(yol); yol = u.origin + u.pathname; } catch { /* olduğu gibi */ }
  kesilen.push({ an: Date.now(), yontem: q.method(), yol, tur: tur(q) });
  return r.abort();
});
let [sw] = ctx.serviceWorkers();
if (!sw && ZOOM) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 }).catch(() => null);

/* ---- tarayıcı içi ölçümler (sayfada çalışır) ---- */
const sayfaOlc = () => {
  const s = document.scrollingElement;
  const dock = document.querySelector(".os-dock")?.getBoundingClientRect();
  const gorunur = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
  const yatay = [...document.querySelectorAll(".dash-card, .os-dock, .os-bolumler, .os-bolumler-liste, .dash-gorunum-sec, .os-uygulamalar[open], .dash-kurulum-pencere[open]")]
    .filter(gorunur).map((e) => ({ oge: e.className.split(" ").slice(0, 2).join("."), fazla: e.scrollWidth - e.clientWidth })).filter((x) => x.fazla > 1);
  // Ekran dışına taşan (kesilen) görünür öğe: içerik alanında viewport dışına çıkan.
  const disari = [...document.querySelectorAll(".panel-content *")].filter((e) => {
    if (!gorunur(e) || e.closest("[class*='govde'], dialog")) return false;
    const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1;
  }).slice(0, 5).map((e) => e.className || e.tagName);
  // Dock'un örttüğü eylem: içerikteki bağlantı/düğmenin ortasında dock varsa.
  const ortulen = [...document.querySelectorAll(".panel-content a, .panel-content button")].filter(gorunur).filter((e) => {
    const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (y < 0 || y > innerHeight) return false;
    // Kendi kaydırma alanında kırpılmış (gövdenin görünmeyen kısmındaki) satır
    // dock'un "altında" değil, gövdenin dışındadır; örtülme sayılmaz.
    const kap = e.closest(".dash-col-govde, .dash-kurulum-pencere-govde, .os-uygulamalar-govde");
    if (kap) { const k = kap.getBoundingClientRect(); if (y < k.top || y > k.bottom) return false; }
    const ust = document.elementFromPoint(x, y); return ust && !e.contains(ust) && ust.closest(".os-dock");
  }).map((e) => e.textContent.trim().slice(0, 40));
  return { viewport: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio, sayfaYatay: `${s.scrollWidth}/${s.clientWidth}`, sayfaDikey: `${s.scrollHeight}/${s.clientHeight}`, dockUst: dock ? Math.round(dock.top) : null, yatayTasma: yatay, disariTasan: disari, dockOrtuyor: ortulen };
};
// Seçili/ görünür liste kartları: gövde, tam görünen kayıt, alt bağlantı erişimi.
const kartOlc = () => [...document.querySelectorAll(".dash-gorunum-panel")].filter((p) => p.offsetParent !== null).map((p) => {
  const kart = p.firstElementChild; const g = kart?.querySelector(".dash-col-govde");
  const r = (e) => e ? Math.round(e.getBoundingClientRect().height) : null;
  const gr = g?.getBoundingClientRect();
  const tam = g ? [...g.querySelectorAll("li")].filter((li) => { const l = li.getBoundingClientRect(); return l.top >= gr.top - 1 && l.bottom <= gr.bottom + 1; }).length : null;
  const kr = kart?.getBoundingClientRect();
  return { panel: p.id.replace("gorunum-", ""), ust: kr ? +kr.top.toFixed(1) : null, alt: kr ? +kr.bottom.toFixed(1) : null, kart: r(kart), govde: r(g), govdeKaydirma: g ? `${g.scrollHeight}/${g.clientHeight}` : null, tamKayit: tam, kayit: g ? g.querySelectorAll("li").length : null, yatayFazla: kart ? kart.scrollWidth - kart.clientWidth : null };
});
const tiklanabilir = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width) return null; const ust = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(ust && e.contains(ust)); };

/* ---- yardımcılar ---- */
const sonuc = [];
let sira = 0;
const kaydet = async (sayfa, ad) => { const d = path.join(CIKTI, `${String(++sira).padStart(3, "0")}-${ad.replace(/[^a-z0-9-]+/gi, "_")}.png`); await sayfa.screenshot({ path: d }); return path.basename(d); };
const durum = (hatalar, unverified) => (hatalar.length ? "FAIL" : unverified ? "UNVERIFIED" : "PASS");
// Gerçek kaydırma girişimi: tekerlek (dikey + yatay) ve klavye; sonra sayfanın konumu.
async function kaydirmaDene(sayfa) {
  const vp = sayfa.viewportSize();
  await sayfa.mouse.move(vp.width / 2, Math.min(vp.height / 2, 120));
  await sayfa.mouse.wheel(0, 3000); await sayfa.mouse.wheel(3000, 0);
  await sayfa.keyboard.press("End"); await sayfa.waitForTimeout(150);
  return sayfa.evaluate(() => ({ x: Math.round(scrollX), y: Math.round(scrollY), seY: document.scrollingElement.scrollTop }));
}
function kuralHatalari(o, kaydirma) {
  const h = [];
  const [sw, cw] = o.sayfaYatay.split("/").map(Number), [sh, ch] = o.sayfaDikey.split("/").map(Number);
  if (sw > cw + 1) h.push(`sayfa yatay ${o.sayfaYatay}`);
  if (sh > ch + 1) h.push(`sayfa dikey ${o.sayfaDikey}`);
  if (kaydirma && (kaydirma.x || kaydirma.y || kaydirma.seY)) h.push(`kaydırma girişimi sayfayı kaydırdı ${JSON.stringify(kaydirma)}`);
  if (o.yatayTasma.length) h.push(`yatay taşma ${JSON.stringify(o.yatayTasma)}`);
  if (o.disariTasan.length) h.push(`ekran dışına taşan ${JSON.stringify(o.disariTasan)}`);
  if (o.dockOrtuyor.length) h.push(`dock örtüyor: ${o.dockOrtuyor.join(", ")}`);
  return h;
}
// Liste gövdesini GERÇEK tekerlekle sona kaydır; son kayıt ve alt bağlantı tıklanabilir mi.
async function sonKayitDene(sayfa, panelSec) {
  const g = sayfa.locator(`${panelSec} .dash-col-govde`).first();
  if (!(await g.count()) || !(await g.isVisible())) return { atlandi: "gövde yok" };
  const n = await g.locator("li").count();
  if (!n) return { atlandi: "kayıt yok" };
  const b = await g.boundingBox();
  await sayfa.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  for (let i = 0; i < 12; i++) await sayfa.mouse.wheel(0, 400);
  await sayfa.waitForTimeout(150);
  return sayfa.evaluate((sec) => {
    const g = document.querySelector(`${sec} .dash-col-govde`); const li = [...g.querySelectorAll("li")].pop();
    const a = li.getBoundingClientRect(), r = g.getBoundingClientRect();
    const ust = document.elementFromPoint(a.left + a.width / 2, a.top + Math.min(a.height / 2, 12));
    const alt = document.querySelector(`${sec} .dash-card-link`);
    let altOk = null; if (alt) { const q = alt.getBoundingClientRect(); const u = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); altOk = Boolean(u && alt.contains(u)); }
    return { sonKayitGorunur: a.bottom <= r.bottom + 1 && a.top >= r.top - 1, sonKayitTiklanabilir: Boolean(ust && li.contains(ust)), altBaglanti: altOk };
  }, panelSec);
}

/* Bir adımın sonucunu, o adım sırasında kesilen istekler ışığında yorumla:
   başarısız + kesilen istek var → testin kendi kısıtı olabilir → UNVERIFIED. */
function yorumla(r, oncekiSayi) {
  const bunlar = kesilen.slice(oncekiSayi);
  if (!bunlar.length) return r;
  const turler = [...new Set(bunlar.map((k) => k.tur))].join(", ");
  const kesilenOzet = { sayi: bunlar.length, turler };
  if (r.durum !== "FAIL") return { ...r, kesilenIstek: kesilenOzet };
  return { ...r, durum: "UNVERIFIED", testKisiti: `Adım sırasında ${bunlar.length} yazma isteği kesildi (${turler}); başarısızlık ürün hatası olarak sayılmadı`, kesilenIstek: kesilenOzet };
}
let oturumDustu = false;

for (const [w, h] of BOYUTLAR) for (const tema of TEMALAR) for (const [ad, yol] of Object.entries(SAYFALAR)) {
  const etiket = `${w}x${h} ${tema} ${ad}`;
  const sayfa = await ctx.newPage();
  await sayfa.setViewportSize({ width: w, height: h });
  await sayfa.goto(BASE + yol, { waitUntil: "networkidle" });
  await sayfa.evaluate((t) => { localStorage.setItem("arvoos.theme", t); localStorage.setItem("arvo:ana-ekran-onerisi-kapatildi", "1"); }, tema);
  await sayfa.reload({ waitUntil: "networkidle" });
  const kayit = { senaryo: etiket, adimlar: [] };
  if (oturumDustu || !panelde(sayfa.url())) {
    oturumDustu = true;
    kayit.durum = "UNVERIFIED"; kayit.adimlar.push({ adim: "oturum", durum: "UNVERIFIED", hatalar: [], testKisiti: "Oturum koşu sırasında düştü (girişe yönlendi); senaryo koşulmadı" });
    sonuc.push(kayit); await sayfa.close(); continue;
  }
  const adim = async (adi, fn) => {
    const once = kesilen.length;
    let r;
    try { r = await fn(); } catch (e) { r = { durum: "FAIL", hatalar: [`hata: ${e.message.split("\n")[0]}`] }; }
    if (!panelde(sayfa.url())) { oturumDustu = true; r = { ...r, durum: "UNVERIFIED", testKisiti: `Adım sırasında sayfa panelden ayrıldı (${new URL(sayfa.url()).pathname})` }; }
    kayit.adimlar.push({ adim: adi, ...yorumla(r, once) });
  };

  await adim("ilk görünüm", async () => {
    const o = await sayfa.evaluate(sayfaOlc); const k = await kaydirmaDene(sayfa);
    const kartlar = await sayfa.evaluate(kartOlc); const hatalar = kuralHatalari(o, k);
    for (const c of kartlar) if (c.yatayFazla > 1) hatalar.push(`${c.panel} kartında yatay ${c.yatayFazla}px`);
    if (!kartlar.length) hatalar.push("görünür panel yok");
    return { durum: durum(hatalar), hatalar, olcum: o, kaydirmaSonrasi: k, kartlar, ekran: await kaydet(sayfa, etiket) };
  });

  // Görünüm seçici açıksa her görünümü tek tek seç; değilse görünen her liste.
  const secici = sayfa.locator(".dash-gorunum-sec");
  const secimler = (await secici.isVisible()) ? await secici.locator("button:visible").all() : [null];
  for (const d of secimler) {
    const adi = d ? (await d.textContent()).trim() : "masaüstü listeleri";
    await adim(`görünüm: ${adi}`, async () => {
      if (d) { await d.click(); await sayfa.waitForTimeout(150); }
      const o = await sayfa.evaluate(sayfaOlc); const k = await kaydirmaDene(sayfa); const hatalar = kuralHatalari(o, k);
      const kartlar = await sayfa.evaluate(kartOlc); const erisim = {};
      // Operasyon (dash-esit): masaüstünde liste kartlarının üst ve alt kenarı aynı (alt piksel farkı hariç).
      if (ad === "ops" && !d) {
        const liste = kartlar.filter((c) => c.govde !== null);
        const fark = (k) => Math.max(...liste.map((c) => c[k])) - Math.min(...liste.map((c) => c[k]));
        if (liste.length > 1 && (fark("ust") > 1 || fark("alt") > 1)) hatalar.push(`kart hizası bozuk: üst farkı ${fark("ust").toFixed(1)}px, alt farkı ${fark("alt").toFixed(1)}px`);
      }
      for (const c of kartlar) {
        if (c.yatayFazla > 1) hatalar.push(`${c.panel} kartında yatay ${c.yatayFazla}px`);
        if (c.govde !== null && c.kayit > 0 && c.tamKayit < 1) hatalar.push(`${c.panel}: gövdede bir tam kayıt bile yok (${c.govde}px)`);
        erisim[c.panel] = await sonKayitDene(sayfa, `#gorunum-${c.panel}`);
        const e = erisim[c.panel];
        if (e.sonKayitGorunur === false || e.sonKayitTiklanabilir === false) hatalar.push(`${c.panel}: son kayda erişilemiyor`);
        if (e.altBaglanti === false) hatalar.push(`${c.panel}: alt bağlantı örtülü`);
      }
      return { durum: durum(hatalar), hatalar, olcum: o, kaydirmaSonrasi: k, kartlar, erisim, ekran: await kaydet(sayfa, `${etiket} ${adi}`) };
    });
  }

  // Dock: Uygulamalar / Daha fazla paneli; Esc ve odak dönüşü.
  await adim("dock: Uygulamalar / Daha fazla", async () => {
    const dugme = sayfa.locator(".os-dock button[aria-haspopup='dialog']").first();
    if (!(await dugme.isVisible())) return { durum: "FAIL", hatalar: ["Uygulamalar/Daha fazla düğmesi görünmüyor"] };
    const hatalar = [];
    if (!(await sayfa.evaluate(tiklanabilir, ".os-dock button[aria-haspopup='dialog']"))) hatalar.push("düğme tıklanabilir değil");
    await dugme.click(); await sayfa.waitForTimeout(200);
    const acik = await sayfa.evaluate(() => { const d = document.querySelector("dialog.os-uygulamalar"); const g = d?.querySelector(".os-uygulamalar-govde"); return { acik: Boolean(d?.open), odakIcinde: Boolean(d?.contains(document.activeElement)), govde: g ? `${g.scrollHeight}/${g.clientHeight}` : null, yatay: d ? d.scrollWidth - d.clientWidth : null }; });
    const o = await sayfa.evaluate(sayfaOlc);
    if (!acik.acik) hatalar.push("panel açılmadı"); if (acik.yatay > 1) hatalar.push(`panelde yatay ${acik.yatay}px`);
    hatalar.push(...kuralHatalari({ ...o, dockOrtuyor: [] }, null));
    const ekran = await kaydet(sayfa, `${etiket} uygulamalar`);
    await sayfa.keyboard.press("Escape"); await sayfa.waitForTimeout(150);
    const kapandi = await sayfa.evaluate(() => ({ acik: Boolean(document.querySelector("dialog.os-uygulamalar")?.open), odakDugmede: Boolean(document.activeElement?.closest(".os-dock button[aria-haspopup='dialog']")) }));
    if (kapandi.acik) hatalar.push("Esc kapatmadı"); if (!kapandi.odakDugmede) hatalar.push("odak düğmeye dönmedi");
    return { durum: durum(hatalar), hatalar, acik, kapandi, ekran };
  });

  // Bölüm menüsü (CRM): açılır listede yatay kayma yok, Esc/ikinci basış kapatır.
  if (ad !== "ana") await adim("bölüm menüsü", async () => {
    const ac = sayfa.locator(".os-bolumler-ac");
    const hatalar = [];
    const liste = await sayfa.evaluate(() => { const l = document.querySelector(".os-bolumler-liste"); return l ? { yatay: l.scrollWidth - l.clientWidth, gorunur: l.getBoundingClientRect().height > 0 } : null; });
    if (!liste) return { durum: "FAIL", hatalar: ["bölüm menüsü yok"] };
    let ekran = null, acik = null;
    if (await ac.isVisible()) {
      await ac.click(); await sayfa.waitForTimeout(150);
      acik = await sayfa.evaluate(() => { const l = document.querySelector(".os-bolumler-liste"); const b = document.querySelector(".os-bolumler-ac"); return { aria: b.getAttribute("aria-expanded"), yatay: l.scrollWidth - l.clientWidth, sagda: Math.round(l.getBoundingClientRect().right), altda: Math.round(l.getBoundingClientRect().bottom) }; });
      ekran = await kaydet(sayfa, `${etiket} bolum-menusu`);
      if (acik.aria !== "true") hatalar.push("menü açılmadı"); if (acik.yatay > 1) hatalar.push(`menüde yatay ${acik.yatay}px`);
      if (acik.sagda > w + 1 || acik.altda > h + 1) hatalar.push("menü ekran dışına taşıyor");
      await sayfa.keyboard.press("Escape"); await sayfa.waitForTimeout(100);
      if ((await ac.getAttribute("aria-expanded")) === "true") { await ac.click(); hatalar.push("Esc menüyü kapatmadı (ikinci basışla kapandı)"); }
    } else if (liste.yatay > 1) hatalar.push(`bölüm listesinde yatay ${liste.yatay}px`);
    return { durum: durum(hatalar), hatalar, liste, acik, ekran };
  });

  // Kurulum penceresi (ana): başlık sabit, yalnızca gövde kayar, Esc + odak dönüşü.
  if (ad === "ana") await adim("kurulum penceresi", async () => {
    const dugme = sayfa.locator(".dash-kurulum button.panel-secondary");
    if (!(await dugme.count())) return { durum: "UNVERIFIED", hatalar: [], not: "Kurulum tamamlanmış: kart görünmüyor" };
    if (!(await dugme.isVisible())) { const sec = sayfa.locator(".dash-gorunum-sec button", { hasText: "Kurulum" }); if (await sec.count()) await sec.click(); }
    const hatalar = [];
    await dugme.click(); await sayfa.waitForTimeout(200);
    const once = await sayfa.evaluate(() => { const d = document.querySelector(".dash-kurulum-pencere"); const g = d.querySelector(".dash-kurulum-pencere-govde"); return { acik: d.open, odakIcinde: d.contains(document.activeElement), baslikTop: Math.round(d.querySelector("h2").getBoundingClientRect().top), govde: `${g.scrollHeight}/${g.clientHeight}`, tasiyor: g.scrollHeight > g.clientHeight + 1, pencereYatay: d.scrollWidth - d.clientWidth, pencereDikey: `${d.scrollHeight}/${d.clientHeight}` }; });
    const gb = await sayfa.locator(".dash-kurulum-pencere-govde").boundingBox();
    await sayfa.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); for (let i = 0; i < 10; i++) await sayfa.mouse.wheel(0, 400); await sayfa.waitForTimeout(150);
    const sonra = await sayfa.evaluate(() => { const d = document.querySelector(".dash-kurulum-pencere"); const g = d.querySelector(".dash-kurulum-pencere-govde"); const son = [...g.querySelectorAll("li")].pop(); const a = son?.getBoundingClientRect(), r = g.getBoundingClientRect(); return { baslikTop: Math.round(d.querySelector("h2").getBoundingClientRect().top), govdeKonum: Math.round(g.scrollTop), sonAdimGorunur: a ? a.bottom <= r.bottom + 1 : null, kapatTiklanabilir: (() => { const k = d.querySelector("header .os-icon-btn").getBoundingClientRect(); const u = document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2); return Boolean(u?.closest(".os-icon-btn")); })() }; });
    const ekran = await kaydet(sayfa, `${etiket} kurulum-penceresi`);
    if (!once.acik) hatalar.push("pencere açılmadı"); if (!once.odakIcinde) hatalar.push("odak pencereye girmedi");
    if (once.pencereYatay > 1) hatalar.push(`pencerede yatay ${once.pencereYatay}px`);
    if (sonra.baslikTop !== once.baslikTop) hatalar.push(`başlık kaydı ${once.baslikTop}→${sonra.baslikTop}`);
    if (once.tasiyor && !sonra.govdeKonum) hatalar.push("taşan gövde kaymadı");
    if (sonra.sonAdimGorunur === false) hatalar.push("son adıma erişilemiyor");
    if (!sonra.kapatTiklanabilir) hatalar.push("kapat düğmesi örtülü");
    await sayfa.keyboard.press("Escape"); await sayfa.waitForTimeout(150);
    const kapandi = await sayfa.evaluate(() => ({ acik: document.querySelector(".dash-kurulum-pencere").open, odakDugmede: document.activeElement?.textContent?.trim() === "Adımları göster" }));
    if (kapandi.acik) hatalar.push("Esc kapatmadı"); if (!kapandi.odakDugmede) hatalar.push("odak düğmeye dönmedi");
    // Taşma gerçekten yoksa "yalnızca gövde kayar" bu boyutta sınanmamış olur.
    return { durum: durum(hatalar, !once.tasiyor), hatalar, once, sonra, kapandi, not: once.tasiyor ? null : "Gövde bu boyutta taşmıyor: kaydırma davranışı sınanmadı", ekran };
  });

  // Uzun ad: yalnızca gerçekten kısaltılmış bir ad varsa (düğme o zaman çıkar).
  await adim("uzun ad: Tamamını göster", async () => {
    let d = sayfa.locator(".dash-tam-metin button:visible").first();
    // Görünüm seçicide kısaltılmış ad başka bir görünümde olabilir: sırayla bak.
    if (!(await d.count()) && (await secici.isVisible())) {
      for (const g of await secici.locator("button:visible").all()) {
        await g.click(); await sayfa.waitForTimeout(150);
        d = sayfa.locator(".dash-tam-metin button:visible").first();
        if (await d.count()) break;
      }
    }
    if (!(await d.count())) return { durum: "UNVERIFIED", hatalar: [], not: "Bu görünümde kısaltılmış ad yok; fikstür oluşturulmadı" };
    const hatalar = []; const once = sayfa.url();
    await d.click(); await sayfa.waitForTimeout(300);
    const r = await sayfa.evaluate(() => { const b = [...document.querySelectorAll(".dash-tam-metin button")].find((x) => x.textContent.trim() === "Kısalt"); const kart = b?.closest(".dash-card"); const t = b?.closest(".dash-tam-metin")?.parentElement; const k = kart?.getBoundingClientRect(), m = t?.getBoundingClientRect(); return { acildi: Boolean(b), kartYatay: kart ? kart.scrollWidth - kart.clientWidth : null, kartIcinde: k && m ? m.left >= k.left - 1 && m.right <= k.right + 1 : null }; });
    const ekran = await kaydet(sayfa, `${etiket} tam-metin`);
    if (sayfa.url() !== once) hatalar.push(`yönlendirdi: ${sayfa.url()}`);
    if (!r.acildi) hatalar.push("metin açılmadı"); if (r.kartYatay > 1) hatalar.push(`kartta yatay ${r.kartYatay}px`); if (r.kartIcinde === false) hatalar.push("açılan metin kart dışına taşıyor");
    return { durum: durum(hatalar), hatalar, ...r, ekran };
  });

  kayit.durum = kayit.adimlar.some((a) => a.durum === "FAIL") ? "FAIL" : kayit.adimlar.some((a) => a.durum === "UNVERIFIED") ? "UNVERIFIED" : "PASS";
  sonuc.push(kayit);
  await sayfa.close();
}

/* Gerçek tarayıcı yakınlaştırması %200 (1440x900 → CSS 720x450). */
for (const tema of ZOOM ? TEMALAR : []) for (const [ad, yol] of Object.entries(SAYFALAR)) {
  if (oturumDustu || !sw) { sonuc.push({ senaryo: `1440x900 %200 ${tema} ${ad}`, durum: "UNVERIFIED", adimlar: [{ adim: "gerçek yakınlaştırma", durum: "UNVERIFIED", hatalar: [], testKisiti: oturumDustu ? "Oturum düştü" : "Yakınlaştırma eklentisi yüklenemedi" }] }); continue; }
  const sayfa = await ctx.newPage();
  await sayfa.setViewportSize({ width: 1440, height: 900 });
  await sayfa.goto(BASE + yol, { waitUntil: "networkidle" });
  await sayfa.evaluate((t) => localStorage.setItem("arvoos.theme", t), tema);
  await sayfa.reload({ waitUntil: "networkidle" });
  await sw.evaluate(() => self.zoomla(2)); await sayfa.waitForTimeout(500);
  const o = await sayfa.evaluate(sayfaOlc); const k = await kaydirmaDene(sayfa);
  const once = kesilen.length; const hatalar = kuralHatalari(o, k);
  if (!o.viewport.startsWith("720x")) hatalar.push(`yakınlaştırma uygulanmadı (${o.viewport}, dpr ${o.dpr})`);
  const r = yorumla({ adim: "gerçek yakınlaştırma", durum: hatalar.length ? "FAIL" : "PASS", hatalar, olcum: o, kaydirmaSonrasi: k, ekran: await kaydet(sayfa, `zoom200 ${tema} ${ad}`) }, once);
  sonuc.push({ senaryo: `1440x900 %200 ${tema} ${ad}`, durum: r.durum, adimlar: [r] });
  await sw.evaluate(() => self.zoomla(1));
  await sayfa.close();
}

await temizle();
const say = (d) => sonuc.filter((x) => x.durum === d).length;
const ozet = { PASS: say("PASS"), FAIL: say("FAIL"), UNVERIFIED: say("UNVERIFIED") };
const hukum = ozet.FAIL ? "FAIL: ürün hatası bulundu"
  : ozet.UNVERIFIED ? "TAM KABUL DEĞİL: UNVERIFIED senaryolar var"
  : "Betik kapsamında bütün senaryolar PASS — dokunmatik ve sanal klavye sınanmadığı için yine de TAM KABUL DEĞİL";
const rapor = { taban: BASE, tarih: new Date().toISOString(), hukum, ozet, sinanmayan: ["gerçek cihazda dokunmatik", "sanal klavye"], not: "Gerçek uygulama; salt okunur (GET/HEAD dışı istekler kesildi).", kesilenIstekler: kesilen.map((k) => ({ yontem: k.yontem, yol: k.yol, tur: k.tur })), sonuc };
fs.writeFileSync(path.join(CIKTI, "sonuc.json"), JSON.stringify(rapor, null, 1));
const satir = (a) => a.durum === "FAIL" ? `\n    ✗ ${a.adim}: ${a.hatalar.join("; ")}` : a.durum === "UNVERIFIED" ? `\n    ? ${a.adim}: ${a.testKisiti || a.not || "sınanamadı"}` : "";
for (const x of sonuc) console.log(`${x.durum.padEnd(11)} ${x.senaryo}${x.adimlar.map(satir).join("")}`);
console.log(`\nPASS ${ozet.PASS} · FAIL ${ozet.FAIL} · UNVERIFIED ${ozet.UNVERIFIED} · kesilen yazma isteği ${kesilen.length}`);
console.log(`Hüküm: ${hukum}`);
console.log(`Çıktı: ${CIKTI}${SAKLA ? `\nOturum profili SAKLANDI: ${PROFIL} (işiniz bitince silin)` : "\nOturum profili silindi."}`);
process.exit(ozet.FAIL ? 1 : ozet.UNVERIFIED ? 3 : 0);
