import { AYLAR, aralikYuklemi, gunAnahtari, type Donem } from "@/lib/rapor-donemi";
import { monthStartKey } from "@/lib/istanbul-date";
import type { Hucre } from "@/lib/xlsx";

/*
  OPERASYON VE İŞ AKIŞI — KARAR (RPR-06).

  BU RAPORDA TUTAR YOK ve bu bir tasarım kararı, eksiklik değil.
  Operasyon departmanı üyeleri sözleşme tutarını, teklif tutarını ve
  müşteri bakiyesini HİÇBİR ŞEKİLDE göremiyor (migration
  20261023183540 + 20261023184948). Raporun yetki anahtarı
  `rapor.operasyon` ve varsayılanı yönetim + şef; ama rapor tutar
  göstermediği için bir operasyon şefine açıldığında da kural
  delinmiyor. Buraya "iş değeri" eklemek, üç katmanlı yetki kuralını
  rapor üzerinden atlatmak olurdu.

  İŞİN YÜKÜ ASIL SORUMLUYA SAYILIYOR. 22.10.2026'dan beri bir işte EK
  SORUMLULAR olabiliyor (`operation_workflow_assignees`) ama o
  migration'ın kendi kararı şöyle: "'Sorumluya göre aktif iş'
  istatistiği ve ekip yükü işi bir kişiye sayıyor; iki kişiye saymak
  toplamı şişirirdi." Rapor o kararı izliyor —
  `operation_workflows.assigned_employee_id`.

  GECİKME `due_date` İLE, DURUMLA DEĞİL: durumu "in_progress" olan bir
  işin termini geçmiş olabilir ve durum bunu söylemiyor. Tamamlanmış,
  iptal ve arşivlenmiş iş gecikmiş sayılmıyor — kapanmış bir işin
  termini artık bir şey ifade etmiyor.
*/

/** Kapanmış sayılan durumlar: gecikme ve "devam eden" hesabına girmez. */
const KAPANMIS = new Set(["completed", "cancelled", "archived"]);
/** Tamamlanmış sayılan tek durum (iptal tamamlanma değildir). */
const TAMAMLANDI = "completed";

export const DURUM_ADI: Record<string, string> = {
  planned: "Planlandı",
  in_progress: "Devam ediyor",
  blocked: "Beklemede",
  completed: "Tamamlandı",
  cancelled: "İptal",
  archived: "Arşiv",
};

export const ONCELIK_ADI: Record<string, string> = {
  low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil",
};

export const BEKLEYEN_TARAF_ADI: Record<string, string> = {
  us: "Bizde", customer: "Müşteride", third_party: "Üçüncü tarafta",
};

