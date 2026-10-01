import assert from "node:assert/strict";
import test from "node:test";
import {
  asamaPanosuKur,
  BEKLEME_ESIGI_GUN,
  SABLON_DISI_KOLONU,
  TAMAMLANDI_KOLONU,
  tasimaPlani,
  type OperasyonIsi,
} from "@/lib/operasyon-panosu";

/*
  Operasyon panosu.

  Talep operasyoncunun kendi cümlelerinden: "Emine Hanım'ın makalesi ve
  tezi eş zamanlı ilerlediği için, analizler geldiğinde her iki çalışmada
  da hangi aşamada olduğumuzu kolayca görebilmek…". Panonun yanıtladığı
  soru bu: kart İŞ, kolon AŞAMA.

  Bu dosyada 27.09.2026'ya kadar Çalışma Çizelgesi'nin (aşama çubukları,
  müşteri gruplaması, kişi görünümü, süzgeçler) testleri de vardı; o ekran
  kaldırılınca birlikte silindiler.
*/

const adim = (
  sort_order: number,
  title: string,
  due_date: string | null,
  is_completed = false,
  assigned_employee_id: string | null = null,
  completed_at: string | null = null,
) => ({ id: `s${sort_order}`, title, sort_order, due_date, is_completed, assigned_employee_id, completed_at });

