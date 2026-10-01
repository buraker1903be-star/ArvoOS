/*
  İŞ DETAYINDA ALAN DENETİMLERİNİN TEK KAYNAĞI.

  Bu dosyada aynı hataya iki kez düşüldü ve ikisi de sessizdi:

  1) ".opd-step-meta select" ile ".opd-ff select" özgüllükte eşit
     (0,1,1). Bağlam kuralını tabandan ÖNCE yazınca taban kazandı;
     yazılan daraltma hiç uygulanmadı.
  2) Ön ek ekleyip (".opd-step .opd-step-meta select") özgüllüğü
     yükseltince bu sefer ters yönde kırıldı: telefonda taban 38px'e
     çıkarken görev satırı 30px'te kaldı — yirmi kez dokunulan asıl
     hedef.

  İkisi de geçerli CSS'ti, linter sessizdi, fark ancak tarayıcıda
  ölçünce edildi. Karar: denetimlerin ÖLÇÜSÜNÜ tek bir kural yazar,
  bağlamlar yalnızca --ff-* değişkenini değiştirir. Değişken kalıtımla
  çözülür, özgüllük yarışı olmaz.

  Bu test o kararı sabitliyor. Genel bir "eşit özgüllükte gölgeleme"
  denetimi de denendi ama panel genelinde 2704 bulgu üretti ve
  neredeyse hepsi yanlış pozitifti (".dash-widget small" ile
  ".dash-bar small" asla aynı öğeye uymaz); gürültülü denetim
  kapatılır, yoktan beter olur.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CSS = fs.readFileSync(
  path.resolve(import.meta.dirname, "../../app/panel/operations/[id]/detail.css"),
  "utf8",
);

/** Yorumları atıp "seçici{gövde}" çiftlerine ayırır. */
function kurallar(css: string): { sec: string; govde: string }[] {
  const temiz = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { sec: string; govde: string }[] = [];
  for (const [, sec, govde] of temiz.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ sec: sec.trim().replace(/\s+/g, " "), govde: govde.trim() });
  }
  return out;
}

const OLCU = ["height", "font-size", "padding"];
const hepsi = kurallar(CSS);

