import { aralikYuklemi, gunAnahtari, type Donem } from "@/lib/rapor-donemi";
import { etkinTeklifDurumu, TEKLIF_DURUM_ADI, type TeklifDurumu } from "@/lib/teklif-durumu";
import type { Hucre } from "@/lib/xlsx";

/*
  TEKLİF VE SÖZLEŞME — KARAR (RPR-07).

  İKİ TUZAK BURADA TOPLANIYOR:

  1. TEKLİFİN DURUMU `status` SÜTUNUNDA DEĞİL. Canlıdaki tetikleyici
     kabul/ret/süresi geçmiş teklifi 'archived' yapıp gerçek durumu
     `archive_reason`a yazıyor; `status = 'accepted'` arayan sorgu
     hiçbir satır bulmaz ve hata vermez (lib/teklif-durumu.ts).

  2. REVİZYONLAR AYNI SÜRECİN PARÇASI. `root_proposal_id` zinciri
     tutuyor; ham satır saymak bir ticari süreci üç teklif gibi
     gösterir, dönüşümü üçte bire indirir ve "ortalama teklif tutarı"nı
     da bozar (docs/RAPORLAMA-ASAMA-1.md §3.1).

  SÜRECİN DURUMU: zincirin herhangi bir revizyonu kabul edildiyse süreç
  KABUL. Kabul edilen revizyon sonradan bir düzeltmeyle "superseded"
  olabiliyor; yalnızca son revizyona bakmak kabul edilmiş bir satışı
  "yanıt bekliyor" göstermek olurdu. Kabul yoksa durum SON revizyondan
  okunuyor.

  SÖZLEŞME TARAFI BİR AKIŞ VE BİR DURUM TAŞIYOR: dönemde gönderilen /
  imzalanan sayıları akış; "imza bekleyen" ise ŞU ANKİ durum ve
  dönemden bağımsız — bekleyen bir imzayı dönem süzgecinin arkasına
  saklamak, raporun en çok işe yarayan satırını gizlemek olurdu.
*/

export type TeklifSatiri = {
  id: string;
  proposal_no: string;
  title: string;
  root_proposal_id: string | null;
  revision_no: number;
  amount: number;
  status: string;
  archive_reason: string | null;
  sent_at: string | null;
  responded_at: string | null;
  customer_responded_at: string | null;
  opportunity_id: string;
};

export type TeklifSozlesmesi = {
  id: string;
  contract_no: string;
  title: string;
  amount: number;
  status: string;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string;
  first_viewed_at: string | null;
  view_count: number;
  opportunity_id: string | null;
};

export type DurumPayi = { durum: TeklifDurumu; ad: string; adet: number; tutar: number; pay: number | null };
export type BekleyenImza = {
  id: string;
  no: string;
  musteri: string;
  baslik: string;
  tutar: number;
  gonderimGun: string | null;
  beklemeGun: number | null;
  goruldu: boolean;
  goruntuleme: number;
};

export type TeklifModeli = {
  /** Dönemde müşteriye gönderilen teklif SÜRECİ sayısı. */
  surecAdet: number;
  surecTutar: number;
  kabul: number;
  kabulTutar: number;
  red: number;
  sureGecti: number;
  yanitBekleyen: number;
  /** Kabul / gönderilen süreç; süreç yoksa null. */
  donusum: number | null;
  /** Yanıtlanan süreçlerde gönderimden yanıta ortalama gün. */
  ortYanitGun: number | null;
  /** Kararı müşterinin kendisi verdiği süreç sayısı. */
  musteriKarari: number;
  revizeSurec: number;
  /** Süreç başına ortalama revizyon sayısı (1 = hiç revize edilmemiş). */
  ortRevizyon: number | null;
  dagilim: DurumPayi[];
  /* --- Sözleşme --- */
  gonderilenSozlesme: number;
  imzalananSozlesme: number;
  imzalananTutar: number;
  /** Gönderimden imzaya ortalama gün. */
  ortImzaGun: number | null;
  /** ŞU AN imza bekleyen sözleşmeler — dönemden bağımsız. */
  bekleyenler: BekleyenImza[];
  bekleyenTutar: number;
  /** Devam eden (imzalı, tamamlanmamış) sözleşme. */
  aktifAdet: number;
  aktifTutar: number;
};

