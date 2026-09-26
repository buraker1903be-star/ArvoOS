import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  createPaytrInstallmentLink,
  deletePaytrLink,
  fromCallbackId,
  paytrExpiry,
  toCallbackId,
  verifyPaytrCallback,
} from "@/lib/paytr";

/*
  PayTR token ve hash formülleri DIŞARIDAN dayatılıyor: alan sırası PayTR'nin
  belgesinden geliyor ve sıra değişirse istek reddedilir. Reddin görünümü de
  kapalı: uzaktan "hash hatalı" dönüyor, hangi alanın kaydığı yazmıyor.

  Bu testler beklenen imzayı SABİT olarak tutuyor. Bir alan eklenir, çıkarılır
  ya da sırası değişirse test yerelde düşer — üretimde ödeme düşmeden önce.
*/
const KIMLIK = { merchantId: "123456", merchantKey: "TEST_KEY", merchantSalt: "TEST_SALT" };

const imza = (mesaj: string) => createHmac("sha256", KIMLIK.merchantKey).update(mesaj, "utf8").digest("base64");

/** fetch'i geçici olarak değiştirir; gönderilen alanları ve yanıtı yönetir. */
async function istekle<T>(yanit: unknown, isle: () => Promise<T>) {
  const asil = globalThis.fetch;
  const cagrilar: { url: string; alanlar: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string, init: { body: string }) => ({
    status: 200,
    text: async () => {
      cagrilar.push({ url: String(url), alanlar: Object.fromEntries(new URLSearchParams(init.body)) });
      return typeof yanit === "string" ? yanit : JSON.stringify(yanit);
    },
  })) as unknown as typeof fetch;
  try {
    const sonuc = await isle();
    return { sonuc, cagrilar };
  } finally {
    globalThis.fetch = asil;
  }
}

test("bağlantı oluşturma: alanlar ve token sabit", async () => {
  const { sonuc, cagrilar } = await istekle({ status: "success", id: "L1", link: "https://paytr/l/1" }, () =>
    createPaytrInstallmentLink(KIMLIK, {
      name: "AB",
      amountKurus: 14900.4,
      expiry: "2026-10-26 23:59:00",
      callbackUrl: "https://arvo-os.com/api/paytr/callback",
      callbackId: "abc123",
    }),
  );
  assert.deepEqual(sonuc, { id: "L1", url: "https://paytr/l/1" });

  const alanlar = cagrilar[0].alanlar;
  // Kurum sahibiyle netleştirilen kararlar (lib/paytr.ts başlığı).
  assert.equal(alanlar.max_installment, "1", "tek çekim");
  assert.equal(alanlar.link_type, "product");
  assert.equal(alanlar.min_count, "1", "tek kullanımlık");
  assert.equal(alanlar.max_count, "1");
  assert.equal(alanlar.currency, "TL");
  // 4 karakterden kısa ad PayTR'de geçersiz; noktayla tamamlanıyor.
  assert.equal(alanlar.name, "AB..");
  // Kuruş tamsayıya yuvarlanır: kuruşun altı diye bir şey yok.
  assert.equal(alanlar.price, "14900");

  // Token: name + price + currency + max_installment + link_type + lang + min_count + salt
  assert.equal(alanlar.paytr_token, imza("AB.." + "14900" + "TL" + "1" + "product" + "tr" + "1" + KIMLIK.merchantSalt));
  // Sıra bozulursa test düşsün diye sabit de tutuluyor.
  assert.equal(alanlar.paytr_token, "tskrlpAZUf7E8td8c6Q1s/xnX6AmG/7yELMQVdffuso=");
});

test("uzun ad kırpılıyor, token kırpılmış adla hesaplanıyor", async () => {
  const uzun = "x".repeat(250);
  const { cagrilar } = await istekle({ status: "success", id: "L", link: "u" }, () =>
    createPaytrInstallmentLink(KIMLIK, {
      name: uzun, amountKurus: 100, expiry: "2026-10-26 23:59:00",
      callbackUrl: "https://x/cb", callbackId: "id",
    }),
  );
  const alanlar = cagrilar[0].alanlar;
  assert.equal(alanlar.name.length, 200);
  /* Token GÖNDERİLEN adla hesaplanmalı; kırpmadan önceki adla hesaplanırsa
     PayTR hash'i tutmaz ve sebebi görünmez. */
  assert.equal(alanlar.paytr_token, imza(alanlar.name + "100TL1producttr1" + KIMLIK.merchantSalt));
});

