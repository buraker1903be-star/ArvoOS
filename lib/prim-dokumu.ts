import { inPeriod, type AccrualRow } from "@/lib/commission-accruals";
import { employeeLedger, ledgerTotals, type CommissionPayment, type LedgerMovement } from "@/lib/commission-ledger";
import { gunDonemde, primDonemiYazisi, type PrimDonemi } from "@/lib/prim-donemi";
import { baglanmamisKisim, beklenenPrimler, isKapandi, isPrimleri, type BeklenenGirdi, type IsPrimi, type PrimDagitimi } from "@/lib/prim-is-dagilimi";
import type { Hucre, Sayfa } from "@/lib/xlsx";

/*
  PRİM DÖKÜMÜ (29.10.2026) — saf.

  Prim penceresinin üç kartı (Dönem özeti, Hareket dökümü, İş bazında
  prim), kartların açtığı ayrıntı pencereleri, Excel dosyası ve PDF
  sayfası AYNI dökümden çiziliyor. Hesap eskiden pencerenin içinde
  yazılıydı; dışa aktarma ikinci bir kopya isteseydi ekranda bir rakam,
  dosyada başka bir rakam görmenin en kısa yolu olurdu
  (finans raporlarının indirme rotası da aynı kuralla yazıldı).

  Testi tests/unit/prim-dokumu.test.ts.
*/

export type PrimGirdisi = {
  accruals: AccrualRow[];
  payments: CommissionPayment[];
  dagitimlar: PrimDagitimi[];
  dagitimAcik: boolean;
  beklenenGirdisi: (employeeId: string) => BeklenenGirdi | null;
};

export const PRIM_BOLUMLERI = {
  ozet: "Dönem özeti",
  hareket: "Hareket dökümü",
  is: "İş bazında prim",
} as const;
export type PrimBolumu = keyof typeof PRIM_BOLUMLERI;
export const primBolumuMu = (deger: unknown): deger is PrimBolumu => typeof deger === "string" && deger in PRIM_BOLUMLERI;

export type PrimDokumu = ReturnType<typeof primDokumu>;

export function primDokumu(girdi: PrimGirdisi, employeeId: string, donem: PrimDonemi) {
  const { accruals, payments, dagitimlar, dagitimAcik, beklenenGirdisi } = girdi;
  const toplam = ledgerTotals(employeeId, accruals, payments);
  // Yürüyen bakiye tüm geçmişten hesaplanır, süzgeç ondan SONRA uygulanır:
  // önce süzülseydi her dönemin bakiyesi sıfırdan başlardı.
  const hareketler: LedgerMovement[] = employeeLedger(employeeId, accruals, payments).filter((h) => gunDonemde(h.date, donem)).reverse();
  const donemTahakkuku = accruals.filter((row) => row.employeeId === employeeId && (!donem || inPeriod(row, donem)));
  const satis = donemTahakkuku.filter((row) => row.type === "Satış");
  const operasyon = donemTahakkuku.filter((row) => row.type === "Operasyon");
  const satisToplam = satis.reduce((sum, row) => sum + row.amount, 0);
  const operasyonToplam = operasyon.reduce((sum, row) => sum + row.amount, 0);
  const donemOdemeleri = payments.filter((p) => p.employeeId === employeeId && gunDonemde(p.paidOn, donem));
  const donemOdemesi = donemOdemeleri.reduce((sum, p) => sum + p.amount, 0);

  /* İş bazında prim (lib/prim-is-dagilimi): ödemenin hangi işlere
     istinaden yapıldığı. Bakiye yine toplamdan. Dağıtım okunamadıysa
     liste boş; "okunamadı" "iş yok" sayılmasın diye dagitimAcik ayrı. */
  const beklenen = beklenenGirdisi(employeeId);
  const isler: IsPrimi[] = dagitimAcik ? isPrimleri(employeeId, accruals, payments, dagitimlar, beklenen ? beklenenPrimler(beklenen, accruals) : []) : [];
  const acikIsler = isler.filter((is) => !isKapandi(is));
  const kapananIsler = isler.filter(isKapandi);
  const isAdi = new Map(isler.map((is) => [is.contractId, is.reference]));
  const odemeById = new Map(payments.filter((p) => p.employeeId === employeeId).map((p) => [p.id, p]));

  /** Bir ödemenin işlere dağılımı, okunur metin; dağıtılmamışsa null. */
  const dagilimYazisi = (odemeId: string, para: (kurus: number) => string) => {
    const odeme = odemeById.get(odemeId);
    const kalemler = dagitimlar.filter((d) => d.paymentId === odemeId && d.contractId);
    if (!odeme || !kalemler.length) return null;
    const bagsiz = baglanmamisKisim(odeme, dagitimlar);
    return kalemler.map((d) => `${isAdi.get(d.contractId as string) ?? "İş"} ${para(d.amount)}`).join(" + ") + (bagsiz ? ` + işe bağlanmamış ${para(bagsiz)}` : "");
  };

  return {
    toplam,
    donem,
    donemYazisi: donem ? primDonemiYazisi(donem) : "Tüm zamanlar",
    ozet: {
      satisToplam, satisAdet: satis.length,
      operasyonToplam, operasyonAdet: operasyon.length,
      hakEdis: satisToplam + operasyonToplam,
      donemOdemesi, odemeAdet: donemOdemeleri.length,
    },
    hareketler,
    isler, acikIsler, kapananIsler,
    acikPrim: acikIsler.reduce((sum, is) => sum + Math.max(0, is.acik), 0),
    dagitimAcik,
    odemeById,
    dagilimYazisi,
  };
}