const gunFarki = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const ortalama = (degerler: number[]) =>
  degerler.length ? Math.round((degerler.reduce((t, d) => t + d, 0) / degerler.length) * 10) / 10 : null;

const payi = (deger: number, taban: number) => (taban ? (deger / taban) * 100 : null);

/** Süreç kimliği: kök teklif, yoksa kendi kimliği. */
const kok = (t: TeklifSatiri) => t.root_proposal_id ?? t.id;

type Surec = {
  rows: TeklifSatiri[];
  sonGonderim: string | null;
  tutar: number;
  durum: TeklifDurumu;
  yanitGun: number | null;
  musteriKarari: boolean;
};

export function teklifModeli({
  donem,
  bugun,
  teklifler,
  sozlesmeler,
  musteriAdi,
}: {
  donem: Donem;
  bugun: string;
  teklifler: readonly TeklifSatiri[];
  sozlesmeler: readonly TeklifSozlesmesi[];
  musteriAdi: ReadonlyMap<string, string>;
}): TeklifModeli {
  const aralikta = aralikYuklemi(donem);

  // --- Süreçleri kur ---
  const gruplar = new Map<string, TeklifSatiri[]>();
  for (const t of teklifler) {
    const anahtar = kok(t);
    const liste = gruplar.get(anahtar);
    if (liste) liste.push(t);
    else gruplar.set(anahtar, [t]);
  }

  const surecler: Surec[] = [];
  for (const rows of gruplar.values()) {
    /* Sıra `revision_no` ile: satırların geliş sırasına güvenilemez
       ve `sent_at` gönderilmemiş revizyonda boş. */
    const sirali = [...rows].sort((a, b) => a.revision_no - b.revision_no);
    const gonderilenler = sirali.filter((r) => r.sent_at);
    const sonGonderilen = gonderilenler.at(-1) ?? null;
    const sonRevizyon = sirali.at(-1)!;

    const kabulEdilen = sirali.find((r) => etkinTeklifDurumu(r.status, r.archive_reason) === "accepted");
    const durum = kabulEdilen ? "accepted" : etkinTeklifDurumu(sonRevizyon.status, sonRevizyon.archive_reason);

    /* Yanıt süresi, yanıtı ALAN revizyonun kendi gönderiminden
       ölçülüyor: ilk gönderimden ölçmek, araya giren revizyonların
       süresini de müşterinin yanıt süresine yazmak olurdu. */
    const yanitlanan = [...sirali].reverse().find((r) => r.responded_at ?? r.customer_responded_at);
    const yanitAni = yanitlanan?.responded_at ?? yanitlanan?.customer_responded_at ?? null;
    const yanitGun = yanitlanan?.sent_at && yanitAni
      ? Math.max(0, gunFarki(gunAnahtari(yanitlanan.sent_at), gunAnahtari(yanitAni)))
      : null;

    surecler.push({
      rows: sirali,
      sonGonderim: sonGonderilen?.sent_at ?? null,
      tutar: Number((sonGonderilen ?? sonRevizyon).amount),
      durum,
      yanitGun,
      musteriKarari: sirali.some((r) => Boolean(r.customer_responded_at)),
    });
  }

  /* Dönemin süreçleri: müşteriye GÖNDERİLMİŞ ve gönderimi aralıkta
     olanlar. Taslak bir kaydı "verilen teklif" saymak, dönüşüm
     oranının paydasını şişirirdi. */
  const donemSurecleri = surecler.filter((s) => s.sonGonderim && aralikta(s.sonGonderim));

  const dagilimHaritasi = new Map<TeklifDurumu, { adet: number; tutar: number }>();
  let kabul = 0;
  let kabulTutar = 0;
  let red = 0;
  let sureGecti = 0;
  let yanitBekleyen = 0;
  let musteriKarari = 0;
  let revizeSurec = 0;
  const yanitGunleri: number[] = [];
  let revizyonToplami = 0;

  for (const s of donemSurecleri) {
    const mevcut = dagilimHaritasi.get(s.durum) ?? { adet: 0, tutar: 0 };
    dagilimHaritasi.set(s.durum, { adet: mevcut.adet + 1, tutar: mevcut.tutar + s.tutar });
    if (s.durum === "accepted") { kabul += 1; kabulTutar += s.tutar; }
    else if (s.durum === "rejected") red += 1;
    else if (s.durum === "expired") sureGecti += 1;
    else if (s.durum === "sent") yanitBekleyen += 1;
    if (s.musteriKarari) musteriKarari += 1;
    if (s.rows.length > 1) revizeSurec += 1;
    revizyonToplami += s.rows.length;
    if (s.yanitGun !== null) yanitGunleri.push(s.yanitGun);
  }

  const surecAdet = donemSurecleri.length;
  const surecTutar = donemSurecleri.reduce((t, s) => t + s.tutar, 0);

  const dagilim: DurumPayi[] = [...dagilimHaritasi.entries()]
    .map(([durum, v]) => ({ durum, ad: TEKLIF_DURUM_ADI[durum], ...v, pay: payi(v.adet, surecAdet) }))
    .sort((a, b) => b.adet - a.adet || a.ad.localeCompare(b.ad, "tr"));

  // --- Sözleşme akışı ---
  const gonderilenSozlesme = sozlesmeler.filter((c) => c.sent_at && aralikta(c.sent_at)).length;
  const imzalananlar = sozlesmeler.filter((c) => ["signed", "completed"].includes(c.status) && aralikta(c.signed_at ?? c.created_at));
  const imzaGunleri = imzalananlar
    .filter((c) => c.sent_at && c.signed_at)
    .map((c) => Math.max(0, gunFarki(gunAnahtari(c.sent_at!), gunAnahtari(c.signed_at!))));

  /* İMZA BEKLEYEN ŞU ANKİ DURUM, dönem süzgecinden geçmiyor: iki ay
     önce gönderilip hâlâ imzalanmamış bir sözleşme bu ayın raporunda
     da görünmeli. */
  const bekleyenler: BekleyenImza[] = sozlesmeler
    .filter((c) => c.status === "sent")
    .map((c) => {
      const gonderimGun = c.sent_at ? gunAnahtari(c.sent_at) : null;
      return {
        id: c.id,
        no: c.contract_no,
        musteri: (c.opportunity_id ? musteriAdi.get(c.opportunity_id) : null) ?? "—",
        baslik: c.title,
        tutar: Number(c.amount),
        gonderimGun,
        beklemeGun: gonderimGun ? Math.max(0, gunFarki(gonderimGun, bugun)) : null,
        /* "Müşteri açtı mı" gerçek veri (first_viewed_at, view_count)
           ve kararı değiştiriyor: açılmamış bir sözleşme için
           hatırlatma, açılıp imzalanmamış için telefon gerekir. */
        goruldu: Boolean(c.first_viewed_at),
        goruntuleme: Number(c.view_count ?? 0),
      };
    })
    .sort((a, b) => (b.beklemeGun ?? -1) - (a.beklemeGun ?? -1) || b.tutar - a.tutar);

  const aktifler = sozlesmeler.filter((c) => c.status === "signed");

  return {
    surecAdet,
    surecTutar,
    kabul,
    kabulTutar,
    red,
    sureGecti,
    yanitBekleyen,
    donusum: surecAdet ? (kabul / surecAdet) * 100 : null,
    ortYanitGun: ortalama(yanitGunleri),
    musteriKarari,
    revizeSurec,
    ortRevizyon: surecAdet ? Math.round((revizyonToplami / surecAdet) * 10) / 10 : null,
    dagilim,
    gonderilenSozlesme,
    imzalananSozlesme: imzalananlar.length,
    imzalananTutar: imzalananlar.reduce((t, c) => t + Number(c.amount), 0),
    ortImzaGun: ortalama(imzaGunleri),
    bekleyenler: bekleyenler.slice(0, 20),
    bekleyenTutar: bekleyenler.reduce((t, b) => t + b.tutar, 0),
    aktifAdet: aktifler.length,
    aktifTutar: aktifler.reduce((t, c) => t + Number(c.amount), 0),
  };
}

