/*
  SAĞ PANELDE ASIL İŞE ERİŞİM (27.11.2026 ara kontrolü).

  Panelin görünmesi yetmiyor: kurucunun yapacağı iş panelin SONUNDA
  (ödemede karar formu, destekte yanıt kutusu). Bu betik o son eylemi
  üç yoldan sınıyor:

   1. SIRA — karar verdirecek bilgiler (tutar, para birimi, referans,
      varsa uyarı) eylemden ÖNCE geliyor mu.
   2. KAYDIRMA — panel sonuna kadar kaydırıldığında eylem ekranda ve
      TIKLANABİLİR mi (elementFromPoint onu veriyor mu). Sabit bir
      alt çubuk ya da dock üstüne binerse burada çıkar.
   3. KLAVYE — panelin başından Tab'layarak eyleme ulaşılıyor mu.

  Önce önizleme sunucusu: `npm run onizleme`.
*/
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const PORT = process.env.PORT ?? "3124";
const TABAN = process.env.TABAN ?? `http://localhost:${PORT}`;
const GENISLIK = Number(process.env.GENISLIK ?? 1440);
const YUKSEKLIK = Number(process.env.YUKSEKLIK ?? 900);

const kusurlar = [];
const not = (ad, kosul, ayrinti = "") => {
  console.log(`${kosul ? "✓" : "✗"} ${ad}${ayrinti ? "  " + ayrinti : ""}`);
  if (!kosul) kusurlar.push(`${GENISLIK}×${YUKSEKLIK} ${ad}${ayrinti ? " — " + ayrinti : ""}`);
};

const tarayici = await chromium.launch({ args: ["--no-sandbox", "--no-proxy-server"] });
const baglam = await tarayici.newContext({
  viewport: { width: GENISLIK, height: YUKSEKLIK },
  deviceScaleFactor: 1,
  isMobile: GENISLIK < 500,
  hasTouch: GENISLIK < 500,
});
const sayfa = await baglam.newPage();

