import assert from "node:assert/strict";
import test from "node:test";
import { parseTurkishAmount } from "@/lib/turkish-amount";

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
