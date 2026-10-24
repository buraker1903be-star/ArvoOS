import { AYLAR, aralikYuklemi, gunAnahtari, type Donem } from "@/lib/rapor-donemi";
import { monthStartKey } from "@/lib/istanbul-date";
import type { Hucre } from "@/lib/xlsx";

/*
  FİNANSAL PERFORMANS — KARAR (RPR-04).

  BU RAPOR GELİR/GİDER DEFTERİNE BAKIYOR, KASAYA DEĞİL.
  Üç kavram ayrı (docs/RAPORLAMA-ASAMA-1.md §3.2):
   - **satış**   `crm_contracts.amount` (imzalandığı an)      → RPR-01
   - **tahsilat** `account_entries` (kasaya giren)             → RPR-03
   - **gelir**   `finance_transactions` (muhasebesel)          → BU RAPOR
  Birini diğerinin yerine koymak ya da toplamak yanlış; ekranda da
  böyle yazıyor.

  `billing_invoices` ve `billing_subscriptions` BURAYA GİRMEZ: onlar
  Arvo'nun kendi tahsilatı, kiracının geliri değil. `billing_subscriptions`
  her kurum ödemesinin aktivasyon ikizi ve onaylı ödeme isteğiyle
  toplanınca her ödeme İKİ KEZ sayılıyor (AGENTS.md "Rakam denetimi").

  İKİ AYRI ÇIKIŞ KALEMİ, TOPLANMADAN ÖNCE AYRI DURUYOR:
   - `finance_transactions` (expense): genel gider,
   - `contract_cost_items`: belirli bir işin maliyeti.
  İkisi aynı tabloya yazılmıyor ve aynı soruyu yanıtlamıyor; "gider"
  diye tek rakam göstermek, hangi işin kârsız olduğunu görünmez
  yapardı.

  "İPTAL" İKİ TABLODA İKİ AYRI YAZIMLA (24.10.2026'da canlı şemadan
  doğrulandı):
   - `finance_transactions.status`  → 'planned' | 'paid' | **'canceled'** (tek L)
   - `payment_installments.status`  → 'pending' | 'paid' | **'cancelled'** (çift L)
  Yanlış yazımla süzmek hata vermez, sessizce SIFIR satır döndürür.
  Burada yalnızca `finance_transactions` var, o yüzden tek L; kısıt
  listesine bakmadan buraya ikinci bir durum yazılmamalı.
*/

export type FinansHareketi = {
  transaction_type: string;
  status: string;
  amount: number;
  category: string | null;
  title: string;
  counterparty: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
};

/*
  KASA HAREKETİ — YALNIZCA REFERANS İÇİN.

  Bu rapor gelir/gider defterine bakıyor ve tahsilat ONUN YERİNE
  geçmiyor. Ama kurum gelirini defterde tutmuyorsa (sözleşme +
  tahsilat olarak işliyorsa) rapor "gelir ₺0, net sonuç −₺498.789"
  diyor ve bu sayı bir ZARAR DEĞİL — sadece gelir defterinin boş
  olduğunun işareti. Canlıda tam bu görüldü (24.10.2026).

  Çözüm tahsilatı gelire KATMAK değil — üç kavram ayrı
  (docs/RAPORLAMA-ASAMA-1.md §3.2). Çözüm, defterin boş olduğunu
  SÖYLEMEK ve paranın nerede göründüğünü işaret etmek. O yüzden
  dönem tahsilatı ayrı bir alanda duruyor, hiçbir toplama girmiyor.
*/
export type KasaHareketi = {
  entry_type: string;
  source_type: string | null;
  amount: number;
  transaction_date: string;
};

export type MaliyetKalemi = {
  amount: number;
  status: string;
  cost_date: string;
  category: string | null;
};

export type Kirilim = { ad: string; adet: number; tutar: number; pay: number | null };
export type AyFinansi = { ay: string; etiket: string; gelir: number; gider: number; maliyet: number };
export type Bekleyen = { tutar: number; adet: number };

