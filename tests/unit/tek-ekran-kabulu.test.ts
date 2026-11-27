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

test("son ürüne kart içinden ulaşılamıyorsa düşer", () => {
  /* 1440×600'de dört satır sığmıyor; kabul, kartın kaymasına ve
     kaydırınca son ürünün TAM görünmesine bağlı. */
  const temel = { sayfaDikey: "600/600", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 500, dockUstu: 530 };
  const h = tekEkranHukmu("1440x600 acik konsol", {
    ...temel, sonUrun: { kartKayabilir: true, tam: false, dokunma: true, klavye: true, metin: "ArvoCal" },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("son ürüne kart içinden ulaşılamıyor")), h.eksik.join(" | "));

  const iyi = tekEkranHukmu("1440x600 acik konsol", {
    ...temel, sonUrun: { kartKayabilir: true, tam: true, dokunma: true, klavye: true, metin: "ArvoCal" },
  });
  assert.deepEqual(iyi.eksik, []);
});

test("son ürünün eylemi tıklanamıyor ya da odaklanamıyorsa düşer", () => {
  const h = tekEkranHukmu("1440x600 koyu konsol", {
    sayfaDikey: "600/600", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 500, dockUstu: 530,
    sonUrun: { kartKayabilir: true, tam: true, dokunma: false, klavye: false, metin: "ArvoCal" },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("tıklanamıyor")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("klavyeyle odaklanamıyor")), h.eksik.join(" | "));
});

test("sol menüde iki girdi birden seçiliyse düşer", () => {
  /* 26.11.2026'da ürün detayında ÖLÇÜLEN durum: "Ürünler" sayfa olarak
     etkin, "Uygulamalar" da rotaya bakıp vurgulanıyordu. Pencere
     kapalıyken en çok bir girdi seçili olmalı. */
  const temel = { sayfaDikey: "900/900", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 700, dockUstu: 860 };
  const menu = {
    ortuyor: false, oge: 7, adsiz: 0, ipucusuz: 0, odaklanamayan: 0, sag: 240, icerikSol: 264, pencereAcik: false,
    marka: { dosya: "arvoos-320.png", yuklendi: true, genislik: 150, oranSapmasi: 0.014 },
  };
  const h = tekEkranHukmu("1440x900 acik urundetay", {
    ...temel, yanMenu: { ...menu, secili: ["Ürünler ve Fiyatlar", "Uygulamalar"] },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("2 girdi birden seçili")), h.eksik.join(" | "));

  /* Tek seçili: geçer. */
  assert.deepEqual(tekEkranHukmu("1440x900 acik urundetay", {
    ...temel, yanMenu: { ...menu, secili: ["Ürünler ve Fiyatlar"] },
  }).eksik, []);

  /* Pencere AÇIKKEN iki vurgu beklenen durum: düğme kendi penceresini
     gösteriyor, sayfa vurgusu da yerinde kalıyor. */
  assert.deepEqual(tekEkranHukmu("1440x900 acik urundetay", {
    ...temel, yanMenu: { ...menu, pencereAcik: true, secili: ["Ürünler ve Fiyatlar", "Uygulamalar"] },
  }).eksik, []);
});

test("ürün kartı içerik genişliğini kullanmıyorsa düşer", () => {
  const temel = { sayfaDikey: "600/600", sayfaYatay: "768/768", dockOrtuyor: false, icerikAlt: 500, dockUstu: 540 };
  /* 768×600, düzeltmeden önce GERÇEKTEN ölçülen değerler: 680 px'lik
     ızgarada 384 px'lik kart, sağda 296 px boşluk, metrikler tek sütun. */
  const h = tekEkranHukmu("768x600 acik urundetay", {
    ...temel, kartHizasi: { tekSatir: true, kartG: 384, bosluk: 296, seciciyeFark: 296, seritSutun: 1, metrikSutun: 1 },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("sağda 296 px boşluk")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("hizalı değil")), h.eksik.join(" | "));

  /* Düzeltmeden sonra ölçülen: kart ızgarayı bitiriyor, metrikler yan yana. */
  assert.deepEqual(tekEkranHukmu("768x600 acik urundetay", {
    ...temel, kartHizasi: { tekSatir: true, kartG: 680, bosluk: 0, seciciyeFark: 0, seritSutun: 2, metrikSutun: 2 },
  }).eksik, []);

  /* Telefon: eylem başlığın altında, hiza ölçülmüyor; geniş kart kuralı
     da 366 px'te geçerli değil. */
  assert.deepEqual(tekEkranHukmu("390x844 acik urundetay", {
    sayfaDikey: "844/844", sayfaYatay: "390/390", dockOrtuyor: false, icerikAlt: 700, dockUstu: 781,
    kartHizasi: { tekSatir: false, kartG: 366, bosluk: 0, seciciyeFark: -210, seritSutun: 1, metrikSutun: 1 },
  }).eksik, []);

  /* 700 px'den geniş kartta metrikler alt alta kalırsa düşer. */
  const g = tekEkranHukmu("1440x900 acik urundetay", {
    sayfaDikey: "900/900", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 700, dockUstu: 860,
    kartHizasi: { tekSatir: true, kartG: 1152, bosluk: 0, seciciyeFark: 0, seritSutun: 3, metrikSutun: 1 },
  });
  assert.equal(g.gecti, false);
  assert.ok(g.eksik.some((m: string) => m.includes("metrikler tek sütunda")), g.eksik.join(" | "));
});

