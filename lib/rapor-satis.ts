import { AYLAR, aralikYuklemi, gunAnahtari, type Donem } from "@/lib/rapor-donemi";
import type { Hucre } from "@/lib/xlsx";
import { etkinTeklifDurumu } from "@/lib/teklif-durumu";
import { gruplamaAnahtari } from "@/lib/metin-anahtari";
import { monthStartKey } from "@/lib/istanbul-date";

/*
  SATIŞ ANALİTİĞİ — KARAR (RPR-01).

  Sorgular rapor bileşeninde, karar burada ve saf: ekranın gösterdiği
  sayı ile Excel'e yazılan sayı AYNI işlevden çıkıyor. İkinci bir yerde
  yeniden hesaplamak, ekranla çıktının ayrışması için en kısa yoldur
  (bu depo bunu daha önce yaşadı: aynı olay iki listede iki ayrı saatle
  görünüyordu).

  ÜÇ KAVRAM KARIŞTIRILMIYOR (docs/RAPORLAMA-ASAMA-1.md §3.2):
  satış `crm_contracts.amount` (imzalandığı an, nakit DEĞİL), tahsilat
  `account_entries`, gelir `finance_transactions`. Bu rapor yalnızca
  SATIŞ: "şu kadar sattık" ile "şu kadar para girdi" aynı şey değil ve
  ekranda da böyle yazıyor.

  TEKLİFİN DURUMU `status` SÜTUNUNDA DEĞİL: kabul/ret/süresi geçmiş
  `archive_reason`da taşınıyor (lib/teklif-durumu.ts).

  TEKLİF SAYISI REVİZYON ZİNCİRİNDEN TEKİLLEŞTİRİLİYOR (§3.1).
  `crm_proposals` revizyonu ayrı satır tutuyor; ham satır saymak bir
  ticari süreci üç teklif gibi gösterir ve dönüşüm oranını olduğundan
  KÜÇÜK yazar. Sayım `root_proposal_id` (yoksa kendi kimliği) üzerinden.

  HİZMET TÜRÜ SERBEST METİN (§2.2): `request_details.service_type` bir
  boyut tablosuna bağlı değil. "Tez Yazımı" ile "tez yazımı" ayrı grup
  olmasın diye anahtar normalleştiriliyor; ekranda ilk görülen yazım
  gösteriliyor — normalleştirilmiş anahtarı göstermek kullanıcının
  kendi yazdığı adı tanımaması olurdu.
*/

/** Satış sayılan sözleşme durumları. */
const SATIS_DURUMU = new Set(["signed", "completed"]);

export type SatisSozlesmesi = {
  id: string;
  contract_no: string;
  title: string;
  amount: number;
  status: string;
  signed_at: string | null;
  created_at: string;
  opportunity_id: string | null;
};

export type SatisTeklifi = {
  id: string;
  root_proposal_id: string | null;
  amount: number;
  status: string;
  /* Kabul/ret/süresi geçmiş durumu BURADA taşınıyor; `status` o
     satırlarda 'archived'. Gerekçe: lib/teklif-durumu.ts. */
  archive_reason: string | null;
  sent_at: string | null;
};

export type SatisTalebi = {
  assigned_employee_id: string | null;
  customer_name: string;
  service_type: string | null;
};

export type Kirilim = { ad: string; adet: number; tutar: number; pay: number | null };
export type AySatiri = { ay: string; etiket: string; tutar: number; adet: number };
export type BuyukSatis = { id: string; no: string; musteri: string; baslik: string; tutar: number; gun: string };

export type SatisModeli = {
  toplam: number;
  adet: number;
  ortalama: number;
  /** Dönemde müşteriye GİDEN teklif süreci sayısı (revizyonlar tekil). */
  teklifAdet: number;
  teklifTutari: number;
  kabulAdet: number;
  /** Kabul / verilen teklif; teklif yoksa null — "%0" yazmak "hiç
   *  kabul edilmedi" demek olurdu, oysa hiç teklif verilmemiş. */
  donusum: number | null;
  aylik: AySatiri[];
  personel: Kirilim[];
  hizmet: Kirilim[];
  enBuyuk: BuyukSatis[];
  /** Talebi okunamayan/atanmamış satış var mı — kırılımın altına not. */
  atanmamisAdet: number;
};

