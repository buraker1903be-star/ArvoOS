import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MASAUSTU_EN_AZ,
  TELEFON_EN_FAZLA,
  YANMENU_ANAHTARI,
  YANMENU_BETIGI,
  YANMENU_DAR,
  YANMENU_OZNITELIGI,
  darDegeri,
  darMi,
} from "../../lib/konsol/gezinme";

const oku = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("tercih okuma: yalnızca 'dar' dar sayılır", () => {
  assert.equal(darMi(YANMENU_DAR), true);
  /* Kaydı olmayan ya da bozuk değer taşıyan kullanıcı menüyü AÇIK
     görür: menüsüz kalmaktansa geniş başlamak. */
  for (const bozuk of [null, undefined, "", "acik", "DAR", 1, {}]) assert.equal(darMi(bozuk), false);
});

test("tercih yazma: iki değer, tek yazım", () => {
  assert.equal(darDegeri(true), YANMENU_DAR);
  assert.equal(darDegeri(false), "acik");
  assert.equal(darMi(darDegeri(true)), true);
  assert.equal(darMi(darDegeri(false)), false);
});

test("kırılımlar CSS ile aynı sayıları kullanıyor", () => {
  /* CSS değişkeni medya sorgusunda kullanılamıyor; sayı iki yerde
     yazılı ve ayrışırsa tablet görünümü ile tercihin geçerli olduğu
     genişlik birbirini tutmaz. */
  assert.equal(MASAUSTU_EN_AZ, 1200);
  assert.equal(TELEFON_EN_FAZLA, 760);
  const css = oku("app/panel/os/os-yanmenu.css");
  assert.match(css, new RegExp(`min-width:\\s*${MASAUSTU_EN_AZ}px`));
  assert.match(css, new RegExp(`min-width:\\s*${TELEFON_EN_FAZLA + 1}px`));
});

test("ön boyama betiği özniteliği yazıyor ve sekmeler arası eşitliyor", () => {
  /* Betik olmazsa dar tercihli kullanıcı her açılışta menünün
     240 px'ten 64 px'e kaydığını görür. */
  assert.match(YANMENU_BETIGI, new RegExp(YANMENU_ANAHTARI.replace(/\./g, "\\.")));
  assert.match(YANMENU_BETIGI, new RegExp(YANMENU_OZNITELIGI));
  assert.match(YANMENU_BETIGI, /"storage"/);
  const yerlesim = oku("app/layout.tsx");
  assert.match(yerlesim, /YANMENU_BETIGI/, "kök yerleşim ön boyama betiğini gömmüyor");
});

test("dar görünüm kuralları yalnızca masaüstü sorgusunun içinde", () => {
  /*
    Tablet zaten ray; tercihi orada uygulamak bir şeyi değiştirmez ama
    kuralın masaüstü sorgusunun DIŞINA yazılması telefonda alt çubuğun
    yanında bir de menü çizerdi.
  */
  const css = oku("app/panel/os/os-yanmenu.css");
  const bloklar = css.split("@media");
  for (const blok of bloklar.slice(1)) {
    if (!blok.includes(`[${YANMENU_OZNITELIGI}=`)) continue;
    assert.match(blok.split("{")[0], new RegExp(`min-width:\\s*${MASAUSTU_EN_AZ}px`),
      "dar tercih kuralı masaüstü sorgusunun dışında");
  }
  assert.ok(css.includes(`html[${YANMENU_OZNITELIGI}="${YANMENU_DAR}"]`), "dar tercih kuralı hiç yok");
});

test("sol menünün birincil sırası onaylı mockup'takiyle aynı", () => {
  /* Sıra yerleşimde yazılı; mockup: Ana Sayfa · Ürünler · Müşteriler ·
     Finans · Destek · Otomasyonlar. Uygulamalar ikincil bölümde.
     Otomasyonlar 26.11.2026'da eklendi: arka planda koşan işlerin
     durumu Ana Sayfa'da özet, burada tam liste. */
  const yerlesim = oku("app/panel/layout.tsx");
  assert.match(yerlesim, /yanMenuSirasi=\{\["home", "urunler", "musteriler", "finans", "destek", "otomasyonlar"\]\}/);
});

