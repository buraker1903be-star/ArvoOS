// Satış primi için bir müşterinin ödemelerini sözleşmelerine dağıtır.
//
// Eskiden bir müşterinin TÜM tahsilatları o müşterinin en yeni imzalı
// sözleşmesine (ve onun satışçısına) yazılıyordu: A'yı Ali, sonra B'yi
// Ayşe sattıysa Ali'nin tahsilatlarının primi Ayşe'ye gidiyordu. İadeler
// de düşülmüyordu.
//
// Kural: ödemeler tarih sırasıyla, sözleşmelere en eskiden başlayarak
// kalan tutarları kadar dağıtılır (taksit kapatmayla aynı sıra); tüm
// sözleşmeleri aşan fazla ödeme en yeni sözleşmeye yazılır. İade, en son
// dağıtılan parçadan geriye doğru düşülür ve negatif parça olarak döner.

export type AllocationContract = { id: string; amount: number; order: string };
export type AllocationEvent = { id: string; kind: "payment" | "refund"; amount: number; date: string };
export type AllocationPiece = { eventId: string; contractId: string; amount: number; date: string };

export function allocateCollections(
  contracts: AllocationContract[],
  events: AllocationEvent[],
): AllocationPiece[] {
  const ordered = [...contracts].sort((a, b) => a.order.localeCompare(b.order) || a.id.localeCompare(b.id));
  if (!ordered.length) return [];
  const remaining = new Map(ordered.map((contract) => [contract.id, Math.max(0, Math.round(contract.amount))]));
  const allocated: { contractId: string; amount: number }[] = [];
  const pieces: AllocationPiece[] = [];
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  for (const event of sortedEvents) {
    let left = Math.max(0, Math.round(event.amount));
    if (event.kind === "payment") {
      for (const contract of ordered) {
        if (!left) break;
        const room = remaining.get(contract.id) ?? 0;
        if (!room) continue;
        const take = Math.min(room, left);
        remaining.set(contract.id, room - take);
        left -= take;
        allocated.push({ contractId: contract.id, amount: take });
        pieces.push({ eventId: event.id, contractId: contract.id, amount: take, date: event.date });
      }
      if (left) {
        const newest = ordered[ordered.length - 1];
        allocated.push({ contractId: newest.id, amount: left });
        pieces.push({ eventId: event.id, contractId: newest.id, amount: left, date: event.date });
      }
    } else {
      while (left && allocated.length) {
        const last = allocated[allocated.length - 1];
        const take = Math.min(last.amount, left);
        last.amount -= take;
        left -= take;
        remaining.set(last.contractId, (remaining.get(last.contractId) ?? 0) + take);
        pieces.push({ eventId: event.id, contractId: last.contractId, amount: -take, date: event.date });
        if (!last.amount) allocated.pop();
      }
    }
  }
  return pieces;
}
