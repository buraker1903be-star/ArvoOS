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
  // PR6b: yönetim ve gözetim ekranları.
  kurum: rotaCss("panel/docentlik/kurum"),
  kisi: rotaCss("panel/docentlik/kurum/[kisi]"),
  kriterler: rotaCss("panel/docentlik/kriterler"),
  uak: rotaCss("panel/docentlik/uak"),
};

const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "docentlik-yerlesim-"));
const shim = path.join(dizin, "shim");
fs.mkdirSync(shim);
fs.writeFileSync(path.join(shim, "link.tsx"), `export default function Link({ href, children, prefetch, scroll, replace, ...p }) { return <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>; }`);
fs.writeFileSync(path.join(shim, "navigation.ts"), `export const usePathname = () => "/panel/docentlik"; export const useSearchParams = () => new URLSearchParams(); export const useRouter = () => ({ push(){}, replace(){}, refresh(){} }); export function redirect(a) { throw new Error("redirect " + a); } export function notFound() { throw new Error("notFound"); }`);
/* Tarayıcı Supabase istemcisi: yalnızca depoya yükleme (PR6b belge akışı). Çağrıyı kaydeder;
   window.__yukleme === "hata" ise kova hatası döndürür. */
fs.writeFileSync(path.join(shim, "supabase-client.ts"), `export function createClient() { return { storage: { from(kova) { return { async upload(yol, dosya, secenek) {
  window.__cagrilar.push({ ad: "upload", alanlar: { kova, yol, tur: secenek?.contentType, upsert: String(secenek?.upsert), boyut: String(dosya?.size) } });
  await new Promise((r) => setTimeout(r, window.__yuklemeMs ?? 50));
  return window.__yukleme === "hata" ? { data: null, error: { message: "new row violates row-level security policy" } } : { data: { path: yol }, error: null };
} }; } } }; }`);
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
/* PR6b. ?yetki=yok: üç yönetim anahtarı da kapalı (YetkiYok ekranı). */
const yetkiYok = new URLSearchParams(location.search).get("yetki") === "yok";
export async function yetkilerim() { return { tumunuGor: !yetkiYok, kriterYonet: !yetkiYok, uakYonet: !yetkiYok }; }
const kisiler = bos ? [] : [
  { kisi: "11111111-0000-4000-8000-000000000001", ad: "Dr. Öğr. Üyesi Ayşe Yılmaz-Karaosmanoğlu", temelAlan: "Sosyal, Beşeri ve İdari Bilimler", altAlan: "Eğitim Yönetimi ve Denetimi", doktoraTarihiGirildi: true, faaliyet: 12 },
  { kisi: "11111111-0000-4000-8000-000000000002", ad: "Üye 11111111", temelAlan: null, altAlan: null, doktoraTarihiGirildi: false, faaliyet: 3 },
  { kisi: "11111111-0000-4000-8000-000000000003", ad: "Dr. Mehmet Demir", temelAlan: "Sağlık Bilimleri", altAlan: null, doktoraTarihiGirildi: true, faaliyet: 0 },
];
export async function gozetimListesi() { if (yetkiYok) throw new Error("yetkisiz okuma"); return kisiler; }
export async function kisiAdi() { if (yetkiYok) throw new Error("yetkisiz okuma"); return kisiler[0]?.ad ?? "Üye 11111111"; }
export async function kisiOzeti() { if (yetkiYok) throw new Error("yetkisiz okuma"); return docentlikOzetim(); }
export async function kurumFaaliyetleri() { if (yetkiYok) throw new Error("yetkisiz okuma"); return { satirlar: satirlar.map((f, i) => ({ ...f, belge_yolu: i % 3 === 0 ? "k/o/f.pdf" : null })), toplam: satirlar.length, sayfaBoyu: 50, aralikDisi: false }; }
const tamKriter = (k, i) => ({ ...k, notes: i === 0 ? "Uzun bir not" : null, baslica_yazar_katsayisi: i === 0 ? 0.8 : null, diger_yazar_katsayisi: i === 0 ? 0.5 : null, esit_bolusum: i === 1, updated_at: "2026-11-01T10:00:00Z", temel_alan: i === 2 ? "Sağlık Bilimleri" : null, alt_alan: null });
export async function kriterleriOku() { if (yetkiYok) throw new Error("yetkisiz okuma"); return kriterler.map(tamKriter); }
export async function hedefleriOku() { if (yetkiYok) throw new Error("yetkisiz okuma"); return hedefler.map((h, i) => ({ id: "h" + i, temel_alan: i === 3 ? "Sağlık Bilimleri" : null, alt_alan: null, grup: h.grup, asgari_puan: h.asgari_puan, azami_puan: h.azami_puan, doktora_sonrasi: h.doktora_sonrasi, notlar: null, updated_at: "2026-11-01T10:00:00Z" })); }
export async function uakTablolari() { if (yetkiYok) throw new Error("yetkisiz okuma"); return bos ? [] : [
  { id: "22222222-0000-4000-8000-000000000001", temel_alan: "Sosyal, Beşeri ve İdari Bilimler", donem: "2026 Ekim", dosya_adi: "uak-2026-ekim-sosyal-beseri-idari-bilimler-temel-alani-puan-tablosu.pdf", durum: "yuklendi", yuklendi_at: "2026-11-14T21:30:00Z", onaylandi_at: null },
  { id: "22222222-0000-4000-8000-000000000002", temel_alan: "Sağlık Bilimleri", donem: "2026 Mart", dosya_adi: "saglik.pdf", durum: "oneri_hazir", yuklendi_at: "2026-11-10T09:00:00Z", onaylandi_at: null },
]; }
`);
/* Taklit işlemler çağrıları kaydeder; sonuç window.__sonuc ile seçilir ("basari" | "hata").
   runPanelAction hatada undefined döndürür (mesaj çerezle bildirilir) — burada da öyle. */
fs.writeFileSync(path.join(shim, "actions.ts"), `
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
window.__cagrilar = [];
const kaydet = (ad, fd) => window.__cagrilar.push({ ad, alanlar: Object.fromEntries(fd ? fd.entries() : []) });
/* runPanelAction gibi: hata mesajı çereze (iki kez kodlanmış), işlem undefined döner. */
const hataCerezi = (mesaj) => { document.cookie = "arvo_flash=" + encodeURIComponent(encodeURIComponent(mesaj)) + "; path=/"; };
const sonuc = (deger) => { if (window.__sonuc === "hata") { hataCerezi("Sentetik sunucu hatası"); return undefined; } return deger; };
export async function faaliyetEkle(fd) { kaydet("ekle", fd); await bekle(250); return sonuc({ id: "x", tekrar: false }); }
export async function faaliyetDuzenle(fd) { kaydet("duzenle", fd); await bekle(250); return sonuc({ id: "x", tekrar: false }); }
export async function faaliyetSil(fd) { kaydet("sil", fd); await bekle(50); return sonuc({ silindi: true }); }
export async function profilKaydet(fd) { kaydet("profil", fd); await bekle(50); }
const genel = (ad) => async (fd) => { kaydet(ad, fd); await bekle(80); return sonuc({ id: "x" }); };
export const kriterEkle = genel("kriterEkle"), kriterDuzenle = genel("kriterDuzenle"), kriterSil = genel("kriterSil");
export const hedefKaydet = genel("hedefKaydet"), hedefSil = genel("hedefSil"), belgeKaldir = genel("belgeKaldir"), uakSil = genel("uakSil"), uakOnayla = genel("uakOnayla");
export async function belgeYuklemeHazirla(id) { kaydet("belgeHazirla", null); await bekle(30); return sonuc({ kova: "docentlik", yol: "kurum/sahip/" + id + "/sunucu-uretti.pdf" }); }
export async function uakYuklemeHazirla() { kaydet("uakHazirla", null); await bekle(30); return sonuc({ kova: "docentlik", yol: "kurum/uak/sunucu-uretti.pdf" }); }
export async function belgeKaydet(fd) { kaydet("belgeKaydet", fd); await bekle(50); if (window.__kayit === "hata") { hataCerezi("Dosya PDF değil. Belgenin PDF'ini yükleyin."); return undefined; } return { yol: fd.get("yol") }; }
export async function uakKaydet(fd) { kaydet("uakKaydet", fd); await bekle(50); return window.__kayit === "hata" ? undefined : { id: "u" }; }
export async function belgeAdresi() { kaydet("belgeAdresi", null); return { adres: "about:blank#imzali", saniye: 60 }; }
export async function uakAdresi() { kaydet("uakAdresi", null); return { adres: "about:blank#imzali", saniye: 60 }; }
`);

const a = (p) => JSON.stringify(path.join(KOK, p));
fs.writeFileSync(path.join(dizin, "giris.tsx"), `
import { createRoot } from "react-dom/client";
import Ana from ${a("app/panel/docentlik/page.tsx")};
import Faaliyetler from ${a("app/panel/docentlik/faaliyetler/page.tsx")};
import Profil from ${a("app/panel/docentlik/profil/page.tsx")};
import Kurum from ${a("app/panel/docentlik/kurum/page.tsx")};
import Kisi from ${a("app/panel/docentlik/kurum/[kisi]/page.tsx")};
import Kriterler from ${a("app/panel/docentlik/kriterler/page.tsx")};
import Uak from ${a("app/panel/docentlik/uak/page.tsx")};
import { FlashToast } from ${a("app/panel/flash-toast.tsx")};
/* file:// altında çerez yok; panel bildirimi çerezle çalıştığı için düzenekte basit bir kap. */
{ const kap = new Map(); Object.defineProperty(document, "cookie", { configurable: true,
  get: () => [...kap].map(([k, v]) => k + "=" + v).join("; "),
  set: (satir) => { const [ilk, ...oz] = String(satir).split(";"); const i = ilk.indexOf("="); const ad = ilk.slice(0, i).trim();
    if (oz.some((o) => /max-age=0/i.test(o.trim()))) kap.delete(ad); else kap.set(ad, ilk.slice(i + 1)); } }); }