test("Ürünler modülünün ikinci katı yok, adı tek kelime", () => {
  /*
    27.11.2026: modülün adı "Ürünler ve Fiyatlar", ikinci katının ilk
    girdisi yine "Ürünler"di — menü "Ürünler → Ürünler" diye okunuyor
    ve o tık hiçbir yere götürmüyordu. İkinci katın öteki girdisi
    (Fiyatlar) ürünün kendi "Fiyat basamakları" bölümüne taşındı, yani
    modülün tek hedefi kaldı.

    Menüde kısa/uzun ad ayrımı da bitti; ayrımın KENDİSİ hâlâ
    kullanılıyor (başka modüller için), onu ayrı bir test tutuyor.
  */
  const apps = oku("app/panel/os/konsol-apps.ts");
  const kayit = apps.slice(apps.indexOf('key: "urunler"'), apps.indexOf('key: "otomasyonlar"'));
  assert.match(kayit, /label: "Ürünler"/);
  /* Etiketin kendisine bakılıyor, kayıttaki YORUMA değil: gerekçe
     eski adı anlatmak için onu yazıyor. */
  assert.doesNotMatch(kayit, /label: "Ürünler ve Fiyatlar"/);
  assert.doesNotMatch(kayit, /bolumler:/);
  /* /panel/platform/fiyatlar hâlâ bu modüle düşmeli: ek hizmet
     fiyatları o adreste ve sol menüde Ürünler etkin kalmalı. */
  assert.match(kayit, /"\/panel\/platform\/fiyatlar"/);
});

test("kısa etiket düzeneği duruyor", () => {
  /* Ürünler artık kullanmıyor ama kural menünün kendisinde: dar
     menüde kisaEtiket, başlatıcıda tam ad. */
  const nav = oku("app/panel/os/os-navigasyon.tsx");
  assert.match(nav, /u\.kisaEtiket \?\? u\.label/);
});

test("sol menüde 'Uygulamalar' vurgusu PENCEREYE bağlı, rotaya değil", () => {
  /*
    26.11.2026 inceleme bulgusu: ürün detayında "Ürünler" ile
    "Uygulamalar" aynı anda seçili görünüyordu. Dock'ta kural doğru
    (orada yalnızca ilk dört giriş var, etkin uygulama dışarıda
    kalabiliyor); sol menüde beş birincil giriş olduğu için aynı kural
    iki vurgu demekti. Düğme bir sayfa değil pencere açıyor.
  */
  const tsx = oku("app/panel/os/os-navigasyon.tsx");
  const yan = tsx.slice(tsx.indexOf("function YanMenu"));
  /* Düğme is-active ALMIYOR: o sınıf etkin SAYFAYI işaretliyor ve
     ikisi aynı görünürse "hangi sayfadayım" okunmuyor. Pencere durumu
     aria-expanded'da, görünümü de ondan geliyor (os-yanmenu.css). */
  assert.match(yan, /aria-expanded=\{pencereAcik\}/);
  assert.doesNotMatch(yan, /pencereAcik \? "os-yan-oge is-active"/);
  assert.doesNotMatch(yan, /panelEtkin/);
  const css = oku("app/panel/os/os-yanmenu.css");
  assert.match(css, /\.os-yan-alt \.os-yan-oge\[aria-expanded="true"\]/);
  /* Durumun sıfırlanması: close(), Esc ve zemine tıklama aynı olayı
     veriyor, pencerenin kendisi dinliyor. Dinleyici düşerse düğme
     pencere kapandıktan sonra da vurgulu kalır. */
  assert.match(tsx, /onClose=\{\(\) => \{ setPencereAcik\(false\); setPanelModul\(null\); \}\}/);
  /* Dock DEĞİŞMEDİ: telefonun alt çubuğu rotaya bakmaya devam ediyor. */
  assert.match(tsx, /className=\{panelEtkin \? "os-dock-oge is-active"/);
});

test("ürün detayı içerik genişliğini kullanıyor: ızgara ve sağ sütun yok", () => {
  /*
    26.11.2026 inceleme bulgusu: ızgaranın tek çocuğu (ürün kartı)
    iki sütunluk bir şablonun birinci sütununda kalıyordu —
    768×600'de sağda 296 px boşluk, 1440×900'de kartın sağ kenarı
    dönem seçicisinden 350 px geride, metrikler alt alta. Kural o gün
    ızgarayı tek sütuna sabitleyerek düzeltildi.

    27.11.2026'da (onaylı mockup) sayfa ızgarayı tamamen bıraktı: tek
    sütun, sağ rayı yok. Aynı özelliğin daha sağlam hâli — bir sonraki
    "iki sütun" denemesi ızgarayı geri getirmek zorunda kalır ve bu
    test onu görür.
  */
  const sayfa = oku("app/panel/platform/urunler/[urun]/page.tsx");
  assert.match(sayfa, /<main className="plt urun-detay-sayfa">/);
  assert.doesNotMatch(sayfa, /className="[^"]*talep-izgara/);
  assert.doesNotMatch(sayfa, /className="[^"]*personel-iki/);
  assert.doesNotMatch(sayfa, /className="liste-sag"/);
  const css = oku("app/panel/platform/urunler/[urun]/urun-detay.css");
  assert.match(css, /\.urun-detay-sayfa \{ display: flex; flex-direction: column;/);
});