export type FinansModeli = {
  gelir: number;
  gelirAdet: number;
  gider: number;
  giderAdet: number;
  isMaliyeti: number;
  /** Genel gider + iş maliyeti. */
  toplamCikis: number;
  netSonuc: number;
  /** Net / gelir; gelir yoksa null. */
  marj: number | null;
  bekleyenGelir: Bekleyen;
  bekleyenGider: Bekleyen;
  gecikenGelir: Bekleyen;
  gecikenGider: Bekleyen;
  /** Planlı ama vadesi girilmemiş: hiçbir döneme düşmüyor. */
  vadesizPlan: Bekleyen;
  /** Dönemde kasaya giren net para — REFERANS; gelire eklenmiyor. */
  tahsilatReferansi: number;
  /** Gelir defteri bu dönemde boş mu (kayıt sayısı sıfır). */
  gelirDefteriBos: boolean;
  gelirKategorileri: Kirilim[];
  giderKategorileri: Kirilim[];
  maliyetKategorileri: Kirilim[];
  aylik: AyFinansi[];
};

const KATEGORISIZ = "Kategorisiz";

const payi = (deger: number, taban: number) => (taban ? (deger / taban) * 100 : null);

const siralaKirilim = (kayitlar: Map<string, { adet: number; tutar: number }>, taban: number): Kirilim[] =>
  [...kayitlar.entries()]
    .map(([ad, v]) => ({ ad, ...v, pay: payi(v.tutar, taban) }))
    .sort((a, b) => b.tutar - a.tutar || a.ad.localeCompare(b.ad, "tr"));

const ekle = (harita: Map<string, { adet: number; tutar: number }>, ad: string, tutar: number) => {
  const mevcut = harita.get(ad) ?? { adet: 0, tutar: 0 };
  harita.set(ad, { adet: mevcut.adet + 1, tutar: mevcut.tutar + tutar });
};

