import assert from "node:assert/strict";
import test from "node:test";
import {
  assertModuleAccess,
  assertModuleKeyAccess,
  isNavigationGroupHiddenForRole,
  moduleKeysForPath,
  modulesKeyForPath,
} from "@/lib/role-permissions";

const hidden = (...keys: string[]) => new Set(keys);

test("raporlar yolu finansı değil raporları çözer", () => {
  // Gerileme: tanım sırasındaki ilk eşleşme alındığı için
  // "/panel/finance/raporlar" hep "finance" oluyordu; Yetkilendirme'deki
  // "Raporlar" kutucuğu sayfayı adresi yazarak açmayı engellemiyordu.
  assert.equal(modulesKeyForPath("/panel/finance/raporlar"), "reports");
  assert.equal(modulesKeyForPath("/panel/finance"), "finance");
  assert.equal(modulesKeyForPath("/panel/finance/cari"), "finance");
});

test("yol eşleşmeyen modülde null döner", () => {
  assert.equal(modulesKeyForPath("/panel"), null);
  assert.equal(modulesKeyForPath("/login"), null);
});

test("raporlar sayfası hem finans hem rapor yetkisi ister", () => {
  assert.deepEqual(moduleKeysForPath("/panel/finance/raporlar").sort(), ["finance", "reports"]);
});

test("kapatılmış modül sayfa düzeyinde engellenir", () => {
  assert.throws(() => assertModuleAccess("member", "/panel/finance", hidden("finance")), /yetkiniz yok/);
  assert.doesNotThrow(() => assertModuleAccess("member", "/panel/crm", hidden("finance")));
});

test("raporlar kapalıysa finans açık olsa bile rapor sayfası açılmaz", () => {
  assert.throws(() => assertModuleAccess("member", "/panel/finance/raporlar", hidden("reports")), /yetkiniz yok/);
});

test("kapatılmış modülün sunucu işlemi de engellenir", () => {
  // Gerileme: assertModuleAccess yalnızca sayfa düzeninde çalışıyordu;
  // kapatılmış modülün server action'ları arka planda çağrılabiliyordu.
  assert.throws(() => assertModuleKeyAccess("member", "finance", hidden("finance")), /yetkiniz yok/);
  assert.doesNotThrow(() => assertModuleKeyAccess("member", "crm", hidden("finance")));
});

test("kurum sahibi hiçbir zaman kısıtlanamaz", () => {
  // Kilitlenip dışarıda kalmayı önlemek için owner her zaman geçer.
  assert.doesNotThrow(() => assertModuleAccess("owner", "/panel/finance", hidden("finance", "crm", "hr")));
  assert.doesNotThrow(() => assertModuleKeyAccess("owner", "finance", hidden("finance")));
  assert.equal(isNavigationGroupHiddenForRole("owner", "finance", hidden("finance")), false);
});

test("menü görünürlüğü gizli modül kümesini izler", () => {
  assert.equal(isNavigationGroupHiddenForRole("member", "finance", hidden("finance")), true);
  assert.equal(isNavigationGroupHiddenForRole("member", "crm", hidden("finance")), false);
});

test("İK'nın iki yolu da aynı modüle bakar", () => {
  assert.equal(modulesKeyForPath("/panel/hr"), "hr");
  assert.equal(modulesKeyForPath("/panel/ekip"), "hr");
  assert.throws(() => assertModuleAccess("member", "/panel/ekip", hidden("hr")), /yetkiniz yok/);
});

test("cari, banka ve fatura yolları finans yetkisine bağlı", () => {
  for (const path of ["/panel/accounts", "/panel/banking", "/panel/billing"]) {
    assert.equal(modulesKeyForPath(path), "finance", path);
    assert.throws(() => assertModuleAccess("member", path, hidden("finance")), /yetkiniz yok/, path);
  }
});
