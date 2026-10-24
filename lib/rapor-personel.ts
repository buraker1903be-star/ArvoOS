import { AYLAR, aralikYuklemi, gunAnahtari, type Donem } from "@/lib/rapor-donemi";
import { monthStartKey } from "@/lib/istanbul-date";
import { kazanildi } from "@/lib/talep-asamalari";
import type { Hucre } from "@/lib/xlsx";

/*
  PERSONEL PERFORMANSI — KARAR (RPR-05).

  HEDEF TABLOSU YOK ve uydurulmuyor (docs/RAPORLAMA-ASAMA-1.md §2.1):
  `hedef`, `target`, `kota`, `budget` adında hiçbir tablo yok, yani
  "hedef gerçekleşmesi" HESAPLANAMAZ. Rapor o bölümü boş durum
  mesajıyla gösteriyor. Ortalamayı hedef yerine koymak en kolay
  yoldu ve en yanıltıcısı: kimsenin koymadığı bir hedefe göre
  "hedefin %60'ı" yazmak, yöneticiye var olmayan bir karar
  zemini verirdi.

  OPERASYON PERSONELİ SATIŞ RAKAMIYLA DEĞERLENDİRİLMİYOR ve bu
  kendiliğinden oluyor: kişi iki tabloda da yalnızca KENDİSİNE ATANAN
  kayıtlarla görünüyor. Satış tablosunda yalnızca üzerine talep
  atanmış kişiler, operasyon tablosunda yalnızca üzerine iş atanmış
  kişiler var. İkisini tek bir "performans puanı"nda toplamak, farklı
  iş yapan iki insanı aynı cetvelle ölçmek olurdu.

  Not: raporun kendisi yönetime açık (`rapor.personel` varsayılanı
  yönetim). Operasyon departmanının tutar görememesi kuralı
  (migration 20261023183540) İZLEYİCİ hakkındadır, ölçülen kişi
  hakkında değil — bu rapor o kuralı delmiyor çünkü operasyon
  üyelerine açılmıyor ve okumaları zaten RLS'e tabi.

  PRİM "TAHAKKUK" İLE "ÖDENEN" AYRI: `status` dört değer alıyor
  (accrued | approved | paid | cancelled). İptal edilmiş prim hiçbir
  toplama girmiyor; tahakkuk eden ile ödenen ayrı sütunlarda —
  ikisini toplamak aynı primi iki kez saymak olurdu.
*/

/** İptal edilmiş prim hiçbir toplama girmez. */
const PRIM_IPTAL = "cancelled";

export type PersonelKaydi = {
  id: string;
  full_name: string;
  job_title: string | null;
  department_id: string | null;
  employment_status: string;
};

export type PersonelTalebi = {
  id: string;
  assigned_employee_id: string | null;
  stage: string;
  created_at: string;
  updated_at: string;
};

export type PersonelSozlesmesi = {
  opportunity_id: string | null;
  amount: number;
  status: string;
  signed_at: string | null;
  created_at: string;
};