export function finansModeli({
  donem,
  bugun,
  hareketler,
  maliyetler,
  kasaHareketleri = [],
  aySayisi = 6,
}: {
  donem: Donem;
  bugun: string;
  hareketler: readonly FinansHareketi[];
  maliyetler: readonly MaliyetKalemi[];
  /** Cari hareketleri — yalnızca referans rakamı için. */
  kasaHareketleri?: readonly KasaHareketi[];
  aySayisi?: number;
}): FinansModeli {
  const aralikta = aralikYuklemi(donem);

  const [sonYil, sonAy] = donem.endKey.split("-").map(Number);
  const aylar = new Map<string, AyFinansi>();
  for (let i = aySayisi - 1; i >= 0; i -= 1) {
    const ay = monthStartKey(sonYil, sonAy - i).slice(0, 7);
    aylar.set(ay, { ay, etiket: AYLAR[Number(ay.slice(5, 7)) - 1], gelir: 0, gider: 0, maliyet: 0 });
  }

  let gelir = 0;
  let gelirAdet = 0;
  let gider = 0;
  let giderAdet = 0;
  const bekleyenGelir = { tutar: 0, adet: 0 };
  const bekleyenGider = { tutar: 0, adet: 0 };
  const gecikenGelir = { tutar: 0, adet: 0 };
  const gecikenGider = { tutar: 0, adet: 0 };
  const vadesizPlan = { tutar: 0, adet: 0 };
  const gelirKat = new Map<string, { adet: number; tutar: number }>();
  const giderKat = new Map<string, { adet: number; tutar: number }>();

  for (const h of hareketler) {
    const tutar = Number(h.amount);
    const gelirMi = h.transaction_type === "income";
    const giderMi = h.transaction_type === "expense";
    if (!gelirMi && !giderMi) continue;
    /* 'canceled' (TEK L) iptal demek ve hiçbir hesaba girmiyor.
       Durum listesi kısıtla sabitlenmiş: planned | paid | canceled. */
    if (h.status === "canceled") continue;

    if (h.status === "paid") {
      /*
        GERÇEKLEŞEN GÜNÜ `paid_at`; yoksa `created_at`. Durumu "paid"
        olup ödeme anı boş kalmış kayıt (eski veri, elle işaretleme)
        hiçbir aya düşmezse gelir/gider toplamdan sessizce eksilirdi.
      */
      const gun = gunAnahtari(h.paid_at ?? h.created_at);
      if (aralikta(h.paid_at ?? h.created_at)) {
        if (gelirMi) { gelir += tutar; gelirAdet += 1; ekle(gelirKat, h.category?.trim() || KATEGORISIZ, tutar); }
        else { gider += tutar; giderAdet += 1; ekle(giderKat, h.category?.trim() || KATEGORISIZ, tutar); }
      }
      /* Seri DÖNEMDEN BAĞIMSIZ: "son altı ay" dönem seçimiyle
         değişmiyor, yalnızca bitiş ayına göre kayıyor. */
      const satir = aylar.get(gun.slice(0, 7));
      if (satir) {
        if (gelirMi) satir.gelir += tutar;
        else satir.gider += tutar;
      }
      continue;
    }

    // status === "planned"
    if (!h.due_date) {
      /* Vadesi girilmemiş plan hiçbir döneme düşmüyor; gizlemek
         yerine kendi satırında sayılıyor ki toplamlar tutsun. */
      vadesizPlan.tutar += tutar;
      vadesizPlan.adet += 1;
      continue;
    }
    const hedef = gelirMi ? bekleyenGelir : bekleyenGider;
    if (aralikta(h.due_date)) { hedef.tutar += tutar; hedef.adet += 1; }
    /* VADESİ GEÇMİŞ PLAN DÖNEMDEN BAĞIMSIZ: geçen ayın ödenmemiş
       giderini bu ayın raporunda görmemek, aksiyon gerektiren tek
       satırı gizlemek olurdu. */
    if (h.due_date < bugun) {
      const geciken = gelirMi ? gecikenGelir : gecikenGider;
      geciken.tutar += tutar;
      geciken.adet += 1;
    }
  }

  let isMaliyeti = 0;
  const maliyetKat = new Map<string, { adet: number; tutar: number }>();
  for (const k of maliyetler) {
    /* Maliyet kaleminin durumu yalnızca planned|paid — iptal YOK
       (kısıt öyle). Ödenmiş olan dönem sonucuna giriyor. */
    if (k.status !== "paid") continue;
    const tutar = Number(k.amount);
    if (aralikta(k.cost_date)) {
      isMaliyeti += tutar;
      ekle(maliyetKat, k.category?.trim() || KATEGORISIZ, tutar);
    }
    const satir = aylar.get(k.cost_date.slice(0, 7));
    if (satir) satir.maliyet += tutar;
  }

  /* Tahsilat referansı RPR-03'teki kuralla aynı: alacak kayıtları
     eksi düzeltme türündeki borç (iade). Hiçbir toplama girmiyor. */
  let tahsilat = 0;
  let iade = 0;
  for (const h of kasaHareketleri) {
    if (!aralikta(h.transaction_date)) continue;
    if (h.entry_type === "credit") tahsilat += Number(h.amount);
    else if (h.entry_type === "debit" && h.source_type === "adjustment") iade += Number(h.amount);
  }

  const toplamCikis = gider + isMaliyeti;
  const netSonuc = gelir - toplamCikis;

  return {
    gelir,
    gelirAdet,
    gider,
    giderAdet,
    isMaliyeti,
    toplamCikis,
    netSonuc,
    marj: gelir ? (netSonuc / gelir) * 100 : null,
    tahsilatReferansi: Math.max(0, tahsilat - iade),
    gelirDefteriBos: gelirAdet === 0,
    bekleyenGelir,
    bekleyenGider,
    gecikenGelir,
    gecikenGider,
    vadesizPlan,
    gelirKategorileri: siralaKirilim(gelirKat, gelir),
    giderKategorileri: siralaKirilim(giderKat, gider),
    maliyetKategorileri: siralaKirilim(maliyetKat, isMaliyeti),
    aylik: [...aylar.values()],
  };
}

