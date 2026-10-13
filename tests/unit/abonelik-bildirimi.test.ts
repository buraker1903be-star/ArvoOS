import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { abonelikAnahtari, abonelikBildirimi, abonelikKademesi } from "@/lib/abonelik-bildirimi";

describe("abonelik hatırlatma kademesi", () => {
  test("7, 3, 1, 0 gün kala ve bitişten bir gün sonra; aradaki günler sessiz", () => {
    const bitis = "2026-10-20T20:59:59Z"; // Türkiye'de 20 Ekim 23:59
    assert.equal(abonelikKademesi(bitis, "2026-10-13"), 7);
    assert.equal(abonelikKademesi(bitis, "2026-10-17"), 3);
    assert.equal(abonelikKademesi(bitis, "2026-10-19"), 1);
    assert.equal(abonelikKademesi(bitis, "2026-10-20"), 0);
    assert.equal(abonelikKademesi(bitis, "2026-10-21"), -1);
    for (const gun of ["2026-10-12", "2026-10-14", "2026-10-18", "2026-10-22"]) assert.equal(abonelikKademesi(bitis, gun), null, gun);
  });

  test("bitiş Türkiye gününe göre: UTC'de 21:00 sonrası ertesi gün sayılır", () => {
    // 20 Ekim 22:30 UTC = 21 Ekim 01:30 Türkiye → bitiş günü 21 Ekim.
    assert.equal(abonelikKademesi("2026-10-20T22:30:00Z", "2026-10-20"), 1);
  });
});

describe("abonelik hatırlatma metni", () => {
  const ortak = { urunAdi: "ArvoOS", deneme: false, bitis: "2026-10-20T09:00:00Z", aylikUcret: 150000 };

  test("yarın son gün: ödeme beklenmektedir", () => {
    const b = abonelikBildirimi({ ...ortak, kademe: 1 });
    assert.equal(b.baslik, "Aboneliğiniz yarın son gün");
    assert.match(b.metin, /ArvoOS aboneliğiniz yarın \(20 Ekim\) sona eriyor\. Ödeme yapılması beklenmektedir\./);
    assert.match(b.metin, /Aylık ücret ₺1\.500,00\./);
  });

  test("7 gün kala başlık, deneme süresinde ücret yazılmaz", () => {
    assert.equal(abonelikBildirimi({ ...ortak, kademe: 7 }).baslik, "Aboneliğinizin bitmesine 7 gün kaldı");
    const d = abonelikBildirimi({ ...ortak, deneme: true, kademe: 3 });
    assert.equal(d.baslik, "Deneme sürenizin bitmesine 3 gün kaldı");
    assert.doesNotMatch(d.metin, /Aylık ücret/);
  });

  test("süresi dolunca erişim uyarısı", () => {
    const b = abonelikBildirimi({ ...ortak, kademe: -1 });
    assert.equal(b.baslik, "Aboneliğiniz sona erdi");
    assert.equal(b.ton, "tehlike");
  });

  test("anahtar aynı dönem ve kademe için sabit", () => {
    assert.equal(abonelikAnahtari("k", "arvoos", "2026-10-20T09:00:00Z", 3), "k:arvoos:2026-10-20:3");
  });
});
