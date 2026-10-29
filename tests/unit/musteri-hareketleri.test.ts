import assert from "node:assert/strict";
import test from "node:test";
import { hareketSayimi, musteriHareketleri, type HareketGirdisi } from "@/lib/musteri-hareketleri";

const bos: HareketGirdisi = {
  kayitAcildi: null, odemeler: [], proformalar: [], faturalar: [], kurulum: [], konsol: [],
  urunAdi: (k) => (k === "arvolab" ? "ArvoLab" : "ArvoOS"), kurulumIslemi: (k) => k, kurulumAsamasi: (k) => k,
};
const odeme = {
  id: "o1", amount: 150000, currency: "TRY", status: "approved", product: "arvoos", payment_method: "bank_transfer",
  created_at: "2026-10-01T09:00:00Z", reviewed_at: "2026-10-03T10:00:00Z", review_note: null,
};

test("havale iki olay üretir: bildirim ve karar, aralarındaki süre görünsün diye", () => {
  const liste = musteriHareketleri({ ...bos, odemeler: [odeme] });
  assert.deepEqual(liste.map((h) => h.olay), ["Ödeme onaylandı", "Ödeme bildirildi"]);
  assert.equal(liste[0].tutar, 150000);
});

test("bekleyen havalede karar olayı yok", () => {
  const liste = musteriHareketleri({ ...bos, odemeler: [{ ...odeme, status: "pending", reviewed_at: null }] });
  assert.deepEqual(liste.map((h) => [h.olay, h.ton]), [["Ödeme bildirildi", "warning"]]);
});

test("kartla ödeme tek olaydır: ikinci bir insan kararı yok", () => {
  const liste = musteriHareketleri({ ...bos, odemeler: [{ ...odeme, payment_method: "paytr" }] });
  assert.deepEqual(liste.map((h) => h.olay), ["Kartla ödendi"]);
  assert.equal(liste[0].zaman, odeme.reviewed_at);
});

test("proforma kesilir, ödenir ya da iptal edilir; satır proformanın sayfasına bağlanır", () => {
  const p = { id: "p1", proforma_no: "PRF-1", durum: "odendi", toplam: 90000, para_birimi: "TRY", product: "arvolab", created_at: "2026-10-01T08:00:00Z", odendi_at: "2026-10-05T08:00:00Z", updated_at: "2026-10-05T08:00:00Z" };
  const liste = musteriHareketleri({ ...bos, proformalar: [p, { ...p, id: "p2", durum: "iptal", odendi_at: null, updated_at: "2026-10-02T08:00:00Z" }] });
  assert.deepEqual(liste.map((h) => h.olay), ["Proforma ödendi", "Proforma iptal edildi", "Proforma kesildi", "Proforma kesildi"]);
  assert.ok(liste.every((h) => h.proformaId));
  assert.match(liste[2].ayrinti ?? "", /ArvoLab/);
});

test("faturanın tutarı bağlı ödemeden gelir; sıralama en yeni üstte, eşitlikte sabit", () => {
  const liste = musteriHareketleri({
    ...bos, kayitAcildi: "2026-09-01T00:00:00Z", odemeler: [odeme],
    faturalar: [{ id: "f1", fatura_no: "A-1", fatura_tarihi: "2026-10-03", created_at: "2026-10-03T10:00:00Z", payment_request_id: "o1" }],
    kurulum: [{ id: 1, action: "provision_organization", state: "failed", result: "failed", created_at: "2026-09-01T00:00:01Z" }],
    konsol: [{ id: 2, action: "deactivate", entity_type: "organization_membership", metadata: { is_active: false }, created_at: "2026-10-04T00:00:00Z" }],
  });
  assert.deepEqual(liste.map((h) => h.anahtar), ["konsol-2", "fatura-f1", "odeme-o1-karar", "odeme-o1-bildirim", "kurulum-1", "kayit"]);
  assert.equal(liste[1].tutar, 150000);
  assert.match(liste[1].ayrinti ?? "", /03\.10\.2026/);
  assert.equal(liste[0].olay, "Üye erişimi kapatıldı");
  assert.equal(liste[4].ton, "danger");
  assert.deepEqual(hareketSayimi(liste), { odeme: 2, proforma: 0, fatura: 1, kurulum: 2, konsol: 1 });
});