/* file:// altında modül betiği yüklenmiyor (CORS); paket iife, üst düzey await yerine async işlev. */
(async () => {
const ekran = new URLSearchParams(location.search).get("ekran") || "ana";
const sayfalar = {
  faaliyetler: () => Faaliyetler({ searchParams: Promise.resolve({}) }), profil: () => Profil(), ana: () => Ana(),
  kurum: () => Kurum(), kriterler: () => Kriterler(), uak: () => Uak(),
  kisi: () => Kisi({ params: Promise.resolve({ kisi: "11111111-0000-4000-8000-000000000001" }), searchParams: Promise.resolve({}) }),
};
const sayfa = await sayfalar[ekran]();
createRoot(document.getElementById("kok")).render(
  <div className="panel-root os-root"><main className="panel-frame os-frame">
    <header className="os-bar"><a className="os-brand" href="/panel"><i>A</i><span><b>Prova Kurum</b></span></a></header>
    <section className="os-workspace"><div className="panel-content">{sayfa}</div></section><FlashToast />
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
    b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: path.join(shim, "supabase-client.ts") }));
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


/*
  PR6b davranışları (sunucu işlemleri ve depo taklit; GERÇEK yükleme/imzalı adres UNVERIFIED):
   - belge: PDF olmayan dosya sunucuya hiç gitmeden formda reddedilir; geçerli PDF
     sırası hazırla → yükle (sunucunun yolu, upsert yok, PDF türü) → kaydet (aynı yol);
     kova hatası formda gösterilir ve kayıt çağrılmaz;
   - ÜAK: aynı akış + temel alan/dönem/dosya adı; onay düğmesi devre dışı;
   - kriter: hata alanları korur, başarı sıfırlar; silme onaylı ve doğru kimlikle;
   - gözetim: yazma düğmesi yok (yalnızca Görüntüle).
*/
const PDF = { name: "makale.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%sentetik\n") };
const PNG = { name: "resim.png", mimeType: "image/png", buffer: Buffer.from("\x89PNG sentetik") };
async function yonetimDurumlari(sayfa, ekran) {
  const s = {};
  const cagrilar = () => sayfa.evaluate(() => window.__cagrilar.map((c) => ({ ad: c.ad, ...c.alanlar })));
  const sifirla = () => sayfa.evaluate(() => { window.__cagrilar.length = 0; window.__sonuc = "basari"; window.__yukleme = "tamam"; window.__kayit = "tamam"; });
  const acikPencere = "dialog[open], .panel-modal-root";
  if (ekran === "faaliyetler") {
    await sifirla();
    await sayfa.getByRole("button", { name: "PDF ekle" }).first().click();
    await sayfa.waitForTimeout(150);
    const form = sayfa.locator(`${acikPencere} form.docentlik-form`).last();
    await form.locator("input[type=file]").setInputFiles(PNG);
    await form.locator("button[type=submit]").click(); await sayfa.waitForTimeout(200);
    s["belge: PDF olmayan dosya formda reddedilir"] = await form.locator("[role=alert]").isVisible();
    s["belge: reddedilen dosya sunucuya gitmez"] = (await cagrilar()).length === 0 || await cagrilar();
    await form.locator("input[type=file]").setInputFiles(PDF);
    s["belge: yeni seçim hatayı temizler"] = (await form.locator("[role=alert]").count()) === 0;
    await sayfa.evaluate(() => { window.__yukleme = "hata"; });
    await form.locator("button[type=submit]").click(); await sayfa.waitForTimeout(400);
    let c = await cagrilar();
    s["belge: kova hatası formda, kayıt çağrılmaz"] = (await form.locator("[role=alert]").isVisible()) && c.map((x) => x.ad).join(",") === "belgeHazirla,upload" || c;
    await sifirla();
    await form.locator("button[type=submit]").click(); await sayfa.waitForTimeout(400);
    c = await cagrilar();
    s["belge: sıra hazırla → yükle → kaydet"] = c.map((x) => x.ad).join(",") === "belgeHazirla,upload,belgeKaydet" || c;
    s["belge: yükleme sunucunun yoluna, upsert yok, PDF türü"] = c[1]?.yol === c[2]?.yol && /sunucu-uretti\.pdf$/.test(c[1]?.yol ?? "") && c[1]?.upsert === "false" && c[1]?.tur === "application/pdf" || c;
    /* Yavaş yükleme (15 sn'lik "submit" yoklamasını aşan) + sunucunun kayıt hatası: mesaj yine bildirimde. */
    await sayfa.waitForTimeout(4200); // önceki başarı bildirimi kapansın
    await sifirla();
    await sayfa.evaluate(() => { window.__yuklemeMs = 16500; window.__kayit = "hata"; });
    await form.locator("input[type=file]").setInputFiles(PDF);
    await form.locator("button[type=submit]").click();
    await sayfa.waitForTimeout(17800);
    s["belge: 15 sn'yi aşan yüklemede sunucu hatası bildirime ulaşıyor"] = /PDF değil/.test(await sayfa.locator('.panel-toast[role="alert"]').textContent({ timeout: 500 }).catch(() => "")) || "bildirim yok";
    s["belge: sunucu hatasında seçilen dosya korunuyor"] = await form.locator("input[type=file]").evaluate((e) => e.files.length === 1);
    await sayfa.evaluate(() => { window.__yuklemeMs = 50; });
    await sayfa.keyboard.press("Escape"); await sayfa.waitForTimeout(150);
  }
  if (ekran === "uak") {
    s["üak: onay düğmesi devre dışı"] = await sayfa.getByRole("button", { name: "Onayla" }).first().isDisabled();
    s["üak: onay nedeni görünür"] = await sayfa.locator("#uak-onay-neden").isVisible();
    s["üak: öneri durumu ayrı rozet"] = (await sayfa.locator('.docentlik-rozet[data-ton="uyari"]').count()) === 1 && (await sayfa.locator('.docentlik-rozet[data-ton="notr"]').count()) === 1;
    await sifirla();
    const form = sayfa.locator("form.docentlik-form").last();
    await form.locator("input[name=temel_alan]").fill("Fen Bilimleri ve Matematik");
    await form.locator("input[name=donem]").fill("2026 Ekim");
    await form.locator("input[type=file]").setInputFiles(PDF);
    await form.locator("button[type=submit]").click(); await sayfa.waitForTimeout(400);
    const c = await cagrilar();
    s["üak: sıra hazırla → yükle → kaydet, alanlar doğru"] = c.map((x) => x.ad).join(",") === "uakHazirla,upload,uakKaydet" && c[2].yol === c[1].yol && c[2].temel_alan === "Fen Bilimleri ve Matematik" && c[2].donem === "2026 Ekim" && c[2].dosya_adi === "makale.pdf" || c;
    s["üak: başarıdan sonra form sıfırlandı"] = (await form.locator("input[name=temel_alan]").inputValue()) === "";
    s["üak: onay işlemi hiç çağrılmadı"] = !c.some((x) => x.ad === "uakOnayla");
  }
  if (ekran === "kriterler") {
    await sifirla();
    await sayfa.getByRole("button", { name: "Yeni kriter" }).click(); await sayfa.waitForTimeout(150);
    const form = sayfa.locator(`${acikPencere} form.docentlik-form`).last();
    await form.locator("input[name=kod]").fill("E5");
    await form.locator("input[name=birim_puan]").fill("12,5");
    await form.locator("input[name=etiket]").fill("Sentetik kriter");
    await sayfa.evaluate(() => { window.__sonuc = "hata"; });
    await form.locator("button[type=submit]").click(); await sayfa.waitForTimeout(300);
    s["kriter: hata alanları korur"] = (await form.locator("input[name=etiket]").inputValue()) === "Sentetik kriter";
    await sayfa.waitForTimeout(500);
    s["kriter: sunucu hatası bildirimde görünüyor"] = /Sentetik sunucu hatası/.test(await sayfa.locator('.panel-toast[role="alert"]').textContent({ timeout: 500 }).catch(() => "")) || "bildirim yok";
    await sayfa.evaluate(() => { window.__sonuc = "basari"; });
    await form.locator("button[type=submit]").click(); await sayfa.waitForTimeout(300);
    const c = await cagrilar();
    s["kriter: iki çağrı, alanlar doğru (aktif=1)"] = c.length === 2 && c[1].ad === "kriterEkle" && c[1].kod === "E5" && c[1].birim_puan === "12,5" && c[1].aktif === "1" || c;
    await sayfa.keyboard.press("Escape"); await sayfa.waitForTimeout(150);
    await sifirla();
    await sayfa.locator(".docentlik-tehlike").first().click(); await sayfa.waitForTimeout(150);
    await sayfa.locator("dialog[open] button[type=submit]").click(); await sayfa.waitForTimeout(300);
    const c2 = await cagrilar();
    s["kriter: silme onaylı, doğru kimlik"] = c2.length === 1 && c2[0].ad === "kriterSil" && c2[0].kriter_id === "k1" || c2;
  }
  if (ekran === "kurum" || ekran === "kisi") {
    const dugmeler = await sayfa.evaluate(() => [...document.querySelectorAll(".docentlik-sayfa button")].map((b) => b.textContent.trim()).filter((t) => t !== "Görüntüle"));
    s["gözetim: yazma düğmesi yok"] = dugmeler.length === 0 || dugmeler;
    s["gözetim: doktora tarihi görünmüyor"] = !(await sayfa.evaluate(() => /2019|15\.06/.test(document.querySelector(".docentlik-sayfa").textContent)));
  }
  return s;
}