test("menüdeki marka kırıksa, ezikse ya da yoksa düşer", () => {
  /* 26.11.2026 inceleme bulgusu: dar menüde logo yerine kırık görsel
     simgesi vardı. "Öğe DOM'da" yetmez — dosya yüklenmiş olmalı. */
  const temel = { sayfaDikey: "900/900", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 700, dockUstu: 860 };
  const menu = { ortuyor: false, oge: 7, adsiz: 0, ipucusuz: 0, odaklanamayan: 0, sag: 64, icerikSol: 88, pencereAcik: false, secili: ["Genel Bakış"] };

  const kirik = tekEkranHukmu("1440x900 acik konsol", {
    ...temel, yanMenu: { ...menu, marka: { dosya: "arvoos-simge-68.png", yuklendi: false, genislik: 34, oranSapmasi: 0 } },
  });
  assert.equal(kirik.gecti, false);
  assert.ok(kirik.eksik.some((m: string) => m.includes("yüklenmedi")), kirik.eksik.join(" | "));

  /* 2:1 işaret 1:1 kutuya sıkıştırılırsa (eski 28×28 kuralı) oran %100 sapar. */
  const ezik = tekEkranHukmu("1440x900 acik konsol", {
    ...temel, yanMenu: { ...menu, marka: { dosya: "arvoos-simge-68.png", yuklendi: true, genislik: 28, oranSapmasi: 1 } },
  });
  assert.ok(ezik.eksik.some((m: string) => m.includes("oranı bozuk")), ezik.eksik.join(" | "));

  /* Marka hiç çizilmiyorsa da düşer. */
  const yok = tekEkranHukmu("1440x900 acik konsol", { ...temel, yanMenu: { ...menu, marka: null } });
  assert.ok(yok.eksik.some((m: string) => m.includes("marka çizilmiyor")), yok.eksik.join(" | "));

  /* Sağlam: görüntüleme dosyalarının yuvarlanmasından gelen %1,4'lük
     sapma geçer — mutlak farkla ölçülürken sağlam logo da düşüyordu. */
  assert.deepEqual(tekEkranHukmu("1440x900 acik konsol", {
    ...temel, yanMenu: { ...menu, marka: { dosya: "arvoos-320.png", yuklendi: true, genislik: 150, oranSapmasi: 0.014 } },
  }).eksik, []);
});

