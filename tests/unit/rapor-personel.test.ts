import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  personelModeli, personelSayfalari, sozlesmeleriBagla,
  type PersonelIsi, type PersonelKaydi, type PersonelPrimi, type PersonelSozlesmesi, type PersonelTalebi,
} from "../../lib/rapor-personel";
import type { Donem } from "../../lib/rapor-donemi";

const EKIM: Donem = { startKey: "2026-10-01", endKey: "2026-10-31", key: "bu_ay" };
const BUGUN = "2026-10-24";

const kisi = (o: Partial<PersonelKaydi>): PersonelKaydi => ({
  id: "e1", full_name: "Ayşe Yılmaz", job_title: "Satış Temsilcisi",
  department_id: "d1", employment_status: "active", ...o,
});
const talep = (o: Partial<PersonelTalebi>): PersonelTalebi => ({
  id: "t1", assigned_employee_id: "e1", stage: "lead",
  created_at: "2026-10-05T09:00:00Z", updated_at: "2026-10-05T09:00:00Z", ...o,
});
const sozlesme = (o: Partial<PersonelSozlesmesi>): PersonelSozlesmesi => ({
  opportunity_id: "t1", amount: 200_000, status: "signed",
  signed_at: "2026-10-10T09:00:00Z", created_at: "2026-10-10T09:00:00Z", ...o,
});
const is = (o: Partial<PersonelIsi>): PersonelIsi => ({
  assigned_employee_id: "e1", status: "in_progress", due_date: "2026-11-05",
  delivered_at: null, start_date: "2026-10-05",
  created_at: "2026-10-05T09:00:00Z", updated_at: "2026-10-10T09:00:00Z", ...o,
});
const prim = (o: Partial<PersonelPrimi>): PersonelPrimi => ({
  employee_id: "e1", commission_amount: 10_000, status: "accrued",
  accrued_at: "2026-10-12T09:00:00Z", paid_at: null, ...o,
});

const calistir = (girdi: {
  personel?: PersonelKaydi[];
  talepler?: PersonelTalebi[];
  sozlesmeler?: PersonelSozlesmesi[];
  isler?: PersonelIsi[];
  satisPrimleri?: PersonelPrimi[];
  operasyonPrimleri?: PersonelPrimi[];
  donem?: Donem;
  departmanlar?: [string, string][];
}) => personelModeli({
  donem: girdi.donem ?? EKIM,
  bugun: BUGUN,
  personel: girdi.personel ?? [kisi({})],
  talepler: girdi.talepler ?? [],
  sozlesmeler: girdi.sozlesmeler ?? [],
  isler: girdi.isler ?? [],
  satisPrimleri: girdi.satisPrimleri ?? [],
  operasyonPrimleri: girdi.operasyonPrimleri ?? [],
  departmanAdi: new Map(girdi.departmanlar ?? [["d1", "Satış"], ["d2", "Operasyon"]]),
});

describe("personel raporu — hedef verisi", () => {
  it("hedef verisi YOK der, uydurma hedef üretmez", () => {
    /*
      `hedef`/`target`/`kota` adında hiçbir tablo yok
      (docs/RAPORLAMA-ASAMA-1.md §2.1). Ortalamayı hedef yerine
      koymak, kimsenin koymadığı bir hedefe göre "hedefin %60'ı"
      yazmak olurdu.
    */
    assert.equal(calistir({}).hedefVerisiVar, false);
    const sayfalar = personelSayfalari({ model: calistir({}), donemEtiket: "Bu ay" });
    const satir = sayfalar[0].satirlar.find((r) => String(r[0]) === "Hedef gerçekleşmesi");
    assert.equal(satir?.[1], "Hedef tablosu tanımlı değil");
  });
});