/* ---------- Excel ---------- */
const lira = (kurus: number) => kurus / 100;
const para = (kurus: number) => ({ deger: lira(kurus), bicim: "para" as const });
const sayi = (deger: number) => ({ deger, bicim: "sayi" as const });
const oran = (yuzde: number | null) => ({ deger: yuzde === null ? null : yuzde / 100, bicim: "yuzde" as const });

const kirilimSayfasi = (ad: string, birim: string, satirlar: Kirilim[]) => ({
  ad,
  sutunlar: [
    { baslik: birim, genislik: 30 },
    { baslik: "Tutar", bicim: "para" as const, genislik: 18 },
    { baslik: "Kayıt", bicim: "sayi" as const, genislik: 10 },
    { baslik: "Pay", bicim: "yuzde" as const, genislik: 10 },
  ],
  satirlar: satirlar.map((k) => [k.ad, lira(k.tutar), k.adet, k.pay === null ? null : k.pay / 100]),
});

export function finansSayfalari({ model, donemEtiket }: { model: FinansModeli; donemEtiket: string }) {
  return [
    {
      ad: "Özet",
      sutunlar: [{ baslik: "Ölçüt", genislik: 38 }, { baslik: "Değer", genislik: 18 }],
      satirlar: [
        ["Dönem", donemEtiket],
        ["Gelir (muhasebesel, ödenmiş)", para(model.gelir)],
        ["Gelir kaydı adedi", sayi(model.gelirAdet)],
        ["Genel gider (ödenmiş)", para(model.gider)],
        ["İş maliyeti (ödenmiş)", para(model.isMaliyeti)],
        ["Toplam çıkış", para(model.toplamCikis)],
        ["Net sonuç", para(model.netSonuc)],
        ["Net marj", oran(model.marj)],
        ["Dönemde vadesi gelen planlı gelir", para(model.bekleyenGelir.tutar)],
        ["Dönemde vadesi gelen planlı gider", para(model.bekleyenGider.tutar)],
        ["Vadesi geçmiş planlı gelir", para(model.gecikenGelir.tutar)],
        ["Vadesi geçmiş planlı gider", para(model.gecikenGider.tutar)],
        ["Vadesi girilmemiş plan", para(model.vadesizPlan.tutar)],
        /* Referans satırı: gelire EKLENMİYOR, nerede göründüğünü
           söylüyor. Başlığı da bunu yazıyor. */
        ["Dönemde kasaya giren (referans — gelir değil)", para(model.tahsilatReferansi)],
      ] as Hucre[][],
    },
    {
      ad: "Aylara göre",
      sutunlar: [
        { baslik: "Ay", genislik: 12 },
        { baslik: "Gelir", bicim: "para" as const, genislik: 16 },
        { baslik: "Genel gider", bicim: "para" as const, genislik: 16 },
        { baslik: "İş maliyeti", bicim: "para" as const, genislik: 16 },
        { baslik: "Net", bicim: "para" as const, genislik: 16 },
      ],
      satirlar: model.aylik.map((a) => [
        `${a.etiket} ${a.ay.slice(0, 4)}`,
        lira(a.gelir), lira(a.gider), lira(a.maliyet),
        lira(a.gelir - a.gider - a.maliyet),
      ]),
    },
    kirilimSayfasi("Gelir kategorileri", "Kategori", model.gelirKategorileri),
    kirilimSayfasi("Gider kategorileri", "Kategori", model.giderKategorileri),
    kirilimSayfasi("İş maliyeti kategorileri", "Kategori", model.maliyetKategorileri),
  ];
}
