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
import { tekEkranHukmu } from "./tek-ekran-kabulu.mjs";
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
/* Kurucu konsolunun ana sayfası da "panel" rotasından çiziliyor
   (konsol-ana-sayfa.tsx, yalnızca yonetim.arvo-os.com): CSS kümesi aynı. */
const cssler = { ana: rotaCss("panel"), crm: rotaCss("panel/crm/genel-bakis"), konsol: rotaCss("panel"), urundetay: rotaCss("panel/platform/urunler/[urun]"), urunler: rotaCss("panel/platform/urunler") };
const SENARYOLAR = (process.env.SENARYOLAR ?? "ana,crm,konsol,urundetay,urunler").split(",");

/*
  Üretilen sayfalar geçici bir dizinde ve koşu sonunda siliniyor.
  SAKLA=<dizin> verilirse orada bırakılır: gezinmenin tıklamalı
  davranışını (menüyü daralt, "Daha fazla" penceresi, klavye odağı)
  aynı sayfalar üzerinde ayrıca ölçebilmek için.
*/
const dizin = process.env.SAKLA ?? fs.mkdtempSync(path.join(os.tmpdir(), "yerlesim-"));
if (process.env.SAKLA) fs.mkdirSync(dizin, { recursive: true });
const shim = path.join(dizin, "shim");
fs.mkdirSync(shim);
/*
  GEZİNME ŞİMİ (26.11.2026). Rota artık ölçülen şeyin parçası: ürün
  kartının bölümü adreste (?bolum=) ve kabul tıklamayla başlıyor —
  tıkla, adres değişsin, içerik ona uysun; geri/ileri da çalışsın.

  Adres HASH'te tutuluyor: sayfa file:// ile açıldığı için
  history.pushState yol DEĞİŞTİREMİYOR (kaynak opak), ama hash
  değiştirebiliyor. Böylece tarayıcının GERÇEK geçmişi kullanılıyor:
  geri/ileri popstate üretiyor, yenileme hash'i koruyor.
*/
fs.writeFileSync(path.join(shim, "link.tsx"), `import { yonlendir } from "./navigation";
export default function Link({ href, children, prefetch, scroll, replace, onClick, ...p }) {
  const yol = typeof href === "string" ? href : "#";
  return <a href={"#" + yol} {...p} onClick={(o) => { onClick?.(o); if (!o.defaultPrevented) { o.preventDefault(); yonlendir(yol); } }}>{children}</a>;
}`);
fs.writeFileSync(path.join(shim, "navigation.ts"), `import { useSyncExternalStore } from "react";
const dinleyiciler = new Set();
const bildir = () => { for (const f of dinleyiciler) f(); };
const abone = (f) => { dinleyiciler.add(f); return () => dinleyiciler.delete(f); };
/** Geçerli adres: hash varsa o, yoksa sayfanın kurulum adresi. */
function adres() {
  const h = location.hash.slice(1);
  if (h) return h;
  const p = new URLSearchParams(location.search);
  const yol = p.get("yol") || window.__yol || "/panel";
  const bolum = p.get("bolum");
  return bolum ? yol + "?bolum=" + bolum : yol;
}
let anlik = adres();
const tazele = () => { const y = adres(); if (y !== anlik) { anlik = y; bildir(); } };
window.addEventListener("hashchange", tazele);
window.addEventListener("popstate", tazele);
export function yonlendir(hedef) {
  history.pushState({}, "", "#" + hedef);
  anlik = hedef;
  bildir();
}
const oku = () => anlik;
export const usePathname = () => useSyncExternalStore(abone, oku, oku).split("?")[0];
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(abone, oku, oku).split("?")[1] || "");
export const useRouter = () => ({ push: yonlendir, replace: yonlendir, refresh(){}, back(){ history.back(); }, forward(){ history.forward(); } });
`);
/* Sayfa file:// ile açılıyor; "/brand/..." gibi kök yollar dosya
   sisteminin köküne düşüyor ve logo kırık çıkıyordu. Şim, kök yolları
   deponun public/ dizinine çeviriyor. */
fs.writeFileSync(path.join(shim, "image.tsx"), `const KAMU = ${JSON.stringify(path.join(KOK, "public"))};
export default function Image({ src, alt, width, height, className }) {
  const yol = typeof src === "string" && src.startsWith("/") ? "file://" + KAMU + src : src;
  return <img src={yol} alt={alt} width={width} height={height} className={className} />;
}`);

