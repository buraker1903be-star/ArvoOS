import assert from "node:assert/strict";
import test from "node:test";
import { etkinBolum, finansBolumleri, ikBolumleri, uygulamaBolumleri } from "@/app/panel/os/os-bolumler";

/*
  Modül bölümleri tek kaynakta: sayfa sekmeleri, dock'un üstünde açılan
  ikinci dock ve Ctrl+K aynı listeyi kullanır. Görünürlük sayfaların yetki
  kuralıyla aynı olmalı.
*/

const bos = { modules: [], yetkiler: new Set<string>() };

test("Finans: maliyet ve raporlar yalnızca yetkiyle (raporlar modülle birlikte)", () => {
  assert.deepEqual(finansBolumleri(bos).map((b) => b.key), ["genel-bakis", "cari"]);
  const tam = { modules: [{ code: "reporting" }], yetkiler: new Set(["finance.maliyet.yonet", "finance.rapor.gor"]) };
  assert.deepEqual(finansBolumleri(tam).map((b) => b.key), ["genel-bakis", "cari", "maliyet", "raporlar"]);
  // Rapor yetkisi var ama Raporlama modülü kapalı: sekme yok
  assert.ok(!finansBolumleri({ modules: [], yetkiler: new Set(["finance.rapor.gor"]) }).some((b) => b.key === "raporlar"));
});

test("İK: prim, gizlilik ve hareketler personel detayında; bölüm değil", () => {
  // 2026-10: dört ayrı sayfa personelin içine taşındı (finanstaki Müşteriler gibi).
  assert.deepEqual(ikBolumleri().map((b) => b.key), ["genel-bakis", "personel"]);
  assert.deepEqual(uygulamaBolumleri("hr", { modules: [], yetkiler: new Set(["hr.prim.gor", "hr.gizlilik.gor", "hr.hareket.gor"]), isPlatformOwner: true }).map((b) => b.key), ["genel-bakis", "personel"]);
});

test("bölümü olmayan uygulama boş", () => {
  assert.deepEqual(uygulamaBolumleri("settings", bos), []);
  // WhatsApp bölüm değil, ayrı uygulama (os-apps.ts).
  assert.equal(uygulamaBolumleri("crm", bos).length, 5);
});

test("açık bölüm: tam yol, alt sayfa ve sorgu dizesi", () => {
  const crm = uygulamaBolumleri("crm", bos);
  assert.equal(etkinBolum(crm, "/panel/crm")?.key, "talepler");
  assert.equal(etkinBolum(crm, "/panel/crm/genel-bakis")?.key, "genel-bakis");
  assert.equal(etkinBolum(crm, "/panel/crm/proposals/abc")?.key, "teklifler");
  // Modül kökü yalnızca tam eşleşir: başka bir CRM alt sayfası "Talepler" sayılmaz
  assert.equal(etkinBolum(crm, "/panel/crm/requests/abc"), null);

  const fin = finansBolumleri({ modules: [], yetkiler: new Set(["finance.maliyet.yonet"]) });
  assert.equal(etkinBolum(fin, "/panel/finance")?.key, "cari");
  // PAYTR Tahsilatları kaldırıldı (ödeme bağlantısı cari satırında); eski bağlantı cariye düşer.
  assert.equal(etkinBolum(fin, "/panel/finance", "gorunum=paytr")?.key, "cari");
  assert.equal(etkinBolum(fin, "/panel/finance", "gorunum=maliyet&durum=acik")?.key, "maliyet");
  assert.equal(etkinBolum(fin, "/panel/finance/genel-bakis")?.key, "genel-bakis");
});

test("müşteri detayı Finans menüsünde Müşteriler'i etkin gösterir", () => {
  // 2026-10: Cari Hesaplar → Müşteriler; detay /panel/finance/musteri/[cari] altında.
  const fin = finansBolumleri({ modules: [], yetkiler: new Set() });
  assert.equal(fin.find((b) => b.key === "cari")?.label, "Müşteriler");
  assert.equal(etkinBolum(fin, "/panel/finance/musteri/abc")?.key, "cari");
  assert.equal(etkinBolum(fin, "/panel/finance/genel-bakis")?.key, "genel-bakis");
});
