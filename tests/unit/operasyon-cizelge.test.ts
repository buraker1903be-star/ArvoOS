import assert from "node:assert/strict";
import test from "node:test";
import {
  asamaSuzgeci,
  asamalariKur,
  ATANMAMIS,
  cizelgeyiKur,
  esZamanliMi,
  isSuzgeci,
  kisilereGoreKur,
  KURUM_ICI,
  asamaPanosuKur,
  BEKLEME_ESIGI_GUN,
  musteriAdlari,
  SABLON_DISI_KOLONU,
  satirlariDiz,
  TAMAMLANDI_KOLONU,
  type CizelgeIsi,
} from "@/lib/operasyon-cizelge";

/*
  Operasyon çizelgesi. Talep operasyoncunun kendi cümlelerinden:
  "Emine Hanım'ın makalesi ve tezi eş zamanlı ilerlediği için, analizler
  geldiğinde her iki çalışmada da hangi aşamada olduğumuzu kolayca
  görebilmek için görevleri ve aşamaları gösteren tarihlerle destekli bir
  iş akış şeması."

  Buradaki iki karar ekranın tamamını belirliyor: aşama çubuğunun nereden
  başladığı ve işlerin müşteriye göre gruplanması.
*/
const adim = (
  sort_order: number,
  title: string,
  due_date: string | null,
  is_completed = false,
  assigned_employee_id: string | null = null,
  completed_at: string | null = null,
) => ({ id: `s${sort_order}`, title, sort_order, due_date, is_completed, assigned_employee_id, completed_at });

const is = (uzerine: Partial<CizelgeIsi> = {}): CizelgeIsi => ({
  id: "w1",
  title: "Tez",
  customer_name: "Emine Yılmaz",
  status: "in_progress",
  priority: "normal",
  start_date: "2026-10-01",
  due_date: "2026-11-30",
  steps: [],
  ...uzerine,
});

test("aşama çubukları", async (t) => {
  await t.test("her aşama önceki aşamanın bitiminden başlıyor", () => {
    /*
      Adımın tek tarihi var (due_date). Tek noktayla göstermek "bu bölüm
      hangi aralıkta yapılacak" sorusunu yanıtlamıyor; zincir kurulduğunda
      plan okunabilir hâle geliyor.
    */
    const asamalar = asamalariKur(is({
      start_date: "2026-10-01",
      steps: [adim(1, "Hazırlık", "2026-10-05"), adim(2, "İç kontrol", "2026-10-12"), adim(3, "Teslim", "2026-10-20")],
    }));
    assert.deepEqual(asamalar.map((a) => a.aralik), [
      { bas: "2026-10-01", son: "2026-10-05" },
      { bas: "2026-10-05", son: "2026-10-12" },
      { bas: "2026-10-12", son: "2026-10-20" },
    ]);
  });

  await t.test("tarihsiz aşama çubuk almıyor ve zinciri kırmıyor", () => {
    // Uydurma bir aralık çizmek, boş bırakmaktan kötü; ama sonraki aşamanın
    // başlangıcı da kaymamalı.
    const asamalar = asamalariKur(is({
      start_date: "2026-10-01",
      steps: [adim(1, "Hazırlık", "2026-10-05"), adim(2, "Tarihsiz", null), adim(3, "Teslim", "2026-10-20")],
    }));
    assert.equal(asamalar[1].aralik, null);
    assert.deepEqual(asamalar[2].aralik, { bas: "2026-10-05", son: "2026-10-20" });
    assert.equal(asamalar[1].tarih, null, "tarih yok ama satır duruyor");
  });

  await t.test("işin başlangıcı yoksa ilk aşama tek güne düşüyor", () => {
    // Uydurulmuş bir başlangıç planı olduğundan uzun gösterirdi.
    const asamalar = asamalariKur(is({ start_date: null, steps: [adim(1, "Hazırlık", "2026-10-05")] }));
    assert.deepEqual(asamalar[0].aralik, { bas: "2026-10-05", son: "2026-10-05" });
  });

  await t.test("geçersiz tarih biçimi yok sayılıyor", () => {
    const asamalar = asamalariKur(is({ start_date: "2026-13-45", steps: [adim(1, "X", "yakında")] }));
    assert.equal(asamalar[0].aralik, null);
  });

  await t.test("güncel aşama: tamamlanmayanların İLKİ", () => {
    const asamalar = asamalariKur(is({
      steps: [adim(1, "Hazırlık", "2026-10-05", true), adim(2, "İç kontrol", "2026-10-12"), adim(3, "Teslim", "2026-10-20")],
    }));
    assert.deepEqual(asamalar.map((a) => a.guncel), [false, true, false]);
  });

  await t.test("hepsi tamamlandıysa güncel aşama yok", () => {
    const asamalar = asamalariKur(is({ steps: [adim(1, "Hazırlık", "2026-10-05", true)] }));
    assert.equal(asamalar.some((a) => a.guncel), false);
  });

  await t.test("sıralama sort_order ile, gelen dizinin sırasıyla değil", () => {
    const asamalar = asamalariKur(is({
      steps: [adim(3, "Teslim", "2026-10-20"), adim(1, "Hazırlık", "2026-10-05"), adim(2, "Kontrol", "2026-10-12")],
    }));
    assert.deepEqual(asamalar.map((a) => a.baslik), ["Hazırlık", "Kontrol", "Teslim"]);
  });
});

