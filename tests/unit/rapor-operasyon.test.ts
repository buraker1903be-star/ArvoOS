import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { operasyonModeli, operasyonSayfalari, type OperasyonAdimi, type OperasyonIsi } from "../../lib/rapor-operasyon";
import type { Donem } from "../../lib/rapor-donemi";

const EKIM: Donem = { startKey: "2026-10-01", endKey: "2026-10-31", key: "bu_ay" };
const BUGUN = "2026-10-24";

const is = (o: Partial<OperasyonIsi>): OperasyonIsi => ({
  id: "i1", title: "Tez düzenleme", customer_name: "Akademik Merkez",
  status: "in_progress", priority: "normal", waiting_party: "us",
  start_date: "2026-10-05", due_date: "2026-11-05", delivered_at: null,
  assigned_employee_id: "e1",
  created_at: "2026-10-05T09:00:00Z", updated_at: "2026-10-10T09:00:00Z", ...o,
});
const adim = (o: Partial<OperasyonAdimi>): OperasyonAdimi => ({
  workflow_id: "i1", status: "planned", is_completed: false, due_date: null, completed_at: null, ...o,
});

const calistir = (girdi: {
  isler?: OperasyonIsi[];
  adimlar?: OperasyonAdimi[];
  donem?: Donem;
  bugun?: string;
  personel?: [string, string][];
}) => operasyonModeli({
  donem: girdi.donem ?? EKIM,
  bugun: girdi.bugun ?? BUGUN,
  isler: girdi.isler ?? [],
  adimlar: girdi.adimlar ?? [],
  personelAdi: new Map(girdi.personel ?? [["e1", "Ayşe Yılmaz"]]),
});

describe("operasyon raporu — akış ve durum", () => {
  it("açılan ve tamamlananı ayrı sayar", () => {
    const m = calistir({ isler: [
      is({ id: "a" }),
      is({ id: "b", status: "completed", delivered_at: "2026-10-20T09:00:00Z" }),
    ] });
    assert.equal(m.acilan, 2);
    assert.equal(m.tamamlanan, 1);
    assert.equal(m.devamEden, 1);
  });

  it("teslim anı boş kalan tamamlanmış işi son hareketten sayar", () => {
    // Yoksa tamamlanan sayısı sessizce eksilirdi.
    const m = calistir({ isler: [
      is({ status: "completed", delivered_at: null, updated_at: "2026-10-22T09:00:00Z" }),
    ] });
    assert.equal(m.tamamlanan, 1);
  });

  it("iptal ve arşivi tamamlanmış saymaz ama devam edenden de çıkarır", () => {
    const m = calistir({ isler: [
      is({ id: "a", status: "cancelled" }),
      is({ id: "b", status: "archived" }),
      is({ id: "c", status: "blocked" }),
    ] });
    assert.equal(m.tamamlanan, 0);
    assert.equal(m.devamEden, 1, "yalnızca blocked açık");
  });

  it("devam eden ve geciken DÖNEMDEN BAĞIMSIZ", () => {
    /* İki ay önce açılmış ve hâlâ bitmemiş iş bu ayın raporunda da
       görünmeli. */
    const m = calistir({ isler: [
      is({ created_at: "2026-08-01T09:00:00Z", due_date: "2026-09-01" }),
    ] });
    assert.equal(m.acilan, 0, "dönem akışına girmiyor");
    assert.equal(m.devamEden, 1);
    assert.equal(m.geciken, 1);
    assert.equal(m.gecikenler[0].gecikmeGun, 53);
  });

  it("gecikmeyi termine göre belirler, duruma göre değil", () => {
    /* Durumu "in_progress" olan bir işin termini geçmiş olabilir ve
       durum bunu söylemiyor. */
    const m = calistir({ isler: [
      is({ id: "a", status: "in_progress", due_date: "2026-10-01" }),
      is({ id: "b", status: "in_progress", due_date: "2026-11-01" }),
    ] });
    assert.equal(m.geciken, 1);
  });

  it("kapanmış işin geçmiş terminini gecikme saymaz", () => {
    const m = calistir({ isler: [
      is({ id: "a", status: "completed", due_date: "2026-09-01", delivered_at: "2026-10-02T09:00:00Z" }),
      is({ id: "b", status: "cancelled", due_date: "2026-09-01" }),
    ] });
    assert.equal(m.geciken, 0);
  });

  it("termini olmayan işi gecikme saymaz", () => {
    const m = calistir({ isler: [is({ due_date: null })] });
    assert.equal(m.geciken, 0);
  });

  it("bugün vadesi olan işi gecikmiş saymaz", () => {
    const m = calistir({ isler: [is({ due_date: BUGUN })] });
    assert.equal(m.geciken, 0);
  });
});

