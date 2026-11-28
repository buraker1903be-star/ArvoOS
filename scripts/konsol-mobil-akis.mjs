/*
  YÖNETİM MERKEZİ — TABLET VE TELEFONDA KRİTİK AKIŞLAR (28.11.2026).

  Akış kabulü (konsol-akis-kabulu.mjs) BEŞ LİSTE ekranını tıklıyor:
  kaydır → kayıt aç → tam kart → geri → kapat. Konsolun geri kalanı
  o kalıba girmiyor (Ana Sayfa kuyruğu, ürün detayının sekmeleri,
  Ayarlar'ın bölümleri, komut paleti, Uygulamalar penceresi, tema)
  ve dar ekranda onların kendi tuzağı var: alt çubuk (os-dock) son
  eylemin üstüne biniyor, kaplama ekranın dışına taşıyor, sekme
  şeridi tıklanamaz hâle geliyor.

  Bu betik o akışları TIKLAYARAK ölçüyor. Her adımda:
    - hedef gerçekten geldi mi (adres ve ekrandaki metin),
    - yatay kaydırma doğdu mu,
    - eylem ERİŞİLEBİLİR mi: görünür, ekranın içinde ve ÜSTÜNÜ ÖRTEN
      bir şey yok (elementFromPoint). Görünür ama alt çubuğun altında
      kalan bir düğme "var" sayılmaz.

  Önce önizleme sunucusu gerekiyor:

      npm run onizleme:db   # port 3126 (gerçek veritabanı, oturumlu)
      GENISLIK=768 YUKSEKLIK=1024 node scripts/konsol-mobil-akis.mjs
      GENISLIK=390 YUKSEKLIK=844  node scripts/konsol-mobil-akis.mjs
*/
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const PORT = process.env.PORT ?? "3126";
const TABAN = process.env.TABAN ?? `http://localhost:${PORT}`;
const GENISLIK = Number(process.env.GENISLIK ?? 390);
const YUKSEKLIK = Number(process.env.YUKSEKLIK ?? 844);
const OTURUM = process.env.OTURUM ?? "";
/* Dokunma emülasyonu yalnızca telefonda: tablet fareyle de kullanılıyor. */
const DOKUNMA = GENISLIK < 500;

const kusurlar = [];
const not = (ad, kosul, ayrinti = "") => {
  console.log(`${kosul ? "✓" : "✗"} ${ad}${ayrinti ? "  " + ayrinti : ""}`);
  if (!kosul) kusurlar.push(`${GENISLIK}px · ${ad}${ayrinti ? " — " + ayrinti : ""}`);
};

const tarayici = await chromium.launch({ args: ["--no-sandbox", "--no-proxy-server"] });
const baglam = await tarayici.newContext({
  viewport: { width: GENISLIK, height: YUKSEKLIK },
  deviceScaleFactor: 1,
  isMobile: DOKUNMA,
  hasTouch: DOKUNMA,
});
if (OTURUM) await baglam.addCookies([{ name: "onizleme_oturum", value: OTURUM, url: TABAN }]);
/*
  GELİŞTİRME KAPLAMASINI KALDIR. Next'in dev göstergesi
  (`nextjs-portal`) sol ALT köşede duruyor ve 768 px'te sol rayın
  en altındaki "Uygulamalar" düğmesinin tıklamasını yutuyordu
  ("subtree intercepts pointer events"). Üründe böyle bir katman
  yok; ölçümün onu görmesi yanlış kusur üretiyor.
*/
await baglam.addInitScript(() => {
  const koy = () => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none !important}";
    document.documentElement.append(s);
  };
  if (document.documentElement) koy();
  else document.addEventListener("DOMContentLoaded", koy);
});
const sayfa = await baglam.newPage();
sayfa.setDefaultTimeout(15_000);
sayfa.on("pageerror", (e) => kusurlar.push(`${GENISLIK}px · sayfa hatası: ` + String(e.message).slice(0, 120)));

const bekle = (ms = 500) => sayfa.waitForTimeout(ms);

/** Yatay kaydırma: dar ekranda düzenin en sık kusuru. */
const yatayTasma = () => sayfa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

