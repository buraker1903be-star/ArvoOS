import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/*
  DURUM YAZIMLARINI CANLI ŞEMA SÖYLER (24.10.2026).

  Raporlar durum sütunlarıyla süzüyor ve yanlış yazım HATA VERMEZ:
  sessizce sıfır satır eşleşir. Bu iki kez somutlaştı:

   - `crm_proposals.status` kabul/ret durumlarını hiç tutmuyor
     (tetikleyici 'archived' yapıp gerçek durumu `archive_reason`a
     yazıyor); `status = 'accepted'` arayan kod dönüşümü her zaman
     %0 gösteriyordu;
   - "iptal" aynı veritabanında iki ayrı yazımla duruyor:
     `finance_transactions` → **canceled** (tek L),
     `payment_installments` → **cancelled** (çift L).

  `check:schema` sorgu zincirindeki değerleri kısıtla karşılaştırıyor
  ama TypeScript içindeki `h.status === "cancelled"` gibi bir
  karşılaştırma görüş alanında değil. Bu test, kodun dayandığı
  yazımları ŞEMA DÖKÜMÜNDEN doğruluyor: biri migration'la değişip
  döküm yenilendiğinde test düşer ve hangi kodun güncellenmesi
  gerektiğini söyler.
*/
const SEMA = readFileSync(new URL("../../supabase/schema/canli-sema.sql", import.meta.url), "utf8");

/** Kısıttaki izinli değerleri okur: check ((x = any (array['a','b']))). */
function izinliDegerler(tablo: string, sutun: string): string[] {
  const kalip = new RegExp(
    `alter table public\\.${tablo} add constraint ${tablo}_${sutun}_check CHECK \\(\\(${sutun} = ANY \\(ARRAY\\[(.*?)\\]\\)\\)\\)`,
  );
  const eslesme = SEMA.match(kalip);
  assert.ok(eslesme, `${tablo}.${sutun} kısıtı dökümde bulunamadı`);
  return [...eslesme[1].matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
}

describe("durum yazımları canlı şemayla aynı", () => {
  it("finance_transactions: iptal TEK L ('canceled')", () => {
    const degerler = izinliDegerler("finance_transactions", "status");
    assert.deepEqual(degerler.sort(), ["canceled", "paid", "planned"]);
    assert.ok(!degerler.includes("cancelled"), "çift L yok — lib/rapor-finans.ts tek L kullanıyor");
  });

  it("payment_installments: iptal ÇİFT L ('cancelled')", () => {
    const degerler = izinliDegerler("payment_installments", "status");
    assert.deepEqual(degerler.sort(), ["cancelled", "paid", "pending"]);
    assert.ok(!degerler.includes("canceled"), "tek L yok — lib/taksit-dagitimi.ts çift L kullanıyor");
  });

  it("crm_proposals.status kabul/ret/süresi geçmiş DURUMLARINI TUTMUYOR", () => {
    /* Tutuyor olsaydı lib/teklif-durumu.ts'teki archive_reason
       çevirisi gereksiz olurdu; tutmadığı için zorunlu. */
    const degerler = izinliDegerler("crm_proposals", "status");
    assert.ok(degerler.includes("archived"), "arşiv durumu var");
    assert.ok(degerler.includes("accepted"), "kısıt izin veriyor ama tetikleyici yazmıyor");
    const tetikleyici = SEMA.includes(
      "CREATE TRIGGER archive_inactive_crm_proposal BEFORE INSERT OR UPDATE OF status, valid_until ON public.crm_proposals",
    );
    assert.ok(tetikleyici, "arşivleme tetikleyicisi kalkmışsa etkin durum çevirisi gözden geçirilmeli");
  });

  it("crm_contracts: satış sayılan durumlar duruyor", () => {
    const degerler = izinliDegerler("crm_contracts", "status");
    for (const beklenen of ["draft", "sent", "signed", "completed", "cancelled", "rejected"]) {
      assert.ok(degerler.includes(beklenen), `${beklenen} kalkmış`);
    }
  });

  it("contract_cost_items: iptal durumu YOK", () => {
    /* lib/rapor-finans.ts yalnızca `status !== "paid"` ile eliyor;
       iptal durumu eklenirse o eleme yetmez. */
    assert.deepEqual(izinliDegerler("contract_cost_items", "status").sort(), ["paid", "planned"]);
  });
});