test("üst çubukta RESMÎ marka dosyaları kullanılıyor", () => {
  /*
    26.11.2026 inceleme bulgusu: dar menüde kırık görsel simgesi vardı ve
    menüdeki işaret resmî dosya değildi (public/brand/yonetim.svg, motifin
    iki çemberle çizilmiş yaklaşığı).

    Marka aynı gün onaylanan mockup'la sol menüden ÜST ÇUBUĞA taşındı:
    çubuk ekran boyunca kesintisiz ve marka bir kez görünüyor. Geniş
    ekranda resmî KELİME LOGOSU, telefonda resmî İŞARET duruyor.
  */
  const marka = oku("app/panel/os/arvoos-markasi.tsx");
  assert.match(marka, /\/brand\/arvoos-320\.png/);
  assert.match(marka, /\/brand\/arvoos-on-dark-320\.png/);
  assert.match(marka, /\/brand\/arvoos-simge-68\.png/);
  assert.match(marka, /\/brand\/arvoos-simge-on-dark-68\.png/);
  /* Yorumda geçiyor (neden değiştiğini anlatıyor); kullanımda geçmemeli. */
  assert.doesNotMatch(marka, /src="[^"]*yonetim\.svg/);

  const tsx = oku("app/panel/os/os-navigasyon.tsx");
  assert.doesNotMatch(tsx, /marka="yonetim"|kod: "yonetim"/);
  /* Telefonun üst çubuğundaki "◇" karakteri de kalktı. */
  assert.doesNotMatch(oku("app/panel/layout.tsx"), /aria-hidden="true">◇/);

  /*
    Hangi biçimin görüneceğine CSS karar veriyor; JS ile seçmek menü
    daraltılırken bir kare yanlış logo demek.
  */
  const css = oku("app/panel/os/os-yanmenu.css");
  /* Telefonda kelime logosu yerine işaret; 761 px'ten sonra tersi. */
  assert.match(css, /\.os-konsol \.os-konsol-logo \{ display: none; \}/);
  assert.match(css, /\.os-konsol \.os-konsol-logo \{ display: block; \}/);
  assert.match(css, /\.os-konsol \.os-brand-isaret \{ display: none; \}/);
  /* Marka BİR kez görünsün: sol menüde ikinci bir marka bloğu kalmadı. */
  assert.doesNotMatch(oku("app/panel/os/os-navigasyon.tsx"), /os-yan-marka/);
});