const sorunlar = [];
const sonuc = {};
const tarayici = await chromium.launch();
const BOYUTLAR = (process.env.BOYUTLAR ?? "1440x900,1024x768,768x1024,390x844").split(",").map((b) => b.split("x").map(Number));
const EKRANLAR = [["ana", "dolu"], ["ana", "bos"], ["faaliyetler", "dolu"], ["faaliyetler", "bos"], ["profil", "dolu"], ["profil", "bos"],
  ["kurum", "dolu"], ["kurum", "bos"], ["kurum", "yetkisiz"], ["kisi", "dolu"], ["kisi", "yetkisiz"],
  ["kriterler", "dolu"], ["kriterler", "bos"], ["kriterler", "yetkisiz"], ["uak", "dolu"], ["uak", "bos"], ["uak", "yetkisiz"]];
for (const [w, h] of BOYUTLAR) for (const tema of ["light", "dark"]) for (const [ekran, veri] of EKRANLAR) {
  const anahtar = `${w}x${h} ${tema} ${ekran}/${veri}`;
  const sayfa = await tarayici.newPage({ viewport: { width: w, height: h } });
  const hatalar = [];
  sayfa.on("pageerror", (e) => hatalar.push(e.message));
  sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
  await sayfa.goto(`file://${path.join(dizin, `${tema}-${ekran}.html`)}?ekran=${ekran}&veri=${veri === "yetkisiz" ? "dolu" : veri}${veri === "yetkisiz" ? "&yetki=yok" : ""}`);
  await sayfa.waitForFunction(() => window.__hazir === true || window.__hata, null, { timeout: 10000 }).catch(() => {});
  const hata = await sayfa.evaluate(() => window.__hata || null);
  if (hata || hatalar.length) { console.error(anahtar, hata, hatalar); }
  await sayfa.waitForTimeout(150);
  const o = await sayfa.evaluate(olc);
  o.hatalar = hatalar;

  // Yeni faaliyet penceresi (ana ve faaliyetler; dolu veride kriter var).
  if ((ekran === "ana" || ekran === "faaliyetler") && veri === "dolu") {
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
  if (veri === "dolu" && ["faaliyetler", "uak", "kriterler", "kurum", "kisi"].includes(ekran) && w === BOYUTLAR[0][0] && tema === "light") o.yonetimDurumlari = await yonetimDurumlari(sayfa, ekran);
  /* Yetkisiz: veri okunmadan YetkiYok (taklit okuma yetkisizken fırlatır → __hata). */
  if (veri === "yetkisiz") o.yetkiYok = await sayfa.evaluate(() => ({ kapali: /yetkiniz yok/.test(document.querySelector(".docentlik-sayfa [role=status]")?.textContent ?? ""), tablo: document.querySelectorAll(".docentlik-sayfa table").length, sekmeler: [...document.querySelectorAll(".docentlik-sekmeler a")].map((a) => a.textContent.trim()),
    /* Taklit verinin ayırt edici parçaları (kişi adı, kriter kodu, ÜAK dosyası, faaliyet başlığı) ekranda OLMAMALI. */
    sizinti: (document.querySelector(".docentlik-sayfa").textContent.match(/Karaosmanoğlu|Mehmet Demir|A1 ·|saglik\.pdf|Faaliyet 2\b|Uluslararası makale/g) ?? []) }));
  sonuc[anahtar] = o;
  if (o.silRengi && o.silRengi.renk !== o.silRengi.beklenen) sorunlar.push(`${anahtar}: Sil düğmesi tehlike renginde değil ${JSON.stringify(o.silRengi)}`);
  if (o.yonetimDurumlari) for (const [ad, gecti] of Object.entries(o.yonetimDurumlari)) if (gecti !== true) sorunlar.push(`${anahtar}: "${ad}" ${JSON.stringify(gecti)}`);
  if (o.yetkiYok && (!o.yetkiYok.kapali || o.yetkiYok.tablo || o.yetkiYok.sekmeler.length !== 3 || o.yetkiYok.sizinti.length)) sorunlar.push(`${anahtar}: yetkisiz görünüm ${JSON.stringify(o.yetkiYok)}`);
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
