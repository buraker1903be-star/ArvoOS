import assert from "node:assert/strict";
import test from "node:test";
import { EK_URUN_KODLARI, KARTLA_ODENEBILEN, PRODUCTS } from "../../lib/products";
import { PROFORMA_URUNLERI } from "../../lib/proforma";

/*
  ÜRÜN LİSTESİ ÜÇ YERDE AYRI YAZILIYDI ve biri geride kaldı
  (30.10.2026): ürün kataloğu dört ürün tanımlıyor, proforma tarafı üç
  biliyordu. ArvoARC lisansı olan müşteriye ne elle proforma
  kesilebiliyordu (form seçeneği göstermiyor, sunucu reddediyor) ne de
  otomatik iş dönem sonunda onu kesiyordu — para akışında sessiz bir
  boşluk.

  Bu testler listelerin kataloğa bağlı kalmasını sabitliyor: yeni bir
  ürün eklendiğinde faturalanması unutulamaz.
*/

test("proforma kesilebilen ürünler = ürün kataloğunun tamamı", () => {
  assert.deepEqual([...PROFORMA_URUNLERI].sort(), PRODUCTS.map((u) => u.code).sort());
});

test("ArvoARC proforma kesilebilen ürünler arasında", () => {
  assert.ok(PROFORMA_URUNLERI.includes("arc"), "ArvoARC lisansına proforma kesilebilmeli");
});

/* organization_product_licenses çekirdeği TUTMUYOR: ArvoOS'un
   aboneliği organization_licenses'ta. O tabloyu okuyan sorgu
   çekirdeği istemez, ötekilerin HEPSİNİ ister. */
test("çekirdek dışı ürünler ArvoOS'u dışlıyor, ötekilerin hepsini kapsıyor", () => {
  assert.ok(!EK_URUN_KODLARI.includes("arvoos"));
  assert.deepEqual([...EK_URUN_KODLARI].sort(), PRODUCTS.map((u) => u.code).filter((k) => k !== "arvoos").sort());
});

test("katalog büyüyünce iki liste de büyüyor", () => {
  assert.equal(PROFORMA_URUNLERI.length, PRODUCTS.length);
  assert.equal(EK_URUN_KODLARI.length, PRODUCTS.length - 1);
});

/*
  KART DIŞLAMASI TEK YERDE. Aynı dışlama iki yerde yazılıydı
  (abonelik ekranındaki `product.code !== "arc"` ve kart işleminin
  listesi) ve tesadüfen tutuyordu; biri değişse müşteri "geçerli ürün
  seçilmedi" hatasına düşerdi. Sebebi hiçbir yerde yazmıyordu —
  lib/products'taki not durumu olduğu gibi kaydediyor.
*/
test("kartla ödenebilen ürünler listesi kataloğa bağlı", () => {
  for (const kod of KARTLA_ODENEBILEN) {
    assert.ok(PRODUCTS.some((u) => u.code === kod), `${kod} katalogda yok`);
  }
  /* Bugünün kararı: ArvoARC kartla ödenmiyor, havale/EFT açık. */
  assert.ok(!KARTLA_ODENEBILEN.includes("arc"));
  assert.equal(KARTLA_ODENEBILEN.length, PRODUCTS.length - 1);
});

/*
  VERİTABANI KISITI DA AYNI LİSTE (30.10.2026). caf618a kodu dört ürüne
  açtı ama platform_proformalari_product_check üç ürüne izin veriyordu;
  ArvoARC proforması veritabanında düşüyordu ve hiçbir test bunu
  göremedi. Kısıtın SON tanımı migration'lardan okunup kodla
  karşılaştırılıyor: ürün eklenir de migration yazılmazsa burada düşer.
*/
test("proforma ürün kısıtı (son migration) = PROFORMA_URUNLERI", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const klasor = path.resolve(import.meta.dirname, "../../supabase/migrations");
  const tanimlar = fs.readdirSync(klasor).sort()
    .map((ad) => fs.readFileSync(path.join(klasor, ad), "utf8"))
    .flatMap((metin) => [...metin.matchAll(/platform_proformalari_product_check check \(product = any \(array\[([^\]]*)\]\)\)/g)].map((m) => m[1]));
  assert.ok(tanimlar.length, "kısıt tanımı bulunamadı");
  const son = tanimlar.at(-1)!.split(",").map((s) => s.trim().replace(/'/g, "")).sort();
  assert.deepEqual(son, [...PROFORMA_URUNLERI].sort());
});
