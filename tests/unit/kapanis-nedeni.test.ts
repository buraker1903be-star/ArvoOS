import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KAPANIS_NEDENLERI, kapanisNedeniAdi, kapanisNedeniOku, nedenDagilimi } from "@/lib/kapanis-nedeni";

test("kod listesi veritabanı kısıtıyla aynı", () => {
  /* İkisi ayrı yazılı: ekranda seçilebilen ama veritabanının reddettiği bir
     neden "kaydedildi" deyip düşerdi. */
  const sql = readFileSync(join(import.meta.dirname, "..", "..", "supabase/migrations/20261102205003_lisans_kayip_nedeni.sql"), "utf8");
  const kisit = sql.match(/organization_licenses_kapanis_nedeni_check\s+check \(kapanis_nedeni is null or kapanis_nedeni in \(([^)]*)\)\)/);
  assert.ok(kisit, "kısıt bulunamadı");
  const kodlar = [...kisit[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(kodlar, KAPANIS_NEDENLERI.map((n) => n.kod));
});

test("açıktan kapanırken neden zorunlu; açıkken ya da açılırken boş", () => {
  assert.throws(() => kapanisNedeniOku({ yeniDurum: "canceled", eskiDurum: "active", neden: "", not: "" }), /kayıp nedenini/);
  assert.deepEqual(kapanisNedeniOku({ yeniDurum: "canceled", eskiDurum: "active", neden: "fiyat", not: "  pahalı " }), { neden: "fiyat", not: "pahalı" });
  assert.deepEqual(kapanisNedeniOku({ yeniDurum: "active", eskiDurum: "canceled", neden: "fiyat", not: "x" }), { neden: null, not: null });
  /* Askı geçici: kayıp değil, neden yazılmaz. */
  assert.deepEqual(kapanisNedeniOku({ yeniDurum: "suspended", eskiDurum: "active", neden: "fiyat", not: "" }), { neden: null, not: null });
});

test("hiç açılmamış ürünün Kapalı kalması kayıp değil; tanınmayan neden reddedilir", () => {
  assert.deepEqual(kapanisNedeniOku({ yeniDurum: "inactive", eskiDurum: "inactive", neden: "", not: "" }), { neden: null, not: null });
  assert.throws(() => kapanisNedeniOku({ yeniDurum: "canceled", eskiDurum: "active", neden: "uydurma", not: "" }), /Geçerli/);
});

test("dağılım çoktan aza, belirtilmemiş en sonda", () => {
  assert.deepEqual(nedenDagilimi(["fiyat", null, "rakip", "fiyat", "bozuk"]).map((x) => [x.kod, x.adet]), [["fiyat", 2], ["rakip", 1], [null, 2]]);
  assert.equal(kapanisNedeniAdi(null), "Belirtilmemiş");
});
