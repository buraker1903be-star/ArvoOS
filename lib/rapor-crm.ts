import { AYLAR, aralikYuklemi, gunAnahtari, type Donem } from "@/lib/rapor-donemi";
import { monthStartKey } from "@/lib/istanbul-date";
import { kazanildi, nitelikliAday, teklifeGecti, temasKuruldu } from "@/lib/talep-asamalari";
import { gruplamaAnahtari } from "@/lib/metin-anahtari";
import type { Hucre } from "@/lib/xlsx";

/*
  CRM VE MÜŞTERİ ANALİTİĞİ — KARAR (RPR-02).

  AŞAMA KÜMELERİ KODA YAZILMIYOR. `crm_opportunities.stage` kısıtı on
  sekiz değere izin veriyor ve akademik kurumlar ayrıntılı olanları
  kullanıyor (`academic_review`, `proposal_ready`, `work_opened`…).
  Huni kararı `lib/talep-asamalari.ts`'teki eşlemeden geliyor; elle
  sayılan bir aşama listesi o kurumlarda ilerlemiş talepleri
  "ulaşılamamış" sayardı (24.10.2026'da kokpitte tam bu bulundu).

  MÜŞTERİ KİMLİĞİ: `account_parties.id` (sözleşmedeki `party_id`)
  gerçek kimlik; `crm_opportunities.customer_name` SERBEST METİN ve
  aynı müşteri farklı yazımlarla girilebiliyor. Tekrar satış analizi
  `party_id` üzerinden yapılıyor; cari kaydı olmayan sözleşme
  adından türetilmiş bir anahtara düşüyor ve bu kaydın SAYISI
  raporda yazıyor — sessizce ada güvenmek, aynı müşteriyi iki
  müşteri gibi gösterip "tekrar eden müşteri" oranını olduğundan
  küçük yazardı.

  TEKRAR EDEN MÜŞTERİ ÖMÜR BOYU BAKILARAK belirleniyor: dönemde
  sözleşme imzalayan bir müşterinin DAHA ÖNCE imzalanmış sözleşmesi
  varsa tekrar eden. Yalnızca dönem içine bakmak, iki yıllık bir
  müşteriyi "yeni" göstermek olurdu.
*/

export type CrmTalebi = {
  id: string;
  stage: string;
  source: string | null;
  lost_reason: string | null;
  estimated_value: number;
  created_at: string;
  updated_at: string;
};

export type CrmSozlesmesi = {
  id: string;
  opportunity_id: string | null;
  party_id: string | null;
  amount: number;
  status: string;
  signed_at: string | null;
  created_at: string;
};

export type KaynakSatiri = {
  ad: string;
  adet: number;
  kazanilan: number;
  /** Kazanılan / adet; adet 0 olamaz (grup ondan doğuyor). */
  donusum: number;
  tahminiDeger: number;
  pay: number | null;
};
export type SebepSatiri = { ad: string; adet: number; pay: number | null };
export type MusteriSatiri = {
  anahtar: string;
  ad: string;
  cariId: string | null;
  sozlesmeAdet: number;
  tutar: number;
  ilkIs: string;
  sonIs: string;
};
export type AyKazanimi = { ay: string; etiket: string; talep: number; kazanilan: number };

export type CrmModeli = {
  yeniTalep: number;
  yeniTalepDegeri: number;
  temas: number;
  nitelikli: number;
  teklifli: number;
  kazanilan: number;
  kayip: number;
  /** Kazanılan / yeni talep; talep yoksa null. */
  donusum: number | null;
  kaynaklar: KaynakSatiri[];
  kaynakBelirtilmemis: number;
  kayipSebepleri: SebepSatiri[];
  /** Dönemde ilk kez sözleşme imzalayan müşteri. */
  yeniMusteri: number;
  /** Dönemde imzalayan ama daha önce de sözleşmesi olan müşteri. */
  tekrarEden: number;
  /** Tekrar eden / dönemde imzalayan; imzalayan yoksa null. */
  tekrarOrani: number | null;
  enDegerli: MusteriSatiri[];
  /** Ömür boyu müşteri başına ortalama sözleşme tutarı. */
  musteriBasina: number;
  /** Cari kaydı olmayan imzalı sözleşme: kimlik addan türetildi. */
  kimliksizSozlesme: number;
  aylik: AyKazanimi[];
};

