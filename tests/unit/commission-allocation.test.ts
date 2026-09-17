import assert from "node:assert/strict";
import test from "node:test";
import { allocateCollections, rateAt } from "@/lib/commission-allocation";

const contract = (id: string, amount: number, order: string) => ({ id, amount, order });
const payment = (id: string, amount: number, date: string) => ({ id, kind: "payment" as const, amount, date });
const refund = (id: string, amount: number, date: string) => ({ id, kind: "refund" as const, amount, date });

test("ödemeler en eski sözleşmeden başlayarak dağıtılır", () => {
  // Gerileme: tüm tahsilatlar en YENİ sözleşmeye yazılıyordu; A'yı satan
  // kişinin primi B'yi satana gidiyordu.
  const pieces = allocateCollections(
    [contract("A", 1000, "2026-01-01"), contract("B", 500, "2026-02-01")],
    [payment("p1", 600, "2026-03-01")],
  );
  assert.deepEqual(pieces, [{ eventId: "p1", contractId: "A", amount: 600, date: "2026-03-01" }]);
});

test("bir ödeme birden fazla sözleşmeye taşabilir", () => {
  const pieces = allocateCollections(
    [contract("A", 1000, "2026-01-01"), contract("B", 500, "2026-02-01")],
    [payment("p1", 1200, "2026-03-01")],
  );
  assert.deepEqual(pieces.map((p) => [p.contractId, p.amount]), [["A", 1000], ["B", 200]]);
});

test("tüm sözleşmeleri aşan fazla ödeme en yeni sözleşmeye yazılır", () => {
  const pieces = allocateCollections(
    [contract("A", 100, "2026-01-01"), contract("B", 100, "2026-02-01")],
    [payment("p1", 500, "2026-03-01")],
  );
  assert.deepEqual(pieces.map((p) => [p.contractId, p.amount]), [["A", 100], ["B", 100], ["B", 300]]);
});

test("iade en son dağıtılan parçadan geriye doğru düşülür", () => {
  // Gerileme: iadeler hiç düşülmüyordu, prim fazla hesaplanıyordu.
  const pieces = allocateCollections(
    [contract("A", 1000, "2026-01-01"), contract("B", 500, "2026-02-01")],
    [payment("p1", 1200, "2026-03-01"), refund("r1", 300, "2026-04-01")],
  );
  const net = new Map<string, number>();
  for (const piece of pieces) net.set(piece.contractId, (net.get(piece.contractId) ?? 0) + piece.amount);
  assert.equal(net.get("B"), 0, "önce en son yazılan B parçası geri alınır");
  assert.equal(net.get("A"), 900);
});

test("iade sözleşmede yer açar, sonraki ödeme oraya gider", () => {
  const pieces = allocateCollections(
    [contract("A", 1000, "2026-01-01")],
    [payment("p1", 1000, "2026-03-01"), refund("r1", 400, "2026-04-01"), payment("p2", 400, "2026-05-01")],
  );
  const total = pieces.reduce((sum, piece) => sum + piece.amount, 0);
  assert.equal(total, 1000);
});

test("olaylar tarih sırasına sokulur, giriş sırası önemsiz", () => {
  const args = [contract("A", 100, "2026-01-01"), contract("B", 100, "2026-02-01")];
  const sirali = allocateCollections(args, [payment("p1", 100, "2026-01-05"), payment("p2", 100, "2026-01-06")]);
  const karisik = allocateCollections(args, [payment("p2", 100, "2026-01-06"), payment("p1", 100, "2026-01-05")]);
  assert.deepEqual(karisik, sirali);
});

test("sözleşme yoksa dağıtım boştur", () => {
  assert.deepEqual(allocateCollections([], [payment("p1", 100, "2026-03-01")]), []);
});

test("rateAt: tahsilat gününde geçerli oran seçilir", () => {
  const history = [
    { employee_id: "e1", commission_rate: 5, valid_from: "2026-01-01T00:00:00+03:00" },
    { employee_id: "e1", commission_rate: 8, valid_from: "2026-06-01T00:00:00+03:00" },
    { employee_id: "e2", commission_rate: 99, valid_from: "2026-01-01T00:00:00+03:00" },
  ];
  assert.equal(rateAt(history, "e1", "2026-03-15", 0), 5);
  assert.equal(rateAt(history, "e1", "2026-07-15", 0), 8);
});

test("rateAt: aynı gün yapılan oran değişikliği o günü kapsar", () => {
  const history = [{ employee_id: "e1", commission_rate: 12, valid_from: "2026-06-01T14:00:00+03:00" }];
  assert.equal(rateAt(history, "e1", "2026-06-01", 3), 12);
  // Ertesi günden sonrası için geçerli, önceki gün için değil.
  assert.equal(rateAt(history, "e1", "2026-05-31", 3), 3);
});

test("rateAt: geçmiş kaydı yoksa bugünkü oran kullanılır", () => {
  assert.equal(rateAt([], "e1", "2026-03-15", 4.5), 4.5);
});
