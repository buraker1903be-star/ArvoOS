import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { crmModeli, crmSayfalari, musteriAnahtari, type CrmSozlesmesi, type CrmTalebi } from "../../lib/rapor-crm";
import type { Donem } from "../../lib/rapor-donemi";

const EKIM: Donem = { startKey: "2026-10-01", endKey: "2026-10-31", key: "bu_ay" };

const talep = (o: Partial<CrmTalebi>): CrmTalebi => ({
  id: "t1", stage: "lead", source: "Google", lost_reason: null, estimated_value: 100_000,
  created_at: "2026-10-05T09:00:00Z", updated_at: "2026-10-05T09:00:00Z", ...o,
});
const sozlesme = (o: Partial<CrmSozlesmesi>): CrmSozlesmesi => ({
  id: "s1", opportunity_id: "t1", party_id: "c1", amount: 200_000, status: "signed",
  signed_at: "2026-10-10T09:00:00Z", created_at: "2026-10-10T09:00:00Z", ...o,
});

const calistir = (girdi: {
  talepler?: CrmTalebi[];
  sozlesmeler?: CrmSozlesmesi[];
  donem?: Donem;
  musteriler?: [string, string][];
  cariler?: [string, string][];
}) => crmModeli({
  donem: girdi.donem ?? EKIM,
  talepler: girdi.talepler ?? [],
  sozlesmeler: girdi.sozlesmeler ?? [],
  musteriAdi: new Map(girdi.musteriler ?? [["t1", "Akademik Merkez"]]),
  cariAdi: new Map(girdi.cariler ?? [["c1", "Akademik Merkez"]]),
});

describe("CRM analitiği — huni", () => {
  it("akademik aşamaları da huniye katar", () => {
    /*
      Elle sayılan aşama listesi akademik kurumların aşamalarını
      tanımıyordu; ilerlemiş talepler "ulaşılamamış" sayılıyor ve
      dönüşüm olduğundan küçük çıkıyordu (24.10.2026).
    */
    const m = calistir({ talepler: [
      talep({ id: "a", stage: "academic_review" }),
      talep({ id: "b", stage: "proposal_ready" }),
      talep({ id: "c", stage: "work_opened" }),
      talep({ id: "d", stage: "lead" }),
    ] });
    assert.equal(m.yeniTalep, 4);
    assert.equal(m.temas, 3);
    assert.equal(m.nitelikli, 3);
    assert.equal(m.teklifli, 2, "proposal_ready ve work_opened");
    assert.equal(m.kazanilan, 1, "yalnızca work_opened son adımda");
    assert.equal(m.donusum, 25);
  });

  it("dönem dışındaki talebi saymaz", () => {
    const m = calistir({ talepler: [talep({ created_at: "2026-09-25T09:00:00Z" })] });
    assert.equal(m.yeniTalep, 0);
    assert.equal(m.donusum, null);
  });

  it("kaybı KARARIN anına göre sayar", () => {
    /* Talep eski olabilir, kayıp kararı bu dönemde verilmiş
       olabilir; `updated_at` o kararın anı. */
    const m = calistir({ talepler: [
      talep({ id: "a", stage: "lost", created_at: "2026-07-01T09:00:00Z", updated_at: "2026-10-12T09:00:00Z", lost_reason: "Fiyat" }),
    ] });
    assert.equal(m.yeniTalep, 0, "talep bu dönemde açılmadı");
    assert.equal(m.kayip, 1);
    assert.equal(m.kayipSebepleri[0].ad, "Fiyat");
  });

  it("kayıp sebebi boşsa Belirtilmemiş grubuna düşer", () => {
    const m = calistir({ talepler: [talep({ stage: "lost", lost_reason: "  " })] });
    assert.equal(m.kayipSebepleri[0].ad, "Belirtilmemiş");
    assert.equal(m.kayipSebepleri[0].pay, 100);
  });
});

