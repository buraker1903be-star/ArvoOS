import assert from "node:assert/strict";
import test from "node:test";
import { ayAraligi, aylikRapor, degisimYuzdesi, type RaporKurumu } from "@/lib/aylik-musteri-raporu";

/* Aylık müşteri raporu (lib/aylik-musteri-raporu.ts, 02.11.2026). */

const AY = "2026-10-01";
const kurum = (id: string, ek: Partial<RaporKurumu> = {}): RaporKurumu => ({
  id, ad: id, kind: "customer", grup_markasi: false, created_at: "2026-01-10T10:00:00Z",
  license_status: "active", current_period_end: "2026-12-01", trial_ends_at: null, ...ek,
});

test("ay aralığı ayın son gününü bulur", () => {
  assert.deepEqual(ayAraligi("2026-02-01"), ["2026-02-01", "2026-02-28"]);
  assert.deepEqual(ayAraligi("2028-02-01"), ["2028-02-01", "2028-02-29"]);
});

test("yeni müşteri Türkiye gününe göre; Arvo ve grup markası müşteri değil", () => {
  const r = aylikRapor(AY, [
    kurum("yeni", { created_at: "2026-10-05T10:00:00Z" }),
    // UTC'de 30 Eylül 22:00 = Türkiye'de 1 Ekim 01:00: Ekim'e düşer.
    kurum("gece", { created_at: "2026-09-30T22:00:00Z" }),
    kurum("eylul", { created_at: "2026-09-20T10:00:00Z" }),
    kurum("arvo", { created_at: "2026-10-05T10:00:00Z", kind: "internal" }),
    kurum("grup", { created_at: "2026-10-05T10:00:00Z", grup_markasi: true }),
  ], [], []);
  assert.deepEqual(r.yeniKurumlar.map((k) => k.id), ["yeni", "gece"]);
});

test("kayıp: açık lisansı kalmamış ve son dönemi bu ay bitmiş", () => {
  const r = aylikRapor(AY, [
    kurum("giden", { license_status: "canceled", current_period_end: "2026-10-15" }),
    // Çekirdek kapalı ama ek ürünü açık: kayıp değil.
    kurum("ekli", { license_status: "canceled", current_period_end: "2026-10-15" }),
    // Dönemi bu ay bitti ama hâlâ açık (ödemesi gecikmiş): kayıp değil.
    kurum("gecikmis", { license_status: "past_due", current_period_end: "2026-10-10" }),
    // Eylül'de bitmiş: Ekim'in kaybı değil.
    kurum("eski", { license_status: "canceled", current_period_end: "2026-09-10" }),
    // Denemesi bu ay bitip dönmeyen.
    kurum("deneme", { license_status: "suspended", current_period_end: null, trial_ends_at: "2026-10-20T09:00:00Z" }),
  ], [
    { organization_id: "ekli", product: "randevu", status: "active", current_period_end: "2026-11-15", trial_ends_at: null, created_at: "2026-01-10T10:00:00Z" },
    // Kurumun en son biten lisansı (28 Ekim) kaybın tarihi.
    { organization_id: "giden", product: "arvolab", status: "canceled", current_period_end: "2026-10-28", trial_ends_at: null, created_at: "2026-01-10T10:00:00Z" },
  ], []);
  assert.deepEqual(r.kaybedilenKurumlar.map((k) => [k.id, k.bitis]), [["giden", "2026-10-28"], ["deneme", "2026-10-20"]]);
});

test("kapanış anı biliniyorsa dönem sonunun yerine o kullanılır", () => {
  const r = aylikRapor(AY, [
    // Dönemi Kasım'da bitecekti ama Ekim'de iptal edildi: Ekim'in kaybı.
    kurum("erken", { license_status: "canceled", current_period_end: "2026-11-20", closed_at: "2026-10-04T09:00:00Z" }),
    // Dönemi Ekim'de bitti ama kapanış Kasım'da işlendi: Ekim'in kaybı değil.
    kurum("gec", { license_status: "canceled", current_period_end: "2026-10-10", closed_at: "2026-11-02T09:00:00Z" }),
  ], [], []);
  assert.deepEqual(r.kaybedilenKurumlar.map((k) => [k.id, k.bitis]), [["erken", "2026-10-04"]]);
});