const is = (uzerine: Partial<OperasyonIsi> = {}): OperasyonIsi => ({
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

const ADLAR: Record<string, string> = { p1: "Ayşe Demir", p2: "Can Yıldız" };
const adCoz = (id: string) => ADLAR[id] ?? null;

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

test("pano · kartı başka kolona taşımak", async (t) => {
  /*
    Kartın kolonu türetilmiş bir değer: "tamamlanmayan İLK adım"ın başlığı.
    Taşımanın bunu KURMASI gerekiyor, yoksa kart bırakıldığı anda eski
    kolonuna geri zıplar ve kullanıcı sürüklemenin çalışmadığını sanar.
    Testler bu değişmezi iki yönde de sabitliyor.
  */
  const AKIS = [
    adim(1, "Hazırlık Yapılıyor", null, true),
    adim(2, "İç Kontrol Yapılıyor", null),
    adim(3, "Evrak Teslimine Hazır", null),
  ];
  /** Taşıma uygulandıktan sonra kart hangi kolona düşüyor? */
  const uygulaSonrasiKolon = (adimlar: ReturnType<typeof adim>[], plan: NonNullable<ReturnType<typeof tasimaPlani>>) => {
    const sonrasi = adimlar.map((a) => ({
      ...a,
      is_completed: plan.tamamlanacak.includes(a.id) ? true : plan.acilacak.includes(a.id) ? false : a.is_completed,
    }));
    return panoKolonlari([is({ steps: sonrasi })], SABLON, adCoz, BUGUN)[0].baslik;
  };

  await t.test("İLERİ taşıma aradaki aşamaları da kapatıyor", () => {
    // 2. kolondan 3. kolona: 2 kapanmalı, yoksa kart 2'de kalır.
    const plan = tasimaPlani(AKIS, "Evrak Teslimine Hazır")!;
    assert.deepEqual(plan.tamamlanacak, ["s2"]);
    assert.deepEqual(plan.acilacak, []);
    assert.equal(uygulaSonrasiKolon(AKIS, plan), "Evrak Teslimine Hazır", "kart hedefte durmalı");
  });

  await t.test("GERİ taşıma hedefi ve sonrasını yeniden açıyor", () => {
    const bitmis = [
      adim(1, "Hazırlık Yapılıyor", null, true),
      adim(2, "İç Kontrol Yapılıyor", null, true),
      adim(3, "Evrak Teslimine Hazır", null, true),
    ];
    const plan = tasimaPlani(bitmis, "İç Kontrol Yapılıyor")!;
    assert.deepEqual(plan.tamamlanacak, []);
    assert.deepEqual(plan.acilacak, ["s2", "s3"], "hedeften SONRAKİLER de açılmalı");
    assert.equal(uygulaSonrasiKolon(bitmis, plan), "İç Kontrol Yapılıyor");
  });

  await t.test("Tamamlandı kolonuna taşımak bütün aşamaları kapatıyor", () => {
    const plan = tasimaPlani(AKIS, null)!;
    assert.deepEqual(plan.tamamlanacak, ["s2", "s3"]);
    assert.equal(plan.hedefAdi, null);
  });

  await t.test("bulunduğu kolona taşımak hiçbir şeyi değiştirmiyor", () => {
    const plan = tasimaPlani(AKIS, "İç Kontrol Yapılıyor")!;
    assert.deepEqual([plan.tamamlanacak, plan.acilacak], [[], []]);
  });

  await t.test("o işte olmayan aşamaya taşınamıyor", () => {
    // Sözleşmeden açılan işin adımları şablonla eşleşmeyebiliyor.
    assert.equal(tasimaPlani(AKIS, "Revizyon Yapılıyor"), null);
  });

  await t.test("adımı olmayan iş taşınamıyor", () => {
    assert.equal(tasimaPlani([], "Hazırlık Yapılıyor"), null);
  });

  await t.test("hedef adı BÜYÜK/küçük harf ve boşluk farkına takılmıyor", () => {
    /*
      Kolon başlığı şablondan, adım adı işten geliyor; yazımları ayrışabilir.
      BÜYÜK harf doğru Türkçeyle yazılmalı: tr-TR'de "I" küçüğü "ı"dır,
      yani "TESLIMINE" gerçekten "teslımıne" demek ve eşleşmez. Şablona
      büyük harfle yazan kurum da "TESLİMİNE" yazacaktır.
    */
    const plan = tasimaPlani(AKIS, "EVRAK  TESLİMİNE HAZIR")!;
    assert.equal(plan.hedefAdi, "Evrak Teslimine Hazır", "işteki yazım kayda geçiyor");
  });

  await t.test("noktasız i noktalı İ ile EŞLEŞMİYOR (kabul edilmiş sınır)", () => {
    /*
      Türkçede "hazır" ile "hazir" farklı kelimeler ve eşleştirme
      toLocaleLowerCase("tr-TR") ile yapılıyor. Yani şablona "Hazir" yazan
      kurumun kartı o kolona taşınamaz — kolon da zaten ayrı görünür, iki
      ad gerçekten farklıdır. Bu satır davranışı doğru ilan etmiyor,
      sınırın bilindiğini kaydediyor.
    */
    assert.equal(tasimaPlani(AKIS, "Evrak Teslimine Hazir"), null);
  });

  await t.test("SIRA DIŞI tamamlanmış ileri adım geri taşımada açılıyor", () => {
    /*
      1 ve 3 bitmiş, 2 bekliyor. Kartı 2'ye taşımak zaten 2'de olduğu için
      bir şey değiştirmemeli AMA 3 açılmalı: aksi hâlde kullanıcı kartı
      ileri sürüklediğinde 3 zaten kapalı olduğundan aşama atlanır.
    */
    const karisik = [
      adim(1, "Hazırlık Yapılıyor", null, true),
      adim(2, "İç Kontrol Yapılıyor", null),
      adim(3, "Evrak Teslimine Hazır", null, true),
    ];
    const plan = tasimaPlani(karisik, "İç Kontrol Yapılıyor")!;
    assert.deepEqual(plan.acilacak, ["s3"]);
  });

  await t.test("aynı başlıklı iki adımda İLKİ hedef", () => {
    // Sözleşme planında tekrar eden aşama adları olabiliyor; kartın kolonu
    // da tamamlanmayan İLK adımdan türüyor, ikisi aynı adımı göstermeli.
    const tekrarli = [
      adim(1, "Revizyon", null, true),
      adim(2, "İç Kontrol Yapılıyor", null, true),
      adim(3, "Revizyon", null, true),
    ];
    const plan = tasimaPlani(tekrarli, "Revizyon")!;
    assert.deepEqual(plan.acilacak, ["s1", "s2", "s3"], "s1 hedef: ondan sonrakilerin hepsi açılıyor");
  });
});

/*
  İKİ SEVİYELİ ŞABLON.

  AkademikMerkez'in listesi sekiz aşama ve yirmi görev. Kolon görev olsaydı
  pano yirmi kolona çıkar, bir bakışta görünmesi — bütün değeri — biterdi.
  Aşaması olan satırda kolon AŞAMA; olmayanda eski davranış sürüyor.
*/
test("pano: aşamalı şablonda kolon sayısı aşama sayısıdır", () => {
  const asamali = (sort_order: number, title: string, phase_title: string, is_completed = false) => ({
    ...adim(sort_order, title, null, is_completed),
    phase_title,
  });
  const sablon = [
    { title: "Tez Öneri Formu", sort_order: 10, phase_title: "Hazırlık" },
    { title: "Etik Kurul İzni", sort_order: 20, phase_title: "Hazırlık" },
    { title: "Veri Toplama", sort_order: 30, phase_title: "Veri ve Analiz" },
    { title: "Bulgular Bölümü", sort_order: 40, phase_title: "Veri ve Analiz" },
  ];
  const { kolonlar } = asamaPanosuKur(
    [is({ steps: [
      asamali(10, "Tez Öneri Formu", "Hazırlık", true),
      asamali(20, "Etik Kurul İzni", "Hazırlık"),
      asamali(30, "Veri Toplama", "Veri ve Analiz"),
      asamali(40, "Bulgular Bölümü", "Veri ve Analiz"),
    ] })],
    sablon,
    () => null,
    "2026-10-10",
  );

  // Dolu kolon bir tane (iş "Hazırlık"ta); şablon dışına düşmemeli.
  assert.deepEqual(kolonlar.map((k) => k.baslik), ["Hazırlık"]);
  assert.equal(kolonlar[0].kartlar.length, 1);
  // Kart hâlâ GÖREVİ yazıyor: kolon aşama, kart içindeki satır görev.
  assert.equal(kolonlar[0].kartlar[0].guncelAsama, "Etik Kurul İzni");
});

test("pano: aşamalı kolona taşıma o aşamanın İLK görevini hedef alır", () => {
  const adimlar = [
    { ...adim(10, "Tez Öneri Formu", null, true), phase_title: "Hazırlık" },
    { ...adim(20, "Etik Kurul İzni", null), phase_title: "Hazırlık" },
    { ...adim(30, "Veri Toplama", null), phase_title: "Veri ve Analiz" },
    { ...adim(40, "Bulgular Bölümü", null), phase_title: "Veri ve Analiz" },
  ];
  const plan = tasimaPlani(adimlar, "Veri ve Analiz");
  assert.ok(plan);
  // Aradaki açık görev kapanır; hedef aşamanın görevleri açık kalır.
  assert.deepEqual(plan.tamamlanacak, ["s20"]);
  assert.deepEqual(plan.acilacak, []);
  // Kayıt geçmişi kullanıcının bıraktığı kolonun adını yazmalı.
  assert.equal(plan.hedefAdi, "Veri ve Analiz");
});

test("pano: aşamasız şablonda davranış değişmedi", () => {
  // Aşama tanımlamamış kurumlarda kolon yine görevin kendi başlığı.
  const sablon = [
    { title: "Hazırlık Yapılıyor", sort_order: 10 },
    { title: "İç Kontrol Yapılıyor", sort_order: 20 },
  ];
  const { kolonlar } = asamaPanosuKur(
    [is({ steps: [adim(10, "Hazırlık Yapılıyor", null, true), adim(20, "İç Kontrol Yapılıyor", null)] })],
    sablon,
    () => null,
    "2026-10-10",
  );
  assert.deepEqual(kolonlar.map((k) => k.baslik), ["İç Kontrol Yapılıyor"]);
  assert.notEqual(kolonlar[0].anahtar, SABLON_DISI_KOLONU);
});
