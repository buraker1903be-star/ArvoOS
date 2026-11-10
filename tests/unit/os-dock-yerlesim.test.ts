/*
  ETİKETLİ DOCK VE BÖLÜM MENÜSÜ — KAYNAK DÜZEYİ KURALLAR (10.11.2026).

  Bu test tarayıcıdaki ölçümün yerini TUTMAZ (görsel davranışın kanıtı
  değildir); yalnızca kararlaştırılmış kuralların koddan sessizce
  çıkmasını yakalar:
    - bölümler yatay kayan bir şeritte değil (eski os-bolum-serit);
    - dock'ta ad sürekli görünür (yalnızca fareyle değil);
    - sabit yükseklikli sayfalar bölüm menüsünün yüksekliğini hesaba katar;
    - yükleme iskeleti ana ekranla aynı ızgara kuralını kullanır.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const oku = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const NAV_CSS = oku("app/panel/os/os-navigasyon.css");
const kural = (css: string, secici: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, s]) => s.trim().split(",").map((x) => x.trim()).includes(secici)).map(([, , g]) => g).join(";");

test("bölüm listesi satır sarar; hiçbir yerde yatay kaydırma yok", () => {
  assert.match(kural(NAV_CSS, ".os-bolumler-liste"), /flex-wrap:\s*wrap/);
  assert.doesNotMatch(NAV_CSS, /overflow-x:\s*(auto|scroll)/, "navigasyon CSS'inde yatay kaydırma olmamalı");
  assert.ok(!fs.existsSync(path.join(process.cwd(), "app/panel/os/os-bolum-seridi.tsx")), "eski yatay şerit geri gelmiş");
});

test("dock'ta modül adı sürekli görünür (ipucu değil)", () => {
  const ad = kural(NAV_CSS, ".os-dock-ad");
  assert.doesNotMatch(ad, /opacity:\s*0|display:\s*none|position:\s*absolute/);
});

test("sabit yükseklikli sayfalar üst çubuk + bölüm menüsü yüksekliğini kullanır", () => {
  for (const dosya of ["app/panel/os-shell.css", "app/panel/crm/kayit-detay/kayit-detay.css", "app/panel/analitik/analitik.css", "app/panel/settings/settings.css"]) {
    const css = oku(dosya);
    assert.doesNotMatch(css, /height:calc\(100dvh - var\(--os-bar-h\)/, `${dosya}: bölüm menüsü hesaba katılmıyor`);
  }
  assert.match(NAV_CSS, /--os-ust-h:\s*calc\(var\(--os-bar-h\)\s*\+\s*var\(--os-bolum-h/);
});

test("yükleme iskeleti ana ekranla aynı ızgara kuralını kullanır", () => {
  const izgara = (css: string, secici: string) => kural(css, secici).match(/grid-template-columns:\s*([^;]+)/)?.[1]?.trim();
  const ana = izgara(oku("app/panel/dashboard.css"), ".dash-cols--sabit");
  assert.ok(ana);
  assert.equal(izgara(oku("app/panel/panel-page-system.css"), ".skel-izgara"), ana);
});

/*
  FX-01/02/03 (10.11.2026, gerçek oturum kabulü 1363×936). Geometrinin kanıtı
  scripts/genel-bakis-yerlesim-tarayici.mjs'teki tarayıcı ölçümüdür; bunlar
  yalnızca kararın koddan sessizce geri dönmesini yakalar.
*/
test("FX-01: kurulum adımları ana ekranda değil pencerede; ilerleme hesabı aynı kaynaktan", () => {
  const sayfa = oku("app/panel/page.tsx");
  assert.match(sayfa, /<KurulumOzeti[\s\S]*?devamHref=/);
  assert.doesNotMatch(sayfa, /className="dash-card dash-setup"/, "adım listesi yeniden ana ekran kartına dönmüş");
  assert.match(sayfa, /kurulumIlerlemesi|ilerleme\.zorunlu/);
  const ozet = oku("app/panel/os/kurulum-ozeti.tsx");
  assert.match(ozet, /<dialog[\s\S]*?onClose=\{\(\) => dugme\.current\?\.focus\(\)\}/, "pencere kapanınca odak düğmeye dönmeli");
});

test("FX-02/03: liste kartları satırı EŞİT doldurmaz; kısa ekranda görünüm seçici yüksekliğe de bakar", () => {
  const css = oku("app/panel/dashboard.css");
  assert.match(kural(css, ".dash-cols--sabit"), /align-items:\s*start/, "kartlar satır yüksekliğine gerilirse boş kart 533 px'e döner");
  assert.match(css, /@media \(max-width:900px\), \(max-height:640px\)/, "görünüm seçici yalnızca genişliğe bakıyor");
  assert.match(kural(css, ".dash-sabit .dash-bars"), /height:\s*clamp\(/, "grafik yüksekliği sınırsız");
  const iskelet = oku("app/panel/panel-page-system.css");
  assert.match(iskelet, /@media \(max-width:900px\), \(max-height:640px\)/, "iskelet ana ekranla aynı kırılımda değil");
});

/*
  Operasyon genel bakışı (10.11.2026): sayfa uzayıp dış kaydırma çıkıyordu,
  çünkü sabit düzene (dash-sabit) hiç geçmemişti. Ürün kuralı burada: aynı
  satırdaki kartların üst ve alt kenarları hizalı (dash-esit). Geometrinin
  kanıtı scripts/genel-bakis-yerlesim-tarayici.mjs; bu test kararın koddan
  sessizce geri dönmesini yakalar.
*/
test("Operasyon genel bakışı sabit düzende, kartlar eşit yükseklikte, iskelet aynı şekilde", () => {
  const sayfa = oku("app/panel/operations/page.tsx");
  assert.match(sayfa, /sinif="dash-sabit dash-esit"/);
  assert.match(sayfa, /<GorunumSecici/);
  assert.doesNotMatch(sayfa, /<ListeIzgarasi/, "eski akış düzeni geri gelmiş");
  const css = oku("app/panel/dashboard.css");
  const esit = kural(css, ".dash-esit .dash-cols.dash-cols--sabit");
  assert.match(esit, /align-items:\s*stretch/);
  assert.match(esit, /grid-auto-flow:\s*column/, "dört kart tek satırda değil (auto-fit 3+1'e bölüyordu)");
  const iskelet = oku("app/panel/panel-page-system.css");
  assert.match(kural(iskelet, ".skel-genel--esit .skel-izgara"), /align-items:\s*stretch/);
  assert.match(oku("app/panel/panel-iskeleti.tsx"), /\/panel\/operations/);
});
