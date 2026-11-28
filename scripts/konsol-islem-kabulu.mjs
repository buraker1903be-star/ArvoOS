/*
  YÖNETİM MERKEZİ — İŞLEM KABULÜ (28.11.2026).

  Buraya kadarki kabuller ekranın AÇILDIĞINI ve düzenin doğru
  olduğunu gösteriyordu; yazan işlemler "UNVERIFIED" kalıyordu, çünkü
  önizlemede yazma simülasyondu. Bu betik işlemleri ARAYÜZDEN
  başlatıyor ve altında GERÇEK bir veritabanı var:

      npm run onizleme:db     # ARVOOS_ONIZLEME_DB=1, PGlite, port 3126

  Canlı şemanın tamamı yüklü: tetikleyiciler, işlevler ve RLS. Oturum
  çerezden geliyor (`onizleme_oturum`), yani yetkili ve YETKİSİZ hesap
  aynı turda sınanıyor.

  Her senaryoda üç şey ayrı ayrı aranıyor:
    1. işlem arayüzden başlıyor mu,
    2. sonuç KALICI mı (sayfa yenilenince doğru durum görünüyor mu),
    3. yetkisiz hesapta reddediliyor ve kayıt DEĞİŞMİYOR mu.
*/
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const TABAN = process.env.TABAN ?? "http://localhost:3126";
const KURUCU = "99999999-9999-4999-8999-999999999999";
const YETKISIZ = "88888888-8888-4888-8888-888888888888";
const ODEME_UYUSMAYAN = "bbbb0000-0000-4000-8000-000000000001";
const ODEME_TAM = "bbbb0000-0000-4000-8000-000000000002";
const TALEP = "cccc0000-0000-4000-8000-000000000001";

const kusurlar = [];
const not = (ad, kosul, ayrinti = "") => {
  console.log(`${kosul ? "✓" : "✗"} ${ad}${ayrinti ? "  " + ayrinti : ""}`);
  if (!kosul) kusurlar.push(`${ad}${ayrinti ? " — " + ayrinti : ""}`);
};

/* Akış baştan koşsun: önceki tur ödemeyi onaylamış, talebi
   yanıtlamış, fiyatı yayımlamış oluyor. */
const sifirlama = await fetch(`${TABAN}/onizleme-sifirla`, { method: "POST" });
if (!sifirlama.ok) {
  console.error(`Örnek veri sıfırlanamadı (${sifirlama.status}). Önizleme veritabanı kipinde mi? npm run onizleme:db`);
  process.exit(2);
}

const tarayici = await chromium.launch({ args: ["--no-sandbox", "--no-proxy-server"] });

/** Verilen hesabın oturumuyla bir bağlam açar. */
async function oturum(kullanici) {
  const baglam = await tarayici.newContext({ viewport: { width: 1440, height: 900 } });
  await baglam.addCookies([{ name: "onizleme_oturum", value: kullanici, url: TABAN }]);
  const sayfa = await baglam.newPage();
  sayfa.on("pageerror", (e) => kusurlar.push("sayfa hatası: " + String(e.message).slice(0, 90)));
  return { baglam, sayfa };
}

const metin = (sayfa) => sayfa.evaluate(() => document.querySelector("main")?.textContent ?? "");

/* ---------------------------------------------------------------- */
console.log("\n— 1. Ödeme onayı (yetkili) —");
{
  const { baglam, sayfa } = await oturum(KURUCU);
  await sayfa.goto(`${TABAN}/panel/platform/payments?secili=odeme:${ODEME_TAM}`, { waitUntil: "networkidle" });
  await sayfa.waitForTimeout(800);
  not("panel bekleyen ödemeyi açtı", /Onay bekliyor/.test(await metin(sayfa)));

  await sayfa.locator(".kl-panel textarea[name=review_note]").fill("Hesapta görüldü (kabul turu).");
  await sayfa.locator(".kl-panel button:has-text('Ödemeyi onayla')").click();
  await sayfa.waitForTimeout(400);
  not("onay penceresi açıldı", await sayfa.locator(".onay-pencere").isVisible());
  await sayfa.locator(".onay-eylem button[type=submit]").click();
  await sayfa.waitForTimeout(2500);

  /* KALICILIK: sayfayı yeniden yükle, durumu oku. */
  await sayfa.goto(`${TABAN}/panel/platform/payments?secili=odeme:${ODEME_TAM}`, { waitUntil: "networkidle" });
  await sayfa.waitForTimeout(700);
  const sonra = await metin(sayfa);
  not("yenileyince durum 'Onaylandı'", /Onaylandı/.test(sonra));
  not("inceleme notu kayda geçti", /Hesapta görüldü \(kabul turu\)/.test(sonra), sonra.match(/Hesapta görüldü[^·]*/)?.[0] ?? "");

  /* Onayın ASIL etkisi: lisans dönemi. Müşteri kartından okunuyor. */
  await sayfa.goto(`${TABAN}/panel/platform/musteriler?tur=kurumsal&secili=kurum:11111111-1111-4111-8111-111111111111`, { waitUntil: "networkidle" });
  await sayfa.waitForTimeout(700);
  not("onay lisans dönemini uzattı", /Kullanımda|Yenileme/.test(await metin(sayfa)));
  await baglam.close();
}

