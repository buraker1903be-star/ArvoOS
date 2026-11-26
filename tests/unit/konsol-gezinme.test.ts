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
  /* Sıra yerleşimde yazılı; mockup: Genel Bakış · Ürünler · Müşteriler
     · Finans · Destek. Uygulamalar ikincil bölümde. */
  const yerlesim = oku("app/panel/layout.tsx");
  assert.match(yerlesim, /yanMenuSirasi=\{\["home", "urunler", "musteriler", "finans", "destek"\]\}/);
});

test("Ürünler menüde kısa adıyla, başlatıcıda tam adıyla", () => {
  /* Menüde yer dar; "Ürünler ve Fiyatlar" Ctrl+K'da ve başlatıcıda
     aynen kalmalı, iki ad tek kayıttan gelmeli. */
  const apps = oku("app/panel/os/konsol-apps.ts");
  assert.match(apps, /label: "Ürünler ve Fiyatlar", kisaEtiket: "Ürünler"/);
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
  assert.match(yan, /className=\{pencereAcik \? "os-yan-oge is-active"/);
  assert.doesNotMatch(yan, /panelEtkin/);
  /* Durumun sıfırlanması: close(), Esc ve zemine tıklama aynı olayı
     veriyor, pencerenin kendisi dinliyor. Dinleyici düşerse düğme
     pencere kapandıktan sonra da vurgulu kalır. */
  assert.match(tsx, /onClose=\{\(\) => setPencereAcik\(false\)\}/);
  /* Dock DEĞİŞMEDİ: telefonun alt çubuğu rotaya bakmaya devam ediyor. */
  assert.match(tsx, /className=\{panelEtkin \? "os-dock-oge is-active"/);
});

test("ürün detayı ızgarası tek sütun: kart içerik genişliğini kullanıyor", () => {
  /*
    26.11.2026 inceleme bulgusu: ızgaranın tek çocuğu (ürün kartı)
    iki sütunluk bir şablonun birinci sütununda kalıyordu —
    768×600'de sağda 296 px boşluk, 1440×900'de kartın sağ kenarı
    dönem seçicisinden 350 px geride, metrikler alt alta.
  */
  const sayfa = oku("app/panel/platform/urunler/[urun]/page.tsx");
  assert.match(sayfa, /className="talep-izgara ekip-izgara"/);
  /* personel-iki iki sütun kuruyor (kayit-detay.css); burada ikinci
     sütun yok. ekip-izgara ise kalmalı: kartın kendi içinde kayması
     ona bağlı. */
  assert.doesNotMatch(sayfa, /className="[^"]*personel-iki/);
  const css = oku("app/panel/platform/urunler/[urun]/urun-detay.css");
  assert.match(css, /main\.urun-sayfa>\.talep-izgara\{grid-template-columns:minmax\(0,1fr\)\}/);
});
