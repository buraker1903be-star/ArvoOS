import assert from "node:assert/strict";
import test from "node:test";
import { SAYFA_BOYU, aralikDisiMi, sayfaAraligi, sayfaNumarasi, sayfasizAdres, sonSayfaNo } from "@/lib/liste-sayfalama";

test("adresteki sayfa numarası bozuk değerde ilk sayfaya düşüyor", () => {
  assert.equal(sayfaNumarasi("3"), 3);
  assert.equal(sayfaNumarasi(undefined), 1);
  // "?sayfa=abc" ile gelen bağlantı hata vermemeli.
  assert.equal(sayfaNumarasi("abc"), 1);
  assert.equal(sayfaNumarasi("0"), 1);
  assert.equal(sayfaNumarasi("-5"), 1);
});

test("son sayfa toplamdan, toplam yoksa dolu sayfadan", () => {
  assert.equal(sonSayfaNo(120, 50, 1), 3);
  assert.equal(sonSayfaNo(50, 50, 1), 1);
  assert.equal(sonSayfaNo(0, 0, 1), 1, "boş liste de tek sayfa");
  /* Toplam dönmediyse dolu bir sayfa "devamı var" sayılıyor: eksik bir
     "Sonraki" düğmesi kullanıcıyı kayıtların bittiğine inandırır. */
  assert.equal(sonSayfaNo(null, SAYFA_BOYU, 2), 3);
  assert.equal(sonSayfaNo(null, 7, 2), 2);
});

test("sorgu aralığı sıfırdan başlıyor", () => {
  assert.deepEqual(sayfaAraligi(1), [0, 49]);
  assert.deepEqual(sayfaAraligi(3), [100, 149]);
  assert.deepEqual(sayfaAraligi(2, 10), [10, 19]);
});

/*
  Aralık dışı sayfa ÇÖKME DEĞİL. Sekiz listede ?sayfa=2 "Bir sorun
  oluştu · Hata kodu: …" veriyordu: PostgREST son satırın ötesindeki
  aralığı PGRST103 ile reddediyor, sayfa da onu gerçek okuma hatası
  sayıp fırlatıyordu (16.10.2026, canlıda ölçüldü).
*/
test("aralık dışı kodu tanınıyor, öteki hatalar hata kalıyor", () => {
  assert.equal(aralikDisiMi({ code: "PGRST103" }), true);
  assert.equal(aralikDisiMi({ code: "PGRST116" }), false, "başka bir okuma hatası yutulmamalı");
  assert.equal(aralikDisiMi({ code: "42501" }), false, "yetki hatası yutulmamalı");
  assert.equal(aralikDisiMi(null), false);
  assert.equal(aralikDisiMi(undefined), false);
  assert.equal(aralikDisiMi({}), false);
});

test("ilk sayfaya dönerken süzgeçler korunuyor", () => {
  /* Süzgeci de sıfırlamak, kullanıcıyı aradığı listeden çıkarır. */
  assert.equal(
    sayfasizAdres("/panel/crm/contracts", { status: "sent", temsilci: "atanmamis", sayfa: "99" }),
    "/panel/crm/contracts?status=sent&temsilci=atanmamis",
  );
  assert.equal(sayfasizAdres("/panel/posta", { sayfa: "2" }), "/panel/posta", "tek parametre sayfaysa sorgu kalmıyor");
  assert.equal(sayfasizAdres("/panel/documents", {}), "/panel/documents");
  assert.equal(sayfasizAdres("/panel/crm", { durum: undefined, arama: "" }), "/panel/crm", "boş değer yazılmıyor");
  assert.equal(sayfasizAdres("/panel/crm", { etiket: ["a", "b"] }), "/panel/crm?etiket=a&etiket=b", "çoklu değer korunuyor");
  assert.equal(sayfasizAdres("/panel/crm", { arama: "a b&c" }), "/panel/crm?arama=a+b%26c", "arama kaçışlı");
});