const a = (p) => JSON.stringify(path.join(KOK, p));
fs.writeFileSync(path.join(dizin, "giris.tsx"), `
import { createRoot } from "react-dom/client";
import { GenelBakis, ListeKarti, ListeSatiri, SeriKarti } from ${a("app/panel/os/genel-bakis.tsx")};
import { GorunumSecici } from ${a("app/panel/os/gorunum-secici.tsx")};
import { OsAramaDugmesi, OsKomutPaleti } from ${a("app/panel/os/os-command-palette.tsx")};
import { OsMenuKapat } from ${a("app/panel/os/os-menu-kapat.tsx")};
import { ThemeToggle } from ${a("app/panel/theme-toggle.tsx")};
import { OsSimge as OsSimgeDuz } from ${a("app/panel/os/os-icons.tsx")};
import { UrunPerformansiKarti } from "@/app/panel/konsol-urun-performansi";
import { UrunListesi } from "@/app/panel/platform/urunler/urun-listesi";
import { urunBekleyenleri } from "@/lib/konsol/urun-bekleyenler";
import { KararBekleyenlerKarti, OtomasyonlarKarti } from "@/app/panel/konsol-ana-kartlar";
import { DonemSecici, OlcutSecici } from "@/app/panel/konsol-donem-secici";
import { ArvoOsIsareti, ArvoOsLogosu } from "@/app/panel/os/arvoos-markasi";
import { bolumAdresi, bolumSirasi, urunBolumu } from "@/lib/konsol/urun-bolumleri";
import { UrunGenelBakis } from "@/app/panel/platform/urunler/[urun]/urun-genel-bakis";
import { OsNavigasyon } from ${a("app/panel/os/os-navigasyon.tsx")};
import { TalepAkis } from ${a("app/panel/crm/kayit-detay/kayit-akis.tsx")};
import { useSearchParams } from "next/navigation";
import { MobilSatir } from "@/app/panel/crm/table-cells";
import Link from "next/link";
import { konsolUygulamalari } from ${a("app/panel/os/konsol-apps.ts")};
import { otomasyonlar } from ${a("lib/konsol/otomasyonlar.ts")};
import { cronDurumlari } from ${a("lib/cron-isleri.ts")};
import { etkinUygulama } from ${a("app/panel/os/os-apps.ts")};
import { etkinBolum } from ${a("app/panel/os/os-bolumler.ts")};
import { usePathname } from "next/navigation";
${yeniKurulum ? `import { KurulumOzeti } from ${a("app/panel/os/kurulum-ozeti.tsx")};` : ""}
const sayfa = new URLSearchParams(location.search).get("sayfa") || "ana";
/* ?menu=dar: masaüstü sol menünün DARALTILMIŞ hâli. Üretimde bu
   özniteliği ön boyama betiği yazıyor (lib/konsol/gezinme.ts); burada
   aynı öznitelik elle veriliyor ki iki durum da görüntülenebilsin. */
if (new URLSearchParams(location.search).get("menu") === "dar") document.documentElement.setAttribute("data-konsol-menu", "dar");
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
/*
  KURUCU KONSOLU ANA EKRANI (25.11.2026).

  konsol-ana-sayfa.tsx'in ürettiği bileşimin AYNISI, sentetik veriyle:
  köprü satırı + sayı şeridi + GorunumSecici(Bugünün İşleri | Tahsilat ·
  Sistem sağlığı · Son hareketler). Ölçülen şey düzen; veri sunucuda
  okunuyor ve burada yok.

  İKİ BİLİNÇLİ TAKLİT: (1) HizliOnay bir sunucu işlemi çağırıyor, burada
  koşamaz — satırın GEOMETRİSİ aynı kalsın diye aynı sınıflarla
  (form.hizli-onay > button.panel-ghost) düz bir düğme çiziliyor.
  (2) Dock, konsolUygulamalari()'nın GERÇEK listesi (rozetli).
*/
const konsolSerit = [
  ["Ödeme onayı", "3", "gold", "/panel/platform/payments"],
  ["Sözleşme onayı", "1", "gold", "/panel/platform/sozlesmeler"],
  ["Bu ay tahsilat", "182.400,00 ₺", "info", "/panel/platform/tahsilat"],
  ["Aktif kurum", "24", "info", "/panel/platform/musteriler"],
  ["Dönemi dolan", "2", "danger", "/panel/platform/yenilemeler"],
];
const odemeSatiri = (ad, tutar, ayrinti, uyari, i) => (
  <li key={i} className="pu-eylemli">
    <a href="/panel/platform/payments">
      <span className="pu-govde"><b>{ad}</b><small>{uyari ? "Beklenenle uyuşmuyor · incelenmeli" : ayrinti}</small></span>
      <span className="konsol-tutar" data-uyari={uyari ? "evet" : undefined}>{tutar}</span>
    </a>
    {uyari ? null : <form className="hizli-onay"><button className="panel-ghost" type="button">Onayla</button></form>}
  </li>
);
const KURUMLAR = [
  ["Akademik Merkez Danışmanlık A.Ş.", "24.900,00 ₺", "ArvoLab · Havale/EFT · 2 saat önce", false],
  ["Yıldız Eğitim Kurumları", "149.000,00 ₺", "ArvoOS · Kart (PayTR) · 5 saat önce", true],
  ["Boğaziçi Araştırma ve Yayın Ltd.", "14.900,00 ₺", "ArvoLab · Havale/EFT · dün", false],
  ["Ege Akademi Yayıncılık", "39.900,00 ₺", "ArvoARC · Havale/EFT · dün", false],
  ["Marmara Tez Danışmanlık", "9.900,00 ₺", "ArvoCal · Havale/EFT · 2 gün önce", false],
  ["Anadolu Bilim Merkezi", "74.500,00 ₺", "ArvoOS · Havale/EFT · 3 gün önce", false],
];
/*
  KONSOL İÇERİĞİ ROTAYI İZLİYOR (26.11.2026, inceleme bulgusu).

  Düzenek bir süre hangi adreste olursa olsun Ana Sayfa'yı çiziyordu;
  "Finans alt menüsü açıkken içerikte hâlâ Ana Sayfa" görünen bir kare
  bu yüzden çıktı. Menü, adres ve sayfa içeriği aynı akışı
  göstermeli, yoksa kanıt kanıt değil.

  Bölüm sayfaları üretimdeki gerçek ekranlar değil; burada ölçülen şey
  GEZİNME: başlık adresten çözülüyor (konsol-apps.ts + os-bolumler.ts),
  yani menünün seçili satırıyla aynı kaynaktan.
*/
function KonsolRota() {
  const yol = usePathname();
  const sorgu = useSearchParams();
  const uyg = konsolUygulamalari({ odeme: 3, sozlesme: 1, destek: 2 });
  const etkin = etkinUygulama(uyg, yol);
  if (!etkin || etkin.key === "home") return <Konsol />;
  const bolum = etkin.bolumler?.length ? etkinBolum(etkin.bolumler, yol, sorgu.toString()) : null;
  return (
    <GenelBakis baslik={bolum?.label ?? etkin.label} sinif="konsol-bolum-prova">
      <article className="kak-kart">
        <header className="kak-bas"><h2>{etkin.label} · {bolum?.label ?? "Modül"}</h2></header>
        <p className="kak-bos">Ölçüm düzeneğinin bölüm provası: {yol}</p>
      </article>
    </GenelBakis>
  );
}

function Konsol() {
  const islerPaneli = (
    <div id="bugunun-isleri" className="konsol-isler-kap">
      <h2 className="konsol-isler-baslik">Bugünün işleri</h2>
      <TalepAkis kimlik="konsol-is" etiket="Bugünün işleri" sinif="konsol-isler" baslangic={0}
        sekmeler={["Ödeme · 6", "Sözleşme · 1", "Kurulum", "Dönem · 2", "Sorun"]}>
        <section>
          <div className="phr-bas"><b>Ödeme onayları</b><small>Kurumların gönderdiği dekontlar ve kart ödemeleri; onaylanınca lisans açılır.</small></div>
          <ul className="pu-liste">{KURUMLAR.map((k, i) => odemeSatiri(k[0], k[1], k[2], k[3], i))}</ul>
        </section>
        <section><div className="phr-bas"><b>Sözleşme onayları</b></div><ul className="pu-liste">{KURUMLAR.slice(0, 1).map((k, i) => odemeSatiri(k[0], k[1], k[2], false, i))}</ul></section>
        <section><p className="pu-bos">Bekleyen kurulum yok.</p></section>
        <section><ul className="pu-liste">{KURUMLAR.slice(0, 2).map((k, i) => odemeSatiri(k[0], k[1], "Dönem bitti", false, i))}</ul></section>
        <section><p className="pu-bos">Her kiracı yolunda.</p></section>
      </TalepAkis>
    </div>
  );
  const saglik = (
    <article className="dash-card dash-col">
      <header className="dash-card-head"><div><h2>Sistem sağlığı</h2><p>Ürün köprüleri, kurulumlar ve okunabilirlik</p></div></header>
      <div className="dash-col-govde">
        <ul className="konsol-saglik">
          <li><span className="status-pill" data-tone="danger">yanıt yok</span><span><b>ArvoCal köprüsü</b><small>Bağlanılamadı: fetch failed</small></span></li>
          <li><span className="status-pill" data-tone="danger">2</span><span><b>Kurulumda hatada kalan kurum</b><small><a href="/panel/platform/kurulumlar">Kurulumlar</a> ekranından sürdürülebilir.</small></span></li>
          <li><span className="status-pill" data-tone="neutral">1</span><span><b>Okunamayan veri kaynağı</b><small>Bireysel abone ödemeleri — bu alanlar ölçülemedi.</small></span></li>
        </ul>
      </div>
      <a className="dash-card-link" href="/panel/platform/saglik">Sistem sağlığı <span aria-hidden="true">›</span></a>
    </article>
  );
  const hareketSatiri = ([ad, tutar, alt], i) => (
    <ListeSatiri key={i} href="/panel/platform/tahsilat" baslik={ad} alt={alt}
      sag={<span className="konsol-tutar">{tutar}</span>} zaman="2 saat önce" />
  );
  /* Üretimdeki dört ürün; biri "Veri bağlı değil", biri "Veri okunamadı"
     hâlini çiziyor ki iki durum da ölçülsün.

     ArvoLab tahsilatı tabloda ve ürün detayında AYNI sayı (128.450):
     ilk sürümde iki fikstür iki ayrı sayı taşıyordu (397.200 / 128.450)
     ve görüntüler hesapta tutarsızlık varmış izlenimi veriyordu. Üretimde
     iki ekran aynı fonksiyonu aynı süzgeçle çağırıyor; fark yalnızca
     mockup'tan kopyalanan örnek sayılardaydı. */
  const URUN_SATIRLARI = [
    { kod: "arvoos", ad: "ArvoOS", aktifMusteri: { durum: "var", deger: 1248 }, donusum: { durum: "kaynak_yok" }, tahsilat: { durum: "var", deger: 612400 } },
    { kod: "arvolab", ad: "ArvoLab", aktifMusteri: { durum: "var", deger: 892 }, donusum: { durum: "var", deger: { denemeye: 200, ucretliye: 36, oran: 0.18 } }, tahsilat: { durum: "var", deger: 128450 } },
    { kod: "arc", ad: "ArvoARC", aktifMusteri: { durum: "var", deger: 316 }, donusum: { durum: "okunamadi" }, tahsilat: { durum: "var", deger: 184900 } },
    { kod: "randevu", ad: "ArvoCal", aktifMusteri: { durum: "var", deger: 427 }, donusum: { durum: "kaynak_yok" }, tahsilat: { durum: "var", deger: 160750 } },
  ];
  /*
    ?durum=bos: veri DURUMLARININ kanıtı. Dolu liste varsayılan;
    bu değişkende öncelikli işler boş ("Bekleyen iş yok"), bir ürünün
    dönüşümü "Dönemde deneme yok" (payda sıfır — yüzde YAZILMAZ) ve
    kuyruğun bir kalemi okunamamış durumda. Üçü de üretimde tek tek
    çizilebilen hâller ve ekranda farklı metinler üretiyor.
  */
  const bosDurum = new URLSearchParams(location.search).get("durum") === "bos";
  /* Ana Sayfa kartlarının örnek verisi: yapı üretimdekiyle aynı
     (KararKalemi / Otomasyon tipleri), değerler örnek. */
  const KARARLAR = [
    { anahtar: "k1", urun: "ArvoLab", baslik: "Ödeme bildirimi", alt: "#P-87421 · Akademik Merkez · ₺28.900 · 3 gün gecikmede", zaman: new Date().toISOString().slice(0, 11) + "09:15:00Z", href: "/panel/platform/payments" },
    { anahtar: "k2", urun: "ArvoCal", baslik: "Yaklaşan yenileme", alt: "#Y-56390 · Yıldız Eğitim · 12 müşteri · 7 gün içinde", href: "/panel/platform/musteriler/1" },
    { anahtar: "k3", urun: "ArvoOS", baslik: "Yanıt bekleyen talep", alt: "#T-91877 · Ege Akademi · Kurumsal plan · 18 saattir yanıtsız", zaman: new Date(Date.now() - 86400000).toISOString().slice(0, 11) + "11:27:00Z", href: "/panel/platform/destek/1", eylem: "Görüntüle" },
  ];
  /*
    OTOMASYON SATIRLARI ARTIK ELLE YAZILMIYOR (27.11.2026, inceleme
    bulgusu). Eskiden üç satır sabit metin ve sabit etiketle duruyordu;
    kural değişince (köprü kopuk → "Yeniden deneniyor" yerine
    "Bağlantı kesildi") fixture eski hâlinde kaldı ve düzenek,
    ÜRETİMİN ÜRETEMEYECEĞİ bir durumu çizdi. Telefon kaydındaki
    "Yeniden deneniyor + bağlantı kopukluğu" satırı buydu: örnek veri
    kusuru, eşleme mantığı değil.

    Artık düzenek de gerçek kuralı (lib/konsol/otomasyonlar) çağırıyor;
    fixture yalnızca GİRDİ veriyor (cron kayıtları, köprü durumu,
    deneme kuyruğu). Kuralın yazamayacağı bir etiket ekranda
    görünemez.

    OTOMASYON=<senaryo> ile girdi değişiyor:
      saglikli (varsayılan) · kopuk (köprü kopuk, kuyruk boş)
      · kuyruk (deneme hakkı süren 2 abonelik)
  */
  const SIMDI = new Date();
  const cronKaydi = (yol) => ({ is_adi: yol, son_calisma: SIMDI.toISOString(), son_basarili: SIMDI.toISOString(), sonuc: "tamam", sure_ms: 420, ayrinti: null });
  const CRON_KAYITLARI = [
    "/api/cron/otomatik-yenileme", "/api/cron/otomatik-proforma", "/api/cron/abonelik-hatirlatma",
    "/api/cron/arvolab-sync", "/api/cron/arc-sync", "/api/cron/randevu-sync",
    "/api/cron/posta-esitleme", "/api/cron/adim-terminleri",
  ].map(cronKaydi);
  const OTOMASYON_SENARYO = new URLSearchParams(location.search).get("otomasyon") || "saglikli";
  const KOPRULER = OTOMASYON_SENARYO === "kopuk"
    ? [{ yapilandirilmamis: false, kopuk: false }, { yapilandirilmamis: false, kopuk: true }, { yapilandirilmamis: false, kopuk: false }]
    : [{ yapilandirilmamis: false, kopuk: false }];
  const KUYRUKLAR = OTOMASYON_SENARYO === "kuyruk" ? [{ grup: "tahsilat", bekleyen: 2 }] : [];
  const OTOMASYONLAR = otomasyonlar(cronDurumlari(CRON_KAYITLARI, SIMDI, new Date(SIMDI.getTime() - 86400000)), KOPRULER, KUYRUKLAR);
  const URUN_SAGLIK = [
    { durum: "saglikli", etiket: "Sağlıklı", ton: "success" },
    { durum: "saglikli", etiket: "Sağlıklı", ton: "success" },
    { durum: "saglikli", etiket: "Sağlıklı", ton: "success" },
    { durum: "sorunlu", etiket: "Sorunlu", ton: "danger", not: "Köprü yanıt vermiyor." },
  ];
  /* Dönüşümün payda-sıfır hâli: oran null → "Dönemde deneme yok". */
  const URUN_DURUMLARI = URUN_SATIRLARI.map((r) =>
    r.kod === "arvolab" ? { ...r, donusum: { durum: "var", deger: { denemeye: 0, ucretliye: 0, oran: null } } } : r);
  const ONCELIKLI = [
    { anahtar: "o1", urun: "ArvoLab", baslik: "Ödeme bildirimi", alt: "Akademik Merkez Danışmanlık A.Ş. · ₺24.900", href: "/panel/platform/payments" },
    { anahtar: "o2", urun: "ArvoCal", baslik: "Yaklaşan yenileme", alt: "Yıldız Eğitim Kurumları · 3 gün kaldı", href: "/panel/platform/musteriler/1" },
    { anahtar: "o3", baslik: "Sözleşme onayı", alt: "Boğaziçi Araştırma · SZL-2026-114", href: "/panel/platform/sozlesmeler" },
    { anahtar: "o4", baslik: "Yanıt bekleyen talep", alt: "Ege Akademi · Fatura adresi", href: "/panel/platform/destek/1", eylem: "Görüntüle" },
  ];
  const paneller = [
    /* GENEL BAKIŞ TEK BÖLÜM (26.11.2026, onaylı mockup): iki kart alt
       alta, tam genişlik. Üretimdeki yapının aynısı. */
    { anahtar: "genel", etiket: "Genel Bakış", yer: "liste",
      icerik: (
        <div className="konsol-genel">
          <UrunPerformansiKarti satirlar={bosDurum ? URUN_DURUMLARI : URUN_SATIRLARI} olcut="musteri"
            donem={{ kod: "30g", etiket: "Son 30 gün", gun: 30, baslangic: "", bitis: "", oncekiBaslangic: "", oncekiBitis: "" }}
            para={(n) => "₺" + n.toLocaleString("tr-TR")} sayi={(n) => n.toLocaleString("tr-TR")}
            secici={<DonemSecici secili="30g" taban="/panel" />}
            olcutSecici={<OlcutSecici secili="musteri" taban="/panel" />} />
          <KararBekleyenlerKarti kalemler={bosDurum ? [] : KARARLAR} okunamayan={bosDurum ? ["Destek kuyruğu"] : []} />
        </div>
      ) },
    { anahtar: "isler", etiket: "Bugünün İşleri", yer: "liste", icerik: islerPaneli },
    { anahtar: "tahsilat", etiket: "Tahsilat", yer: "liste", grup: "nabiz",
      icerik: <SeriKarti baslik="Tahsilat" alt="Son 14 gün" seri={seri} adet="tahsilat" href="/panel/platform/tahsilat" bos="Son 14 günde tahsilat yok." /> },
    { anahtar: "saglik", etiket: "Sistem sağlığı", yer: "liste", grup: "nabiz", icerik: saglik },
    { anahtar: "hareketler", etiket: "Son hareketler", yer: "liste", grup: "nabiz",
      icerik: <ListeKarti baslik="Son hareketler" alt="Tahsilatlar ve kurulum adımları" bos="Son dört haftada hareket yok."
        sayi={12} href="/panel/platform/tahsilat" hrefEtiket="Tahsilatlar"
        gruplar={[
          { anahtar: "tahsilat", baslik: "Tahsilat", satirlar: KURUMLAR.map(hareketSatiri) },
          { anahtar: "kurulum", baslik: "Kurulum", satirlar: KURUMLAR.slice(0, 6).map((k, i) => (
            <ListeSatiri key={"k" + i} href="/panel/platform/kurulumlar" baslik={k[0]} alt="Kurum açma · tamamlandı" zaman="dün" />
          )) },
        ]} /> },
  ];
  /*
    ÜRETİMLE AYNI UYARI SAYISI (25.11.2026). Senaryo iki ayrı blok
    çiziyordu (GenelBakis'in uyari prop'u + köprü satırı); konsolun kendisi
    25.11'de ikisini tek satırda birleştirdi. Betik eski hâli çizmeye devam
    edince ölçüm, var olmayan bir sayfanın yüksekliğini veriyordu — betik
    kendi kopyasını doğrular. En yüksek gerçek hâl alınıyor: danger tonu,
    iki olgunun birden yazıldığı en uzun metin.
  */
  /*
    ÜRETİMDEKİ GENEL BAKIŞ (26.11.2026, onaylı mockup): başlık, kritik
    uyarı satırı, dönem seçici ve iki tam genişlik kart. Selamlama,
    sayaç şeridi ve görünüm hapları kalktı — betik eski hâli çizerse
    ölçüm var olmayan bir sayfayı ölçer.
  */
  return (
    <GenelBakis baslik="Ana Sayfa" sinif="dash-sabit konsol-ana"
      eylem={<DonemSecici secili="30g" taban="/panel" />}
      durum={
        <p className="kak-durum">
          <span><i aria-hidden="true" data-tone="success" />Son otomatik kontrol 09:42</span>
          <span><i aria-hidden="true" data-tone="warning" /><a href="/panel/platform/saglik?sekme=kopru">1 bağlantı dikkat gerektiriyor</a></span>
        </p>
      }>
      <div className="kak-ust">
        <KararBekleyenlerKarti kalemler={bosDurum ? [] : KARARLAR} okunamayan={bosDurum ? ["Destek talepleri"] : []} />
        <OtomasyonlarKarti isler={OTOMASYONLAR} href="/panel/platform/saglik?sekme=isler" />
      </div>
      <UrunPerformansiKarti satirlar={(bosDurum ? URUN_DURUMLARI : URUN_SATIRLARI).map((u, i) => ({ ...u, saglik: URUN_SAGLIK[i] }))} olcut="musteri"
        donem={{ kod: "30g", etiket: "Son 30 gün", gun: 30, baslangic: "", bitis: "", oncekiBaslangic: "", oncekiBitis: "" }}
        para={(n) => "₺" + n.toLocaleString("tr-TR")} sayi={(n) => n.toLocaleString("tr-TR")}
        olcutSecici={<OlcutSecici secili="musteri" taban="/panel" />} />
    </GenelBakis>
  );
}

/*
  ÜRÜN DETAYI — GENEL BAKIŞ SEKMESİ (26.11.2026). Gerçek bileşen, gerçek
  CSS; veri sentetik. Üretimle aynı kabuk sınıfları: sayfa artık TEK
  EKRAN (liste-sayfa), yani kaydırma kartın içinde.
*/
/*
  ÜRÜNLER LİSTESİ (27.11.2026, onaylı mockup). Üretimdeki bileşen
  (app/panel/platform/urunler/urun-listesi.tsx) gerçek verisiyle değil
  ÖRNEK satırlarla çiziliyor; ölçülen şey yerleşim: sütun hizaları,
  rozetin yeri, uzun adresin taşmaması ve telefonda yatay kaydırmasız
  okunabilirlik.
*/
function UrunlerListesi() {
  const donem = { kod: "30g", etiket: "Son 30 gün", gun: 30, baslangic: "", bitis: "", oncekiBaslangic: "", oncekiBitis: "" };
  const satirlar = [
    { kod: "arvoos", ad: "ArvoOS", aktifMusteri: { durum: "var", deger: 3941 }, donusum: { durum: "kaynak_yok" }, tahsilat: { durum: "var", deger: 642300 },
      saglik: { durum: "saglikli", etiket: "Sağlıklı", ton: "success" }, adres: { url: "#", host: "app.arvo-os.com" } },
    { kod: "arvolab", ad: "ArvoLab", aktifMusteri: { durum: "var", deger: 892 }, donusum: { durum: "var", deger: { denemeye: 200, ucretliye: 36, oran: 0.18 } }, tahsilat: { durum: "var", deger: 128450 },
      saglik: { durum: "saglikli", etiket: "Sağlıklı", ton: "success" }, adres: { url: "#", host: "lab.arvo-os.com" } },
    { kod: "arc", ad: "ArvoARC", aktifMusteri: { durum: "var", deger: 214 }, donusum: { durum: "kaynak_yok" }, tahsilat: { durum: "var", deger: 26780 },
      saglik: { durum: "sorunlu", etiket: "Dikkat gerektiriyor", ton: "danger", not: "Köprü yanıt vermiyor." }, adres: { url: "#", host: "arc.arvo-os.com" } },
    /* Dördüncü satır "veri okunamadı" hâlini taşıyor: sıfır ile
       okunamayan ayrımı ekranda da görülsün. */
    { kod: "randevu", ad: "ArvoCal", aktifMusteri: { durum: "var", deger: 1208 }, donusum: { durum: "kaynak_yok" }, tahsilat: { durum: "okunamadi" },
      saglik: { durum: "saglikli", etiket: "Sağlıklı", ton: "success" }, adres: { url: "#", host: "cal.arvo-os.com" } },
  ];
  return (
    <main className="plt urun-liste-sayfa">
      <div className="ek-arac urun-arac">
        <nav className="ek-segment" aria-label="Ürün görünümü">
          <a href="#" className="is-active" aria-current="page">Ürünler</a>
          <a href="#">Modül matrisi</a>
        </nav>
      </div>
      <UrunListesi satirlar={satirlar} donem={donem}
        para={(n) => "₺" + n.toLocaleString("tr-TR")} sayi={(n) => n.toLocaleString("tr-TR")}
        secici={<DonemSecici secili="30g" taban="/panel/platform/urunler" />} />
    </main>
  );
}

function UrunDetay() {
  const satir = {
    kod: "arvolab", ad: "ArvoLab",
    aktifMusteri: { durum: "var", deger: 892 },
    donusum: { durum: "var", deger: { denemeye: 200, ucretliye: 36, oran: 0.18 } },
    tahsilat: { durum: "var", deger: 128450 },
  };
  const donem = { kod: "30g", etiket: "Son 30 gün", gun: 30, baslangic: "", bitis: "", oncekiBaslangic: "", oncekiBitis: "" };
  /*
    ÜRÜN İÇİ BÖLÜM ADRESTE (26.11.2026). Üretimdeki kurulumun aynısı:
    gerçek TalepAkis, bölüm başına adres ve adresten gelen seçim
    (lib/konsol/urun-bolumleri.ts). Paneller ÜRÜNE AİT içerik taşıyor —
    düzenek "Abonelikler" derken başka bir ürünün listesini
    göstermemeli; her panel data-bolum ile işaretli, ölçüm görünen
    paneli adresle karşılaştırıyor.
  */
  const taban = "/panel/platform/urunler/arvolab";
  const sorgu = useSearchParams();
  const secilenBolum = urunBolumu(sorgu.get("bolum"));
  const bolumler = [
    { anahtar: "genel-bakis", etiket: "Genel Bakış" },
    { anahtar: "musteriler", etiket: "Müşteriler" },
    { anahtar: "fiyat", etiket: "Fiyat basamakları" },
    { anahtar: "abonelikler", etiket: "Abonelikler" },
    { anahtar: "tahsilat", etiket: "Tahsilat" },
    { anahtar: "destek", etiket: "Destek" },
  ];
  const seciliSira = bolumSirasi(bolumler.map((b) => b.anahtar), secilenBolum);
  const aboneler = [
    ["Zeynep A.", "Pro", "Aylık", "₺1.490"],
    ["Mert K.", "Plus", "Yıllık", "₺9.900"],
    ["Elif D.", "Standart", "Aylık", "₺790"],
  ];
  const basitPanel = (anahtar, baslik, govde) => (
    <section className="urd-bolum" data-bolum={anahtar} key={anahtar}>
      <header className="urd-bolum-bas"><div><h2>{baslik}</h2></div></header>
      {govde}
    </section>
  );
  return (
    /* Üretimdeki kabuğun aynısı (27.11.2026, onaylı mockup): tek sütun,
       içerikte yol, sekmeler ince ayırıcı üzerinde. */
    <main className="plt urun-detay-sayfa">
      <header className="urd-bas">
        <div className="urd-bas-metin">
          <nav className="urd-yol" aria-label="Sayfa yolu">
            <Link href="/panel/platform/urunler">Ürünler</Link>
            <span aria-hidden="true">›</span>
            <span aria-current="page">ArvoLab</span>
          </nav>
          <div className="urd-ad">
            <h1>ArvoLab</h1>
            <span className="urun-saglik" data-tone="success">Sağlıklı</span>
          </div>
          <p className="urd-alt">Akademik yazım ve editöryal kontrol · lab.arvo-os.com</p>
        </div>
        <div className="urd-bas-eylem">
          <DonemSecici secili="30g" taban={taban} ek={secilenBolum === "genel-bakis" ? undefined : "bolum=" + secilenBolum} />
        </div>
      </header>
      <TalepAkis kimlik="urun-kart" sinif="urd-serit" darSecici etiket="ArvoLab bölümleri"
          sekmeler={bolumler.map((b) => b.etiket)}
          adresler={bolumler.map((b) => bolumAdresi(taban, b.anahtar, null))}
          baslangic={seciliSira}>
          <section data-bolum="genel-bakis">
            <UrunGenelBakis satir={satir} donem={donem}
              para={(n) => "₺" + n.toLocaleString("tr-TR")} sayi={(n) => n.toLocaleString("tr-TR")}
              /*
                SATIRLAR ELLE YAZILMIYOR (27.11.2026): gerçek kural
                çağrılıyor (lib/konsol/urun-bekleyenler), fixture
                yalnızca GİRDİ veriyor. Bir önceki turda otomasyon
                kartında tam bu yüzden üretimin üretemeyeceği bir satır
                çizilmişti — kural değişip fixture eski kalmıştı.
              */
              bekleyenler={urunBekleyenleri({
                urunKodu: "arvolab",
                lisanslar: [
                  { durum: "active", donemSonu: new Date(Date.now() + 5 * 86400000).toISOString(), denemeSonu: null },
                  { durum: "active", donemSonu: new Date(Date.now() + 9 * 86400000).toISOString(), denemeSonu: null },
                  { durum: "trialing", donemSonu: null, denemeSonu: new Date(Date.now() + 2 * 86400000).toISOString() },
                ],
                aboneler: [{ status: "trialing", trial_ends_at: new Date(Date.now() + 86400000).toISOString() }],
                bekleyenOdeme: 12,
                simdi: new Date(),
                sayi: (n) => n.toLocaleString("tr-TR"),
              })} />
          </section>
          {basitPanel("musteriler", "ArvoLab müşterileri", (
            <p className="ugb-bos">42 kurum ArvoLab lisansı kullanıyor.</p>
          ))}
          {basitPanel("fiyat", "ArvoLab fiyat basamakları", (
            <p className="ugb-bos">Standart ₺790 · Plus ₺1.190 · Pro ₺1.490</p>
          ))}
          {basitPanel("abonelikler", "ArvoLab abonelikleri", (
            /*
              ÜRETİMDEKİ TABLO KALIBI (26.11.2026, ölçümle düzeltildi).
              Burada önce çıplak bir <table> vardı ve 390 px'te tablo
              364 px'lik panelin içinde 680 px çiziliyordu: paket, dönem
              ve ücret hücreleri ekranın dışında kalıyor, yatay kaydırma
              da olmadığı için (html/body overflow-x:clip) hiçbir yoldan
              okunamıyordu. 680 px panel-premium.css'ten geliyor
              (dar ekranda .panel-content table icin min-width:680px)
              ve üretimdeki tablolar bu yüzden .talep-tablo sarmalayıcısı
              + data-label + MobilSatir ile çiziliyor: telefonda hücreler
              gizlenir, aynı veri tek satırda okunur. Düzenek artık o
              kalıbı kullanıyor — ölçülen şey üretimdeki davranış.
            */
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="ur-abone">
                <thead><tr><th scope="col">Abone</th><th scope="col">Paket</th><th className="crm-col-date" scope="col">Dönem</th><th className="crm-col-amount" scope="col">Ücret</th></tr></thead>
                <tbody>
                  {aboneler.map(([ad, paket, don, ucret]) => (
                    <tr key={ad}>
                      <td data-label="Abone"><span className="crm-table-title">{ad}</span></td>
                      <td data-label="Paket"><span className="crm-table-title">{paket}</span></td>
                      <td className="crm-col-date" data-label="Dönem">{don}</td>
                      <td className="crm-col-amount" data-label="Ücret"><span className="crm-table-title">{ucret}</span></td>
                      <MobilSatir baslik={ad} alt={[paket, don, ucret]} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {basitPanel("tahsilat", "ArvoLab tahsilatı", (
            <p className="ugb-bos">Son 30 günde ₺128.450 tahsil edildi.</p>
          ))}
          {basitPanel("destek", "ArvoLab destek talepleri", (
            <p className="ugb-bos">Yanıt bekleyen 2 talep var.</p>
          ))}
      </TalepAkis>
    </main>
  );
}
/*
  Adres senaryoya göre: ürün detayına DOĞRUDAN girildiğinde sol menüde
  "Ürünler" etkin görünmeli (etkinUygulama en uzun eşleşen yolu seçer).
  Şim usePathname'i window.__yol'dan okuyor.
*/
/* ?yol=<rota>: bağlamlı gezinmenin kanıtı için rota dışarıdan verilebilir
   (ör. /panel/platform/billing → ana menüde Finans, şeritte Abonelikler). */
window.__yol = new URLSearchParams(location.search).get("yol")
  || (sayfa === "urundetay" ? "/panel/platform/urunler/arvolab" : sayfa === "crm" ? "/panel/crm/genel-bakis" : "/panel");

function Kabuk() {
  /* Konsol senaryoları yeni kabuğu kullanıyor (.os-konsol): masaüstü ve
     tablette sol menü, telefonda alt çubuk. Kiracı senaryoları (ana,
     crm) dock'ta kalıyor — üretimdeki ayrımın aynısı. */
  const konsolMu = sayfa === "konsol" || sayfa === "urundetay" || sayfa === "urunler";
  return <div className={konsolMu ? "panel-root os-root os-konsol" : "panel-root os-root"}><main className="panel-frame os-frame">
    {/*
      ÜST ÇUBUK. Kiracı senaryolarında olduğu gibi sade; KONSOL
      senaryolarında üretimdeki yerleşimin aynısı çiziliyor: arama
      (Ctrl+K kısayolunu da taşıyan gerçek bileşen), bildirim, tema ve
      profil. Arama ve tema GERÇEK bileşenler (os-command-palette,
      theme-toggle); bildirim çekmecesi ve hesap menüsü sunucu
      işlemlerine bağlı olduğu için düzenekte aynı sınıflarla duruyor —
      ölçülen şey yerleşim, davranış değil.
    */}
    <header className="os-bar">
      {konsolMu ? null : <a className="os-brand" href="/panel"><i>A</i><span><b>Prova Kurum</b></span></a>}
      {/* Üretimdeki marka bloğunun aynısı: resmî işaret (app/panel/layout.tsx).
          Masaüstü/tablette CSS gizliyor, telefonda görünen bu. */}
      {konsolMu ? <a className="os-brand os-konsol-marka" href="/panel"><span className="os-konsol-logo" aria-hidden="true"><ArvoOsLogosu /></span><i className="os-brand-isaret" aria-hidden="true"><ArvoOsIsareti /></i><span className="os-konsol-ad">Yönetim Merkezi</span></a> : null}
      {konsolMu ? <OsAramaDugmesi /> : null}
      {konsolMu ? (
        <div className="os-bar-right">
          <div className="os-bar-actions">
            <button type="button" className="panel-quick-action" aria-label="Bildirimler, 3 okunmamış">
              <OsSimgeDuz ad="bell" boyut={18} />
              <span className="panel-unread-badge" aria-hidden="true">3</span>
            </button>
            <ThemeToggle />
          </div>
          <details className="os-user">
            <summary aria-label="Hesap: Kurucu"><span className="os-avatar">AK</span></summary>
          </details>
        </div>
      ) : null}
    </header>
    <section className="os-workspace">{konsolMu ? null : null}${'{'}/* Konsolda içerik üstü bölüm şeridi YOK (üretimle aynı): bölümler gezinmenin ikinci katında. */${'}'}<div className="panel-content">{sayfa === "crm" ? <Crm /> : sayfa === "konsol" ? <KonsolRota /> : sayfa === "urundetay" ? <UrunDetay /> : sayfa === "urunler" ? <UrunlerListesi /> : <Ana />}</div></section>
    {/* Komut paleti ve menü kapatıcı GERÇEK bileşenler: kaplamaların
        odak/Esc davranışı ölçülebilsin diye (26.11.2026). */}
    {konsolMu ? <OsKomutPaleti uygulamalar={konsolUygulamalari({ odeme: 3, sozlesme: 1, destek: 2 })} cikis={async () => {}} /> : null}
    {konsolMu ? <OsMenuKapat /> : null}
    <OsNavigasyon
      uygulamalar={konsolMu ? konsolUygulamalari({ odeme: 3, sozlesme: 1, destek: 2 }) : uygulamalar}
      digerUygulamalar={[]}
      yanMenu={konsolMu}
      yanMenuSirasi={konsolMu ? ["home", "urunler", "musteriler", "finans", "destek", "otomasyonlar"] : undefined}
    />
  </main></div>;
}
createRoot(document.getElementById("kok")).render(<Kabuk />);
/*
  DÜZ <img> ETİKETLERİ İÇİN AYNI KÖK YOLU ŞİMİ. next/image şimi yalnızca
  o bileşeni kapsıyor; marka dosyaları (srcset'li kelime logosu, SVG
  işaret) düz <img> ile çiziliyor ve file:// sayfasında "/brand/..."
  dosya sisteminin köküne düşüp KIRIK görünüyordu — ölçülmek istenen
  şeyin ta kendisi. Kök yollar burada public/ dizinine çevriliyor.
*/
const KAMU_YOL = "file://" + ${JSON.stringify(path.join(KOK, "public"))};
function kokYollariCevir() {
  for (const g of document.querySelectorAll('img[src^="/"]')) {
    const sr = g.getAttribute("srcset");
    /* Düzenli ifade YOK: bu kaynak önce .mjs şablonuna, sonra üretilen
       dosyaya giriyor ve ters bölü iki kez yutuluyor (bir kez yaşandı:
       srcset hiç çevrilmedi, logo kırık kaldı). */
    if (sr) g.setAttribute("srcset", sr.split(",").map((x) => x.trim()).map((x) => (x.startsWith("/") ? KAMU_YOL + x : x)).join(", "));
    g.setAttribute("src", KAMU_YOL + g.getAttribute("src"));
  }
}
kokYollariCevir();
new MutationObserver(kokYollariCevir).observe(document.body, { childList: true, subtree: true });
`);
await build({
  entryPoints: [path.join(dizin, "giris.tsx")], bundle: true, outfile: path.join(dizin, "paket.js"), format: "iife",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '""' }, logLevel: "error",
  nodePaths: [path.join(KOK, "node_modules")],
  alias: { "next/link": path.join(shim, "link.tsx"), "next/navigation": path.join(shim, "navigation.ts"), "next/image": path.join(shim, "image.tsx"), "@": KOK },
  loader: { ".css": "empty" },
});
const html = (tema, s) => `<!doctype html><html lang="tr" data-theme="${tema}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${cssler[s].map((d) => `<link rel="stylesheet" href="file://${d}">`).join("")}</head><body><div id="kok"></div><script src="paket.js"></script></body></html>`;
for (const tema of ["acik", "koyu"]) for (const s of SENARYOLAR) fs.writeFileSync(path.join(dizin, `${tema}-${s}.html`), html(tema === "acik" ? "light" : "dark", s));

