import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error — betik modülü düz JS (scripts/stil-sinif-ayikla.mjs ile aynı kalıp).
import { tekEkranHukmu } from "../../scripts/tek-ekran-kabulu.mjs";

/*
  Kör kalan bir kabul, kabul ettiği hatadan farksızdır: aşağıdaki sayılar
  uydurma değil, 25.11.2026'da kurucu konsolunda GERÇEKTEN ölçülen "önce"
  değerleri (scripts/genel-bakis-yerlesim-tarayici.mjs). Hüküm bunları
  geçirirse düzeltme sessizce geri alınabilir.
*/

/** 768×600, düzeltmeden önce: sayfa taşması sıfır ama kuyruk paneli 0 px. */
const ONCE_768x600 = {
  sayfaDikey: "600/600", sayfaYatay: "768/768", dockOrtuyor: false, icerikAlt: 510, dockUstu: 524,
  erisim: { panelH: 0, sonLiYuk: 65, sonKayitPanelde: false, dokunma: false, klavye: true, dockUstunde: true },
  secimler: {
    "Bugünün İşleri": { sayfaDikey: "600/600", dockOrtuyor: false, govde: { kabul: false } },
    Tahsilat: { sayfaDikey: "657/600", dockOrtuyor: true, govde: { kabul: false } },
  },
};

/** 768×600, düzeltmeden sonra ölçülen değerler. */
const SONRA_768x600 = {
  sayfaDikey: "600/600", sayfaYatay: "768/768", dockOrtuyor: false, icerikAlt: 510, dockUstu: 524,
  erisim: { panelH: 139, sonLiYuk: 65, sonKayitPanelde: true, dokunma: true, klavye: true, dockUstunde: true,
    icSekme: { sonGorunur: true } },
  secimler: {
    "Bugünün İşleri": { sayfaDikey: "600/600", dockOrtuyor: false, govde: { kabul: true } },
    Tahsilat: { sayfaDikey: "600/600", dockOrtuyor: false, govde: { kabul: true } },
    "Sistem sağlığı": { sayfaDikey: "600/600", dockOrtuyor: false, govde: { kabul: true } },
    "Son hareketler": { sayfaDikey: "600/600", dockOrtuyor: false, govde: { kabul: true } },
  },
};

test("taşması sıfır olan ama kaydına erişilemeyen ekran KABUL EDİLMEZ", () => {
  const h = tekEkranHukmu("768x600 acik konsol", ONCE_768x600);
  assert.equal(h.gecti, false);
  // Hangi ölçütün düştüğü tek tek söylenmeli: "geçmedi" demek bir sonraki
  // kişiye nereye bakacağını söylemez.
  assert.ok(h.eksik.some((m: string) => m.includes("son kayıt panele sığmıyor")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("tıklanamıyor")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("Tahsilat: sayfa kayıyor (657/600)")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("Tahsilat: dock içeriği örtüyor")), h.eksik.join(" | "));
});

test("düzeltmeden sonraki ölçüm geçer", () => {
  assert.deepEqual(tekEkranHukmu("768x600 acik konsol", SONRA_768x600), {
    ad: "768x600 acik konsol", gecti: true, eksik: [], borc: [], dusmeyenBorc: [],
  });
});

test("ölçülemeyen dock örtmesi GEÇMİŞ sayılmaz", () => {
  /* Görünür kart bulunamayınca Math.max(...[]) -Infinity dönüyor ve örtme
     hiçbir şey ölçmeden "yok" çıkıyordu; null artık düşürür. */
  const h = tekEkranHukmu("390x844 acik konsol", {
    ...SONRA_768x600, dockOrtuyor: null, icerikAlt: null,
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("ölçülemedi")), h.eksik.join(" | "));
});

test("yatay taşma da düşürür", () => {
  const h = tekEkranHukmu("390x844", { ...SONRA_768x600, sayfaYatay: "401/390" });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("yatay kayıyor (401/390)")), h.eksik.join(" | "));
});

