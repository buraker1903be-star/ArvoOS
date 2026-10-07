/*
  OKUNMAMIŞ POSTA ROZETİ MENÜDE GÖRÜNÜR KALMALI.

  Rozetin tek işi hiçbir şey açmadan görünmek. Bu yüzden iki sessiz
  bozulma yolu var ve ikisi de ekranda "hata" gibi durmuyor, yalnızca
  rozet yokmuş gibi duruyor:

   1. Posta girdisi "UYGULAMALAR" penceresine geri taşınırsa. Orada
      başlamıştı; rozet o pencerenin içindeyken görmek için pencereyi
      açmak gerekiyordu, yani rozet hiçbir işe yaramıyordu.
   2. Menü daraltıldığında rozet kaybolursa. Daraltma kuralı
      .panel-nav-group-link b'yi topluca gizliyor (panel-motion.css);
      rozeti geri açan kural ondan DAHA ÖZGÜL olmak zorunda. Aynı
      özgüllükte yazılmış bir sürüm sessizce kaybeder — CSS hata vermez.

  Sayım da burada sabitleniyor: rozetin gösterdiği sayı, rozete basınca
  açılan listeyle aynı olmalı (/panel/posta süzgeçsiz açılıyor).
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const oku = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const NAV = oku("app/panel/panel-navigation.tsx");
const LAYOUT = oku("app/panel/layout.tsx");
const DRAWER = oku("app/panel/mobile-drawer.tsx");
const UX = oku("app/panel/panel-ux.css");
const MOTION = oku("app/panel/panel-motion.css");
const ACTIONS = oku("app/panel/posta/actions.ts");

/* Özgüllük: (kimlik, sınıf+sözde sınıf+öznitelik, eleman). :is() kendi
   içindeki EN ÖZGÜL argümanı kadar sayılır. */
function ozgulluk(secici: string): [number, number, number] {
  let s = secici;
  const isler: string[] = [];
  s = s.replace(/:is\(([^()]*)\)/g, (_, ic: string) => { isler.push(ic); return ""; });
  const say = (metin: string): [number, number, number] => [
    (metin.match(/#[\w-]+/g) ?? []).length,
    (metin.match(/\.[\w-]+/g) ?? []).length + (metin.match(/\[[^\]]+\]/g) ?? []).length
      + (metin.match(/:(?!:)(?!is\b)[\w-]+/g) ?? []).length,
    (metin.match(/(?:^|[\s>+~])([a-z][\w-]*)/g) ?? []).length,
  ];
  const toplam = say(s);
  for (const ic of isler) {
    const en = ic.split(",").map((p) => say(p.trim()))
      .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0] ?? [0, 0, 0];
    for (let i = 0; i < 3; i += 1) toplam[i] += en[i];
  }
  return toplam;
}

const dahaOzgul = (a: [number, number, number], b: [number, number, number]) =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

/* Virgülle bölerken parantez içine girmiyor: ":is(a, b)" tek bir seçici
   parçasıdır, virgülünden bölmek onu kırıntılara çevirir ve karşılaştırma
   gerçek kuralla yapılmaz (bu test ilk yazıldığında tam böyle oldu). */
function parcalar(secici: string): string[] {
  const cikti: string[] = [];
  let derinlik = 0, su = "";
  for (const harf of secici) {
    if (harf === "(") derinlik += 1;
    if (harf === ")") derinlik -= 1;
    if (harf === "," && derinlik === 0) { cikti.push(su.trim()); su = ""; continue; }
    su += harf;
  }
  if (su.trim()) cikti.push(su.trim());
  return cikti;
}

/* Dosyadaki kuralları (seçici + gövde) çıkarır; @media sarmalayıcıları
   özgüllüğü değiştirmediği için düzleştiriliyor. */
function kurallar(css: string): { secici: string; govde: string }[] {
  const temiz = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{/g, "");
  const cikti: { secici: string; govde: string }[] = [];
  const kalip = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = kalip.exec(temiz))) cikti.push({ secici: m[1].trim(), govde: m[2] });
  return cikti;
}

