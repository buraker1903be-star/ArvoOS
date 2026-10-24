import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { finansModeli, finansSayfalari, type FinansHareketi, type MaliyetKalemi } from "../../lib/rapor-finans";
import type { Donem } from "../../lib/rapor-donemi";

const EKIM: Donem = { startKey: "2026-10-01", endKey: "2026-10-31", key: "bu_ay" };
const BUGUN = "2026-10-24";

const hareket = (o: Partial<FinansHareketi>): FinansHareketi => ({
  transaction_type: "income", status: "paid", amount: 100_000, category: "Danışmanlık",
  title: "Kayıt", counterparty: null, due_date: null,
  paid_at: "2026-10-10T09:00:00Z", created_at: "2026-10-01T09:00:00Z", ...o,
});
const maliyet = (o: Partial<MaliyetKalemi>): MaliyetKalemi => ({
  amount: 50_000, status: "paid", cost_date: "2026-10-12", category: "Tedarikçi", ...o,
});

const calistir = (girdi: { hareketler?: FinansHareketi[]; maliyetler?: MaliyetKalemi[]; donem?: Donem; bugun?: string }) =>
  finansModeli({
    donem: girdi.donem ?? EKIM,
    bugun: girdi.bugun ?? BUGUN,
    hareketler: girdi.hareketler ?? [],
    maliyetler: girdi.maliyetler ?? [],
  });

describe("finansal performans — gerçekleşen", () => {
  it("gelir ve gideri ayrı toplar, net sonucu çıkarır", () => {
    const m = calistir({
      hareketler: [
        hareket({ transaction_type: "income", amount: 500_000 }),
        hareket({ transaction_type: "expense", amount: 120_000 }),
      ],
      maliyetler: [maliyet({ amount: 80_000 })],
    });
    assert.equal(m.gelir, 500_000);
    assert.equal(m.gider, 120_000);
    assert.equal(m.isMaliyeti, 80_000);
    assert.equal(m.toplamCikis, 200_000);
    assert.equal(m.netSonuc, 300_000);
    assert.equal(m.marj, 60);
  });

  it("iptal edilmiş hareketi hiçbir hesaba katmaz", () => {
    /* 'canceled' TEK L — `finance_transactions` kısıtı öyle.
       'cancelled' yazmak sessizce sıfır satır eşleştirirdi. */
    const m = calistir({ hareketler: [
      hareket({ status: "canceled", amount: 900_000 }),
      hareket({ transaction_type: "expense", status: "canceled", amount: 900_000 }),
    ] });
    assert.deepEqual([m.gelir, m.gider, m.bekleyenGelir.tutar], [0, 0, 0]);
  });

  it("ödenmemiş planı gerçekleşen gelire katmaz", () => {
    const m = calistir({ hareketler: [hareket({ status: "planned", due_date: "2026-10-20", paid_at: null })] });
    assert.equal(m.gelir, 0);
    assert.equal(m.bekleyenGelir.tutar, 100_000);
    assert.equal(m.bekleyenGelir.adet, 1);
  });

  it("ödeme anı boş kalan ödenmiş kaydı oluşturulma gününden sayar", () => {
    // Yoksa gelir hiçbir aya düşmez ve toplamdan sessizce eksilir.
    const m = calistir({ hareketler: [hareket({ paid_at: null, created_at: "2026-10-03T09:00:00Z" })] });
    assert.equal(m.gelir, 100_000);
    assert.equal(m.aylik.at(-1)?.gelir, 100_000);
  });

  it("ödeme anını Türkiye gününe göre aralığa sokar", () => {
    /* UTC'de 30 Eylül 21:30 = Türkiye'de 1 Ekim 00:30. UTC gününe
       bakan eski kalıp bu geliri Eylül'e yazıyordu. */
    const m = calistir({ hareketler: [hareket({ paid_at: "2026-09-30T21:30:00Z" })] });
    assert.equal(m.gelir, 100_000);
    assert.equal(m.aylik.at(-1)?.ay, "2026-10");
  });

  it("dönem dışındaki geliri saymaz ama seride gösterir", () => {
    const m = calistir({ hareketler: [hareket({ paid_at: "2026-08-10T09:00:00Z" })] });
    assert.equal(m.gelir, 0);
    assert.equal(m.aylik.find((a) => a.ay === "2026-08")?.gelir, 100_000);
  });

  it("gelir yoksa marj null — sıfır değil", () => {
    const m = calistir({ maliyetler: [maliyet({})] });
    assert.equal(m.gelir, 0);
    assert.equal(m.marj, null);
    assert.equal(m.netSonuc, -50_000, "gideri olan dönemde net eksi olabilir");
  });

  it("ödenmemiş maliyet kalemini dönem sonucuna katmaz", () => {
    const m = calistir({ maliyetler: [maliyet({ status: "planned", amount: 70_000 })] });
    assert.equal(m.isMaliyeti, 0);
  });
});