test("klavyeyle odaklanılamayan eylem düşürür", () => {
  const h = tekEkranHukmu("1440x600", {
    ...SONRA_768x600, erisim: { ...SONRA_768x600.erisim, klavye: false },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("klavyeyle odaklanamıyor")), h.eksik.join(" | "));
});

test("iç sekme şeridinin sonuna ulaşılamıyorsa düşer", () => {
  const h = tekEkranHukmu("390x844", {
    ...SONRA_768x600, erisim: { ...SONRA_768x600.erisim, icSekme: { sonGorunur: false } },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("iç sekme")), h.eksik.join(" | "));
});

/*
  25.11.2026, ikinci tur: iki kusur daha yalnızca göz ve ayrı bir ölçümle
  görüldü, çünkü sayfa taşması ikisinde de SIFIRDI.
*/

/** 1440×900: nabız sütununda Tahsilat grafiği panelini aşıp alttaki kartın üstüne biniyordu. */
const KART_CAKISMASI = {
  sayfaDikey: "900/900", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 810, dockUstu: 824,
  kartPanelde: [
    { panel: "isler", panelH: 474, kartH: 474, panelAsiyor: 0, panelKayiyor: false },
    { panel: "tahsilat", panelH: 70, kartH: 187, panelAsiyor: 117, panelKayiyor: false },
    { panel: "saglik", panelH: 93, kartH: 93, panelAsiyor: 0, panelKayiyor: false },
  ],
};

test("kart panelini aşıp kardeşinin üstüne biniyorsa KABUL EDİLMEZ", () => {
  const h = tekEkranHukmu("1440x900 acik konsol", KART_CAKISMASI);
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("tahsilat: kart panelini 117 px aşıyor")), h.eksik.join(" | "));
  // Paneli kendi içinde kayan kart kusur değil: grafik kartının seçici
  // açıkken çözümü budur ve iki kez işaretlenmemeli.
  const kayan = tekEkranHukmu("390x844", {
    ...KART_CAKISMASI,
    kartPanelde: [{ panel: "tahsilat", panelH: 70, kartH: 187, panelAsiyor: 117, panelKayiyor: true }],
  });
  assert.deepEqual(kayan.eksik, []);
});

/** 390×844: şerit 364 px, içeriği 453 px; iki sekme kutunun dışındaydı. */
const SEKME_KAYIYOR = {
  sayfaDikey: "844/844", sayfaYatay: "390/390", dockOrtuyor: false, icerikAlt: 774, dockUstu: 781,
  erisim: {
    panelH: 216, sonLiYuk: 129, sonKayitPanelde: true, dokunma: true, klavye: true, dockUstunde: true,
    icSekme: { sayi: 5, yatayTasiyor: true, yukseklik: 45, tabDurakSayisi: 1,
      erisilemeyen: ["Dönem · 2", "Sorun"], sonGorunur: false },
  },
};

test("kuyruk sekmesine yalnızca yatay kaydırmayla ulaşılıyorsa KABUL EDİLMEZ", () => {
  const h = tekEkranHukmu("390x844 acik konsol", SEKME_KAYIYOR);
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("yatay kayıyor")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("Sorun")), h.eksik.join(" | "));
});

test("sarmış şerit geçer: taşma yok, her sekme erişilebilir", () => {
  const h = tekEkranHukmu("390x844 acik konsol", {
    ...SEKME_KAYIYOR,
    erisim: { ...SEKME_KAYIYOR.erisim,
      icSekme: { sayi: 5, yatayTasiyor: false, yukseklik: 89, tabDurakSayisi: 1, erisilemeyen: [], sonGorunur: true },
      klavyeGezinti: ["Ödeme · 6", "Sözleşme · 1", "Kurulum", "Dönem · 2", "Sorun"].map((ad) => ({
        ad, odakSeritte: true, secili: true, panelGorunur: true,
      })) },
  });
  assert.deepEqual(h.eksik, []);
});

