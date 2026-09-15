// Müşteri cari bakiyeleri. Cari Hesaplar sekmesi ile Finans genel bakış aynı
// kuralla hesaplasın diye tek yerde (eskiden finance/page.tsx içindeydi).
//
// Kural: carinin imzalı sözleşmesi varsa borç = sözleşme toplamı + "Ek
// hizmet ·" kayıtları; yoksa defterdeki borç kayıtları (düzeltmeler hariç).
// Tahsilat, borç + iade toplamını aşamaz; bakiye eksiye düşmez.

type EntryLike = { entry_type: string; amount: number; source_type: string | null; description: string; transaction_date: string };
type PartyLike = { id: string; account_entries: EntryLike[] | null };

export function buildAccountBalances<P extends PartyLike>(parties: P[], contracts: { party_id: string | null; amount: number }[]) {
  const contractTotals = new Map<string, number>();
  for (const contract of contracts)
    if (contract.party_id)
      contractTotals.set(contract.party_id, (contractTotals.get(contract.party_id) ?? 0) + Number(contract.amount));

  const accounts = parties.map((party) => {
    const entries = [...(party.account_entries ?? [])].sort((a, b) =>
      b.transaction_date.localeCompare(a.transaction_date),
    ) as NonNullable<P["account_entries"]>;
    const ledgerDebt = entries
      .filter((e) => e.entry_type === "debit" && e.source_type !== "adjustment")
      .reduce((s, e) => s + Number(e.amount), 0);
    const additionalServices = entries
      .filter((e) => e.entry_type === "debit" && e.source_type === "manual" && e.description.startsWith("Ek hizmet ·"))
      .reduce((s, e) => s + Number(e.amount), 0);
    const debt = contractTotals.has(party.id)
      ? (contractTotals.get(party.id) ?? 0) + additionalServices
      : ledgerDebt;
    const recordedCollections = entries
      .filter((e) => e.entry_type === "credit")
      .reduce((s, e) => s + Number(e.amount), 0);
    const refunds = entries
      .filter((e) => e.entry_type === "debit" && e.source_type === "adjustment")
      .reduce((s, e) => s + Number(e.amount), 0);
    const collections = Math.min(recordedCollections, debt + refunds);
    return {
      ...party,
      entries,
      debt,
      collections,
      refunds,
      balance: Math.max(0, debt + refunds - collections),
    };
  });

  const totals = accounts.reduce(
    (r, a) => ({
      debt: r.debt + a.debt,
      collections: r.collections + a.collections,
      refunds: r.refunds + a.refunds,
      balance: r.balance + a.balance,
    }),
    { debt: 0, collections: 0, refunds: 0, balance: 0 },
  );

  return { accounts, totals };
}
