import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { eskiKopyalar } from "@/lib/kopya-denetimi";

const A = "org-a";
const B = "org-b";
const konsol = (organization_id: string, product: string, status: string) => ({ organization_id, product, status });
const harita = (girisler: [string, string][]) =>
  new Map(girisler.map(([id, status]) => [id, { status }]));

describe("eski kopya denetimi", () => {
  test("kopya konsolla aynı erişimi veriyorsa listeye girmez", () => {
    const sonuc = eskiKopyalar(
      [konsol(A, "arvolab", "active")],
      { arvolab: harita([[A, "active"]]) },
    );
    assert.deepEqual(sonuc, []);
  });

  /*
    "trialing" ile "active" ayrı adlar ama ikisi de kapıyı açıyor. Bunu
    fark saymak, denemeden aktife geçen her kurumu listeye sokardı ve
    liste sürekli dolu kalırdı — sürekli dolu liste okunmaz.
  */
  test("ad farklı ama ikisi de kapıyı açıyorsa fark sayılmaz", () => {
    const sonuc = eskiKopyalar(
      [konsol(A, "arvolab", "active")],
      { arvolab: harita([[A, "trialing"]]) },
    );
    assert.deepEqual(sonuc, []);
  });

  test("ödeyen müşteri kopyada kapalıysa listelenir", () => {
    const sonuc = eskiKopyalar(
      [konsol(A, "arvolab", "active")],
      { arvolab: harita([[A, "canceled"]]) },
    );
    assert.deepEqual(sonuc, [{ organizationId: A, product: "arvolab", kopyaDurumu: "canceled", konsolDurumu: "active" }]);
  });

  /*
    Tehlikeli yön: konsol kapattı ama kopya hâlâ açık — müşteri artık
    ödemediği ürünü kullanmaya devam ediyor.
  */
  test("konsolda kapalı ürün kopyada açıksa listelenir", () => {
    const sonuc = eskiKopyalar(
      [konsol(A, "arc", "canceled")],
      { arc: harita([[A, "active"]]) },
    );
    assert.equal(sonuc.length, 1);
    assert.equal(sonuc[0].kopyaDurumu, "active");
  });

  test("kopyada satır hiç yoksa 'yok' olarak listelenir", () => {
    const sonuc = eskiKopyalar(
      [konsol(A, "randevu", "active")],
      { randevu: harita([]) },
    );
    assert.equal(sonuc[0].kopyaDurumu, "yok");
  });

  /*
    Okunamayan ürün atlanıyor: köprü anahtarı olmayan ortamda bütün
    kiracılar listeye düşer ve uyarı süse dönerdi.
  */
  test("okunamayan ürün hiç değerlendirilmez", () => {
    const sonuc = eskiKopyalar(
      [konsol(A, "arvolab", "active"), konsol(B, "arc", "active")],
      { arvolab: null, arc: harita([[B, "active"]]) },
    );
    assert.deepEqual(sonuc, []);
  });

  test("konsolda kapalı, kopyada da yoksa fark sayılmaz", () => {
    const sonuc = eskiKopyalar(
      [konsol(A, "arc", "inactive")],
      { arc: harita([]) },
    );
    assert.deepEqual(sonuc, []);
  });
});
