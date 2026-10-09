import assert from "node:assert/strict";
import test from "node:test";
import { BILDIRIM_TEK_TEK_SINIRI, yeniPostaBildirimleri } from "@/lib/posta-bildirim";

/* Yeni posta bildiriminin kararı: kimin için, kaç tane, ne yazıyor. */

const mesaj = (ek: Partial<Parameters<typeof yeniPostaBildirimleri>[0][number]>) => ({
  threadId: "t1", gonderenAd: "Ayşe Yılmaz", gonderenAdres: "ayse@musteri.com",
  konu: "Teklif", tarih: new Date("2026-10-09T08:00:00Z"), yon: "gelen" as const, ...ek,
});

test("giden mesaj bildirim üretmiyor", () => {
  // Kendi gönderdiğimizi haber vermek, gönderene kendi işini duyurmak olurdu.
  assert.deepEqual(yeniPostaBildirimleri([mesaj({ yon: "giden" })]), []);
  assert.deepEqual(yeniPostaBildirimleri([]), []);
});

test("konuşma başına tek bildirim, en yeni mesajla", () => {
  const sonuc = yeniPostaBildirimleri([
    mesaj({ konu: "İlk", tarih: new Date("2026-10-09T08:00:00Z") }),
    mesaj({ konu: "Son", tarih: new Date("2026-10-09T09:00:00Z") }),
  ]);
  assert.equal(sonuc.length, 1);
  assert.equal(sonuc[0].mesaj, "Ayşe Yılmaz · Son");
  assert.equal(sonuc[0].threadId, "t1");
});

test("adı olmayan gönderen adresiyle, konusuz posta anlaşılır yazılıyor", () => {
  const [bildirim] = yeniPostaBildirimleri([mesaj({ gonderenAd: null, konu: "  " })]);
  assert.equal(bildirim.mesaj, "ayse@musteri.com · (konu yok)");
});

test("çok sayıda yazışma tek özete iniyor", () => {
  const cok = Array.from({ length: BILDIRIM_TEK_TEK_SINIRI + 1 }, (_, i) => mesaj({ threadId: `t${i}` }));
  const sonuc = yeniPostaBildirimleri(cok);
  assert.equal(sonuc.length, 1);
  assert.equal(sonuc[0].threadId, null);
  assert.match(sonuc[0].mesaj, /6 yeni yazışma/);
  // Sınırın tam üstünde değil, sınırda hâlâ tek tek.
  const tamSinir = Array.from({ length: BILDIRIM_TEK_TEK_SINIRI }, (_, i) => mesaj({ threadId: `t${i}` }));
  assert.equal(yeniPostaBildirimleri(tamSinir).length, BILDIRIM_TEK_TEK_SINIRI);
});

test("uzun konu kırpılıyor", () => {
  const [bildirim] = yeniPostaBildirimleri([mesaj({ konu: "ş".repeat(300) })]);
  assert.ok(bildirim.mesaj.length <= 140, "bildirim metni 140 karakteri aşıyor");
  assert.ok(bildirim.mesaj.endsWith("…"));
});
