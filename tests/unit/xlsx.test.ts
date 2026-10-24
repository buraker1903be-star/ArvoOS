/*
  EXCEL YAZICISI.

  Bu testler çıktının "bir şey ürettiğini" değil, ÜRETİLEN DOSYANIN
  AÇILABİLİR olduğunu sınıyor: ZIP geri açılıyor, içindeki XML
  okunuyor. Excel bozuk bir dosyada hata mesajı vermiyor, "onarılamadı"
  deyip kapanıyor — yani yanlışı ancak kullanıcı görür.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { xlsxUret, xmlKacis, sutunHarfi, sekmeAdi, crc32, type Sayfa } from "@/lib/xlsx";

/** Üretilen ZIP'i yerel başlıklarından okuyup {ad: metin} döndürür. */
function zipAc(veri: Buffer): Record<string, string> {
  const dosyalar: Record<string, string> = {};
  let i = 0;
  while (i + 30 <= veri.length && veri.readUInt32LE(i) === 0x04034b50) {
    const sikistirilmisBoy = veri.readUInt32LE(i + 18);
    const adBoyu = veri.readUInt16LE(i + 26);
    const ekBoy = veri.readUInt16LE(i + 28);
    const ad = veri.subarray(i + 30, i + 30 + adBoyu).toString("utf8");
    const govdeBas = i + 30 + adBoyu + ekBoy;
    const govde = veri.subarray(govdeBas, govdeBas + sikistirilmisBoy);
    dosyalar[ad] = inflateRawSync(govde).toString("utf8");
    i = govdeBas + sikistirilmisBoy;
  }
  return dosyalar;
}

const ORNEK: Sayfa[] = [{
  ad: "Satışlar",
  sutunlar: [
    { baslik: "Müşteri", bicim: "metin" },
    { baslik: "Tutar", bicim: "para" },
    { baslik: "Marj", bicim: "yuzde" },
  ],
  satirlar: [
    ["Ayşe Yılmaz & Ortağı", 19000, 0.62],
    ["<script>", 0, null],
  ],
}];

test("üretilen dosya geçerli bir ZIP ve gerekli parçaları taşıyor", () => {
  const veri = xlsxUret(ORNEK);
  assert.equal(veri.readUInt32LE(0), 0x04034b50, "ZIP imzası");
  const icerik = zipAc(veri);
  /* Bu beşi olmadan Excel dosyayı açmıyor. */
  for (const parca of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) {
    assert.ok(icerik[parca], `eksik parça: ${parca}`);
  }
});

test("SAYI SAYI OLARAK yazılıyor, metin değil", () => {
  /*
    Yönetici sütunu seçip toplayabilmeli. Sayıyı metin olarak
    yazmak (ya da "19.000,00 ₺" gibi işaret gömmek) hücreyi metne
    çevirir ve toplam alınamaz.
  */
  const sayfa = zipAc(xlsxUret(ORNEK))["xl/worksheets/sheet1.xml"];
  assert.match(sayfa, /<c r="B2" s="2"><v>19000<\/v><\/c>/, "para hücresi sayı olmalı");
  assert.match(sayfa, /<c r="C2" s="3"><v>0.62<\/v><\/c>/, "yüzde hücresi sayı olmalı");
  /* Tutar hücresi metin OLMAMALI. Önceki hâli `.*` ile satırları
     aşıp sonraki satırdaki inlineStr'i yakalıyordu — testin kendisi
     yanlıştı, ürün değil. */
  assert.doesNotMatch(sayfa, /<c r="B2"[^>]*t="inlineStr"/);
});

test("XML KAÇIŞI: tek bir & dosyayı açılamaz yapar", () => {
  const sayfa = zipAc(xlsxUret(ORNEK))["xl/worksheets/sheet1.xml"];
  assert.match(sayfa, /Ayşe Yılmaz &amp; Ortağı/);
  assert.match(sayfa, /&lt;script&gt;/);
  assert.doesNotMatch(sayfa, /<t[^>]*><script>/);
});

test("boş hücre hiç yazılmıyor", () => {
  /* Boş bir <c> Excel'de "0" gibi görünebiliyor; hücre atlanınca
     gerçekten boş kalıyor. */
  const sayfa = zipAc(xlsxUret(ORNEK))["xl/worksheets/sheet1.xml"];
  assert.doesNotMatch(sayfa, /r="C3"/);
});

test("denetim karakteri ayıklanıyor", () => {
  /* XML 1.0'da yasak; kullanıcı notlarından gelebiliyor ve Excel
     dosyayı "onarılamadı" diye kapatıyor. */
  assert.equal(xmlKacis("a\u0001b"), "ab");
  assert.equal(xmlKacis("satır\nsonu"), "satır\nsonu", "yeni satır korunmalı");
});

test("SEKME ADI Excel'in kuralına uyuyor", () => {
  /* 31 karakter sınırı ve : \ / ? * [ ] yasak; uymayan ad dosyayı
     açılamaz yapıyor. */
  assert.equal(sekmeAdi("Tahsilat/Alacak"), "Tahsilat Alacak");
  assert.equal(sekmeAdi("x".repeat(40)).length, 31);
  assert.equal(sekmeAdi("   "), "Sayfa");
});

test("aynı sekme adı iki kez geçemez", () => {
  /* Çakışan ad dosyayı açılamaz yapıyor; kırpma sonrası çakışma
     olabiliyor. */
  const icerik = zipAc(xlsxUret([
    { ad: "Rapor", sutunlar: [{ baslik: "A" }], satirlar: [["1"]] },
    { ad: "Rapor", sutunlar: [{ baslik: "A" }], satirlar: [["2"]] },
  ]));
  const workbook = icerik["xl/workbook.xml"];
  assert.match(workbook, /name="Rapor"/);
  assert.match(workbook, /name="Rapor \(2\)"/);
});

test("sütun harfi 26'dan sonra da doğru", () => {
  assert.equal(sutunHarfi(0), "A");
  assert.equal(sutunHarfi(25), "Z");
  assert.equal(sutunHarfi(26), "AA");
  assert.equal(sutunHarfi(51), "AZ");
  assert.equal(sutunHarfi(52), "BA");
});

test("CRC32 bilinen değeri veriyor", () => {
  /* ZIP girişleri CRC ister; yanlış CRC'de dosya bozuk sayılır. */
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("sayfa yoksa hata veriyor", () => {
  assert.throws(() => xlsxUret([]), /En az bir sayfa/);
});
