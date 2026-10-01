/*
  KURUM İÇİ YORUMLAR KOYU TEMADA DA OKUNUR.

  Blok sabit renklerle yazılmıştı (#fff, rgba(0,43,85,…), rgba(248,250,248,…)):
  açık temada doğru, koyu temada yazma alanı kapkara sayfanın ortasında
  bembeyaz bir kutu oluyordu.

  Sabitleri tokene çevirmek YETMEDİ. --brand-50 ve --brand-700 birer PALET
  BASAMAĞI; panel-tokens.css bunları koyu temada bilerek ezmiyor (yalnız
  --accent-50/100 eziliyor). Dolayısıyla avatar ve "Operasyon" rozeti koyu
  temada açık zemin + koyu lacivert yazı olarak kalıyordu: ölçülen kontrast
  1.4 — tamamen okunmaz.

  İlk ölçüm bunu kaçırdı: betik color-mix'in döndürdüğü "color(srgb 0..1 …)"
  biçimini rgb() gibi 0..255 okuyordu, 0.85 → neredeyse siyah sanılıyordu.
  Ders: ölçüm aracının kendisi de doğrulanmalı.

  Bu test iki kararı sabitliyor:
  - blokta sabit renk yok (hepsi var()/color-mix ile tokenden gelir),
  - rozet renkleri yerel token üzerinden gider ve koyu temada ezilir.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CSS = fs.readFileSync(
  path.join(process.cwd(), "app/panel/crm/request-page.css"),
  "utf8",
);

// Dosyadaki kurum içi yorum kurallarını (seçicisi crm-internal-comment ile
// başlayanlar) gövdeleriyle birlikte toplar.
function yorumKurallari(): { secici: string; govde: string }[] {
  const cikti: { secici: string; govde: string }[] = [];
  const kalip = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = kalip.exec(CSS))) {
    const secici = m[1].trim();
    if (!/\.crm-internal-comment/.test(secici)) continue;
    cikti.push({ secici, govde: m[2] });
  }
  return cikti;
}

describe("kurum içi yorumlar — tema", () => {
  test("blokta sabit renk kalmadı", () => {
    // "white-space" bir renk değil: ad sınırını tire de kapatmalı.
    const sabit =
      /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|\bhsla?\(\s*\d|(?<![-\w])(?:white|black)(?![-\w])/;
    const kirli = yorumKurallari()
      .filter((k) => sabit.test(k.govde.replace(/\/\*[\s\S]*?\*\//g, "")))
      .map((k) => k.secici);
    assert.deepEqual(kirli, [], `sabit renk taşıyan kural: ${kirli.join(" | ")}`);
  });

  test("avatar ve rozet rengi yerel tokenden gelir", () => {
    for (const secici of [
      ".crm-internal-comment-composer-avatar",
      ".crm-internal-comment-meta > span",
    ]) {
      const kural = yorumKurallari().find((k) => k.secici.includes(secici));
      assert.ok(kural, `kural bulunamadı: ${secici}`);
      assert.match(kural!.govde, /background:\s*var\(--ic-rozet-zemin\)/);
      assert.match(kural!.govde, /color:\s*var\(--ic-rozet-yazi\)/);
    }
  });

  test("rozet tokenları koyu temada eziliyor", () => {
    // Palet basamağı koyu temada dönmez; ezilmezse rozet yine beyaz kalır.
    const koyu = yorumKurallari().find((k) =>
      k.secici.startsWith('html[data-theme="dark"]'),
    );
    assert.ok(koyu, "koyu tema ezmesi yok");
    assert.match(koyu!.govde, /--ic-rozet-zemin:/);
    assert.match(koyu!.govde, /--ic-rozet-yazi:/);
    // Ezme, dönmeyen palet basamaklarını TEKRAR kullanmamalı.
    assert.doesNotMatch(koyu!.govde, /--brand-(50|600|700|800|900)\b/);
  });
});
