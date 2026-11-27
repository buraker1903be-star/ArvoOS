/*
  YÖNETİM MERKEZİ — AKIŞ KABULÜ (27.11.2026 ara kontrolü).

  Ölçüm betiği (konsol-rota-kabulu.mjs) tek bir adresi açıp ölçüyor;
  bu betik KULLANICI GİBİ TIKLIYOR. İkisi farklı şeyi gösteriyor:
  bir adresin doğru çizilmesi, "kaydır → kayıt aç → geri dön"
  dizisinin konumu koruduğunu söylemiyor.

  Sınanan akış (üç liste ekranında da aynı):
    1. süzgeç uygula
    2. listeyi aşağı kaydır
    3. görünür bir kaydı aç (sağ panel)
    4. tam karta geç ve tarayıcı GERİ tuşuyla dön
    5. paneli kapat
  Her adımda süzgeç, sıralama ve KAYDIRMA KONUMU korunmalı. Yeni bir
  süzgeç uygulandığında konum korunmamalı: önceki süzgecin konumunu
  yeni sonuçlara taşımak kullanıcıyı alakasız bir satırın ortasına
  bırakıyor.

  Önce önizleme sunucusu: `npm run onizleme`.
*/
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const PORT = process.env.PORT ?? "3124";
const TABAN = process.env.TABAN ?? `http://localhost:${PORT}`;
const GENISLIK = Number(process.env.GENISLIK ?? 1440);
const YUKSEKLIK = Number(process.env.YUKSEKLIK ?? 900);
/*
  TEK SÜTUN sınırı 860 px (konsol-liste.css): 768'de de liste gizlenip
  detay tam genişlikte açılıyor. Dokunma emülasyonu ayrı bir eşik —
  tablet fareyle de kullanılıyor.
*/
const TEK_SUTUN = GENISLIK <= 860;
const DOKUNMA = GENISLIK < 500;

/*
  Telefonda satırın tıklanan parçası başka: masaüstünde hücredeki
  bağlantı, telefonda tek satırlık özet (MobilSatir). `:visible`
  ikisini de kapsıyor — sabit bir seçici telefonda "element is not
  visible" ile düşüyordu.
*/
const SATIR = ".kl-liste tbody a:visible";

/*
  KONUM TOLERANSI. Satıra tıklandığında tarayıcı odaklanan bağlantıyı
  görüş alanına çekiyor ve konum birkaç on piksel kayabiliyor (tek
  sütunda ölçüldü: 220 → 207). Aranan şey "aynı yere dönmek", piksel
  eşitliği değil; sıfırlanma ise kusur.
*/
const TOLERANS = 48;
const yakin = (a, b) => a !== null && b !== null && Math.abs(a - b) <= TOLERANS;

const kusurlar = [];
const not = (ad, kosul, ayrinti = "") => {
  console.log(`${kosul ? "✓" : "✗"} ${ad}${ayrinti ? "  " + ayrinti : ""}`);
  if (!kosul) kusurlar.push(ad + (ayrinti ? " — " + ayrinti : ""));
};

const tarayici = await chromium.launch({ args: ["--no-sandbox", "--no-proxy-server"] });
const baglam = await tarayici.newContext({
  viewport: { width: GENISLIK, height: YUKSEKLIK },
  deviceScaleFactor: 1,
  isMobile: DOKUNMA,
  hasTouch: DOKUNMA,
});
const sayfa = await baglam.newPage();
sayfa.on("pageerror", (e) => kusurlar.push("sayfa hatası: " + String(e.message).slice(0, 120)));

const konum = () => sayfa.evaluate(() => document.querySelector(".kl-liste-govde")?.scrollTop ?? null);
/*
  Konumu BEKLEYEREK oku. Geri yükleme gezinmeden sonraki ilk
  karelerde çalışıyor; geliştirme sunucusunda derleme gecikince sabit
  bir bekleme bazen erken ölçüyordu ve "220 → 0" diye rastgele
  düşüyordu. En çok 2 sn bekleniyor; süre dolarsa son okunan değer
  olduğu gibi bildiriliyor (gerçek bir gecikme burada görünür).
*/
async function konumBekle(hedef) {
  const bitis = Date.now() + 2000;
  let son = await konum();
  while (Date.now() < bitis && !yakin(son, hedef)) {
    await bekle(100);
    son = await konum();
  }
  return son;
}
const panelBaslik = () => sayfa.evaluate(() => document.querySelector(".kl-panel-bas h2")?.textContent ?? null);
const bekle = (ms = 500) => sayfa.waitForTimeout(ms);

