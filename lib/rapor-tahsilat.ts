import { AYLAR, aralikYuklemi, type Donem } from "@/lib/rapor-donemi";
import { monthStartKey } from "@/lib/istanbul-date";
import { bakiyeyeSigdir, taksitleriDagit, type DagitilacakTaksit } from "@/lib/taksit-dagitimi";
import type { Hucre } from "@/lib/xlsx";

/*
  TAHSİLAT VE ALACAK — KARAR (RPR-03).

  ÜÇ SORU, ÜÇ AYRI KAYNAK ve karıştırılmıyor:
   - "dönemde ne kadar para girdi" → cari hareketleri (`account_entries`),
   - "ne kadar alacağımız var" → cari bakiyesi (şu anki durum, dönemsiz),
   - "önümüzdeki ay ne kadar bekliyoruz" → ödeme planı taksitleri.
  İlki bir AKIŞ, ikincisi bir DURUM, üçüncüsü bir TAKVİM. Birini
  diğerinin yerine koymak ya da toplamak yanlış olur
  (docs/RAPORLAMA-ASAMA-1.md §3.2).

  BEKLENEN TAHSİLAT, TAKSİTİN TUTARI DEĞİL KALANI — ve kalan taksitin
  kendi `status` sütunundan OKUNAMAZ:

    `payment_installments.status` cari tahsilatıyla güncellenmiyor.
    Müşteri 31.500 TL ödemişken 47.000 TL'lik tek taksit hâlâ
    "ödenmedi" görünüyordu (lib/taksit-dagitimi.ts başlığı).

  Naif bir `status <> 'paid'` sorgusu ödenmiş taksitleri de "beklenen"
  sayar ve rakamı OLDUĞUNDAN BÜYÜK gösterir. Kalan, cari dökümündeki
  net tahsilatın en eski vadeden başlayarak dağıtılmasıyla türetiliyor
  (`taksitleriDagit`), sonra açık bakiyeye sığdırılıyor
  (`bakiyeyeSigdir`: plan sözleşmeden büyük olabiliyor).

  TAKVİMİN SINIRI RAPORDA YAZIYOR: yalnızca ödeme planı olan
  sözleşmelerin taksitleri sayılıyor. Planı olmayan sözleşmenin açık
  bakiyesi "plansız" olarak ayrı gösteriliyor — takvime karıştırmak,
  "önümüzdeki ay şu kadar tahsilat var" cümlesini eksik bir tabandan
  kurmak olurdu.
*/

export type TahsilatHareketi = {
  entry_type: string;
  source_type: string | null;
  amount: number;
  transaction_date: string;
};

/** Bakiyesi ve ömür boyu net tahsilatı hesaplanmış cari. */
export type TahsilatCarisi = {
  id: string;
  ad: string;
  bakiye: number;
  netTahsilat: number;
  taksitler: DagitilacakTaksit[];
};

/*
  Takvim satırının TÜRÜ açıkça yazılıyor, anahtarından çıkarılmıyor.
  Önce ayırt etmek için anahtarın biçimine bakılıyordu ("2026-11" yedi
  karakter, ay) — "vadesiz" de yedi karakter ve aynı kovaya düşüyordu.
  Ekran ve Excel de bu ayrımı yapmak zorunda; biçime bakan her yer
  aynı hatayı yeniden kurardı.
*/
export type AyTuru = "ay" | "gecmis" | "vadesiz";
export type AyBeklentisi = { tur: AyTuru; ay: string; etiket: string; tutar: number; adet: number };
export type AyTahsilati = { ay: string; etiket: string; tutar: number };
export type MusteriAlacagi = { id: string; ad: string; bakiye: number; gecikmis: number; yaklasan: number; enEskiVade: string | null };

export type TahsilatModeli = {
  /** Dönemde kasaya giren (credit). */
  donemTahsilat: number;
  /** Dönemde yapılan iade (düzeltme türü borç). */
  donemIade: number;
  donemNet: number;
  donemAdet: number;
  /** ŞU ANKİ toplam açık alacak — dönemden bağımsız. */
  acikBakiye: number;
  gecikmisKalan: number;
  gecikmisAdet: number;
  /** Planlanmış (taksite bağlı) kalan toplam. */
  planliKalan: number;
  /** Açık bakiyenin planı olmayan kısmı; takvime girmiyor. */
  plansizKalan: number;
  /** Vadesi geçmiş + gelecek 12 ay. */
  takvim: AyBeklentisi[];
  onumuzdekiAy: AyBeklentisi | null;
  /** Dönemin aylık gerçekleşen tahsilatı (seri). */
  aylikTahsilat: AyTahsilati[];
  musteriler: MusteriAlacagi[];
};

