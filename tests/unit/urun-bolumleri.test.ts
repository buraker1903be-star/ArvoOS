import { test } from "node:test";
import assert from "node:assert/strict";
import {
  URUN_BOLUM_ANAHTARLARI,
  VARSAYILAN_URUN_BOLUMU,
  bolumAdresi,
  bolumSirasi,
  urunBolumu,
} from "../../lib/konsol/urun-bolumleri";

/*
  26.11.2026 ürün kararı: ürün kartının sekmesi adreste. Eskiden seçim
  bileşenin kendi durumundaydı — Abonelikler'i açıp bağlantıyı paylaşan
  ya da sayfayı yenileyen Genel Bakış'a dönüyordu.
*/

test("adresten gelen bölüm: bilinmeyen her şey Genel Bakış", () => {
  assert.equal(urunBolumu("abonelikler"), "abonelikler");
  assert.equal(urunBolumu("tahsilat"), "tahsilat");
  for (const bozuk of [null, undefined, "", "ABONELIKLER", "yok", 3, {}]) {
    assert.equal(urunBolumu(bozuk), VARSAYILAN_URUN_BOLUMU);
  }
});

test("sıra çizilen sekmelerden hesaplanır (koşullu liste)", () => {
  /* Bireysel aboneliği olan ürün: altı sekme. */
  const hepsi = [...URUN_BOLUM_ANAHTARLARI];
  assert.equal(bolumSirasi(hepsi, "abonelikler"), 3);
  assert.equal(bolumSirasi(hepsi, "destek"), 5);

  /* Olmayan üründe "Abonelikler" hiç çizilmiyor: sıra kaymalı. */
  const aboneliksiz = hepsi.filter((a) => a !== "abonelikler");
  assert.equal(bolumSirasi(aboneliksiz, "tahsilat"), 3);
  /* Çizilmeyen bölüm istenirse ilk sekmeye düşülür: var olmayan bir
     panele "seçili" demek boş kart demekti. */
  assert.equal(bolumSirasi(aboneliksiz, "abonelikler"), 0);
});

test("bölüm adresi dönemi korur, varsayılanı adrese yazmaz", () => {
  const taban = "/panel/platform/urunler/arvolab";
  assert.equal(bolumAdresi(taban, "abonelikler"), `${taban}?bolum=abonelikler`);
  assert.equal(bolumAdresi(taban, "abonelikler", "90g"), `${taban}?bolum=abonelikler&donem=90g`);
  /* Genel Bakış varsayılan: adres temiz kalır, iki ayrı adres aynı
     ekranı göstermez. */
  assert.equal(bolumAdresi(taban, "genel-bakis"), taban);
  assert.equal(bolumAdresi(taban, "genel-bakis", "90g"), `${taban}?donem=90g`);
  /* Çözüm ile adres birbirinin tersi: üretilen adres aynı bölümü verir. */
  for (const anahtar of URUN_BOLUM_ANAHTARLARI) {
    const adres = bolumAdresi(taban, anahtar, "7g");
    const ham = new URL(adres, "https://yonetim.arvo-os.com").searchParams.get("bolum");
    assert.equal(urunBolumu(ham), anahtar);
  }
});

test("URL ile sekme eşleşmesi: her bölüm kendi adresinden çözülüyor", () => {
  /*
    27.11.2026, brief §7. Adres → bölüm → adres turu kendi üzerine
    kapanmalı: derin bağlantı, yenileme ve geri/ileri aynı paneli
    açıyor. Tur kapanmazsa "?bolum=abonelikler ile aç" maddesi
    sessizce Genel Bakış gösterir.
  */
  const taban = "/panel/platform/urunler/arvolab";
  for (const anahtar of URUN_BOLUM_ANAHTARLARI) {
    const adres = bolumAdresi(taban, anahtar);
    const sorgu = new URLSearchParams(adres.split("?")[1] ?? "");
    assert.equal(urunBolumu(sorgu.get("bolum") ?? undefined), anahtar, `${anahtar} turu kapanmıyor`);
  }
});

test("bölüm ve dönem birbirini silmiyor", () => {
  /*
    İki parametre aynı adreste yaşıyor: dönemi seçip bölüm değiştiren
    kullanıcı "Son 90 gün"ü, bölümü seçip dönem değiştiren kullanıcı
    bölümü kaybetmiyor (brief §7, derin bağlantı ve dönem).
  */
  const taban = "/panel/platform/urunler/arvolab";
  const adres = bolumAdresi(taban, "abonelikler", "90g");
  const sorgu = new URLSearchParams(adres.split("?")[1]);
  assert.equal(sorgu.get("bolum"), "abonelikler");
  assert.equal(sorgu.get("donem"), "90g");

  /* Varsayılan dönem adrese YAZILMIYOR (kısa adres), ama bölüm duruyor. */
  const varsayilan = bolumAdresi(taban, "tahsilat", null);
  assert.equal(varsayilan, `${taban}?bolum=tahsilat`);

  /* Varsayılan bölüm + dönem: yalnızca dönem yazılıyor. */
  assert.equal(bolumAdresi(taban, "genel-bakis", "365g"), `${taban}?donem=365g`);
});

test("ürün kapsamı: bölüm adresi tabanı değiştirmiyor", () => {
  /*
    Bir üründe seçili sekme ya da süzgeç BAŞKA ürüne taşınmamalı
    (brief §2). Taban adres ürünün kendisi olduğu için bölüm
    değişimi ürünü değiştiremez; bu test o sözleşmeyi sabitliyor.
  */
  const lab = bolumAdresi("/panel/platform/urunler/arvolab", "abonelikler", "90g");
  const arc = bolumAdresi("/panel/platform/urunler/arc", "abonelikler", "90g");
  assert.ok(lab.startsWith("/panel/platform/urunler/arvolab?"));
  assert.ok(arc.startsWith("/panel/platform/urunler/arc?"));
  assert.notEqual(lab, arc);
});