describe("CRM analitiği — kaynaklar", () => {
  it("kaynak başına dönüşüm oranı hesaplar", () => {
    const m = calistir({ talepler: [
      talep({ id: "a", source: "Google", stage: "won" }),
      talep({ id: "b", source: "Google", stage: "lead" }),
      talep({ id: "c", source: "Referans", stage: "completed" }),
    ] });
    const google = m.kaynaklar.find((k) => k.ad === "Google")!;
    const referans = m.kaynaklar.find((k) => k.ad === "Referans")!;
    assert.equal(google.adet, 2);
    assert.equal(google.kazanilan, 1);
    assert.equal(google.donusum, 50);
    assert.equal(referans.donusum, 100);
  });

  it("kaynak yazım farkını tek grup yapar, ilk yazımı gösterir", () => {
    const m = calistir({ talepler: [
      talep({ id: "a", source: "Instagram" }),
      talep({ id: "b", source: "instagram " }),
    ] });
    assert.equal(m.kaynaklar.length, 1);
    assert.equal(m.kaynaklar[0].ad, "Instagram");
    assert.equal(m.kaynaklar[0].adet, 2);
  });

  it("kaynağı boş talebi ayrıca sayar", () => {
    const m = calistir({ talepler: [talep({ source: null }), talep({ id: "b", source: "" })] });
    assert.equal(m.kaynakBelirtilmemis, 2);
    assert.equal(m.kaynaklar[0].ad, "Belirtilmemiş");
  });

  it("kaynak paylarının toplamı yüzü verir", () => {
    const m = calistir({ talepler: [
      talep({ id: "a", source: "A" }), talep({ id: "b", source: "B" }),
      talep({ id: "c", source: "B" }), talep({ id: "d", source: "C" }),
    ] });
    assert.equal(Math.round(m.kaynaklar.reduce((t, k) => t + (k.pay ?? 0), 0)), 100);
    assert.equal(m.kaynaklar.reduce((t, k) => t + k.adet, 0), m.yeniTalep);
  });
});

describe("CRM analitiği — müşteriler ve tekrar satış", () => {
  it("tekrar eden müşteriyi ÖMÜR BOYU bakarak bulur", () => {
    /* Yalnızca dönem içine bakmak, iki yıllık bir müşteriyi "yeni"
       göstermek olurdu. */
    const m = calistir({ sozlesmeler: [
      sozlesme({ id: "eski", party_id: "c1", signed_at: "2025-03-10T09:00:00Z", amount: 100_000 }),
      sozlesme({ id: "yeni", party_id: "c1", signed_at: "2026-10-10T09:00:00Z", amount: 200_000 }),
      sozlesme({ id: "ilk", party_id: "c2", signed_at: "2026-10-12T09:00:00Z", amount: 50_000 }),
    ], cariler: [["c1", "Akademik Merkez"], ["c2", "Beta"]] });
    assert.equal(m.tekrarEden, 1);
    assert.equal(m.yeniMusteri, 1);
    assert.equal(m.tekrarOrani, 50);
  });

  it("dönemde imzalamayan müşteriyi orana katmaz", () => {
    const m = calistir({ sozlesmeler: [
      sozlesme({ id: "eski", party_id: "c9", signed_at: "2025-01-10T09:00:00Z" }),
    ], cariler: [["c9", "Gama"]] });
    assert.deepEqual([m.yeniMusteri, m.tekrarEden], [0, 0]);
    assert.equal(m.tekrarOrani, null);
    // Ama ömür boyu listede duruyor.
    assert.equal(m.enDegerli.length, 1);
  });

  it("imzasız sözleşmeyi müşteri saymaz", () => {
    const m = calistir({ sozlesmeler: [
      sozlesme({ id: "a", status: "draft" }),
      sozlesme({ id: "b", status: "sent" }),
      sozlesme({ id: "c", status: "cancelled" }),
    ] });
    assert.deepEqual(m.enDegerli, []);
    assert.equal(m.musteriBasina, 0);
  });

  it("cari kaydı olmayan sözleşmeyi addan gruplar ve SAYISINI söyler", () => {
    /* Sessizce ada güvenmek, aynı müşteriyi iki müşteri gibi
       gösterip tekrar oranını olduğundan küçük yazardı. */
    const m = calistir({
      sozlesmeler: [
        sozlesme({ id: "a", party_id: null, opportunity_id: "t1", amount: 100_000 }),
        sozlesme({ id: "b", party_id: null, opportunity_id: "t2", amount: 50_000 }),
      ],
      musteriler: [["t1", "Akademik Merkez"], ["t2", "akademik  merkez"]],
    });
    assert.equal(m.kimliksizSozlesme, 2);
    assert.equal(m.enDegerli.length, 1, "yazım farkı tek müşteri");
    assert.equal(m.enDegerli[0].sozlesmeAdet, 2);
    assert.equal(m.enDegerli[0].cariId, null);
  });

  it("cari kimliği adı ezer — aynı ad iki cariyse iki müşteri", () => {
    const m = calistir({
      sozlesmeler: [
        sozlesme({ id: "a", party_id: "c1", amount: 100_000 }),
        sozlesme({ id: "b", party_id: "c2", amount: 60_000 }),
      ],
      cariler: [["c1", "Akademik Merkez"], ["c2", "Akademik Merkez"]],
    });
    assert.equal(m.enDegerli.length, 2);
    assert.equal(m.kimliksizSozlesme, 0);
  });

  it("en değerli müşteriyi tutara göre sıralar ve ilk/son işi verir", () => {
    const m = calistir({
      sozlesmeler: [
        sozlesme({ id: "a", party_id: "c1", amount: 100_000, signed_at: "2026-03-10T09:00:00Z" }),
        sozlesme({ id: "b", party_id: "c1", amount: 300_000, signed_at: "2026-10-10T09:00:00Z" }),
        sozlesme({ id: "c", party_id: "c2", amount: 250_000, signed_at: "2026-10-11T09:00:00Z" }),
      ],
      cariler: [["c1", "Akademik Merkez"], ["c2", "Beta"]],
    });
    assert.equal(m.enDegerli[0].ad, "Akademik Merkez");
    assert.equal(m.enDegerli[0].tutar, 400_000);
    assert.equal(m.enDegerli[0].ilkIs, "2026-03-10");
    assert.equal(m.enDegerli[0].sonIs, "2026-10-10");
    assert.equal(m.musteriBasina, 325_000);
  });

  it("imza anı boş kalan imzalı sözleşmeyi oluşturulma gününden sayar", () => {
    const m = calistir({ sozlesmeler: [
      sozlesme({ signed_at: null, created_at: "2026-10-09T09:00:00Z" }),
    ] });
    assert.equal(m.enDegerli[0].ilkIs, "2026-10-09");
    assert.equal(m.yeniMusteri, 1);
  });
});