test("şerit taşmasa da tıklanamayan sekme düşürür", () => {
  /* Kutunun içinde görünüp üstünü başka bir şeyin örtmesi de erişilmezlik:
     ölçüm elementFromPoint ile bakıyor, yalnızca koordinata değil. */
  const h = tekEkranHukmu("390x844", {
    ...SEKME_KAYIYOR,
    erisim: { ...SEKME_KAYIYOR.erisim,
      icSekme: { sayi: 5, yatayTasiyor: false, yukseklik: 89, tabDurakSayisi: 1, erisilemeyen: ["Sorun"], sonGorunur: true } },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("dokunmayla açılamayan kuyruk sekmesi: Sorun")), h.eksik.join(" | "));
});

test("ok tuşuyla ulaşılamayan sekme düşürür", () => {
  /* Şerit sarmış ve her düğme görünür olabilir; sekme yine de KLAVYEYLE
     açılmıyor olabilir (ok tuşu bağlanmamış, odak şeritten çıkmış,
     panel çizilmemiş). Ölçüm tuşa gerçekten basıyor. */
  const temel = {
    sayfaDikey: "390/390".replace("390/390", "844/844"), sayfaYatay: "390/390",
    dockOrtuyor: false, icerikAlt: 774, dockUstu: 781,
    erisim: {
      panelH: 172, sonLiYuk: 129, sonKayitPanelde: true, dokunma: true, klavye: true, dockUstunde: true,
      icSekme: { sayi: 5, yatayTasiyor: false, yukseklik: 89, tabDurakSayisi: 1, erisilemeyen: [], sonGorunur: true },
      klavyeGezinti: [
        { ad: "Ödeme · 6", odakSeritte: true, secili: true, panelGorunur: true },
        { ad: "Sorun", odakSeritte: true, secili: true, panelGorunur: false },
      ],
    },
  };
  const h = tekEkranHukmu("390x844", temel);
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("klavyeyle 2/5 sekmeye ulaşıldı")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("klavyeyle açılamayan kuyruk sekmesi: Sorun")), h.eksik.join(" | "));
});

test("gezici odak kalıbı bozulursa düşer", () => {
  /* tablist'te Tab ile tek durak olmalı. Sıfır durak şeridin klavyeye hiç
     açılmadığı, beş durak her sekmenin ayrı Tab durağı olduğu (kalıp
     bozulmuş) anlamına gelir. */
  for (const durak of [0, 5]) {
    const h = tekEkranHukmu("390x844", {
      sayfaDikey: "844/844", sayfaYatay: "390/390", dockOrtuyor: false, icerikAlt: 774, dockUstu: 781,
      erisim: { sonKayitPanelde: true, dokunma: true, klavye: true, dockUstunde: true,
        icSekme: { sayi: 1, yatayTasiyor: false, yukseklik: 45, tabDurakSayisi: durak, erisilemeyen: [], sonGorunur: true } },
    });
    assert.equal(h.gecti, false);
    assert.ok(h.eksik.some((m: string) => m.includes(`${durak} Tab durağı`)), h.eksik.join(" | "));
  }
});

test("son sekme açıkken sayfa kayarsa düşer; dönüş yolu da ölçülür", () => {
  const temel = {
    sayfaDikey: "844/844", sayfaYatay: "390/390", dockOrtuyor: false, icerikAlt: 774, dockUstu: 781,
  };
  const h = tekEkranHukmu("390x844", {
    ...temel,
    sonSekme: { ad: "Sorun", sayfaDikey: "903/844", sayfaYatay: "390/390", dockOrtuyor: true, zincir: { kartPanelde: [] } },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("Sorun açıkken sayfa kayıyor (903/844)")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("Sorun açıkken dock içeriği örtüyor")), h.eksik.join(" | "));

  /* Sorun seçiliyken görünüm sekmesine dönmek ayrı bir yol ve ayrı ölçülür:
     ilk ölçümde burası düşmüştü. */
  const d = tekEkranHukmu("390x844", {
    ...temel,
    sonSekme: { ad: "Sorun", sayfaDikey: "844/844", sayfaYatay: "390/390", dockOrtuyor: false, zincir: { kartPanelde: [] } },
    sonSekmeDonus: { sayfaDikey: "844/844", sayfaYatay: "390/390", dockOrtuyor: false,
      zincir: { kartPanelde: [{ panel: "isler", panelH: 179, kartH: 268, panelAsiyor: 89, panelKayiyor: false }] } },
  });
  assert.equal(d.gecti, false);
  assert.ok(d.eksik.some((m: string) => m.includes("görünüme dönünce isler kartı panelini 89 px aşıyor")), d.eksik.join(" | "));
});