test("müşteriye göre gruplama", async (t) => {
  await t.test("aynı müşterinin eş zamanlı işleri yan yana", () => {
    // İsteğin çekirdeği: Emine Hanım'ın makalesi ile tezi bir arada görünmeli.
    const cizelge = cizelgeyiKur([
      is({ id: "w1", title: "Tez", customer_name: "Emine Yılmaz", due_date: "2026-11-30" }),
      is({ id: "w2", title: "Başka müşteri", customer_name: "Ali Kaya", due_date: "2026-11-10" }),
      is({ id: "w3", title: "Makale", customer_name: "Emine Yılmaz", due_date: "2026-10-25" }),
    ]);
    const emine = cizelge.find((m) => m.ad === "Emine Yılmaz");
    assert.equal(emine?.isler.length, 2);
    assert.ok(esZamanliMi(emine!), "eş zamanlı işaretlenmeli");
    // Termine göre: en yakın teslim üstte.
    assert.deepEqual(emine?.isler.map((i) => i.baslik), ["Makale", "Tez"]);
  });

  await t.test("aynı adın farklı yazımı tek grupta buluşuyor", () => {
    // "Emine Yılmaz" ile " emine yılmaz " aynı kişi.
    const cizelge = cizelgeyiKur([
      is({ id: "w1", customer_name: "Emine Yılmaz" }),
      is({ id: "w2", customer_name: " emine yılmaz " }),
    ]);
    assert.equal(cizelge.length, 1);
    assert.equal(cizelge[0].isler.length, 2);
  });

  await t.test("kurum içi işler tek grupta ve en sonda", () => {
    const cizelge = cizelgeyiKur([
      is({ id: "w1", customer_name: null }),
      is({ id: "w2", customer_name: "   " }),
      is({ id: "w3", customer_name: "Zeynep Ak" }),
    ]);
    assert.deepEqual(cizelge.map((m) => m.ad), ["Zeynep Ak", KURUM_ICI]);
    assert.equal(cizelge[1].isler.length, 2);
  });

  await t.test("müşteriler alfabetik (Türkçe sıra)", () => {
    const cizelge = cizelgeyiKur([
      is({ id: "w1", customer_name: "Zeynep" }),
      is({ id: "w2", customer_name: "Çiğdem" }),
      is({ id: "w3", customer_name: "Ahmet" }),
    ]);
    assert.deepEqual(cizelge.map((m) => m.ad), ["Ahmet", "Çiğdem", "Zeynep"]);
  });

  await t.test("tarihsiz iş listenin sonunda, düşmüyor", () => {
    // Termini girilmemiş iş de planlama gündemidir; gizlenmemeli.
    const cizelge = cizelgeyiKur([
      is({ id: "w1", title: "Tarihsiz", due_date: null }),
      is({ id: "w2", title: "Tarihli", due_date: "2026-10-10" }),
    ]);
    assert.deepEqual(cizelge[0].isler.map((i) => i.baslik), ["Tarihli", "Tarihsiz"]);
    assert.equal(cizelge[0].isler[1].aralik, null);
  });

  await t.test("işin çubuğu ve güncel aşaması birlikte veriliyor", () => {
    const [musteri] = cizelgeyiKur([
      is({
        start_date: "2026-10-01",
        due_date: "2026-10-20",
        steps: [adim(1, "Hazırlık", "2026-10-05", true), adim(2, "İç kontrol", "2026-10-12")],
      }),
    ]);
    const [isSatiri] = musteri.isler;
    assert.deepEqual(isSatiri.aralik, { bas: "2026-10-01", son: "2026-10-20" });
    assert.equal(isSatiri.guncelAsama, "İç kontrol");
    assert.equal(isSatiri.tamamlanan, 1);
  });

  await t.test("başlangıç terminden sonraysa çubuk tek güne düşüyor", () => {
    // Hatalı girilmiş tarih ters çubuk çizdirmemeli.
    const [musteri] = cizelgeyiKur([is({ start_date: "2026-12-01", due_date: "2026-10-10" })]);
    assert.deepEqual(musteri.isler[0].aralik, { bas: "2026-10-10", son: "2026-10-10" });
  });
});

