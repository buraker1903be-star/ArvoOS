import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { tahsilatModeli, tahsilatSayfalari, YAKLASAN_GUN, type TahsilatCarisi, type TahsilatHareketi } from "../../lib/rapor-tahsilat";
import type { Donem } from "../../lib/rapor-donemi";

const EKIM: Donem = { startKey: "2026-10-01", endKey: "2026-10-31", key: "bu_ay" };
const BUGUN = "2026-10-24";

const hareket = (o: Partial<TahsilatHareketi>): TahsilatHareketi => ({
  entry_type: "credit", source_type: "payment", amount: 100_000, transaction_date: "2026-10-10", ...o,
});
const taksit = (o: Partial<{ id: string; due_date: string | null; amount: number; status: string }>) => ({
  id: "t1", due_date: "2026-11-15", amount: 100_000, status: "pending", ...o,
});
const cari = (o: Partial<TahsilatCarisi>): TahsilatCarisi => ({
  id: "c1", ad: "Akademik Merkez", bakiye: 100_000, netTahsilat: 0, taksitler: [], ...o,
});

const calistir = (girdi: { hareketler?: TahsilatHareketi[]; cariler?: TahsilatCarisi[]; donem?: Donem; bugun?: string }) =>
  tahsilatModeli({
    donem: girdi.donem ?? EKIM,
    bugun: girdi.bugun ?? BUGUN,
    hareketler: girdi.hareketler ?? [],
    cariler: girdi.cariler ?? [],
  });