test("iki katlı menü: alt kat yanlış kurulmuşsa düşer", () => {
  /*
    26.11.2026, onaylı mockup. Dört ölçüt birlikte aranıyor; üçü tek
    başına yanıltıcı. Aşağıdaki "sağlam" değerler 1440×900'de GERÇEKTEN
    ölçülenler (Finans → Tahsilatlar).
  */
  const temel = { sayfaDikey: "900/900", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 700, dockUstu: 860 };
  const menu = {
    ortuyor: false, oge: 5, adsiz: 0, ipucusuz: 0, odaklanamayan: 0, sag: 240, icerikSol: 264, pencereAcik: false,
    secili: ["Tahsilatlar"],
    marka: { dosya: "arvoos-320.png", yuklendi: true, genislik: 116, oranSapmasi: 0.002 },
    seritGorunur: false,
  };
  const saglam = {
    modul: "Finans", geriDugme: true, geriMetin: "Ana menüye dön", bolum: 3, baglantili: true,
    adlar: ["Tahsilatlar", "Ödeme onayları", "Abonelikler"], secili: ["Tahsilatlar"], anaListeGizli: true,
  };
  assert.deepEqual(tekEkranHukmu("1440x900 acik konsol", { ...temel, yanMenu: { ...menu, altKat: saglam } }).eksik, []);

  /* Geri dönüş bağlantı olursa adres değişir: açık sayfa ve süzgeçler gider. */
  const baglanti = tekEkranHukmu("1440x900 acik konsol", {
    ...temel, yanMenu: { ...menu, altKat: { ...saglam, geriDugme: false } },
  });
  assert.equal(baglanti.gecti, false);
  assert.ok(baglanti.eksik.some((m: string) => m.includes("düğme değil")), baglanti.eksik.join(" | "));

  /* Bölümler düğme olursa adres paylaşılamaz. */
  assert.ok(tekEkranHukmu("1440x900 acik konsol", {
    ...temel, yanMenu: { ...menu, altKat: { ...saglam, baglantili: false } },
  }).eksik.some((m: string) => m.includes("bağlantı değil")));

  /* Ana liste ile alt menü aynı anda: 240 px'lik panel taşar. */
  assert.ok(tekEkranHukmu("1440x900 acik konsol", {
    ...temel, yanMenu: { ...menu, altKat: { ...saglam, anaListeGizli: false } },
  }).eksik.some((m: string) => m.includes("aynı anda")));

  /* Yatay şerit de çiziliyorsa aynı bağlantı iki yerde "seçili" görünür. */
  assert.ok(tekEkranHukmu("1440x900 acik konsol", {
    ...temel, yanMenu: { ...menu, seritGorunur: true, altKat: saglam },
  }).eksik.some((m: string) => m.includes("şeridi alt menüyle birlikte")));
});

test("iki katlı gezinme: geri dönüş adresi değiştirirse düşer", () => {
  /* 1440×900'de tıklamayla ölçülen sağlam yol. */
  const temel = { sayfaDikey: "900/900", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 700, dockUstu: 860 };
  const saglam = {
    baslangic: { adres: "/panel", kat: "ana", odak: "Aç", secili: ["Ana Sayfa"] },
    modulAcildi: { adres: "/panel/platform/tahsilat", kat: "alt", odak: "Ana menüye dön", secili: ["Tahsilatlar"] },
    bolumSecildi: { adres: "/panel/platform/billing", kat: "alt", odak: "Abonelikler", secili: ["Abonelikler"] },
    anaMenuyeDonuldu: { adres: "/panel/platform/billing", kat: "ana", odak: "Finans4", secili: ["Finans4"] },
    tarayiciGeri: { adres: "/panel/platform/tahsilat", kat: "ana", odak: "Finans4", secili: ["Finans4"] },
  };
  assert.deepEqual(tekEkranHukmu("1440x900 acik konsol", { ...temel, katGezinme: saglam }).eksik, []);

  /* Geri dönüş bir bağlantı olsaydı ölçüm tam olarak böyle görünürdü:
     ana liste gelir ama adres de modülün girişine atlar. */
  const adresKaydi = tekEkranHukmu("1440x900 acik konsol", {
    ...temel,
    katGezinme: { ...saglam, anaMenuyeDonuldu: { ...saglam.anaMenuyeDonuldu, adres: "/panel/platform/tahsilat" } },
  });
  assert.equal(adresKaydi.gecti, false);
  assert.ok(adresKaydi.eksik.some((m: string) => m.includes("adresi değiştiriyor")), adresKaydi.eksik.join(" | "));

  /* Odak eski düğmede kalırsa klavye kullanıcısı listenin başına döner. */
  assert.ok(tekEkranHukmu("1440x900 acik konsol", {
    ...temel, katGezinme: { ...saglam, modulAcildi: { ...saglam.modulAcildi, odak: "Finans4" } },
  }).eksik.some((m: string) => m.includes("Ana menüye dön")));

  /* Tarayıcı geri tuşu bölüm değişikliğini geri almalı. */
  assert.ok(tekEkranHukmu("1440x900 acik konsol", {
    ...temel, katGezinme: { ...saglam, tarayiciGeri: { ...saglam.tarayiciGeri, adres: "/panel/platform/billing" } },
  }).eksik.some((m: string) => m.includes("geri tuşu")));
});