/* ---------- Excel ---------- */
const lira = (kurus: number) => kurus / 100;
const para = (kurus: number) => ({ deger: lira(kurus), bicim: "para" as const });
const sayi = (deger: number) => ({ deger, bicim: "sayi" as const });
const oran = (yuzde: number | null) => ({ deger: yuzde === null ? null : yuzde / 100, bicim: "yuzde" as const });

export function teklifSayfalari({ model, donemEtiket }: { model: TeklifModeli; donemEtiket: string }) {
  return [
    {
      ad: "Özet",
      sutunlar: [{ baslik: "Ölçüt", genislik: 38 }, { baslik: "Değer", genislik: 18 }],
      satirlar: [
        ["Dönem", donemEtiket],
        ["Gönderilen teklif süreci", sayi(model.surecAdet)],
        ["Gönderilen teklif tutarı", para(model.surecTutar)],
        ["Kabul edilen", sayi(model.kabul)],
        ["Kabul edilen tutar", para(model.kabulTutar)],
        ["Reddedilen", sayi(model.red)],
        ["Süresi geçen", sayi(model.sureGecti)],
        ["Hâlâ yanıt bekleyen", sayi(model.yanitBekleyen)],
        ["Teklif → kabul dönüşümü", oran(model.donusum)],
        ["Ortalama yanıt süresi (gün)", model.ortYanitGun === null ? null : sayi(model.ortYanitGun)],
        ["Kararı müşterinin verdiği süreç", sayi(model.musteriKarari)],
        ["Revize edilen süreç", sayi(model.revizeSurec)],
        ["Süreç başına ortalama revizyon", model.ortRevizyon === null ? null : sayi(model.ortRevizyon)],
        ["Gönderilen sözleşme", sayi(model.gonderilenSozlesme)],
        ["İmzalanan sözleşme", sayi(model.imzalananSozlesme)],
        ["İmzalanan sözleşme tutarı", para(model.imzalananTutar)],
        ["Ortalama imza süresi (gün)", model.ortImzaGun === null ? null : sayi(model.ortImzaGun)],
        ["İmza bekleyen sözleşme tutarı (şu an)", para(model.bekleyenTutar)],
        ["Devam eden sözleşme", sayi(model.aktifAdet)],
        ["Devam eden sözleşme tutarı", para(model.aktifTutar)],
      ] as Hucre[][],
    },
    {
      ad: "Teklif durumları",
      sutunlar: [
        { baslik: "Durum", genislik: 22 },
        { baslik: "Süreç", bicim: "sayi" as const, genislik: 10 },
        { baslik: "Tutar", bicim: "para" as const, genislik: 18 },
        { baslik: "Pay", bicim: "yuzde" as const, genislik: 10 },
      ],
      satirlar: model.dagilim.map((d) => [d.ad, d.adet, lira(d.tutar), d.pay === null ? null : d.pay / 100]),
    },
    {
      ad: "İmza bekleyenler",
      sutunlar: [
        { baslik: "Sözleşme no", genislik: 18 },
        { baslik: "Müşteri", genislik: 26 },
        { baslik: "Konu", genislik: 32 },
        { baslik: "Tutar", bicim: "para" as const, genislik: 18 },
        { baslik: "Gönderim", bicim: "tarih" as const, genislik: 14 },
        { baslik: "Bekleme (gün)", bicim: "sayi" as const, genislik: 14 },
        { baslik: "Müşteri açtı mı", genislik: 16 },
      ],
      satirlar: model.bekleyenler.map((b) => [
        b.no, b.musteri, b.baslik, lira(b.tutar), b.gonderimGun, b.beklemeGun,
        b.goruldu ? `Evet (${b.goruntuleme} görüntüleme)` : "Hayır",
      ]),
    },
  ];
}