/*
  Gruplama kuralı ORTAK (lib/metin-anahtari.ts). Burada yalnızca
  `toLocaleLowerCase("tr")` vardı ve Türkçe küçültme büyük "I"yı
  noktasız ı yapıyor: "Instagram" ile "instagram" ayrı gruplara
  düşüyordu. Aynı kusur CRM raporunun kaynak kırılımında testle
  yakalandı (24.10.2026).
*/
export const hizmetAnahtari = gruplamaAnahtari;

const payi = (deger: number, taban: number) => (taban ? (deger / taban) * 100 : null);

/** Kırılımı tutara göre büyükten küçüğe; eşitlikte ada göre. */
const siralaKirilim = (kayitlar: Map<string, { ad: string; adet: number; tutar: number }>, taban: number): Kirilim[] =>
  [...kayitlar.values()]
    .sort((a, b) => b.tutar - a.tutar || b.adet - a.adet || a.ad.localeCompare(b.ad, "tr"))
    .map((k) => ({ ...k, pay: payi(k.tutar, taban) }));

export function satisModeli({
  donem,
  sozlesmeler,
  teklifler,
  talepler,
  personelAdi,
  aySayisi = 6,
}: {
  donem: Donem;
  sozlesmeler: readonly SatisSozlesmesi[];
  teklifler: readonly SatisTeklifi[];
  /** Talep kimliği → talep. Sözleşmenin talebi pencereden eski olabilir. */
  talepler: ReadonlyMap<string, SatisTalebi>;
  personelAdi: ReadonlyMap<string, string>;
  aySayisi?: number;
}): SatisModeli {
  const aralikta = aralikYuklemi(donem);
  /*
    SATIŞ GÜNÜ `signed_at`; yoksa `created_at`. Durumu "signed" olup
    imza anı boş kalmış kayıt (eski veri, elle işaretleme) hiçbir aya
    düşmezse satış toplamdan sessizce eksilirdi.
  */
  const satisGunu = (s: SatisSozlesmesi) => gunAnahtari(s.signed_at ?? s.created_at);
  const satislar = sozlesmeler.filter((s) => SATIS_DURUMU.has(s.status) && aralikta(s.signed_at ?? s.created_at));

  const toplam = satislar.reduce((t, s) => t + Number(s.amount), 0);
  const adet = satislar.length;

  // --- Teklif süreçleri: revizyonlar tek kök altında ---
  const kok = (t: SatisTeklifi) => t.root_proposal_id ?? t.id;
  const surecler = new Map<string, { tutar: number; kabul: boolean; sonGonderim: string }>();
  for (const teklif of teklifler) {
    /* Yalnızca MÜŞTERİYE GİDEN teklif sayılıyor: taslak, panelde
       açılmış ama gönderilmemiş bir kayıt ve onu "verilen teklif"
       saymak dönüşüm oranının paydasını şişirirdi. */
    if (!teklif.sent_at || !aralikta(teklif.sent_at)) continue;
    const anahtar = kok(teklif);
    const onceki = surecler.get(anahtar);
    /*
      SÜRECİN TUTARI EN SON GÖNDERİLEN REVİZYONUN TUTARI. Revizyonlar
      aynı kökü paylaşıyor ve tutarları farklı: ilk gelen satırı
      tutmak, müşteriye 40.000 gönderildiği hâlde raporda ilk teklifin
      25.000'ini göstermek olurdu. Sıra `sent_at` ile — satırların
      geliş sırasına güvenilemez.
    */
    const dahaYeni = !onceki || teklif.sent_at > onceki.sonGonderim;
    surecler.set(anahtar, {
      tutar: dahaYeni ? Number(teklif.amount) : onceki.tutar,
      sonGonderim: dahaYeni ? teklif.sent_at : onceki.sonGonderim,
      /* Kabul zincirin HERHANGİ bir revizyonundan gelebilir: kabul
         edilen revizyon sonradan bir düzeltmeyle "superseded"
         olabiliyor. */
      /*
        KABUL `status`'TAN OKUNMAZ. Canlıdaki tetikleyici kabul edilen
        teklifi 'archived' yapıp gerçek durumu `archive_reason`a
        yazıyor; `status === "accepted"` HİÇBİR koşulda doğru olmaz ve
        dönüşüm oranı her zaman %0 çıkardı (24.10.2026'da bu kodda
        bulundu, lib/teklif-durumu.ts).
      */
      kabul: (onceki?.kabul ?? false) || etkinTeklifDurumu(teklif.status, teklif.archive_reason) === "accepted",
    });
  }
  const teklifAdet = surecler.size;
  const teklifTutari = [...surecler.values()].reduce((t, s) => t + s.tutar, 0);
  const kabulAdet = [...surecler.values()].filter((s) => s.kabul).length;

  // --- Aylık seri: dönemin bitişinden geriye aySayisi ay ---
  const [sonYil, sonAy] = donem.endKey.split("-").map(Number);
  const aylar = new Map<string, AySatiri>();
  for (let i = aySayisi - 1; i >= 0; i -= 1) {
    const ay = monthStartKey(sonYil, sonAy - i).slice(0, 7);
    aylar.set(ay, { ay, etiket: AYLAR[Number(ay.slice(5, 7)) - 1], tutar: 0, adet: 0 });
  }
  /* Seri DÖNEMDEN BAĞIMSIZ: "son altı ay" sorusu dönem seçimiyle
     değişmiyor, yalnızca bitiş ayına göre kayıyor. O yüzden aralık
     süzgeci değil ay eşlemesi kullanılıyor. */
  for (const s of sozlesmeler) {
    if (!SATIS_DURUMU.has(s.status)) continue;
    const satir = aylar.get(satisGunu(s).slice(0, 7));
    if (!satir) continue;
    satir.tutar += Number(s.amount);
    satir.adet += 1;
  }

  // --- Personel ve hizmet kırılımı ---
  const personel = new Map<string, { ad: string; adet: number; tutar: number }>();
  const hizmet = new Map<string, { ad: string; adet: number; tutar: number }>();
  let atanmamisAdet = 0;
  for (const s of satislar) {
    const talep = s.opportunity_id ? talepler.get(s.opportunity_id) : undefined;
    const kisiId = talep?.assigned_employee_id ?? null;
    /* Atanmamış satış GİZLENMİYOR, kendi satırında toplanıyor:
       kırılımın toplamı raporun toplamıyla tutmalı, yoksa iki sayı
       arasındaki fark kullanıcıya hata gibi görünür. */
    if (!kisiId) atanmamisAdet += 1;
    const kisiAd = (kisiId && personelAdi.get(kisiId)) || "Atanmamış";
    const kisiAnahtar = kisiId ?? "__atanmamis__";
    const kisi = personel.get(kisiAnahtar) ?? { ad: kisiAd, adet: 0, tutar: 0 };
    personel.set(kisiAnahtar, { ad: kisiAd, adet: kisi.adet + 1, tutar: kisi.tutar + Number(s.amount) });

    const turHam = talep?.service_type?.trim();
    const turAnahtar = turHam ? hizmetAnahtari(turHam) : "__belirtilmemis__";
    const mevcut = hizmet.get(turAnahtar);
    hizmet.set(turAnahtar, {
      // İlk görülen yazım korunuyor; kullanıcı kendi yazdığını görsün.
      ad: mevcut?.ad ?? (turHam || "Belirtilmemiş"),
      adet: (mevcut?.adet ?? 0) + 1,
      tutar: (mevcut?.tutar ?? 0) + Number(s.amount),
    });
  }

  const enBuyuk: BuyukSatis[] = [...satislar]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 10)
    .map((s) => ({
      id: s.id,
      no: s.contract_no,
      musteri: (s.opportunity_id ? talepler.get(s.opportunity_id)?.customer_name : null) ?? "—",
      baslik: s.title,
      tutar: Number(s.amount),
      gun: satisGunu(s),
    }));

  return {
    toplam,
    adet,
    ortalama: adet ? Math.round(toplam / adet) : 0,
    teklifAdet,
    teklifTutari,
    kabulAdet,
    donusum: teklifAdet ? (kabulAdet / teklifAdet) * 100 : null,
    aylik: [...aylar.values()],
    personel: siralaKirilim(personel, toplam),
    hizmet: siralaKirilim(hizmet, toplam),
    enBuyuk,
    atanmamisAdet,
  };
}

