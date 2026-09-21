import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MANAGEMENT_HOST, isManagementHost, managementRedirectTarget } from "@/lib/site/host-rules";

const APP = "app.arvo-os.com";
const hedef = (host: string, pathname: string, search?: string) =>
  managementRedirectTarget({ host, pathname, search, appHost: APP });

describe("yönetim alan adı", () => {
  test("ASCII ve punycode adres tanınır", () => {
    assert.ok(isManagementHost(MANAGEMENT_HOST));
    assert.ok(isManagementHost("xn--ynetim-wxa.arvo-os.com"));
    assert.ok(!isManagementHost(APP));
  });

  test("port ve büyük harf kararı değiştirmez", () => {
    assert.ok(isManagementHost("Yonetim.Arvo-OS.com:443"));
  });

  test("punycode adres okunur adrese taşınır", () => {
    // Punycode bağlantı paylaşıldığında okunaksız görünüyor.
    assert.equal(
      hedef("xn--ynetim-wxa.arvo-os.com", "/panel/platform/licenses"),
      `https://${MANAGEMENT_HOST}/panel/platform/licenses`,
    );
  });

  test("kök yol doğrudan platform yönetimine iner", () => {
    assert.equal(hedef(MANAGEMENT_HOST, "/"), `https://${MANAGEMENT_HOST}/panel/platform`);
    assert.equal(hedef(MANAGEMENT_HOST, "/panel"), `https://${MANAGEMENT_HOST}/panel/platform`);
  });

  test("platform yolları olduğu yerde kalır", () => {
    assert.equal(hedef(MANAGEMENT_HOST, "/panel/platform/subscribers"), null);
    assert.equal(hedef(MANAGEMENT_HOST, "/panel/platform"), null);
  });

  test("platform dışındaki panel yolu uygulama alan adına döner", () => {
    /*
      Kurucunun müşteri kurumunda yaptığı iş yönetim alan adında
      görünmemeli; "şu an hangi kurum adına iş yapıyorum" sorusu
      karışmasın diye ayırdık.
    */
    assert.equal(hedef(MANAGEMENT_HOST, "/panel/crm/whatsapp", "?numara=9053"), `https://${APP}/panel/crm/whatsapp?numara=9053`);
  });

  test("giriş ve API yolları yönlendirilmez", () => {
    // Oturum yönetim alan adında ayrı kuruluyor; /login burada kalmalı.
    assert.equal(hedef(MANAGEMENT_HOST, "/login"), null);
    assert.equal(hedef(MANAGEMENT_HOST, "/auth/callback"), null);
    assert.equal(hedef(MANAGEMENT_HOST, "/api/bridge/whatsapp"), null);
  });

  test("başka alan adlarında karar verilmez", () => {
    assert.equal(hedef(APP, "/"), null);
    assert.equal(hedef("arvo-os.com", "/panel"), null);
  });
});