test("üst iki kart kaymış, dar ya da hizasızsa düşer", () => {
  /* 1440×900'de ölçülen sağlam değerler: 58/42, 16 px boşluk, üst
     kenarlar aynı hatta, sağ/sol kenar alttaki ürün kartıyla hizalı. */
  const temel = { sayfaDikey: "900/900", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 700, dockUstu: 860 };
  const saglam = { yanYana: true, ustFarki: 0, bosluk: 16, oran: 58, sagFarki: 0, solFarki: 0 };
  assert.deepEqual(tekEkranHukmu("1440x900 acik konsol", { ...temel, ustKartlar: saglam }).eksik, []);

  const kaymis = tekEkranHukmu("1440x900 acik konsol", { ...temel, ustKartlar: { ...saglam, ustFarki: 12 } });
  assert.equal(kaymis.gecti, false);
  assert.ok(kaymis.eksik.some((m: string) => m.includes("üst kenarı 12 px")), kaymis.eksik.join(" | "));

  assert.ok(tekEkranHukmu("1440x900 acik konsol", { ...temel, ustKartlar: { ...saglam, oran: 50 } })
    .eksik.some((m: string) => m.includes("%50")));
  assert.ok(tekEkranHukmu("1440x900 acik konsol", { ...temel, ustKartlar: { ...saglam, bosluk: 24 } })
    .eksik.some((m: string) => m.includes("24 px")));
  /* PR #330'da ölçülen hata sınıfı: kart ızgarayı bitirmiyor. */
  assert.ok(tekEkranHukmu("1440x900 acik konsol", { ...temel, ustKartlar: { ...saglam, sagFarki: 296 } })
    .eksik.some((m: string) => m.includes("hizalı değil")));

  /* Dar ekran: kartlar alt alta, oran ve üst hizası ölçülmüyor — ama
     sol/sağ kenar hizası orada da geçerli. */
  assert.deepEqual(tekEkranHukmu("390x844 acik konsol", {
    sayfaDikey: "844/844", sayfaYatay: "390/390", dockOrtuyor: false, icerikAlt: 700, dockUstu: 781,
    ustKartlar: { yanYana: false, ustFarki: 313, bosluk: 16, oran: 50, sagFarki: 0, solFarki: 0 },
  }).eksik, []);
});

test("kaplama odağı içeri almıyor, Esc kapatmıyor ya da odak dönmüyorsa düşer", () => {
  /* 1440×900'de ölçülen sağlam değerler (komut paleti, dönem seçici,
     Uygulamalar penceresi). */
  const temel = { sayfaDikey: "900/900", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 700, dockUstu: 860 };
  const saglam = {
    komutPaleti: { acik: true, odakIcinde: true, acikkenOdak: "Ara", kapandi: true, beklenenOdak: "Aç", odakDondu: "Aç" },
    donemSecici: { acik: true, odakIcinde: true, acikkenOdak: "Dönem seç", kapandi: true, beklenenOdak: "Dönem seç", odakDondu: "Dönem seç" },
    uygulamalar: { acik: true, odakIcinde: true, acikkenOdak: "Kapat", kapandi: true, beklenenOdak: "Uygulamalar", odakDondu: "Uygulamalar" },
  };
  assert.deepEqual(tekEkranHukmu("1440x900 acik konsol", { ...temel, kaplamalar: saglam }).eksik, []);

  /* Odak <body>'de kalırsa klavye kullanıcısı sayfanın başına düşer. */
  const odaksiz = tekEkranHukmu("1440x900 acik konsol", {
    ...temel, kaplamalar: { ...saglam, uygulamalar: { ...saglam.uygulamalar, odakDondu: "" } },
  });
  assert.equal(odaksiz.gecti, false);
  assert.ok(odaksiz.eksik.some((m: string) => m.includes("odak dönmüyor")), odaksiz.eksik.join(" | "));

  assert.ok(tekEkranHukmu("1440x900 acik konsol", {
    ...temel, kaplamalar: { ...saglam, komutPaleti: { ...saglam.komutPaleti, kapandi: false } },
  }).eksik.some((m: string) => m.includes("Esc ile kapanmıyor")));

  assert.ok(tekEkranHukmu("1440x900 acik konsol", {
    ...temel, kaplamalar: { ...saglam, komutPaleti: { ...saglam.komutPaleti, odakIcinde: false } },
  }).eksik.some((m: string) => m.includes("odak içeri girmiyor")));
});