/*
  ERİŞİLEBİLİRLİK ÖLÇÜSÜ. "Görünür" yetmiyor: alt çubuk sabit ve
  son eylemin üstüne binince düğme ekranda duruyor ama tıklanmıyor.
  Ölçü: öğeyi görüş alanına çek, merkezinden elementFromPoint sor;
  dönen düğüm öğenin kendisi ya da akrabası değilse ÜSTÜ ÖRTÜLÜ.
*/
async function erisilebilir(secici) {
  const konum = sayfa.locator(secici).first();
  if (!(await konum.count())) return { var: false, neden: "öğe yok" };
  await konum.scrollIntoViewIfNeeded().catch(() => {});
  await bekle(250);
  /*
    Ölçüm PLAYWRIGHT'IN ÇÖZDÜĞÜ öğe üzerinden yapılıyor. Önce
    seçici tarayıcıya `querySelector` ile veriliyordu; `:visible`
    ve `has-text` Playwright'ın kendi sözde sınıfları, tarayıcı
    onları bilmiyor: biri sessizce masaüstünün gizli hücresini
    ölçüyor ("boyut 0" diyordu), öteki hata atıp akışı düşürüyordu.
  */
  return konum.evaluate((e) => {
    const k = e.getBoundingClientRect();
    if (k.width < 2 || k.height < 2) return { var: false, neden: "boyut 0" };
    if (k.bottom < 0 || k.top > window.innerHeight) return { var: false, neden: `ekran dışı (top=${Math.round(k.top)})` };
    const x = Math.min(Math.max(k.x + k.width / 2, 1), window.innerWidth - 1);
    const y = Math.min(Math.max(k.y + k.height / 2, 1), window.innerHeight - 1);
    const ust = document.elementFromPoint(x, y);
    const akraba = ust && (ust === e || e.contains(ust) || ust.contains(e));
    return akraba
      ? { var: true, neden: "" }
      : { var: false, neden: `üstünü örten: ${ust ? ust.className || ust.tagName : "yok"}` };
  });
}

async function git(yol) {
  await sayfa.goto(TABAN + yol, { waitUntil: "networkidle", timeout: 90_000 });
  await bekle(600);
}

const metin = () => sayfa.evaluate(() => (document.querySelector("main")?.textContent ?? "").slice(0, 3000));

console.log(`\n=== ${GENISLIK}×${YUKSEKLIK} ===`);

/*
  BİR AKIŞIN DÜŞMESİ ÖTEKİLERİ GÖTÜRMESİN. Tıklama zaman aşımı
  betiği komple durduruyordu ve o turda kalan akışlar hiç
  ölçülmemiş oluyordu — "ölçülmedi" ile "temiz" karışmasın diye
  her akış kendi kusurunu yazıp sıradakine geçiyor.
*/
async function kesim(ad, fn) {
  try {
    await fn();
  } catch (e) {
    not(`${ad} akışı tamamlandı`, false, String(e.message ?? e).split("\n")[0].slice(0, 140));
  }
}

await kesim("ANA SAYFA", async () => {
  /* 1. ANA SAYFA · karar kuyruğundan kayda inmek. */
  console.log("\n— Ana Sayfa · karar kuyruğu —");
  await git("/panel");
  not("Ana Sayfa yatay kaydırma yok", !(await yatayTasma()));
  /* Telefonda satırın tıklanan parçası başka öğe (masaüstü hücresi
     gizli): `:visible` ikisini de kapsıyor. */
  const kuyruk = sayfa.locator("main a[href*='/panel/platform/']:visible").first();
  if (await kuyruk.count()) {
    const hedef = await kuyruk.getAttribute("href");
    const e = await erisilebilir("main a[href*='/panel/platform/']:visible");
    not("kuyruk kalemi erişilebilir", e.var, e.neden || hedef);
    await kuyruk.click();
    await bekle(1200);
    not("kuyruk kalemi KAYDA açıldı", sayfa.url().includes("/panel/platform/"), sayfa.url().split("/panel")[1] ?? "");
    not("açılan kayıtta yatay kaydırma yok", !(await yatayTasma()));
  } else {
    not("kuyrukta kalem var", false, "karar kuyruğu boş");
  }
});