/*
  25.11.2026, üçüncü tur: uyarı satırı varken 0 px gövde artık başarısız.
  Sayılar nabız sütununda gerçekten ölçülenler.
*/
const SAGLIK_BOS = {
  sayfaDikey: "900/900", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 810, dockUstu: 824,
  uyariVar: true,
  kartlar: [
    { panel: "saglik", govde: { h: 0 }, kayit: 3, sonKayitErisilir: null },
    { panel: "hareketler", govde: { h: 75 }, kayit: 12, sonKayitErisilir: true },
  ],
};

test("uyarı varken 0 px gövde KABUL EDİLMEZ", () => {
  const h = tekEkranHukmu("1440x900 acik konsol", SAGLIK_BOS);
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("uyarı varken saglik kartının gövdesi 0 px (3 kayıt görünmüyor)")), h.eksik.join(" | "));
});

test("gövde 0 değil ama son kayda erişilemiyorsa düşer", () => {
  /* 11 px'lik bir gövdede 40 px'lik satır hiçbir zaman okunmaz: "0 değil"
     tek başına ölçüt olsaydı o hâli geçirirdi. */
  const h = tekEkranHukmu("1440x900", {
    ...SAGLIK_BOS,
    kartlar: [{ panel: "saglik", govde: { h: 11 }, kayit: 3, sonKayitErisilir: false }],
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("saglik kartının son kaydına kart içinden erişilemiyor")), h.eksik.join(" | "));
});

test("düzeltmeden sonraki nabız sütunu geçer", () => {
  const h = tekEkranHukmu("1440x900", {
    ...SAGLIK_BOS,
    kartlar: [
      { panel: "saglik", govde: { h: 50 }, kayit: 3, sonKayitErisilir: true },
      { panel: "hareketler", govde: { h: 50 }, kayit: 12, sonKayitErisilir: true },
    ],
  });
  assert.deepEqual(h.eksik, []);
});

test("seçici açıkken seçilen sekmenin kartı da denetlenir", () => {
  /* İlk turda 0 px gövde tam burada çıkmıştı: sekme seçiliyor, kart
     çiziliyor, içindeki kayıt görünmüyordu. */
  const h = tekEkranHukmu("1440x600", {
    sayfaDikey: "600/600", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 510, dockUstu: 524,
    uyariVar: true, kartlar: [],
    secimler: {
      "Sistem sağlığı": { sayfaDikey: "600/600", dockOrtuyor: false, govde: { kabul: true },
        kartlar: [{ panel: "saglik", govde: { h: 0 }, kayit: 3, sonKayitErisilir: null }] },
    },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("Sistem sağlığı: uyarı varken saglik kartının gövdesi 0 px")), h.eksik.join(" | "));
});

test("bilinen borç hükmü düşürmez ama sessiz de kalmaz", () => {
  /* 901×641 kabul setine girince kiracı CRM'inde iki kartın son kaydına
     erişilemediği görüldü; ölçüm bunun konsol değişikliklerinden ÖNCE de
     olduğunu gösterdi. Kapsam dışı olduğu için düşürmüyor, ama koşuda
     adıyla yazılıyor. */
  const h = tekEkranHukmu("901x641 acik crm", {
    sayfaDikey: "641/641", sayfaYatay: "901/901", dockOrtuyor: false, icerikAlt: 500, dockUstu: 565,
    kartlar: [
      { panel: "yeni", govde: { h: 120 }, kayit: 8, sonKayitErisilir: false },
      { panel: "imzali", govde: { h: 120 }, kayit: 8, sonKayitErisilir: false },
    ],
  });
  assert.equal(h.gecti, true);
  assert.deepEqual(h.eksik, []);
  assert.equal(h.borc.length, 2);
  assert.deepEqual(h.dusmeyenBorc, []);
});