/* Excel: para kuruştan liraya, biçim hücrede (lib/xlsx: toplam alınabilsin). */
const para = (kurus: number) => ({ deger: kurus / 100, bicim: "para" as const });
const tlYazi = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);

const hareketTuru = (h: LedgerMovement) => (h.kind === "payment" ? "Ödeme" : h.title.startsWith("Satış") ? "Satış primi" : "Operasyon primi");

/** İstenen bölümün (ya da üçünün) Excel sayfaları. Başlık satırları dosyayı açanın neye baktığını söylesin. */
export function primSayfalari(d: PrimDokumu, bolum: PrimBolumu | "hepsi", kisi: string): Sayfa[] {
  const sayfalar: Sayfa[] = [];
  if (bolum === "hepsi" || bolum === "ozet") {
    sayfalar.push({
      ad: "Dönem özeti",
      sutunlar: [{ baslik: "Ölçüt", genislik: 34 }, { baslik: "Değer", genislik: 20 }],
      satirlar: [
        ["Personel", kisi],
        ["Dönem", d.donemYazisi],
        ["Satış primi", para(d.ozet.satisToplam)],
        ["Satış primi — tahsilat adedi", { deger: d.ozet.satisAdet, bicim: "sayi" }],
        ["Operasyon primi", para(d.ozet.operasyonToplam)],
        ["Operasyon primi — iş adedi", { deger: d.ozet.operasyonAdet, bicim: "sayi" }],
        ["Dönemde hak ediş", para(d.ozet.hakEdis)],
        ["Dönemde ödenen", para(d.ozet.donemOdemesi)],
        ["Hak edilen (tüm zamanlar)", para(d.toplam.accrued)],
        ["Ödenen (tüm zamanlar)", para(d.toplam.paid)],
        ["Ödenecek bakiye", para(d.toplam.balance)],
      ] as Hucre[][],
    });
  }
  if (bolum === "hepsi" || bolum === "hareket") {
    sayfalar.push({
      ad: "Hareket dökümü",
      sutunlar: [
        { baslik: "Tarih", bicim: "tarih", genislik: 12 },
        { baslik: "Tür", genislik: 16 },
        { baslik: "Açıklama", genislik: 40 },
        { baslik: "Ayrıntı", genislik: 40 },
        { baslik: "Hak ediş", bicim: "para", genislik: 15 },
        { baslik: "Ödeme", bicim: "para", genislik: 15 },
        { baslik: "Bakiye", bicim: "para", genislik: 15 },
      ],
      satirlar: d.hareketler.map((h) => [
        h.date, hareketTuru(h), h.title,
        [h.detail, h.kind === "payment" ? d.dagilimYazisi(h.id, tlYazi) : null].filter(Boolean).join(" · ") || null,
        h.kind === "payment" ? null : para(h.accrual),
        h.kind === "payment" ? para(h.payment) : null,
        para(h.balance),
      ]),
    });
  }
  if ((bolum === "hepsi" || bolum === "is") && d.dagitimAcik) {
    sayfalar.push({
      ad: "İş bazında prim",
      sutunlar: [
        { baslik: "İş", genislik: 18 },
        { baslik: "Müşteri", genislik: 28 },
        { baslik: "Durum", genislik: 12 },
        { baslik: "Satış primi", bicim: "para", genislik: 15 },
        { baslik: "Operasyon primi", bicim: "para", genislik: 15 },
        { baslik: "Hak edilen", bicim: "para", genislik: 15 },
        { baslik: "Ödenen", bicim: "para", genislik: 15 },
        { baslik: "Açık prim", bicim: "para", genislik: 15 },
        { baslik: "Hak edilecek (tahmini)", bicim: "para", genislik: 20 },
      ],
      satirlar: d.isler.map((is) => [
        is.reference, is.customer, isKapandi(is) ? "Kapandı" : is.devam ? "İş sürüyor" : "Açık",
        para(is.satis), para(is.operasyon), para(is.hakEdilen), para(is.odenen), para(is.acik), is.beklenen > 0 ? para(is.beklenen) : null,
      ]),
    });
  }
  return sayfalar;
}