const BELIRTILMEMIS = "Belirtilmemiş";
const IMZALI = new Set(["signed", "completed"]);

const payi = (deger: number, taban: number) => (taban ? (deger / taban) * 100 : null);

/*
  Serbest metin (müşteri adı, kaynak, kayıp sebebi) → gruplama
  anahtarı; kural ortak (lib/metin-anahtari.ts).
*/
export const musteriAnahtari = gruplamaAnahtari;

export function crmModeli({
  donem,
  talepler,
  sozlesmeler,
  musteriAdi,
  cariAdi,
  aySayisi = 6,
}: {
  donem: Donem;
  talepler: readonly CrmTalebi[];
  /** Ömür boyu imzalı sözleşmeler: tekrar satış ancak böyle bilinir. */
  sozlesmeler: readonly CrmSozlesmesi[];
  /** Talep kimliği → müşteri adı (serbest metin). */
  musteriAdi: ReadonlyMap<string, string>;
  /** Cari kimliği → cari adı (gerçek kimlik). */
  cariAdi: ReadonlyMap<string, string>;
  aySayisi?: number;
}): CrmModeli {
  const aralikta = aralikYuklemi(donem);

  // --- Huni: dönemde açılan talepler ---
  const yeniler = talepler.filter((t) => aralikta(t.created_at));
  const temas = yeniler.filter((t) => temasKuruldu(t.stage)).length;
  const nitelikli = yeniler.filter((t) => nitelikliAday(t.stage)).length;
  const teklifli = yeniler.filter((t) => teklifeGecti(t.stage)).length;
  const kazanilan = yeniler.filter((t) => kazanildi(t.stage)).length;
  /* Kayıp DÖNEMDE KAYBEDİLENLER: talep eski olabilir, kayıp kararı
     bu dönemde verilmiş olabilir. `updated_at` o kararın anı. */
  const kayipTalepler = talepler.filter((t) => t.stage === "lost" && aralikta(t.updated_at));

  // --- Kaynak dağılımı ---
  const kaynakHarita = new Map<string, { ad: string; adet: number; kazanilan: number; tahminiDeger: number }>();
  let kaynakBelirtilmemis = 0;
  for (const t of yeniler) {
    const ham = t.source?.trim();
    if (!ham) kaynakBelirtilmemis += 1;
    const ad = ham || BELIRTILMEMIS;
    const anahtar = musteriAnahtari(ad);
    const mevcut = kaynakHarita.get(anahtar) ?? { ad, adet: 0, kazanilan: 0, tahminiDeger: 0 };
    kaynakHarita.set(anahtar, {
      ad: mevcut.ad,
      adet: mevcut.adet + 1,
      kazanilan: mevcut.kazanilan + (kazanildi(t.stage) ? 1 : 0),
      tahminiDeger: mevcut.tahminiDeger + Number(t.estimated_value),
    });
  }
  const kaynaklar: KaynakSatiri[] = [...kaynakHarita.values()]
    .map((k) => ({ ...k, donusum: (k.kazanilan / k.adet) * 100, pay: payi(k.adet, yeniler.length) }))
    .sort((a, b) => b.adet - a.adet || b.kazanilan - a.kazanilan || a.ad.localeCompare(b.ad, "tr"));

  // --- Kayıp sebepleri ---
  const sebepHarita = new Map<string, { ad: string; adet: number }>();
  for (const t of kayipTalepler) {
    const ad = t.lost_reason?.trim() || BELIRTILMEMIS;
    const anahtar = musteriAnahtari(ad);
    const mevcut = sebepHarita.get(anahtar) ?? { ad, adet: 0 };
    sebepHarita.set(anahtar, { ad: mevcut.ad, adet: mevcut.adet + 1 });
  }
  const kayipSebepleri: SebepSatiri[] = [...sebepHarita.values()]
    .map((s) => ({ ...s, pay: payi(s.adet, kayipTalepler.length) }))
    .sort((a, b) => b.adet - a.adet || a.ad.localeCompare(b.ad, "tr"));

  // --- Müşteriler: ömür boyu sözleşmelerden ---
  const imzalilar = sozlesmeler.filter((c) => IMZALI.has(c.status));
  let kimliksizSozlesme = 0;
  const musteriler = new Map<string, MusteriSatiri & { donemde: boolean; donemdenOnce: boolean }>();
  for (const c of imzalilar) {
    const gun = gunAnahtari(c.signed_at ?? c.created_at);
    const cariId = c.party_id;
    if (!cariId) kimliksizSozlesme += 1;
    const ad = (cariId && cariAdi.get(cariId))
      || (c.opportunity_id ? musteriAdi.get(c.opportunity_id) : null)
      || "Adsız müşteri";
    /* Anahtar cari kimliği; yoksa addan türetilmiş. İkincisi bir
       TAVİZ ve sayısı raporda yazıyor. */
    const anahtar = cariId ?? `ad:${musteriAnahtari(ad)}`;
    const mevcut = musteriler.get(anahtar);
    const donemde = aralikta(c.signed_at ?? c.created_at);
    musteriler.set(anahtar, {
      anahtar,
      ad: mevcut?.ad ?? ad,
      cariId: mevcut?.cariId ?? cariId,
      sozlesmeAdet: (mevcut?.sozlesmeAdet ?? 0) + 1,
      tutar: (mevcut?.tutar ?? 0) + Number(c.amount),
      ilkIs: mevcut && mevcut.ilkIs < gun ? mevcut.ilkIs : gun,
      sonIs: mevcut && mevcut.sonIs > gun ? mevcut.sonIs : gun,
      donemde: (mevcut?.donemde ?? false) || donemde,
      donemdenOnce: (mevcut?.donemdenOnce ?? false) || (!donemde && gun < donem.startKey),
    });
  }

  const donemdeImzalayan = [...musteriler.values()].filter((m) => m.donemde);
  /* TEKRAR EDEN, ÖMÜR BOYU bakılarak: dönemde imzalayan müşterinin
     dönemden ÖNCE de sözleşmesi varsa tekrar eden. Yalnızca dönem
     içine bakmak iki yıllık müşteriyi "yeni" göstermek olurdu. */
  const tekrarEden = donemdeImzalayan.filter((m) => m.donemdenOnce).length;
  const toplamTutar = [...musteriler.values()].reduce((t, m) => t + m.tutar, 0);

  const enDegerli: MusteriSatiri[] = [...musteriler.values()]
    .sort((a, b) => b.tutar - a.tutar || b.sozlesmeAdet - a.sozlesmeAdet || a.ad.localeCompare(b.ad, "tr"))
    .slice(0, 20)
    /* Dönem işaretleri listeye çıkmıyor: tekrar/yeni ayrımı
       yukarıda sayıldı, tabloda işi görmüyor. */
    .map((m) => ({
      anahtar: m.anahtar, ad: m.ad, cariId: m.cariId,
      sozlesmeAdet: m.sozlesmeAdet, tutar: m.tutar, ilkIs: m.ilkIs, sonIs: m.sonIs,
    }));

  // --- Aylık kazanım serisi ---
  const [sonYil, sonAy] = donem.endKey.split("-").map(Number);
  const aylar = new Map<string, AyKazanimi>();
  for (let i = aySayisi - 1; i >= 0; i -= 1) {
    const ay = monthStartKey(sonYil, sonAy - i).slice(0, 7);
    aylar.set(ay, { ay, etiket: AYLAR[Number(ay.slice(5, 7)) - 1], talep: 0, kazanilan: 0 });
  }
  for (const t of talepler) {
    const acilis = aylar.get(gunAnahtari(t.created_at).slice(0, 7));
    if (acilis) acilis.talep += 1;
    if (kazanildi(t.stage)) {
      const kazanim = aylar.get(gunAnahtari(t.updated_at).slice(0, 7));
      if (kazanim) kazanim.kazanilan += 1;
    }
  }

  return {
    yeniTalep: yeniler.length,
    yeniTalepDegeri: yeniler.reduce((t, r) => t + Number(r.estimated_value), 0),
    temas,
    nitelikli,
    teklifli,
    kazanilan,
    kayip: kayipTalepler.length,
    donusum: yeniler.length ? (kazanilan / yeniler.length) * 100 : null,
    kaynaklar,
    kaynakBelirtilmemis,
    kayipSebepleri,
    yeniMusteri: donemdeImzalayan.length - tekrarEden,
    tekrarEden,
    tekrarOrani: donemdeImzalayan.length ? (tekrarEden / donemdeImzalayan.length) * 100 : null,
    enDegerli,
    musteriBasina: musteriler.size ? Math.round(toplamTutar / musteriler.size) : 0,
    kimliksizSozlesme,
    aylik: [...aylar.values()],
  };
}