test("borç düzelince liste eskimiş sayılır", () => {
  const h = tekEkranHukmu("901x641 acik crm", {
    sayfaDikey: "641/641", sayfaYatay: "901/901", dockOrtuyor: false, icerikAlt: 500, dockUstu: 565,
    kartlar: [{ panel: "yeni", govde: { h: 200 }, kayit: 8, sonKayitErisilir: true },
      { panel: "imzali", govde: { h: 200 }, kayit: 8, sonKayitErisilir: true }],
  });
  assert.equal(h.dusmeyenBorc.length, 2, "düzelen borç bildirilmeli");
});

test("borç listesi başka bir kusuru örtmez", () => {
  const h = tekEkranHukmu("901x641 acik crm", {
    sayfaDikey: "700/641", sayfaYatay: "901/901", dockOrtuyor: false, icerikAlt: 500, dockUstu: 565,
    kartlar: [{ panel: "yeni", govde: { h: 120 }, kayit: 8, sonKayitErisilir: false },
      { panel: "imzali", govde: { h: 120 }, kayit: 8, sonKayitErisilir: false }],
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("sayfa dikey kayıyor")), h.eksik.join(" | "));
});

/*
  26.11.2026, Genel Bakış yeniden kuruldu: kuyruk kendi bölümüne taşındı,
  ekranda ürün performansı ve öncelikli işler var. Yeni ölçütler.
*/
const GENEL_TEMEL = {
  sayfaDikey: "900/900", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 810, dockUstu: 824,
  masaustu: true,
  urunTablosu: { satir: 4, tamGorunen: 4, govdeH: 190 },
  erisim: {
    urunSayisi: 4, erisilemeyenUrun: [],
    sonIs: { metin: "Yanıt bekleyen", dokunma: true, klavye: true, dockUstunde: true },
  },
};

test("masaüstünde dört ürün kaydırmadan görünmeli", () => {
  assert.deepEqual(tekEkranHukmu("1440x900 acik konsol", GENEL_TEMEL).eksik, []);
  const h = tekEkranHukmu("1440x900 acik konsol", {
    ...GENEL_TEMEL, urunTablosu: { bicim: "tablo", satir: 4, tamGorunen: 1, govdeH: 85 },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("ürün satırlarının 1/4'i görünüyor")), h.eksik.join(" | "));
});

test("dar ekranda kaydırma doğal: dört ürün kuralı yalnızca masaüstünde", () => {
  /* Ara genişlik (ne masaüstü ne mobil): kart içinde kaydırma kusur
     değil, dört satır zorunlu değil. */
  const h = tekEkranHukmu("901x641 acik konsol", {
    ...GENEL_TEMEL, masaustu: false, mobil: false, sayfaDikey: "641/641", sayfaYatay: "901/901",
    urunTablosu: { bicim: "tablo", satir: 4, tamGorunen: 1, govdeH: 88 },
  });
  assert.deepEqual(h.eksik, []);
});

test("mobilde de dört ürün ilk görünümde olmalı", () => {
  /* Ürün kararı (26.11.2026): 390×844'te dört ürünün adı ve seçili
     ölçütü kompakt satırlarda karşılaştırılabilmeli. Eskiden mobil
     muaftı ve kart içinde kaydırmak kabul sayılıyordu. */
  const h = tekEkranHukmu("390x844 acik konsol", {
    ...GENEL_TEMEL, masaustu: false, mobil: true, sayfaDikey: "844/844", sayfaYatay: "390/390",
    urunTablosu: { bicim: "liste", satir: 4, tamGorunen: 1, govdeH: 57 },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("1/4")), h.eksik.join(" | "));
});

test("mobilde dördü de görünüyorsa geçer", () => {
  const h = tekEkranHukmu("390x844 acik konsol", {
    ...GENEL_TEMEL, masaustu: false, mobil: true, sayfaDikey: "844/844", sayfaYatay: "390/390",
    urunTablosu: { bicim: "liste", satir: 4, tamGorunen: 4, govdeH: 199 },
  });
  assert.deepEqual(h.eksik, []);
});