describe("personel raporu — satış tarafı", () => {
  it("kişiye atanan talepleri ve kazanımı sayar", () => {
    const m = calistir({ talepler: [
      talep({ id: "a", stage: "lead" }),
      talep({ id: "b", stage: "completed", updated_at: "2026-10-18T09:00:00Z" }),
      talep({ id: "c", assigned_employee_id: null }),
    ] });
    assert.equal(m.satis.length, 1);
    assert.equal(m.satis[0].talep, 2, "atanmamış talep kişiye yazılmıyor");
    assert.equal(m.satis[0].kazanilan, 1);
    assert.equal(m.satis[0].donusum, 50);
  });

  it("kazanımı KARARIN anına göre sayar", () => {
    /* Talep temmuzda açılmış olabilir, kazanıldığı ay bu dönem
       olabilir. */
    const m = calistir({ talepler: [
      talep({ stage: "won", created_at: "2026-07-01T09:00:00Z", updated_at: "2026-10-14T09:00:00Z" }),
    ] });
    assert.equal(m.satis[0].talep, 0);
    assert.equal(m.satis[0].kazanilan, 1);
  });

  it("akademik aşamayı da kazanım sayar", () => {
    const m = calistir({ talepler: [talep({ stage: "work_opened", updated_at: "2026-10-14T09:00:00Z" })] });
    assert.equal(m.satis[0].kazanilan, 1);
  });

  it("sözleşmeyi TALEP ÜZERİNDEN personele bağlar", () => {
    /* `crm_contracts`'ta personel alanı yok; `created_by` sözleşmeyi
       YAZAN kişi, satışı yapan değil. */
    const m = calistir({
      talepler: [talep({ id: "t1", assigned_employee_id: "e1" }), talep({ id: "t2", assigned_employee_id: "e2" })],
      sozlesmeler: [
        sozlesme({ opportunity_id: "t1", amount: 300_000 }),
        sozlesme({ opportunity_id: "t2", amount: 100_000 }),
      ],
      personel: [kisi({ id: "e1" }), kisi({ id: "e2", full_name: "Mehmet Demir" })],
    });
    const ayse = m.satis.find((s) => s.ad === "Ayşe Yılmaz")!;
    const mehmet = m.satis.find((s) => s.ad === "Mehmet Demir")!;
    assert.equal(ayse.sozlesmeTutari, 300_000);
    assert.equal(mehmet.sozlesmeTutari, 100_000);
    assert.equal(m.satis[0].ad, "Ayşe Yılmaz", "tutara göre sıralı");
  });

  it("talebi atanmamış sözleşmeyi kimseye yazmaz", () => {
    const m = calistir({
      talepler: [talep({ id: "t1", assigned_employee_id: null })],
      sozlesmeler: [sozlesme({ opportunity_id: "t1" }), sozlesme({ opportunity_id: null })],
    });
    assert.deepEqual(m.satis, []);
  });

  it("unvan ve departmanı personel kaydından okur", () => {
    const m = calistir({
      talepler: [talep({})],
      personel: [kisi({ job_title: "Kıdemli Danışman", department_id: "d2" })],
    });
    assert.equal(m.satis[0].unvan, "Kıdemli Danışman");
    assert.equal(m.satis[0].departman, "Operasyon");
  });

  it("unvanı ve departmanı olmayanda çizgi gösterir", () => {
    const m = calistir({
      talepler: [talep({})],
      personel: [kisi({ job_title: null, department_id: null })],
    });
    assert.deepEqual([m.satis[0].unvan, m.satis[0].departman], ["—", "—"]);
  });
});

