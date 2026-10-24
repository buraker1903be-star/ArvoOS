import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { hizmetAnahtari, satisModeli, satisSayfalari, type SatisSozlesmesi, type SatisTalebi, type SatisTeklifi } from "../../lib/rapor-satis";
import type { Donem } from "../../lib/rapor-donemi";

const EKIM: Donem = { startKey: "2026-10-01", endKey: "2026-10-31", key: "bu_ay" };

const sozlesme = (o: Partial<SatisSozlesmesi>): SatisSozlesmesi => ({
  id: "s1", contract_no: "SOZ-1", title: "İş", amount: 100_000, status: "signed",
  signed_at: "2026-10-10T09:00:00Z", created_at: "2026-10-01T09:00:00Z", opportunity_id: "t1", ...o,
});
const teklif = (o: Partial<SatisTeklifi>): SatisTeklifi => ({
  id: "p1", root_proposal_id: null, amount: 50_000, status: "sent", archive_reason: null,
  sent_at: "2026-10-05T09:00:00Z", ...o,
});
/* Kabul edilmiş teklif canlıda BÖYLE duruyor: status 'archived',
   gerçek durum archive_reason'da (tetikleyici öyle yazıyor). */
const kabulEdilmis = (o: Partial<SatisTeklifi> = {}) =>
  teklif({ status: "archived", archive_reason: "accepted", ...o });
const talep = (o: Partial<SatisTalebi> = {}): SatisTalebi => ({
  assigned_employee_id: "e1", customer_name: "Akademik Merkez", service_type: "Tez Yazımı", ...o,
});

const calistir = (girdi: {
  sozlesmeler?: SatisSozlesmesi[];
  teklifler?: SatisTeklifi[];
  talepler?: [string, SatisTalebi][];
  personel?: [string, string][];
  donem?: Donem;
}) => satisModeli({
  donem: girdi.donem ?? EKIM,
  sozlesmeler: girdi.sozlesmeler ?? [],
  teklifler: girdi.teklifler ?? [],
  talepler: new Map(girdi.talepler ?? [["t1", talep()]]),
  personelAdi: new Map(girdi.personel ?? [["e1", "Ayşe Yılmaz"]]),
});

