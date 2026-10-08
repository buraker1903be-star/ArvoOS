import assert from "node:assert/strict";
import test from "node:test";
import { tekrarsizNot } from "@/lib/talep-notu";

/*
  08.10.2026: web sitesinden gelen talepte kapsam metni "Notlar" altında
  bir kez daha görünüyordu.
*/

const kapsam = "Merhabalar\n\nBiz fren kaliperleri üreten bir firmayız.\n\nİyi Çalışmalar";

test("kapsamı içeren nottan tekrar çıkar, kendi satırları kalır", () => {
  const not = `Kaynak: app.akademikmerkez.com — Teklif Al formu\nHizmet: ANSYS Analiz Danışmanlığı\n\n${kapsam}`;
  assert.equal(tekrarsizNot(not, kapsam), "Kaynak: app.akademikmerkez.com — Teklif Al formu\nHizmet: ANSYS Analiz Danışmanlığı");
});

test("boşluk farkı (satır sonu, çoklu boşluk) eşleşmeyi bozmaz", () => {
  const not = "Kaynak: site\n\nMerhabalar   Biz fren kaliperleri üreten\nbir firmayız. İyi Çalışmalar";
  assert.equal(tekrarsizNot(not, kapsam), "Kaynak: site");
});

test("not yalnızca kapsamsa hiç gösterilmez", () => {
  assert.equal(tekrarsizNot(kapsam, kapsam), null);
});

test("kapsamı içermeyen not ve boş kapsam olduğu gibi kalır", () => {
  assert.equal(tekrarsizNot("Müşteri cuma arayacak.", kapsam), "Müşteri cuma arayacak.");
  assert.equal(tekrarsizNot("Not (parantez) [köşeli]", ""), "Not (parantez) [köşeli]");
  assert.equal(tekrarsizNot(null, kapsam), null);
});