describe("personel raporu — operasyon tarafı", () => {
  it("devam eden, tamamlanan ve gecikeni ayrı sayar", () => {
    const m = calistir({ isler: [
      is({ due_date: "2026-09-20" }),
      is({ status: "completed", start_date: "2026-10-01", delivered_at: "2026-10-11T09:00:00Z" }),
      is({ status: "cancelled", due_date: "2026-08-01" }),
    ] });
    assert.equal(m.operasyon[0].aktifIs, 1);
    assert.equal(m.operasyon[0].geciken, 1);
    assert.equal(m.operasyon[0].tamamlanan, 1);
    assert.equal(m.operasyon[0].ortSureGun, 10);
  });

  it("başlangıcı olmayan işi ortalama süreye katmaz", () => {
    const m = calistir({ isler: [
      is({ status: "completed", start_date: null, delivered_at: "2026-10-11T09:00:00Z" }),
    ] });
    assert.equal(m.operasyon[0].tamamlanan, 1);
    assert.equal(m.operasyon[0].ortSureGun, null);
  });

  it("satış ve operasyon tabloları AYRI — tek puanda toplanmıyor", () => {
    /* Farklı iş yapan iki insanı aynı cetvelle ölçmek olurdu;
       şartnamenin kuralı da operasyon personelini satış rakamıyla
       değerlendirmemek. */
    const m = calistir({
      talepler: [talep({ assigned_employee_id: "e1" })],
      isler: [is({ assigned_employee_id: "e2" })],
      personel: [kisi({ id: "e1" }), kisi({ id: "e2", full_name: "Mehmet Demir", department_id: "d2" })],
    });
    assert.deepEqual(m.satis.map((s) => s.ad), ["Ayşe Yılmaz"]);
    assert.deepEqual(m.operasyon.map((o) => o.ad), ["Mehmet Demir"]);
  });

  it("iki işi de yapan kişi iki tabloda da görünür", () => {
    const m = calistir({ talepler: [talep({})], isler: [is({})] });
    assert.equal(m.satis.length, 1);
    assert.equal(m.operasyon.length, 1);
    assert.equal(m.atamasizPersonel, 0);
  });
});

describe("personel raporu — primler", () => {
  it("tahakkuk ve ödeneni ayrı tutar", () => {
    /* İkisini toplamak aynı primi iki kez saymak olurdu; bir prim
       bir ayda tahakkuk edip başka ayda ödenebiliyor. */
    const m = calistir({
      talepler: [talep({})],
      satisPrimleri: [
        prim({ commission_amount: 30_000, status: "accrued" }),
        prim({ commission_amount: 20_000, status: "paid", paid_at: "2026-10-20T09:00:00Z" }),
      ],
    });
    assert.equal(m.satis[0].primTahakkuk, 50_000);
    assert.equal(m.satis[0].primOdenen, 20_000);
    assert.equal(m.primTahakkuk, 50_000);
    assert.equal(m.primOdenen, 20_000);
  });

  it("iptal edilmiş primi hiçbir toplama katmaz", () => {
    const m = calistir({
      talepler: [talep({})],
      satisPrimleri: [prim({ commission_amount: 900_000, status: "cancelled" })],
    });
    assert.equal(m.satis[0].primTahakkuk, 0);
    assert.equal(m.primTahakkuk, 0);
  });

  it("başka dönemde ödenen primi bu döneme yazmaz", () => {
    const m = calistir({
      talepler: [talep({})],
      satisPrimleri: [prim({ status: "paid", accrued_at: "2026-09-10T09:00:00Z", paid_at: "2026-09-25T09:00:00Z" })],
    });
    assert.deepEqual([m.primTahakkuk, m.primOdenen], [0, 0]);
  });

  it("operasyon primini operasyon tablosuna yazar", () => {
    const m = calistir({
      isler: [is({})],
      operasyonPrimleri: [prim({ commission_amount: 15_000 })],
    });
    assert.equal(m.operasyon[0].primTahakkuk, 15_000);
    assert.equal(m.satis.length, 0, "satış tablosuna sızmıyor");
  });

  it("yalnızca primi olan kişiyi de listeye alır", () => {
    // Kaydı olmayan ama primi tahakkuk etmiş kişi gizlenmemeli.
    const m = calistir({ talepler: [talep({ assigned_employee_id: "e1" })], satisPrimleri: [prim({})] });
    assert.equal(m.satis.length, 1);
  });
});

