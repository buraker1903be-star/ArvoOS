import assert from "node:assert/strict";
import test from "node:test";
import { eslesmeSirasi, kalemleriCoz, kalemleriOku, proformaGorunumu, proformaToplami } from "@/lib/proforma";
import { kurusOku } from "@/lib/turkish-amount";

/* Platform proforması: kalemler, KDV ve ödeme eşleştirme sırası. */

test("KDV ara toplam üzerinden bir kez hesaplanır, toplam birebir tutar", () => {
  assert.deepEqual(proformaToplami([{ aciklama: "Abonelik", miktar: 1, birim_fiyat: 100_000 }], 20), { araToplam: 100_000, kdv: 20_000, toplam: 120_000 });
  // Satır başına yuvarlansaydı 3 × round(33,335 × 0,2) = 3 × 667 = 2001 olurdu.
  const t = proformaToplami([
    { aciklama: "A", miktar: 1, birim_fiyat: 3_333 },
    { aciklama: "B", miktar: 1, birim_fiyat: 3_333 },
    { aciklama: "C", miktar: 1, birim_fiyat: 3_334 },
  ], 20);
  assert.deepEqual(t, { araToplam: 10_000, kdv: 2_000, toplam: 12_000 });
});

test("kalemler Türkçe tutarla okunur: 1.500 bin beş yüz liradır", () => {
  const k = kalemleriOku([{ aciklama: "Kurum lisansı", miktar: "2", birimFiyat: "1.500" }], (d) => kurusOku(d));
  assert.deepEqual(k, [{ aciklama: "Kurum lisansı", miktar: 2, birim_fiyat: 150_000 }]);
});

test("boş satır atlanır, yarım satır hata verir, hiç kalem yoksa hata", () => {
  const oku = (s: { aciklama: string; miktar: string; birimFiyat: string }[]) => kalemleriOku(s, (d) => kurusOku(d));
  assert.equal(oku([{ aciklama: "X", miktar: "", birimFiyat: "10" }, { aciklama: "", miktar: "", birimFiyat: "" }]).length, 1);
  assert.throws(() => oku([{ aciklama: "X", miktar: "1", birimFiyat: "" }]), /birim fiyat/);
  assert.throws(() => oku([{ aciklama: "", miktar: "1", birimFiyat: "10" }]), /açıklama/);
  assert.throws(() => oku([{ aciklama: "", miktar: "", birimFiyat: "" }]), /En az bir kalem/);
  assert.throws(() => oku([{ aciklama: "X", miktar: "0", birimFiyat: "10" }]), /miktar/);
});

test("bozuk jsonb kalemi gösterimde atlanır", () => {
  assert.deepEqual(kalemleriCoz([{ aciklama: "A", miktar: 1, birim_fiyat: 5 }, { aciklama: 3 }, null]), [{ aciklama: "A", miktar: 1, birim_fiyat: 5 }]);
  assert.deepEqual(kalemleriCoz("x"), []);
});

test("eşleştirmede tutarı tutan ödeme önce, sonra yeniden eskiye", () => {
  const sira = eslesmeSirasi(120_000, [
    { id: "eski-tutan", tutar: 120_000, tarih: "2026-10-01" },
    { id: "yeni-tutmayan", tutar: 119_900, tarih: "2026-10-20" },
    { id: "yeni-tutan", tutar: 120_000, tarih: "2026-10-10" },
  ]);
  assert.deepEqual(sira.map((o) => o.id), ["yeni-tutan", "eski-tutan", "yeni-tutmayan"]);
  assert.deepEqual(sira.map((o) => o.tutarTutuyor), [true, true, false]);
});

test("süresi dolan proforma yalnızca görünümde; ödenen ve iptal olduğu gibi kalır", () => {
  assert.equal(proformaGorunumu("bekliyor", "2026-10-26", "2026-10-27"), "suresi_doldu");
  assert.equal(proformaGorunumu("bekliyor", "2026-10-27", "2026-10-27"), "bekliyor");
  assert.equal(proformaGorunumu("odendi", "2026-10-01", "2026-10-27"), "odendi");
  assert.equal(proformaGorunumu("iptal", "2026-10-01", "2026-10-27"), "iptal");
});
