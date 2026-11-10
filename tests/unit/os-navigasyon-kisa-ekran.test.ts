/*
  KISA EKRANDA SOL MENÜ VE YÜKLEME İSKELETİ (10.11.2026, PR #314).

  İkisi de tarayıcıda görülen ama hiçbir denetimin yakalamadığı türden:
    1. Dar menüde ipucu kesilmesin diye menü taşmayı gösteriyordu
       (overflow:visible) ve kısa ekranda (768×600) alttaki modüllere ve
       daraltma düğmesine ulaşılamıyordu. Kural: liste kendi içinde kayar,
       ipucu position:fixed ile kaydırma alanının dışına çizilir.
    2. Yükleme iskeleti ana ekranla aynı ızgara kuralını kullanmalı; iki
       ayrı yerde yazılmış iki kural, yüklenince kartların yer değiştirmesi
       demek.
  Bu test kaynak düzeyindedir; tarayıcıdaki ölçümün yerini tutmaz.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const oku = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const NAV_CSS = oku("app/panel/os/os-navigasyon.css");
const NAV = oku("app/panel/os/os-navigasyon.tsx");
const kural = (css: string, secici: string) => {
  const kurallar = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  return kurallar.filter(([, s]) => s.trim().split(",").map((x) => x.trim()).includes(secici)).map(([, , g]) => g).join(";");
};

test("menü listesi kendi içinde kayar; menü hiçbir genişlikte taşmayı göstermez", () => {
  assert.match(kural(NAV_CSS, ".os-nav-kaydir"), /overflow-y:\s*auto/);
  assert.match(kural(NAV_CSS, ".os-nav"), /overflow-y:\s*auto/, "alt kontroller de sığmazsa menünün tamamı kayabilmeli");
  assert.doesNotMatch(NAV_CSS, /\.os-nav\s*\{[^}]*overflow\s*:\s*visible/, "overflow:visible kısa ekranda alttaki modülleri erişilmez yapıyordu");
  assert.match(NAV, /className="os-nav-kaydir"/);
  // Daraltma düğmesi kaydırma alanının DIŞINDA (altta sabit).
  const kaydirBas = NAV.indexOf('className="os-nav-kaydir"');
  const altBas = NAV.indexOf('className="os-nav-alt"');
  const daralt = NAV.indexOf("os-nav-daralt");
  assert.ok(kaydirBas < altBas && altBas < daralt, "daraltma düğmesi alt bölümde olmalı");
});

test("dar menüde ipucu fixed: kaydırma alanında kesilmez, konumu öğeden gelir", () => {
  const ipuclari = [...NAV_CSS.matchAll(/\.os-nav-ad\s*\{([^}]*)\}/g)].map((m) => m[1]).filter((g) => /--ipucu-y/.test(g));
  assert.equal(ipuclari.length, 2, "hem kullanıcının daralttığı hem 761–1099px'teki zorunlu dar hâl");
  for (const g of ipuclari) assert.match(g, /position:\s*fixed/);
  assert.match(NAV, /setProperty\("--ipucu-y"/);
  // Klavye odağıyla da konumlanır, yalnızca fareyle değil.
  assert.match(NAV, /onFocus=\{ipucuOlayi\}/);
});

test("yükleme iskeleti ana ekranla aynı ızgara kuralını kullanır", () => {
  const izgara = (css: string, secici: string) => kural(css, secici).match(/grid-template-columns:\s*([^;]+)/)?.[1]?.trim();
  const ana = izgara(oku("app/panel/dashboard.css"), ".dash-cols--esnek");
  const iskelet = izgara(oku("app/panel/panel-page-system.css"), ".skel-izgara");
  assert.ok(ana, "ana ekran ızgarası bulunamadı");
  assert.equal(iskelet, ana);
});