describe("personel raporu — kadro ve Excel", () => {
  it("aktif personeli ve ataması olmayanı sayar", () => {
    const m = calistir({
      personel: [
        kisi({ id: "e1" }),
        kisi({ id: "e2", full_name: "Mehmet", employment_status: "active" }),
        kisi({ id: "e3", full_name: "Ayrılan", employment_status: "terminated" }),
      ],
      talepler: [talep({ assigned_employee_id: "e1" })],
    });
    assert.equal(m.aktifPersonel, 2, "ayrılan kadroda sayılmıyor");
    assert.equal(m.atamasizPersonel, 1, "Mehmet'e kayıt atanmamış");
  });

  it("dört sekme üretir ve satır uzunlukları tutar", () => {
    const model = calistir({
      talepler: [talep({ stage: "won", updated_at: "2026-10-14T09:00:00Z" })],
      sozlesmeler: [sozlesme({ amount: 500_000 })],
      isler: [is({ assigned_employee_id: "e2" })],
      personel: [kisi({ id: "e1" }), kisi({ id: "e2", full_name: "Mehmet Demir" })],
      satisPrimleri: [prim({ commission_amount: 25_000 })],
    });
    const sayfalar = personelSayfalari({ model, donemEtiket: "Bu ay" });
    assert.deepEqual(sayfalar.map((s) => s.ad), [
      "Özet", "Satış performansı", "Operasyon performansı", "Aylara göre",
    ]);
    for (const sayfa of sayfalar) {
      for (const satir of sayfa.satirlar) {
        assert.equal(satir.length, sayfa.sutunlar.length, `${sayfa.ad} sayfasında satır/sütun uyuşmuyor`);
      }
    }
    assert.equal(sayfalar[1].satirlar[0][7], 5000, "sözleşme tutarı lira");
    assert.equal(sayfalar[1].satirlar[0][5], 1, "dönüşüm oran");
  });

  it("boş kurumda çökmez", () => {
    const m = calistir({ personel: [] });
    assert.deepEqual([m.aktifPersonel, m.satis.length, m.operasyon.length, m.primTahakkuk], [0, 0, 0, 0]);
    assert.equal(m.aylik.length, 6);
  });
});

describe("sözleşme-personel eşlemesi", () => {
  it("imzasız sözleşmeyi bağlamaz", () => {
    const sonuc = sozlesmeleriBagla({
      sozlesmeler: [sozlesme({ status: "sent" }), sozlesme({ status: "draft" })],
      talebinPersoneli: new Map([["t1", "e1"]]),
      donem: EKIM,
    });
    assert.equal(sonuc.size, 0);
  });

  it("dönem dışındaki imzayı bağlamaz", () => {
    const sonuc = sozlesmeleriBagla({
      sozlesmeler: [sozlesme({ signed_at: "2026-09-20T09:00:00Z" })],
      talebinPersoneli: new Map([["t1", "e1"]]),
      donem: EKIM,
    });
    assert.equal(sonuc.size, 0);
  });

  it("imza anı boşsa oluşturulma gününe bakar", () => {
    const sonuc = sozlesmeleriBagla({
      sozlesmeler: [sozlesme({ signed_at: null, created_at: "2026-10-09T09:00:00Z" })],
      talebinPersoneli: new Map([["t1", "e1"]]),
      donem: EKIM,
    });
    assert.equal(sonuc.get("e1")?.tutar, 200_000);
  });

  it("aynı kişinin iki sözleşmesini toplar", () => {
    const sonuc = sozlesmeleriBagla({
      sozlesmeler: [
        sozlesme({ opportunity_id: "t1", amount: 100_000 }),
        sozlesme({ opportunity_id: "t2", amount: 250_000 }),
      ],
      talebinPersoneli: new Map([["t1", "e1"], ["t2", "e1"]]),
      donem: EKIM,
    });
    assert.deepEqual(sonuc.get("e1"), { adet: 2, tutar: 350_000 });
  });
});