describe("finansal performans — planlı ve geciken", () => {
  it("vadesi geçmiş planı DÖNEMDEN BAĞIMSIZ sayar", () => {
    /* Geçen ayın ödenmemiş giderini bu ayın raporunda görmemek,
       aksiyon gerektiren tek satırı gizlemek olurdu. */
    const m = calistir({ hareketler: [
      hareket({ transaction_type: "expense", status: "planned", due_date: "2026-09-10", paid_at: null, amount: 40_000 }),
    ] });
    assert.equal(m.bekleyenGider.tutar, 0, "dönemde vadesi gelmiyor");
    assert.equal(m.gecikenGider.tutar, 40_000);
    assert.equal(m.gecikenGider.adet, 1);
  });

  it("bugün vadesi olan planı geciken saymaz", () => {
    const m = calistir({ hareketler: [hareket({ status: "planned", due_date: BUGUN, paid_at: null })] });
    assert.equal(m.gecikenGelir.tutar, 0);
    assert.equal(m.bekleyenGelir.tutar, 100_000);
  });

  it("vadesi girilmemiş planı ayrı satırda toplar", () => {
    const m = calistir({ hareketler: [hareket({ status: "planned", due_date: null, paid_at: null, amount: 30_000 })] });
    assert.equal(m.vadesizPlan.tutar, 30_000);
    assert.deepEqual([m.bekleyenGelir.tutar, m.gecikenGelir.tutar], [0, 0]);
  });

  it("planlı geliri gerçekleşen gelirle karıştırmaz", () => {
    const m = calistir({ hareketler: [
      hareket({ amount: 200_000 }),
      hareket({ status: "planned", due_date: "2026-10-28", paid_at: null, amount: 300_000 }),
    ] });
    assert.equal(m.gelir, 200_000);
    assert.equal(m.bekleyenGelir.tutar, 300_000);
  });
});

describe("finansal performans — kategoriler", () => {
  it("kategori kırılımlarının toplamı rakamlarla tutar", () => {
    const m = calistir({
      hareketler: [
        hareket({ amount: 300_000, category: "Danışmanlık" }),
        hareket({ amount: 100_000, category: "Eğitim" }),
        hareket({ transaction_type: "expense", amount: 60_000, category: "Kira" }),
      ],
      maliyetler: [maliyet({ amount: 50_000, category: "Tedarikçi" })],
    });
    assert.equal(m.gelirKategorileri.reduce((t, k) => t + k.tutar, 0), m.gelir);
    assert.equal(m.giderKategorileri.reduce((t, k) => t + k.tutar, 0), m.gider);
    assert.equal(m.maliyetKategorileri.reduce((t, k) => t + k.tutar, 0), m.isMaliyeti);
    assert.equal(m.gelirKategorileri[0].ad, "Danışmanlık");
    assert.equal(m.gelirKategorileri[0].pay, 75);
  });

  it("kategorisi boş kaydı Kategorisiz grubuna koyar", () => {
    const m = calistir({ hareketler: [hareket({ category: "  " }), hareket({ category: null })] });
    assert.equal(m.gelirKategorileri.length, 1);
    assert.equal(m.gelirKategorileri[0].ad, "Kategorisiz");
    assert.equal(m.gelirKategorileri[0].adet, 2);
  });

  it("gider ile iş maliyetini AYRI tutar", () => {
    /* İkisi aynı soruyu yanıtlamıyor: biri genel gider, öteki belirli
       bir işin maliyeti. Tek rakam göstermek hangi işin kârsız
       olduğunu görünmez yapardı. */
    const m = calistir({
      hareketler: [hareket({ transaction_type: "expense", amount: 60_000, category: "Kira" })],
      maliyetler: [maliyet({ amount: 50_000, category: "Kira" })],
    });
    assert.equal(m.giderKategorileri.length, 1);
    assert.equal(m.maliyetKategorileri.length, 1);
    assert.equal(m.gider, 60_000);
    assert.equal(m.isMaliyeti, 50_000);
  });

  it("boş kurumda sıfır döner, çökmez", () => {
    const m = calistir({});
    assert.deepEqual([m.gelir, m.gider, m.isMaliyeti, m.netSonuc], [0, 0, 0, 0]);
    assert.equal(m.marj, null);
    assert.deepEqual(m.gelirKategorileri, []);
    assert.equal(m.aylik.length, 6);
  });
});