test("ray çekmecesi: geri ve kapat ayrı, bölümler bağlantı, şerit gizli", () => {
  /* 768×600'de ölçülen sağlam değerler (Finans ikonu → çekmece). */
  const temel = { sayfaDikey: "600/600", sayfaYatay: "768/768", dockOrtuyor: false, icerikAlt: 500, dockUstu: 540 };
  const saglam = {
    acik: true, baslik: "Finans", geriMetin: "Ana menüye dön", kapatVar: true,
    adlar: ["Tahsilatlar", "Ödeme onayları", "Abonelikler"], baglantili: true,
    odakIcinde: true, odak: "Ana menüye dön", seritGorunur: false,
    kapandi: true, odakDondu: "Finans, 4 bekleyen bölümleri",
  };
  assert.deepEqual(tekEkranHukmu("768x600 acik konsol", { ...temel, rayCekmece: saglam }).eksik, []);

  const kapali = tekEkranHukmu("768x600 acik konsol", { ...temel, rayCekmece: { acik: false } });
  assert.equal(kapali.gecti, false);
  assert.ok(kapali.eksik.some((m: string) => m.includes("çekmeceyi açmıyor")), kapali.eksik.join(" | "));

  /* Şerit de çizilirse aynı sayfa iki yerde "seçili" görünür. */
  assert.ok(tekEkranHukmu("768x600 acik konsol", { ...temel, rayCekmece: { ...saglam, seritGorunur: true } })
    .eksik.some((m: string) => m.includes("şerit de çiziliyor")));
  /* Odak ray düğmesine dönmezse klavye kullanıcısı listenin başına düşer. */
  assert.ok(tekEkranHukmu("768x600 acik konsol", { ...temel, rayCekmece: { ...saglam, odakDondu: "" } })
    .eksik.some((m: string) => m.includes("ray düğmesine dönmüyor")));
  /* Bölümler düğme olursa adres paylaşılamaz. */
  assert.ok(tekEkranHukmu("768x600 acik konsol", { ...temel, rayCekmece: { ...saglam, baglantili: false } })
    .eksik.some((m: string) => m.includes("bağlantı değil")));
});

test("telefon paneli: geri bir üst kata çıkar, kapat paneli kapatır", () => {
  /* 390×844'te ölçülen sağlam akış. */
  const temel = { sayfaDikey: "844/844", sayfaYatay: "390/390", dockOrtuyor: false, icerikAlt: 700, dockUstu: 781 };
  const saglam = {
    anaKat: { acik: true, kat: "ana", baslik: "Uygulamalar", geriVar: false, kapatVar: true, adlar: ["Ana Sayfa"], odak: "Kapat" },
    altKat: { acik: true, kat: "alt", baslik: "Finans", geriVar: true, kapatVar: true, adlar: ["Tahsilatlar", "Ödeme onayları", "Abonelikler"], odak: "Ana menüye dön" },
    geriDonuldu: { acik: true, kat: "ana", baslik: "Uygulamalar", geriVar: false, kapatVar: true, adlar: ["Ana Sayfa"], odak: "Finans4 okunmamış" },
    kapatildi: { acik: false },
  };
  assert.deepEqual(tekEkranHukmu("390x844 acik konsol", { ...temel, telefonPanel: saglam }).eksik, []);

  /*
    İki denetimi tek düğmeye indirmenin ölçümdeki görüntüsü: geri
    tuşu paneli kapatıyor. Kullanıcı modül listesine dönmek için
    paneli yeniden açmak zorunda kalır.
  */
  const tekDugme = tekEkranHukmu("390x844 acik konsol", {
    ...temel, telefonPanel: { ...saglam, geriDonuldu: { acik: false } },
  });
  assert.equal(tekDugme.gecti, false);
  assert.ok(tekDugme.eksik.some((m: string) => m.includes("paneli kapatıyor")), tekDugme.eksik.join(" | "));

  /* Modül açılınca panel içeriği değişmiyorsa ikinci kat yok demektir. */
  assert.ok(tekEkranHukmu("390x844 acik konsol", {
    ...temel, telefonPanel: { ...saglam, altKat: { ...saglam.altKat, kat: "ana" } },
  }).eksik.some((m: string) => m.includes("alt menüyle değişmiyor")));

  assert.ok(tekEkranHukmu("390x844 acik konsol", {
    ...temel, telefonPanel: { ...saglam, kapatildi: { acik: true } },
  }).eksik.some((m: string) => m.includes("'Kapat' paneli kapatmıyor")));
});