const olc = () => {
  const r = (e) => e ? Math.round(e.getBoundingClientRect().height) : null;
  const s = document.scrollingElement;
  const kartlar = [...document.querySelectorAll(".dash-gorunum-panel")].filter((p) => p.offsetParent !== null).map((p) => {
    const kart = p.firstElementChild;
    const govde = kart?.querySelector(".dash-col-govde");
    const gr = govde?.getBoundingClientRect();
    const tam = govde ? [...govde.querySelectorAll("li")].filter((li) => { const l = li.getBoundingClientRect(); return l.top >= gr.top - 1 && l.bottom <= gr.bottom + 1; }).length : null;
    /*
      KAYDA KARTIN İÇİNDEN ERİŞİLEBİLİYOR MU: gövde sonuna kaydırılıp son
      kayıt kutunun içinde mi diye bakılıyor. "Gövde 0 px değil" yetmez —
      11 px'lik bir gövdede 40 px'lik satır hiçbir zaman okunmaz.
    */
    let sonKayitErisilir = null;
    if (govde && govde.querySelector("li")) {
      const onceki = govde.scrollTop;
      govde.scrollTop = govde.scrollHeight;
      const son = [...govde.querySelectorAll("li")].pop().getBoundingClientRect();
      const kutu = govde.getBoundingClientRect();
      sonKayitErisilir = son.bottom <= kutu.bottom + 1 && son.top >= kutu.top - 1;
      govde.scrollTop = onceki;
    }
    return { panel: p.id.replace("gorunum-", ""), kart: r(kart), kartKaydirma: kart ? `${kart.scrollHeight}/${kart.clientHeight}` : null, govde: r(govde), tamGorunenKayit: tam, kayit: govde ? govde.querySelectorAll("li").length : null, sonKayitErisilir, yatayTasma: kart ? kart.scrollWidth > kart.clientWidth + 1 : null };
  });
  /*
    GÖRÜNÜRLÜK: offsetParent KULLANILMAZ — position:fixed öğelerde her
    zaman null döner (26.11.2026'da ölçüldü: dock ve sol menü ekranda
    dururken "gizli" sayılıyordu, dock örtme ölçütü boşa çıkmıştı).
    Ölçü: hesaplanmış display + gerçek kutu.
  */
  const gorunurMu = (el) => {
    if (!el) return false;
    const s2 = getComputedStyle(el);
    if (s2.display === "none" || s2.visibility === "hidden") return false;
    const r2 = el.getBoundingClientRect();
    return r2.width > 0 && r2.height > 0;
  };
  /* Dock yalnızca telefonda çiziliyor; konsolun masaüstü/tablet
     görünümünde yerini sol menü alıyor. */
  const dockOge = document.querySelector(".os-dock");
  const dock = gorunurMu(dockOge) ? dockOge.getBoundingClientRect() : undefined;
  /*
    İÇERİĞİN ALTI: yalnızca .dash-card'a bakmak yetmiyor. Görünüm seçici
    açıkken konsolda görünen tek kart .konsol-isler ve o .dash-card DEĞİL;
    liste boş kalınca Math.max(...[]) -Infinity dönüyor ve "dock örtmüyor"
    hükmü hiçbir şey ölçmeden geçiyordu (25.11.2026). Kart bulunamazsa
    sonuç null kalır ve kabul bunu geçerli saymaz.
  */
  
  /*
    ZİNCİR TEŞHİSİ. Yalnızca yükseklik yetmiyor: kalan yüksekliğin HANGİ
    kapsayıcıda kaybolduğunu görmek için her halkanın kutusu, akış
    özellikleri ve kabuğun boşluk değişkenleri birlikte okunuyor.
  */
  const kutu = (sec) => {
    const e = document.querySelector(sec);
    if (!e) return null;
    const r = e.getBoundingClientRect(), c = getComputedStyle(e);
    return {
      h: Math.round(r.height), icerik: e.scrollHeight, gorunen: e.clientHeight,
      tasma: e.scrollHeight - e.clientHeight,
      display: c.display, flex: c.flex, minH: c.minHeight, maxH: c.maxHeight,
      pb: c.paddingBottom, of: c.overflowY,
    };
  };
  const kokStil = getComputedStyle(document.querySelector(".os-root") ?? document.body);
  const dockOgesi = document.querySelector(".os-dock");
  const dockK = gorunurMu(dockOgesi) ? dockOgesi.getBoundingClientRect() : undefined;
  const zincir = {
    degiskenler: { dockSpace: kokStil.getPropertyValue("--os-dock-space").trim(), barH: kokStil.getPropertyValue("--os-bar-h").trim(), ustH: kokStil.getPropertyValue("--os-ust-h").trim() },
    dock: dockK ? { ust: Math.round(dockK.top), h: Math.round(dockK.height), konum: getComputedStyle(dockOgesi).position } : null,
    osFrame: kutu(".os-frame"), osWorkspace: kutu(".os-workspace"), panelContent: kutu(".panel-content"),
    anaSayfa: kutu("main.liste-sayfa"),
    dash: kutu(".dash"), serit: kutu(".konsol-serit"), hero: kutu(".dash-hero"), uyari: kutu(".dash-uyari"),
    gorunum: kutu(".dash-gorunum"), cols: kutu(".dash-cols--sabit"), yigin: kutu(".dash-gorunum-yigin"),
    islerPanel: kutu("#gorunum-isler"), kap: kutu(".konsol-isler-kap"), kart: kutu(".konsol-isler"),
    sekmeler: kutu(".talep-akis-sekmeler"), akisPanel: kutu(".talep-akis-panel"),
    /* .dash'in kalan yüksekliği nerede: her çocuk adıyla ve payıyla. */
    dashCocuklari: [...(document.querySelector(".dash")?.children ?? [])].map((e) => ({
      ad: (e.className || e.tagName).toString().split(" ").slice(0, 2).join("."),
      h: Math.round(e.getBoundingClientRect().height),
      mt: getComputedStyle(e).marginTop, mb: getComputedStyle(e).marginBottom,
    })),
    dashGap: getComputedStyle(document.querySelector(".dash") ?? document.body).rowGap,
    /*
      KART ÇAKIŞMASI: kart kendi PANELİNİ aşıyor mu ve kardeşinin üstüne
      biniyor mu. Kartın çocuklarına bakmak yetmiyor — grafik kartının
      çocukları kendi kutusunda, kutunun kendisi paneli aşıyor.
    */
    kartPanelde: [...document.querySelectorAll(".dash-gorunum-panel")].filter((e) => e.offsetParent !== null).map((p2) => {
      const kart = p2.firstElementChild;
      if (!kart) return null;
      const pr = p2.getBoundingClientRect(), kr = kart.getBoundingClientRect();
      const kardes = p2.nextElementSibling?.getBoundingClientRect();
      return { panel: p2.id.replace("gorunum-", ""), panelH: Math.round(pr.height), kartH: Math.round(kr.height),
        panelAsiyor: Math.round(kr.bottom - pr.bottom), panelKayiyor: p2.scrollHeight > p2.clientHeight && getComputedStyle(p2).overflowY === "auto",
        kardeseBiniyor: kardes ? Math.round(kr.bottom - kardes.top) : null };
    }).filter(Boolean),
    /* Kart sınırı: her görünür kartın içeriği kendi kutusunda kalıyor mu. */
    kartTasmasi: [...document.querySelectorAll(".dash-card,.konsol-isler")].filter((e) => e.offsetParent !== null).map((e) => {
      const r = e.getBoundingClientRect(), c = getComputedStyle(e);
      const cocuk = [...e.querySelectorAll("*")].map((x) => x.getBoundingClientRect())
        .filter((b) => b.width || b.height);
      const altTasan = cocuk.filter((b) => b.bottom > r.bottom + 1).length;
      const sagTasan = cocuk.filter((b) => b.right > r.right + 1).length;
      return { ad: e.className.split(" ").slice(0, 2).join("."), h: Math.round(r.height),
        icerik: e.scrollHeight, gorunen: e.clientHeight, of: c.overflowY,
        altTasan, sagTasan,
        enAlt: cocuk.length ? Math.round(Math.max(...cocuk.map((b) => b.bottom)) - r.bottom) : null };
    }),
    /* Nabız sütunu: yığının yüksekliği belirli mi, kartlar payı nasıl bölüyor. */
    yiginPayi: (() => {
      const y = document.querySelector(".dash-gorunum-yigin");
      if (!y || y.offsetParent === null) return null;
      const c = getComputedStyle(y), r = y.getBoundingClientRect();
      const kap = y.parentElement ? y.parentElement.getBoundingClientRect() : null;
      return { h: Math.round(r.height), kapH: kap ? Math.round(kap.height) : null,
        alignSelf: c.alignSelf, flex: c.flex, maxH: c.maxHeight,
        cocuklar: [...y.children].map((e) => ({ ad: e.id.replace("gorunum-", ""),
          h: Math.round(e.getBoundingClientRect().height), flex: getComputedStyle(e).flex })) };
    })(),
    uyariVar: Boolean(document.querySelector(".dash-uyari")),
    genelKartlar: [...(document.querySelector(".konsol-genel")?.children ?? [])].map((e) => {
      const c = getComputedStyle(e), r = e.getBoundingClientRect();
      const g = e.querySelector(".dash-col-govde");
      return { ad: e.className.split(" ").slice(-1)[0], h: Math.round(r.height), ic: e.scrollHeight,
        flex: c.flex, minH: c.minHeight, maxH: c.maxHeight,
        govde: g ? { h: Math.round(g.getBoundingClientRect().height), ic: g.scrollHeight, of: getComputedStyle(g).overflowY } : null };
    }),
    /*
      ÜRÜN TABLOSU: kaç satır TAM görünüyor. Kurucunun ilk sorusu dört
      ürünü birlikte görmek; kaydırarak ulaşmak masaüstünde kabul değil.
    */
    /*
      Ürün satırı iki biçimde çiziliyor: geniş kartta tablo, dar kartta
      kompakt liste. Ölçüm GÖRÜNEN biçime bakmalı — gizli tabloyu ölçmek
      mobilde "bir satır görünüyor" diyordu, oysa listede dördü de
      görünüyordu (26.11.2026).
    */
    urunTablosu: (() => {
      const gorunur = (el) => Boolean(el && el.offsetParent !== null);
      const t = document.querySelector(".kup-tablo");
      const liste = document.querySelector(".kup-mobil");
      const kap = gorunur(t) ? t : gorunur(liste) ? liste : null;
      if (!kap) return null;
      const govde = kap.closest(".dash-col-govde") ?? kap.parentElement;
      const g = govde.getBoundingClientRect();
      const satirlar = kap === t ? [...t.querySelectorAll("tbody tr")] : [...liste.children];
      const tam = satirlar.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= g.top - 1 && b.bottom <= g.bottom + 1; }).length;
      return { bicim: kap === t ? "tablo" : "liste", satir: satirlar.length, tamGorunen: tam, govdeH: Math.round(g.height) };
    })(),
    /*
      SOL MENÜ (26.11.2026, onaylı mockup). Masaüstü ve tablette
      içerik menünün SAĞINDA başlamalı: sabit konumlu menü içeriğin
      üstüne binerse ilk sütun okunmaz olur. Dar modda (ray) adların
      görsel olarak gizlenmesi serbest, ama erişilebilir ad ve araç
      ipucu KALMALI — ikon tek başına ne olduğunu söylemiyor.
    */
    yanMenu: (() => {
      const m = document.querySelector(".os-yan");
      if (!gorunurMu(m)) return null;
      const r = m.getBoundingClientRect();
      const icerik = document.querySelector(".panel-content")?.getBoundingClientRect();
      const ogeler = [...m.querySelectorAll(".os-yan-oge")];
      const adsiz = ogeler.filter((o) => {
        const ad = (o.getAttribute("aria-label") || o.textContent || "").trim();
        return !ad;
      }).length;
      const ipucusuz = ogeler.filter((o) => !o.getAttribute("title")).length;
      const etiket = m.querySelector(".os-yan-etiket");
      const etiketGorunur = etiket ? getComputedStyle(etiket).display !== "none" : null;
      /* Klavye: her girdi odaklanabilmeli ve odakta menünün içinde kalmalı. */
      let odaklanamayan = 0;
      for (const o of ogeler) {
        o.focus();
        if (document.activeElement !== o) odaklanamayan += 1;
      }
      const daralt = m.querySelector(".os-yan-daralt");
      return {
        genislik: Math.round(r.width),
        sag: Math.round(r.right),
        icerikSol: icerik ? Math.round(icerik.left) : null,
        ortuyor: icerik ? r.right > icerik.left + 1 : null,
        oge: ogeler.length,
        adsiz,
        ipucusuz,
        etiketGorunur,
        odaklanamayan,
        daraltVar: Boolean(daralt),
        rozet: [...m.querySelectorAll(".os-yan-rozet")].map((b) => b.textContent),
        etkin: m.querySelector(".os-yan-oge.is-active")?.getAttribute("aria-label") ?? null,
        /* Pencere KAPALIYKEN tam bir girdi seçili olmalı. Ürün
           detayında "Ürünler" ile "Uygulamalar" aynı anda vurguluydu
           (26.11.2026 inceleme bulgusu): "Uygulamalar" bir sayfa değil
           pencere açıyor, vurgusu da pencereye bağlı. */
        secili: [...m.querySelectorAll(".os-yan-oge.is-active")].map((o) => (o.getAttribute("aria-label") || o.textContent || "").trim()),
        /*
          MARKA GÖRÜNTÜSÜ: görünen dosya gerçekten yüklendi mi ve kaç px
          çiziliyor. Dar menüde kırık görsel simgesi çıkmıştı
          (26.11.2026 inceleme bulgusu) — "öğe DOM'da" yetmez.

          Ölçüm ÜST ÇUBUĞA bakıyor (26.11.2026, onaylı mockup): marka
          sol menünün başından çubuğun soluna taşındı. Sonda kalan
          ".os-yan-marka" ölçümü her ekranda "marka çizilmiyor" diyordu;
          oysa marka duruyor, yeri değişti.
        */
        marka: (() => {
          const g = [...document.querySelectorAll(".os-konsol .os-bar .os-brand img")].filter((x) => getComputedStyle(x).display !== "none" && getComputedStyle(x.parentElement).display !== "none");
          if (!g.length) return null;
          const r = g[0].getBoundingClientRect();
          return {
            biçim: g[0].closest(".os-konsol-logo") ? "logo" : "isaret",
            dosya: g[0].getAttribute("src").split("/").pop(),
            yuklendi: g.every((x) => x.naturalWidth > 0),
            genislik: Math.round(r.width),
            yukseklik: Math.round(r.height),
            /* Kaynağın kendi oranı ile çizilen oran: kutuya sıkıştırılmış
               (ezik) bir logo buradan görünür. ORANSAL ölçülüyor —
               görüntüleme dosyalarının yüksekliği tam sayıya yuvarlanıyor
               (160×30, oysa tam değer 30,4) ve mutlak farkla ölçünce
               sağlam bir logo da "bozuk" çıkıyordu. */
            oranSapmasi: (() => {
              const cizilen = r.width / r.height;
              const kaynak = g[0].naturalWidth / g[0].naturalHeight;
              return Math.abs(cizilen - kaynak) / kaynak;
            })(),
          };
        })(),
        pencereAcik: document.querySelector("dialog.os-uygulamalar")?.open ?? false,
        /*
          İKİNCİ KAT: modüle girince ana listenin yerini bölümler alıyor
          (26.11.2026, onaylı mockup). Ölçülen şey "görünüyor mu"nun
          ötesinde: geri dönüş DÜĞME mi (bağlantı olsaydı adres değişir,
          süzgeç ve geçmiş kaybolurdu), bölümler bağlantı mı (adres
          paylaşılabilsin) ve tam bir bölüm mü seçili.
        */
        altKat: (() => {
          const kat = m.querySelector(".os-yan-kat");
          if (!kat) return null;
          const geri = kat.querySelector(".os-yan-geri");
          const bolumler = [...kat.querySelectorAll(".os-yan-oge")];
          return {
            modul: kat.querySelector(".os-yan-modul")?.textContent?.trim() ?? null,
            geriDugme: Boolean(geri) && geri.tagName === "BUTTON",
            geriMetin: geri?.textContent?.trim() ?? null,
            bolum: bolumler.length,
            baglantili: bolumler.length > 0 && bolumler.every((b) => b.tagName === "A" && b.getAttribute("href")),
            adlar: bolumler.map((b) => b.textContent.trim()),
            secili: bolumler.filter((b) => b.getAttribute("aria-current") === "page").map((b) => b.textContent.trim()),
            /* Ana listenin gizlendiği doğrulanıyor: iki kat birden
               görünürse 240 px'lik panel taşar. */
            anaListeGizli: !m.querySelector(".os-yan-oge[data-modul]"),
          };
        })(),
        /* Yatay bölüm şeridi aynı anda çizilmemeli: aynı bağlantı iki
           yerde "seçili" görünür ve kurucu hangisine bakacağını bilemez. */
        seritGorunur: (() => {
          const serit = document.querySelector(".os-bolumler");
          return serit ? getComputedStyle(serit).display !== "none" : false;
        })(),
      };
    })(),
    /*
      ÜST İKİ KART (26.11.2026, onaylı mockup): 58/42, 16–18 px boşluk,
      ÜST KENARLARI aynı hatta ve sağ kenarı alttaki tam genişlikteki
      ürün kartıyla hizalı. Dar ekranda alt alta geçiyorlar; o zaman
      hiza ölçülmüyor, "alt alta mı" ölçülüyor.
    */
    /*
      OTOMASYON SATIRLARI: ad, etiket ve açıklama BİRLİKTE okunuyor
      (27.11.2026, inceleme talebi). Üçünü ayrı ayrı doğrulamak, 390
      px'te etiketi doğru ama açıklaması başka bir duruma ait bir
      satırı geçiriyordu — telefon kaydındaki bulgu tam buydu.
    */
    otomasyonSatirlari: [...document.querySelectorAll(".kak-otomasyon .kak-satir")].map((r) => ({
      ad: r.querySelector(".kak-govde b")?.textContent?.trim() ?? null,
      etiket: r.querySelector(".kak-rozet")?.textContent?.trim() ?? null,
      aciklama: r.querySelector(".kak-govde small")?.textContent?.trim() ?? null,
      ton: r.querySelector(".kak-rozet")?.getAttribute("data-tone") ?? null,
      /* Telefonda satır kırpılmadan okunuyor mu: açıklama kutusu
         içeriğini taşırıyorsa durum yarım okunur. */
      aciklamaKirpik: (() => {
        const k = r.querySelector(".kak-govde small");
        return k ? k.scrollWidth > k.clientWidth + 1 : null;
      })(),
    })),
    ustKartlar: (() => {
      const g = document.querySelector(".kak-ust");
      if (!g) return null;
      const k = [...g.children].map((c) => c.getBoundingClientRect());
      if (k.length < 2) return null;
      const alt = g.nextElementSibling?.getBoundingClientRect();
      const yanYana = k[1].left > k[0].right - 1;
      return {
        yanYana,
        ustFarki: Math.round(Math.abs(k[0].top - k[1].top)),
        bosluk: yanYana ? Math.round(k[1].left - k[0].right) : Math.round(k[1].top - k[0].bottom),
        oran: Math.round((k[0].width / (k[0].width + k[1].width)) * 100),
        sagFarki: alt ? Math.round(Math.abs((yanYana ? k[1].right : k[0].right) - alt.right)) : null,
        solFarki: alt ? Math.round(Math.abs(k[0].left - alt.left)) : null,
      };
    })(),
    /*
      SON ÜRÜNE KART İÇİNDEN ERİŞİM (26.11.2026, ürün kararı).
      Dört satır sığmadığında kaydırma SAYFADA değil KARTTA olmalı ve
      kartı sonuna kaydırınca son ürün tam görünmeli. "Satır DOM'da var"
      yetmez: 1440×600'de gövde 85 px ve dört satır 4×40 px — kart
      kaymıyorsa son ürüne hiçbir yoldan ulaşılamaz.
    */
    sonUrun: (() => {
      const gorunur = (el) => Boolean(el && el.offsetParent !== null);
      const t = document.querySelector(".kup-tablo");
      const liste = document.querySelector(".kup-mobil");
      const kap = gorunur(t) ? t : gorunur(liste) ? liste : null;
      if (!kap) return null;
      const govde = kap.closest(".dash-col-govde");
      if (!govde) return null;
      const satirlar = kap === t ? [...t.querySelectorAll("tbody tr")] : [...liste.children];
      const son = satirlar[satirlar.length - 1];
      if (!son) return null;
      /*
        KAYDIRICI DEĞİŞEBİLİYOR (26.11.2026). Masaüstünde kaydırma
        kartın gövdesinde, 1200 px altında ANA İÇERİKTE: kart artık
        içerik boyunda ve .panel-content kayıyor. Ölçüm hangi kabın
        kaydığını bulup onu sona getiriyor — kartın gövdesini kaydırmaya
        çalışmak, içerik kayarken "son ürüne ulaşılamıyor" diyordu.
      */
      const icerik = document.querySelector(".panel-content");
      const kayan = govde.scrollHeight > govde.clientHeight + 1 ? govde
        : icerik && icerik.scrollHeight > icerik.clientHeight + 1 ? icerik : null;
      const oncekiKaydirma = kayan ? kayan.scrollTop : 0;
      const kartKayabilir = Boolean(kayan);
      if (kayan) kayan.scrollTop = kayan.scrollHeight;
      /* Görünürlük penceresi: kaydıran kap (yoksa kartın gövdesi). */
      const g = (kayan ?? govde).getBoundingClientRect();
      const b = son.getBoundingClientRect();
      const tam = b.top >= g.top - 1 && b.bottom <= g.bottom + 1;
      /* Eylem de erişilebilir olmalı: bağlantı satırın kendisi (liste)
         ya da son hücredeki "Aç" (tablo). */
      const bag = son.querySelector(".kup-ac a") ?? (son.tagName === "LI" ? son.querySelector("a") : null);
      let dokunma = null, klavye = null;
      if (bag) {
        const r = bag.getBoundingClientRect();
        const hedef = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        dokunma = Boolean(hedef && (hedef === bag || bag.contains(hedef)));
        bag.focus();
        klavye = document.activeElement === bag;
      }
      /*
        ODAK HALKASI DA TAM GÖRÜNMELİ (26.11.2026, ürün kararı):
        halka satırın dışına 2 px taşıyor; satırın kenarına yapışmış bir
        satırda klavye kullanıcısı nereye geldiğini göremiyor.
      */
      const halka = bag ? (() => {
        const r = bag.getBoundingClientRect();
        const pay = 4;
        return r.top - pay >= g.top - 1 && r.bottom + pay <= g.bottom + 1;
      })() : null;
      if (kayan) kayan.scrollTop = oncekiKaydirma;
      return { kartKayabilir, hepsiSigiyor: !kartKayabilir, tam, dokunma, klavye, halka, metin: (son.textContent ?? "").trim().slice(0, 14) };
    })(),
    /*
      Öncelikli işlerin İLK kaydı ve eylemi tam görünmeli: kartın
      gövdesi kaysa bile ilk satır kesilmemeli (1440×600'de ölçüldü).
    */
    ilkIs: (() => {
      const liste = document.querySelector(".koi-liste");
      if (!liste || liste.offsetParent === null) return null;
      const govde = liste.closest(".dash-col-govde") ?? liste.parentElement;
      const g = govde.getBoundingClientRect();
      const ilk = liste.querySelector("li");
      if (!ilk) return null;
      const b = ilk.getBoundingClientRect();
      const eylem = ilk.querySelector("a span:last-child, a");
      const e = eylem?.getBoundingClientRect();
      return { tam: b.top >= g.top - 1 && b.bottom <= g.bottom + 1,
        eylemTam: e ? e.top >= g.top - 1 && e.bottom <= g.bottom + 1 : null,
        h: Math.round(b.height), govdeH: Math.round(g.height) };
    })(),
    /* Kartın içinde yüksekliği ne yiyor: başlık, açıklama, gövde, alt bağlantı. */
    kartIci: [...document.querySelectorAll(".dash-gorunum-yigin>.dash-gorunum-panel")].filter((e) => e.offsetParent !== null).map((p2) => {
      const k = p2.firstElementChild;
      const h = (sec) => { const e = k?.querySelector(sec); return e ? Math.round(e.getBoundingClientRect().height) : null; };
      const satir = k?.querySelector(".dash-col-govde li, .dash-col-list li");
      return { ad: p2.id.replace("gorunum-", ""), kart: k ? Math.round(k.getBoundingClientRect().height) : null,
        bas: h(".dash-card-head"), basAciklama: h(".dash-card-head p"), govde: h(".dash-col-govde"),
        altBag: h(".dash-card-link"), cubuklar: h(".dash-bars"), satirYuk: satir ? Math.round(satir.getBoundingClientRect().height) : null };
    }),
    /*
      BÖLÜM SEÇİMİ: dar pencerede tek seçici, geniş pencerede şerit.
      Altı bölümün hepsi YATAY KAYDIRMA OLMADAN seçilebilmeli. Hangisi
      görünüyorsa o ölçülüyor; ikisini birden saymak gizli olanı da
      "erişilebilir" gösterirdi.
    */
    bolumSecimi: (() => {
      const gorunur = (el) => Boolean(el && el.offsetParent !== null);
      const secici = document.querySelector(".talep-akis-sec select");
      const serit = document.querySelector(".urun-sayfa .sy-kart>.talep-akis-sekmeler");
      if (gorunur(secici)) {
        const r = secici.getBoundingClientRect();
        secici.focus();
        return { bicim: "secici", sayi: secici.options.length,
          icerde: r.left >= -1 && r.right <= document.documentElement.clientWidth + 1,
          klavye: document.activeElement === secici, yukseklik: Math.round(r.height) };
      }
      if (!gorunur(serit)) return null;
      const dugmeler = [...serit.querySelectorAll('[role="tab"]')];
      const g = serit.getBoundingClientRect();
      const disarida = dugmeler.filter((d) => { const b = d.getBoundingClientRect(); return b.left < g.left - 1 || b.right > g.right + 1; }).map((d) => d.textContent.trim());
      dugmeler[0]?.focus();
      return { bicim: "serit", sayi: dugmeler.length, icerde: disarida.length === 0, disarida,
        klavye: document.activeElement === dugmeler[0], yukseklik: Math.round(g.height),
        kaydirma: serit.scrollWidth > serit.clientWidth + 1 };
    })(),
    /*
      ÜRÜN DETAYI: kart içerik genişliğini kullanıyor mu ve sağ kenarı
      başlıktaki dönem seçicisiyle aynı hatta mı. Izgara sınıfı iki
      sütun kurduğu için kart birinci sütunda kalıyordu: 768x600'de
      sağda 296 px boşluk, 1440'ta seçiciden 350 px geride
      (26.11.2026 inceleme bulgusu).
    */
    /*
      BAĞLAMLI GEZİNME (26.11.2026): ana menü hangi MODÜLDE, şerit hangi
      ALT BÖLÜMDE olunduğunu göstermeli ve sayfa vurgusu tek olmalı.
    */
    /*
      ÜRÜN İÇİ BÖLÜM ADRESLE AYNI OLMALI (26.11.2026, ürün kararı).
      Sekme seçimi bileşenin kendi durumundayken adres bir şey, ekran
      başka bir şey söyleyebiliyordu: paylaşılan bağlantı Genel Bakış'ı
      açıyordu. Ölçü dörtlü: adresteki bölüm, seçili sekme, GÖRÜNEN
      panelin işareti ve ürün başlığı.
    */
    urunBolumu: (() => {
      const kart = document.querySelector("main.urun-sayfa .talep-akis");
      if (!kart) return null;
      const adres = (location.hash.slice(1) || "").split("?")[1] || "";
      const istenen = new URLSearchParams(adres).get("bolum") || "genel-bakis";
      const panel = [...kart.querySelectorAll('[role="tabpanel"]')].find((p) => !p.hidden);
      const isaretli = panel?.querySelector("[data-bolum]") ?? (panel?.firstElementChild?.hasAttribute?.("data-bolum") ? panel.firstElementChild : null);
      return {
        istenen,
        gorunen: isaretli?.getAttribute("data-bolum") ?? null,
        seciliSekme: [...kart.querySelectorAll('.talep-akis-sekmeler [aria-selected="true"]')].map((e) => e.textContent.trim()),
        baslik: document.querySelector("main.urun-sayfa h1")?.textContent.trim() ?? null,
        /* Sekmeler bağlantı mı: adres paylaşılabilir olmalı. */
        baglantili: Boolean(kart.querySelector(".talep-akis-sekmeler a[href]")),
        /*
          PANEL BAŞLIĞININ YANINDA ALANLAR DA OKUNMALI (26.11.2026,
          inceleme bulgusu). 390 px'te abonelik tablosu 364 px'lik
          panelde 680 px çiziliyordu: paket, dönem ve ücret ekranın
          dışında kalıyor ve yatay kaydırma da olmadığı için
          (html/body overflow-x:clip) hiçbir yoldan okunamıyordu.
          "Panel görünüyor" yetmez; sütun başlığı kadar DEĞER de
          ekranda olmalı. Telefonda değerler tek satırda (MobilSatir),
          masaüstünde hücrelerde — ölçüm ikisini de sayar.
        */
        alanlar: (() => {
          if (!panel) return null;
          const ekranG = document.documentElement.clientWidth;
          const gorunurMu = (el) => {
            const c = getComputedStyle(el);
            if (c.display === "none" || c.visibility === "hidden") return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= ekranG + 1;
          };
          const tablo = panel.querySelector("table");
          if (!tablo) return null;
          const baslikSayisi = tablo.querySelectorAll("thead th").length;
          const ilkSatir = tablo.querySelector("tbody tr");
          if (!ilkSatir) return null;
          const mobil = ilkSatir.querySelector(".mobil-satir");
          const parcalar = mobil && gorunurMu(mobil)
            ? [...mobil.querySelectorAll(".ms-baslik-metin, .ms-alt, .status-pill")]
            : [...ilkSatir.children].filter((c) => !c.classList.contains("mobil-satir"));
          const okunan = parcalar.filter((e) => gorunurMu(e) && e.textContent.trim());
          /* Mobil satırda alt bilgiler tek metinde "·" ile birleşiyor. */
          const alanSayisi = mobil && gorunurMu(mobil)
            ? okunan.reduce((t2, e) => t2 + (e.classList.contains("ms-alt") ? e.textContent.split("·").filter((x) => x.trim()).length : 1), 0)
            : okunan.length;
          return {
            bicim: mobil && gorunurMu(mobil) ? "mobil-satir" : "tablo",
            beklenen: baslikSayisi,
            okunan: alanSayisi,
            metin: okunan.map((e) => e.textContent.trim()).join(" · ").slice(0, 70),
            yatayKayiyor: panel.scrollWidth > panel.clientWidth + 1,
            tasanOge: [...panel.querySelectorAll("td,th,.ms-baslik-metin,.ms-alt")].filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width > 0 && getComputedStyle(e).display !== "none" && r.right > ekranG + 1;
            }).length,
          };
        })(),
      };
    })(),
    bolumSeridi: (() => {
      const n = document.querySelector(".os-bolumler");
      if (!n) return null;
      const c = getComputedStyle(n);
      if (c.display === "none") return null;
      const baglar = [...n.querySelectorAll(".os-bolumler-liste a")];
      const liste = n.querySelector(".os-bolumler-liste");
      const dugme = n.querySelector(".os-bolumler-ac");
      const dugmeGorunur = dugme ? getComputedStyle(dugme).display !== "none" : false;
      let odaklanamayan = 0;
      if (!dugmeGorunur) for (const a of baglar) { a.focus(); if (document.activeElement !== a) odaklanamayan += 1; }
      return {
        bicim: dugmeGorunur ? "secici" : "serit",
        sayi: baglar.length,
        etkin: baglar.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent.trim()),
        /* Dar ekranda seçili bölümün ADI düğmede yazmalı. */
        dugmeMetni: dugmeGorunur ? dugme.textContent.trim() : null,
        yatayKayiyor: liste ? liste.scrollWidth > liste.clientWidth + 1 : false,
        odaklanamayan,
      };
    })(),
    kartHizasi: (() => {
      const kart = document.querySelector("main.urun-sayfa>.talep-izgara>.talep-akis");
      const eylem = document.querySelector("main.urun-sayfa>.talep-bas .talep-bas-eylem");
      const izgara = document.querySelector("main.urun-sayfa>.talep-izgara");
      if (!kart || !eylem || !izgara) return null;
      const k = kart.getBoundingClientRect(), e = eylem.getBoundingClientRect(), i = izgara.getBoundingClientRect();
      /* Başlık tek satır mı: telefonda eylem bloğu başlığın ALTINA
         geçiyor (talep-bas sarıyor) ve orada sağ kenar hizası diye bir
         şey yok — hizayı yalnızca eylem başlığın yanındayken ölçüyoruz. */
      const metin = document.querySelector("main.urun-sayfa>.talep-bas .talep-bas-metin");
      const mr = metin?.getBoundingClientRect();
      return {
        tekSatir: mr ? e.top < mr.bottom - 1 : null,
        kartG: Math.round(k.width),
        bosluk: Math.round(i.right - k.right),
        seciciyeFark: Math.round(e.right - k.right),
        /* Metrikler alan izin verdiğinde yan yana: şerit ve kart ızgarası
           kaç sütun çiziyor (sıfır genişlikli sütunlar auto-fit'in boş
           izleri, sayılmıyor). */
        seritSutun: ((el) => el ? getComputedStyle(el).gridTemplateColumns.split(" ").filter((x) => parseFloat(x) > 0).length : null)(document.querySelector(".ugb-serit")),
        metrikSutun: ((el) => el ? getComputedStyle(el).gridTemplateColumns.split(" ").filter((x) => parseFloat(x) > 0).length : null)(document.querySelector(".ugb-izgara")),
      };
    })(),
    /* Kuyruk sekme şeridi: yatay kaydırma olmadan hepsi sığıyor mu. */
    sekmeSeridi: (() => {
      const e = document.querySelector(".talep-akis-sekmeler");
      if (!e) return null;
      const r = e.getBoundingClientRect(), c = getComputedStyle(e);
      const d = [...e.querySelectorAll("button,a")];
      const disarida = d.filter((x) => { const b = x.getBoundingClientRect(); return b.right > r.right + 1 || b.left < r.left - 1; });
      return { w: Math.round(r.width), icerik: e.scrollWidth, overflowX: c.overflowX, sarma: c.flexWrap,
        sayi: d.length, disarida: disarida.map((x) => x.textContent.trim().slice(0, 12)),
        yukseklik: Math.round(r.height) };
    })(),
    /* Genişlik de tek ekranın parçası: seçili kart boşluğu doldurmalı. */
    genislik: (() => {
      const c = document.querySelector(".dash-cols--sabit");
      const p2 = document.querySelector(".dash-gorunum-panel.is-secili");
      if (!c) return null;
      const cs = getComputedStyle(c);
      return { cols: Math.round(c.getBoundingClientRect().width), secili: p2 ? Math.round(p2.getBoundingClientRect().width) : null,
        display: cs.display, alignItems: cs.alignItems,
        sutunlar: cs.gridTemplateColumns, satirlar: cs.gridTemplateRows, oge: c.children.length };
    })(),
  };
  /*
    TEK EKRAN KURALI GENEL BAKIŞ EKRANLARI İÇİN (.dash-sabit) ve sabit
    yükseklikli liste sayfaları için. Ürün detayı bir KAYIT sayfası:
    kaydırılması tasarımın kendisi. Hükmü yazarken ikisi ayrılıyor —
    yoksa kabul, hiç konmamış bir kuralı dayatırdı.
  */
  const tekEkran = Boolean(document.querySelector(".dash-sabit, main.liste-sayfa"));
  /*
    KAYAN SAYFADA ÖLÇÜM SONDA YAPILIR. Kayıt sayfasında içerik ekranın
    altından taşar ve dock'un altından GEÇER — bu normaldir. Soru şu:
    sona kaydırıldığında son içerik dock'un üstünde kalıyor mu, yoksa
    kalıcı olarak altında mı? Sayfanın dibinde dock payı yoksa son kart
    hiçbir zaman okunamaz.
  */
  /*
    KAYAN SAYFADA DOCK ÖLÇÜSÜ YAPISALDIR. İçeriğin dock'un altından
    geçmesi normal; soru, sayfanın dibinde dock kadar PAY olup olmadığı.
    Pay varsa sona kaydırıldığında son kart dock'un üstünde kalır.
    Kutu karşılaştırması burada yanlış alarm veriyordu (içerik ekranın
    altında diye "örtüyor" diyordu).
  */
  const kap = document.querySelector(".panel-content");
  const dockPayi = kap ? Math.round(parseFloat(getComputedStyle(kap).paddingBottom) || 0) : null;
  /*
    KAYDIRILAN BİR KAPSAYICIDA KIRPILAN İÇERİK DOCK'U ÖRTMEZ (26.11.2026).
    Grafik kartı seçiliyken panelinden uzun olabiliyor ama panel
    overflow-y:auto: kart o kenarda KIRPILIYOR, dock'un üstüne
    çizilmiyor. Kutunun ham alt kenarını almak bunu örtme sayıyordu —
    ölçüm yanlış alarm veriyordu. Her öğenin altı, kaydıran en yakın
    atasının altına kırpılıyor.
  */
  const kirpilmisAlt = (e) => {
    let alt = e.getBoundingClientRect().bottom;
    for (let ata = e.parentElement; ata; ata = ata.parentElement) {
      const akis = getComputedStyle(ata).overflowY;
      if (akis === "auto" || akis === "scroll" || akis === "hidden") {
        alt = Math.min(alt, ata.getBoundingClientRect().bottom);
      }
    }
    return alt;
  };
  /* 27.11.2026: Ürünler listesi ve ürün detayının bölümleri kendi kart
     sınıflarını taşıyor (.url-kart, .urd-bolum, .kak-kart). Listeye
     eklenmeselerdi "görünür kart yok" diye ölçülemez sayılırlardı. */
  const altlar = [...document.querySelectorAll(".dash-card,.konsol-isler,.dash-gorunum-panel.is-secili,.panel-card,.url-kart,.urd-bolum,.kak-kart")]
    .filter((e) => e.offsetParent !== null).map(kirpilmisAlt);
  const icerikAlt = altlar.length ? Math.max(...altlar) : null;
  return { tekEkran, dockPayi, dockYuksekligi: dock ? Math.round(dock.height) : null, sayfaYatay: `${s.scrollWidth}/${s.clientWidth}`, sayfaDikey: `${s.scrollHeight}/${s.clientHeight}`, dockUstu: Math.round(dock?.top ?? 0), icerikAlt: icerikAlt === null ? null : Math.round(icerikAlt), dockOrtuyor: icerikAlt === null ? null : icerikAlt > (dock?.top ?? Infinity) + 1, zincir, kartlar };
};