async function ekran({ ad, adres, satirSecici, kapatSecici, tamKartSecici, yeniSuzgecAdresi }) {
  console.log(`\n— ${ad} (${GENISLIK}×${YUKSEKLIK}) —`);
  await sayfa.goto(TABAN + adres, { waitUntil: "networkidle" });
  /*
    HİDRASYONU BEKLE. `networkidle` sunucu HTML'i geldiğinde dönüyor;
    soğuk derlemede istemci paketi saniyeler sonra bağlanıyor ve o
    aralıkta yapılan kaydırma hiç kaydedilmiyordu — betik sırayla
    koşturulunca ilk ekran rastgele düşüyordu. React lifi, bileşenin
    gerçekten bağlandığını söyleyen tek işaret.
  */
  await sayfa.waitForFunction(() => {
    const g = document.querySelector(".kl-liste-govde");
    return Boolean(g) && Object.keys(g).some((k) => k.startsWith("__react"));
  }, null, { timeout: 60_000 });
  /*
    Konum koruyucu HAZIR olana kadar bekle. Bileşen bağlandıktan
    sonra kısa bir yerleşme penceresi var (gezinmeden sonra
    tarayıcının ürettiği 0'ı kaydetmemek için); o pencerede yapılan
    kaydırma saklanmıyor ve ölçüm rastgele düşüyordu.
  */
  await sayfa.waitForSelector('.kl-liste-govde[data-kaydirma="hazir"]', { timeout: 30_000 });

  /*
    2. Listeyi GERÇEK TEKERLEKLE kaydır. `scrollTop = …` atamak
    kaydırma olayı üretiyor ama kullanıcı niyeti üretmiyor; konum
    koruyucu bilerek yalnızca tekerlek/parmak/tuş sonrası kaydediyor
    (gezinme sırasında tarayıcının ürettiği 0'ı yazmamak için).
    Kaydırılamıyorsa akışın kalanı anlamsız.
  */
  const kutu = await sayfa.locator(".kl-liste-govde").boundingBox();
  if (kutu) await sayfa.mouse.move(kutu.x + kutu.width / 2, kutu.y + kutu.height / 2);
  await sayfa.mouse.wheel(0, 220);
  await bekle(400);
  const kaydirildi = await sayfa.evaluate(() => {
    const g = document.querySelector(".kl-liste-govde");
    if (!g || g.scrollHeight <= g.clientHeight + 20) return null;
    return g.scrollTop > 0 ? g.scrollTop : null;
  });
  not("liste kaydırılabiliyor", kaydirildi !== null && kaydirildi > 0, `konum=${kaydirildi}`);
  if (!kaydirildi) return;
  await bekle(300);

  /* 3. GÖRÜNÜR bir kaydı aç: kaydırmadan sonra ekranda duran satır. */
  const satirlar = sayfa.locator(satirSecici);
  const hedef = satirlar.nth(Math.min(3, (await satirlar.count()) - 1));
  const hedefAd = (await hedef.textContent())?.trim().slice(0, 40) ?? "";
  const hedefKimlik = (await hedef.getAttribute("href")) ?? "";
  await hedef.click();
  await sayfa.waitForURL(/secili=/, { timeout: 15_000 });
  await bekle();
  not("kayıt sağ panelde açıldı", Boolean(await panelBaslik()), String(await panelBaslik()).slice(0, 40));
  const acilistaKonum = await konumBekle(kaydirildi);
  if (!TEK_SUTUN) not("kayıt açılınca konum korundu", yakin(acilistaKonum, kaydirildi), `${kaydirildi} → ${acilistaKonum}`);
  not("süzgeç adreste duruyor", sayfa.url().includes(adres.split("?")[1]?.split("&")[0] ?? ""), sayfa.url().split("?")[1] ?? "");

  /* 4. Tam karta geç, tarayıcı GERİ ile dön. */
  if (tamKartSecici && (await sayfa.locator(tamKartSecici).count())) {
    await sayfa.locator(tamKartSecici).first().click();
    await bekle(900);
    const tamKart = sayfa.url();
    await sayfa.goBack({ waitUntil: "networkidle" });
    await bekle(700);
    not("geri tuşu filtreli listeye döndü", sayfa.url().includes("secili="), sayfa.url().split("/panel")[1] ?? "");
    /*
      Tek sütunda kayıt açıkken LİSTE GİZLİ (tek sütun): gizli bir
      kaydırıcının konumu her zaman 0 ve ölçmenin anlamı yok.
      Konum orada kapatma adımında sınanıyor.
    */
    if (!TEK_SUTUN) {
      const geriKonum = await konumBekle(kaydirildi);
      not("geri dönüşte konum korundu", yakin(geriKonum, kaydirildi), `${kaydirildi} → ${geriKonum} (tam kart: ${tamKart.split("/panel")[1]})`);
    } else {
      not("tek sütunda geri dönüşte detay tam genişlikte", Boolean(await panelBaslik()), `tam kart: ${tamKart.split("/panel")[1]}`);
    }
  }

  /* 5. Paneli kapat: seçim düşer, süzgeç ve konum kalır. */
  if (await sayfa.locator(kapatSecici).count()) {
    await sayfa.locator(kapatSecici).first().click();
    await bekle(800);
    not("kapatınca seçim düştü", !sayfa.url().includes("secili="), sayfa.url().split("?")[1] ?? "(süzgeçsiz)");
    const kapanisKonum = await konumBekle(kaydirildi);
    /*
      TEK SÜTUNDA tarayıcı, detaydan dönüşte ODAKLANAN SATIRI görüş
      alanına çekiyor ve konumu kendi belirliyor (768 px'te ölçüldü:
      220 → 78). Bu istenen davranış: kullanıcı baktığı kaydı yerinde
      buluyor. Ölçüt bu yüzden "aynı piksel" değil, "az önce açılan
      kayıt görünür" — sıfırlanma yine kusur.
    */
    const satirGorunur = await sayfa.evaluate((href) => {
      const g = document.querySelector(".kl-liste-govde");
      /* Seçim kapanınca aria-current kalkıyor; az önce TIKLANAN
         satırı adresinden buluyoruz. */
      const s = document.querySelector(`.kl-liste a[href="${href.replace(/"/g, '\\"')}"]`);
      if (!g || !s) return null;
      const gk = g.getBoundingClientRect();
      const sk = s.getBoundingClientRect();
      return sk.bottom > gk.top && sk.top < gk.bottom;
    }, hedefKimlik);
    not(
      "kapatınca aynı yere dönüldü",
      yakin(kapanisKonum, kaydirildi) || satirGorunur === true,
      `${kaydirildi} → ${kapanisKonum}${satirGorunur === true ? " (açılan kayıt görünür)" : ""}`,
    );
  }

  /* Yeni süzgeç: konum TAŞINMAMALI. */
  if (yeniSuzgecAdresi) {
    await sayfa.goto(TABAN + yeniSuzgecAdresi, { waitUntil: "networkidle" });
    await bekle(600);
    const yeniKonum = await konum();
    not("yeni süzgeçte liste baştan başlıyor", yeniKonum === 0, `konum=${yeniKonum}`);
  }
  console.log(`   son görülen kayıt: ${hedefAd}`);
}

