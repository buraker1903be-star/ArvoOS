import type { AccrualRow } from "./commission-accruals";
import type { CommissionPayment } from "./commission-ledger";

/*
  PRİM ÖDEMESİNİN İŞLERE DAĞILIMI (12.10.2026).

  Ödeme girilirken hangi işlerin (sözleşmelerin) primine karşılık
  olduğu seçilebiliyor; eskiden bu açıklama alanına elle yazılıyordu
  ("SOZ-2026-000005 3.140 TL + SOZ-2026-000030 500 TL").

  Dağıtım İSTEĞE BAĞLI ve kısmi olabilir: dağıtılmayan kısım "işe
  bağlanmamış" kalır. Personelin BAKİYESİ yine toplamdan
  (lib/commission-ledger): tek havaleyle on iki işin primini ödeyen
  kurumu satır satır eşleştirmeye zorlamıyoruz. Bu modül yalnızca iş
  başına "hak edilen / ödenen / açık" gösterir.

  Veritabanı tarafı: hr_commission_payment_allocations,
  arvo_prim_odemesi_dagit (20261012115936). Saf modül; testi
  tests/unit/prim-is-dagilimi.test.ts.
*/

export type PrimDagitimi = { paymentId: string; contractId: string | null; amount: number };

export type IsPrimi = {
  contractId: string;
  /** Sözleşme numarası (iade satırının "· iade" eki atılmış). */
  reference: string;
  customer: string;
  satis: number;
  operasyon: number;
  /** satis + operasyon (iadeler düşülmüş). */
  hakEdilen: number;
  /** Bu işe dağıtılmış ödemeler. */
  odenen: number;
  /** hakEdilen − odenen; negatifse işe fazla dağıtılmış. */
  acik: number;
  /** En son prim hareketinin günü; sıralama için. */
  sonTarih: string;
};

const temizReferans = (reference: string) => reference.replace(/ · iade$/, "");

/** Personelin iş başına primi. Sözleşmesiz operasyon primleri (contractId yok) burada yer almaz; bakiyede vardır. */
export function isPrimleri(employeeId: string, accruals: AccrualRow[], payments: CommissionPayment[], dagitimlar: PrimDagitimi[]): IsPrimi[] {
  const isler = new Map<string, IsPrimi>();
  for (const row of accruals) {
    if (row.employeeId !== employeeId || !row.contractId) continue;
    const gun = row.date.slice(0, 10);
    const is = isler.get(row.contractId) ?? {
      contractId: row.contractId, reference: temizReferans(row.reference), customer: row.customer,
      satis: 0, operasyon: 0, hakEdilen: 0, odenen: 0, acik: 0, sonTarih: gun,
    };
    if (row.type === "Satış") is.satis += row.amount; else is.operasyon += row.amount;
    is.hakEdilen += row.amount;
    if (gun > is.sonTarih) is.sonTarih = gun;
    isler.set(row.contractId, is);
  }
  const personelinOdemeleri = new Set(payments.filter((p) => p.employeeId === employeeId).map((p) => p.id));
  for (const d of dagitimlar) {
    if (!d.contractId || !personelinOdemeleri.has(d.paymentId)) continue;
    const is = isler.get(d.contractId);
    if (is) is.odenen += d.amount;
  }
  return [...isler.values()]
    .map((is) => ({ ...is, acik: is.hakEdilen - is.odenen }))
    .sort((a, b) => b.acik - a.acik || b.sonTarih.localeCompare(a.sonTarih));
}

/** Ödemenin işlere dağıtılmamış kısmı (silinmiş sözleşmeye dağıtılan da bağsız sayılır). */
export function baglanmamisKisim(odeme: CommissionPayment, dagitimlar: PrimDagitimi[]): number {
  const dagitilan = dagitimlar.filter((d) => d.paymentId === odeme.id && d.contractId).reduce((t, d) => t + d.amount, 0);
  return Math.max(0, odeme.amount - dagitilan);
}

export type DagitimKalemi = { contractId: string; amount: number };

/**
 * Sunucu ve form aynı kuralla denetler. `izinliIsler`: personelin primi
 * olan işler — başka bir personelin işine ödeme dağıtılamaz.
 */
export function dagitimDenetle(tutar: number, kalemler: DagitimKalemi[], izinliIsler: ReadonlySet<string>): string | null {
  const gorulen = new Set<string>();
  let toplam = 0;
  for (const k of kalemler) {
    if (!Number.isInteger(k.amount) || k.amount <= 0) return "Her işe dağıtılan tutar sıfırdan büyük olmalı.";
    if (!izinliIsler.has(k.contractId)) return "Seçilen iş bu personelin primleri arasında yok.";
    if (gorulen.has(k.contractId)) return "Aynı iş iki kez seçilmiş.";
    gorulen.add(k.contractId);
    toplam += k.amount;
  }
  if (toplam > tutar) return "İşlere dağıtılan tutar ödemenin kendisinden büyük olamaz.";
  return null;
}

/** Formdan gelen JSON: [{contract_id, amount}] (kuruş). Bozuksa boş değil HATA — sessizce dağıtımsız kaydetmesin. */
export function dagitimOku(ham: string): DagitimKalemi[] | { hata: string } {
  if (!ham.trim()) return [];
  try {
    const veri: unknown = JSON.parse(ham);
    if (!Array.isArray(veri)) return { hata: "Dağıtım listesi okunamadı." };
    return veri.map((k) => ({ contractId: String((k as { contract_id?: unknown }).contract_id ?? ""), amount: Number((k as { amount?: unknown }).amount) }));
  } catch {
    return { hata: "Dağıtım listesi okunamadı." };
  }
}
