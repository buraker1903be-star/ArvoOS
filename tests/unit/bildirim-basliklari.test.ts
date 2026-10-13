import assert from "node:assert/strict";
import test from "node:test";
import { basliklaraDagit, bilinenKategoriler, kategoriParametresi, notificationFilters } from "@/app/panel/notifications/filters";

/* Bildirim başlıkları: sunucuya giden kategori süzgeci ve özetin başlıklara dağılımı. */

const filtre = (key: string) => notificationFilters.find((f) => f.key === key)!;

test("başlık yoksa süzgeç yok; başlık kendi kategorilerini, Diğer bilinenlerin dışını ister", () => {
  assert.deepEqual(kategoriParametresi(null), { p_kategoriler: null, p_diger: false });
  assert.deepEqual(kategoriParametresi(filtre("yorumlar")), { p_kategoriler: ["internal_comment"], p_diger: false });
  const diger = kategoriParametresi(filtre("diger"));
  assert.equal(diger.p_diger, true);
  assert.deepEqual(diger.p_kategoriler, [...bilinenKategoriler]);
});

test("özet başlıklara dağılır; bilinmeyen tür Diğer'e, toplamlar tutar", () => {
  const ozet = basliklaraDagit([
    { kategori: "internal_comment", adet: 49, okunmamis: 0, bugun: 3 },
    { kategori: "customer_message", adet: "4", okunmamis: "2", bugun: "4" },
    { kategori: "contract_signed", adet: 1, okunmamis: 1, bugun: 0 },
    { kategori: "yepyeni_tur", adet: 2, okunmamis: 1, bugun: 1 },
  ]);
  assert.equal(ozet.toplam, 56);
  assert.equal(ozet.okunmamis, 4);
  assert.equal(ozet.bugun, 8);
  assert.deepEqual(ozet.basliklar.yorumlar, { adet: 49, okunmamis: 0 });
  assert.deepEqual(ozet.basliklar.musteri, { adet: 5, okunmamis: 3 });
  assert.deepEqual(ozet.basliklar.diger, { adet: 2, okunmamis: 1 });
  const baslikToplami = Object.values(ozet.basliklar).reduce((t, b) => t + b.adet, 0);
  assert.equal(baslikToplami, ozet.toplam, "her bildirim tek başlıkta sayılmalı");
});

test("iş bekleme ve revizyon bildirimleri Operasyon başlığında (eskiden Diğer'deydi)", () => {
  const ozet = basliklaraDagit([
    { kategori: "operation_waiting_party", adet: 1, okunmamis: 1, bugun: 0 },
    { kategori: "operation_revision_window", adet: 1, okunmamis: 0, bugun: 0 },
  ]);
  assert.deepEqual(ozet.basliklar.operations, { adet: 2, okunmamis: 1 });
  assert.deepEqual(ozet.basliklar.diger, { adet: 0, okunmamis: 0 });
});