await kesim("ÜRÜNLER", async () => {
  /* 2. ÜRÜNLER · ürün detayı ve sekme şeridi (fiyat düzenleme). */
  console.log("\n— Ürünler · ürün detayı · Fiyat basamakları —");
  await git("/panel/platform/urunler");
  not("Ürünler yatay kaydırma yok", !(await yatayTasma()));
  const urun = sayfa.locator("main a[href*='/panel/platform/urunler/']:visible").first();
  not("ürün kartı var", Boolean(await urun.count()));
  if (await urun.count()) {
    await urun.click();
    await bekle(1500);
    not("ürün detayı açıldı", /\/panel\/platform\/urunler\/[^/?]+/.test(sayfa.url()), sayfa.url().split("/panel")[1] ?? "");
    not("ürün detayında yatay kaydırma yok", !(await yatayTasma()));
    /*
      SEKME ŞERİDİ DAR EKRANDA AÇILIR LİSTE. Ürün detayı TalepAkis'i
      `darSecici` ile kullanıyor: geniş ekranda bağlantı rayı, dar
      ekranda `<select>`. İlk ölçüm yalnızca rayı aradı ve "boyut 0"
      dedi — kusur ekranda değil, ölçümdeydi.
    */
    const secKutusu = sayfa.locator(".talep-akis-sec select").first();
    const darSecim = (await secKutusu.count()) > 0 && (await secKutusu.isVisible());
    const serit = await erisilebilir(darSecim ? ".talep-akis-sec select" : ".urd-serit a");
    not(darSecim ? "sekme açılır listesi erişilebilir" : "sekme şeridi erişilebilir", serit.var, serit.neden);
    const fiyat = sayfa.locator(".urd-serit a", { hasText: "Fiyat" }).first();
    if (darSecim || (await fiyat.count())) {
      if (darSecim) {
        /* `selectOption` etiket için düzenli ifade almıyor; seçeneğin
           değerini kendimiz buluyoruz. */
        const deger = await secKutusu.evaluate((el) =>
          [...el.options].find((o) => o.textContent?.includes("Fiyat"))?.value ?? "");
        await secKutusu.selectOption(deger);
      }
      else await fiyat.click();
      await bekle(1400);
      not("Fiyat basamakları sekmesi açıldı", (await metin()).includes("Fiyat basamakları"), sayfa.url().split("?")[1] ?? "");
      const kutu = await erisilebilir("input[name='tutar'], .talep-tablo input[type='text']");
      not("taslak tutar kutusu erişilebilir", kutu.var, kutu.neden);
      const kaydet = await erisilebilir("button:has-text('Kaydet'):visible");
      not("Kaydet düğmesi erişilebilir (alt çubuk örtmüyor)", kaydet.var, kaydet.neden);
    } else {
      not("Fiyat sekmesi var", false, "şeritte bulunamadı");
    }
  }
});

await kesim("AYARLAR", async () => {
  /* 3. AYARLAR · sorgu değişkenli bölüm sekmeleri. */
  console.log("\n— Ayarlar · bölüm sekmeleri —");
  await git("/panel/platform/ayarlar");
  not("Ayarlar yatay kaydırma yok", !(await yatayTasma()));
  const bolum = sayfa.locator(".ek-segment a").nth(1);
  if (await bolum.count()) {
    const ad = (await bolum.textContent())?.trim() ?? "";
    const e = await erisilebilir(".ek-segment a:nth-child(2)");
    not("bölüm sekmesi erişilebilir", e.var, e.neden || ad);
    await bolum.click();
    await bekle(1200);
    not("bölüm adrese yazıldı", sayfa.url().includes("bolum="), sayfa.url().split("?")[1] ?? "");
    not("bölüm içeriği geldi", (await metin()).length > 200, `${(await metin()).length} karakter`);
    not("bölüm değişince yatay kaydırma yok", !(await yatayTasma()));
  } else {
    not("Ayarlar'da bölüm sekmesi var", false);
  }
});

await kesim("SİSTEM SAĞLIĞI", async () => {
  /* 4. SİSTEM SAĞLIĞI · iş detayına geçiş. */
  console.log("\n— Sistem sağlığı · iş detayı —");
  /* İş listesi "Zamanlanmış işler" sekmesinde; sayfa ilk SORUNLU
     sekmeyle açılıyor, yani varsayılanı köprü olabiliyor. */
  await git("/panel/platform/saglik?sekme=isler");
  not("Sağlık yatay kaydırma yok", !(await yatayTasma()));
  const is = sayfa.locator("main a[href*='/panel/platform/saglik/is']:visible").first();
  if (await is.count()) {
    const e = await erisilebilir("main a[href*='/panel/platform/saglik/is']:visible");
    not("iş bağlantısı erişilebilir", e.var, e.neden);
    await is.click();
    await bekle(1200);
    not("iş detayı açıldı", sayfa.url().includes("/saglik/is"), sayfa.url().split("/panel")[1] ?? "");
    not("iş detayında yatay kaydırma yok", !(await yatayTasma()));
  } else {
    not("sağlıkta iş bağlantısı var", false, "örnek veride zamanlanmış iş yok");
  }
});