describe("operasyon raporu — süre ve dağılımlar", () => {
  it("ortalama süreyi başlangıcı olan tamamlanmış işlerden hesaplar", () => {
    /* Başlangıcı girilmemiş işi oluşturulma anından ölçmek, planlama
       süresini de işin süresine yazmak olurdu. */
    const m = calistir({ isler: [
      is({ id: "a", status: "completed", start_date: "2026-10-01", delivered_at: "2026-10-11T09:00:00Z" }),
      is({ id: "b", status: "completed", start_date: "2026-10-01", delivered_at: "2026-10-21T09:00:00Z" }),
      is({ id: "c", status: "completed", start_date: null, delivered_at: "2026-10-30T09:00:00Z" }),
    ] });
    assert.equal(m.ortSureGun, 15, "(10 + 20) / 2");
  });

  it("tamamlanan iş yoksa ortalama null", () => {
    assert.equal(calistir({ isler: [is({})] }).ortSureGun, null);
  });

  it("durum dağılımının toplamı bütün işlere eşit", () => {
    const m = calistir({ isler: [
      is({ id: "a", status: "planned" }), is({ id: "b", status: "in_progress" }),
      is({ id: "c", status: "completed" }), is({ id: "d", status: "cancelled" }),
    ] });
    assert.equal(m.durumDagilimi.reduce((t, d) => t + d.adet, 0), 4);
    assert.equal(m.durumDagilimi.find((d) => d.anahtar === "planned")?.ad, "Planlandı");
  });

  it("öncelik ve bekleyen taraf yalnızca AÇIK işlerden", () => {
    /* Kapanmış işin önceliği artık bir karar gerektirmiyor; dahil
       etmek "acil iş sayısı"nı geçmişle şişirirdi. */
    const m = calistir({ isler: [
      is({ id: "a", priority: "urgent", waiting_party: "customer" }),
      is({ id: "b", status: "completed", priority: "urgent", waiting_party: "customer" }),
    ] });
    assert.equal(m.oncelikDagilimi.reduce((t, d) => t + d.adet, 0), 1);
    assert.equal(m.bekleyenTarafDagilimi[0].ad, "Müşteride");
    assert.equal(m.bizdeOlmayan, 1);
  });

  it("kısıtta olmayan değeri ham haliyle gösterir", () => {
    // "—" yazmak kaydın nerede olduğunu gizlemek olurdu.
    const m = calistir({ isler: [is({ status: "yeni_durum" })] });
    assert.equal(m.durumDagilimi[0].ad, "yeni_durum");
  });
});

describe("operasyon raporu — görevler ve ekip", () => {
  it("görevleri yalnızca AÇIK işlerden sayar", () => {
    const m = calistir({
      isler: [is({ id: "acik" }), is({ id: "kapali", status: "completed" })],
      adimlar: [
        adim({ workflow_id: "acik", is_completed: true }),
        adim({ workflow_id: "acik", status: "done" }),
        adim({ workflow_id: "acik", due_date: "2026-10-01" }),
        adim({ workflow_id: "kapali", is_completed: false, due_date: "2026-09-01" }),
      ],
    });
    assert.equal(m.adimToplam, 3);
    assert.equal(m.adimTamamlanan, 2, "is_completed ya da status=done");
    assert.equal(m.adimGeciken, 1);
  });

  it("tamamlanmış görevi geciken saymaz", () => {
    const m = calistir({
      isler: [is({})],
      adimlar: [adim({ is_completed: true, due_date: "2026-09-01" })],
    });
    assert.equal(m.adimGeciken, 0);
  });

  it("ekip yükünü ASIL sorumluya yazar ve atanmamışı ayırır", () => {
    /* Ek sorumlular tablosu var ama yük bir kişiye sayılıyor:
       migration'ın kendi kararı ("iki kişiye saymak toplamı
       şişirirdi"). */
    const m = calistir({
      isler: [
        is({ id: "a", assigned_employee_id: "e1", due_date: "2026-09-01" }),
        is({ id: "b", assigned_employee_id: "e2" }),
        is({ id: "c", assigned_employee_id: null }),
        is({ id: "d", assigned_employee_id: "e1", status: "completed", delivered_at: "2026-10-12T09:00:00Z" }),
      ],
      personel: [["e1", "Ayşe Yılmaz"], ["e2", "Mehmet Demir"]],
    });
    const ayse = m.kisiYuku.find((k) => k.ad === "Ayşe Yılmaz")!;
    assert.deepEqual([ayse.aktif, ayse.geciken, ayse.tamamlanan], [1, 1, 1]);
    assert.equal(m.kisiYuku[0].ad, "Ayşe Yılmaz", "en çok geciken üstte");
    assert.ok(m.kisiYuku.some((k) => k.ad === "Atanmamış"));
    assert.equal(m.kisiYuku.reduce((t, k) => t + k.aktif, 0), m.devamEden);
  });

  it("geciken işleri gecikme süresine göre sıralar ve 25'te keser", () => {
    /* Hepsi bugünden (24.10) ÖNCE olmalı, yoksa gecikmiş sayılmaz:
       ilk yazımda terminler 01–30 Ekim'di ve yalnızca 23'ü geciktiği
       için liste 25'e hiç ulaşmıyordu. */
    const isler = Array.from({ length: 30 }, (_, i) =>
      is({ id: `i${i}`, title: `İş ${i}`, due_date: `2026-09-${String(i + 1).padStart(2, "0")}` }));
    const m = calistir({ isler });
    assert.equal(m.geciken, 30, "hepsi gecikmiş");
    assert.equal(m.gecikenler.length, 25, "liste 25'te kesiliyor");
    assert.equal(m.gecikenler[0].termin, "2026-09-01", "en eski termin en çok geciken");
    assert.ok(m.gecikenler[0].gecikmeGun > m.gecikenler[1].gecikmeGun);
  });

  it("müşterisi ve sorumlusu olmayan işte çizgi ve Atanmamış", () => {
    const m = calistir({ isler: [
      is({ customer_name: "  ", assigned_employee_id: null, due_date: "2026-10-01" }),
    ] });
    assert.equal(m.gecikenler[0].musteri, "—");
    assert.equal(m.gecikenler[0].sorumlu, "Atanmamış");
  });
});

