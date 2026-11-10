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