describe("iş detayı: alan denetimleri tek kaynakta", () => {
  test("ölçüyü yalnızca .opd-ff taban kuralı yazıyor", () => {
    const yazanlar = hepsi.filter(
      (k) =>
        /(^|,)\s*\.opd-ff\s+(select|input)/.test(k.sec) &&
        OLCU.some((p) => new RegExp(`(^|;)\\s*${p}\\s*:`).test(k.govde)),
    );
    assert.equal(
      yazanlar.length,
      1,
      `Ölçü yazan .opd-ff kuralı tek olmalı, ${yazanlar.length} bulundu:\n` +
        yazanlar.map((k) => "  " + k.sec).join("\n"),
    );
    // Ve değerleri değişkenden okumalı: sabit yazarsa bağlamlar değiştiremez.
    for (const p of OLCU) {
      assert.match(yazanlar[0].govde, new RegExp(`${p}\\s*:[^;]*var\\(--ff-`),
        `.opd-ff taban kuralında "${p}" değişkenden okunmalı.`);
    }
  });

  test("bağlamlar kural değil değişken yazıyor", () => {
    /*
      Görev satırı ve telefon kırılımı denetimleri küçültüp büyütüyor.
      Bunu doğrudan height/font-size yazarak yaparlarsa tabanla
      özgüllük yarışına girerler — hatanın kaynağı buydu.
    */
    // Yalnızca DENETİMLERİ hedefleyen kurallar; kabın kendi dolgusu
    // (.opd-step-meta{padding:…}) yerleşim işi, ölçü işi değil.
    const baglamlar = hepsi.filter((k) => /\.opd-step-meta\b[^,{]*\b(select|input)\b/.test(k.sec));
    for (const k of baglamlar) {
      for (const p of OLCU) {
        assert.doesNotMatch(
          k.govde,
          new RegExp(`(^|;)\\s*${p}\\s*:`),
          `"${k.sec}" doğrudan ${p} yazıyor; --ff-* değişkenini değiştirmeli.`,
        );
      }
    }
    // Ve bağlam ölçüyü gerçekten değişkenle ayarlıyor olmalı; yoksa bu
    // test "hiç kural yok" durumunda da geçerdi.
    const kap = hepsi.filter((k) => /(^|,)\s*\.opd-step-meta\s*(,|$)/.test(k.sec));
    assert.ok(
      kap.some((k) => /--ff-(boy|yazi|dolgu|aralik)\s*:/.test(k.govde)),
      "Görev satırı bağlamı --ff-* değişkenlerini değiştirmeli.",
    );
  });

  test("değişkenlerin tabanı .opd üzerinde tanımlı", () => {
    const kok = hepsi.find((k) => k.sec === ".opd" && /--ff-boy\s*:/.test(k.govde));
    assert.ok(kok, "--ff-* varsayılanları .opd üzerinde tanımlanmalı (kalıtımla çözülsün).");
    for (const ad of ["--ff-boy", "--ff-dolgu", "--ff-yazi", "--ff-aralik"]) {
      assert.match(kok!.govde, new RegExp(`${ad}\\s*:`), `${ad} varsayılanı eksik.`);
    }
  });

  test("anında kaydet düğmesini hiçbir kural göstermiyor", () => {
    /*
      Üçüncü bir özgüllük kazası: ".opd-step .opd-step-meta button"
      kuralı (0,2,1) ".opd .aninda-kaydet{display:none}" kuralını
      (0,2,0) eziyordu ve canlıda her alanın yanında "Kaydet"
      görünüyordu. O ölü kural silindi.

      Doğru kural "button'a display yazmayın" değil — ".opd-step
      button{display:flex}" meşru, görev satırının kendi düğmesi.
      Doğru kural: düğmeyi gizleyen seçici, ona uyan HER display
      kuralından daha özgül olmalı.
    */
    const ozgulluk = (sec: string): number => {
      const temiz = sec.replace(/::?[a-z-]+(\([^)]*\))?/g, "");
      const sinif = (temiz.match(/\.[\w-]+/g) ?? []).length + (temiz.match(/\[[^\]]+\]/g) ?? []).length;
      const tur = (temiz.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
      return sinif * 100 + tur;
    };
    const gizle = hepsi.find((k) => /\.opd\s+\.aninda-kaydet/.test(k.sec) && /display\s*:\s*none/.test(k.govde));
    assert.ok(gizle, "Gizleme kuralı '.opd .aninda-kaydet' ön ekiyle yazılmalı.");
    /*
      Kuralın iki seçicisi var: ".opd .aninda-kaydet" (panel içi, 0,2,0)
      ve yedek ".aninda-kaydet" (0,1,0). Rakipler .opd içindeki görev
      satırında yaşıyor, yani karşılaştırılacak olan .opd'li olan.
    */
    const gucu = Math.max(
      ...gizle!.sec.split(",").filter((x) => /\.opd\s+\.aninda-kaydet/.test(x)).map(ozgulluk),
    );

    // Görev satırındaki bir <button>'a uyabilecek, display yazan kurallar.
    const rakipler = hepsi.filter(
      (k) => /button/.test(k.sec) && /(^|;)\s*display\s*:/.test(k.govde) && !/aninda-kaydet/.test(k.sec),
    );
    const ezenler = rakipler.filter((k) => Math.max(...k.sec.split(",").map(ozgulluk)) >= gucu);
    assert.deepEqual(
      ezenler.map((k) => k.sec),
      [],
      "Bu kural(lar) 'Kaydet' gizlemesinden daha özgül; düğme canlıda görünür.",
    );
  });
});