describe("CRM analitiği — aylık seri ve Excel", () => {
  it("aylık seri dönemden bağımsız altı ay", () => {
    const m = calistir({ talepler: [
      talep({ id: "a", created_at: "2026-08-10T09:00:00Z" }),
      talep({ id: "b", stage: "completed", created_at: "2026-07-01T09:00:00Z", updated_at: "2026-09-05T09:00:00Z" }),
    ] });
    assert.equal(m.aylik.length, 6);
    assert.equal(m.aylik.find((a) => a.ay === "2026-08")?.talep, 1);
    assert.equal(m.aylik.find((a) => a.ay === "2026-07")?.talep, 1);
    assert.equal(m.aylik.find((a) => a.ay === "2026-09")?.kazanilan, 1, "kazanım kararın ayına");
  });

  it("beş sekme üretir ve tarihleri tarih biçiminde yazar", () => {
    const model = calistir({
      talepler: [talep({ stage: "won", source: "Referans" })],
      sozlesmeler: [sozlesme({ amount: 400_000 })],
    });
    const sayfalar = crmSayfalari({ model, donemEtiket: "Bu ay" });
    assert.deepEqual(sayfalar.map((s) => s.ad), [
      "Özet", "Kaynaklar", "Kayıp sebepleri", "Aylara göre", "En değerli müşteriler",
    ]);
    const musteriSayfasi = sayfalar[4];
    assert.equal(musteriSayfasi.sutunlar[3].bicim, "tarih");
    assert.equal(musteriSayfasi.satirlar[0][3], "2026-10-10");
    const oku = (ad: string) => sayfalar[0].satirlar.find((r) => String(r[0]) === ad)?.[1];
    assert.deepEqual(oku("Müşteri başına ortalama (ömür boyu)"), { deger: 4000, bicim: "para" });
    assert.deepEqual(oku("Talep → kazanım dönüşümü"), { deger: 1, bicim: "yuzde" });
  });

  it("boş kurumda sıfır döner, çökmez", () => {
    const m = calistir({});
    assert.deepEqual([m.yeniTalep, m.kazanilan, m.kayip, m.yeniMusteri, m.tekrarEden], [0, 0, 0, 0, 0]);
    assert.equal(m.donusum, null);
    assert.equal(m.tekrarOrani, null);
    const sayfalar = crmSayfalari({ model: m, donemEtiket: "Bu ay" });
    for (const sayfa of sayfalar) {
      for (const satir of sayfa.satirlar) assert.equal(satir.length, sayfa.sutunlar.length);
    }
  });

  it("müşteri anahtarı Türkçe küçültmeyle çalışır", () => {
    assert.equal(musteriAnahtari("  AKADEMİK   MERKEZ "), "akademik merkez");
  });
});