test("ızgara satırları", async (t) => {
  const cizelge = cizelgeyiKur([
    is({
      id: "w1", title: "Makale", customer_name: "Emine", due_date: "2026-10-25",
      steps: [adim(1, "Hazırlık", "2026-10-05"), adim(2, "Kontrol", "2026-10-12")],
    }),
    is({ id: "w2", title: "Tez", customer_name: "Emine", due_date: "2026-11-30", steps: [adim(1, "Analiz", "2026-11-10")] }),
  ]);

  await t.test("sıra: müşteri → iş → aşamalar, numaralar artarak", () => {
    /*
      Numaralar render sırasında sayaçla üretiliyordu; React 19 bunu
      reddediyor (aynı bileşen iki kez çizilirse sayaç kaldığı yerden devam
      eder). Saf geçiş hem kuralı sağlıyor hem sınanabiliyor.
    */
    const satirlar = satirlariDiz(cizelge, () => true);
    assert.deepEqual(
      satirlar.map((r) => `${r.satir}:${r.tur}`),
      ["2:musteri", "3:is", "4:asama", "5:asama", "6:is", "7:asama"],
    );
  });

  await t.test("görünmeyen aşama satır TÜKETMİYOR", () => {
    // Aya düşmeyen aşama ızgarada boş satır bırakmamalı.
    const satirlar = satirlariDiz(cizelge, (asama) => asama.baslik === "Hazırlık");
    assert.deepEqual(
      satirlar.map((r) => `${r.satir}:${r.tur}`),
      ["2:musteri", "3:is", "4:asama", "5:is"],
    );
  });

  await t.test("başlangıç satırı verilebiliyor", () => {
    assert.equal(satirlariDiz(cizelge, () => false, 10)[0].satir, 10);
  });

  await t.test("boş çizelge boş dizi", () => {
    assert.deepEqual(satirlariDiz([], () => true), []);
  });
});

const ADLAR: Record<string, string> = { p1: "Ayşe Demir", p2: "Can Yıldız" };
const adCoz = (id: string) => ADLAR[id] ?? null;

test("kişiye göre görünüm", async (t) => {
  const isler = [
    is({
      id: "w1", title: "Tez", customer_name: "Emine",
      steps: [adim(1, "Literatür", "2026-10-05", false, "p1"), adim(2, "Analiz", "2026-10-12", false, "p2")],
    }),
    is({
      id: "w2", title: "Makale", customer_name: "Ali",
      steps: [adim(1, "Kaynakça", "2026-10-02", false, "p1"), adim(2, "Kontrol", "2026-10-20", false, null)],
    }),
  ];

  await t.test("aşamalar sorumlusunda toplanıyor, işi ve müşterisiyle", () => {
    /*
      "Kimde ne var" sorusu müşteriye göre gruplamayla yanıtlanmıyor: bir
      kişinin aşamaları dört ayrı müşterinin altına dağılıyor.
    */
    const kisiler = kisilereGoreKur(isler, adCoz);
    const ayse = kisiler.find((k) => k.ad === "Ayşe Demir");
    assert.equal(ayse?.asamalar.length, 2);
    // Tarihe göre: en yakın teslim üstte.
    assert.deepEqual(ayse?.asamalar.map((a) => a.baslik), ["Kaynakça", "Literatür"]);
    // Aşama hangi işe ait olduğunu taşımalı; "Kaynakça" tek başına yetmiyor.
    assert.deepEqual(ayse?.asamalar.map((a) => `${a.isBasligi}/${a.musteri}`), ["Makale/Ali", "Tez/Emine"]);
  });

  await t.test("atanmamış aşamalar tek grupta ve en sonda", () => {
    const kisiler = kisilereGoreKur(isler, adCoz);
    assert.deepEqual(kisiler.map((k) => k.ad), ["Ayşe Demir", "Can Yıldız", ATANMAMIS]);
    assert.equal(kisiler[2].asamalar.length, 1);
  });

  await t.test("silinmiş personelin işi kaybolmuyor", () => {
    /*
      Adı çözülemeyen kimlik "atanmamış" grubuna DÜŞMEZ: silinmiş bir
      personelin üstündeki işi "kimsede yok" göstermek onu kaybetmek olur.
    */
    const kisiler = kisilereGoreKur(
      [is({ steps: [adim(1, "Analiz", "2026-10-05", false, "silinmis")] })],
      adCoz,
    );
    assert.deepEqual(kisiler.map((k) => k.ad), ["Bilinmeyen personel"]);
    assert.notEqual(kisiler[0].anahtar, "", "atanmamış sayılmamalı");
  });

  await t.test("tarihsiz aşama listenin sonunda", () => {
    const kisiler = kisilereGoreKur(
      [is({ steps: [adim(1, "Tarihsiz", null, false, "p1"), adim(2, "Tarihli", "2026-10-05", false, "p1")] })],
      adCoz,
    );
    assert.deepEqual(kisiler[0].asamalar.map((a) => a.baslik), ["Tarihli", "Tarihsiz"]);
  });
});