test("üç menü durumu üç farklı işaret taşıyor", () => {
  /*
    26.11.2026 inceleme bulgusu: açık temada üzerine gelinen "Destek",
    seçili "Genel Bakış" kadar baskın görünüyordu — iki zemin neredeyse
    aynı açıklıkta (#f9fafb / #eef1f6) ve hover yazısı daha koyuydu.
    Etkin girdi artık zemin + sol çubuk + kalın yazı taşıyor; üzerine
    gelme yalnızca nötr bir yıkama, odak ise halka.
  */
  const css = oku("app/panel/os/os-yanmenu.css");
  assert.match(css, /--os-yan-vurgu: color-mix/);
  assert.match(css, /--os-yan-etkin: color-mix/);
  assert.match(css, /\.os-yan-oge\.is-active::before/);
  assert.match(css, /\.os-yan-oge:focus-visible,[\s\S]{0,80}outline: 2px solid var\(--primary\)/);
  /* Üzerine gelme artık --surface-2 kullanmıyor: etkin zeminle aynı
     açıklıktaydı. */
  assert.doesNotMatch(css.slice(css.indexOf(".os-konsol .os-yan-oge:hover")), /^[\s\S]{0,200}--surface-2/);
});

test("Genel Bakış: dönem seçici başlık satırında, kartlar içerik boyunda", () => {
  /*
    26.11.2026 inceleme bulgusu: ürün tablosunun son satırı ile
    "Ürünler" bağlantısı arasında, boş "Öncelikli işler" ile "Bugünün
    işleri" arasında kartın payından artan boşluk kalıyordu. Kartlar
    kalan yüksekliği 3:2 bölüşüyor ve bağlantı margin-top:auto ile
    kartın dibine itiliyordu.
  */
  const sayfa = oku("app/panel/konsol-ana-sayfa.tsx");
  assert.match(sayfa, /eylem=\{<DonemSecici/);
  assert.doesNotMatch(sayfa, /konsol-arac/);

  const css = oku("app/panel/konsol-urun-performansi.css");
  assert.match(css, /\.konsol-genel>\.dash-card\{[^}]*flex:0 1 auto/);
  assert.match(css, /\.konsol-genel \.dash-card-link\{flex:none;margin-top:0\}/);
  assert.doesNotMatch(css, /flex:3 3 0|flex:2 2 0/);
  /* Geniş masaüstünde yan yana; eşik üç menü durumu için ayrı yazılı. */
  assert.match(css, /@media \(min-width:1328px\)\{[\s\S]{0,120}flex-direction:row/);
  assert.match(css, /html\[data-konsol-menu="dar"\] \.konsol-genel\{flex-direction:row/);
});

test("bağlamlı gezinme: rota → modül + alt bölüm", async () => {
  /*
    26.11.2026 ürün kararı: ana navigasyon etkin MODÜLÜ, sayfa içindeki
    navigasyon etkin ALT BÖLÜMÜ gösterir ve ikisi de URL'den çözülür.
    URL'den çözüldüğü için doğrudan giriş, yenileme ve geri/ileri aynı
    sonucu verir — durum bellekte tutulmuyor.
  */
  const { konsolUygulamalari } = await import("../../app/panel/os/konsol-apps");
  const { etkinUygulama } = await import("../../app/panel/os/os-apps");
  const { etkinBolum } = await import("../../app/panel/os/os-bolumler");
  const uygulamalar = konsolUygulamalari();

  const coz = (yol: string) => {
    const u = etkinUygulama(uygulamalar, yol);
    const b = u?.bolumler?.length ? etkinBolum(u.bolumler, yol, "") : null;
    return [u?.key, b?.key];
  };

  /* Brifteki akış: Ürünler → ArvoLab → Abonelikler → ürün listesine dönüş. */
  /* Ürünler'in ikinci katı yok (27.11.2026): alt bölüm undefined.
     Ürün içi bölümler İÇERİKTE, sol menüde değil. */
  assert.deepEqual(coz("/panel/platform/urunler"), ["urunler", undefined]);
  assert.deepEqual(coz("/panel/platform/urunler/arvolab"), ["urunler", undefined]);
  assert.deepEqual(coz("/panel/platform/fiyatlar"), ["urunler", undefined]);
  assert.deepEqual(coz("/panel/platform/billing"), ["finans", "abonelikler"]);
  assert.deepEqual(coz("/panel/platform/urunler"), ["urunler", undefined]);

  /* Finans'ta alt bölüm geçişi. */
  assert.deepEqual(coz("/panel/platform/tahsilat"), ["finans", "tahsilatlar"]);
  assert.deepEqual(coz("/panel/platform/payments"), ["finans", "odemeler"]);

  /* Öteki modüller. */
  assert.deepEqual(coz("/panel/platform/musteriler"), ["musteriler", "musteriler"]);
  assert.deepEqual(coz("/panel/platform/saglik"), ["sistem", "saglik"]);
  assert.deepEqual(coz("/panel"), ["home", undefined]);

  /* Ürün detayında SOL menüde yalnızca "Ürünler" sayfa vurgusu taşır:
     etkin uygulama tek ve "Uygulamalar" düğmesi sayfa değil pencere. */
  const etkin = etkinUygulama(uygulamalar, "/panel/platform/urunler/arvolab");
  assert.equal(etkin?.key, "urunler");
  assert.equal(uygulamalar.filter((u) => etkinUygulama(uygulamalar, "/panel/platform/urunler/arvolab")?.key === u.key).length, 1);
});

test("iki katlı menü: geri dönüş düğme, bölümler bağlantı", () => {
  /*
    26.11.2026, onaylı mockup: modüle girince ana listenin yeri o
    modülün bölümlerine bırakılıyor. İki kural kodda yapısal:

    - "Ana menüye dön" bir DÜĞME. Bağlantı olsaydı tıklamak adresi
      değiştirir, açık sayfayı, süzgeçleri ve tarayıcı geçmişini
      kaybettirirdi — oysa yapılan iş yalnızca menüyü değiştirmek.
    - Bölümler BAĞLANTI: adres paylaşılabilsin, geri/ileri çalışsın.
      Seçim bileşenin durumunda tutulsaydı yenileme modülün girişine
      düşerdi (aynı hata ürün sekmelerinde bir kez yaşandı).
  */
  const tsx = oku("app/panel/os/os-navigasyon.tsx");
  const yan = tsx.slice(tsx.indexOf("function YanMenu"));
  assert.match(yan, /<button[\s\S]{0,200}className="os-yan-geri"/);
  assert.match(yan, /Ana menüye dön/);
  /* Bölüm satırı Link; alt kat bloğunda <button> ile çizilmiyor. */
  const altKat = yan.slice(yan.indexOf('className="os-yan-kat"'), yan.indexOf(") : ("));
  assert.match(altKat, /bolumler\.map/);
  assert.doesNotMatch(altKat.slice(altKat.indexOf("bolumler.map")), /<button/);

  /*
    Sol menünün ikinci katı yalnızca 240 px'lik panelde: rayda yalnızca
    ikon çiziliyor ve bölümlerin ikonu yok. Rayda aynı iş çekmecede
    (Uygulamalar penceresi).
  */
  assert.match(yan, /const genis = masaustu && !dar;/);
  /* Konsolda içerik üstü şerit HİÇ çizilmiyor (26.11.2026): aynı
     bağlantılar gezinmenin ikinci katında — geniş menüde alt menüde,
     rayda ve telefonda Uygulamalar penceresinde. Kiracı panelinde
     şerit duruyor, orada ikinci kat yok. */
  const yerlesim = oku("app/panel/layout.tsx");
  assert.equal((yerlesim.match(/<OsBolumMenusu/g) ?? []).length, 1);
  assert.match(yerlesim.slice(yerlesim.indexOf("konsolUygulamalariListesi")), /KONSOLDA İÇERİK ÜSTÜ BÖLÜM ŞERİDİ YOK/);
});

test("üst çubuk 56 px ve komut paleti ortada", () => {
  /* Onaylı mockup: konsolda çubuk kiracı panelinden ince (60 → 56) ve
     arama kutusu 500×36. Ortalama mutlak konumla: sol marka ile sağdaki
     düğmelerin genişliği eşit olmadığı için akışta ortalanmıyordu. */
  const css = oku("app/panel/os/os-yanmenu.css");
  assert.match(css, /\.panel-root\.os-root\.os-konsol \{ --os-bar-h: 56px; \}/);
  assert.match(css, /\.os-konsol \.os-search \{ height: 36px; max-width: 500px; \}/);
  assert.match(css, /\.os-konsol \.os-search \{[\s\S]{0,200}translate: -50% 0;/);
});

test("pencere de iki katlı: ray ve telefon bölümleri oradan açar", () => {
  /*
    26.11.2026, inceleme talebi. 64 px'lik rayda ve telefonda ikinci
    kat sol menüye sığmıyor (ad gizli, bölümlerin ikonu yok); o işi
    Uygulamalar penceresi üstleniyor.

    İki kural kodda yapısal:
    - Rayda bölümü olan modül satırı BAĞLANTI DEĞİL DÜĞME. Bağlantı
      olsaydı erişilebilirlik ağacı "sayfaya gider" derdi, oysa menü
      açılıyor. Modülün giriş adresi zaten bölümlerin ilki.
    - Penceredeki "Ana menüye dön" ile "Kapat" AYRI: biri bir üst
      kata çıkar, öteki pencereyi kapatır.
  */
  const tsx = oku("app/panel/os/os-navigasyon.tsx");
  assert.match(tsx, /if \(altiVar && !genis\) \{/);
  const ray = tsx.slice(tsx.indexOf("if (altiVar && !genis) {"), tsx.indexOf("</li>", tsx.indexOf("if (altiVar && !genis) {")));
  assert.match(ray, /<button/);
  assert.match(ray, /aria-haspopup="dialog"/);
  assert.match(ray, /onClick=\{\(\) => ac\(u\.key\)\}/);

  /* Pencerenin başlığında iki ayrı denetim. */
  assert.match(tsx, /className="os-uygulamalar-geri"[\s\S]{0,200}Ana menüye dön/);
  assert.match(tsx, /aria-label="Kapat" onClick=\{kapat\}/);
  /* Geri bir üst kata çıkar, pencereyi KAPATMAZ. */
  assert.match(tsx, /const anaMenuyeDon = \(\) => \{[\s\S]{0,120}setPanelModul\(null\);/);
  assert.doesNotMatch(tsx.slice(tsx.indexOf("const anaMenuyeDon"), tsx.indexOf("useEffect", tsx.indexOf("const anaMenuyeDon"))), /kapat\(\)/);
});

test("'Yeniden deneniyor' kaynağı kodda deneme kuyruğu", () => {
  /*
    26.11.2026 inceleme bulgusu: etiket köprünün kopuk olmasından ve
    cron'un periyodikliğinden çıkarılıyordu. Artık tek kaynağı
    paytr_otomatik_yenileme'nin deneme sayacı; ana sayfa da onu
    sayarak okuyor (head count — sınırlı listeden türetilmiyor).
  */
  const kural = oku("lib/konsol/otomasyonlar.ts");
  assert.match(kural, /baglanti_kesildi: \{ etiket: "Bağlantı kesildi"/);
  /* Köprü kopuk dalı artık "yeniden" yazmıyor. */
  const esitleme = kural.slice(kural.indexOf('if (kopruler.some((k) => k.kopuk))'));
  assert.match(esitleme.slice(0, 300), /"baglanti_kesildi"/);

  const sayfa = oku("app/panel/konsol-ana-sayfa.tsx");
  assert.match(sayfa, /paytr_otomatik_yenileme[\s\S]{0,160}count: "exact", head: true/);
  assert.match(sayfa, /lt\("deneme_sayisi", AZAMI_DENEME\)/);
});

test("ölçüm düzeneği otomasyon satırlarını kuraldan üretiyor", () => {
  /*
    27.11.2026 inceleme bulgusu: düzenekte üç satır SABİT metin ve
    sabit etiketle duruyordu. Kural değişince (köprü kopuk →
    "Yeniden deneniyor" yerine "Bağlantı kesildi") fixture eski
    hâlinde kaldı ve düzenek, üretimin üretemeyeceği bir durumu
    çizdi. Fixture artık yalnızca GİRDİ veriyor; etiketi kural
    yazıyor, yani düzenek üretimden sapamaz.
  */
  const duzenek = oku("scripts/genel-bakis-yerlesim-tarayici.mjs");
  assert.match(duzenek, /const OTOMASYONLAR = otomasyonlar\(cronDurumlari\(/);
  assert.match(duzenek, /import \{ otomasyonlar \} from/);
  /* Elle yazılmış etiket kalmadı. */
  assert.doesNotMatch(duzenek, /etiket: "Yeniden deneniyor"/);
  assert.doesNotMatch(duzenek, /etiket: "Tamamlandı"/);
  assert.match(duzenek, /OTOMASYON_SENARYO === "kuyruk"/);

  /*
    27.11.2026, ikinci bulgu: iki ayrı fixture aynı dünyayı anlatıp
    ÇELİŞİYORDU. Ürün tablosu ArvoCal'i "Sorunlu" gösterirken otomasyon
    kartına verilen köprü listesi "hepsi sağlıklı" diyor ve
    "Veri senkronizasyonu · Tamamlandı" çıkıyordu — üretimde olamayacak
    bir hâl. Köprü durumu artık ürün sağlığından TÜRETİLİYOR; elle
    yazılmış köprü listesi kalmadı.
  */
  assert.match(duzenek, /const KOPRULER = URUN_SAGLIK\.slice\(1\)\.map\(/);
  assert.doesNotMatch(duzenek, /KOPRULER = OTOMASYON_SENARYO/);
});

test("konsol kontrol ailesi ArvoLab'ın os5 ölçülerinde", () => {
  /*
    27.11.2026, Tur 2 · madde 4. İki aile aynı ölçekte yan yana
    çizilip ÖLÇÜLDÜ (scripts/bilesen-karsilastirma.mjs) ve iki sapma
    çıktı: kontrol yarıçapı 10 px (ArvoLab 4) ve kontrol yazısı 13 px
    (ArvoLab 14). Dosyanın kendi notu "düşük yarıçap" diyordu — not
    ile değer ayrışmıştı.

    Kaynak: ArvoLab c7a6b92 · app/styles/os5-tokens.css
      --os5-kontrol-h: 40px · --os5-kontrol-r: 4px · --os5-kontrol-dolgu: 12px
    ArvoLab deposu CI'da yok, o yüzden değerler burada sabitleniyor.
  */
  const css = oku("app/panel/konsol-bilesen.css");
  assert.match(css, /--kb-r:4px/);
  assert.match(css, /--kb-h:40px/);
  assert.match(css, /--kb-dolgu:12px/);
  /* Kontrol yazısı 14 px (--fs-base); 13 px (--fs-sm) ArvoLab'dan küçüktü. */
  assert.doesNotMatch(css, /font-size:var\(--fs-sm\)/);
  assert.match(css, /font-size:var\(--fs-base\)/);
});