test("başarısız yanıt sebebiyle birlikte hata veriyor", async () => {
  await assert.rejects(
    () => istekle({ status: "failed", reason: "invalid merchant" }, () =>
      createPaytrInstallmentLink(KIMLIK, {
        name: "Test", amountKurus: 100, expiry: "2026-10-26 23:59:00",
        callbackUrl: "https://x/cb", callbackId: "id",
      })),
    /invalid merchant/,
  );
});

test("JSON olmayan yanıt anlaşılır hata veriyor", async () => {
  await assert.rejects(
    () => istekle("<html>bakım</html>", () =>
      createPaytrInstallmentLink(KIMLIK, {
        name: "Test", amountKurus: 100, expiry: "2026-10-26 23:59:00",
        callbackUrl: "https://x/cb", callbackId: "id",
      })),
    /beklenmeyen yanıt/,
  );
});

test("bağlantı kapatma tokenı: id + merchant_id + salt", async () => {
  const { cagrilar } = await istekle({ status: "success" }, () => deletePaytrLink(KIMLIK, "L42"));
  assert.equal(cagrilar[0].alanlar.paytr_token, imza("L42" + KIMLIK.merchantId + KIMLIK.merchantSalt));
});

test("bildirim doğrulaması: hash tutmazsa reddediliyor", () => {
  const alanlar = { callback_id: "abc123", merchant_oid: "OID42", status: "success", total_amount: "14900" };
  const dogru = imza(alanlar.callback_id + alanlar.merchant_oid + KIMLIK.merchantSalt + alanlar.status + alanlar.total_amount);
  assert.equal(verifyPaytrCallback(KIMLIK, { ...alanlar, hash: dogru }), true);
  assert.equal(verifyPaytrCallback(KIMLIK, { ...alanlar, hash: "xxx" }), false);
  /* Tutar ya da durum değiştirilmiş bir bildirim kabul edilmemeli: ödeme
     kaydı bu doğrulamaya güveniyor. */
  assert.equal(verifyPaytrCallback(KIMLIK, { ...alanlar, total_amount: "1", hash: dogru }), false);
  assert.equal(verifyPaytrCallback(KIMLIK, { ...alanlar, status: "failed", hash: dogru }), false);
});

test("geçerlilik tarihi vadeden 30 gün sonra", () => {
  assert.equal(paytrExpiry("2026-12-01", new Date("2026-09-26T09:00:00Z")), "2026-12-31 23:59:00");
});

test("vade geçmişse ya da yoksa bugünden 30 gün", () => {
  assert.equal(paytrExpiry(null, new Date("2026-09-26T09:00:00Z")), "2026-10-26 23:59:00");
  assert.equal(paytrExpiry("2026-01-01", new Date("2026-09-26T09:00:00Z")), "2026-10-26 23:59:00");
});

test("gece 00:00–03:00 arası Türkiye günü esas alınıyor", () => {
  /*
    Sunucu UTC'de çalışıyor. 30 Eylül 21:30 UTC, Türkiye'de 1 Ekim 00:30 —
    bugün 1 Ekim sayılmalı, yoksa bağlantı bir gün kısa yaşardı.
  */
  assert.equal(paytrExpiry(null, new Date("2026-09-30T21:30:00Z")), "2026-10-31 23:59:00");
});

test("callback_id UUID'ye geri çevrilebiliyor", () => {
  const uuid = "3f2a1b4c-5d6e-4f70-8192-a3b4c5d6e7f8";
  assert.equal(toCallbackId(uuid), "3f2a1b4c5d6e4f708192a3b4c5d6e7f8");
  assert.equal(fromCallbackId(toCallbackId(uuid)), uuid);
  // Tanınmayan değer null: uydurma bir UUID döndürmek yanlış kaydı güncellerdi.
  assert.equal(fromCallbackId("kisa"), null);
  assert.equal(fromCallbackId("z".repeat(32)), null);
});