/* ---------------------------------------------------------------- */
console.log("\n— 2. Ödeme reddi (yetkili) —");
{
  const { baglam, sayfa } = await oturum(KURUCU);
  await sayfa.goto(`${TABAN}/panel/platform/payments?secili=odeme:${ODEME_UYUSMAYAN}`, { waitUntil: "networkidle" });
  await sayfa.waitForTimeout(800);
  const once = await metin(sayfa);
  not("uyarı onaydan önce okunuyor", /Beklenen tutarla uyuşmuyor/.test(once), once.match(/Beklenen tutar[^.]*\./)?.[0] ?? "");

  await sayfa.locator(".kl-panel textarea[name=review_note]").fill("Dekont tutarı eksik (kabul turu).");
  await sayfa.locator(".kl-panel button:has-text('Reddet')").click();
  await sayfa.waitForTimeout(400);
  await sayfa.locator(".onay-eylem button[type=submit]").click();
  await sayfa.waitForTimeout(2500);

  await sayfa.goto(`${TABAN}/panel/platform/payments?secili=odeme:${ODEME_UYUSMAYAN}`, { waitUntil: "networkidle" });
  await sayfa.waitForTimeout(700);
  not("yenileyince durum 'Reddedildi'", /Reddedildi/.test(await metin(sayfa)));
  await baglam.close();
}

/* ---------------------------------------------------------------- */
console.log("\n— 3. Destek yanıtı (yetkili) —");
{
  const { baglam, sayfa } = await oturum(KURUCU);
  await sayfa.goto(`${TABAN}/panel/platform/destek?secili=${TALEP}`, { waitUntil: "networkidle" });
  await sayfa.waitForTimeout(800);
  await sayfa.locator(".kl-panel .destek-yanit textarea").first().fill("Kaydı güncelledik (kabul turu).");
  await sayfa.locator(".kl-panel .destek-yanit button:has-text('Yanıtı gönder')").click();
  await sayfa.waitForTimeout(2500);

  await sayfa.goto(`${TABAN}/panel/platform/destek?durum=tumu&secili=${TALEP}`, { waitUntil: "networkidle" });
  await sayfa.waitForTimeout(700);
  const sonra = await metin(sayfa);
  not("yanıt kayda geçti", /Kaydı güncelledik \(kabul turu\)/.test(sonra));
  not("talep 'Müşteri bekleniyor'a geçti", /Müşteri bekleniyor/.test(sonra));
  await baglam.close();
}

/* ---------------------------------------------------------------- */
console.log("\n— 4. Yetkisiz hesap —");
{
  const { baglam, sayfa } = await oturum(YETKISIZ);
  const yanit = await sayfa.goto(`${TABAN}/panel/platform/payments`, { waitUntil: "networkidle" });
  await sayfa.waitForTimeout(700);
  const govde = await metin(sayfa);
  not("konsol ekranı yetkisize kapalı", !/Ödeme onayları/.test(govde), `durum ${yanit.status()}`);
  not("karar formu yetkisizde yok", !(await sayfa.locator("button:has-text('Ödemeyi onayla')").count()));
  await baglam.close();

  /* Kayıt DEĞİŞMEDİ: yetkili hesapla bakıldığında durum aynı. */
  const { baglam: b2, sayfa: s2 } = await oturum(KURUCU);
  await s2.goto(`${TABAN}/panel/platform/payments?secili=odeme:${ODEME_UYUSMAYAN}`, { waitUntil: "networkidle" });
  await s2.waitForTimeout(700);
  not("yetkisiz denemeden sonra kayıt değişmedi", /Reddedildi/.test(await metin(s2)));
  await b2.close();
}

/* ---------------------------------------------------------------- */
console.log("\n— 5. Dekont erişimi —");
{
  /* Dekont bağlantısı yalnızca BEKLEYEN bildirim için üretiliyor
     (geçmiş kayıtlar için yüz imza çağrısı yapılmasın diye); önceki
     adımlar ikisini de karara bağladı. */
  await fetch(`${TABAN}/onizleme-sifirla`, { method: "POST" });
  const { baglam, sayfa } = await oturum(KURUCU);
  await sayfa.goto(`${TABAN}/panel/platform/payments?secili=odeme:${ODEME_TAM}`, { waitUntil: "networkidle" });
  await sayfa.waitForTimeout(700);
  const yetkili = await sayfa.locator(".kl-panel a:has-text('Dekont'), .kl-panel a[href*='dekont']").count();
  not("yetkili hesapta dekont bağlantısı var", yetkili > 0, `${yetkili} bağlantı`);
  await baglam.close();

  const { baglam: b2, sayfa: s2 } = await oturum(YETKISIZ);
  await s2.goto(`${TABAN}/panel/platform/payments?secili=odeme:${ODEME_TAM}`, { waitUntil: "networkidle" });
  await s2.waitForTimeout(700);
  const yetkisiz = await s2.locator("a[href*='dekont']").count();
  not("yetkisiz hesapta dekont bağlantısı yok", yetkisiz === 0, `${yetkisiz} bağlantı`);
  await b2.close();
}