/** Vadeye kalan gün sayısı eşiği: "yaklaşan" sayılan pencere. */
export const YAKLASAN_GUN = 30;

const ayEtiketi = (ay: string) => `${AYLAR[Number(ay.slice(5, 7)) - 1]} ${ay.slice(0, 4)}`;

/** "2026-10-24" + n ay → "2026-12" biçiminde ay anahtarı. */
const ayKaydir = (gun: string, n: number) => {
  const [yil, ay] = gun.split("-").map(Number);
  return monthStartKey(yil, ay + n).slice(0, 7);
};

const gunFarki = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function tahsilatModeli({
  donem,
  bugun,
  hareketler,
  cariler,
  ayIleri = 12,
  aySeri = 6,
}: {
  donem: Donem;
  /** Türkiye günü anahtarı (todayInIstanbul). */
  bugun: string;
  hareketler: readonly TahsilatHareketi[];
  cariler: readonly TahsilatCarisi[];
  ayIleri?: number;
  aySeri?: number;
}): TahsilatModeli {
  const aralikta = aralikYuklemi(donem);

  // --- Dönem akışı: cari hareketlerinden ---
  let donemTahsilat = 0;
  let donemIade = 0;
  let donemAdet = 0;
  const seri = new Map<string, AyTahsilati>();
  for (let i = aySeri - 1; i >= 0; i -= 1) {
    const ay = ayKaydir(donem.endKey, -i);
    seri.set(ay, { ay, etiket: ayEtiketi(ay), tutar: 0 });
  }
  for (const h of hareketler) {
    const tahsilatMi = h.entry_type === "credit";
    const iadeMi = h.entry_type === "debit" && h.source_type === "adjustment";
    if (!tahsilatMi && !iadeMi) continue;
    if (aralikta(h.transaction_date)) {
      if (tahsilatMi) { donemTahsilat += Number(h.amount); donemAdet += 1; }
      else donemIade += Number(h.amount);
    }
    /* Seri DÖNEMDEN BAĞIMSIZ: "son altı ay" sorusu dönem seçimiyle
       değişmiyor, yalnızca bitiş ayına göre kayıyor. */
    if (tahsilatMi) {
      const satir = seri.get(h.transaction_date.slice(0, 7));
      if (satir) satir.tutar += Number(h.amount);
    }
  }

  // --- Durum ve takvim: taksitlerden türetilmiş ---
  const ileriAylar = new Map<string, AyBeklentisi>();
  for (let i = 0; i < ayIleri; i += 1) {
    const ay = ayKaydir(bugun, i);
    ileriAylar.set(ay, { tur: "ay", ay, etiket: ayEtiketi(ay), tutar: 0, adet: 0 });
  }
  /*
    VADESİ GEÇMİŞ AYRI BİR KOVA. Geçmiş kalanı "bu ay" kovasına
    eklemek, önümüzdeki ay gerçekten beklenen parayı olduğundan büyük
    gösterirdi — oysa o para zaten gecikmiş ve tahsil edilme olasılığı
    başka bir konu.
  */
  const gecmis: AyBeklentisi = { tur: "gecmis", ay: "gecmis", etiket: "Vadesi geçmiş", tutar: 0, adet: 0 };
  /* Vadesi olmayan taksit takvime giremez: hangi aya yazılacağı
     bilinmiyor. Kalanı "plansız" gibi ayrı durmalı, yoksa bir aya
     uydurma biçimde düşerdi. */
  const vadesiz: AyBeklentisi = { tur: "vadesiz", ay: "vadesiz", etiket: "Vadesi girilmemiş", tutar: 0, adet: 0 };

  let acikBakiye = 0;
  let planliKalan = 0;
  let gecikmisKalan = 0;
  let gecikmisAdet = 0;
  const musteriler: MusteriAlacagi[] = [];

  for (const cari of cariler) {
    acikBakiye += cari.bakiye;
    const dagitilmis = bakiyeyeSigdir(taksitleriDagit(cari.taksitler, cari.netTahsilat, bugun), cari.bakiye);
    let cariGecikmis = 0;
    let cariYaklasan = 0;
    let enEskiVade: string | null = null;

    for (const t of dagitilmis) {
      if (t.durum === "iptal" || t.kalan <= 0) continue;
      planliKalan += t.kalan;
      if (!t.due_date) { vadesiz.tutar += t.kalan; vadesiz.adet += 1; continue; }
      if (t.due_date < bugun) {
        gecmis.tutar += t.kalan;
        gecmis.adet += 1;
        gecikmisKalan += t.kalan;
        gecikmisAdet += 1;
        cariGecikmis += t.kalan;
        if (!enEskiVade || t.due_date < enEskiVade) enEskiVade = t.due_date;
        continue;
      }
      const kova = ileriAylar.get(t.due_date.slice(0, 7));
      /* Ufkun ötesindeki taksit (12 aydan uzak vade) sessizce
         düşürülmüyor; son ayın kovasına eklemek de onu yanlış aya
         yazmak olurdu — bu yüzden takvimde yok ama `planliKalan`'a
         giriyor ve ikisi arasındaki fark raporda yazılı. */
      if (kova) { kova.tutar += t.kalan; kova.adet += 1; }
      if (gunFarki(bugun, t.due_date) <= YAKLASAN_GUN) cariYaklasan += t.kalan;
    }

    if (cari.bakiye > 0 || cariGecikmis > 0) {
      musteriler.push({ id: cari.id, ad: cari.ad, bakiye: cari.bakiye, gecikmis: cariGecikmis, yaklasan: cariYaklasan, enEskiVade });
    }
  }

  const takvim: AyBeklentisi[] = [
    ...(gecmis.adet ? [gecmis] : []),
    ...ileriAylar.values(),
    ...(vadesiz.adet ? [vadesiz] : []),
  ];
  const sonrakiAy = ayKaydir(bugun, 1);

  return {
    donemTahsilat,
    donemIade,
    donemNet: Math.max(0, donemTahsilat - donemIade),
    donemAdet,
    acikBakiye,
    gecikmisKalan,
    gecikmisAdet,
    planliKalan,
    plansizKalan: Math.max(0, acikBakiye - planliKalan),
    takvim,
    onumuzdekiAy: ileriAylar.get(sonrakiAy) ?? null,
    aylikTahsilat: [...seri.values()],
    musteriler: musteriler
      .sort((a, b) => b.gecikmis - a.gecikmis || b.bakiye - a.bakiye || a.ad.localeCompare(b.ad, "tr"))
      .slice(0, 20),
  };
}

