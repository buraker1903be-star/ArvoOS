import assert from "node:assert/strict";
import test from "node:test";
import { kurusOku, liraYazisi, parseTurkishAmount } from "@/lib/turkish-amount";

test("bin ayırıcılı tutar tam okunur", () => {
  // Gerileme: "1.500" eskiden virgül/nokta dönüşümü yüzünden 1,5 oluyordu.
  assert.equal(parseTurkishAmount("1.500"), 1500);
  assert.equal(parseTurkishAmount("1.500,00"), 1500);
  assert.equal(parseTurkishAmount("12.345.678"), 12345678);
});

test("ondalık virgül", () => {
  assert.equal(parseTurkishAmount("1500,5"), 1500.5);
  assert.equal(parseTurkishAmount("0,75"), 0.75);
});

test("para birimi ve boşluklar yok sayılır", () => {
  assert.equal(parseTurkishAmount("₺ 1.500,00"), 1500);
  assert.equal(parseTurkishAmount("1.500 TL"), 1500);
  assert.equal(parseTurkishAmount(" 250 "), 250);
});

test("ayırıcısız sayı ve nokta ondalığı", () => {
  assert.equal(parseTurkishAmount("1500"), 1500);
  // Üçlü gruplama kalıbına uymayan nokta ondalık sayılır.
  assert.equal(parseTurkishAmount("1500.5"), 1500.5);
});

test("form alanındaki tutar kuruşa çevrilir", () => {
  /*
    Gerileme: form işlemleri `Math.round(Number(formData.get("amount")) * 100)`
    yazıyordu ve Türkçe yazılmış tutarı BİNDE BİRE indiriyordu. 15.10.2026'da
    cari hesabın tahsilat kutusunda ölçüldü (Chrome, tr-TR,
    input type="number"): kutuya 5.000 yazılınca value "5.000", valueAsNumber
    5, checkValidity() true — ekranda beş bin, kütükte ₺5,00.
  */
  assert.equal(kurusOku("5.000"), 500_000, "beş bin lira 500.000 kuruştur");
  assert.equal(kurusOku("5000"), 500_000);
  assert.equal(kurusOku("5.000,50"), 500_050);
  assert.equal(kurusOku("5000.50"), 500_050, "nokta ondalığı da okunur (type=number'ın kendi biçimi)");
  assert.equal(kurusOku("5,00"), 500, "beş lira beş liradır");
  assert.equal(kurusOku("₺ 1.500,00"), 150_000);

  // Boş alan eski davranışı korur: sıfır, hata değil.
  assert.equal(kurusOku(""), 0);
  assert.equal(kurusOku(null), 0);
  assert.equal(kurusOku(undefined), 0);
  assert.equal(kurusOku("   "), 0);

  // Geçersiz metin NaN döner; çağıranlar Number.isFinite ile eliyor.
  assert.equal(Number.isNaN(kurusOku("elma")), true);
});

test("kutuya yazılan tutar Türkçe, gidip gelince değişmiyor", () => {
  /*
    Para kutuları metin (inputMode="decimal"); varsayılan değer de Türkçe
    yazılmalı. Eskiden `(amount / 100).toFixed(2)` yazılıyordu: kutuda
    "30000.00" görünüyordu — kullanıcının kendi yazımı değil.
  */
  assert.equal(liraYazisi(3_000_000), "30.000,00");
  assert.equal(liraYazisi(500), "5,00");
  assert.equal(liraYazisi(0), "0,00");
  assert.equal(liraYazisi(123_456_789), "1.234.567,89");

  // Kutuya yazılanı sunucu aynı tutar olarak geri okumalı.
  for (const kurus of [500, 3_000_000, 123_456_789, 99, 100_050]) {
    assert.equal(kurusOku(liraYazisi(kurus)), kurus, `${kurus} kuruş gidip gelince değişti`);
  }
});