test("süzgeçler", async (t) => {
  const isler = [
    is({ id: "w1", title: "Tez", customer_name: "Emine", status: "in_progress", steps: [adim(1, "Analiz", "2026-10-05", false, "p1")] }),
    is({ id: "w2", title: "Makale", customer_name: "Ali", status: "blocked", steps: [adim(1, "Kontrol", "2026-10-10", false, "p2")] }),
  ];

  await t.test("müşteri süzgeci adın yazımına takılmıyor", () => {
    assert.deepEqual(isler.filter(isSuzgeci({ musteri: " emine " })).map((i) => i.id), ["w1"]);
  });

  await t.test("durum süzgeci", () => {
    assert.deepEqual(isler.filter(isSuzgeci({ durum: "blocked" })).map((i) => i.id), ["w2"]);
  });

  await t.test("kişi süzgeci işi düşürüyor ama aşamayı da süzüyor", () => {
    /*
      Kişi süzgecinde iki kademe var: o kişinin hiç aşaması olmayan İŞ
      listeden çıkıyor, kalan işlerde de yalnızca onun aşamaları görünüyor.
      Tek kademe olsaydı ya iş başlıkları boş satır olarak kalırdı ya da
      başkasının aşamaları da listelenirdi.
    */
    assert.deepEqual(isler.filter(isSuzgeci({ kisi: "p1" })).map((i) => i.id), ["w1"]);
    const asamalar = asamalariKur(isler[0]).filter(asamaSuzgeci({ kisi: "p1" }));
    assert.deepEqual(asamalar.map((a) => a.baslik), ["Analiz"]);
    assert.deepEqual(asamalariKur(isler[0]).filter(asamaSuzgeci({ kisi: "p2" })), []);
  });

  await t.test("atanmamış süzgeci boş dizgeyle çalışıyor", () => {
    const atanmamisli = is({ id: "w3", steps: [adim(1, "Boşta", "2026-10-05", false, null)] });
    assert.equal(isSuzgeci({ kisi: "" })(atanmamisli), true);
    assert.equal(isSuzgeci({ kisi: "" })(isler[0]), false, "p1'deki aşama atanmamış sayılmamalı");
  });

  await t.test("süzgeç verilmezse hiçbir şey düşmüyor", () => {
    assert.equal(isler.filter(isSuzgeci({})).length, 2);
    assert.equal(asamalariKur(isler[0]).filter(asamaSuzgeci({})).length, 1);
  });

  await t.test("müşteri listesi tekilleştirilip sıralanıyor, ilk yazım korunuyor", () => {
    /*
      Aynı kişinin iki yazımında İLK görülen kalıyor: sonrakini yazmak,
      özensiz girilmiş bir kaydın ("emine") düzgün olanı bastırması demekti.
    */
    const liste = musteriAdlari([...isler, is({ id: "w4", customer_name: " emine " }), is({ id: "w5", customer_name: null })]);
    assert.deepEqual(liste, ["Ali", "Emine"], "kurum içi işler listede olmamalı, ilk yazım kalmalı");
  });
});

/** Şablon aşaması: pano kolonları bunlardan kuruluyor. */
const SABLON = [
  { title: "Hazırlık Yapılıyor", sort_order: 10 },
  { title: "İç Kontrol Yapılıyor", sort_order: 20 },
  { title: "Evrak Teslimine Hazır", sort_order: 30 },
];

/** Testlerin sabit "bugün"ü: bekleme süreleri buna göre hesaplanıyor. */
const BUGUN = "2026-10-15";

