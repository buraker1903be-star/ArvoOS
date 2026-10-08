import assert from "node:assert/strict";
import test from "node:test";
import { aramaAnahtari, basHarfler, canliTablolar, etkinUygulama, osSayfalari, osUygulamalari } from "@/app/panel/os/os-apps";

/*
  Şirket işletim sistemi kabuğu: dock ve Ctrl+K aynı uygulama listesini
  kullanır. Liste eski kenar menüsünün yetki kuralından sapmamalı: kurumun
  açık modülleri, rolün gizlenen grupları; owner hiçbir zaman kısıtlanmaz.
*/

const modules = [
  { code: "crm", name: "CRM" },
  { code: "proposals", name: "Teklifler" },
  { code: "operations", name: "Operasyon" },
  { code: "finance", name: "Finans" },
  { code: "accounts", name: "Cariler" },
  { code: "hr", name: "İK" },
];

test("kurumun açık modülleri sırayla uygulama olur; ana ekran başta, ayarlar sonda", () => {
  const keys = osUygulamalari({ modules, role: "admin" }).map((u) => u.key);
  assert.deepEqual(keys, ["home", "crm", "operations", "finance", "hr", "settings"]);
});

test("rol için gizlenen modül dock'ta görünmez; owner hiç kısıtlanmaz", () => {
  const gizli = new Set(["finance"]);
  assert.ok(!osUygulamalari({ modules, role: "member", hiddenModuleKeys: gizli }).some((u) => u.key === "finance"));
  assert.ok(osUygulamalari({ modules, role: "owner", hiddenModuleKeys: gizli }).some((u) => u.key === "finance"));
});

test("açık olmayan modülün uygulaması yok", () => {
  const keys = osUygulamalari({ modules: [{ code: "crm", name: "CRM" }], role: "admin" }).map((u) => u.key);
  assert.deepEqual(keys, ["home", "crm", "settings"]);
});

test("posta ve mesajlar yalnızca verildiğinde, rozetiyle", () => {
  const apps = osUygulamalari({ modules, role: "admin", posta: { okunmamis: 3 }, mesajlar: { okunmamis: 0 } });
  assert.equal(apps.find((u) => u.key === "posta")?.rozet, 3);
  assert.equal(apps.find((u) => u.key === "messages")?.rozet, 0);
  assert.ok(!osUygulamalari({ modules, role: "admin" }).some((u) => u.key === "posta"));
});

test("açık sayfanın uygulaması: alt sayfalar ve grup modülleri dahil, benzer önek hariç", () => {
  const apps = osUygulamalari({ modules, role: "admin" });
  assert.equal(etkinUygulama(apps, "/panel")?.key, "home");
  assert.equal(etkinUygulama(apps, "/panel/crm/proposals/abc")?.key, "crm");
  assert.equal(etkinUygulama(apps, "/panel/proposals")?.key, "crm");
  assert.equal(etkinUygulama(apps, "/panel/accounts/12")?.key, "finance");
  assert.equal(etkinUygulama(apps, "/panel/settings")?.key, "settings");
  assert.equal(etkinUygulama(apps, "/panel/crmx"), null);
});

test("Ctrl+K sayfaları yalnızca açık uygulamalardan", () => {
  const apps = osUygulamalari({ modules: [{ code: "crm", name: "CRM" }], role: "admin" });
  const sayfalar = osSayfalari(apps);
  assert.ok(sayfalar.some((s) => s.label === "Teklifler"));
  assert.ok(!sayfalar.some((s) => s.uygulama === "finance"));
});

test("baş harfler Türkçe büyük harfle", () => {
  assert.equal(basHarfler("burak erdoğan"), "BE");
  assert.equal(basHarfler("ilknur"), "İ");
  assert.equal(basHarfler("  "), "?");
});

test("arama Türkçe harf ve aksan duyarsız", () => {
  assert.equal(aramaAnahtari("İnsan Kaynakları"), "insan kaynaklari");
  assert.ok(aramaAnahtari("Sözleşmeler").includes(aramaAnahtari("sozles")));
  assert.ok(aramaAnahtari("Işler").includes("isler"));
});

test("anlık tazeleme yalnızca liste ve özet ekranlarında", () => {
  assert.ok(canliTablolar("/panel").includes("crm_opportunities"));
  assert.ok(canliTablolar("/panel/crm/").includes("crm_opportunities"));
  assert.deepEqual(canliTablolar("/panel/operations/isler"), ["operation_workflows"]);
  // Detay/form ve sürükle-bırak ekranları kıpırdamaz
  assert.deepEqual(canliTablolar("/panel/crm/requests/abc"), []);
  assert.deepEqual(canliTablolar("/panel/operations/pano"), []);
  assert.deepEqual(canliTablolar("/panel/settings"), []);
});
