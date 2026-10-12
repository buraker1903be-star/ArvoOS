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

  ERKEN ÖDEME (avans): prim bazen iş bitmeden ödeniyor. Operasyon primi
  iş tamamlanınca, satış primi tahsilat oldukça hak ediliyor; o ana kadar
  işin "hak edilen"i sıfır. Bu yüzden listede DEVAM EDEN işler de var
  (beklenenPrimler): personelin yürüttüğü açık operasyon işleri ve
  satış temsilcisi olduğu, tahsilatı tamamlanmamış sözleşmeler — yanında
  tahmini "hak edilecek" prim. Erken ödenen tutar işte "avans" görünür;
  prim hak edildikçe ona sayılır.

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
  /** hakEdilen − odenen; negatifse erken ödenmiş (avans). */
  acik: number;
  /** Henüz hak edilmemiş, tahmini kalan prim (iş sürüyor / tahsilat bekleniyor). Kesin değil. */
  beklenen: number;
  /** Personelin yürüttüğü operasyon işi hâlâ açık. */
  devam: boolean;
  /** En son prim hareketinin günü; sıralama için. */
  sonTarih: string;
};

const temizReferans = (reference: string) => reference.replace(/ · iade$/, "");

export type BeklenenIs = { contractId: string; reference: string; customer: string; beklenen: number; devam: boolean };

export type BeklenenGirdi = {
  employeeId: string;
  /** Yüzde (10 = %10). */
  satisOrani: number;
  operasyonOrani: number;
  /** İmzalı sözleşmeler (kuruş). */
  sozlesmeler: { id: string; contract_no: string; opportunity_id: string; amount: number | string }[];
  firsatlar: { id: string; customer_name: string | null; assigned_employee_id: string | null }[];
  /** Açık (tamamlanmamış, iptal edilmemiş) operasyon işleri. */
  acikIsler: { contract_id: string | null; assigned_employee_id: string | null }[];
};

const yuzde = (tutar: number, oran: number) => Math.round((tutar * oran) / 100);

/*
  Henüz hak edilmemiş prim, TAHMİN. Kesin rakam hak edilince
  (lib/commission-accruals ve accrue_operation_commission) oluşur:
  - Satış: sözleşme tutarı × bugünkü satış oranı, eksi şimdiye kadar
    tahsilattan hak edilen satış primi. Oran tahsilat günündeki orandan
    hesaplandığı için kesin rakam biraz farklı olabilir.
  - Operasyon: personelin yürüttüğü AÇIK iş için sözleşme tutarı ×
    bugünkü operasyon oranı (iş tamamlanınca aynı formülle hak edilir).
*/
export function beklenenPrimler(g: BeklenenGirdi, accruals: AccrualRow[]): BeklenenIs[] {
  const firsat = new Map(g.firsatlar.map((f) => [f.id, f]));
  const sozlesme = new Map(g.sozlesmeler.map((s) => [s.id, s]));
  const satisHakEdilen = new Map<string, number>();
  for (const a of accruals) {
    if (a.employeeId === g.employeeId && a.type === "Satış" && a.contractId) satisHakEdilen.set(a.contractId, (satisHakEdilen.get(a.contractId) ?? 0) + a.amount);
  }
  const sonuc = new Map<string, BeklenenIs>();
  const ekle = (sId: string, tutar: number, devam: boolean) => {
    const s = sozlesme.get(sId);
    if (!s) return;
    const onceki = sonuc.get(sId);
    sonuc.set(sId, {
      contractId: sId, reference: s.contract_no, customer: firsat.get(s.opportunity_id)?.customer_name || "Müşteri",
      beklenen: (onceki?.beklenen ?? 0) + tutar, devam: Boolean(onceki?.devam) || devam,
    });
  };
  if (g.satisOrani > 0) {
    for (const s of g.sozlesmeler) {
      if (firsat.get(s.opportunity_id)?.assigned_employee_id !== g.employeeId) continue;
      const kalan = yuzde(Number(s.amount), g.satisOrani) - (satisHakEdilen.get(s.id) ?? 0);
      if (kalan > 0) ekle(s.id, kalan, false);
    }
  }
  if (g.operasyonOrani > 0) {
    for (const is of g.acikIsler) {
      if (is.assigned_employee_id !== g.employeeId || !is.contract_id) continue;
      const s = sozlesme.get(is.contract_id);
      if (s) ekle(s.id, yuzde(Number(s.amount), g.operasyonOrani), true);
    }
  }
  return [...sonuc.values()];
}

/** Personelin iş başına primi. Sözleşmesiz operasyon primleri (contractId yok) burada yer almaz; bakiyede vardır. */
export function isPrimleri(employeeId: string, accruals: AccrualRow[], payments: CommissionPayment[], dagitimlar: PrimDagitimi[], beklenenler: BeklenenIs[] = []): IsPrimi[] {
  const isler = new Map<string, IsPrimi>();
  for (const row of accruals) {
    if (row.employeeId !== employeeId || !row.contractId) continue;
    const gun = row.date.slice(0, 10);
    const is = isler.get(row.contractId) ?? {
      contractId: row.contractId, reference: temizReferans(row.reference), customer: row.customer,
      satis: 0, operasyon: 0, hakEdilen: 0, odenen: 0, acik: 0, beklenen: 0, devam: false, sonTarih: gun,
    };
    if (row.type === "Satış") is.satis += row.amount; else is.operasyon += row.amount;
    is.hakEdilen += row.amount;
    if (gun > is.sonTarih) is.sonTarih = gun;
    isler.set(row.contractId, is);
  }
  for (const b of beklenenler) {
    const is = isler.get(b.contractId) ?? {
      contractId: b.contractId, reference: b.reference, customer: b.customer,
      satis: 0, operasyon: 0, hakEdilen: 0, odenen: 0, acik: 0, beklenen: 0, devam: false, sonTarih: "",
    };
    is.beklenen += b.beklenen;
    is.devam = is.devam || b.devam;
    isler.set(b.contractId, is);
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

/*
  KAPANAN İŞ (12.10.2026): primi hak edilmiş ve tamamı ödenmiş, iş de
  sürmüyor, hak edilecek bir şey kalmamış. Prim penceresinde bunlar
  "Arşiv" sekmesine iniyor; açık listede yalnızca takip edilecekler kalıyor.
  Avanslı (acik < 0) ve hâlâ prim doğacak iş kapanmış sayılmaz.
*/
export function isKapandi(is: IsPrimi): boolean {
  return is.hakEdilen > 0 && is.acik === 0 && is.beklenen <= 0 && !is.devam;
}
