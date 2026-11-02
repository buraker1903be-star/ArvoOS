import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PAKET_VARSAYILANI, fazlaVerilen, limitSapmalari } from "@/lib/paket-limitleri";

/*
  Sapma yalnızca lisans formunun içinde, seçili kiracı için görünüyordu:
  "hangi kiracı paketinden fazlasını alıyor" sorusunun yanıtı hiçbir
  ekranda yoktu. Kota aşımında aynı boşluk 12.10.2026'da kapatılmıştı;
  bu onun kardeşi.
*/
describe("paket limiti sapması", () => {
  const baslangic = PAKET_VARSAYILANI.starter;

  test("paketiyle birebir aynı lisansta sapma yok", () => {
    assert.deepEqual(limitSapmalari("starter", {
      userLimit: baslangic.userLimit, storageLimitMb: baslangic.storageLimitMb, aiCreditLimit: baslangic.aiCreditLimit,
    }), []);
  });

  test("fazla verilen koltuk yakalanıyor", () => {
    const sapmalar = limitSapmalari("starter", {
      userLimit: 250, storageLimitMb: baslangic.storageLimitMb, aiCreditLimit: baslangic.aiCreditLimit,
    });
    assert.deepEqual(sapmalar, [{ alan: "kullanıcı", paket: baslangic.userLimit, kiraci: 250 }]);
    assert.equal(fazlaVerilen(sapmalar).length, 1);
  });

  test("EKSİK verilen de sapmadır ama fazla değildir", () => {
    /* Pakette 3 koltuk varken 1 tanımlanmışsa müşteri hakkını
       alamıyor: sapma listesinde var, "satılmamış hak" listesinde yok. */
    const sapmalar = limitSapmalari("starter", {
      userLimit: 1, storageLimitMb: baslangic.storageLimitMb, aiCreditLimit: baslangic.aiCreditLimit,
    });
    assert.equal(sapmalar.length, 1);
    assert.equal(fazlaVerilen(sapmalar).length, 0);
  });

  test("üç alan birden sapabiliyor", () => {
    const sapmalar = limitSapmalari("starter", { userLimit: 9, storageLimitMb: 99, aiCreditLimit: 7 });
    assert.deepEqual(sapmalar.map((s) => s.alan), ["kullanıcı", "depolama", "AI kredisi"]);
  });

  test("ölçülemeyen alan sapma sayılmıyor", () => {
    /* null = lisans satırında o alan yok; "sapma var" demek uydurma
       olurdu. */
    assert.deepEqual(limitSapmalari("starter", { userLimit: null, storageLimitMb: null, aiCreditLimit: null }), []);
  });

  test("TANINMAYAN PAKET kıyaslanmıyor", () => {
    /* Karşılaştıracak bir varsayılan yok; "sapma var" demek yanlış. */
    assert.deepEqual(limitSapmalari("yok-boyle-paket", { userLimit: 999, storageLimitMb: 1, aiCreditLimit: 1 }), []);
    assert.deepEqual(limitSapmalari(null, { userLimit: 999, storageLimitMb: 1, aiCreditLimit: 1 }), []);
  });

  test("kurumsal paket kendi varsayılanıyla kıyaslanıyor", () => {
    /* Başlangıç'ın 3'üyle değil: 15 koltuklu Kurumsal kiracı sapma
       değil. */
    const kurumsal = PAKET_VARSAYILANI.professional;
    assert.deepEqual(limitSapmalari("professional", {
      userLimit: kurumsal.userLimit, storageLimitMb: kurumsal.storageLimitMb, aiCreditLimit: kurumsal.aiCreditLimit,
    }), []);
  });
});

test("konsoldan düzenlenen limit koddaki yedeğin üstüne yazılır; bozuk satır yok sayılır", async () => {
  const { paketLimitleriniKur } = await import("@/lib/paket-limitleri");
  const limitler = paketLimitleriniKur([
    { plan_code: "starter", user_limit: 5, storage_limit_mb: 10240, ai_credit_limit: 800 },
    { plan_code: "professional", user_limit: 0, storage_limit_mb: 1, ai_credit_limit: 1 },
    { plan_code: "bilinmeyen", user_limit: 9, storage_limit_mb: 9, ai_credit_limit: 9 },
  ]);
  assert.deepEqual(limitler.starter, { userLimit: 5, storageLimitMb: 10240, aiCreditLimit: 800 });
  assert.deepEqual(limitler.professional, PAKET_VARSAYILANI.professional);
  assert.equal("bilinmeyen" in limitler, false);
  /* Sapma artık konsoldaki değere göre: 5 kullanıcılık başlangıç sapma değil. */
  assert.deepEqual(limitSapmalari("starter", { userLimit: 5, storageLimitMb: 10240, aiCreditLimit: 800 }, limitler), []);
  assert.equal(limitSapmalari("starter", { userLimit: 5, storageLimitMb: 10240, aiCreditLimit: 800 }).length, 3);
});