export type OperasyonIsi = {
  id: string;
  title: string;
  customer_name: string | null;
  status: string;
  priority: string;
  waiting_party: string;
  start_date: string | null;
  due_date: string | null;
  delivered_at: string | null;
  assigned_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OperasyonAdimi = {
  workflow_id: string;
  status: string;
  is_completed: boolean;
  due_date: string | null;
  completed_at: string | null;
};

export type DagilimSatiri = { anahtar: string; ad: string; adet: number; pay: number | null };
export type KisiYuku = { id: string | null; ad: string; aktif: number; geciken: number; tamamlanan: number };
export type GecikenIs = {
  id: string;
  baslik: string;
  musteri: string;
  sorumlu: string;
  durum: string;
  oncelik: string;
  bekleyenTaraf: string;
  termin: string;
  gecikmeGun: number;
};
export type AyIsi = { ay: string; etiket: string; acilan: number; tamamlanan: number };

export type OperasyonModeli = {
  /** Dönemde açılan iş. */
  acilan: number;
  /** Dönemde tamamlanan iş. */
  tamamlanan: number;
  /** ŞU AN devam eden (kapanmamış) iş — dönemden bağımsız. */
  devamEden: number;
  /** ŞU AN termini geçmiş, kapanmamış iş. */
  geciken: number;
  /** Müşteride ya da üçüncü tarafta bekleyen iş (bizde değil). */
  bizdeOlmayan: number;
  /** Tamamlanan işlerde başlangıçtan teslime ortalama gün. */
  ortSureGun: number | null;
  durumDagilimi: DagilimSatiri[];
  oncelikDagilimi: DagilimSatiri[];
  bekleyenTarafDagilimi: DagilimSatiri[];
  /** Açık işlerin adımları. */
  adimToplam: number;
  adimTamamlanan: number;
  adimGeciken: number;
  kisiYuku: KisiYuku[];
  gecikenler: GecikenIs[];
  aylik: AyIsi[];
};

const payi = (deger: number, taban: number) => (taban ? (deger / taban) * 100 : null);

const gunFarki = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const ortalama = (degerler: number[]) =>
  degerler.length ? Math.round((degerler.reduce((t, d) => t + d, 0) / degerler.length) * 10) / 10 : null;

/** Sayım haritasını ada çevirip paylarıyla sıralar. */
function dagilim(sayac: Map<string, number>, adlar: Record<string, string>, taban: number): DagilimSatiri[] {
  return [...sayac.entries()]
    .map(([anahtar, adet]) => ({
      anahtar,
      /* Kısıtta olmayan bir değer gelirse ham değer gösteriliyor:
         "—" yazmak kaydın nerede olduğunu gizlemek olurdu. */
      ad: adlar[anahtar] ?? anahtar,
      adet,
      pay: payi(adet, taban),
    }))
    .sort((a, b) => b.adet - a.adet || a.ad.localeCompare(b.ad, "tr"));
}

export function operasyonModeli({
  donem,
  bugun,
  isler,
  adimlar,
  personelAdi,
}: {
  donem: Donem;
  bugun: string;
  isler: readonly OperasyonIsi[];
  /** Yalnızca açık işlerin adımları. */
  adimlar: readonly OperasyonAdimi[];
  personelAdi: ReadonlyMap<string, string>;
}): OperasyonModeli {
  const aralikta = aralikYuklemi(donem);

  const acilanlar = isler.filter((i) => aralikta(i.created_at));
  /* Tamamlanma anı `delivered_at`; yoksa son hareket. Durumu
     "completed" olup teslim anı boş kalmış iş hiçbir döneme
     düşmezse tamamlanan sayısı sessizce eksilirdi. */
  const tamamlanmaAni = (i: OperasyonIsi) => i.delivered_at ?? i.updated_at;
  const tamamlananlar = isler.filter((i) => i.status === TAMAMLANDI && aralikta(tamamlanmaAni(i)));

  /* Devam eden ve geciken ŞU ANKİ durum, dönemden bağımsız: iki ay
     önce açılmış ve hâlâ bitmemiş bir iş bu ayın raporunda da
     görünmeli. */
  const acikIsler = isler.filter((i) => !KAPANMIS.has(i.status));
  const gecikenIsler = acikIsler.filter((i) => i.due_date && i.due_date < bugun);

  const durumSayac = new Map<string, number>();
  const oncelikSayac = new Map<string, number>();
  const tarafSayac = new Map<string, number>();
  for (const i of isler) durumSayac.set(i.status, (durumSayac.get(i.status) ?? 0) + 1);
  for (const i of acikIsler) {
    oncelikSayac.set(i.priority, (oncelikSayac.get(i.priority) ?? 0) + 1);
    tarafSayac.set(i.waiting_party, (tarafSayac.get(i.waiting_party) ?? 0) + 1);
  }

  /* Ortalama süre yalnızca BAŞLANGICI OLAN tamamlanmış işlerden:
     başlangıcı girilmemiş işi oluşturulma anından ölçmek, planlama
     süresini de işin süresine yazmak olurdu. */
  const sureler = tamamlananlar
    .filter((i) => i.start_date)
    .map((i) => Math.max(0, gunFarki(i.start_date!, gunAnahtari(tamamlanmaAni(i)))));

  // --- Adımlar: yalnızca açık işlerin ---
  const acikIdler = new Set(acikIsler.map((i) => i.id));
  const acikAdimlar = adimlar.filter((a) => acikIdler.has(a.workflow_id));
  const adimTamamlanan = acikAdimlar.filter((a) => a.is_completed || a.status === "done").length;
  const adimGeciken = acikAdimlar.filter(
    (a) => !a.is_completed && a.status !== "done" && a.due_date && a.due_date < bugun,
  ).length;

  // --- Kişi yükü: ASIL sorumluya ---
  const yuk = new Map<string, KisiYuku>();
  const yukEkle = (id: string | null, alan: "aktif" | "geciken" | "tamamlanan") => {
    const anahtar = id ?? "__atanmamis__";
    const mevcut = yuk.get(anahtar) ?? {
      id,
      ad: (id && personelAdi.get(id)) || "Atanmamış",
      aktif: 0, geciken: 0, tamamlanan: 0,
    };
    mevcut[alan] += 1;
    yuk.set(anahtar, mevcut);
  };
  for (const i of acikIsler) yukEkle(i.assigned_employee_id, "aktif");
  for (const i of gecikenIsler) yukEkle(i.assigned_employee_id, "geciken");
  for (const i of tamamlananlar) yukEkle(i.assigned_employee_id, "tamamlanan");

  const gecikenler: GecikenIs[] = gecikenIsler
    .map((i) => ({
      id: i.id,
      baslik: i.title,
      musteri: i.customer_name?.trim() || "—",
      sorumlu: (i.assigned_employee_id && personelAdi.get(i.assigned_employee_id)) || "Atanmamış",
      durum: DURUM_ADI[i.status] ?? i.status,
      oncelik: ONCELIK_ADI[i.priority] ?? i.priority,
      bekleyenTaraf: BEKLEYEN_TARAF_ADI[i.waiting_party] ?? i.waiting_party,
      termin: i.due_date!,
      gecikmeGun: gunFarki(i.due_date!, bugun),
    }))
    .sort((a, b) => b.gecikmeGun - a.gecikmeGun || a.baslik.localeCompare(b.baslik, "tr"))
    .slice(0, 25);

  // --- Aylık seri ---
  const [sonYil, sonAy] = donem.endKey.split("-").map(Number);
  const aylar = new Map<string, AyIsi>();
  for (let i = 5; i >= 0; i -= 1) {
    const ay = monthStartKey(sonYil, sonAy - i).slice(0, 7);
    aylar.set(ay, { ay, etiket: AYLAR[Number(ay.slice(5, 7)) - 1], acilan: 0, tamamlanan: 0 });
  }
  for (const i of isler) {
    const acilis = aylar.get(gunAnahtari(i.created_at).slice(0, 7));
    if (acilis) acilis.acilan += 1;
    if (i.status === TAMAMLANDI) {
      const bitis = aylar.get(gunAnahtari(tamamlanmaAni(i)).slice(0, 7));
      if (bitis) bitis.tamamlanan += 1;
    }
  }

  return {
    acilan: acilanlar.length,
    tamamlanan: tamamlananlar.length,
    devamEden: acikIsler.length,
    geciken: gecikenIsler.length,
    bizdeOlmayan: acikIsler.filter((i) => i.waiting_party !== "us").length,
    ortSureGun: ortalama(sureler),
    durumDagilimi: dagilim(durumSayac, DURUM_ADI, isler.length),
    oncelikDagilimi: dagilim(oncelikSayac, ONCELIK_ADI, acikIsler.length),
    bekleyenTarafDagilimi: dagilim(tarafSayac, BEKLEYEN_TARAF_ADI, acikIsler.length),
    adimToplam: acikAdimlar.length,
    adimTamamlanan,
    adimGeciken,
    kisiYuku: [...yuk.values()].sort(
      (a, b) => b.geciken - a.geciken || b.aktif - a.aktif || a.ad.localeCompare(b.ad, "tr"),
    ),
    gecikenler,
    aylik: [...aylar.values()],
  };
}

/* ---------- Excel ---------- */
const sayi = (deger: number) => ({ deger, bicim: "sayi" as const });
const oran = (yuzde: number | null) => ({ deger: yuzde === null ? null : yuzde / 100, bicim: "yuzde" as const });

const dagilimSayfasi = (ad: string, birim: string, satirlar: DagilimSatiri[]) => ({
  ad,
  sutunlar: [
    { baslik: birim, genislik: 22 },
    { baslik: "İş", bicim: "sayi" as const, genislik: 10 },
    { baslik: "Pay", bicim: "yuzde" as const, genislik: 10 },
  ],
  satirlar: satirlar.map((d) => [d.ad, d.adet, d.pay === null ? null : d.pay / 100]),
});

export function operasyonSayfalari({ model, donemEtiket }: { model: OperasyonModeli; donemEtiket: string }) {
  return [
    {
      ad: "Özet",
      sutunlar: [{ baslik: "Ölçüt", genislik: 34 }, { baslik: "Değer", genislik: 18 }],
      satirlar: [
        ["Dönem", donemEtiket],
        ["Dönemde açılan iş", sayi(model.acilan)],
        ["Dönemde tamamlanan iş", sayi(model.tamamlanan)],
        ["Devam eden iş (şu an)", sayi(model.devamEden)],
        ["Termini geçmiş iş (şu an)", sayi(model.geciken)],
        ["Bizde olmayan iş", sayi(model.bizdeOlmayan)],
        ["Ortalama tamamlanma süresi (gün)", model.ortSureGun === null ? null : sayi(model.ortSureGun)],
        ["Açık işlerin görev sayısı", sayi(model.adimToplam)],
        ["Tamamlanan görev", sayi(model.adimTamamlanan)],
        ["Termini geçmiş görev", sayi(model.adimGeciken)],
        ["Görev tamamlanma oranı", oran(model.adimToplam ? (model.adimTamamlanan / model.adimToplam) * 100 : null)],
      ] as Hucre[][],
    },
    dagilimSayfasi("Durumlar", "Durum", model.durumDagilimi),
    dagilimSayfasi("Öncelikler", "Öncelik", model.oncelikDagilimi),
    dagilimSayfasi("Bekleyen taraf", "Taraf", model.bekleyenTarafDagilimi),
    {
      ad: "Ekip yükü",
      sutunlar: [
        { baslik: "Sorumlu", genislik: 28 },
        { baslik: "Devam eden", bicim: "sayi" as const, genislik: 13 },
        { baslik: "Termini geçmiş", bicim: "sayi" as const, genislik: 15 },
        { baslik: "Dönemde tamamlanan", bicim: "sayi" as const, genislik: 19 },
      ],
      satirlar: model.kisiYuku.map((k) => [k.ad, k.aktif, k.geciken, k.tamamlanan]),
    },
    {
      ad: "Termini geçmiş işler",
      sutunlar: [
        { baslik: "İş", genislik: 34 },
        { baslik: "Müşteri", genislik: 24 },
        { baslik: "Sorumlu", genislik: 24 },
        { baslik: "Durum", genislik: 14 },
        { baslik: "Öncelik", genislik: 12 },
        { baslik: "Bekleyen taraf", genislik: 16 },
        { baslik: "Termin", bicim: "tarih" as const, genislik: 14 },
        { baslik: "Gecikme (gün)", bicim: "sayi" as const, genislik: 14 },
      ],
      satirlar: model.gecikenler.map((g) => [
        g.baslik, g.musteri, g.sorumlu, g.durum, g.oncelik, g.bekleyenTaraf, g.termin, g.gecikmeGun,
      ]),
    },
    {
      ad: "Aylara göre",
      sutunlar: [
        { baslik: "Ay", genislik: 12 },
        { baslik: "Açılan", bicim: "sayi" as const, genislik: 10 },
        { baslik: "Tamamlanan", bicim: "sayi" as const, genislik: 13 },
      ],
      satirlar: model.aylik.map((a) => [`${a.etiket} ${a.ay.slice(0, 4)}`, a.acilan, a.tamamlanan]),
    },
  ];
}