/** Gösterilen kolonlar. Boş kolonlar gizlendiği için burada yer almazlar. */
const panoKolonlari = (...girdi: Parameters<typeof asamaPanosuKur>) => asamaPanosuKur(...girdi).kolonlar;

test("pano · şablon aşamaları kolon", async (t) => {
  const isAsamalarla = (id: string, baslik: string, musteri: string, adimlar: ReturnType<typeof adim>[]) =>
    is({ id, title: baslik, customer_name: musteri, steps: adimlar });

  await t.test("iş, tamamlanmayan İLK aşamasının kolonunda", () => {
    /*
      İsteğin çekirdeği: "her iki çalışmada da hangi aşamadayız". Kart iş
      olunca pano bunu doğrudan yanıtlıyor.
    */
    const pano = panoKolonlari([
      isAsamalarla("w1", "Tez", "Emine", [
        adim(1, "Hazırlık Yapılıyor", "2026-10-02", true),
        adim(2, "İç Kontrol Yapılıyor", "2026-10-10"),
        adim(3, "Evrak Teslimine Hazır", "2026-10-20"),
      ]),
      isAsamalarla("w2", "Makale", "Emine", [adim(1, "Hazırlık Yapılıyor", "2026-10-05")]),
    ], SABLON, adCoz, BUGUN);

    const kolon = (baslik: string) => pano.find((k) => k.baslik === baslik)!;
    assert.deepEqual(kolon("Hazırlık Yapılıyor").kartlar.map((c) => c.baslik), ["Makale"]);
    assert.deepEqual(kolon("İç Kontrol Yapılıyor").kartlar.map((c) => c.baslik), ["Tez"]);
    // İçinde iş olmayan aşama gösterilmiyor; numarası sırayı söylüyor.
    assert.equal(pano.some((k) => k.baslik === "Evrak Teslimine Hazır"), false);
    assert.deepEqual(pano.map((k) => k.sira), [1, 2], "numara ŞABLONDAKİ sıra: 3 atlandı");
  });

  await t.test("kolonlar şablon sırasında, sonda Tamamlandı", () => {
    const pano = panoKolonlari([
      isAsamalarla("w1", "A", "X", [adim(1, "Hazırlık Yapılıyor", "2026-10-02")]),
      isAsamalarla("w2", "B", "X", [adim(1, "İç Kontrol Yapılıyor", "2026-10-03")]),
      isAsamalarla("w3", "C", "X", [adim(1, "Evrak Teslimine Hazır", "2026-10-04")]),
      isAsamalarla("w4", "D", "X", [adim(1, "Hazırlık Yapılıyor", "2026-10-01", true)]),
      isAsamalarla("w5", "E", "X", [adim(1, "Literatür taraması", "2026-10-05")]),
    ], SABLON, adCoz, BUGUN);
    assert.deepEqual(pano.map((k) => k.baslik), [
      ...SABLON.map((a) => a.title), "Tamamlandı", "Şablon dışı aşama",
    ]);
  });

  await t.test("BOŞ KOLON GİZLENİYOR, adı ayrıca dönüyor", () => {
    /*
      Önce akışın tamamı gösteriliyordu; canlıda sekiz aşama + Tamamlandı
      dokuz kolon etti ve pano yatay kaydırmadan görünmez oldu. Gizlenen
      aşamaların adı dönmeli: sessizce yok etmek "İç Kontrol nerede?"
      sorusunu doğuruyor.
    */
    const bos = asamaPanosuKur([], SABLON, adCoz, BUGUN);
    assert.deepEqual(bos.kolonlar, [], "iş yoksa hiç kolon yok");
    assert.deepEqual(bos.bosAsamalar, SABLON.map((a) => a.title));

    const dolu = asamaPanosuKur(
      [isAsamalarla("w1", "Tez", "Emine", [adim(1, "İç Kontrol Yapılıyor", "2026-10-05")])],
      SABLON, adCoz, BUGUN,
    );
    assert.deepEqual(dolu.kolonlar.map((k) => k.baslik), ["İç Kontrol Yapılıyor"]);
    assert.deepEqual(dolu.bosAsamalar, ["Hazırlık Yapılıyor", "Evrak Teslimine Hazır"]);
    // "Tamamlandı" ve "Şablon dışı" akışın aşaması değil: sayıma girmiyor.
    assert.equal(dolu.bosAsamalar.length, 2);
  });

  await t.test("bütün aşamaları bitmiş iş Tamamlandı kolonunda", () => {
    const pano = panoKolonlari(
      [isAsamalarla("w1", "Tez", "Emine", [adim(1, "Hazırlık Yapılıyor", "2026-10-02", true)])],
      SABLON, adCoz, BUGUN,
    );
    const tamam = pano.find((k) => k.anahtar === TAMAMLANDI_KOLONU)!;
    assert.deepEqual(tamam.kartlar.map((c) => c.baslik), ["Tez"]);
    assert.equal(tamam.kartlar[0].guncelAsama, null);
    assert.equal(tamam.kartlar[0].tamamlandi, true);
  });

  await t.test("ŞABLON DIŞI aşama ilk kolona atılmıyor, kendi kolonunda duruyor", () => {
    /*
      Adımlar üç kaynaktan üretiliyor ve önceliği sözleşmenin ara teslim
      takviminde: sözleşmeden açılan bir işin aşama adları müşteriye satılan
      plandan gelir ve şablonla eşleşmeyebilir. İlk kolona koymak panonun
      yanlış bir tablo göstermesi olurdu.
    */
    const pano = panoKolonlari(
      [isAsamalarla("w1", "Tez", "Emine", [adim(1, "Literatür taraması", "2026-10-05")])],
      SABLON, adCoz, BUGUN,
    );
    assert.equal(pano.some((k) => k.baslik === "Hazırlık Yapılıyor"), false, "kart oraya düşmedi");
    const disi = pano.find((k) => k.anahtar === SABLON_DISI_KOLONU)!;
    assert.deepEqual(disi.kartlar.map((c) => c.guncelAsama), ["Literatür taraması"]);
  });

  await t.test("adımı hiç olmayan iş gizlenmiyor", () => {
    // Henüz adımı üretilmemiş iş; gizlemek onu unutturmanın en kolay yolu.
    const pano = panoKolonlari([isAsamalarla("w1", "Yeni iş", "Ali", [])], SABLON, adCoz, BUGUN);
    const disi = pano.find((k) => k.anahtar === SABLON_DISI_KOLONU)!;
    assert.deepEqual(disi.kartlar.map((c) => c.baslik), ["Yeni iş"]);
    assert.equal(disi.kartlar[0].guncelAsama, null);
    assert.equal(disi.kartlar[0].tamamlandi, false, "aşaması yok diye bitmiş sayılmamalı");
  });

  await t.test("aşama adı büyük/küçük harf ve boşluk farkına takılmıyor", () => {
    // Türkçe küçük harf dönüşümü: "İç Kontrol" ile "iç  kontrol" aynı aşama.
    const pano = panoKolonlari(
      [isAsamalarla("w1", "Tez", "Emine", [adim(1, "iç  kontrol yapılıyor", "2026-10-05")])],
      SABLON, adCoz, BUGUN,
    );
    assert.deepEqual(pano.find((k) => k.baslik === "İç Kontrol Yapılıyor")!.kartlar.map((c) => c.baslik), ["Tez"]);
  });

  await t.test("kartta ilerleme, tarih, sorumlu ve geri alınacak aşama var", () => {
    const pano = panoKolonlari([
      isAsamalarla("w1", "Tez", "Emine", [
        adim(1, "Hazırlık Yapılıyor", "2026-10-02", true),
        adim(2, "İç Kontrol Yapılıyor", "2026-10-10", false, "p1"),
      ]),
    ], SABLON, adCoz, BUGUN);
    const [kart] = pano.find((k) => k.baslik === "İç Kontrol Yapılıyor")!.kartlar;
    assert.equal(kart.tamamlananAsama, 1);
    assert.equal(kart.toplamAsama, 2);
    assert.equal(kart.tarih, "2026-10-10", "işin termini değil AŞAMANIN tarihi");
    assert.equal(kart.sorumluAdi, "Ayşe Demir");
    assert.equal(kart.guncelAsamaId, "s2", "tamamla düğmesi bunu kullanıyor");
    assert.equal(kart.oncekiAsamaId, "s1", "geri al düğmesi bunu yeniden açıyor");
  });

  await t.test("geri al, güncel aşamadan ÖNCEKİ tamamlanmışı açıyor", () => {
    /*
      Adımlar iş detayından tek tek işaretlenebiliyor, yani sıra dışı
      tamamlama mümkün. 1, 2 ve 4 bitmiş, 3 bekliyorsa en son tamamlanan
      4'tür; onu açmak güncel aşamayı (3) değiştirmez ve kart yerinde
      kalır — kullanıcı düğmenin çalışmadığını sanar.
    */
    const pano = panoKolonlari([
      is({ id: "w1", title: "Tez", customer_name: "Emine", steps: [
        adim(1, "Hazırlık Yapılıyor", "2026-10-01", true),
        adim(2, "İç Kontrol Yapılıyor", "2026-10-05"),
        adim(3, "Evrak Teslimine Hazır", "2026-10-09", true),
      ] }),
    ], SABLON, adCoz, BUGUN);
    const [kart] = pano.find((k) => k.baslik === "İç Kontrol Yapılıyor")!.kartlar;
    assert.equal(kart.guncelAsamaId, "s2");
    assert.equal(kart.oncekiAsamaId, "s1", "s3 değil: o güncelin İLERİSİNDE");
  });

  await t.test("ilk aşamadaysa geri alınacak aşama yok", () => {
    const pano = panoKolonlari(
      [is({ id: "w1", steps: [adim(1, "Hazırlık Yapılıyor", "2026-10-05")] })],
      SABLON, adCoz, BUGUN,
    );
    assert.equal(pano.find((k) => k.baslik === "Hazırlık Yapılıyor")!.kartlar[0].oncekiAsamaId, null);
  });

  await t.test("hepsi bittiyse geri al en son aşamayı açıyor", () => {
    const pano = panoKolonlari([
      is({ id: "w1", steps: [adim(1, "Hazırlık Yapılıyor", "2026-10-01", true), adim(2, "İç Kontrol Yapılıyor", "2026-10-05", true)] }),
    ], SABLON, adCoz, BUGUN);
    assert.equal(pano.find((k) => k.anahtar === TAMAMLANDI_KOLONU)!.kartlar[0].oncekiAsamaId, "s2");
  });

  await t.test("aşama sorumlusu yoksa İŞİN sorumlusu yazılıyor", () => {
    // Kartta "sorumlu yok" göstermek, işin sorumlusu varken yanlış olurdu.
    const pano = panoKolonlari([
      is({ id: "w1", title: "Tez", customer_name: "Emine", assigned_employee_id: "p2",
           steps: [adim(1, "Hazırlık Yapılıyor", "2026-10-05", false, null)] }),
    ], SABLON, adCoz, BUGUN);
    assert.equal(pano.find((k) => k.baslik === "Hazırlık Yapılıyor")!.kartlar[0].sorumluAdi, "Can Yıldız");
  });

  await t.test("kartlar tarihe göre, tarihsizler sonda", () => {
    const pano = panoKolonlari([
      isAsamalarla("w1", "Geç", "A", [adim(1, "Hazırlık Yapılıyor", "2026-10-20")]),
      isAsamalarla("w2", "Tarihsiz", "B", [adim(1, "Hazırlık Yapılıyor", null)]),
      isAsamalarla("w3", "Erken", "C", [adim(1, "Hazırlık Yapılıyor", "2026-10-02")]),
    ], SABLON, adCoz, BUGUN);
    assert.deepEqual(
      pano.find((k) => k.baslik === "Hazırlık Yapılıyor")!.kartlar.map((c) => c.baslik),
      ["Erken", "Geç", "Tarihsiz"],
    );
  });

  await t.test("TARİHSİZLER arasında en uzun bekleyen üstte", () => {
    /*
      Canlıda (27.09.2026) sekiz işin sekizi de tarihsizdi; eskiden hepsi
      ada göre diziliyordu, yani sıralama hiçbir şey söylemiyordu. Bekleme
      süresi tarih girilmeden de ölçülüyor.
    */
    const bekleyen = (id: string, baslik: string, gecis: string) =>
      is({ id, title: baslik, customer_name: "A", start_date: gecis,
           steps: [adim(1, "Hazırlık Yapılıyor", null)] });
    const pano = panoKolonlari([
      bekleyen("w1", "Yeni", "2026-10-13"),
      bekleyen("w2", "Takılmış", "2026-09-01"),
      bekleyen("w3", "Orta", "2026-10-05"),
    ], SABLON, adCoz, BUGUN);
    assert.deepEqual(
      pano.find((k) => k.baslik === "Hazırlık Yapılıyor")!.kartlar.map((c) => [c.baslik, c.bekleyenGun]),
      [["Takılmış", 44], ["Orta", 10], ["Yeni", 2]],
    );
  });
});