describe("finans Excel sayfaları", () => {
  const model = calistir({
    hareketler: [hareket({ amount: 500_000 }), hareket({ transaction_type: "expense", amount: 120_000, category: "Kira" })],
    maliyetler: [maliyet({ amount: 80_000 })],
  });
  const sayfalar = finansSayfalari({ model, donemEtiket: "Bu ay" });
  const oku = (ad: string) => sayfalar[0].satirlar.find((r) => String(r[0]) === ad)?.[1];

  it("beş sekme üretir", () => {
    assert.deepEqual(sayfalar.map((s) => s.ad), [
      "Özet", "Aylara göre", "Gelir kategorileri", "Gider kategorileri", "İş maliyeti kategorileri",
    ]);
  });

  it("tutarı liraya, marjı orana çevirir", () => {
    assert.deepEqual(oku("Gelir (muhasebesel, ödenmiş)"), { deger: 5000, bicim: "para" });
    assert.deepEqual(oku("Net sonuç"), { deger: 3000, bicim: "para" });
    assert.deepEqual(oku("Net marj"), { deger: 0.6, bicim: "yuzde" });
  });

  it("aylık sayfada net kolonu gelir eksi çıkışlar", () => {
    const sonAy = sayfalar[1].satirlar.at(-1)!;
    assert.deepEqual(sonAy.slice(1), [5000, 1200, 800, 3000]);
  });

  it("gelir yoksa marj hücresi boş", () => {
    const bos = finansSayfalari({ model: calistir({}), donemEtiket: "Bu ay" });
    const satir = bos[0].satirlar.find((r) => String(r[0]) === "Net marj");
    assert.deepEqual(satir?.[1], { deger: null, bicim: "yuzde" });
  });

  it("her sayfada satır uzunluğu sütun sayısına eşit", () => {
    for (const sayfa of sayfalar) {
      for (const satir of sayfa.satirlar) {
        assert.equal(satir.length, sayfa.sutunlar.length, `${sayfa.ad} sayfasında satır/sütun uyuşmuyor`);
      }
    }
  });
});

describe("gelir defteri boşken tahsilat referansı", () => {
  const kasa = (o: Partial<{ entry_type: string; source_type: string | null; amount: number; transaction_date: string }>) => ({
    entry_type: "credit", source_type: "payment", amount: 100_000, transaction_date: "2026-10-10", ...o,
  });
  const calistirKasa = (girdi: {
    hareketler?: FinansHareketi[];
    maliyetler?: MaliyetKalemi[];
    kasa?: ReturnType<typeof kasa>[];
  }) => finansModeli({
    donem: EKIM, bugun: BUGUN,
    hareketler: girdi.hareketler ?? [],
    maliyetler: girdi.maliyetler ?? [],
    kasaHareketleri: girdi.kasa ?? [],
  });

  it("gelir kaydı yoksa defteri boş işaretler", () => {
    /*
      Canlıda görüldü: 49 ödenmiş gider, 0 ödenmiş gelir ve "net
      sonuç −₺498.789". Bu bir zarar değil — kurum gelirini
      sözleşme + tahsilat olarak işliyor, deftere yazmıyor. Rapor
      durumu söylemek zorunda.
    */
    const m = calistirKasa({
      hareketler: [hareket({ transaction_type: "expense", amount: 327_939 })],
      kasa: [kasa({ amount: 1_500_000 })],
    });
    assert.equal(m.gelirDefteriBos, true);
    assert.equal(m.gelir, 0);
    assert.equal(m.tahsilatReferansi, 1_500_000);
  });

  it("TAHSİLAT GELİRE KARIŞMIYOR", () => {
    /* Üç kavram ayrı (docs §3.2): referans hiçbir toplama girmiyor,
       net sonuç ve marj ondan etkilenmiyor. */
    const kasasiz = calistirKasa({ hareketler: [hareket({ transaction_type: "expense", amount: 50_000 })] });
    const kasali = calistirKasa({
      hareketler: [hareket({ transaction_type: "expense", amount: 50_000 })],
      kasa: [kasa({ amount: 900_000 })],
    });
    assert.equal(kasali.gelir, kasasiz.gelir);
    assert.equal(kasali.netSonuc, kasasiz.netSonuc);
    assert.equal(kasali.marj, kasasiz.marj);
    assert.equal(kasali.toplamCikis, kasasiz.toplamCikis);
    assert.equal(kasali.tahsilatReferansi, 900_000);
  });

  it("referanstan iadeyi düşer, eksiye indirmez", () => {
    const m = calistirKasa({ kasa: [
      kasa({ amount: 100_000 }),
      kasa({ entry_type: "debit", source_type: "adjustment", amount: 400_000 }),
    ] });
    assert.equal(m.tahsilatReferansi, 0);
  });

  it("dönem dışındaki tahsilatı referansa katmaz", () => {
    const m = calistirKasa({ kasa: [kasa({ transaction_date: "2026-09-20" })] });
    assert.equal(m.tahsilatReferansi, 0);
  });

  it("sözleşme borcu kaydı tahsilat sayılmaz", () => {
    const m = calistirKasa({ kasa: [kasa({ entry_type: "debit", source_type: "contract", amount: 900_000 })] });
    assert.equal(m.tahsilatReferansi, 0);
  });

  it("gelir kaydı varsa defter boş sayılmaz", () => {
    const m = calistirKasa({ hareketler: [hareket({ amount: 10_000 })] });
    assert.equal(m.gelirDefteriBos, false);
  });

  it("Excel özetinde referans satırı adıyla duruyor", () => {
    const m = calistirKasa({ kasa: [kasa({ amount: 700_000 })] });
    const satir = finansSayfalari({ model: m, donemEtiket: "Bu ay" })[0]
      .satirlar.find((r) => String(r[0]).startsWith("Dönemde kasaya giren"));
    assert.ok(satir, "referans satırı yok");
    assert.ok(String(satir?.[0]).includes("gelir değil"), "başlık gelir olmadığını söylemeli");
    assert.deepEqual(satir?.[1], { deger: 7000, bicim: "para" });
  });
});
