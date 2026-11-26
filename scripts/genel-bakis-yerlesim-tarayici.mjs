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
// Operasyon genel bakışı sabit düzene geçmiş mi (10.11.2026): eskisi akış düzeni + ListeIzgarasi.
const opsYeni = fs.readFileSync(path.join(KOK, "app/panel/operations/page.tsx"), "utf8").includes("dash-esit");
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
const cssler = { ana: rotaCss("panel"), crm: rotaCss("panel/crm/genel-bakis"), konsol: rotaCss("panel"), urundetay: rotaCss("panel/platform/urunler/[urun]"), ops: rotaCss("panel/operations") };
// SAYFALAR: Operasyon PR'ının (#315) eski adı; SENARYOLAR ile aynı.
const SENARYOLAR = (process.env.SENARYOLAR ?? process.env.SAYFALAR ?? "ana,crm,konsol,urundetay,ops").split(",");

const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "yerlesim-"));
const shim = path.join(dizin, "shim");
fs.mkdirSync(shim);
fs.writeFileSync(path.join(shim, "link.tsx"), `export default function Link({ href, children, prefetch, scroll, replace, ...p }) { return <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>; }`);
fs.writeFileSync(path.join(shim, "navigation.ts"), `export const usePathname = () => window.__yol || "/panel"; export const useSearchParams = () => new URLSearchParams(); export const useRouter = () => ({ push(){}, replace(){}, refresh(){} });`);
fs.writeFileSync(path.join(shim, "image.tsx"), `export default function Image({ src, alt, width, height, className }) { return <img src={src} alt={alt} width={width} height={height} className={className} />; }`);