await kesim("KOMUT PALETİ", async () => {
  /* 5. KOMUT PALETİ · üst bardan açılıyor, sonuç listesi ekranın içinde. */
  console.log("\n— Komut paleti —");
  await git("/panel");
  const aramaDugmesi = sayfa.locator(".os-search").first();
  if (await aramaDugmesi.count()) {
    const e = await erisilebilir(".os-search");
    not("arama düğmesi erişilebilir", e.var, e.neden);
    await aramaDugmesi.click();
    await bekle(700);
    /* `<dialog>` kapanınca DOM'dan GİTMİYOR, yalnızca `open` düşüyor;
     varlığına bakan ilk ölçüm "Esc kapatmadı" diyordu. */
  not("palet açıldı", Boolean(await sayfa.locator(".os-palette[open]").count()));
    await sayfa.keyboard.type("müşteri");
    await bekle(900);
    const liste = await sayfa.evaluate(() => {
      const l = document.querySelector(".os-palette-list");
      if (!l) return null;
      const k = l.getBoundingClientRect();
      return { ust: Math.round(k.top), alt: Math.round(k.bottom), pencere: window.innerHeight, oge: l.querySelectorAll("li").length };
    });
    not("palet sonuç listesi ekranın içinde", Boolean(liste) && liste.ust >= 0 && liste.ust < liste.pencere,
      liste ? `top=${liste.ust} alt=${liste.alt} pencere=${liste.pencere} öğe=${liste.oge}` : "liste yok");
    const ilk = await erisilebilir(".os-palette-list li a, .os-palette-list li button, .os-palette-list li [role='option']");
    not("ilk sonuç erişilebilir", ilk.var, ilk.neden);
    await sayfa.keyboard.press("Escape");
    await bekle(400);
    not("Esc paleti kapattı", (await sayfa.locator(".os-palette[open]").count()) === 0);
  } else {
    not("üst barda arama düğmesi var", false);
  }
});

await kesim("Uygulamalar penceresi", async () => {
  /* 6. UYGULAMALAR / "Daha fazla" · alt çubuğun ikinci katı. */
  console.log("\n— Uygulamalar penceresi —");
  await git("/panel");
  /*
    AÇMA DÜĞMESİ EKRANA GÖRE BAŞKA YERDE. Telefonda alt çubuğun
    son gözü ("Daha fazla"), tablette ve masaüstünde sol rayın
    altındaki "Uygulamalar". Alt çubuk 768'de gizli (genişlik 0) —
    yalnızca dock'a bakan ilk ölçüm orada tıklayacak bir şey
    bulamıyordu.
  */
  const dahaFazla = sayfa
    .locator('.os-dock-oge:visible, .os-yan-alt button[aria-label^="Uygulamalar"]:visible')
    .filter({ hasText: "Uygulamalar" })
    .first();
  if (await dahaFazla.count()) {
    await dahaFazla.click();
    await bekle(800);
    const pencere = await sayfa.evaluate(() => {
      const p = document.querySelector(".os-uygulamalar");
      if (!p) return null;
      const k = p.getBoundingClientRect();
      return { ust: Math.round(k.top), alt: Math.round(k.bottom), g: Math.round(k.width), pencere: window.innerHeight, bag: p.querySelectorAll("a").length };
    });
    not("Uygulamalar penceresi açıldı", Boolean(pencere) && pencere.g > 10, pencere ? JSON.stringify(pencere) : "pencere yok");
    if (pencere) {
      not("pencere ekranın içinde", pencere.ust >= 0 && pencere.ust < pencere.pencere, `top=${pencere.ust} pencere=${pencere.pencere}`);
      not("pencerede uygulama bağlantısı var", pencere.bag > 0, `${pencere.bag} bağlantı`);
    }
    not("pencere açıkken yatay kaydırma yok", !(await yatayTasma()));
  } else {
    not("alt çubukta Uygulamalar/Daha fazla var", false);
  }
});

await kesim("TEMA", async () => {
  /*
    7. TEMA. Üst çubuktaki düğme 520 px'in ALTINDA bilerek gizli
    (os-shell.css); telefonda tema komut paletindeki "Aydınlık /
    karanlık temaya geç" ile değişiyor. İki yol da burada ölçülüyor:
    genişte düğme, darda palet komutu. Ölçüt aynı — tema gerçekten
    değişti mi.
  */
  console.log("\n— Tema —");
  await git("/panel");
  const tema = () => sayfa.evaluate(() => document.documentElement.getAttribute("data-theme") ?? "");
  const once = await tema();
  if (GENISLIK > 520) {
    const e = await erisilebilir(".panel-theme-toggle");
    not("tema düğmesi erişilebilir", e.var, e.neden);
    await sayfa.locator(".panel-theme-toggle").first().click();
  } else {
    not("dar ekranda üst çubuktaki tema düğmesi gizli (tasarım kararı)",
      (await sayfa.locator(".os-bar .panel-theme-toggle:visible").count()) === 0);
    await sayfa.locator(".os-search").first().click();
    await bekle(600);
    const komut = sayfa.locator(".os-palette-list li", { hasText: "temaya geç" }).first();
    not("palette tema komutu var", Boolean(await komut.count()));
    await komut.click();
  }
  await bekle(800);
  const sonra = await tema();
  not("tema değişti", once !== sonra && Boolean(sonra), `${once || "(yok)"} → ${sonra || "(yok)"}`);
});

await tarayici.close();
console.log(kusurlar.length ? `\n${kusurlar.length} kusur:\n- ` + kusurlar.join("\n- ") : `\n${GENISLIK}px akışları: kusur yok.`);
process.exit(kusurlar.length ? 1 : 0);
