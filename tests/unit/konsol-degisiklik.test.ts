import assert from "node:assert/strict";
import test from "node:test";
import { alanFarki, degisiklikOzeti, konsolKaydiCumlesi } from "@/lib/konsol-degisiklik";

const ALANLAR = {
  license_status: { ad: "Durum", yaz: (v: unknown) => ({ trialing: "Deneme", active: "Aktif", suspended: "Askıda" } as Record<string, string>)[String(v)] ?? String(v) },
  user_limit: { ad: "Kullanıcı limiti" },
  current_period_end: { ad: "Dönem sonu", yaz: (v: unknown) => String(v).slice(0, 10) },
  limits: { ad: "Kotalar" },
};

test("yalnızca değişen alanlar yazılır", () => {
  const fark = alanFarki(
    { license_status: "trialing", user_limit: 10, current_period_end: null },
    { license_status: "active", user_limit: 10, current_period_end: null },
    ALANLAR,
  );
  assert.deepEqual(fark, [{ alan: "license_status", ad: "Durum", once: "Deneme", sonra: "Aktif" }]);
});

test("aynı günü taşıyan iki farklı tarih yazımı değişiklik sayılmaz", () => {
  /* Veritabanı "+00:00", form ".000Z" döndürüyor; ham karşılaştırma her
     kayıtta "dönem sonu değişti" derdi. */
  const fark = alanFarki(
    { current_period_end: "2026-11-30T00:00:00+00:00" },
    { current_period_end: "2026-11-30T00:00:00.000Z" },
    ALANLAR,
  );
  assert.deepEqual(fark, []);
});

test("kota nesnesi anahtar sırasından bağımsız; boş nesne boş sayılır", () => {
  assert.deepEqual(alanFarki({ limits: { a: 1, b: 2 } }, { limits: { b: 2, a: 1 } }, ALANLAR), []);
  assert.deepEqual(alanFarki({ limits: {} }, { limits: null }, ALANLAR), []);
  assert.equal(alanFarki({ limits: { a: 1 } }, { limits: { a: 2 } }, ALANLAR).length, 1);
});

test("yeni satırda yalnızca dolu alanlar; formda olmayan alan atlanır", () => {
  const fark = alanFarki(null, { license_status: "trialing", user_limit: null }, ALANLAR);
  assert.deepEqual(fark.map((d) => [d.alan, d.once, d.sonra]), [["license_status", "—", "Deneme"]]);
});

test("özet dört alandan sonra kalanı sayar", () => {
  const d = ["A", "B", "C", "D", "E", "F"].map((ad) => ({ alan: ad, ad, once: "1", sonra: "2" }));
  assert.equal(degisiklikOzeti(d), "A: 1 → 2 · B: 1 → 2 · C: 1 → 2 · D: 1 → 2 · +2 alan");
});

test("kayıt cümlesi: üyelik, değişiklik ve bilinmeyen tür", () => {
  assert.equal(konsolKaydiCumlesi({ action: "status", entity_type: "organization_membership", metadata: { is_active: false } }).ton, "warning");
  const lisans = konsolKaydiCumlesi({
    action: "update", entity_type: "product_license",
    metadata: { baslik: "ArvoLab lisansı değişti", degisiklikler: [{ alan: "status", ad: "Durum", once: "Aktif", sonra: "Askıda" }] },
  });
  assert.equal(lisans.olay, "ArvoLab lisansı değişti");
  assert.equal(lisans.ayrinti, "Durum: Aktif → Askıda");
  assert.equal(lisans.ton, "warning");
  assert.equal(konsolKaydiCumlesi({ action: "xyz", entity_type: "baska", metadata: null }).olay, "xyz");
});