/* ---------- Excel ---------- */
const lira = (kurus: number) => kurus / 100;
const para = (kurus: number) => ({ deger: lira(kurus), bicim: "para" as const });
const sayi = (deger: number) => ({ deger, bicim: "sayi" as const });
const oran = (yuzde: number | null) => ({ deger: yuzde === null ? null : yuzde / 100, bicim: "yuzde" as const });

export function crmSayfalari({ model, donemEtiket }: { model: CrmModeli; donemEtiket: string }) {
  return [
    {
      ad: "Özet",
      sutunlar: [{ baslik: "Ölçüt", genislik: 36 }, { baslik: "Değer", genislik: 18 }],
      satirlar: [
        ["Dönem", donemEtiket],
        ["Yeni talep", sayi(model.yeniTalep)],
        ["Yeni talep tahmini değeri", para(model.yeniTalepDegeri)],
        ["Temas kurulan", sayi(model.temas)],
        ["Nitelikli aday", sayi(model.nitelikli)],
        ["Teklife geçen", sayi(model.teklifli)],
        ["Kazanılan", sayi(model.kazanilan)],
        ["Kaybedilen", sayi(model.kayip)],
        ["Talep → kazanım dönüşümü", oran(model.donusum)],
        ["Dönemde ilk kez sözleşme imzalayan", sayi(model.yeniMusteri)],
        ["Tekrar eden müşteri", sayi(model.tekrarEden)],
        ["Tekrar oranı", oran(model.tekrarOrani)],
        ["Müşteri başına ortalama (ömür boyu)", para(model.musteriBasina)],
        ["Cari kaydı olmayan imzalı sözleşme", sayi(model.kimliksizSozlesme)],
      ] as Hucre[][],
    },
    {
      ad: "Kaynaklar",
      sutunlar: [
        { baslik: "Kaynak", genislik: 26 },
        { baslik: "Talep", bicim: "sayi" as const, genislik: 10 },
        { baslik: "Kazanılan", bicim: "sayi" as const, genislik: 12 },
        { baslik: "Dönüşüm", bicim: "yuzde" as const, genislik: 12 },
        { baslik: "Tahmini değer", bicim: "para" as const, genislik: 18 },
      ],
      satirlar: model.kaynaklar.map((k) => [k.ad, k.adet, k.kazanilan, k.donusum / 100, lira(k.tahminiDeger)]),
    },
    {
      ad: "Kayıp sebepleri",
      sutunlar: [
        { baslik: "Sebep", genislik: 32 },
        { baslik: "Talep", bicim: "sayi" as const, genislik: 10 },
        { baslik: "Pay", bicim: "yuzde" as const, genislik: 10 },
      ],
      satirlar: model.kayipSebepleri.map((s) => [s.ad, s.adet, s.pay === null ? null : s.pay / 100]),
    },
    {
      ad: "Aylara göre",
      sutunlar: [
        { baslik: "Ay", genislik: 12 },
        { baslik: "Yeni talep", bicim: "sayi" as const, genislik: 12 },
        { baslik: "Kazanılan", bicim: "sayi" as const, genislik: 12 },
      ],
      satirlar: model.aylik.map((a) => [`${a.etiket} ${a.ay.slice(0, 4)}`, a.talep, a.kazanilan]),
    },
    {
      ad: "En değerli müşteriler",
      sutunlar: [
        { baslik: "Müşteri", genislik: 30 },
        { baslik: "Sözleşme", bicim: "sayi" as const, genislik: 12 },
        { baslik: "Toplam tutar", bicim: "para" as const, genislik: 18 },
        { baslik: "İlk iş", bicim: "tarih" as const, genislik: 14 },
        { baslik: "Son iş", bicim: "tarih" as const, genislik: 14 },
      ],
      satirlar: model.enDegerli.map((m) => [m.ad, m.sozlesmeAdet, lira(m.tutar), m.ilkIs, m.sonIs]),
    },
  ];
}
