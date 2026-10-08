import assert from "node:assert/strict";
import test from "node:test";
import { musteriMesajGondereni } from "@/lib/musteri-mesaji";

/*
  08.10.2026: ana ekrandaki "Müşteri mesajları" kartında her satır
  "Müşteri" yazıyordu. Portal sender_name'e düz "Müşteri" yazıyor; ad
  işin müşteri kaydından gelmeli.
*/

test("müşteri adı, portalın yazdığı genel 'Müşteri'nin önüne geçer", () => {
  assert.equal(musteriMesajGondereni("Ayşe Yılmaz", "Müşteri"), "Ayşe Yılmaz");
});

test("müşteri adı yoksa genel olmayan gönderen adı kullanılır", () => {
  assert.equal(musteriMesajGondereni(null, "Mehmet Kaya"), "Mehmet Kaya");
  assert.equal(musteriMesajGondereni("  ", "Mehmet Kaya"), "Mehmet Kaya");
});

test("ikisi de yoksa ya da gönderen genelse 'Müşteri'", () => {
  assert.equal(musteriMesajGondereni(null, "Müşteri"), "Müşteri");
  assert.equal(musteriMesajGondereni(undefined, "MÜŞTERİ"), "Müşteri");
  assert.equal(musteriMesajGondereni(null, null), "Müşteri");
});