await ekran({
  ad: "Müşteriler",
  adres: "/panel/platform/musteriler?tur=kurumsal",
  satirSecici: SATIR,
  kapatSecici: TEK_SUTUN ? ".kl-geri" : ".kl-panel-kapat",
  tamKartSecici: ".kl-panel-eylem a, .kl-panel a.panel-primary",
  yeniSuzgecAdresi: "/panel/platform/musteriler?tur=kurumsal&sira=gelir",
});

await ekran({
  ad: "Ödeme onayları",
  adres: "/panel/platform/payments",
  satirSecici: SATIR,
  kapatSecici: TEK_SUTUN ? ".kl-geri" : ".kl-panel-kapat",
  yeniSuzgecAdresi: "/panel/platform/payments?suzgec=bekleyen",
});

await ekran({
  ad: "Destek",
  adres: "/panel/platform/destek?durum=tumu",
  satirSecici: SATIR,
  kapatSecici: TEK_SUTUN ? ".kl-geri" : ".kl-panel-kapat",
  yeniSuzgecAdresi: "/panel/platform/destek?durum=yanit",
});

await tarayici.close();
console.log(kusurlar.length ? `\n${kusurlar.length} kusur:\n- ` + kusurlar.join("\n- ") : "\nAkış kabulü: kusur yok.");
process.exit(kusurlar.length ? 1 : 0);
