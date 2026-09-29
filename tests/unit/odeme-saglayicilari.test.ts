import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  PROVIDERS,
  identifierKeys,
  kimlikSorunu,
  kimlikTam,
  providerSpec,
  secretKeys,
  tahsilatSaglayicisi,
} from "@/lib/payments/saglayicilar";

const PAYTR_SIRLARI = { merchant_key: "abc", merchant_salt: "def" };
const GARANTI_SIRLARI = { prov_user: "PROVAUT", prov_password: "123qweASD/", store_key: "12345678" };
/* Terminal numarası SIR DEĞİL: ayrı geliyor ve ekranda gösteriliyor. */
const GARANTI_GORUNUR = { terminal_id: "30690978" };

describe("kimlik denetimi", () => {
  test("geçerli PayTR ve Garanti bilgileri sorunsuz", () => {
    assert.equal(kimlikSorunu("paytr", "123456", PAYTR_SIRLARI), null);
    assert.equal(kimlikSorunu("garanti", "7000679", GARANTI_SIRLARI, [], GARANTI_GORUNUR), null);
  });

  test("mağaza kimliği sağlayıcıya göre denetleniyor", () => {
    assert.match(kimlikSorunu("paytr", "ABC123", PAYTR_SIRLARI) ?? "", /Mağaza numarası/);
    assert.match(kimlikSorunu("garanti", "123", GARANTI_SIRLARI, [], GARANTI_GORUNUR) ?? "", /Üye İşyeri/);
  });

  test("ilk kurulumda eksik sır reddediliyor", () => {
    assert.match(kimlikSorunu("garanti", "7000679", {}, [], GARANTI_GORUNUR) ?? "", /Provizyon kullanıcısı/);
  });

  test("kayıtlı bir sır boş bırakılabiliyor: boş alan SİLME değil, 'değiştirme'", () => {
    /*
      Sırlar ekranda hiç gösterilmiyor. Boş alanı "sil" saysaydık, yalnızca
      StoreKey'i güncellemek isteyen kullanıcı diğer üçünü de yeniden
      yazmak zorunda kalır, biri eksik kalırsa sağlayıcı sessizce bozulurdu.
    */
    const mevcut = ["prov_user", "prov_password", "store_key"];
    assert.equal(kimlikSorunu("garanti", "7000679", { store_key: "yeni" }, mevcut, GARANTI_GORUNUR), null);
  });

  test("tanınmayan alan reddediliyor", () => {
    assert.match(
      kimlikSorunu("garanti", "7000679", { ...GARANTI_SIRLARI, merchant_salt: "x" }, [], GARANTI_GORUNUR) ?? "",
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
    assert.equal(kimlikTam("garanti", ["prov_user", "prov_password"], ["terminal_id"]), false);
    assert.equal(kimlikTam("garanti", secretKeys("garanti"), ["terminal_id"]), true);
    assert.equal(kimlikTam("paytr", ["merchant_key"]), false);
    assert.equal(kimlikTam("paytr", ["merchant_key", "merchant_salt"]), true);
  });

  test("TERMİNALSİZ Garanti tam sayılmıyor", () => {
    /*
      Sırların hepsi yerinde ama terminal yok. Tam sayılsaydı seçici onu
      uygun bulur ve banka isteği terminalsiz giderdi; banka "imza
      hatalı" döner ve eksik olanın terminal olduğu anlaşılmazdı.
    */
    assert.equal(kimlikTam("garanti", secretKeys("garanti"), []), false);
  });
});

describe("sır olmayan kimlikler", () => {
  test("terminal numarası SIR DEĞİL, görünür alan", () => {
    /*
      Önce sır sayılıyordu ve şifrelendiği için hiçbir ekranda geri
      gösterilmiyordu. ArvoOS, AkademikMerkez ve ArvoCulture aynı tüzel
      kişilik ve aynı Üye İşyeri Numarasını paylaşıyor; kayıtları ayıran
      TEK alan terminal numarası. Görünmeyince "hangi kurum hangi
      terminale bağlı" sorusunun cevabı kalmıyordu.
    */
    assert.deepEqual(identifierKeys("garanti"), ["terminal_id"]);
    assert.ok(!secretKeys("garanti").includes("terminal_id"), "terminal sırlara geri dönmüş");
  });

  test("terminal zorunlu ve biçimi denetleniyor", () => {
    assert.match(kimlikSorunu("garanti", "7000679", GARANTI_SIRLARI, [], {}) ?? "", /Terminal Numarası zorunlu/);
    assert.match(
      kimlikSorunu("garanti", "7000679", GARANTI_SIRLARI, [], { terminal_id: "30 690 978" }) ?? "",
      /Terminal Numarası geçersiz/,
    );
    assert.match(
      kimlikSorunu("garanti", "7000679", GARANTI_SIRLARI, [], { terminal_id: "x".repeat(65) }) ?? "",
      /Terminal Numarası geçersiz/,
    );
  });

  test("görünür alanda BOŞ, 'değiştirme' değil gerçekten boş", () => {
    /*
      Sırlarda boş alan "kayıtlıyı koru" demek, çünkü kullanıcı değeri
      göremiyor. Görünür alanda değer ekranda duruyor: boş bırakmak
      bilinçli bir seçim ve kayıtlı olması onu kurtarmamalı.
    */
    assert.match(
      kimlikSorunu("garanti", "7000679", {}, secretKeys("garanti"), {}) ?? "",
      /Terminal Numarası zorunlu/,
    );
  });

  test("PayTR'nin görünür alanı yok", () => {
    assert.deepEqual(identifierKeys("paytr"), []);
    assert.equal(kimlikSorunu("paytr", "123456", PAYTR_SIRLARI, [], {}), null);
  });

  test("tanınmayan görünür alan reddediliyor", () => {
    assert.match(
      kimlikSorunu("garanti", "7000679", GARANTI_SIRLARI, [], { ...GARANTI_GORUNUR, sube: "34" }) ?? "",
      /tanınmayan alan: sube/,
    );
  });

  test("görünür ve sır anahtarları çakışmıyor", () => {
    /* Aynı ad iki yerde olsaydı biri düz, biri şifreli saklanır ve
       hangisinin okunduğu çağıran yere göre değişirdi. */
    for (const provider of PROVIDERS) {
      const hepsi = [...provider.identifiers, ...provider.secrets].map((alan) => alan.key);
      assert.equal(new Set(hepsi).size, hepsi.length, `${provider.code}: ad çakışması`);
    }
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
