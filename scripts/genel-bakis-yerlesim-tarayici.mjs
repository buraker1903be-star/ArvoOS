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
const cssler = { ana: rotaCss("panel"), crm: rotaCss("panel/crm/genel-bakis"), konsol: rotaCss("panel") };
const SENARYOLAR = (process.env.SENARYOLAR ?? "ana,crm,konsol").split(",");

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
import { TalepAkis } from ${a("app/panel/crm/kayit-detay/kayit-akis.tsx")};
import { konsolUygulamalari } from ${a("app/panel/os/konsol-apps.ts")};
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
  const paneller = [
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
  return (
    <GenelBakis baslik="İyi günler, Burak" sinif="dash-sabit konsol-ana">
      <p className="dash-uyari konsol-uyari" data-tone="danger" role="alert">
        <span aria-hidden="true" />
        <span><b>3 ürün köprüsü yanıt vermiyor · 2 veri kaynağı okunamadı</b><small>Ayrıntı: Sistem sağlığı kartı.</small></span>
      </p>
      <dl className="konsol-serit" aria-label="Konsolun sayıları">
        {konsolSerit.map(([ad, deger, ton, href]) => (
          <div key={ad} data-tone={ton}><dt>{ad}</dt><dd><a href={href}>{deger}</a></dd></div>
        ))}
      </dl>
      <GorunumSecici etiket="Konsol görünümü" paneller={paneller} />
    </GenelBakis>
  );
}
function Kabuk() {
  return <div className="panel-root os-root"><main className="panel-frame os-frame">
    <header className="os-bar"><a className="os-brand" href="/panel"><i>A</i><span><b>Prova Kurum</b></span></a></header>
    <section className="os-workspace">${'{'}/* bölüm menüsü CRM'de layout'ta; burada yükseklik payı CSS tahmininden */${'}'}<div className="panel-content">{sayfa === "crm" ? <Crm /> : sayfa === "konsol" ? <Konsol /> : <Ana />}</div></section>
    <OsNavigasyon uygulamalar={sayfa === "konsol" ? konsolUygulamalari({ odeme: 3, sozlesme: 1, destek: 2 }) : uygulamalar} digerUygulamalar={[]} />
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
  const dock = document.querySelector(".os-dock")?.getBoundingClientRect();
  /*
    İÇERİĞİN ALTI: yalnızca .dash-card'a bakmak yetmiyor. Görünüm seçici
    açıkken konsolda görünen tek kart .konsol-isler ve o .dash-card DEĞİL;
    liste boş kalınca Math.max(...[]) -Infinity dönüyor ve "dock örtmüyor"
    hükmü hiçbir şey ölçmeden geçiyordu (25.11.2026). Kart bulunamazsa
    sonuç null kalır ve kabul bunu geçerli saymaz.
  */
  const altlar = [...document.querySelectorAll(".dash-card,.konsol-isler,.dash-gorunum-panel.is-secili")]
    .filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect().bottom);
  const icerikAlt = altlar.length ? Math.max(...altlar) : null;
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
  const dockK = document.querySelector(".os-dock")?.getBoundingClientRect();
  const zincir = {
    degiskenler: { dockSpace: kokStil.getPropertyValue("--os-dock-space").trim(), barH: kokStil.getPropertyValue("--os-bar-h").trim(), ustH: kokStil.getPropertyValue("--os-ust-h").trim() },
    dock: dockK ? { ust: Math.round(dockK.top), h: Math.round(dockK.height), konum: getComputedStyle(document.querySelector(".os-dock")).position } : null,
    osFrame: kutu(".os-frame"), osWorkspace: kutu(".os-workspace"), panelContent: kutu(".panel-content"),
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
    /* Kartın içinde yüksekliği ne yiyor: başlık, açıklama, gövde, alt bağlantı. */
    kartIci: [...document.querySelectorAll(".dash-gorunum-yigin>.dash-gorunum-panel")].filter((e) => e.offsetParent !== null).map((p2) => {
      const k = p2.firstElementChild;
      const h = (sec) => { const e = k?.querySelector(sec); return e ? Math.round(e.getBoundingClientRect().height) : null; };
      const satir = k?.querySelector(".dash-col-govde li, .dash-col-list li");
      return { ad: p2.id.replace("gorunum-", ""), kart: k ? Math.round(k.getBoundingClientRect().height) : null,
        bas: h(".dash-card-head"), basAciklama: h(".dash-card-head p"), govde: h(".dash-col-govde"),
        altBag: h(".dash-card-link"), cubuklar: h(".dash-bars"), satirYuk: satir ? Math.round(satir.getBoundingClientRect().height) : null };
    }),
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
        display: cs.display, alignItems: cs.alignItems };
    })(),
  };
  return { sayfaYatay: `${s.scrollWidth}/${s.clientWidth}`, sayfaDikey: `${s.scrollHeight}/${s.clientHeight}`, dockUstu: Math.round(dock?.top ?? 0), icerikAlt: icerikAlt === null ? null : Math.round(icerikAlt), dockOrtuyor: icerikAlt === null ? null : icerikAlt > (dock?.top ?? Infinity) + 1, zincir, kartlar };
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
*/
for (const [w, h] of (process.env.BOYUTLAR ?? "1363x936,1440x900,1100x900,1100x899,1099x900,1440x600,901x641,768x600,390x844").split(",").map((b) => b.split("x").map(Number))) {
  for (const tema of (process.env.TEMALAR ?? "acik,koyu").split(",")) {
    for (const s of SENARYOLAR) {
      /* EKRAN=<dizin>: ölçümün yanında görüntü de alınır (PR kabulü için).
         deviceScaleFactor 2, çünkü görüntüye insan bakıyor. */
      const sayfa = await tarayici.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: process.env.EKRAN ? 2 : 1 });
      await sayfa.goto(`file://${path.join(dizin, `${tema}-${s}.html`)}?sayfa=${s}`);
      await sayfa.waitForTimeout(300);
      const o = await sayfa.evaluate(olc);
      /* EKRAN=<dizin>: görüntü ölçümün hemen ardında, sekme döngüsünden ÖNCE
         alınır — sonrasında son seçilen sekme ve sona kaydırılmış liste
         görünür, kullanıcının açılışta gördüğü ekran değil. */
      if (process.env.EKRAN) {
        fs.mkdirSync(process.env.EKRAN, { recursive: true });
        await sayfa.screenshot({ path: path.join(process.env.EKRAN, `${s}-${w}x${h}-${tema}.png`) });
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
      if (s === "konsol") {
        o.erisim = await sayfa.evaluate(() => {
          const panel = document.querySelector(".talep-akis-panel:not([hidden])");
          if (!panel) return { hata: "panel yok" };
          panel.scrollTop = panel.scrollHeight;
          const satirlar = [...panel.querySelectorAll("li")];
          const son = satirlar[satirlar.length - 1];
          if (!son) return { hata: "kayıt yok" };
          const pr = panel.getBoundingClientRect(), sr = son.getBoundingClientRect();
          const dock = document.querySelector(".os-dock")?.getBoundingClientRect();
          const dugme = son.querySelector("button");
          let dokunma = null, dockUstunde = null, klavye = null;
          if (dugme) {
            const dr = dugme.getBoundingClientRect();
            const hedef = document.elementFromPoint(Math.round(dr.left + dr.width / 2), Math.round(dr.top + dr.height / 2));
            dokunma = Boolean(hedef && (hedef === dugme || dugme.contains(hedef)));
            dockUstunde = dock ? dr.bottom <= dock.top + 1 : true;
            dugme.focus();
            klavye = document.activeElement === dugme && dugme.tabIndex >= 0;
          }
          /*
            İç sekme şeridi (Ödeme/Sözleşme/Kurulum/Dönem/Sorun) 390 px'e
            sığmıyor. Kesilmesi ancak YATAY KAYIYORSA kabul: son sekme
            kaydırmayla görünür olmalı, yoksa "Sorun" kuyruğuna telefonda
            hiç ulaşılamaz.
          */
          /*
            Kuyruk sekmelerinin HEPSİ (Sorun dahil) yatay kaydırma olmadan
            erişilebilir olmalı: şerit taşmayacak, her düğme kutusunun
            içinde duracak, o noktada gerçekten tıklanabilecek
            (elementFromPoint) ve klavyeyle odaklanabilecek. Eskiden şerit
            nowrap + gizli kaydırma çubuğuyla kayıyordu: "Dönem" ve "Sorun"
            kutunun dışındaydı, varlıkları ekranda hiç belli olmuyordu.
          */
          const serit = document.querySelector(".talep-akis-sekmeler");
          let icSekme = null;
          if (serit) {
            const d = [...serit.querySelectorAll("button,a")];
            const srr = serit.getBoundingClientRect();
            const sorun = d.map((x) => {
              const b = x.getBoundingClientRect();
              const icinde = b.right <= srr.right + 1 && b.left >= srr.left - 1 && b.bottom <= srr.bottom + 1;
              const hedef = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
              return { ad: x.textContent.trim().slice(0, 14), icinde,
                dokunma: Boolean(hedef && (hedef === x || x.contains(hedef))) };
            });
            icSekme = {
              sayi: d.length, yatayTasiyor: serit.scrollWidth > serit.clientWidth + 1,
              overflowX: getComputedStyle(serit).overflowX, yukseklik: Math.round(srr.height),
              /* Şerit role="tablist": GEZİCİ ODAK doğru kalıp, yani yalnızca
                 seçili sekme tabIndex 0 olur ve ötekilere ok tuşuyla
                 gidilir. "Her düğme tabIndex>=0 olmalı" demek bu kalıbı
                 kusur sayardı; klavye erişimi aşağıda gerçekten tuşa
                 basılarak ölçülüyor. */
              tabDurakSayisi: d.filter((x) => x.tabIndex >= 0).length,
              erisilemeyen: sorun.filter((x) => !(x.icinde && x.dokunma)).map((x) => x.ad),
              sonGorunur: sorun.length ? sorun[sorun.length - 1].icinde : null,
            };
          }
          return {
            kayit: satirlar.length, icSekme,
            panelH: Math.round(pr.height), kaydirildi: panel.scrollTop,
            sonLiYuk: Math.round(sr.height), sonLiAltFark: Math.round(sr.bottom - pr.bottom),
            sonKayitPanelde: sr.bottom <= pr.bottom + 1 && sr.top >= pr.top - 1,
            panelKayiyor: panel.scrollHeight > panel.clientHeight,
            dugmeVar: Boolean(dugme), dokunma, dockUstunde, klavye,
          };
        });
      }
      /*
        KLAVYE GEZİNTİSİ (25.11.2026). "Sorun sekmesi klavyeyle açılabiliyor
        mu" sorusunun cevabı öznitelikten okunamaz: tablist'te seçili sekme
        Tab ile alınır, ötekilere ok tuşuyla gidilir. Burada tuşa gerçekten
        basılıyor ve her durakta odağın hangi sekmede olduğu, sekmenin
        seçildiği ve PANELİNİN görünür olduğu okunuyor.
      */
      if (s === "konsol" && o.erisim?.icSekme?.sayi) {
        await sayfa.evaluate(() => {
          document.querySelector('.talep-akis-sekmeler [tabindex="0"]')?.focus();
        });
        const gezilen = [];
        for (let i = 0; i < o.erisim.icSekme.sayi; i++) {
          gezilen.push(await sayfa.evaluate(() => {
            const a = document.activeElement;
            const kimlik = a?.getAttribute("aria-controls");
            const panel = kimlik ? document.getElementById(kimlik) : null;
            return {
              ad: a?.textContent?.trim().slice(0, 14) ?? null,
              odakSeritte: Boolean(a?.closest(".talep-akis-sekmeler")),
              secili: a?.getAttribute("aria-selected") === "true",
              panelGorunur: panel ? panel.offsetParent !== null && panel.getBoundingClientRect().height > 0 : null,
            };
          }));
          await sayfa.keyboard.press("ArrowRight");
        }
        o.erisim.klavyeGezinti = gezilen;
        /*
          SON SEKME (Sorun) SEÇİLİYKEN DE TEK EKRAN. Sekmeyi açabilmek
          yetmiyor: açıldığında sayfa kaymamalı, dock örtmemeli, kart
          paneline sığmalı. Gezinti başa döndüğü için bir sola basmak son
          sekmeyi seçer — yani bu ölçüm klavye yolunun sonucunu ölçüyor.
          Ölçümden sonra ilk sekmeye dönülüyor: görünüm seçici döngüsü
          varsayılan hâli ölçmeli, bu adımın bıraktığı durumu değil.
        */
        await sayfa.keyboard.press("ArrowLeft");
        await sayfa.waitForTimeout(60);
        o.sonSekme = await sayfa.evaluate(olc);
        o.sonSekme.ad = gezilen[gezilen.length - 1]?.ad ?? null;
        if (process.env.EKRAN) {
          fs.mkdirSync(process.env.EKRAN, { recursive: true });
          await sayfa.screenshot({ path: path.join(process.env.EKRAN, `${s}-${w}x${h}-${tema}-son-sekme.png`) });
        }
        /*
          Sorun seçiliyken görünüm sekmesine dönmek GERÇEK bir yol: telefonda
          kullanıcı Tahsilat'a bakıp "Bugünün İşleri"ne dönüyor ve kuyruk
          hâlâ Sorun'da. İlk ölçümde burası düşmüştü, o yüzden durumu
          gizlemek yerine ölçüyoruz.
        */
        const gorunumDugmeleri = sayfa.locator(".dash-gorunum-sec button");
        if (await gorunumDugmeleri.first().isVisible().catch(() => false)) {
          const say = await gorunumDugmeleri.count();
          await gorunumDugmeleri.nth(Math.min(1, say - 1)).click();
          await sayfa.waitForTimeout(60);
          await gorunumDugmeleri.first().click();
          await sayfa.waitForTimeout(60);
          o.sonSekmeDonus = await sayfa.evaluate(olc);
        }
        await sayfa.evaluate(() => {
          document.querySelector(".talep-akis-sekmeler button")?.click();
        });
        await sayfa.waitForTimeout(60);
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
      await sayfa.close();
    }
  }
}
await tarayici.close();
fs.rmSync(dizin, { recursive: true, force: true });

/* Hüküm ölçümden ayrı ve testli: scripts/tek-ekran-kabulu.mjs. */
const hukumler = Object.entries(sonuc).map(([ad, o]) => tekEkranHukmu(ad, { ...o, kartPanelde: o.zincir?.kartPanelde, uyariVar: o.zincir?.uyariVar }));
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