export type PersonelIsi = {
  assigned_employee_id: string | null;
  status: string;
  due_date: string | null;
  delivered_at: string | null;
  start_date: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonelPrimi = {
  employee_id: string;
  commission_amount: number;
  status: string;
  accrued_at: string;
  paid_at: string | null;
};

export type SatisSatiri = {
  id: string;
  ad: string;
  unvan: string;
  departman: string;
  talep: number;
  kazanilan: number;
  donusum: number | null;
  sozlesmeAdet: number;
  sozlesmeTutari: number;
  primTahakkuk: number;
  primOdenen: number;
};

export type OperasyonSatiri = {
  id: string;
  ad: string;
  unvan: string;
  departman: string;
  aktifIs: number;
  tamamlanan: number;
  geciken: number;
  ortSureGun: number | null;
  primTahakkuk: number;
  primOdenen: number;
};

export type AyPersoneli = { ay: string; etiket: string; kazanilan: number; tamamlanan: number };

export type PersonelModeli = {
  /** Kadrodaki aktif personel sayısı. */
  aktifPersonel: number;
  satis: SatisSatiri[];
  operasyon: OperasyonSatiri[];
  /** Dönemde tahakkuk eden satış + operasyon primi. */
  primTahakkuk: number;
  primOdenen: number;
  /** Üzerine kayıt atanmamış aktif personel sayısı. */
  atamasizPersonel: number;
  aylik: AyPersoneli[];
  /** Hedef verisi var mı — yoksa ekran boş durum gösteriyor. */
  hedefVerisiVar: false;
};

const payi = (deger: number, taban: number) => (taban ? (deger / taban) * 100 : null);

const gunFarki = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const ortalama = (degerler: number[]) =>
  degerler.length ? Math.round((degerler.reduce((t, d) => t + d, 0) / degerler.length) * 10) / 10 : null;

export function personelModeli({
  donem,
  bugun,
  personel,
  talepler,
  sozlesmeler,
  isler,
  satisPrimleri,
  operasyonPrimleri,
  departmanAdi,
}: {
  donem: Donem;
  bugun: string;
  personel: readonly PersonelKaydi[];
  talepler: readonly PersonelTalebi[];
  sozlesmeler: readonly PersonelSozlesmesi[];
  isler: readonly PersonelIsi[];
  satisPrimleri: readonly PersonelPrimi[];
  operasyonPrimleri: readonly PersonelPrimi[];
  /** Talep kimliği → o talebe atanmış personel kimliği. */
  departmanAdi: ReadonlyMap<string, string>;
}): PersonelModeli {
  const aralikta = aralikYuklemi(donem);
  const kisi = new Map(personel.map((p) => [p.id, p]));
  const aktifler = personel.filter((p) => p.employment_status === "active");

  const kimlik = (id: string) => {
    const p = kisi.get(id);
    return {
      ad: p?.full_name?.trim() || "Adsız personel",
      unvan: p?.job_title?.trim() || "—",
      departman: (p?.department_id && departmanAdi.get(p.department_id)) || "—",
    };
  };

  /* --- Satış tarafı: kişiye ATANAN talepler --- */
  const talepSahibi = new Map<string, { talep: number; kazanilan: number }>();
  for (const t of talepler) {
    if (!t.assigned_employee_id) continue;
    const mevcut = talepSahibi.get(t.assigned_employee_id) ?? { talep: 0, kazanilan: 0 };
    if (aralikta(t.created_at)) mevcut.talep += 1;
    /* Kazanım KARARIN anına göre: talep eski olabilir, kazanıldığı
       ay bu dönem olabilir. */
    if (kazanildi(t.stage) && aralikta(t.updated_at)) mevcut.kazanilan += 1;
    talepSahibi.set(t.assigned_employee_id, mevcut);
  }

  const primToplam = (primler: readonly PersonelPrimi[]) => {
    const harita = new Map<string, { tahakkuk: number; odenen: number }>();
    for (const p of primler) {
      if (p.status === PRIM_IPTAL) continue;
      const mevcut = harita.get(p.employee_id) ?? { tahakkuk: 0, odenen: 0 };
      /* Tahakkuk `accrued_at`, ödeme `paid_at` ile dönemlenir: aynı
         prim bir ayda tahakkuk edip başka ayda ödenebiliyor. */
      if (aralikta(p.accrued_at)) mevcut.tahakkuk += Number(p.commission_amount);
      if (p.status === "paid" && p.paid_at && aralikta(p.paid_at)) mevcut.odenen += Number(p.commission_amount);
      harita.set(p.employee_id, mevcut);
    }
    return harita;
  };
  const satisPrim = primToplam(satisPrimleri);
  const operasyonPrim = primToplam(operasyonPrimleri);

  /*
    SÖZLEŞME PERSONELE TALEP ÜZERİNDEN BAĞLANIYOR. `crm_contracts`'ta
    personel alanı YOK; `created_by` sözleşmeyi YAZAN kullanıcı, satışı
    yapan kişi değil (yöneticiler de yazıyor). Eşleme `sozlesmeleriBagla`
    ile ve ayrı testli.
  */
  const talebinPersoneli = new Map<string, string>();
  for (const t of talepler) if (t.assigned_employee_id) talebinPersoneli.set(t.id, t.assigned_employee_id);
  const sozlesmeSahibi = sozlesmeleriBagla({ sozlesmeler, talebinPersoneli, donem });

  /* --- Operasyon tarafı: kişiye ATANAN işler --- */
  const isSahibi = new Map<string, { aktif: number; tamamlanan: number; geciken: number; sureler: number[] }>();
  const tamamlanmaAni = (i: PersonelIsi) => i.delivered_at ?? i.updated_at;
  for (const i of isler) {
    if (!i.assigned_employee_id) continue;
    const mevcut = isSahibi.get(i.assigned_employee_id)
      ?? { aktif: 0, tamamlanan: 0, geciken: 0, sureler: [] as number[] };
    const kapandi = ["completed", "cancelled", "archived"].includes(i.status);
    if (!kapandi) {
      mevcut.aktif += 1;
      if (i.due_date && i.due_date < bugun) mevcut.geciken += 1;
    }
    if (i.status === "completed" && aralikta(tamamlanmaAni(i))) {
      mevcut.tamamlanan += 1;
      if (i.start_date) mevcut.sureler.push(Math.max(0, gunFarki(i.start_date, gunAnahtari(tamamlanmaAni(i)))));
    }
    isSahibi.set(i.assigned_employee_id, mevcut);
  }

  const satis: SatisSatiri[] = [...talepSahibi.entries()]
    .map(([id, v]) => {
      const sozlesme = sozlesmeSahibi.get(id) ?? { adet: 0, tutar: 0 };
      const prim = satisPrim.get(id) ?? { tahakkuk: 0, odenen: 0 };
      return {
        id, ...kimlik(id),
        talep: v.talep,
        kazanilan: v.kazanilan,
        donusum: payi(v.kazanilan, v.talep),
        sozlesmeAdet: sozlesme.adet,
        sozlesmeTutari: sozlesme.tutar,
        primTahakkuk: prim.tahakkuk,
        primOdenen: prim.odenen,
      };
    })
    .filter((s) => s.talep || s.kazanilan || s.sozlesmeTutari || s.primTahakkuk)
    .sort((a, b) => b.sozlesmeTutari - a.sozlesmeTutari || b.kazanilan - a.kazanilan || a.ad.localeCompare(b.ad, "tr"));

  const operasyon: OperasyonSatiri[] = [...isSahibi.entries()]
    .map(([id, v]) => {
      const prim = operasyonPrim.get(id) ?? { tahakkuk: 0, odenen: 0 };
      return {
        id, ...kimlik(id),
        aktifIs: v.aktif,
        tamamlanan: v.tamamlanan,
        geciken: v.geciken,
        ortSureGun: ortalama(v.sureler),
        primTahakkuk: prim.tahakkuk,
        primOdenen: prim.odenen,
      };
    })
    .filter((o) => o.aktifIs || o.tamamlanan || o.geciken || o.primTahakkuk)
    .sort((a, b) => b.tamamlanan - a.tamamlanan || b.aktifIs - a.aktifIs || a.ad.localeCompare(b.ad, "tr"));

  const olculenler = new Set([...satis.map((s) => s.id), ...operasyon.map((o) => o.id)]);

  // --- Aylık seri: kazanılan talep ve tamamlanan iş ---
  const [sonYil, sonAy] = donem.endKey.split("-").map(Number);
  const aylar = new Map<string, AyPersoneli>();
  for (let i = 5; i >= 0; i -= 1) {
    const ay = monthStartKey(sonYil, sonAy - i).slice(0, 7);
    aylar.set(ay, { ay, etiket: AYLAR[Number(ay.slice(5, 7)) - 1], kazanilan: 0, tamamlanan: 0 });
  }
  for (const t of talepler) {
    if (!kazanildi(t.stage)) continue;
    const satir = aylar.get(gunAnahtari(t.updated_at).slice(0, 7));
    if (satir) satir.kazanilan += 1;
  }
  for (const i of isler) {
    if (i.status !== "completed") continue;
    const satir = aylar.get(gunAnahtari(tamamlanmaAni(i)).slice(0, 7));
    if (satir) satir.tamamlanan += 1;
  }

  const topla = (harita: Map<string, { tahakkuk: number; odenen: number }>, alan: "tahakkuk" | "odenen") =>
    [...harita.values()].reduce((t, v) => t + v[alan], 0);

  return {
    aktifPersonel: aktifler.length,
    satis,
    operasyon,
    primTahakkuk: topla(satisPrim, "tahakkuk") + topla(operasyonPrim, "tahakkuk"),
    primOdenen: topla(satisPrim, "odenen") + topla(operasyonPrim, "odenen"),
    atamasizPersonel: aktifler.filter((p) => !olculenler.has(p.id)).length,
    aylik: [...aylar.values()],
    hedefVerisiVar: false,
  };
}

/*
  SÖZLEŞMEYİ PERSONELE BAĞLAMA.

  `crm_contracts`'ta personel alanı YOK. `created_by` sözleşmeyi YAZAN
  kullanıcı, satışı yapan kişi değil (yönetici de yazabiliyor).
  Bağlantı talep üzerinden: sözleşme → `opportunity_id` → talebin
  `assigned_employee_id`'si. Bu eşleme sorgu tarafında kurulduğu için
  ayrı bir saf işlev olarak duruyor ve testli.
*/
export function sozlesmeleriBagla({
  sozlesmeler,
  talebinPersoneli,
  donem,
}: {
  sozlesmeler: readonly PersonelSozlesmesi[];
  /** Talep kimliği → personel kimliği. */
  talebinPersoneli: ReadonlyMap<string, string>;
  donem: Donem;
}): Map<string, { adet: number; tutar: number }> {
  const aralikta = aralikYuklemi(donem);
  const sonuc = new Map<string, { adet: number; tutar: number }>();
  for (const c of sozlesmeler) {
    if (!["signed", "completed"].includes(c.status)) continue;
    if (!aralikta(c.signed_at ?? c.created_at)) continue;
    const personelId = c.opportunity_id ? talebinPersoneli.get(c.opportunity_id) : undefined;
    if (!personelId) continue;
    const mevcut = sonuc.get(personelId) ?? { adet: 0, tutar: 0 };
    sonuc.set(personelId, { adet: mevcut.adet + 1, tutar: mevcut.tutar + Number(c.amount) });
  }
  return sonuc;
}

/* ---------- Excel ---------- */
const lira = (kurus: number) => kurus / 100;
const para = (kurus: number) => ({ deger: lira(kurus), bicim: "para" as const });
const sayi = (deger: number) => ({ deger, bicim: "sayi" as const });

export function personelSayfalari({ model, donemEtiket }: { model: PersonelModeli; donemEtiket: string }) {
  return [
    {
      ad: "Özet",
      sutunlar: [{ baslik: "Ölçüt", genislik: 36 }, { baslik: "Değer", genislik: 18 }],
      satirlar: [
        ["Dönem", donemEtiket],
        ["Kadrodaki aktif personel", sayi(model.aktifPersonel)],
        ["Satış kaydı olan personel", sayi(model.satis.length)],
        ["Operasyon kaydı olan personel", sayi(model.operasyon.length)],
        ["Üzerine kayıt atanmamış aktif personel", sayi(model.atamasizPersonel)],
        ["Dönemde tahakkuk eden prim", para(model.primTahakkuk)],
        ["Dönemde ödenen prim", para(model.primOdenen)],
        /* Hedef verisi yok; hücre boş bırakılıyor ve ekranda da
           neden boş olduğu yazıyor. */
        ["Hedef gerçekleşmesi", "Hedef tablosu tanımlı değil"],
      ] as Hucre[][],
    },
    {
      ad: "Satış performansı",
      sutunlar: [
        { baslik: "Personel", genislik: 26 },
        { baslik: "Unvan", genislik: 20 },
        { baslik: "Departman", genislik: 18 },
        { baslik: "Talep", bicim: "sayi" as const, genislik: 10 },
        { baslik: "Kazanılan", bicim: "sayi" as const, genislik: 12 },
        { baslik: "Dönüşüm", bicim: "yuzde" as const, genislik: 11 },
        { baslik: "Sözleşme", bicim: "sayi" as const, genislik: 11 },
        { baslik: "Sözleşme tutarı", bicim: "para" as const, genislik: 18 },
        { baslik: "Prim (tahakkuk)", bicim: "para" as const, genislik: 17 },
        { baslik: "Prim (ödenen)", bicim: "para" as const, genislik: 16 },
      ],
      satirlar: model.satis.map((s) => [
        s.ad, s.unvan, s.departman, s.talep, s.kazanilan,
        s.donusum === null ? null : s.donusum / 100,
        s.sozlesmeAdet, lira(s.sozlesmeTutari), lira(s.primTahakkuk), lira(s.primOdenen),
      ]),
    },
    {
      ad: "Operasyon performansı",
      sutunlar: [
        { baslik: "Personel", genislik: 26 },
        { baslik: "Unvan", genislik: 20 },
        { baslik: "Departman", genislik: 18 },
        { baslik: "Devam eden iş", bicim: "sayi" as const, genislik: 14 },
        { baslik: "Tamamlanan", bicim: "sayi" as const, genislik: 13 },
        { baslik: "Termini geçmiş", bicim: "sayi" as const, genislik: 15 },
        { baslik: "Ortalama süre (gün)", bicim: "sayi" as const, genislik: 18 },
        { baslik: "Prim (tahakkuk)", bicim: "para" as const, genislik: 17 },
        { baslik: "Prim (ödenen)", bicim: "para" as const, genislik: 16 },
      ],
      satirlar: model.operasyon.map((o) => [
        o.ad, o.unvan, o.departman, o.aktifIs, o.tamamlanan, o.geciken,
        o.ortSureGun, lira(o.primTahakkuk), lira(o.primOdenen),
      ]),
    },
    {
      ad: "Aylara göre",
      sutunlar: [
        { baslik: "Ay", genislik: 12 },
        { baslik: "Kazanılan talep", bicim: "sayi" as const, genislik: 16 },
        { baslik: "Tamamlanan iş", bicim: "sayi" as const, genislik: 15 },
      ],
      satirlar: model.aylik.map((a) => [`${a.etiket} ${a.ay.slice(0, 4)}`, a.kazanilan, a.tamamlanan]),
    },
  ];
}