test("pano · aşamada kaç gündür bekliyor", async (t) => {
  await t.test("önceki adımın bitişinden ölçülüyor, işin başlangıcından değil", () => {
    const pano = panoKolonlari([
      is({ start_date: "2026-09-01", steps: [
        adim(1, "Hazırlık Yapılıyor", null, true, null, "2026-10-10T09:00:00Z"),
        adim(2, "İç Kontrol Yapılıyor", null),
      ] }),
    ], SABLON, adCoz, BUGUN);
    assert.equal(pano.find((k) => k.baslik === "İç Kontrol Yapılıyor")!.kartlar[0].bekleyenGun, 5);
  });

  await t.test("hiç bitmiş adım yoksa işin başlangıcı kullanılıyor", () => {
    const pano = panoKolonlari(
      [is({ start_date: "2026-10-01", steps: [adim(1, "Hazırlık Yapılıyor", null)] })],
      SABLON, adCoz, BUGUN,
    );
    assert.equal(pano.find((k) => k.baslik === "Hazırlık Yapılıyor")!.kartlar[0].bekleyenGun, 14);
  });

  await t.test("başlangıcı hiç bilinmiyorsa ölçülmüyor", () => {
    // Uydurulmuş bir "0 gün" yerine hiç göstermemek doğru: kart sessiz kalıyor.
    const pano = panoKolonlari(
      [is({ start_date: null, steps: [adim(1, "Hazırlık Yapılıyor", null)] })],
      SABLON, adCoz, BUGUN,
    );
    assert.equal(pano.find((k) => k.baslik === "Hazırlık Yapılıyor")!.kartlar[0].bekleyenGun, null);
  });

  await t.test("SIRA DIŞI tamamlamada ileri adımın bitişi sayılmıyor", () => {
    /*
      1 ve 3 bitmiş, 2 bekliyor: 2. aşamaya 1'in bitişiyle gelindi. En son
      bitişi (3) almak "1 gündür bekliyor" derdi, oysa iş 2. aşamada
      haftalardır duruyor — takılan işi gizleyen bir sayı olurdu.
    */
    const pano = panoKolonlari([
      is({ start_date: "2026-09-01", steps: [
        adim(1, "Hazırlık Yapılıyor", null, true, null, "2026-09-20T09:00:00Z"),
        adim(2, "İç Kontrol Yapılıyor", null),
        adim(3, "Evrak Teslimine Hazır", null, true, null, "2026-10-14T09:00:00Z"),
      ] }),
    ], SABLON, adCoz, BUGUN);
    assert.equal(pano.find((k) => k.baslik === "İç Kontrol Yapılıyor")!.kartlar[0].bekleyenGun, 25);
  });

  await t.test("bitişin İSTANBUL günü esas: gece yarısından sonrası kaymıyor", () => {
    /*
      Sunucu UTC'de. 09 Ekim 22:30 UTC, İstanbul'da 10 Ekim 01:30'dur;
      UTC günü alınsaydı bekleme bir gün fazla çıkardı.
    */
    const pano = panoKolonlari([
      is({ steps: [
        adim(1, "Hazırlık Yapılıyor", null, true, null, "2026-10-09T22:30:00Z"),
        adim(2, "İç Kontrol Yapılıyor", null),
      ] }),
    ], SABLON, adCoz, BUGUN);
    assert.equal(pano.find((k) => k.baslik === "İç Kontrol Yapılıyor")!.kartlar[0].bekleyenGun, 5);
  });

  await t.test("bitmiş işte bekleme yok", () => {
    // Güncel aşaması olmayan iş beklemiyor; "44 gündür" yazmak yanlış olurdu.
    const pano = panoKolonlari(
      [is({ steps: [adim(1, "Hazırlık Yapılıyor", null, true, null, "2026-10-10T09:00:00Z")] })],
      SABLON, adCoz, BUGUN,
    );
    assert.equal(pano.find((k) => k.anahtar === TAMAMLANDI_KOLONU)!.kartlar[0].bekleyenGun, null);
  });

  await t.test("ileri tarihli başlangıç negatif gün vermiyor", () => {
    const pano = panoKolonlari(
      [is({ start_date: "2026-10-20", steps: [adim(1, "Hazırlık Yapılıyor", null)] })],
      SABLON, adCoz, BUGUN,
    );
    assert.equal(pano.find((k) => k.baslik === "Hazırlık Yapılıyor")!.kartlar[0].bekleyenGun, 0);
  });

  await t.test("eşik kodda tek yerde ve makul aralıkta", () => {
    /*
      Sayı kurumdan gelmiyor, seçilmiş bir eşik. Test onu DOĞRU ilan
      etmiyor; ikinci bir yerde farklı bir sayı türemesin diye sabitliyor.
    */
    assert.equal(BEKLEME_ESIGI_GUN, 21);
  });
});
