import assert from "node:assert/strict";
import test from "node:test";
import { beklemeSuresi, gecikmisMi, kuyrukHali, kuyrukSirala, KUYRUK_SEKMELERI } from "@/lib/destek-kuyrugu";

/*
  Konsolun destek kuyruğu (lib/destek-kuyrugu.ts). 02.11.2026'ya kadar
  müşteri talepleri konsolda hiç görünmüyordu.
*/

test("durum kuyruğa doğru düşer; her durum tam bir sekmede", () => {
  assert.equal(kuyrukHali("open"), "yanit");
  assert.equal(kuyrukHali("in_progress"), "yanit");
  assert.equal(kuyrukHali("waiting_customer"), "musteri");
  assert.equal(kuyrukHali("resolved"), "kapandi");
  assert.equal(kuyrukHali("closed"), "kapandi");
  // Sekmelerin durum kümeleri (Tümü hariç) çakışmıyor ve beşini de kapsıyor.
  const hepsi = KUYRUK_SEKMELERI.flatMap((s) => s.durumlar ?? []);
  assert.deepEqual([...hepsi].sort(), ["closed", "in_progress", "open", "resolved", "waiting_customer"]);
});

test("yanıt bekleyenler önce aciliyete, sonra en uzun bekleyene göre", () => {
  const t = (id: string, status: string, priority: string, last_message_at: string) => ({ id, status, priority, last_message_at });
  const sirali = kuyrukSirala([
    t("yeni-normal", "open", "normal", "2026-11-02T09:00:00Z"),
    t("eski-normal", "open", "normal", "2026-11-01T09:00:00Z"),
    t("acil", "open", "urgent", "2026-11-02T10:00:00Z"),
    t("musteride", "waiting_customer", "urgent", "2026-11-02T11:00:00Z"),
  ]).map((x) => x.id);
  assert.deepEqual(sirali, ["acil", "eski-normal", "yeni-normal", "musteride"]);
});

test("bekleme süresi ve gecikme", () => {
  const simdi = new Date("2026-11-02T12:00:00Z");
  assert.equal(beklemeSuresi("2026-11-02T11:48:00Z", simdi), "12 dk");
  assert.equal(beklemeSuresi("2026-11-02T07:00:00Z", simdi), "5 saat");
  assert.equal(beklemeSuresi("2026-10-30T12:00:00Z", simdi), "3 gün");
  assert.equal(gecikmisMi("2026-11-01T13:00:00Z", simdi), false);
  assert.equal(gecikmisMi("2026-11-01T12:00:00Z", simdi), true);
});