describe("operasyon Excel sayfaları", () => {
  const model = calistir({
    isler: [
      is({ id: "a", due_date: "2026-10-01" }),
      is({ id: "b", status: "completed", start_date: "2026-10-01", delivered_at: "2026-10-11T09:00:00Z" }),
    ],
    adimlar: [adim({ workflow_id: "a", is_completed: true }), adim({ workflow_id: "a" })],
  });
  const sayfalar = operasyonSayfalari({ model, donemEtiket: "Bu ay" });

  it("yedi sekme üretir", () => {
    assert.deepEqual(sayfalar.map((s) => s.ad), [
      "Özet", "Durumlar", "Öncelikler", "Bekleyen taraf", "Ekip yükü",
      "Termini geçmiş işler", "Aylara göre",
    ]);
  });

  it("TUTAR SÜTUNU YOK — operasyon tutar görmüyor", () => {
    /* Operasyon departmanı sözleşme/teklif tutarını hiçbir şekilde
       göremiyor (migration 20261023183540 + 20261023184948). Buraya
       tutar eklemek üç katmanlı yetki kuralını rapor üzerinden
       atlatmak olurdu. */
    for (const sayfa of sayfalar) {
      for (const sutun of sayfa.sutunlar) {
        assert.notEqual(sutun.bicim, "para", `${sayfa.ad} sayfasında para sütunu var`);
      }
    }
  });

  it("görev tamamlanma oranını oran olarak yazar", () => {
    const satir = sayfalar[0].satirlar.find((r) => String(r[0]) === "Görev tamamlanma oranı");
    assert.deepEqual(satir?.[1], { deger: 0.5, bicim: "yuzde" });
  });

  it("termini geçmiş işlerde termin tarih biçiminde", () => {
    const sayfa = sayfalar[5];
    assert.equal(sayfa.sutunlar[6].bicim, "tarih");
    assert.equal(sayfa.satirlar[0][6], "2026-10-01");
  });

  it("her sayfada satır uzunluğu sütun sayısına eşit", () => {
    for (const sayfa of sayfalar) {
      for (const satir of sayfa.satirlar) {
        assert.equal(satir.length, sayfa.sutunlar.length, `${sayfa.ad} sayfasında satır/sütun uyuşmuyor`);
      }
    }
  });

  it("boş kurumda çökmez", () => {
    const bos = operasyonSayfalari({ model: calistir({}), donemEtiket: "Bu ay" });
    const oran = bos[0].satirlar.find((r) => String(r[0]) === "Görev tamamlanma oranı");
    assert.deepEqual(oran?.[1], { deger: null, bicim: "yuzde" });
    assert.equal(bos[0].satirlar.find((r) => String(r[0]) === "Ortalama tamamlanma süresi (gün)")?.[1], null);
  });
});