test("ürünü \"Kapalı\" (inactive) yapılarak kapatılan müşteri de kayıp; hiç açılmamış ürün sayılmaz", () => {
  const r = aylikRapor(AY, [kurum("kapali", { license_status: null, current_period_end: null })], [
    { organization_id: "kapali", product: "arvolab", status: "inactive", current_period_end: "2026-12-01", trial_ends_at: null, created_at: "2026-01-10T10:00:00Z", closed_at: "2026-10-12T09:00:00Z" },
    { organization_id: "kapali", product: "randevu", status: "inactive", current_period_end: null, trial_ends_at: null, created_at: "2026-01-10T10:00:00Z", closed_at: null },
  ], []);
  assert.deepEqual(r.kaybedilenKurumlar.map((k) => [k.id, k.bitis]), [["kapali", "2026-10-12"]]);
});

test("ek ürün: mevcut müşterinin bu ay açtığı ürün; yeni müşterinin ilk ürünü sayılmaz", () => {
  const r = aylikRapor(AY, [kurum("eski"), kurum("yeni", { created_at: "2026-10-03T10:00:00Z" })], [
    { organization_id: "eski", product: "randevu", status: "trialing", current_period_end: null, trial_ends_at: "2026-11-10", created_at: "2026-10-12T10:00:00Z" },
    { organization_id: "yeni", product: "arvolab", status: "active", current_period_end: "2026-11-03", trial_ends_at: null, created_at: "2026-10-03T10:00:00Z" },
  ], []);
  assert.deepEqual(r.ekUrunler.map((l) => [l.organization_id, l.product, l.kurumAdi]), [["eski", "randevu", "eski"]]);
});

test("bireysel abone: yeni, kapanış anı varsa o esas", () => {
  const r = aylikRapor(AY, [], [], [
    { id: "a", ad: "A", product: "arvolab", status: "active", created_at: "2026-10-02T10:00:00Z", closed_at: null, current_period_end: "2026-11-02", trial_ends_at: null },
    { id: "b", ad: "B", product: "arvolab", status: "canceled", created_at: "2026-03-02T10:00:00Z", closed_at: "2026-10-09T10:00:00Z", current_period_end: "2026-12-01", trial_ends_at: null },
  ]);
  assert.deepEqual(r.yeniAboneler.map((a) => a.id), ["a"]);
  assert.deepEqual(r.kaybedilenAboneler.map((a) => [a.id, a.bitis]), [["b", "2026-10-09"]]);
});

test("değişim yüzdesi", () => {
  assert.equal(degisimYuzdesi(150, 100), 50);
  assert.equal(degisimYuzdesi(50, 100), -50);
  assert.equal(degisimYuzdesi(50, 0), null);
});

test("kayıp nedeni SON kapanan lisanstan", () => {
  /* Çekirdek Eylül'de fiyat yüzünden kapandı, ArvoLab Ekim'de kullanmadığı
     için: müşteriyi kaybettiren Ekim'deki kapanış. */
  const r = aylikRapor(AY, [kurum("giden", { license_status: "canceled", closed_at: "2026-09-20T10:00:00Z", kapanis_nedeni: "fiyat" })], [
    { organization_id: "giden", product: "arvolab", status: "canceled", current_period_end: null, trial_ends_at: null, created_at: "2026-01-10T10:00:00Z", closed_at: "2026-10-15T10:00:00Z", kapanis_nedeni: "kullanmiyor", kapanis_notu: "ekip küçüldü" },
  ], []);
  assert.deepEqual(r.kaybedilenKurumlar.map((k) => [k.bitis, k.neden, k.not]), [["2026-10-15", "kullanmiyor", "ekip küçüldü"]]);
});
