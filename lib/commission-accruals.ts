import { allocateCollections, rateAt, type RateHistoryRow } from "./commission-allocation";

/*
  Prim tahakkukunun saf hesabı: hangi personel, hangi işten, ne kadar prim
  hak etti. İki kaynak var:

    Satış primi — müşterinin ödemeleri sözleşmelerine eskiden yeniye
      dağıtılır (commission-allocation), her parça o sözleşmenin satışçısına
      yazılır. Yani prim tahsilat yapıldıkça doğar; tahsil edilmemiş
      satıştan prim tahakkuk etmez.
    Operasyon primi — iş akışı tamamlanınca hr_operation_commissions'a
      düşer; burada yalnızca okunur.

  Ayrı dosyada, çünkü iki ekran kullanıyor: dönemsel "Prim Hesaplama" ve
  "Prim Hesabı" (cari). Hesabı iki yerde yazmak, birinde iade kuralını
  düzeltip diğerinde unutmak demekti. Testi tests/unit/commission-accruals.test.ts.
*/

export type AccrualEmployee = { id: string; commission_rate: number | string };
export type AccrualOpportunity = { id: string; customer_name: string; assigned_employee_id: string | null };
export type AccrualContract = { id: string; contract_no: string; opportunity_id: string; party_id: string | null; amount: number | string; signed_at: string | null; created_at: string };
export type AccrualOperation = { id: string; employee_id: string; workflow_id: string; contract_id: string | null; base_amount: number | string; commission_rate: number | string; commission_amount: number | string; status: string; accrued_at: string };
export type AccrualCollection = { id: string; party_id: string | null; entry_type: string; amount: number | string; transaction_date: string };

export type AccrualRow = {
  id: string;
  type: "Satış" | "Operasyon";
  employeeId: string;
  customer: string;
  reference: string;
  /** Prim matrahı (iadede negatif). */
  base: number;
  rate: number;
  /** Prim tutarı, kuruş (iadede negatif). */
  amount: number;
  /** Satışta "YYYY-MM-DD", operasyonda ISO damga. */
  date: string;
  status: string;
};

export type AccrualInput = {
  employees: AccrualEmployee[];
  opportunities: AccrualOpportunity[];
  contracts: AccrualContract[];
  operations: AccrualOperation[];
  collections: AccrualCollection[];
  rateHistory: RateHistoryRow[];
};

export function buildAccrualRows({ employees, opportunities, contracts, operations, collections, rateHistory }: AccrualInput): AccrualRow[] {
  const employeeMap = new Map(employees.map((item) => [item.id, item]));
  const opportunityMap = new Map(opportunities.map((item) => [item.id, item]));
  const contractMap = new Map(contracts.map((item) => [item.id, item]));

  const contractsByParty = new Map<string, AccrualContract[]>();
  for (const contract of contracts) {
    if (!contract.party_id) continue;
    contractsByParty.set(contract.party_id, [...(contractsByParty.get(contract.party_id) ?? []), contract]);
  }
  const collectionsByParty = new Map<string, AccrualCollection[]>();
  for (const collection of collections) {
    if (!collection.party_id) continue;
    collectionsByParty.set(collection.party_id, [...(collectionsByParty.get(collection.party_id) ?? []), collection]);
  }

  const salesRows = [...collectionsByParty].flatMap(([partyId, partyCollections]) => {
    const pieces = allocateCollections(
      (contractsByParty.get(partyId) ?? []).map((contract) => ({ id: contract.id, amount: Number(contract.amount), order: contract.signed_at ?? contract.created_at })),
      partyCollections.map((collection) => ({ id: collection.id, kind: collection.entry_type === "credit" ? ("payment" as const) : ("refund" as const), amount: Number(collection.amount), date: collection.transaction_date })),
    );
    return pieces.flatMap((piece) => {
      const contract = contractMap.get(piece.contractId);
      if (!contract) return [];
      const opportunity = opportunityMap.get(contract.opportunity_id);
      const employee = opportunity?.assigned_employee_id ? employeeMap.get(opportunity.assigned_employee_id) : undefined;
      if (!employee) return [];
      // Tahsilat tarihinde geçerli oran; sonradan yapılan oran değişikliği
      // geçmiş tahsilatları etkilemez.
      const rate = rateAt(rateHistory, employee.id, piece.date, Number(employee.commission_rate));
      if (rate <= 0) return [];
      // İade parçalarında piece.amount negatif. JS'te Math.round yarımları
      // +∞ yönüne yuvarladığı için Math.round(5000.5)=5001 ama
      // Math.round(-5000.5)=-5000: ödeme ve tam iadesi birbirini götürmüyor,
      // tamamen iade edilmiş tahsilattan prim tahakkuk ediyordu. Büyüklüğü
      // yuvarlayıp işareti geri koyuyoruz.
      const amount = Math.sign(piece.amount) * Math.round((Math.abs(piece.amount) * rate) / 100);
      return [{
        id: `sale-${piece.eventId}-${piece.contractId}-${piece.amount < 0 ? "iade" : "odeme"}`,
        type: "Satış" as const,
        employeeId: employee.id,
        customer: opportunity?.customer_name || "Müşteri",
        reference: piece.amount < 0 ? `${contract.contract_no} · iade` : contract.contract_no,
        base: piece.amount,
        rate,
        amount,
        date: piece.date,
        status: "accrued",
      }];
    });
  });

  const operationRows = operations.flatMap((item) => {
    if (!employeeMap.has(item.employee_id)) return [];
    const contract = item.contract_id ? contractMap.get(item.contract_id) : undefined;
    const opportunity = contract ? opportunityMap.get(contract.opportunity_id) : undefined;
    return [{
      id: `operation-${item.id}`,
      type: "Operasyon" as const,
      employeeId: item.employee_id,
      customer: opportunity?.customer_name || "Tamamlanan iş",
      reference: contract?.contract_no || `İş ${item.workflow_id.slice(0, 8)}`,
      base: Number(item.base_amount),
      rate: Number(item.commission_rate),
      amount: Number(item.commission_amount),
      date: item.accrued_at,
      status: item.status,
    }];
  });

  return [...salesRows, ...operationRows].sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

/**
 * Tahakkuk satırı verilen dönemde mi (bitiş hariç).
 *
 * İki tür tarih var ve aynı şekilde karşılaştırılamaz: satış primi Türkiye
 * gün anahtarı ("2026-09-01"), operasyon primi ISO damga
 * ("2026-08-31T21:30:00Z" = Türkiye'de 1 Eylül 00:30). Damgayı ilk 10
 * karakterinden kesip gün anahtarıyla kıyaslamak, ayın ilk saatlerinde
 * tahakkuk eden primi bir önceki aya yazardı. Damga damgayla, gün günle.
 */
export function inPeriod(row: AccrualRow, period: { startKey: string; endKey: string; start: Date; end: Date }): boolean {
  if (row.date.length <= 10) return row.date >= period.startKey && row.date < period.endKey;
  const at = Date.parse(row.date);
  return at >= period.start.getTime() && at < period.end.getTime();
}