describe("posta okunmamış rozeti", () => {
  test("ölçüm aracı: özgüllük karşılaştırması doğru çalışıyor", () => {
    // Araç yanlışsa aşağıdaki asıl test sessizce her zaman yeşil kalır.
    assert.deepEqual(ozgulluk(".a .b .c"), [0, 3, 0]);
    assert.deepEqual(ozgulluk(".panel-nav-group-link b"), [0, 1, 1]);
    assert.deepEqual(ozgulluk(".x.y :is(.a, .panel-nav-group-link b)"), [0, 3, 1]);
    assert.ok(dahaOzgul([0, 4, 0], [0, 3, 1]), "4 sınıf, 3 sınıf+1 elemanı geçer");
    assert.ok(!dahaOzgul([0, 3, 1], [0, 3, 1]), "eşit özgüllük geçmez");
    assert.deepEqual(parcalar(".a:is(.x, .y) b, .c"), [".a:is(.x, .y) b", ".c"]);
  });

  test("Posta menünün kendi girdisi, uygulamalar penceresinde değil", () => {
    assert.match(NAV, /href="\/panel\/posta"/, "menüde posta bağlantısı olmalı");
    assert.doesNotMatch(
      LAYOUT,
      /digerUygulamalar\s*=\s*\[[\s\S]{0,400}?posta/,
      "posta digerUygulamalar listesine geri konmuş: rozet pencerenin içinde kalır",
    );
  });

  test("daraltılmış menüde rozeti geri açan kural, gizleyen kuraldan özgül", () => {
    const gizleyenler = kurallar(MOTION).concat(kurallar(UX))
      .filter((k) => /\bb\b|panel-nav-rozet/.test(k.secici))
      .filter((k) => /display\s*:\s*none/.test(k.govde))
      .filter((k) => /is-nav-collapsed|panel-nav-group-link/.test(k.secici));
    assert.ok(gizleyenler.length, "rozeti kapsayan bir gizleme kuralı bulunamadı");

    const acan = kurallar(UX).find((k) =>
      k.secici.includes("panel-nav-rozet") && /display\s*:\s*block/.test(k.govde));
    assert.ok(acan, "daraltılmış menüde rozeti açan kural yok");

    for (const gizleyen of gizleyenler) {
      for (const parca of parcalar(gizleyen.secici)) {
        if (!/panel-nav/.test(parca)) continue;
        assert.ok(
          dahaOzgul(ozgulluk(acan!.secici), ozgulluk(parca.trim())),
          `rozet kuralı '${parca.trim()}' karşısında kaybediyor; menü daraltılınca rozet kaybolur`,
        );
      }
    }
  });

  test("sayı 99+ ile sınırlanıyor (dar şeride sığmayan rakam yok)", () => {
    for (const [ad, kaynak] of [["menü", NAV], ["mobil çekmece", DRAWER]] as const) {
      assert.match(kaynak, /okunmamis\s*>\s*99\s*\?\s*"99\+"/, `${ad}: 99+ sınırı yok`);
    }
  });

  test("sayım, rozete basınca açılan listeyle aynı kümeyi sayıyor", () => {
    // İfadenin TAMAMI alınıyor (atamadan noktalı virgüle): sonuna eklenen
    // bir süzgeç, tembel eşleşmede metnin dışında kalıyordu.
    const bas = LAYOUT.indexOf("const postaOkunmamis");
    assert.notEqual(bas, -1, "layout okunmamış konuşmaları saymıyor");
    const sayim = LAYOUT.slice(bas, LAYOUT.indexOf(";", bas) + 1);
    assert.match(sayim, /from\("mail_threads"\)/);
    assert.match(sayim, /\.eq\("okunmamis", true\)/);
    assert.match(sayim, /count:\s*"exact",\s*head:\s*true/, "satırları çekmeden saymalı");
    assert.deepEqual(
      [...sayim.matchAll(/\.eq\("(\w+)"/g)].map((m) => m[1]).sort(),
      ["okunmamis", "organization_id"],
      "sayıma fazladan süzgeç girmiş: /panel/posta süzgeçsiz açılıyor, sayı tutmaz",
    );
  });

  test("okundu yapınca panel kabuğu da yenileniyor", () => {
    // Rozet yerleşimde; yalnızca posta yollarını yenilemek, kişi başka
    // bir modüle geçtiğinde eski sayıyı bırakırdı.
    const govde = ACTIONS.slice(ACTIONS.indexOf("konusmayiOkundu__impl"));
    assert.match(govde, /revalidatePath\("\/panel",\s*"layout"\)/);
  });
});