test("ilk öncelikli iş kesiliyorsa düşer", () => {
  /* 1440×600'de gövde 38 px, satır 56 px: kart "bekleyen iş var"
     diyor ama işin kendisini göstermiyordu. */
  const h = tekEkranHukmu("1440x600 acik konsol", {
    ...GENEL_TEMEL, ilkIs: { tam: false, eylemTam: false, h: 56, govdeH: 38 },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("ilk öncelikli iş kesiliyor")), h.eksik.join(" | "));
});

test("ilk iş tam ama eylemi kesikse düşer", () => {
  const h = tekEkranHukmu("1440x600 acik konsol", {
    ...GENEL_TEMEL, ilkIs: { tam: true, eylemTam: false, h: 56, govdeH: 60 },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("ilk öncelikli işin eylemi kesiliyor")), h.eksik.join(" | "));
});

test("ürün detayında altı bölüm seçilebilmeli", () => {
  /* Dar pencerede tek seçici, geniş pencerede şerit; hangisi
     görünüyorsa o ölçülüyor. */
  const temel = { sayfaDikey: "844/844", sayfaYatay: "390/390", dockOrtuyor: false, icerikAlt: 700, dockUstu: 781 };
  assert.deepEqual(
    tekEkranHukmu("390x844 acik urundetay", { ...temel, bolumSecimi: { bicim: "secici", sayi: 6, icerde: true, klavye: true } }).eksik,
    [],
  );
  const eksikBolum = tekEkranHukmu("390x844 acik urundetay", { ...temel, bolumSecimi: { bicim: "secici", sayi: 4, icerde: true, klavye: true } });
  assert.ok(eksikBolum.eksik.some((m: string) => m.includes("4 bölüm")), eksikBolum.eksik.join(" | "));
});

test("bölüm şeridi kaydırılarak sığdırılmış sayılmaz", () => {
  /* Kaydırılan şerit sekmenin VARLIĞINI gizler; kuyruk sekmelerinde
     aynı kusur ölçülmüştü. */
  const h = tekEkranHukmu("768x600 acik urundetay", {
    sayfaDikey: "600/600", sayfaYatay: "768/768", dockOrtuyor: false, icerikAlt: 500, dockUstu: 530,
    bolumSecimi: { bicim: "serit", sayi: 6, icerde: false, disarida: ["Destek"], klavye: true, kaydirma: true },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("bölüm seçimi ekrana sığmıyor")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("bölüm şeridi yatay kayıyor")), h.eksik.join(" | "));
});

test("açılamayan ürün satırı ve erişilemeyen öncelikli iş düşürür", () => {
  const h = tekEkranHukmu("1440x600 acik konsol", {
    ...GENEL_TEMEL,
    erisim: {
      urunSayisi: 4, erisilemeyenUrun: ["Aç →", "Aç →"],
      sonIs: { metin: "Yanıt bekleyen", dokunma: false, klavye: true, dockUstunde: false },
    },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("açılamayan ürün satırı")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("son öncelikli işin eylemi erişilemiyor")), h.eksik.join(" | "));
});

test("ürün satırı hiç yoksa ekran boş sayılmaz, DÜŞER", () => {
  /* Tablo çizilmediyse "sorun yok" değil, "ölçülemedi" durumudur. */
  const h = tekEkranHukmu("1440x900 acik konsol", {
    ...GENEL_TEMEL, erisim: { urunSayisi: 0, erisilemeyenUrun: [] },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("ürün satırı bulunamadı")), h.eksik.join(" | "));
});

test("ürün detayı da tek ekran: dikey kayma muafiyeti kalktı", () => {
  /* Önceki sürüm kayıt sayfasına muafiyet tanıyordu ve detay 390×844'te
     1254/844 kayarken kabul geçiyordu. */
  const h = tekEkranHukmu("390x844 acik urundetay", {
    sayfaDikey: "1254/844", sayfaYatay: "390/390", dockOrtuyor: false, icerikAlt: 700, dockUstu: 781,
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("sayfa dikey kayıyor (1254/844)")), h.eksik.join(" | "));
});
