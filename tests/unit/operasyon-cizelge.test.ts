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
  musteriAdlari,
  PANO_KOLONLARI,
  panoyuKur,
  satirlariDiz,
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
) => ({ id: `s${sort_order}`, title, sort_order, due_date, is_completed, assigned_employee_id });

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

/** Durumlu adım: pano kolonları buna göre ayrılıyor. */
const durumluAdim = (sort_order: number, title: string, due_date: string | null, status: string, sorumlu: string | null = null) => ({
  id: `s${sort_order}-${status}`, title, sort_order, due_date, status,
  is_completed: status === "done", assigned_employee_id: sorumlu,
});

test("pano", async (t) => {
  const isler = [
    is({
      id: "w1", title: "Tez", customer_name: "Emine",
      steps: [
        durumluAdim(1, "Literatür", "2026-10-02", "done", "p1"),
        durumluAdim(2, "Analiz", "2026-10-12", "in_progress", "p1"),
        durumluAdim(3, "İç kontrol", "2026-10-20", "review", "p2"),
        durumluAdim(4, "Teslim", null, "planned", null),
      ],
    }),
    is({ id: "w2", title: "Makale", customer_name: "Ali", steps: [durumluAdim(1, "Kaynakça", "2026-10-05", "in_progress", "p2")] }),
  ];

  await t.test("kolonlar işin akış sırasında", () => {
    assert.deepEqual(panoyuKur(isler, adCoz).map((k) => k.durum), PANO_KOLONLARI);
  });

  await t.test("kart AŞAMA, iş değil: hangi işin hangi bölümü yazıyor", () => {
    /*
      İşler kart olsaydı kolonlar işin durumunu gösterirdi ve bir tezin
      dokuz bölümünden hangisinin kontrolde olduğu yine görünmezdi.
    */
    const pano = panoyuKur(isler, adCoz);
    const calisilan = pano.find((k) => k.durum === "in_progress")!;
    assert.deepEqual(
      calisilan.kartlar.map((kart) => `${kart.baslik}@${kart.isBasligi}/${kart.musteri}`),
      ["Kaynakça@Makale/Ali", "Analiz@Tez/Emine"],
      "tarihe göre sıralı",
    );
  });

  await t.test("sorumlu adı çözülüyor, atanmamış null kalıyor", () => {
    const pano = panoyuKur(isler, adCoz);
    assert.equal(pano.find((k) => k.durum === "review")!.kartlar[0].sorumluAdi, "Can Yıldız");
    assert.equal(pano.find((k) => k.durum === "planned")!.kartlar[0].sorumluAdi, null);
  });

  await t.test("tarihsiz aşama panoda duruyor, sonda", () => {
    // Planlanacak iş de iştir; panoda görünmezse hiç planlanmaz.
    const planlanan = panoyuKur(isler, adCoz).find((k) => k.durum === "planned")!;
    assert.deepEqual(planlanan.kartlar.map((kart) => kart.baslik), ["Teslim"]);
    assert.equal(planlanan.kartlar[0].tarih, null);
  });

  await t.test("tanınmayan durum kendi kolonunda toplanıyor", () => {
    /*
      "planlandı"ya düşürmek bir göç hatasını gizlemenin en kolay yolu
      olurdu: kart görünür ama yanlış kolonda.
    */
    const pano = panoyuKur([is({ steps: [durumluAdim(1, "Belirsiz", "2026-10-05", "uydurma")] })], adCoz);
    assert.deepEqual(pano.map((k) => k.durum), [...PANO_KOLONLARI, "uydurma"]);
    assert.equal(pano.find((k) => k.durum === "uydurma")!.kartlar.length, 1);
    assert.equal(pano.find((k) => k.durum === "planned")!.kartlar.length, 0);
  });

  await t.test("durum yazılmamış adım is_completed'dan türüyor", () => {
    // Eski çağrılar status geçirmiyor; veritabanında sütun NOT NULL.
    const pano = panoyuKur([is({ steps: [adim(1, "Bitmiş", "2026-10-01", true), adim(2, "Bitmemiş", "2026-10-02")] })], adCoz);
    assert.deepEqual(pano.find((k) => k.durum === "done")!.kartlar.map((c) => c.baslik), ["Bitmiş"]);
    assert.deepEqual(pano.find((k) => k.durum === "planned")!.kartlar.map((c) => c.baslik), ["Bitmemiş"]);
  });

  await t.test("boş girdide kolonlar yine duruyor", () => {
    // Boş pano "kolon yok" demek değil: sürükleyecek yer görünmeli.
    assert.deepEqual(panoyuKur([], adCoz).map((k) => k.kartlar.length), [0, 0, 0, 0]);
  });
});
