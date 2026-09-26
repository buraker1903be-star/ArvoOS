import assert from "node:assert/strict";
import test from "node:test";
import { asamalariKur, cizelgeyiKur, esZamanliMi, KURUM_ICI, satirlariDiz, type CizelgeIsi } from "@/lib/operasyon-cizelge";

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
