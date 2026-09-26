import assert from "node:assert/strict";
import test from "node:test";

/*
  Ödeme kimlik bilgilerinin şifrelenmesi. Modül anahtarı ortam
  değişkeninden okuyor, o yüzden testler kendi TEST anahtarını kuruyor —
  gerçek bir anahtar burada bulunmaz.

  Sınanan şey yalnızca "gidip geri geliyor mu" değil; asıl mesele
  KURCALANMIŞ bir değerin reddedilmesi. AES-256-GCM'in doğrulama etiketi
  olmasa, veritabanına erişen biri şifreli metni değiştirip bankaya giden
  kimliği sessizce başka bir şeye çevirebilirdi.
*/
const TEST_ANAHTARI = Buffer.alloc(32, 7).toString("base64");
process.env.PAYMENT_CREDENTIALS_KEY = TEST_ANAHTARI;

const { decryptSecret, encryptSecret, paymentCredentialsConfigured } = await import("@/lib/payment-credentials");

const anahtarla = <T>(deger: string | undefined, isle: () => T): T => {
  const onceki = process.env.PAYMENT_CREDENTIALS_KEY;
  if (deger === undefined) delete process.env.PAYMENT_CREDENTIALS_KEY;
  else process.env.PAYMENT_CREDENTIALS_KEY = deger;
  try {
    return isle();
  } finally {
    process.env.PAYMENT_CREDENTIALS_KEY = onceki;
  }
};

test("şifrelenen değer aynen geri geliyor", () => {
  for (const acik of ["merchant-key-123", "Türkçe şifre: ğüşiöç", "a".repeat(400), "1"]) {
    assert.equal(decryptSecret(encryptSecret(acik)), acik);
  }
});

test("aynı değer her seferinde farklı şifreleniyor", () => {
  // Sabit IV, aynı sırrı kullanan iki kurumu veritabanından eşleştirmeye yarardı.
  const a = encryptSecret("aynı-sır");
  const b = encryptSecret("aynı-sır");
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), decryptSecret(b));
});

test("biçim sürümlü ve dört parçalı", () => {
  const parcalar = encryptSecret("x").split(":");
  assert.equal(parcalar.length, 4);
  assert.equal(parcalar[0], "v1");
  // IV 12 bayt (GCM'in doğru nonce boyu), etiket 16 bayt.
  assert.equal(Buffer.from(parcalar[1], "base64").length, 12);
  assert.equal(Buffer.from(parcalar[2], "base64").length, 16);
});

test("kurcalanmış şifreli metin reddediliyor", () => {
  const [v, iv, tag, data] = encryptSecret("merchant-key-123").split(":");
  const bozuk = Buffer.from(data, "base64");
  bozuk[0] ^= 0xff;
  assert.throws(() => decryptSecret([v, iv, tag, bozuk.toString("base64")].join(":")), /çözülemedi/);
});

test("kurcalanmış etiket ve IV de reddediliyor", () => {
  const [v, iv, tag, data] = encryptSecret("merchant-key-123").split(":");
  const bozukTag = Buffer.from(tag, "base64");
  bozukTag[0] ^= 0xff;
  assert.throws(() => decryptSecret([v, iv, bozukTag.toString("base64"), data].join(":")), /çözülemedi/);

  const bozukIv = Buffer.from(iv, "base64");
  bozukIv[0] ^= 0xff;
  assert.throws(() => decryptSecret([v, bozukIv.toString("base64"), tag, data].join(":")), /çözülemedi/);
});

test("başka anahtarla çözülemiyor", () => {
  const sifreli = encryptSecret("merchant-key-123");
  anahtarla(Buffer.alloc(32, 9).toString("base64"), () => {
    assert.throws(() => decryptSecret(sifreli), /PAYMENT_CREDENTIALS_KEY/);
  });
});

test("tanınmayan biçim ve sürüm reddediliyor", () => {
  for (const bozuk of ["", "duz-metin", "v1:eksik", "v2:a:b:c", "v1::b:c"]) {
    assert.throws(() => decryptSecret(bozuk), /biçimi tanınmadı/, bozuk);
  }
});

test("eksik ya da kısa anahtar kendi mesajını veriyor", () => {
  /*
    Bu mesajlar genel "çözülemedi" mesajıyla EZİLMEMELİ: yapılacak iş
    farklı — biri anahtarı eklemek, diğeri bilgileri yeniden girmek.
  */
  const sifreli = encryptSecret("x");
  anahtarla(undefined, () => {
    assert.equal(paymentCredentialsConfigured(), false);
    assert.throws(() => decryptSecret(sifreli), /tanımlı değil/);
    assert.throws(() => encryptSecret("x"), /tanımlı değil/);
  });
  anahtarla(Buffer.alloc(16, 1).toString("base64"), () => {
    assert.equal(paymentCredentialsConfigured(), false);
    assert.throws(() => decryptSecret(sifreli), /32 bayt/);
  });
});

test("anahtar tanımlıyken kurulum tamam", () => {
  assert.equal(paymentCredentialsConfigured(), true);
});
