/*
  MADDEYE NUMARAYLA ATIF YAPAN MADDELER.

  Sözleşme maddeleri birbirine numarayla atıf yapıyor: numarayı
  `no(anahtar)` veriyor ve o da `keys.indexOf(anahtar) + 1`. Anahtar
  etkin sırada yoksa indexOf -1 döner, yani numara SIFIR çıkar. Kurum
  bir maddeyi "Çıkar" ile kaldırdığında ona atıf yapan cümle müşteriye
  giden sözleşmede şöyle yazılıyordu (15.10.2026):

    "Gizli Bilgi: 0. maddede tanımlanan bilgi ve belgeler."
    "…değişikliklerin 0. madde uyarınca bildirileceğini kabul eder."

  Dört madde hem çıkarılabiliyor hem atıf alıyordu: kapsam, gizlilik,
  tebligat, fesih. Artık atıf duruyorken hedef çıkarılamıyor; kural
  MADDE_ATIFLARI tablosunda.

  Bu test KAYNAĞA bakıyor: tablo elle tutuluyor ve bir maddeye yeni bir
  atıf eklendiğinde sessizce eskiyecek tek şey o. Her `no("…")` çağrısı
  ya zorunlu bir maddeyi (zaten çıkarılamaz) ya da tablodaki bir hedefi
  göstermeli.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const kaynak = fs.readFileSync(
  path.join(process.cwd(), "app/_components/legal/contract-clauses.tsx"),
  "utf8",
);

/* İki sabit de KAYNAKTAN okunuyor: tests/unit yalnızca saf modülleri
   içe aktarabiliyor, contract-clauses bir .tsx (AGENTS.md). */
const ZORUNLU_MADDELER: string[] = (() => {
  const m = kaynak.match(/ZORUNLU_MADDELER = \[([^\]]*)\]/);
  assert.ok(m, "ZORUNLU_MADDELER okunamadı");
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
})();

const MADDE_ATIFLARI: Record<string, string[]> = (() => {
  const bas = kaynak.indexOf("export const MADDE_ATIFLARI");
  assert.ok(bas > -1, "MADDE_ATIFLARI okunamadı");
  const govde = kaynak.slice(bas, kaynak.indexOf("};", bas));
  const cikti: Record<string, string[]> = {};
  for (const satir of govde.matchAll(/^\s*([a-z_]+): \[([^\]]*)\],/gm)) {
    cikti[satir[1]] = [...satir[2].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  }
  return cikti;
})();

describe("madde atıfları", () => {
  test("atıf yapılan her madde ya zorunlu ya tabloda", () => {
    const hedefler = [...new Set([...kaynak.matchAll(/\bno\("([a-z_]+)"\)/g)].map((m) => m[1]))];
    assert.ok(hedefler.length >= 7, `atıf taranamadı (${hedefler.length} bulundu)`);
    const korumali = new Set<string>([...ZORUNLU_MADDELER, ...Object.keys(MADDE_ATIFLARI)]);
    const acikta = hedefler.filter((h) => !korumali.has(h));
    assert.deepEqual(
      acikta,
      [],
      `şu maddelere atıf var ama çıkarılmaları engellenmiyor: ${acikta.join(", ")} — `
      + "MADDE_ATIFLARI tablosuna ekleyin, yoksa madde çıkarılınca atıf \"0. madde\" olur",
    );
  });

  test("tabloda yalnızca gerçekten atıf alan maddeler var", () => {
    for (const hedef of Object.keys(MADDE_ATIFLARI)) {
      assert.match(kaynak, new RegExp(`no\\("${hedef}"\\)`), `${hedef} tabloda ama ona atıf yok`);
    }
  });

  test("tablodaki atfeden maddeler gerçekten o atfı yapıyor", () => {
    /* Atfeden maddenin bloğu `key: "<anahtar>"` ile başlıyor; bir
       sonraki `key: "` o bloğun sonu. Atıf o aralıkta geçmeli. */
    const bloklar = new Map<string, string>();
    const yerler = [...kaynak.matchAll(/key: "([a-z_]+)", title:/g)];
    yerler.forEach((m, i) => {
      const bas = m.index ?? 0;
      const son = i + 1 < yerler.length ? yerler[i + 1].index ?? kaynak.length : kaynak.length;
      bloklar.set(m[1], kaynak.slice(bas, son));
    });
    for (const [hedef, atfedenler] of Object.entries(MADDE_ATIFLARI)) {
      for (const atfeden of atfedenler) {
        const blok = bloklar.get(atfeden);
        assert.ok(blok, `${atfeden} maddesi kaynakta yok`);
        assert.ok(
          blok.includes(`no("${hedef}")`),
          `${atfeden} maddesi ${hedef} maddesine atıf yapmıyor; tablo eskimiş`,
        );
      }
    }
  });

  test("zorunlu maddeler tabloda tekrarlanmıyor", () => {
    for (const z of ZORUNLU_MADDELER) {
      assert.ok(!(z in MADDE_ATIFLARI), `${z} zaten zorunlu; tabloda ikinci bir kural gerekmiyor`);
    }
  });
});
