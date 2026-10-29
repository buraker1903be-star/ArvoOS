import assert from "node:assert/strict";
import test from "node:test";
import { proformaHali, takvimiKur, type TakvimAboneligi, type TakvimProformasi } from "@/lib/yenileme-takvimi";

const bugun = "2026-10-29";
const ab = (s: Partial<TakvimAboneligi>): TakvimAboneligi => ({
  anahtar: "k", tur: "kurum", musteriId: "o1", musteriAdi: "Kurum", urun: "arvoos", durum: "active", bitis: "2026-11-10", tutar: 100000, ...s,
});
const pr = (s: Partial<TakvimProformasi>): TakvimProformasi => ({
  id: "p", proforma_no: "PRF-1", organization_id: "o1", subscriber_id: null, product: "arvoos", durum: "bekliyor", otomatik: true,
  donem_sonu: "2026-11-10", duzenleme_tarihi: "2026-11-07", toplam: 100000, gonderildi_at: null, bildirildi_at: null, gonderim_hatasi: null, ...s,
});

test("proforma yoksa: üç günden fazla varsa iş kesecek, yoksa kesilmedi", () => {
  assert.deepEqual(proformaHali(ab({}), [], bugun), { tur: "kesilecek", gun: "2026-11-07" });
  assert.deepEqual(proformaHali(ab({ bitis: "2026-11-01" }), [], bugun), { tur: "kesilmedi" });
  assert.deepEqual(proformaHali(ab({ durum: "trialing" }), [], bugun), { tur: "deneme" });
});

test("otomatik proforma dönemiyle eşleşir; durum gönderim ve ödemeden", () => {
  assert.equal(proformaHali(ab({}), [pr({})], bugun).tur, "kesildi");
  assert.equal(proformaHali(ab({}), [pr({ gonderildi_at: "2026-11-07T06:00:00Z" })], bugun).tur, "gonderildi");
  assert.equal(proformaHali(ab({}), [pr({ durum: "odendi" })], bugun).tur, "odendi");
  assert.equal(proformaHali(ab({}), [pr({ durum: "iptal" })], bugun).tur, "iptal");
  assert.equal(proformaHali(ab({}), [pr({ donem_sonu: "2026-10-10" })], bugun).tur, "kesilecek", "başka dönemin proforması sayılmaz");
  assert.equal(proformaHali(ab({}), [pr({ organization_id: "o2" })], bugun).tur, "kesilecek", "başka kurum");
  assert.equal(proformaHali(ab({}), [pr({ product: "randevu" })], bugun).tur, "kesilecek", "başka ürün");
});

test("elle kesilen, dönemden en çok 30 gün önce düzenlenmişse sayılır; iptal edilen sayılmaz", () => {
  const elle = pr({ otomatik: false, donem_sonu: null, duzenleme_tarihi: "2026-10-20" });
  assert.equal(proformaHali(ab({}), [elle], bugun).tur, "kesildi");
  assert.equal(proformaHali(ab({}), [{ ...elle, durum: "iptal" }], bugun).tur, "kesilecek");
  assert.equal(proformaHali(ab({}), [{ ...elle, duzenleme_tarihi: "2026-09-01" }], bugun).tur, "kesilecek", "eski dönemin belgesi");
});

test("bireysel abone abone kimliğiyle eşleşir", () => {
  const a = ab({ tur: "abone", musteriId: "s1", urun: "arvolab" });
  assert.equal(proformaHali(a, [pr({ organization_id: null, subscriber_id: "s1", product: "arvolab" })], bugun).tur, "kesildi");
});

test("takvim gün gün; geçmişte kalan ayrı, 30 günden uzak ve 30 günden eski düşer; özet denemeyi tutara katmaz", () => {
  const t = takvimiKur([
    ab({ anahtar: "1", bitis: "2026-11-10" }),
    ab({ anahtar: "2", bitis: "2026-11-10", musteriAdi: "Ahmet", musteriId: "o2" }),
    ab({ anahtar: "3", bitis: "2026-10-31", durum: "trialing", tutar: 500000 }),
    ab({ anahtar: "4", bitis: "2026-10-20", durum: "past_due" }),
    ab({ anahtar: "5", bitis: "2026-12-30" }),
    ab({ anahtar: "6", bitis: "2026-09-01" }),
  ], [pr({ gonderildi_at: "x" })], bugun);
  assert.deepEqual(t.gunler.map((g) => [g.gun, g.satirlar.map((s) => s.anahtar)]), [["2026-10-31", ["3"]], ["2026-11-10", ["2", "1"]]]);
  assert.deepEqual(t.gecikmis.map((s) => s.anahtar), ["4"]);
  assert.equal(t.ozet.adet, 3);
  assert.equal(t.ozet.tutar, 200000);
  assert.equal(t.ozet.gonderilen, 1);
  assert.equal(t.ozet.dikkat, 1, "yalnızca geciken");
});
