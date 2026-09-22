import type { AccrualRow } from "./commission-accruals";

/*
  Prim cari hesabı: bir tarafta hak edilen primler (tahakkuk), diğer tarafta
  yapılan ödemeler, aradaki fark bakiye. Cari hesaplarla aynı okuma biçimi.

  Ödeme tek tek prim satırına bağlanmaz. "Ahmet'e bu ay 8.000 ₺ ödedim" tek
  satırdır; hangi primleri kapattığı bakiyeden okunur. Satır satır
  eşleştirme, 12 satırlık primi tek havaleyle ödeyince kullanılamaz hale
  geliyordu.

  Saf modül; testi tests/unit/commission-ledger.test.ts.
*/

export type CommissionPayment = {
  id: string;
  employeeId: string;
  /** Kuruş, her zaman pozitif. */
  amount: number;
  /** "YYYY-MM-DD" (Türkiye). */
  paidOn: string;
  method: string;
  note: string | null;
};

export type LedgerTotals = {
  /** Bugüne kadar hak edilen (iadeler düşülmüş). */
  accrued: number;
  paid: number;
  /** Personele olan borç; negatifse fazla ödeme yapılmış. */
  balance: number;
};

export type LedgerMovement = {
  id: string;
  /** Sıralama ve gösterim için gün anahtarı. */
  date: string;
  kind: "accrual" | "payment";
  title: string;
  detail: string;
  /** Hak ediş (iadede negatif), yoksa 0. */
  accrual: number;
  /** Ödeme, yoksa 0. */
  payment: number;
  /** O harekete kadarki bakiye. */
  balance: number;
};

const METHOD_NAMES: Record<string, string> = {
  havale: "Havale / EFT", nakit: "Nakit", mahsup: "Mahsup", diger: "Diğer",
};
export const methodName = (value: string) => METHOD_NAMES[value] ?? "Ödeme";

/**
 * Sıralama anahtarı. Tahakkuk tarihi iki biçimde geliyor: satış priminde
 * gün anahtarı, operasyon priminde ISO damga. Gün anahtarını Türkiye gece
 * yarısı sayıyoruz; UTC saysaydık aynı günün sabah tahakkuku ödemeden önce
 * değil sonra görünürdü.
 */
const sortKey = (date: string) => Date.parse(date.length <= 10 ? `${date}T00:00:00+03:00` : date);

/** Gösterim için Türkiye gün anahtarı. */
export const dayKey = (date: string) =>
  date.length <= 10 ? date : new Date(date).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });

export function ledgerTotals(employeeId: string, accruals: AccrualRow[], payments: CommissionPayment[]): LedgerTotals {
  const accrued = accruals.filter((row) => row.employeeId === employeeId).reduce((sum, row) => sum + row.amount, 0);
  const paid = payments.filter((row) => row.employeeId === employeeId).reduce((sum, row) => sum + row.amount, 0);
  return { accrued, paid, balance: accrued - paid };
}

/** Personelin hareket dökümü: eskiden yeniye, yürüyen bakiyeyle. */
export function employeeLedger(employeeId: string, accruals: AccrualRow[], payments: CommissionPayment[]): LedgerMovement[] {
  const hareketler = [
    ...accruals.filter((row) => row.employeeId === employeeId).map((row) => ({
      id: row.id,
      sort: sortKey(row.date),
      date: dayKey(row.date),
      kind: "accrual" as const,
      title: row.amount < 0 ? `${row.type} primi iadesi` : `${row.type} primi`,
      detail: `${row.customer} · ${row.reference}`,
      accrual: row.amount,
      payment: 0,
    })),
    ...payments.filter((row) => row.employeeId === employeeId).map((row) => ({
      id: row.id,
      sort: sortKey(row.paidOn),
      date: row.paidOn,
      kind: "payment" as const,
      title: "Prim ödemesi",
      detail: [methodName(row.method), row.note].filter(Boolean).join(" · "),
      accrual: 0,
      payment: row.amount,
    })),
  ].sort((a, b) => a.sort - b.sort || (a.kind === b.kind ? 0 : a.kind === "accrual" ? -1 : 1));

  let balance = 0;
  return hareketler.map((hareket) => {
    balance += hareket.accrual - hareket.payment;
    // sort alanı yalnızca sıralama içindi; dışarı sızmasın.
    const { sort, ...gosterilen } = hareket;
    void sort;
    return { ...gosterilen, balance };
  });
}