const sonuc = {};
const tarayici = await chromium.launch();
/*
  KABUL BOYUTLARI. İlk beşi gerçek oturum ve yaygın pencere boyları.
  Son dördü 25.11.2026'da eklendi:
    901×641 — ortak seçici eşiğinin (900/640) hemen dışı. Konsolun nabız
      sütunu burada ızgarada kalıyordu ve Sistem sağlığı kartı panelini
      5 px aşıyordu; sayfa sabit ve dock açık olduğu için yalnızca
      taşmaya bakan bir kabul bunu görmüyordu.
    1099×900, 1100×899 — konsolun kendi eşiğinin (1100×900) hemen altı,
      iki eksende ayrı ayrı: seçici açılmalı.
    1100×900 — eşiğin tam üstü: ızgara düzeni ve üç kart birden.
    1600×1000 — 26.11.2026'da eklendi: konsolun ÜÇ SÜTUNLU ızgarası
      (ürünler · kuyruk · nabız) yalnızca 1500×900 / 1400×940 üstünde
      açılıyor ve kabul setindeki boyutların hiçbiri oraya girmiyordu —
      yani yeni düzen hiç ölçülmüyordu.
*/
for (const [w, h] of (process.env.BOYUTLAR ?? "1600x1000,1363x936,1440x900,1100x900,1100x899,1099x900,1440x600,901x641,768x600,390x844").split(",").map((b) => b.split("x").map(Number))) {
  for (const tema of (process.env.TEMALAR ?? "acik,koyu").split(",")) {
    for (const s of SENARYOLAR) {
      /* EKRAN=<dizin>: ölçümün yanında görüntü de alınır (PR kabulü için).
         deviceScaleFactor 2, çünkü görüntüye insan bakıyor. */
      /*
        KAYIT=<dizin>: gezinme akışının kısa ekran kaydı (webm).
        Kabulde "menü, adres ve içerik birlikte değişiyor" cümlesinin
        kanıtı tek tek karelerden değil, akışın kendisinden okunuyor
        (26.11.2026, inceleme talebi). Kayıt alınırken adımlar arası
        bekleme uzatılıyor; yoksa görüntü izlenemeyecek kadar hızlı.
      */
      const sayfa = await tarayici.newPage({
        viewport: { width: w, height: h },
        deviceScaleFactor: process.env.EKRAN ? 2 : 1,
        ...(process.env.KAYIT ? { recordVideo: { dir: process.env.KAYIT, size: { width: w, height: h } } } : {}),
      });
      /* Sayfa hatası sessiz kalmasın: boş çizilen bir senaryo, ölçümü
         "temiz" göstermenin en kolay yoludur. */
      const sayfaHatalari = [];
      sayfa.on("pageerror", (h) => sayfaHatalari.push(String(h.message).slice(0, 200)));
      /* MENU=dar: masaüstü sol menünün daraltılmış hâliyle aynı ölçüm ve
         görüntü kümesi. Tercih üretimde localStorage'dan geliyor; burada
         adresle veriliyor (sayfanın başındaki not). */
      const menuEki = process.env.MENU === "dar" ? "&menu=dar" : "";
      /* BOLUM=<anahtar>: ürün detayı o bölümle AÇILIR (adres hash'te,
         üretimde ?bolum=). Abonelikler gibi tablo taşıyan bölümlerin
         ölçülmesi için gerekli — varsayılan açılış Genel Bakış. */
      const bolumEki = process.env.BOLUM && s === "urundetay"
        ? `#/panel/platform/urunler/arvolab?bolum=${process.env.BOLUM}` : "";
      /* YOL=<rota>: senaryo o adresle açılır. Sol menünün İKİNCİ KATI
         (modülün bölümleri) yalnızca bir modülün içindeyken çiziliyor;
         Ana Sayfa'da açılan bir ölçüm onu hiç görmezdi. */
      const yolEki = process.env.YOL ? `&yol=${encodeURIComponent(process.env.YOL)}` : "";
      /* OTOMASYON=<senaryo>: otomasyon kartının GİRDİSİ (köprü durumu,
         deneme kuyruğu). Etiketi kural üretiyor, düzenek değil. */
      const otomasyonEki = process.env.OTOMASYON ? `&otomasyon=${encodeURIComponent(process.env.OTOMASYON)}` : "";
      await sayfa.goto(`file://${path.join(dizin, `${tema}-${s}.html`)}?sayfa=${s}${menuEki}${yolEki}${otomasyonEki}${bolumEki}`);
      await sayfa.waitForTimeout(300);
      const o = await sayfa.evaluate(olc);
      if (sayfaHatalari.length) o.sayfaHatasi = sayfaHatalari;
      /* Masaüstü sayılan boyut: dört ürünün kaydırmasız okunması bu
         boyutlarda bekleniyor. */
      o.masaustu = w >= 1200 && h >= 800;
      /* YOL=<rota> ile açılan gezinme provasında Ana Sayfa kartları
         yok; Ana Sayfa'ya özgü ölçütler orada uygulanmıyor. */
      o.anaSayfa = !(s === "konsol" && process.env.YOL && process.env.YOL !== "/panel");

      /* Mobil: kompakt satır düzeninin geçerli olduğu genişlik
         (CSS eşiğiyle aynı — 560 px). Dört ürün orada da ilk
         görünümde karşılaştırılabilmeli. */
      o.mobil = w <= 560;
      /* EKRAN=<dizin>: görüntü ölçümün hemen ardında, sekme döngüsünden ÖNCE
         alınır — sonrasında son seçilen sekme ve sona kaydırılmış liste
         görünür, kullanıcının açılışta gördüğü ekran değil. */
      if (process.env.EKRAN) {
        fs.mkdirSync(process.env.EKRAN, { recursive: true });
        await sayfa.screenshot({ path: path.join(process.env.EKRAN, `${s}-${w}x${h}-${tema}${process.env.MENU === "dar" ? "-menu-dar" : ""}${process.env.BOLUM && s === "urundetay" ? `-${process.env.BOLUM}` : ""}.png`) });
      }
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
      /*
        KONSOL ERİŞİM KABULÜ (25.11.2026). Taşmanın sıfır olması yetmiyor:
        kurucunun günde defalarca yaptığı iş kuyruğun SON satırındaki
        "Onayla". Ölçülen: panel sonuna kaydırıldığında son kayıt panelin
        içinde mi, satırın düğmesi o noktada GERÇEKTEN tıklanabilir mi
        (elementFromPoint, yani üstünü başka bir şey örtmüyor), dock'un
        üstünde mi ve klavyeyle odaklanabiliyor mu.
      */
      /*
        GENEL BAKIŞ ERİŞİM KABULÜ (26.11.2026). Ekran değişti: kuyruk
        kendi bölümünde, burada ürün tablosu ve öncelikli işler var.
        Ölçülen: her ürün satırının "Aç" bağlantısı ve son öncelikli
        işin eylemi GERÇEKTEN tıklanabilir mi (elementFromPoint, yani
        üstünü başka bir şey örtmüyor), klavyeyle odaklanabiliyor mu ve
        dock'un üstünde mi.
      */
      const konsolSenaryosu = s === "konsol" || s === "urundetay" || s === "urunler";
      if (s === "konsol") {
        o.erisim = await sayfa.evaluate(() => {
          const gorunur2 = (el) => {
            if (!el) return false;
            const s3 = getComputedStyle(el);
            if (s3.display === "none" || s3.visibility === "hidden") return false;
            const r3 = el.getBoundingClientRect();
            return r3.width > 0 && r3.height > 0;
          };
          const dockE = document.querySelector(".os-dock");
          const dock = gorunur2(dockE) ? dockE.getBoundingClientRect() : undefined;
          const erisilir = (el) => {
            if (!el) return null;
            /* Kullanıcı ne yapıyorsa o: öğeyi KENDİ kartının içinde
               görünür hâle getirip öyle bakıyoruz. Kartı sona kaydırıp
               bütün satırları ölçmek baştakileri haksız yere
               "erişilemez" sayıyordu. */
            el.scrollIntoView({ block: "nearest", inline: "nearest" });
            /*
              ALT ÇUBUĞUN ARKASI "GÖRÜNÜR" SAYILMAZ (26.11.2026).
              scrollIntoView "nearest" öğeyi kaydırma kutusuna sokar
              sokmaz duruyor; kutunun alt kenarı ise alt çubuğun
              ARKASINDA. Kullanıcı o satırı görmek için biraz daha
              kaydırıyor — ölçüm de aynısını yapıyor: dock'un üstüne
              çıkana kadar en yakın kaydırılabilir atayı ilerletiyor.
            */
            if (dock) {
              let kutu = el.getBoundingClientRect();
              if (kutu.bottom > dock.top) {
                for (let ata = el.parentElement; ata; ata = ata.parentElement) {
                  if (ata.scrollHeight <= ata.clientHeight + 1) continue;
                  const once = ata.scrollTop;
                  ata.scrollTop = Math.min(ata.scrollHeight, once + (kutu.bottom - dock.top) + 8);
                  kutu = el.getBoundingClientRect();
                  if (kutu.bottom <= dock.top || ata.scrollTop === once) break;
                }
              }
            }
            const r = el.getBoundingClientRect();
            const hedef = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
            el.focus();
            return {
              metin: el.textContent.trim().slice(0, 18),
              dokunma: Boolean(hedef && (hedef === el || el.contains(hedef))),
              klavye: document.activeElement === el && el.tabIndex >= 0,
              dockUstunde: dock ? r.bottom <= dock.top + 1 : true,
            };
          };
          /*
            Ürün satırı iki biçimde çiziliyor: geniş kartta tablo, dar
            kartta kompakt liste (container sorgusu seçiyor). Ölçüm
            GÖRÜNEN biçime bakmalı — ikisini birden toplamak gizli
            tablonun "Aç" bağlantılarını "açılamıyor" diye bildiriyordu.
          */
          const gorunur = (el) => Boolean(el && el.offsetParent !== null);
          const tabloBaglari = [...document.querySelectorAll(".kup-tablo tbody tr .kup-ac a")];
          const listeBaglari = [...document.querySelectorAll(".kup-mobil > li > a")];
          const urunBaglari = (tabloBaglari.some(gorunur) ? tabloBaglari : listeBaglari).filter(gorunur);
          const satirlar = urunBaglari;
          const urunler = urunBaglari.map((a) => erisilir(a));
          const liste = document.querySelector(".koi-liste");
          const sonIs = liste ? [...liste.querySelectorAll("li > a")].pop() : null;
          return {
            urunSayisi: satirlar.length,
            urunErisimi: urunler,
            erisilemeyenUrun: urunler.filter((u) => !u || !(u.dokunma && u.klavye && u.dockUstunde)).map((u) => u?.metin ?? "?"),
            sonIs: erisilir(sonIs),
            olcutSecici: Boolean(document.querySelector(".kds-olcut")),
          };
        });
      }
      /*
        SONA KAYDIRINCA NE OLUYOR (26.11.2026, ürün kararı). 1200 px
        altında konsol ekranları artık sayfa olarak kayıyor; orada
        "içerik dock'un altında mı" sorusunun cevabı ilk görünümde
        değil, SONA KAYDIRILMIŞ hâlde aranır. Alt çubuğun arkasında
        kalan bir son satır, kullanıcının hiçbir şekilde göremediği
        satırdır.
      */
      if (konsolSenaryosu) {
        o.sonaKaydir = await sayfa.evaluate(() => {
          const gorunurMu = (el) => {
            if (!el) return false;
            const c = getComputedStyle(el);
            if (c.display === "none" || c.visibility === "hidden") return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };
          /*
            KAYDIRICI SAYFA DEĞİL, İÇERİK. html ve body'de
            overflow-x:clip var (panel.css) ve Chromium o durumda dikey
            kaydırmayı da kapatıyor: taşan içerik kaydırılamadan
            kırpılıyor. Dar ekranda kaydırma .panel-content'te.
          */
          const icerik = document.querySelector(".panel-content");
          const kok = icerik && icerik.scrollHeight > icerik.clientHeight + 1 ? icerik : document.scrollingElement;
          const kayiyor = kok.scrollHeight > kok.clientHeight + 1;
          kok.scrollTop = kok.scrollHeight;
          const dockE = document.querySelector(".os-dock");
          const dock = gorunurMu(dockE) ? dockE.getBoundingClientRect() : null;
          /* Son içerik: sayfanın en altındaki görünür kart ya da bağlantı. */
          const adaylar = [...document.querySelectorAll(".panel-content .dash-card, .panel-content .panel-card, .panel-content .sy-kart, .panel-content .dash-card-link, .panel-content .url-kart, .panel-content .urd-bolum")].filter(gorunurMu);
          const alt = adaylar.length ? Math.max(...adaylar.map((e) => e.getBoundingClientRect().bottom)) : null;
          const sonuc = {
            kayiyor,
            sonIcerikAlt: alt === null ? null : Math.round(alt),
            dockUstu: dock ? Math.round(dock.top) : null,
            ortuyor: alt === null || !dock ? false : alt > dock.top + 1,
            kalanKaydirma: Math.round(kok.scrollHeight - kok.clientHeight - kok.scrollTop),
          };
          kok.scrollTop = 0;
          return sonuc;
        });
      }
      /*
        KAPLAMALAR (26.11.2026). Üçü de aynı sözleşmeye uymalı: açılınca
        ODAK İÇERİ girsin, Esc kapatsın ve odak AÇAN düğmeye dönsün.
        Odağın geri dönmediği bir kaplama klavye kullanıcısını sayfanın
        başına atar. Ölçülenler düzenekte GERÇEK bileşenler: komut
        paleti (os-command-palette), dönem seçici (konsol-donem-secici,
        os-menu-kapat) ve Uygulamalar penceresi (os-navigasyon).
        Bildirim çekmecesi ile hesap menüsü sunucu işlemlerine bağlı;
        onlar düzenekte YOK ve kabulde UNVERIFIED kalıyor.
      */
      if (s === "konsol") {
        const kaplama = {};
        const odakAdi = () => sayfa.evaluate(() => (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim().slice(0, 40));
        /*
          beklenen: kaplama kapanınca odağın DÖNMESİ gereken yer.
          Düğmeyle açılan kaplamada o düğme; Ctrl+K ile açılan palette
          açan bir düğme yok, orada odak açılmadan önceki yerine
          dönmeli (beklenen = null).
        */
        const olcKaplama = async (ad, ac, secici, beklenen = null) => {
          const onceki = await odakAdi();
          await ac();
          await sayfa.waitForTimeout(120);
          const acikken = await sayfa.evaluate((sec) => {
            const k = document.querySelector(sec);
            return { acik: Boolean(k) && (k.tagName !== "DIALOG" || k.open), odakIcinde: Boolean(k?.contains(document.activeElement)) };
          }, secici);
          const acanMetin = await sayfa.evaluate(() => (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim().slice(0, 40));
          /* Açık kaplamanın görüntüsü de kabule giriyor: odak halkasının
             ve pencerenin ekranda nasıl durduğu ölçümden okunmuyor. */
          if (process.env.EKRAN) {
            await sayfa.screenshot({ path: path.join(process.env.EKRAN, `kaplama-${ad}-${w}x${h}-${tema}.png`) });
          }
          await sayfa.keyboard.press("Escape");
          await sayfa.waitForTimeout(120);
          const kapaninca = await sayfa.evaluate((sec) => {
            const k = document.querySelector(sec);
            const acik = Boolean(k) && (k.tagName === "DIALOG" ? k.open : k.hasAttribute("open"));
            return { acik, odak: (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim().slice(0, 40) };
          }, secici);
          kaplama[ad] = { ...acikken, acikkenOdak: acanMetin, kapandi: !kapaninca.acik, beklenenOdak: beklenen ?? onceki, odakDondu: kapaninca.odak };
        };
        await olcKaplama("komutPaleti", async () => { await sayfa.keyboard.press("Control+k"); }, "dialog.os-palette");
        if (await sayfa.locator(".kds-donem > summary").first().isVisible()) {
          await olcKaplama("donemSecici", async () => { await sayfa.locator(".kds-donem > summary").first().click(); }, "details.kds-donem", "Dönem seç");
        }
        if (await sayfa.locator('.os-yan-alt .os-yan-oge[aria-haspopup="dialog"]').isVisible()) {
          await olcKaplama("uygulamalar", async () => { await sayfa.locator('.os-yan-alt .os-yan-oge[aria-haspopup="dialog"]').click(); }, "dialog.os-uygulamalar", "Uygulamalar");
        }
        o.kaplamalar = kaplama;
      }

      /*
        İKİ KATLI GEZİNME TIKLAMAYLA (26.11.2026, onaylı mockup).
        Ölçülmek istenen şey "DOM'da duruyor" değil, kurucunun yaptığı
        yol: ana menüden modüle gir → alt menü yerine geçsin ve odak
        "Ana menüye dön"e taşınsın → bir bölüme tıkla → ADRES değişsin
        → geri dön → ana liste gelsin, ADRES DEĞİŞMESİN ve odak girilen
        modülün satırına dönsün → tarayıcı geri tuşu bölüm değişikliğini
        geri alsın.

        Adres hash'te taşınıyor (file:// sayfasında pushState bir yolu
        yazamıyor); şim onu gerçek adres gibi okuyor.
      */
      if (s === "konsol" && w >= 1200 && process.env.MENU !== "dar") {
        const adres = () => sayfa.evaluate(() => location.hash.slice(1) || new URLSearchParams(location.search).get("yol") || "/panel");
        const durum = () => sayfa.evaluate(() => ({
          kat: document.querySelector(".os-yan-kat") ? "alt" : "ana",
          modul: document.querySelector(".os-yan-modul .os-yan-etiket")?.textContent?.trim() ?? null,
          odak: (document.activeElement?.textContent || "").trim().slice(0, 40),
          secili: [...document.querySelectorAll('.os-yan-oge[aria-current="page"]')].map((e) => e.textContent.trim()),
          /* SAYFA İÇERİĞİ de kaydediliyor: menü, adres ve içerik aynı
             akışı göstermeli. 26.11.2026'da paylaşılan karede Finans
             alt menüsü açıkken içerikte hâlâ "Ana Sayfa" yazıyordu —
             ölçüm bunu görmüyordu çünkü içeriğe hiç bakmıyordu. */
          baslik: document.querySelector(".panel-content h1")?.textContent?.trim() ?? null,
        }));
        const bekle = process.env.KAYIT ? 900 : 80;
        const kat = {};
        kat.baslangic = { adres: await adres(), ...(await durum()) };
        await sayfa.waitForTimeout(bekle);
        /* YOL=… ile bir modülün içinde açılmışsa alt menü ZATEN açık;
           yol baştan ölçülsün diye önce ana menüye dönülüyor. */
        if (await sayfa.locator(".os-yan-geri").isVisible()) {
          await sayfa.locator(".os-yan-geri").click();
          await sayfa.waitForTimeout(bekle);
        }
        await sayfa.locator('.os-yan-oge[data-modul="finans"]').click();
        await sayfa.waitForTimeout(bekle);
        kat.modulAcildi = { adres: await adres(), ...(await durum()) };
        await sayfa.locator('.os-yan-kat .os-yan-oge', { hasText: "Ödeme onayları" }).click();
        await sayfa.waitForTimeout(bekle);
        kat.bolumSecildi = { adres: await adres(), ...(await durum()) };
        await sayfa.locator(".os-yan-geri").click();
        await sayfa.waitForTimeout(bekle);
        kat.anaMenuyeDonuldu = { adres: await adres(), ...(await durum()) };
        await sayfa.goBack();
        await sayfa.waitForTimeout(bekle + 120);
        kat.tarayiciGeri = { adres: await adres(), ...(await durum()) };
        o.katGezinme = kat;
      }

      /*
        OTOMASYON KARTININ KENDİ KARESİ (27.11.2026). Telefonda kart
        ilk görünümün altında kalıyor; "satırı göster" denen kanıt
        sayfanın tepesinden alınan bir kareyle verilemez. Kart görünür
        hâle getirilip ayrı bir kare alınıyor, ardından sayfa başa
        döndürülüyor (sonraki ölçümler ilk görünümü bekliyor).
      */
      if (s === "konsol" && process.env.EKRAN && process.env.OTOMASYON) {
        await sayfa.evaluate(() => {
          document.querySelector(".kak-otomasyon")?.scrollIntoView({ block: "center" });
        });
        await sayfa.waitForTimeout(150);
        fs.mkdirSync(process.env.EKRAN, { recursive: true });
        await sayfa.screenshot({ path: path.join(process.env.EKRAN, `otomasyon-${process.env.OTOMASYON}-${w}x${h}-${tema}.png`) });
        await sayfa.evaluate(() => {
          const kok = document.querySelector(".panel-content");
          if (kok) kok.scrollTop = 0;
          document.scrollingElement.scrollTop = 0;
        });
        await sayfa.waitForTimeout(100);
      }

      /*
        RAY ÇEKMECESİ (26.11.2026, inceleme talebi). 64 px'lik rayda ve
        daraltılmış masaüstünde ikinci kat panele taşındı: Finans
        ikonuna basınca Uygulamalar penceresi DOĞRUDAN o modülün
        bölümleriyle açılıyor. Ölçülen: çekmece açıldı mı, başında
        "Ana menüye dön" var mı, bölümler METİN ETİKETİYLE duruyor mu,
        Esc kapatınca odak ray düğmesine dönüyor mu.
      */
      if (s === "konsol" && w >= 761 && (w < 1200 || process.env.MENU === "dar")) {
        const dugme = sayfa.locator('.os-yan-oge[data-modul="finans"]');
        if (await dugme.isVisible()) {
          await dugme.click();
          await sayfa.waitForTimeout(150);
          const cekmece = await sayfa.evaluate(() => {
            const d = document.querySelector("dialog.os-uygulamalar");
            if (!d?.open) return { acik: false };
            const bolumler = [...d.querySelectorAll(".os-uygulamalar-bolum-listesi .os-uygulama")];
            return {
              acik: true,
              baslik: d.querySelector("#os-uygulamalar-baslik")?.textContent?.trim() ?? null,
              geriMetin: d.querySelector(".os-uygulamalar-geri")?.textContent?.trim() ?? null,
              kapatVar: Boolean(d.querySelector('.os-icon-btn[aria-label="Kapat"]')),
              adlar: bolumler.map((b) => b.textContent.trim()),
              baglantili: bolumler.length > 0 && bolumler.every((b) => b.tagName === "A"),
              odakIcinde: d.contains(document.activeElement),
              odak: (document.activeElement?.textContent || "").trim().slice(0, 40),
              /* Aynı bağlantıları gösteren içerik üstü şerit aynı anda
                 çizilmemeli. */
              seritGorunur: (() => { const x = document.querySelector(".os-bolumler"); return x ? getComputedStyle(x).display !== "none" : false; })(),
            };
          });
          if (process.env.EKRAN) {
            fs.mkdirSync(process.env.EKRAN, { recursive: true });
            await sayfa.screenshot({ path: path.join(process.env.EKRAN, `ray-cekmece-${w}x${h}-${tema}${process.env.MENU === "dar" ? "-menu-dar" : ""}.png`) });
          }
          await sayfa.keyboard.press("Escape");
          await sayfa.waitForTimeout(120);
          cekmece.kapandi = await sayfa.evaluate(() => !document.querySelector("dialog.os-uygulamalar")?.open);
          cekmece.odakDondu = await sayfa.evaluate(() => (document.activeElement?.getAttribute("aria-label") || "").trim());
          o.rayCekmece = cekmece;
        }
      }

      /*
        TELEFON PANELİ (26.11.2026, inceleme talebi). "Daha fazla"
        panelinde önce ana modüller; bölümü olan bir modül açılınca
        AYNI panelin içeriği alt menüyle değişiyor. "Ana menüye dön"
        bir üst kata çıkar, "Kapat" paneli kapatır — iki ayrı denetim.
      */
      if (s === "konsol" && w <= 760) {
        const dahaFazla = sayfa.locator('.os-dock button[aria-haspopup="dialog"]');
        if (await dahaFazla.isVisible()) {
          const oku = () => sayfa.evaluate(() => {
            const d = document.querySelector("dialog.os-uygulamalar");
            if (!d?.open) return { acik: false };
            const bolumListesi = d.querySelector(".os-uygulamalar-bolum-listesi");
            return {
              acik: true,
              kat: bolumListesi ? "alt" : "ana",
              baslik: d.querySelector("#os-uygulamalar-baslik")?.textContent?.trim() ?? null,
              geriVar: Boolean(d.querySelector(".os-uygulamalar-geri")),
              kapatVar: Boolean(d.querySelector('.os-icon-btn[aria-label="Kapat"]')),
              adlar: [...(bolumListesi ?? d).querySelectorAll(".os-uygulama")].map((b) => b.textContent.trim().slice(0, 30)),
              odak: (document.activeElement?.textContent || document.activeElement?.getAttribute("aria-label") || "").trim().slice(0, 40),
            };
          });
          const panel = {};
          await dahaFazla.click();
          await sayfa.waitForTimeout(150);
          panel.anaKat = await oku();
          await sayfa.locator('dialog.os-uygulamalar [data-modul="finans"]').click();
          await sayfa.waitForTimeout(150);
          panel.altKat = await oku();
          if (process.env.EKRAN) {
            fs.mkdirSync(process.env.EKRAN, { recursive: true });
            await sayfa.screenshot({ path: path.join(process.env.EKRAN, `telefon-altmenu-${w}x${h}-${tema}.png`) });
          }
          await sayfa.locator("dialog.os-uygulamalar .os-uygulamalar-geri").click();
          await sayfa.waitForTimeout(150);
          panel.geriDonuldu = await oku();
          await sayfa.locator('dialog.os-uygulamalar .os-icon-btn[aria-label="Kapat"]').click();
          await sayfa.waitForTimeout(150);
          panel.kapatildi = await oku();
          o.telefonPanel = panel;
        }
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
          /* Sekmenin GÖVDESİ görünüyor mu: seçili panelin içinde yükseklik
             taşıyan bir içerik kutusu olmalı. Yalnızca başlık çizilmesi
             (gövde 0 px) kabul değil. */
          m.govde = await sayfa.evaluate(() => {
            const p = [...document.querySelectorAll(".dash-gorunum-panel.is-secili")].find((e) => e.offsetParent !== null);
            if (!p) return { hata: "seçili panel görünmüyor" };
            const kart = p.firstElementChild;
            const g = p.querySelector(".dash-col-govde") ?? p.querySelector(".talep-akis-panel");
            const say = (e) => (e ? { h: Math.round(e.getBoundingClientRect().height), ic: e.scrollHeight } : null);
            /*
              KABUL: kartın gövdesi görünüyor mu? Ölçüt "gövde yüksekliği > 0"
              DEĞİL: Tahsilat bir grafik kartı, kendi kaydırma alanı
              (.dash-col-govde) hiç yok ve o ölçüt onu haksız yere düşürüyordu.
              Doğru ölçüt: kart panelin içinde duruyor (ya da panel kendi
              içinde kayıyor) ve kaydırma alanı varsa yüksekliği var.
            */
            const pr = p.getBoundingClientRect(), kr = kart?.getBoundingClientRect();
            const kayiyor = p.scrollHeight > p.clientHeight && getComputedStyle(p).overflowY === "auto";
            return { panel: say(p), kart: say(kart), govde: say(g), tur: g?.className.split(" ")[0] ?? null,
              kayit: g ? g.querySelectorAll("li").length : 0,
              kartPanelde: kr ? kr.bottom <= pr.bottom + 1 : null, panelKayiyor: kayiyor,
              kabul: Boolean(kr && (kr.bottom <= pr.bottom + 1 || kayiyor) && (!g || Math.round(g.getBoundingClientRect().height) > 0)) };
          });
          m.sonKayit = await sayfa.evaluate(() => { const g = [...document.querySelectorAll(".dash-gorunum-panel.is-secili .dash-col-govde")].find((e) => e.offsetParent !== null); if (!g || !g.querySelector("li")) return null; g.scrollTop = g.scrollHeight; const li = [...g.querySelectorAll("li")].pop(); const a = li.getBoundingClientRect(), b = g.getBoundingClientRect(); return a.bottom <= b.bottom + 1 && a.top >= b.top - 1; });
          o.secimler[(await d.textContent()).trim()] = m;
        }
      }
      sonuc[`${w}x${h} ${tema} ${s}`] = o;
      const video = process.env.KAYIT ? sayfa.video() : null;
      await sayfa.close();
      if (video) await video.saveAs(path.join(process.env.KAYIT, `gezinme-${s}-${w}x${h}-${tema}.webm`)).then(() => video.delete(), () => {});
    }
  }
}
await tarayici.close();
if (!process.env.SAKLA) fs.rmSync(dizin, { recursive: true, force: true });

/* Hüküm ölçümden ayrı ve testli: scripts/tek-ekran-kabulu.mjs. */
const hukumler = Object.entries(sonuc).map(([ad, o]) => tekEkranHukmu(ad, { ...o, kartPanelde: o.zincir?.kartPanelde, uyariVar: o.zincir?.uyariVar, urunTablosu: o.zincir?.urunTablosu, ilkIs: o.zincir?.ilkIs, sonUrun: o.zincir?.sonUrun, yanMenu: o.zincir?.yanMenu, bolumSecimi: o.zincir?.bolumSecimi, genislik: o.zincir?.genislik, kartHizasi: o.zincir?.kartHizasi, bolumSeridi: o.zincir?.bolumSeridi, urunBolumu: o.zincir?.urunBolumu }));
const dusen = hukumler.filter((h) => !h.gecti);
console.log(JSON.stringify({ kok: KOK, yeniKurulum, not: "bileşen düzeyi ölçüm; uygulama kabulü değil", kabul: { gecen: hukumler.length - dusen.length, toplam: hukumler.length, dusen }, sonuc }, null, 1));
for (const h of hukumler.filter((x) => x.borc?.length)) console.error(`· bilinen borç — ${h.ad}: ${h.borc.join(" · ")}`);
/* Borçtaki bir satır artık düşmüyorsa liste eskimiştir: düzelen bir şeyi
   örtmeye devam etmesin. */
const eskiyenBorc = hukumler.filter((x) => x.dusmeyenBorc?.length);
for (const h of eskiyenBorc) console.error(`! ${h.ad}: bilinen borçtan çıkar — artık düşmüyor: ${h.dusmeyenBorc.join(" · ")}`);
if (dusen.length || eskiyenBorc.length) {
  for (const h of dusen) console.error(`✗ ${h.ad}: ${h.eksik.join(" · ")}`);
  process.exitCode = 1;
}