/*
  EXCEL SAYFALARI AYNI MODELDEN (2026-10-24).

  Dosya ekranın gösterdiği modelden üretiliyor; sorgu yeniden
  koşmuyor, sayı yeniden hesaplanmıyor. Çıktıyı ayrı bir yerde kurmak,
  ekranda 150.000 ₺ yazarken dosyada 148.500 ₺ yazmasının en kısa
  yoludur ve kullanıcı hangisinin doğru olduğunu bilemez.

  BİRİMLER DÖNÜŞÜYOR: para kuruş TAMSAYI olarak tutuluyor, Excel'in
  para biçimi ise lira bekliyor (`#,##0.00 ₺`); yüzde biçimi de ORAN
  bekliyor (0,55 = %55). Kuruşu olduğu gibi yazmak tutarı yüz katına
  çıkarırdı — hücre yine "geçerli" görünürdü.
*/
export type SatisSayfasiGirdisi = { model: SatisModeli; donemEtiket: string };

const lira = (kurus: number) => kurus / 100;
const para = (kurus: number) => ({ deger: lira(kurus), bicim: "para" as const });
const oran = (yuzde: number | null) => (yuzde === null ? null : yuzde / 100);

export function satisSayfalari({ model, donemEtiket }: SatisSayfasiGirdisi) {
  return [
    {
      ad: "Özet",
      sutunlar: [{ baslik: "Ölçüt", genislik: 34 }, { baslik: "Değer", genislik: 18 }],
      /*
        Tek sütunda dört ayrı birim var, o yüzden biçim HÜCREDE:
        sütuna "para" demek adedi "2,00 ₺" yapardı, hiç demezse tutar
        biçimsiz çıkıp kuruş sanılırdı.
      */
      satirlar: [
        ["Dönem", donemEtiket],
        ["Satış tutarı (imzalanan sözleşme)", para(model.toplam)],
        ["Satış adedi", { deger: model.adet, bicim: "sayi" as const }],
        ["Ortalama sözleşme", para(model.ortalama)],
        ["Verilen teklif (süreç)", { deger: model.teklifAdet, bicim: "sayi" as const }],
        ["Verilen teklif tutarı", para(model.teklifTutari)],
        ["Kabul edilen teklif", { deger: model.kabulAdet, bicim: "sayi" as const }],
        /* Dönüşüm yoksa boş bırakılıyor: 0 yazmak "hiç kabul
           edilmedi" demek olurdu, oysa hiç teklif verilmemiş. */
        ["Teklif → satış dönüşümü", { deger: oran(model.donusum), bicim: "yuzde" as const }],
      ] as Hucre[][],
    },
    {
      ad: "Aylara göre",
      sutunlar: [
        { baslik: "Ay", genislik: 12 },
        { baslik: "Satış tutarı", bicim: "para" as const, genislik: 18 },
        { baslik: "Adet", bicim: "sayi" as const, genislik: 10 },
      ],
      satirlar: model.aylik.map((a) => [`${a.etiket} ${a.ay.slice(0, 4)}`, lira(a.tutar), a.adet]),
    },
    {
      ad: "Personel",
      sutunlar: [
        { baslik: "Personel", genislik: 28 },
        { baslik: "Satış tutarı", bicim: "para" as const, genislik: 18 },
        { baslik: "Adet", bicim: "sayi" as const, genislik: 10 },
        { baslik: "Pay", bicim: "yuzde" as const, genislik: 10 },
      ],
      satirlar: model.personel.map((k) => [k.ad, lira(k.tutar), k.adet, oran(k.pay)]),
    },
    {
      ad: "Hizmet türü",
      sutunlar: [
        { baslik: "Hizmet türü", genislik: 28 },
        { baslik: "Satış tutarı", bicim: "para" as const, genislik: 18 },
        { baslik: "Adet", bicim: "sayi" as const, genislik: 10 },
        { baslik: "Pay", bicim: "yuzde" as const, genislik: 10 },
      ],
      satirlar: model.hizmet.map((k) => [k.ad, lira(k.tutar), k.adet, oran(k.pay)]),
    },
    {
      ad: "En büyük satışlar",
      sutunlar: [
        { baslik: "Sözleşme no", genislik: 18 },
        { baslik: "Müşteri", genislik: 26 },
        { baslik: "Konu", genislik: 34 },
        { baslik: "Tutar", bicim: "para" as const, genislik: 18 },
        { baslik: "İmza günü", bicim: "tarih" as const, genislik: 14 },
      ],
      satirlar: model.enBuyuk.map((s) => [s.no, s.musteri, s.baslik, lira(s.tutar), s.gun]),
    },
  ];
}