async function panel({ ad, adres, okunacaklar, eylemSecici, eylemAdi }) {
  console.log(`\n— ${ad} (${GENISLIK}×${YUKSEKLIK}) —`);
  await sayfa.goto(TABAN + adres, { waitUntil: "networkidle" });
  await sayfa.waitForTimeout(700);

  /* 1. Karar bilgileri eylemden önce okunabiliyor mu. */
  const sira = await sayfa.evaluate(({ aranan, eylem }) => {
    const p = document.querySelector(".kl-panel");
    if (!p) return null;
    const metin = p.textContent ?? "";
    const e = p.querySelector(eylem);
    const eylemUst = e ? e.getBoundingClientRect().top + p.scrollTop - p.getBoundingClientRect().top : null;
    const bulunan = {};
    for (const [anahtar, desen] of Object.entries(aranan)) bulunan[anahtar] = new RegExp(desen).test(metin);
    /* Bilgi bloğu: künye alanları (kl-panel-alanlar) eylemden önce mi. */
    const alanlar = p.querySelector(".kl-panel-alanlar");
    const alanUst = alanlar ? alanlar.getBoundingClientRect().top + p.scrollTop - p.getBoundingClientRect().top : null;
    return { bulunan, eylemUst, alanUst, eylemVar: Boolean(e) };
  }, { aranan: okunacaklar, eylem: eylemSecici });
  if (!sira) { not("panel açıldı", false); return; }
  for (const [anahtar, varMi] of Object.entries(sira.bulunan)) not(`panelde "${anahtar}" okunuyor`, varMi);
  not(`"${eylemAdi}" panelde var`, sira.eylemVar);
  if (!sira.eylemVar) return;
  not("karar bilgileri eylemden önce", sira.alanUst !== null && sira.eylemUst !== null && sira.alanUst < sira.eylemUst,
    `künye=${Math.round(sira.alanUst ?? -1)} eylem=${Math.round(sira.eylemUst ?? -1)}`);

  /* 2. Panelin sonuna kaydır: eylem görünür ve tıklanabilir mi. */
  await sayfa.evaluate(() => { const p = document.querySelector(".kl-panel"); if (p) p.scrollTop = p.scrollHeight; });
  await sayfa.waitForTimeout(400);
  const erisim = await sayfa.evaluate((eylem) => {
    const e = document.querySelector(eylem);
    if (!e) return null;
    const k = e.getBoundingClientRect();
    const x = k.left + k.width / 2;
    const y = k.top + k.height / 2;
    const ust = document.elementFromPoint(x, y);
    const engel = ust && !e.contains(ust) && ust !== e ? (ust.className || ust.tagName) : null;
    return {
      ekranda: k.top >= 0 && k.bottom <= window.innerHeight + 1 && k.width > 0,
      alt: Math.round(k.bottom), pencere: window.innerHeight,
      engel: typeof engel === "string" ? engel.slice(0, 60) : engel,
    };
  }, eylemSecici);
  not("son eylem kaydırınca ekranda", erisim?.ekranda === true, `alt=${erisim?.alt} pencere=${erisim?.pencere}`);
  not("son eylemin üstünü hiçbir şey örtmüyor", !erisim?.engel, erisim?.engel ? `örten: ${erisim.engel}` : "");

  /* 3. Klavye: panelin ilk odaklanabilirinden Tab'layarak eyleme ulaş. */
  await sayfa.evaluate(() => {
    const p = document.querySelector(".kl-panel");
    const ilk = p?.querySelector("a, button, input, select, textarea");
    if (ilk) ilk.focus();
  });
  let adim = 0;
  let ulasti = false;
  while (adim < 40 && !ulasti) {
    await sayfa.keyboard.press("Tab");
    adim += 1;
    ulasti = await sayfa.evaluate((eylem) => {
      const e = document.querySelector(eylem);
      return Boolean(e && (document.activeElement === e || e.contains(document.activeElement)));
    }, eylemSecici);
  }
  not("son eyleme klavyeyle ulaşılıyor", ulasti, `${adim} Tab`);
}

const P1 = process.env.ORNEK_ODEME ?? "bbbbbbb1-0000-4000-8000-000000000001";
const P2 = process.env.ORNEK_ODEME2 ?? "bbbbbbb1-0000-4000-8000-000000000002";
const T1 = process.env.ORNEK_TALEP ?? "aaaaaaa1-0000-4000-8000-000000000001";

await panel({
  ad: "Ödeme onayı (uyarılı)",
  adres: `/panel/platform/payments?secili=odeme:${P1}`,
  okunacaklar: { tutar: "₺", referans: "ARV-", uyarı: "(uyuşmuyor|doğrulanamadı)" },
  eylemSecici: ".kl-panel form button[type=submit], .kl-panel form .panel-primary",
  eylemAdi: "karar formu",
});

await panel({
  ad: "Ödeme onayı (dekontsuz)",
  adres: `/panel/platform/payments?secili=odeme:${P2}`,
  okunacaklar: { tutar: "₺", referans: "ARV-" },
  eylemSecici: ".kl-panel form button[type=submit], .kl-panel form .panel-primary",
  eylemAdi: "karar formu",
});

await panel({
  ad: "Destek yanıtı",
  adres: `/panel/platform/destek?secili=${T1}`,
  okunacaklar: { kurum: "Ege", "hazır yanıt": "Hazır yanıt", "yanıt alanı": "Kuruma görünecek|Yanıt" },
  eylemSecici: ".kl-panel .destek-yanit .panel-primary",
  eylemAdi: "Yanıtı gönder",
});

await tarayici.close();
console.log(kusurlar.length ? `\n${kusurlar.length} kusur:\n- ` + kusurlar.join("\n- ") : "\nPanel erişimi: kusur yok.");
process.exit(kusurlar.length ? 1 : 0);