describe("tahsilat ve alacak — dönem akışı", () => {
  it("dönemdeki tahsilatı ve iadeyi ayrı toplar", () => {
    const m = calistir({ hareketler: [
      hareket({ amount: 300_000 }),
      hareket({ amount: 200_000, transaction_date: "2026-10-20" }),
      hareket({ entry_type: "debit", source_type: "adjustment", amount: 50_000 }),
      // Düzeltme OLMAYAN borç kaydı iade değil (sözleşme borcu).
      hareket({ entry_type: "debit", source_type: "contract", amount: 900_000 }),
    ] });
    assert.equal(m.donemTahsilat, 500_000);
    assert.equal(m.donemIade, 50_000);
    assert.equal(m.donemNet, 450_000);
    assert.equal(m.donemAdet, 2);
  });

  it("dönem dışındaki hareketi dönem rakamına katmaz", () => {
    const m = calistir({ hareketler: [
      hareket({ transaction_date: "2026-09-28" }),
      hareket({ transaction_date: "2026-11-02" }),
    ] });
    assert.equal(m.donemTahsilat, 0);
  });

  it("iade tahsilatı aşarsa net eksiye düşmez", () => {
    const m = calistir({ hareketler: [
      hareket({ amount: 10_000 }),
      hareket({ entry_type: "debit", source_type: "adjustment", amount: 90_000 }),
    ] });
    assert.equal(m.donemNet, 0);
  });

  it("aylık seri dönem dışındaki ayları da gösterir", () => {
    const m = calistir({ hareketler: [hareket({ transaction_date: "2026-08-05", amount: 70_000 })] });
    assert.equal(m.aylikTahsilat.length, 6);
    assert.deepEqual(m.aylikTahsilat.map((a) => a.ay), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    assert.equal(m.aylikTahsilat.find((a) => a.ay === "2026-08")?.tutar, 70_000);
    assert.equal(m.donemTahsilat, 0, "dönem rakamına girmiyor");
  });
});

describe("tahsilat ve alacak — beklenen tahsilat takvimi", () => {
  it("kalanı taksitin status sütunundan DEĞİL cari tahsilatından türetir", () => {
    /*
      Bu tuzak canlıda yaşandı: müşteri 31.500 ödemişken taksit hâlâ
      "pending" görünüyordu. Naif bir `status <> 'paid'` sorgusu
      beklenen tahsilatı olduğundan BÜYÜK gösterir.
    */
    const m = calistir({ cariler: [cari({
      bakiye: 50_000,
      netTahsilat: 50_000,
      taksitler: [
        taksit({ id: "a", amount: 50_000, due_date: "2026-11-15", status: "pending" }),
        taksit({ id: "b", amount: 50_000, due_date: "2026-12-15", status: "pending" }),
      ],
    }) ] });
    // İlk taksit ödenmiş sayılıyor (net 50.000), ikincisi bakiyeye sığdırılıyor.
    assert.equal(m.planliKalan, 50_000);
    assert.equal(m.takvim.find((a) => a.ay === "2026-11")?.tutar, 0);
    assert.equal(m.takvim.find((a) => a.ay === "2026-12")?.tutar, 50_000);
  });

  it("vadesi geçmiş kalanı geleceğe karıştırmaz", () => {
    const m = calistir({ cariler: [cari({
      bakiye: 200_000,
      taksitler: [
        taksit({ id: "a", amount: 100_000, due_date: "2026-09-15" }),
        taksit({ id: "b", amount: 100_000, due_date: "2026-11-15" }),
      ],
    }) ] });
    assert.equal(m.gecikmisKalan, 100_000);
    assert.equal(m.gecikmisAdet, 1);
    assert.equal(m.takvim[0].tur, "gecmis");
    assert.equal(m.takvim[0].tutar, 100_000);
    // Bu ayın kovasında geçmiş kalan YOK.
    assert.equal(m.takvim.find((a) => a.ay === "2026-10")?.tutar, 0);
    assert.equal(m.onumuzdekiAy?.tutar, 100_000);
  });

  it("önümüzdeki ay kovası bir sonraki takvim ayı", () => {
    const m = calistir({ cariler: [cari({
      bakiye: 300_000,
      taksitler: [
        taksit({ id: "a", amount: 100_000, due_date: "2026-10-28" }),
        taksit({ id: "b", amount: 200_000, due_date: "2026-11-05" }),
      ],
    }) ] });
    assert.equal(m.onumuzdekiAy?.ay, "2026-11");
    assert.equal(m.onumuzdekiAy?.tutar, 200_000);
    assert.equal(m.onumuzdekiAy?.adet, 1);
  });

  it("yıl sonunu aşan ay anahtarını doğru kaydırır", () => {
    const m = calistir({
      bugun: "2026-12-20",
      cariler: [cari({ bakiye: 100_000, taksitler: [taksit({ amount: 100_000, due_date: "2027-01-10" })] })],
    });
    assert.equal(m.onumuzdekiAy?.ay, "2027-01");
    assert.equal(m.onumuzdekiAy?.etiket, "Oca 2027");
    assert.equal(m.onumuzdekiAy?.tutar, 100_000);
  });

  it("vadesi girilmemiş taksiti bir aya uydurmaz", () => {
    const m = calistir({ cariler: [cari({ bakiye: 100_000, taksitler: [taksit({ due_date: null, amount: 100_000 })] }) ] });
    const satir = m.takvim.find((a) => a.tur === "vadesiz");
    assert.equal(satir?.tutar, 100_000);
    assert.equal(m.planliKalan, 100_000);
    for (const ay of m.takvim.filter((a) => a.tur === "ay")) assert.equal(ay.tutar, 0);
  });

  it("iptal taksit beklenen tahsilata girmez", () => {
    const m = calistir({ cariler: [cari({
      bakiye: 100_000,
      taksitler: [taksit({ id: "a", amount: 100_000, status: "cancelled" })],
    }) ] });
    assert.equal(m.planliKalan, 0);
    assert.equal(m.plansizKalan, 100_000, "bakiye duruyor ama takvimde değil");
  });

  it("ufkun ötesindeki vade takvimde yok ama planlı kalanda var", () => {
    /* Son ayın kovasına eklemek onu yanlış aya yazmak olurdu;
       sessizce düşürmek de toplamı eksiltirdi. */
    const m = calistir({ cariler: [cari({
      bakiye: 100_000,
      taksitler: [taksit({ amount: 100_000, due_date: "2028-05-10" })],
    }) ] });
    assert.equal(m.planliKalan, 100_000);
    assert.equal(m.takvim.filter((a) => a.tur === "ay").reduce((t, a) => t + a.tutar, 0), 0);
  });

  it("takvim satırının türü anahtarından değil kendi alanından okunuyor", () => {
    /* "vadesiz" de "2026-11" gibi yedi karakter; anahtarın biçimine
       bakmak ikisini aynı kovaya düşürüyordu. */
    const m = calistir({ cariler: [cari({
      bakiye: 200_000,
      taksitler: [
        taksit({ id: "a", amount: 100_000, due_date: null }),
        taksit({ id: "b", amount: 100_000, due_date: "2026-09-01" }),
      ],
    }) ] });
    assert.deepEqual(
      m.takvim.filter((a) => a.tutar > 0).map((a) => a.tur),
      ["gecmis", "vadesiz"],
    );
  });

  it("takvim on iki ay ileriyi kapsar", () => {
    const m = calistir({});
    const aylar = m.takvim.filter((a) => a.tur === "ay");
    assert.equal(aylar.length, 12);
    assert.equal(aylar[0].ay, "2026-10");
    assert.equal(aylar[11].ay, "2027-09");
  });

  it("plansız kalanı açık bakiyeden türetir", () => {
    const m = calistir({ cariler: [
      cari({ id: "c1", bakiye: 300_000, taksitler: [taksit({ amount: 100_000 })] }),
      cari({ id: "c2", ad: "Beta", bakiye: 200_000, taksitler: [] }),
    ] });
    assert.equal(m.acikBakiye, 500_000);
    assert.equal(m.planliKalan, 100_000);
    assert.equal(m.plansizKalan, 400_000);
  });

  it("plan sözleşmeden büyükse kalanı bakiyeye sığdırır", () => {
    /* 09.10.2026: 45.000'lik sözleşmenin planı 2 × 27.500'dü ve
       "30.000 açık, 40.000 vadesi geçti" gibi imkânsız tablo çıkıyordu. */
    const m = calistir({ cariler: [cari({
      bakiye: 45_000,
      taksitler: [
        taksit({ id: "a", amount: 27_500, due_date: "2026-11-01" }),
        taksit({ id: "b", amount: 27_500, due_date: "2026-12-01" }),
      ],
    }) ] });
    assert.equal(m.planliKalan, 45_000);
    assert.equal(m.plansizKalan, 0);
  });
});

describe("tahsilat ve alacak — müşteri kırılımı", () => {
  it("en çok gecikeni üste alır ve yaklaşan vadeyi ayırır", () => {
    const m = calistir({ cariler: [
      cari({ id: "c1", ad: "Akademik", bakiye: 100_000, taksitler: [taksit({ amount: 100_000, due_date: "2026-11-01" })] }),
      cari({ id: "c2", ad: "Beta", bakiye: 80_000, taksitler: [taksit({ amount: 80_000, due_date: "2026-09-01" })] }),
    ] });
    assert.equal(m.musteriler[0].ad, "Beta");
    assert.equal(m.musteriler[0].gecikmis, 80_000);
    assert.equal(m.musteriler[0].enEskiVade, "2026-09-01");
    // 24.10 → 01.11 sekiz gün: yaklaşan penceresinin içinde.
    assert.ok(YAKLASAN_GUN >= 8);
    assert.equal(m.musteriler[1].yaklasan, 100_000);
    assert.equal(m.musteriler[1].gecikmis, 0);
  });

  it("yaklaşan penceresinin dışındaki vadeyi yaklaşan saymaz", () => {
    const m = calistir({ cariler: [cari({ bakiye: 100_000, taksitler: [taksit({ amount: 100_000, due_date: "2027-03-01" })] }) ] });
    assert.equal(m.musteriler[0].yaklasan, 0);
  });

  it("bakiyesi olmayan cariyi listeye koymaz", () => {
    const m = calistir({ cariler: [cari({ bakiye: 0, taksitler: [] })] });
    assert.deepEqual(m.musteriler, []);
  });

  it("boş kurumda sıfır döner, çökmez", () => {
    const m = calistir({});
    assert.deepEqual([m.donemTahsilat, m.acikBakiye, m.gecikmisKalan, m.planliKalan, m.plansizKalan], [0, 0, 0, 0, 0]);
    assert.equal(m.onumuzdekiAy?.tutar, 0);
  });
});

describe("tahsilat Excel sayfaları", () => {
  const model = calistir({
    hareketler: [hareket({ amount: 300_000 })],
    cariler: [cari({ bakiye: 200_000, taksitler: [taksit({ amount: 200_000, due_date: "2026-11-15" })] })],
  });
  const sayfalar = tahsilatSayfalari({ model, donemEtiket: "Bu ay" });

  it("dört sekme üretir", () => {
    assert.deepEqual(sayfalar.map((s) => s.ad), ["Özet", "Beklenen tahsilat", "Gerçekleşen tahsilat", "Müşteri alacakları"]);
  });

  it("tutarları liraya çevirir", () => {
    const oku = (ad: string) => sayfalar[0].satirlar.find((r) => String(r[0]) === ad)?.[1];
    assert.deepEqual(oku("Dönemde tahsil edilen"), { deger: 3000, bicim: "para" });
    assert.deepEqual(oku("Açık alacak (şu an)"), { deger: 2000, bicim: "para" });
    assert.deepEqual(oku("Önümüzdeki ay beklenen"), { deger: 2000, bicim: "para" });
  });

  it("her sayfada satır uzunluğu sütun sayısına eşit", () => {
    for (const sayfa of sayfalar) {
      for (const satir of sayfa.satirlar) {
        assert.equal(satir.length, sayfa.sutunlar.length, `${sayfa.ad} sayfasında satır/sütun uyuşmuyor`);
      }
    }
  });

  it("vadesi geçmiş satırı takvim sekmesinde adıyla duruyor", () => {
    const gecmisli = tahsilatSayfalari({
      model: calistir({ cariler: [cari({ bakiye: 100_000, taksitler: [taksit({ amount: 100_000, due_date: "2026-08-01" })] }) ] }),
      donemEtiket: "Bu ay",
    });
    assert.equal(gecmisli[1].satirlar[0][0], "Vadesi geçmiş");
  });
});
