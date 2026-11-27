/*
  YÖNETİM MERKEZİ — GERÇEK ROTA KABULÜ (27.11.2026).

  Konsol ekranlarını GERÇEK rotadan açar, ölçer ve görüntüsünü alır.
  Düzenekler (genel-bakis-yerlesim-tarayici.mjs) bileşeni tek başına
  çiziyor; o yol "bileşen böyle görünüyor" diyor, "rota açılıyor ve
  süzgeç/seçim adresten çalışıyor" demiyor. Bu betik ikincisini
  sınıyor: sunucu bileşeni, panel kabuğu, ara katman ve adres
  çözümlemesi dahil.

  Önce önizleme sunucusu gerekiyor (sahte Supabase, scripts/onizleme):

      npm run onizleme        # ARVOOS_ONIZLEME=1, http://localhost:3124

  Sonra:

      node scripts/konsol-rota-kabulu.mjs            # varsayılan set
      ISLER='[{"ad":"x","yol":"/panel",...}]' node scripts/konsol-rota-kabulu.mjs

  Ölçümler kabul ölçütleri: iki sütun yan yana mı, telefonda detay TAM
  GENİŞLİKTE mi (liste gizli), seçili satır işaretli mi, düzen ekranın
  dışına taşıyor mu, yatay kaydırma var mı. Ölçüm olmadan ekran
  görüntüsü "güzel ama yanlış" olabiliyor: 1440'ta kl-duzen'in alt ucu
  ekranın dışına taşıyordu ve görüntüde fark edilmiyordu.
*/
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { kusurlariAyikla, rotaKusurlari } from "./konsol-rota-olcutleri.mjs";
/* Playwright depoda değil, ortamın araç dizininde: ESM `import` onu
   bulamıyor (öteki tarayıcı betikleri de böyle çözüyor). */
const { chromium } = createRequire(import.meta.url)("playwright");

/*
  LOCALHOST'TAN istenir. Konsolun kabuğu (sol gezinme, ikinci kat
  menü, /panel/platform kapısı) `isManagementHost` kararına bağlı;
  önizlemede localhost da yönetim host'u sayılıyor
  (scripts/onizleme/host-rules.ts). Bir süre gerçek host tarayıcıda
  yerele eşlenerek kullanıldı, ama Next'in geliştirme sunucusu
  localhost DIŞINDAKİ bir host'ta istemci paketini bağlamıyor: sayfa
  doğru görünüyor, hiçbir istemci bileşeni çalışmıyor ve hata da yok.
*/
const PORT = process.env.PORT ?? "3124";
const TABAN = process.env.TABAN ?? `http://localhost:${PORT}`;
const DIZIN = process.env.DIZIN ?? "kanit/konsol";

/*
  Varsayılan: envanterdeki BÜTÜN konsol rotaları
  (scripts/konsol-rotalari.json, docs/konsol-rota-envanteri.md ile
  aynı liste). Tek ekran denemek için ISLER ortam değişkeni.
*/
const VARSAYILAN = JSON.parse(await readFile(new URL("./konsol-rotalari.json", import.meta.url), "utf8"));
const ISLER = process.env.ISLER ? JSON.parse(process.env.ISLER) : VARSAYILAN;

await mkdir(DIZIN, { recursive: true });
const tarayici = await chromium.launch({ args: ["--no-sandbox", "--no-proxy-server"] });
let dusen = 0;
for (const is of ISLER) {
  const baglam = await tarayici.newContext({
    viewport: { width: is.w, height: is.h },
    /* Kişinin göreceği görüntü 2x; ölçüm için 1 yeterli ama aynı
       turda hem ölçüp hem görüntü aldığımız için 2 kalıyor. */
    deviceScaleFactor: is.dsf ?? 2,
    colorScheme: is.tema ?? "light",
    isMobile: is.w < 500,
    hasTouch: is.w < 500,
  });
  const sayfa = await baglam.newPage();
  const hatalar = [];
  sayfa.on("pageerror", (e) => hatalar.push(String(e.message).slice(0, 160)));
  const yanit = await sayfa.goto(TABAN + is.yol, { waitUntil: "networkidle", timeout: 90_000 });
  await sayfa.waitForTimeout(600);
  await sayfa.screenshot({ path: `${DIZIN}/${is.ad}.png`, fullPage: false });
  const olcum = await sayfa.evaluate(() => {
    const d = document.querySelector(".kl-duzen");
    const l = document.querySelector(".kl-liste");
    const p = document.querySelector(".kl-panel");
    const g = document.querySelector(".kl-liste-govde");
    const kutu = (e) => (e ? { x: Math.round(e.getBoundingClientRect().x), w: Math.round(e.getBoundingClientRect().width) } : null);
    const gorunur = (e) => (e ? getComputedStyle(e).display !== "none" : null);
    return {
      liste: kutu(l), panel: kutu(p),
      listeGorunur: gorunur(l), panelGorunur: gorunur(p),
      /* Taşma: düzenin alt ucu pencerenin altından aşağıda mı.
         html/body'de taşma kırpılı olduğu için taşan kısma hiç
         ulaşılamıyor — görüntüde de görünmüyor. */
      tasma: d ? Math.max(0, Math.round(d.getBoundingClientRect().bottom) - window.innerHeight) : null,
      yatayTasma: document.documentElement.scrollWidth > window.innerWidth + 1,
      listeKaydirir: g ? g.scrollHeight > g.clientHeight + 2 : null,
      /* Yalnızca LİSTEDEKİ seçili satır: gezinme bağlantıları da
         aria-current taşıyor ve sayaç üçe çıkıyordu. */
      secili: document.querySelectorAll('.kl-liste [aria-current="true"]').length,
      panelBaslik: document.querySelector(".kl-panel-bas h2")?.textContent ?? null,
      panelBos: document.querySelector(".kl-panel-bos-baslik")?.textContent ?? null,
      geriGorunur: gorunur(document.querySelector(".kl-geri")),
    };
  });
  const ham = rotaKusurlari(is, yanit.status(), olcum).concat(hatalar.map((h) => "sayfa hatası: " + h));
  const { kusurlar, bilinenler } = kusurlariAyikla(ham, is.bilinen);
  if (kusurlar.length) dusen++;
  console.log(
    (kusurlar.length ? "✗ " : "✓ ") + is.ad.padEnd(32),
    yanit.status(),
    JSON.stringify(olcum),
    [kusurlar.length ? "KUSUR: " + kusurlar.join(" | ") : "", bilinenler.join(" | ")].filter(Boolean).join("  "),
  );
  await baglam.close();
}
await tarayici.close();
process.exit(dusen ? 1 : 0);
