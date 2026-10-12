import assert from "node:assert/strict";
import test from "node:test";
import {
  DIGER, HIZMET_TURU_SINIRI, VARSAYILAN_HIZMET_TURLERI, adDenetle, formSecenekleri, hizmetTurleriCoz,
  turEkle, turuAdlandir, turuSil, turuTasi, varsayilanMi,
} from "../../lib/hizmet-turleri.ts";

/*
  KURUMUN HİZMET TÜRLERİ (lib/hizmet-turleri). Kaydı olmayan kurumun
  formu eskisi gibi kalmalı; "Diğer" her zaman en sonda olmalı; bayat
  sayfadan gelen işlem yanlış öğeyi değiştirmemeli.
*/

test("kaydı olmayan kurum eski sabit listeyi görüyor", () => {
  assert.deepEqual(hizmetTurleriCoz(null), [...VARSAYILAN_HIZMET_TURLERI]);
  assert.deepEqual(hizmetTurleriCoz(undefined), [...VARSAYILAN_HIZMET_TURLERI]);
  // Eskiden formdaki liste: sekiz hizmet ve en sonda Diğer.
  assert.deepEqual(formSecenekleri(hizmetTurleriCoz(null)), ["Tez Danışmanlığı","Akademik Çeviri","Literatür Danışmanlığı","Veri Analizi","Makale Danışmanlığı","Biçimsel Düzenleme","Araştırma Tasarımı","Doçentlik Başvuru Danışmanlığı","Diğer"]);
});

test("boş liste kaydı boş kalıyor (yalnızca Diğer), varsayılana dönmüyor", () => {
  assert.deepEqual(hizmetTurleriCoz([]), []);
  assert.deepEqual(formSecenekleri([]), [DIGER]);
});

test("bozuk kayıt: tekrar, Diğer, boş ve metin olmayan öğeler atılıyor", () => {
  assert.deepEqual(hizmetTurleriCoz(["  Web  Tasarım ", "web tasarım", "DİĞER", "", 5, null, "SEO"]), ["Web Tasarım", "SEO"]);
});

test("ad denetimi: uzunluk, Diğer, büyük/küçük harf duyarsız tekrar (Türkçe)", () => {
  assert.ok("hata" in adDenetle("a", []));
  assert.ok("hata" in adDenetle("x".repeat(121), []));
  assert.ok("hata" in adDenetle("diğer", []));
  // Türkçe büyük İ: "İÇ MİMARLIK" ile "iç mimarlık" aynı ad.
  assert.ok("hata" in adDenetle("İÇ MİMARLIK", ["iç mimarlık"]));
  assert.deepEqual(adDenetle("  Logo   Tasarımı ", []), { ad: "Logo Tasarımı" });
  // Yeniden adlandırmada öğe kendisiyle çakışmıyor (yalnızca harf düzeltmesi).
  assert.deepEqual(adDenetle("Seo", ["SEO"], 0), { ad: "Seo" });
});

test("ekleme sona yazıyor ve sınırı aşmıyor", () => {
  assert.deepEqual(turEkle(["A1"], "B2"), ["A1", "B2"]);
  const dolu = Array.from({ length: HIZMET_TURU_SINIRI }, (_, i) => `Hizmet ${i}`);
  assert.ok("hata" in turEkle(dolu, "Yeni"));
});

test("bayat sayfa: sıra başka bir öğeyi gösteriyorsa işlem reddediliyor", () => {
  const liste = ["Çeviri", "Analiz", "Tez"];
  // Başka sekmede "Çeviri" silinmiş; eski sayfadaki 1. sıra artık "Tez".
  const guncel = ["Analiz", "Tez"];
  assert.ok("hata" in turuSil(guncel, 1, "Analiz"));
  assert.ok("hata" in turuAdlandir(guncel, 1, "Analiz", "Veri Analizi"));
  assert.ok("hata" in turuTasi(guncel, 1, "Analiz", "yukari"));
  assert.deepEqual(turuSil(liste, 1, "Analiz"), ["Çeviri", "Tez"]);
  assert.deepEqual(turuAdlandir(liste, 1, "Analiz", "Veri Analizi"), ["Çeviri", "Veri Analizi", "Tez"]);
});

test("taşıma komşuyla yer değiştiriyor; uçta liste olduğu gibi", () => {
  const liste = ["A1", "B2", "C3"];
  assert.deepEqual(turuTasi(liste, 1, "B2", "yukari"), ["B2", "A1", "C3"]);
  assert.deepEqual(turuTasi(liste, 1, "B2", "asagi"), ["A1", "C3", "B2"]);
  assert.deepEqual(turuTasi(liste, 0, "A1", "yukari"), liste);
  assert.deepEqual(turuTasi(liste, 2, "C3", "asagi"), liste);
});

test("varsayılan rozeti yalnızca birebir aynı listede", () => {
  assert.equal(varsayilanMi([...VARSAYILAN_HIZMET_TURLERI]), true);
  assert.equal(varsayilanMi([...VARSAYILAN_HIZMET_TURLERI].reverse()), false);
  assert.equal(varsayilanMi([]), false);
});
