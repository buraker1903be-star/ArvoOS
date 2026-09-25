import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  PROVIDERS,
  kimlikSorunu,
  kimlikTam,
  providerSpec,
  secretKeys,
  tahsilatSaglayicisi,
} from "@/lib/payments/saglayicilar";

const PAYTR_SIRLARI = { merchant_key: "abc", merchant_salt: "def" };
const GARANTI_SIRLARI = { terminal_id: "30690978", prov_user: "PROVAUT", prov_password: "123qweASD/", store_key: "12345678" };

describe("kimlik denetimi", () => {
  test("geçerli PayTR ve Garanti bilgileri sorunsuz", () => {
    assert.equal(kimlikSorunu("paytr", "123456", PAYTR_SIRLARI), null);
    assert.equal(kimlikSorunu("garanti", "7000679", GARANTI_SIRLARI), null);
  });

  test("mağaza kimliği sağlayıcıya göre denetleniyor", () => {
    assert.match(kimlikSorunu("paytr", "ABC123", PAYTR_SIRLARI) ?? "", /Mağaza numarası/);
    assert.match(kimlikSorunu("garanti", "123", GARANTI_SIRLARI) ?? "", /Üye İşyeri/);
  });

  test("ilk kurulumda eksik sır reddediliyor", () => {
    assert.match(kimlikSorunu("garanti", "7000679", { terminal_id: "30690978" }) ?? "", /Provizyon kullanıcısı/);
  });

  test("kayıtlı bir sır boş bırakılabiliyor: boş alan SİLME değil, 'değiştirme'", () => {
    /*
      Sırlar ekranda hiç gösterilmiyor. Boş alanı "sil" saysaydık, yalnızca
      StoreKey'i güncellemek isteyen kullanıcı diğer üçünü de yeniden
      yazmak zorunda kalır, biri eksik kalırsa sağlayıcı sessizce bozulurdu.
    */
    const mevcut = ["terminal_id", "prov_user", "prov_password", "store_key"];
    assert.equal(kimlikSorunu("garanti", "7000679", { store_key: "yeni" }, mevcut), null);
  });

  test("tanınmayan alan reddediliyor", () => {
    assert.match(
      kimlikSorunu("garanti", "7000679", { ...GARANTI_SIRLARI, merchant_salt: "x" }) ?? "",
      /tanınmayan alan: merchant_salt/,
    );
  });

  test("saçma uzunlukta değer yakalanıyor", () => {
    assert.match(kimlikSorunu("paytr", "123456", { ...PAYTR_SIRLARI, merchant_key: "x".repeat(501) }) ?? "", /beklenenden uzun/);
  });

  test("bilinmeyen sağlayıcı", () => {
    assert.match(kimlikSorunu("hepsiburada" as never, "123456", {}) ?? "", /Tanınmayan/);
  });
});

describe("kimlik tamlığı", () => {
  test("eksik alan tamam saymıyor", () => {
    assert.equal(kimlikTam("garanti", ["terminal_id", "prov_user", "prov_password"]), false);
    assert.equal(kimlikTam("garanti", secretKeys("garanti")), true);
    assert.equal(kimlikTam("paytr", ["merchant_key"]), false);
    assert.equal(kimlikTam("paytr", ["merchant_key", "merchant_salt"]), true);
  });
});

describe("tahsilatı hangi sağlayıcı yapacak", () => {
  const satir = (provider: string, over: Partial<{ enabled: boolean; complete: boolean }> = {}) =>
    ({ provider, enabled: true, complete: true, ...over });

  test("hiç sağlayıcı yoksa null", () => assert.equal(tahsilatSaglayicisi([]), null));

  test("yalnızca PayTR varsa PayTR", () => {
    assert.equal(tahsilatSaglayicisi([satir("paytr")]), "paytr");
  });

  test("kapalı ya da eksik sağlayıcı seçilmiyor", () => {
    assert.equal(tahsilatSaglayicisi([satir("paytr", { enabled: false })]), null);
    assert.equal(tahsilatSaglayicisi([satir("paytr", { complete: false })]), null);
  });

  test("AKIŞI hazır olmayan sağlayıcı, bağlı görünse de seçilmiyor", () => {
    /*
      Garanti'nin bilgileri girilebiliyor ama 3D motoru ve provizyon XML'i
      henüz yok. checkoutReady olmasaydı "bağlı" görünen bir sağlayıcı
      seçilir ve tahsilat sessizce hiç yapılmazdı — en kötü başarısızlık.
      Garanti hazır olunca bu test kırmızıya döner ve bilerek güncellenir.
    */
    assert.equal(providerSpec("garanti")?.checkoutReady, false);
    assert.equal(tahsilatSaglayicisi([satir("garanti")]), null);
    // Garanti hazır değilken PayTR devrede kalmalı.
    assert.equal(tahsilatSaglayicisi([satir("garanti"), satir("paytr")]), "paytr");
  });
});

describe("sağlayıcı kayıtları", () => {
  test("her sağlayıcının alan anahtarları benzersiz ve boş değil", () => {
    for (const provider of PROVIDERS) {
      const keys = provider.secrets.map((secret) => secret.key);
      assert.equal(new Set(keys).size, keys.length, `${provider.code}: yinelenen anahtar`);
      assert.ok(keys.every((key) => /^[a-z_]{2,40}$/.test(key)), `${provider.code}: anahtar biçimi`);
      assert.ok(provider.secrets.every((secret) => secret.label.trim().length > 2));
    }
  });

  test("PayTR alan adları veritabanındaki eski sütunlarla aynı", () => {
    // Migration mevcut satırları bu iki anahtarla haritaya taşıyor;
    // adlar ayrışırsa kayıtlı mağazalar sessizce "bağlı değil" olurdu.
    assert.deepEqual(secretKeys("paytr"), ["merchant_key", "merchant_salt"]);
  });
});