describe("satış analitiği", () => {
  it("yalnızca imzalı ve tamamlanmış sözleşmeyi satış sayar", () => {
    const m = calistir({ sozlesmeler: [
      sozlesme({ id: "a", status: "signed", amount: 100_000 }),
      sozlesme({ id: "b", status: "completed", amount: 50_000 }),
      sozlesme({ id: "c", status: "draft", amount: 900_000 }),
      sozlesme({ id: "d", status: "sent", amount: 900_000 }),
      sozlesme({ id: "e", status: "cancelled", amount: 900_000 }),
      sozlesme({ id: "f", status: "rejected", amount: 900_000 }),
    ] });
    assert.equal(m.adet, 2);
    assert.equal(m.toplam, 150_000);
    assert.equal(m.ortalama, 75_000);
  });

  it("dönem dışındaki imzayı saymaz", () => {
    const m = calistir({ sozlesmeler: [
      sozlesme({ id: "a", signed_at: "2026-09-30T09:00:00Z" }),
      sozlesme({ id: "b", signed_at: "2026-11-01T09:00:00Z" }),
      sozlesme({ id: "c", signed_at: "2026-10-31T09:00:00Z" }),
    ] });
    assert.equal(m.adet, 1);
  });

  it("imza anı Türkiye gününe göre aralığa girer", () => {
    /* UTC'de 30 Eylül 21:30 = Türkiye'de 1 Ekim 00:30. UTC gününe
       bakan eski kalıp bu satışı Eylül'e yazıyordu. */
    const m = calistir({ sozlesmeler: [sozlesme({ signed_at: "2026-09-30T21:30:00Z" })] });
    assert.equal(m.adet, 1);
    assert.equal(m.aylik.at(-1)?.ay, "2026-10");
    assert.equal(m.aylik.at(-1)?.adet, 1);
  });

  it("imza anı boş kalan imzalı sözleşmeyi oluşturulma gününden sayar", () => {
    // Yoksa satış hiçbir aya düşmez ve toplamdan sessizce eksilir.
    const m = calistir({ sozlesmeler: [sozlesme({ signed_at: null, created_at: "2026-10-12T09:00:00Z" })] });
    assert.equal(m.adet, 1);
    assert.equal(m.toplam, 100_000);
  });

  it("teklif revizyonlarını tek süreç sayar", () => {
    /* Ham satır saymak bir süreci üç teklif gibi gösterir ve
       dönüşümü üçte bire indirir (docs/RAPORLAMA-ASAMA-1.md §3.1). */
    const m = calistir({ teklifler: [
      teklif({ id: "p1", root_proposal_id: null, amount: 25_000, sent_at: "2026-10-02T09:00:00Z" }),
      teklif({ id: "p2", root_proposal_id: "p1", amount: 32_000, sent_at: "2026-10-06T09:00:00Z" }),
      kabulEdilmis({ id: "p3", root_proposal_id: "p1", amount: 40_000, sent_at: "2026-10-09T09:00:00Z" }),
    ] });
    assert.equal(m.teklifAdet, 1);
    assert.equal(m.kabulAdet, 1);
    assert.equal(m.donusum, 100);
    // Sürecin tutarı EN SON gönderilen revizyondan.
    assert.equal(m.teklifTutari, 40_000);
  });

  it("revizyonlar ters sırada gelse de son gönderimi seçer", () => {
    const m = calistir({ teklifler: [
      teklif({ id: "p3", root_proposal_id: "p1", amount: 40_000, sent_at: "2026-10-09T09:00:00Z" }),
      teklif({ id: "p1", root_proposal_id: null, amount: 25_000, sent_at: "2026-10-02T09:00:00Z" }),
    ] });
    assert.equal(m.teklifTutari, 40_000);
  });

  it("gönderilmemiş teklifi paydaya katmaz", () => {
    const m = calistir({ teklifler: [
      teklif({ id: "p1", sent_at: null, status: "draft" }),
      teklif({ id: "p2", sent_at: "2026-10-05T09:00:00Z" }),
    ] });
    assert.equal(m.teklifAdet, 1);
  });

  it("KABUL durumunu archive_reason'dan okur", () => {
    /*
      Canlıdaki tetikleyici kabul edilen teklifi 'archived' yapıyor ve
      gerçek durumu archive_reason'a yazıyor. `status === "accepted"`
      arayan eski kod hiçbir koşulda kabul bulamıyordu: dönüşüm oranı
      her zaman %0 çıkıyordu (24.10.2026'da düzeltildi).
    */
    const m = calistir({ teklifler: [kabulEdilmis()] });
    assert.equal(m.kabulAdet, 1);
    assert.equal(m.donusum, 100);
  });

  it("elle arşivlenen teklifi kabul saymaz", () => {
    const m = calistir({ teklifler: [teklif({ status: "archived", archive_reason: "manual" })] });
    assert.equal(m.kabulAdet, 0);
    assert.equal(m.donusum, 0);
  });

  it("reddedilen ve süresi geçen teklifi kabul saymaz", () => {
    const m = calistir({ teklifler: [
      teklif({ id: "p1", status: "archived", archive_reason: "rejected" }),
      teklif({ id: "p2", status: "archived", archive_reason: "expired" }),
    ] });
    assert.equal(m.teklifAdet, 2);
    assert.equal(m.kabulAdet, 0);
  });

  it("teklif yoksa dönüşüm null — sıfır değil", () => {
    // "%0" yazmak "hiç kabul edilmedi" demekti; oysa hiç teklif yok.
    assert.equal(calistir({}).donusum, null);
  });

  it("kabul zincirin herhangi bir revizyonundan sayılır", () => {
    const m = calistir({ teklifler: [
      kabulEdilmis({ id: "p1", sent_at: "2026-10-02T09:00:00Z" }),
      teklif({ id: "p2", root_proposal_id: "p1", status: "sent", sent_at: "2026-10-08T09:00:00Z" }),
    ] });
    assert.equal(m.kabulAdet, 1);
  });

  it("personel kırılımının toplamı raporun toplamıyla tutar", () => {
    const m = calistir({
      sozlesmeler: [
        sozlesme({ id: "a", amount: 60_000, opportunity_id: "t1" }),
        sozlesme({ id: "b", amount: 40_000, opportunity_id: "t2" }),
        sozlesme({ id: "c", amount: 10_000, opportunity_id: null }),
      ],
      talepler: [["t1", talep()], ["t2", talep({ assigned_employee_id: "e2" })]],
      personel: [["e1", "Ayşe Yılmaz"], ["e2", "Mehmet Demir"]],
    });
    assert.equal(m.personel.reduce((t, k) => t + k.tutar, 0), m.toplam);
    assert.equal(m.personel.reduce((t, k) => t + k.adet, 0), m.adet);
    assert.equal(m.atanmamisAdet, 1);
    assert.equal(m.personel[0].ad, "Ayşe Yılmaz");
    // Pay TOPLAM satışa göre: 60.000 / 110.000.
    assert.equal(Math.round(m.personel[0].pay ?? 0), 55);
  });

  it("talebi atanmamış satışı ayrı satırda toplar", () => {
    const m = calistir({
      sozlesmeler: [sozlesme({ id: "a", opportunity_id: "t9" })],
      talepler: [["t9", talep({ assigned_employee_id: null })]],
    });
    assert.equal(m.personel.length, 1);
    assert.equal(m.personel[0].ad, "Atanmamış");
    assert.equal(m.atanmamisAdet, 1);
  });

  it("hizmet türünde yazım farkını tek grup yapar, ilk yazımı gösterir", () => {
    const m = calistir({
      sozlesmeler: [
        sozlesme({ id: "a", amount: 30_000, opportunity_id: "t1" }),
        sozlesme({ id: "b", amount: 20_000, opportunity_id: "t2" }),
      ],
      talepler: [
        ["t1", talep({ service_type: "Tez Yazımı" })],
        ["t2", talep({ service_type: "tez  yazımı " })],
      ],
    });
    assert.equal(m.hizmet.length, 1);
    assert.equal(m.hizmet[0].ad, "Tez Yazımı");
    assert.equal(m.hizmet[0].adet, 2);
    assert.equal(m.hizmet[0].tutar, 50_000);
  });

  it("hizmet türü boşsa belirtilmemiş grubuna düşer", () => {
    const m = calistir({
      sozlesmeler: [sozlesme({ opportunity_id: "t1" })],
      talepler: [["t1", talep({ service_type: "   " })]],
    });
    assert.equal(m.hizmet[0].ad, "Belirtilmemiş");
  });

  it("aylık seri dönem bitişinden geriye altı ay", () => {
    const m = calistir({ sozlesmeler: [] });
    assert.equal(m.aylik.length, 6);
    assert.deepEqual(m.aylik.map((a) => a.ay), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    assert.equal(m.aylik[0].etiket, "May");
  });

  it("aylık seri dönem dışındaki ayları da gösterir", () => {
    /* "Son altı ay" sorusu dönem seçimine bağlı değil: Ekim seçiliyken
       Ağustos çubuğu da dolu olmalı, yoksa eğilim okunmaz. */
    const m = calistir({ sozlesmeler: [sozlesme({ signed_at: "2026-08-15T09:00:00Z" })] });
    assert.equal(m.adet, 0, "dönem rakamına girmiyor");
    assert.equal(m.aylik.find((a) => a.ay === "2026-08")?.adet, 1, "seride görünüyor");
  });

  it("en büyük satışları tutara göre sıralar ve onda keser", () => {
    const sozlesmeler = Array.from({ length: 14 }, (_, i) =>
      sozlesme({ id: `s${i}`, contract_no: `SOZ-${i}`, amount: (i + 1) * 1000 }));
    const m = calistir({ sozlesmeler });
    assert.equal(m.enBuyuk.length, 10);
    assert.equal(m.enBuyuk[0].tutar, 14_000);
    assert.equal(m.enBuyuk[0].musteri, "Akademik Merkez");
    assert.equal(m.enBuyuk[0].gun, "2026-10-10");
  });

  it("müşterisi okunamayan satışta çizgi gösterir", () => {
    const m = calistir({ sozlesmeler: [sozlesme({ opportunity_id: null })] });
    assert.equal(m.enBuyuk[0].musteri, "—");
  });

  it("boş dönemde sıfır döner, çökmez", () => {
    const m = calistir({});
    assert.deepEqual([m.adet, m.toplam, m.ortalama, m.teklifAdet, m.kabulAdet], [0, 0, 0, 0, 0]);
    assert.deepEqual(m.personel, []);
    assert.deepEqual(m.enBuyuk, []);
  });

  it("hizmet anahtarı ortak gruplama kuralını kullanır", () => {
    /* Kural lib/metin-anahtari.ts'te: büyük/küçük harf, boşluk ve
       ı/i farkı siliniyor. Burada yalnızca `toLocaleLowerCase("tr")`
       vardı ve "Instagram" ile "instagram" ayrı gruplara düşüyordu. */
    assert.equal(hizmetAnahtari("İNGİLİZCE ÇEVİRİ"), hizmetAnahtari("ingilizce çeviri"));
    assert.equal(hizmetAnahtari(" Tez   Yazımı "), hizmetAnahtari("TEZ YAZIMI"));
    assert.equal(hizmetAnahtari("Instagram"), hizmetAnahtari("instagram"));
  });
});

describe("satış analitiği Excel sayfaları", () => {
  const model = calistir({
    sozlesmeler: [sozlesme({ amount: 150_000 })],
    teklifler: [kabulEdilmis()],
  });
  const sayfalar = satisSayfalari({ model, donemEtiket: "Bu ay" });
  const ozetSatiri = (ad: string) => sayfalar[0].satirlar.find((r) => String(r[0]) === ad)?.[1];

  it("beş sekme üretir", () => {
    assert.deepEqual(sayfalar.map((s) => s.ad), ["Özet", "Aylara göre", "Personel", "Hizmet türü", "En büyük satışlar"]);
  });

  it("tutarı liraya çevirir — kuruş yazmaz", () => {
    /* Kuruşu olduğu gibi yazmak tutarı yüz katına çıkarır ve hücre
       yine geçerli görünür. */
    assert.deepEqual(ozetSatiri("Satış tutarı (imzalanan sözleşme)"), { deger: 1500, bicim: "para" });
    assert.deepEqual(ozetSatiri("Ortalama sözleşme"), { deger: 1500, bicim: "para" });
  });

  it("özet sütununda biçim hücre hücre verilir", () => {
    /* Tek sütunda tutar, adet ve oran birden var: sütuna tek biçim
       vermek adedi "2,00 ₺" yapardı. */
    assert.deepEqual(ozetSatiri("Satış adedi"), { deger: 1, bicim: "sayi" });
    assert.equal(sayfalar[0].sutunlar[1].bicim, undefined);
  });

  it("yüzdeyi oran olarak yazar", () => {
    assert.deepEqual(ozetSatiri("Teklif → satış dönüşümü"), { deger: 1, bicim: "yuzde" });
    assert.equal(sayfalar[2].satirlar[0][3], 1);
  });

  it("dönüşüm yoksa hücreyi boş bırakır", () => {
    const bos = satisSayfalari({ model: calistir({}), donemEtiket: "Bu ay" });
    const satir = bos[0].satirlar.find((r) => String(r[0]) === "Teklif → satış dönüşümü");
    assert.deepEqual(satir?.[1], { deger: null, bicim: "yuzde" });
  });

  it("özet satırının başlığı hep metin", () => {
    for (const satir of sayfalar[0].satirlar) assert.equal(typeof satir[0], "string");
  });

  it("her sayfada satır uzunluğu sütun sayısına eşit", () => {
    for (const sayfa of sayfalar) {
      for (const satir of sayfa.satirlar) {
        assert.equal(satir.length, sayfa.sutunlar.length, `${sayfa.ad} sayfasında satır/sütun uyuşmuyor`);
      }
    }
  });

  it("dönem etiketi özete yazılır", () => {
    assert.equal(sayfalar[0].satirlar[0][1], "Bu ay");
  });
});