/* ---------- Excel ---------- */
const lira = (kurus: number) => kurus / 100;
const para = (kurus: number) => ({ deger: lira(kurus), bicim: "para" as const });
const sayi = (deger: number) => ({ deger, bicim: "sayi" as const });

export function tahsilatSayfalari({ model, donemEtiket }: { model: TahsilatModeli; donemEtiket: string }) {
  return [
    {
      ad: "Özet",
      sutunlar: [{ baslik: "Ölçüt", genislik: 36 }, { baslik: "Değer", genislik: 18 }],
      satirlar: [
        ["Dönem", donemEtiket],
        ["Dönemde tahsil edilen", para(model.donemTahsilat)],
        ["Dönemde iade", para(model.donemIade)],
        ["Dönem net tahsilat", para(model.donemNet)],
        ["Tahsilat kaydı adedi", sayi(model.donemAdet)],
        ["Açık alacak (şu an)", para(model.acikBakiye)],
        ["Vadesi geçmiş kalan", para(model.gecikmisKalan)],
        ["Vadesi geçmiş taksit adedi", sayi(model.gecikmisAdet)],
        ["Ödeme planına bağlı kalan", para(model.planliKalan)],
        ["Planı olmayan kalan", para(model.plansizKalan)],
        ["Önümüzdeki ay beklenen", para(model.onumuzdekiAy?.tutar ?? 0)],
      ] as Hucre[][],
    },
    {
      ad: "Beklenen tahsilat",
      sutunlar: [
        { baslik: "Dönem", genislik: 20 },
        { baslik: "Beklenen", bicim: "para" as const, genislik: 18 },
        { baslik: "Taksit adedi", bicim: "sayi" as const, genislik: 13 },
      ],
      satirlar: model.takvim.map((a) => [a.etiket, lira(a.tutar), a.adet]),
    },
    {
      ad: "Gerçekleşen tahsilat",
      sutunlar: [
        { baslik: "Ay", genislik: 16 },
        { baslik: "Tahsil edilen", bicim: "para" as const, genislik: 18 },
      ],
      satirlar: model.aylikTahsilat.map((a) => [a.etiket, lira(a.tutar)]),
    },
    {
      ad: "Müşteri alacakları",
      sutunlar: [
        { baslik: "Müşteri", genislik: 30 },
        { baslik: "Açık bakiye", bicim: "para" as const, genislik: 18 },
        { baslik: "Vadesi geçmiş", bicim: "para" as const, genislik: 18 },
        { baslik: `Yaklaşan (${YAKLASAN_GUN} gün)`, bicim: "para" as const, genislik: 20 },
        { baslik: "En eski geçmiş vade", bicim: "tarih" as const, genislik: 18 },
      ],
      satirlar: model.musteriler.map((m) => [m.ad, lira(m.bakiye), lira(m.gecikmis), lira(m.yaklasan), m.enEskiVade]),
    },
  ];
}