test("menü, adres ve sayfa içeriği aynı akışı göstermeli", () => {
  /*
    26.11.2026 inceleme bulgusu: paylaşılan karede Finans alt menüsü
    açıkken sayfa başlığı hâlâ "Ana Sayfa" idi — düzenek rotadan
    bağımsız tek bir ekran çiziyordu.
  */
  const temel = { sayfaDikey: "900/900", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 700, dockUstu: 860 };
  const saglam = {
    baslangic: { adres: "/panel", kat: "ana", odak: "Uygulamalar", secili: ["Ana Sayfa"], baslik: "Ana Sayfa" },
    modulAcildi: { adres: "/panel/platform/tahsilat", kat: "alt", odak: "Ana menüye dön", secili: ["Tahsilatlar"], baslik: "Tahsilatlar" },
    bolumSecildi: { adres: "/panel/platform/payments", kat: "alt", odak: "Ödeme onayları", secili: ["Ödeme onayları"], baslik: "Ödeme onayları" },
    anaMenuyeDonuldu: { adres: "/panel/platform/payments", kat: "ana", odak: "Finans4", secili: ["Finans4"], baslik: "Ödeme onayları" },
    tarayiciGeri: { adres: "/panel/platform/tahsilat", kat: "ana", odak: "Finans4", secili: ["Finans4"], baslik: "Tahsilatlar" },
  };
  assert.deepEqual(tekEkranHukmu("1440x900 acik konsol", { ...temel, katGezinme: saglam }).eksik, []);

  const bayat = tekEkranHukmu("1440x900 acik konsol", {
    ...temel, katGezinme: { ...saglam, bolumSecildi: { ...saglam.bolumSecildi, baslik: "Ana Sayfa" } },
  });
  assert.equal(bayat.gecti, false);
  assert.ok(bayat.eksik.some((m: string) => m.includes("içerikte hâlâ Ana Sayfa")), bayat.eksik.join(" | "));
});

