import assert from "node:assert/strict";
import test from "node:test";
import { duyuruAlicilari, duyuruDogrula } from "@/lib/platform-duyuru";

/* Konsoldan kurumlara duyuru (lib/platform-duyuru.ts, 02.11.2026). */

const kiracilar = [
  { id: "arvo", kind: "internal", license_status: "active" },
  { id: "salon", kind: "customer", license_status: "active" },
  { id: "eski", kind: "customer", license_status: "canceled" },
  { id: "lab", kind: "customer", license_status: null },
];
const lisanslar = [
  { organization_id: "lab", product: "arvolab", status: "trialing" },
  { organization_id: "eski", product: "arvolab", status: "canceled" },
  { organization_id: "arvo", product: "arvolab", status: "active" },
];

test("Arvo'nun kendi kurumu hiçbir hedefte yok", () => {
  assert.deepEqual(duyuruAlicilari(kiracilar, lisanslar, "tum"), ["salon", "eski", "lab"]);
  assert.ok(!duyuruAlicilari(kiracilar, lisanslar, "arvolab").includes("arvo"));
});

test("ürün hedefinde yalnızca lisansı açık kurumlar", () => {
  assert.deepEqual(duyuruAlicilari(kiracilar, lisanslar, "arvolab"), ["lab"]);
  // ArvoOS'un çekirdek lisansı kiracı kaydında.
  assert.deepEqual(duyuruAlicilari(kiracilar, lisanslar, "arvoos"), ["salon"]);
  assert.deepEqual(duyuruAlicilari(kiracilar, lisanslar, "arc"), []);
});

test("girdi denetimi", () => {
  assert.deepEqual(duyuruDogrula({ baslik: " Bakım ", metin: "Gece 02:00'de bakım var.", baglanti: "", hedef: "tum" }),
    { baslik: "Bakım", metin: "Gece 02:00'de bakım var.", baglanti: null, hedef: "tum" });
  assert.equal(duyuruDogrula({ baslik: "Yeni", metin: "Kılavuz eklendi", baglanti: "/panel/kilavuz", hedef: "arvoos" }).baglanti, "/panel/kilavuz");
  assert.throws(() => duyuruDogrula({ baslik: "x", metin: "metin", baglanti: "", hedef: "tum" }), /Başlık/);
  assert.throws(() => duyuruDogrula({ baslik: "Başlık", metin: "metin", baglanti: "", hedef: "hepsi" }), /Hedef/);
  // Dış adres ve protokol-göreli adres kabul edilmez.
  assert.throws(() => duyuruDogrula({ baslik: "Başlık", metin: "metin", baglanti: "https://kotu.example", hedef: "tum" }), /panel içinde/);
  assert.throws(() => duyuruDogrula({ baslik: "Başlık", metin: "metin", baglanti: "//kotu.example", hedef: "tum" }), /panel içinde/);
});