/* ---------------------------------------------------------------- */
console.log("\n— 6. Fiyat yayımı ve EŞZAMANLI taslak değişikliği —");
{
  await fetch(`${TABAN}/onizleme-sifirla`, { method: "POST" });
  /*
    İki oturum: A önizlemeyi açıyor, B araya yeni bir taslak
    sokuyor. A'nın elindeki onay artık GÖRMEDİĞİ bir değişikliği de
    kapsıyor; yayım düşmeli.
  */
  const { baglam: ba, sayfa: a } = await oturum(KURUCU);
  const { baglam: bb, sayfa: b } = await oturum(KURUCU);

  const FIYAT = `${TABAN}/panel/platform/urunler/arvoos?bolum=fiyat`;
  await a.goto(FIYAT, { waitUntil: "networkidle" });
  await a.waitForTimeout(900);
  const onizleme = await metin(a);
  not("yayım önizlemesi açıldı", /değişikliği yayımla/.test(onizleme), onizleme.match(/\d+ değişikliği yayımla/)?.[0] ?? "");
  const kapsamA = await a.locator("input[name=kapsam]").first().inputValue();
  not("önizleme kapsam imzası taşıyor", Boolean(kapsamA), kapsamA.slice(0, 48));

  /* B: başka bir basamağı taslağa alıyor (ArvoLab ekranından). */
  await b.goto(`${TABAN}/panel/platform/urunler/arvolab?bolum=fiyat`, { waitUntil: "networkidle" });
  await b.waitForTimeout(900);
  const kutu = b.locator("form input[name=tutar]").first();
  const eski = await kutu.inputValue();
  await kutu.fill("777,00");
  await b.locator("form:has(input[name=tutar]) button:has-text('Kaydet')").first().click();
  await b.waitForTimeout(2000);
  const kapsamB = await b.locator("input[name=kapsam]").first().inputValue();
  not("ikinci oturum taslağı değiştirdi", kapsamB !== kapsamA, `${eski} → 777,00`);

  /* A: ESKİ onayla yayımlamaya çalışıyor. */
  await a.locator("input[name='kapsam-onayi']").first().check();
  await a.locator("button:has-text('değişikliği yayımla')").first().click();
  await a.waitForTimeout(2500);
  const sonucA = await metin(a);
  not("eski onayla yayım REDDEDİLDİ", /önizlemeden sonra değişti|yayımlanmadı/i.test(sonucA),
    sonucA.match(/[^.]*önizlemeden sonra değişti[^.]*\./)?.[0] ?? sonucA.slice(0, 80));

  /* Kayıt değişmedi: taslaklar hâlâ bekliyor ve güncel kapsam görünüyor. */
  await a.reload({ waitUntil: "networkidle" });
  await a.waitForTimeout(900);
  const taze = await metin(a);
  not("taslaklar yayımlanmadı, güncel kapsam gösteriliyor", /değişikliği yayımla/.test(taze),
    taze.match(/\d+ değişikliği yayımla/)?.[0] ?? "");
  const kapsamYeni = await a.locator("input[name=kapsam]").first().inputValue();
  not("yeniden onay gerekiyor (kapsam imzası yenilendi)", kapsamYeni === kapsamB && kapsamYeni !== kapsamA);

  /*
    Güncel onayla yayım geçiyor: kilit DOĞRU kapsamı engellemiyor.
    İki onay kutusu da işaretleniyor — büyük değişimde uyarı kutusu
    (`onay`) da zorunlu, kapsam kutusu (`kapsam-onayi`) her zaman.
  */
  for (const ad of ["onay", "kapsam-onayi"]) {
    const kutu = a.locator(`input[name='${ad}']`).first();
    if (await kutu.count()) await kutu.check();
  }
  await a.locator("button:has-text('değişikliği yayımla')").first().click();
  await a.waitForTimeout(2500);
  const yayimSonrasi = await metin(a);
  await a.reload({ waitUntil: "networkidle" });
  await a.waitForTimeout(900);
  not("güncel onayla yayım geçiyor", !/değişikliği yayımla/.test(await metin(a)),
    yayimSonrasi.match(/İşlem tamamlanamadı[^.]*\./)?.[0] ?? "");

  await ba.close();
  await bb.close();
}

await tarayici.close();
console.log(kusurlar.length ? `\n${kusurlar.length} kusur:\n- ` + kusurlar.join("\n- ") : "\nİşlem kabulü: kusur yok.");
process.exit(kusurlar.length ? 1 : 0);