test("otomasyon satırı: ad, etiket ve açıklama birlikte doğrulanır", () => {
  /*
    27.11.2026 inceleme bulgusu. Telefon kaydında "Veri
    senkronizasyonu" satırı, bağlantı kopukluğunu anlatan bir
    açıklamayla birlikte "Yeniden deneniyor" gösteriyordu. Etiket tek
    başına geçerli bir etiket, açıklama tek başına doğru bir cümle;
    yanlış olan EŞLEŞMEYDİ. Ölçüt bu yüzden üçünü birlikte okuyor.
  */
  const temel = { sayfaDikey: "844/844", sayfaYatay: "390/390", dockOrtuyor: false, icerikAlt: 700, dockUstu: 781 };

  /* Köprü kopuk, kuyruk boş: ölçülen sağlam hâl. */
  const kopuk = [
    { ad: "Otomatik tahsilat", etiket: "Tamamlandı", aciklama: "Son çalışma başarılı.", ton: "success", aciklamaKirpik: false },
    { ad: "Proforma ve hatırlatmalar", etiket: "Gönderildi", aciklama: "2 iş de başarılı.", ton: "success", aciklamaKirpik: false },
    { ad: "Veri senkronizasyonu", etiket: "Bağlantı kesildi", aciklama: "Bir ürüne ulaşılamıyor; kopya eskiyor.", ton: "danger", aciklamaKirpik: false },
  ];
  assert.deepEqual(tekEkranHukmu("390x844 acik konsol", { ...temel, otomasyonSatirlari: kopuk }).eksik, []);

  /* Deneme kuyruğu dolu: ölçülen sağlam hâl. */
  const kuyruk = [
    { ad: "Otomatik tahsilat", etiket: "Yeniden deneniyor", aciklama: "2 abonelikte çekim düştü; deneme hakkı sürüyor.", ton: "warning", aciklamaKirpik: false },
    { ad: "Proforma ve hatırlatmalar", etiket: "Gönderildi", aciklama: "2 iş de başarılı.", ton: "success", aciklamaKirpik: false },
    { ad: "Veri senkronizasyonu", etiket: "Tamamlandı", aciklama: "3 iş de başarılı.", ton: "success", aciklamaKirpik: false },
  ];
  assert.deepEqual(tekEkranHukmu("390x844 acik konsol", { ...temel, otomasyonSatirlari: kuyruk }).eksik, []);

  /* 26.11.2026'da ekranda GERÇEKTEN duran yanlış eşleşme. */
  const eskiHata = tekEkranHukmu("390x844 acik konsol", {
    ...temel,
    otomasyonSatirlari: [{ ad: "Veri senkronizasyonu", etiket: "Yeniden deneniyor", aciklama: "Bir ürüne ulaşılamıyor; eşitleme on dakikada bir yeniden deniyor.", ton: "warning", aciklamaKirpik: false }],
  });
  assert.equal(eskiHata.gecti, false);
  assert.ok(eskiHata.eksik.some((m: string) => m.includes("açıklamasıyla uyuşmuyor")), eskiHata.eksik.join(" | "));

  /* Ton da etikete bağlı: "Bağlantı kesildi" sarı çizilemez. */
  assert.ok(tekEkranHukmu("390x844 acik konsol", {
    ...temel, otomasyonSatirlari: [{ ...kopuk[2], ton: "warning" }],
  }).eksik.some((m: string) => m.includes("tonu warning")));

  /* Sözlükte olmayan bir etiket sessizce geçmez: yeni durum eklenince
     ölçüt de güncellenmeli. */
  assert.ok(tekEkranHukmu("390x844 acik konsol", {
    ...temel, otomasyonSatirlari: [{ ad: "Veri senkronizasyonu", etiket: "Bilinmeyen", aciklama: "…", ton: "success", aciklamaKirpik: false }],
  }).eksik.some((m: string) => m.includes("bilinmeyen durum etiketi")));

  /* Telefonda açıklama kırpılırsa durum yarım okunur. */
  assert.ok(tekEkranHukmu("390x844 acik konsol", {
    ...temel, otomasyonSatirlari: [{ ...kuyruk[0], aciklamaKirpik: true }],
  }).eksik.some((m: string) => m.includes("açıklama kırpılıyor")));
});

test("menü rotayı izlemiyorsa düşer", () => {
  /*
    27.11.2026 inceleme bulgusu: ölçüm düzeneği doğrudan girilen ürün
    rotasında bile sol menüde "Ana Sayfa"yı seçili çiziyordu —
    navigation şimi adresi IMPORT ANINDA donduruyor, senaryonun rotası
    daha sonra yazılıyordu. Ölçüm ekranın YANLIŞ menü durumunu
    gösterdiğinde kanıt kanıt değildir.
  */
  const temel = { sayfaDikey: "900/900", sayfaYatay: "1440/1440", dockOrtuyor: false, icerikAlt: 700, dockUstu: 860 };
  const menu = {
    ortuyor: false, oge: 6, adsiz: 0, ipucusuz: 0, odaklanamayan: 0, sag: 240, icerikSol: 264, pencereAcik: false,
    secili: ["Ürünler"], seritGorunur: false,
    marka: { dosya: "arvoos-320.png", yuklendi: true, genislik: 116, oranSapmasi: 0.002 },
  };
  const yol = "/panel/platform/urunler/arvolab";
  assert.deepEqual(tekEkranHukmu("1440x900 acik urundetay", {
    ...temel, yanMenu: { ...menu, rota: { niyet: yol, cozulen: yol } },
  }).eksik, []);

  /* Ölçülen hata: niyet ürün detayı, çözülen "/panel". */
  const bayat = tekEkranHukmu("1440x900 acik urundetay", {
    ...temel, yanMenu: { ...menu, rota: { niyet: yol, cozulen: "/panel" } },
  });
  assert.equal(bayat.gecti, false);
  assert.ok(bayat.eksik.some((m: string) => m.includes("menü rotayı izlemiyor")), bayat.eksik.join(" | "));

  /* Sorgu dizesi karşılaştırmaya girmiyor: ?bolum= rotayı değiştirmez. */
  assert.deepEqual(tekEkranHukmu("1440x900 acik urundetay", {
    ...temel, yanMenu: { ...menu, rota: { niyet: `${yol}?bolum=abonelikler`, cozulen: yol } },
  }).eksik, []);
});