const a = (p) => JSON.stringify(path.join(KOK, p));
fs.writeFileSync(path.join(dizin, "giris.tsx"), `
import { createRoot } from "react-dom/client";
import { GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri, SeriKarti } from ${a("app/panel/os/genel-bakis.tsx")};
import { GorunumSecici } from ${a("app/panel/os/gorunum-secici.tsx")};
import { UrunPerformansiKarti, OncelikliIslerKarti } from "@/app/panel/konsol-urun-performansi";
import { DonemSecici, OlcutSecici } from "@/app/panel/konsol-donem-secici";
import { UrunGenelBakis } from "@/app/panel/platform/urunler/[urun]/urun-genel-bakis";
import { OsNavigasyon } from ${a("app/panel/os/os-navigasyon.tsx")};
import { OsBolumMenusu } from ${a("app/panel/os/os-bolum-menusu.tsx")};
import { TalepAkis } from ${a("app/panel/crm/kayit-detay/kayit-akis.tsx")};
import { konsolUygulamalari } from ${a("app/panel/os/konsol-apps.ts")};
${yeniKurulum ? `import { KurulumOzeti } from ${a("app/panel/os/kurulum-ozeti.tsx")};` : ""}
const sayfa = new URLSearchParams(location.search).get("sayfa") || "ana";
window.__yol = sayfa === "crm" ? "/panel/crm/genel-bakis" : sayfa === "ops" ? "/panel/operations" : "/panel";
const gun = (i) => { const d = new Date(Date.UTC(2026, 10, 10 - (13 - i))); return d; };
const seri = { days: Array.from({ length: 14 }, (_, i) => ({ key: "g" + i, day: String(i + 1), title: "Gün " + (i + 1), count: [2,5,1,0,3,4,6,2,1,3,5,2,4,3][i], isToday: i === 13 })), total: 41, previous: 33, max: 6, aralik: "28 Eki – 10 Kas", oncekiAralik: "14–27 Eki" };
const uygulamalar = [
  { key: "home", label: "Ana ekran", href: "/panel", ikon: "home", yollar: [] },
  { key: "crm", label: "CRM", href: "/panel/crm/genel-bakis", ikon: "crm", yollar: ["/panel/crm"], bolumler: [{ key: "genel-bakis", label: "Genel Bakış", href: "/panel/crm/genel-bakis" }, { key: "talepler", label: "Talepler", href: "/panel/crm" }, { key: "teklifler", label: "Teklifler", href: "/panel/crm/proposals" }, { key: "sozlesmeler", label: "Sözleşmeler", href: "/panel/crm/contracts" }] },
  { key: "operations", label: "Operasyon", href: "/panel/operations", ikon: "operations", yollar: ["/panel/operations"], bolumler: [{ key: "genel", label: "Genel Bakış", href: "/panel/operations" }, { key: "isler", label: "İşler", href: "/panel/operations/isler" }, { key: "pano", label: "Pano", href: "/panel/operations/pano" }, { key: "takvim", label: "Takvim", href: "/panel/operations/takvim" }] },
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
// Gerçek sayfanın kart dizilimi (operations/page.tsx): 6 aşama, 3 yeni iş, 6 devam eden, mesaj yok (boş kart).
function opsKartlari() {
  return {
    asamalar: <ListeKarti baslik="Yaklaşan aşamalar" alt="2 aşamanın teslimi gecikti" bos="Yaklaşan aşama yok." href="/panel/operations/takvim" hrefEtiket="Takvimde gör" sayi={6}>{isler.map(satir)}</ListeKarti>,
    yeni: <ListeKarti baslik="Yeni gelen işler" alt="1 iş sorumlu bekliyor" bos="Yeni iş yok." href="/panel/operations/isler?durum=planned" hrefEtiket="Tümünü gör" sayi={3}>{isler.slice(0, 3).map(satir)}</ListeKarti>,
    devam: <ListeKarti baslik="Devam eden işler" alt="2 geciken, bu hafta 3 teslim" bos="Şu an devam eden iş yok." href="/panel/operations/isler?durum=devam" hrefEtiket="Tümünü gör" sayi={6}>{isler.map(satir)}</ListeKarti>,
    mesajlar: <ListeKarti baslik="Müşteri mesajları" alt="Takip ekranından yazılanlar" bos="Okunmamış müşteri mesajı yok." href="/panel/operations/isler?mesaj=yeni" hrefEtiket="Tümünü gör" sayi={0} />,
  };
}
function Ops() {
  const kartlar = opsKartlari();
  const grafik = <SeriKarti baslik="Tamamlanan aşamalar" alt="Son 14 gün" seri={seri} adet="aşama" />;
  ${'return <GenelBakis gizliBaslik="Operasyon genel bakış" sinif="dash-sabit dash-esit"><GorunumSecici etiket="Operasyon görünümü" paneller={[{ anahtar: "asamalar", etiket: "Aşamalar", yer: "liste", icerik: kartlar.asamalar }, { anahtar: "yeni", etiket: "Yeni işler", yer: "liste", icerik: kartlar.yeni }, { anahtar: "devam", etiket: "Devam eden", yer: "liste", icerik: kartlar.devam }, { anahtar: "mesajlar", etiket: "Mesajlar", yer: "liste", icerik: kartlar.mesajlar }, { anahtar: "tamamlanan", etiket: "Tamamlanan", yer: "ust", icerik: grafik }]} /></GenelBakis>;'}
}
function OpsEski() {
  return <GenelBakis gizliBaslik="Operasyon genel bakış">{<SeriKarti baslik="Tamamlanan aşamalar" alt="Son 14 gün" seri={seri} adet="aşama" />}<ListeIzgarasi etiket="Operasyon işleri">{Object.values(opsKartlari())}</ListeIzgarasi></GenelBakis>;
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
          <UrunPerformansiKarti satirlar={URUN_SATIRLARI} olcut="musteri"
            donem={{ kod: "30g", etiket: "Son 30 gün", gun: 30, baslangic: "", bitis: "", oncekiBaslangic: "", oncekiBitis: "" }}
            para={(n) => "₺" + n.toLocaleString("tr-TR")} sayi={(n) => n.toLocaleString("tr-TR")}
            secici={<DonemSecici secili="30g" taban="/panel" />}
            olcutSecici={<OlcutSecici secili="musteri" taban="/panel" />} />
          <OncelikliIslerKarti isler={ONCELIKLI} okunamayan={[]} />
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
    <GenelBakis baslik="Genel Bakış" sinif="dash-sabit konsol-ana">
      <p className="dash-uyari konsol-uyari" data-tone="danger" role="alert">
        <span aria-hidden="true" />
        <span><b>3 ürün köprüsü yanıt vermiyor · 2 veri kaynağı okunamadı</b></span>
        <a className="konsol-uyari-bag" href="/panel/platform/saglik">Sistem sağlığı</a>
      </p>
      <div className="konsol-arac">
        <DonemSecici secili="30g" taban="/panel" />
      </div>
      <div className="konsol-genel">
        <UrunPerformansiKarti satirlar={URUN_SATIRLARI} olcut="musteri"
          donem={{ kod: "30g", etiket: "Son 30 gün", gun: 30, baslangic: "", bitis: "", oncekiBaslangic: "", oncekiBitis: "" }}
          para={(n) => "₺" + n.toLocaleString("tr-TR")} sayi={(n) => n.toLocaleString("tr-TR")}
          olcutSecici={<OlcutSecici secili="musteri" taban="/panel" />} />
        <OncelikliIslerKarti isler={ONCELIKLI} okunamayan={[]} />
      </div>
    </GenelBakis>
  );
}

/*
  ÜRÜN DETAYI — GENEL BAKIŞ SEKMESİ (26.11.2026). Gerçek bileşen, gerçek
  CSS; veri sentetik. Üretimle aynı kabuk sınıfları: sayfa artık TEK
  EKRAN (liste-sayfa), yani kaydırma kartın içinde.
*/
function UrunDetay() {
  const satir = {
    kod: "arvolab", ad: "ArvoLab",
    aktifMusteri: { durum: "var", deger: 892 },
    donusum: { durum: "var", deger: { denemeye: 200, ucretliye: 36, oran: 0.18 } },
    tahsilat: { durum: "var", deger: 128450 },
  };
  const donem = { kod: "30g", etiket: "Son 30 gün", gun: 30, baslangic: "", bitis: "", oncekiBaslangic: "", oncekiBitis: "" };
  return (
    <main className="plt talep cari ekip urun-sayfa liste-sayfa">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">ÜRÜNLER · LB</small>
          <h1>ArvoLab</h1>
          <p className="ek-alt">Akademik yazım ve editöryal kontrol · lab.arvo-os.com</p>
        </div>
        <div className="talep-bas-eylem">
          <DonemSecici secili="30g" taban="/panel/platform/urunler/arvolab" />
        </div>
      </header>
      <div className="talep-izgara personel-iki ekip-izgara">
        <section className="talep-akis panel-card sy-kart">
          {/* Üretimdeki TalepAkis gibi: dar pencere seçicisi ve şerit
              birlikte çiziliyor, hangisinin görüneceğine CSS karar veriyor. */}
          <label className="talep-akis-sec">
            <select aria-label="ArvoLab kartı" defaultValue={0}>
              {["Genel Bakış", "Müşteriler · 42", "Fiyat basamakları", "Abonelikler · 248", "Tahsilat", "Destek"].map((ad, i) => (
                <option key={ad} value={i}>{ad}</option>
              ))}
            </select>
          </label>
          <div className="talep-akis-sekmeler" role="tablist" aria-label="ArvoLab kartı">
            {["Genel Bakış", "Müşteriler · 42", "Fiyat basamakları", "Abonelikler · 248", "Tahsilat", "Destek"].map((ad, i) => (
              <button key={ad} type="button" role="tab" aria-selected={i === 0} tabIndex={i === 0 ? 0 : -1} className={i === 0 ? "is-active" : undefined}>{ad}</button>
            ))}
          </div>
          <section>
            <UrunGenelBakis satir={satir} donem={donem}
              para={(n) => "₺" + n.toLocaleString("tr-TR")} sayi={(n) => n.toLocaleString("tr-TR")}
              bekleyenler={[
                { anahtar: "b1", baslik: "Ödeme bildirimleri", alt: "Onay bekleyenler konsolun kuyruğunda", href: "#", eylem: "İncele" },
                { anahtar: "b2", baslik: "Yaklaşan yenilemeler", alt: "ArvoLab lisansı dönemi dolanlar", href: "/panel/platform/musteriler?urun=arvolab", eylem: "Görüntüle" },
                { anahtar: "b3", baslik: "Yanıt bekleyen talepler", alt: "Destek ekranında", href: "#", eylem: "Görüntüle" },
              ]} />
          </section>
        </section>
      </div>
    </main>
  );
}
function Kabuk() {
  return <div className="panel-root os-root"><main className="panel-frame os-frame">
    <header className="os-bar"><a className="os-brand" href="/panel"><i>A</i><span><b>Prova Kurum</b></span></a></header>
    <section className="os-workspace"><OsBolumMenusu uygulamalar={sayfa === "konsol" || sayfa === "urundetay" ? konsolUygulamalari({ odeme: 3, sozlesme: 1, destek: 2 }) : uygulamalar} /><div className="panel-content">{sayfa === "crm" ? <Crm /> : sayfa === "konsol" ? <Konsol /> : sayfa === "urundetay" ? <UrunDetay /> : sayfa === "ops" ? (${opsYeni} ? <Ops /> : <OpsEski />) : <Ana />}</div></section>
    <OsNavigasyon uygulamalar={sayfa === "konsol" || sayfa === "urundetay" ? konsolUygulamalari({ odeme: 3, sozlesme: 1, destek: 2 }) : uygulamalar} digerUygulamalar={[]} />
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
  let kartlar = [...document.querySelectorAll(".dash-gorunum-panel")].filter((p) => p.offsetParent !== null).map((p) => {
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
    const kr = kart?.getBoundingClientRect();
    return { panel: p.id.replace("gorunum-", ""), ust: kr ? +kr.top.toFixed(1) : null, alt: kr ? +kr.bottom.toFixed(1) : null, kart: r(kart), kartKaydirma: kart ? `${kart.scrollHeight}/${kart.clientHeight}` : null, govde: r(govde), tamGorunenKayit: tam, kayit: govde ? govde.querySelectorAll("li").length : null, sonKayitErisilir, yatayTasma: kart ? kart.scrollWidth > kart.clientWidth + 1 : null };
  });
  // Eski (akış) düzende panel sarmalayıcısı yok: kartları doğrudan ölç (yalnızca "önce" için).
  if (!kartlar.length) for (const kart of document.querySelectorAll(".dash-chart, .dash-cols > .dash-col")) {
    const kr = kart.getBoundingClientRect(), govde = kart.querySelector(".dash-col-govde, .dash-col-list");
    kartlar.push({ panel: kart.querySelector("h2")?.textContent?.trim() ?? "?", ust: +kr.top.toFixed(1), alt: +kr.bottom.toFixed(1), kart: Math.round(kr.height), kartKaydirma: `${kart.scrollHeight}/${kart.clientHeight}`, govde: govde ? Math.round(govde.getBoundingClientRect().height) : null, tamGorunenKayit: null, kayit: kart.querySelectorAll("li").length, yatayTasma: kart.scrollWidth > kart.clientWidth + 1 });
  }
  const dock = document.querySelector(".os-dock")?.getBoundingClientRect();
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
  const dockK = document.querySelector(".os-dock")?.getBoundingClientRect();
  const zincir = {
    degiskenler: { dockSpace: kokStil.getPropertyValue("--os-dock-space").trim(), barH: kokStil.getPropertyValue("--os-bar-h").trim(), ustH: kokStil.getPropertyValue("--os-ust-h").trim() },
    dock: dockK ? { ust: Math.round(dockK.top), h: Math.round(dockK.height), konum: getComputedStyle(document.querySelector(".os-dock")).position } : null,
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
      const oncekiKaydirma = govde.scrollTop;
      const kartKayabilir = govde.scrollHeight > govde.clientHeight + 1;
      govde.scrollTop = govde.scrollHeight;
      const g = govde.getBoundingClientRect();
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
      govde.scrollTop = oncekiKaydirma;
      return { kartKayabilir, hepsiSigiyor: !kartKayabilir, tam, dokunma, klavye, metin: (son.textContent ?? "").trim().slice(0, 14) };
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
  const altlar = [...document.querySelectorAll(".dash-card,.konsol-isler,.dash-gorunum-panel.is-secili,.panel-card")]
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
      const sayfa = await tarayici.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: process.env.EKRAN ? 2 : 1 });
      /* Sayfa hatası sessiz kalmasın: boş çizilen bir senaryo, ölçümü
         "temiz" göstermenin en kolay yoludur. */
      const sayfaHatalari = [];
      sayfa.on("pageerror", (h) => sayfaHatalari.push(String(h.message).slice(0, 200)));
      await sayfa.goto(`file://${path.join(dizin, `${tema}-${s}.html`)}?sayfa=${s}`);
      await sayfa.waitForTimeout(300);
      const o = await sayfa.evaluate(olc);
      if (sayfaHatalari.length) o.sayfaHatasi = sayfaHatalari;
      /* Masaüstü sayılan boyut: dört ürünün kaydırmasız okunması bu
         boyutlarda bekleniyor. */
      o.masaustu = w >= 1200 && h >= 800;
      /* Mobil: kompakt satır düzeninin geçerli olduğu genişlik
         (CSS eşiğiyle aynı — 560 px). Dört ürün orada da ilk
         görünümde karşılaştırılabilmeli. */
      o.mobil = w <= 560;
      /* EKRAN=<dizin>: görüntü ölçümün hemen ardında, sekme döngüsünden ÖNCE
         alınır — sonrasında son seçilen sekme ve sona kaydırılmış liste
         görünür, kullanıcının açılışta gördüğü ekran değil. */
      if (process.env.EKRAN) {
        fs.mkdirSync(process.env.EKRAN, { recursive: true });
        await sayfa.screenshot({ path: path.join(process.env.EKRAN, `${s}-${w}x${h}-${tema}.png`) });
      }
      // Gerçek dış kaydırma girişimi: tekerlek + End; sonra sayfanın konumu.
      await sayfa.mouse.move(w / 2, 100); await sayfa.mouse.wheel(0, 3000); await sayfa.mouse.wheel(3000, 0); await sayfa.keyboard.press("End");
      o.kaydirmaSonrasi = await sayfa.evaluate(() => ({ x: Math.round(scrollX), y: Math.round(scrollY) }));
      // Liste gövdesi kaydırılırken başlık ve alt bağlantı yerinde mi (kayan gövdesi olan her görünür kart).
      o.sabitlik = await sayfa.evaluate(() => [...document.querySelectorAll(".dash-gorunum-panel")].filter((p) => p.offsetParent !== null).flatMap((p) => {
        const g = p.querySelector(".dash-col-govde"); if (!g || g.scrollHeight <= g.clientHeight + 1) return [];
        const h = p.querySelector(".dash-card-head"), l = p.querySelector(".dash-card-link");
        const once = [h?.getBoundingClientRect().top, l?.getBoundingClientRect().top];
        g.scrollTop = g.scrollHeight;
        const sonra = [h?.getBoundingClientRect().top, l?.getBoundingClientRect().top];
        const son = [...g.querySelectorAll("li")].pop()?.getBoundingClientRect(), gr = g.getBoundingClientRect();
        g.scrollTop = 0;
        return [{ panel: p.id.replace("gorunum-", ""), baslikKaydi: Math.round((sonra[0] ?? 0) - (once[0] ?? 0)), altBaglantiKaydi: Math.round((sonra[1] ?? 0) - (once[1] ?? 0)), sonKayitGorunur: son ? son.bottom <= gr.bottom + 1 && son.top >= gr.top - 1 : null }];
      }));
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
      if (s === "konsol") {
        o.erisim = await sayfa.evaluate(() => {
          const dock = document.querySelector(".os-dock")?.getBoundingClientRect();
          const erisilir = (el) => {
            if (!el) return null;
            /* Kullanıcı ne yapıyorsa o: öğeyi KENDİ kartının içinde
               görünür hâle getirip öyle bakıyoruz. Kartı sona kaydırıp
               bütün satırları ölçmek baştakileri haksız yere
               "erişilemez" sayıyordu. */
            el.scrollIntoView({ block: "nearest", inline: "nearest" });
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
const hukumler = Object.entries(sonuc).map(([ad, o]) => tekEkranHukmu(ad, { ...o, kartPanelde: o.zincir?.kartPanelde, uyariVar: o.zincir?.uyariVar, urunTablosu: o.zincir?.urunTablosu, ilkIs: o.zincir?.ilkIs, sonUrun: o.zincir?.sonUrun, bolumSecimi: o.zincir?.bolumSecimi, genislik: o.zincir?.genislik }));
const dusen = hukumler.filter((h) => !h.gecti);
console.log(JSON.stringify({ kok: KOK, opsYeni, yeniKurulum, not: "bileşen düzeyi ölçüm; uygulama kabulü değil", kabul: { gecen: hukumler.length - dusen.length, toplam: hukumler.length, dusen }, sonuc }, null, 1));
for (const h of hukumler.filter((x) => x.borc?.length)) console.error(`· bilinen borç — ${h.ad}: ${h.borc.join(" · ")}`);
/* Borçtaki bir satır artık düşmüyorsa liste eskimiştir: düzelen bir şeyi
   örtmeye devam etmesin. */
const eskiyenBorc = hukumler.filter((x) => x.dusmeyenBorc?.length);
for (const h of eskiyenBorc) console.error(`! ${h.ad}: bilinen borçtan çıkar — artık düşmüyor: ${h.dusmeyenBorc.join(" · ")}`);
if (dusen.length || eskiyenBorc.length) {
  for (const h of dusen) console.error(`✗ ${h.ad}: ${h.eksik.join(" · ")}`);
  process.exitCode = 1;
}
