import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { bildirimYuku, cihazGittiMi, pushAdresiUygunMu } from "@/lib/anlik-bildirim";

describe("push cihaz adresi", () => {
  test("tarayıcıların push servisleri kabul", () => {
    for (const adres of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
      "https://web.push.apple.com/QGx",
      "https://api.push.apple.com/3/device/x",
      "https://db5p.notify.windows.com/w/?token=x",
    ]) assert.equal(pushAdresiUygunMu(adres), true, adres);
  });

  test("iç ağ, IP, http, port ve benzer adlar reddedilir", () => {
    for (const adres of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "https://fcm.googleapis.com:8443/x",
      "https://fcm.googleapis.com.saldirgan.com/x",
      "https://saldirganpush.apple.com.evil.io/x",
      "https://kullanici:sifre@fcm.googleapis.com/x",
      "fcm.googleapis.com/x",
      "",
    ]) assert.equal(pushAdresiUygunMu(adres), false, adres);
  });
});

describe("bildirim yükü", () => {
  const satir = { id: "b1", title: "Yeni iş", message: "Size iş atandı", action_url: "/panel/operations/1", category: "operation" };

  test("panel içi adres korunur, etiket bildirim kimliğinden", () => {
    const yuk = bildirimYuku(satir);
    assert.equal(yuk.adres, "/panel/operations/1");
    assert.equal(yuk.etiket, "arvo-b1");
  });

  test("dışarıya götüren adres panele çevrilir", () => {
    for (const action_url of ["https://kotu.site", "//kotu.site/x", "/\\kotu.site", "javascript:alert(1)", null]) {
      assert.equal(bildirimYuku({ ...satir, action_url }).adres, "/panel/notifications", String(action_url));
    }
  });

  test("uzun metin kısaltılır, boş başlık ArvoOS olur", () => {
    const yuk = bildirimYuku({ ...satir, title: "  ", message: "x".repeat(500) });
    assert.equal(yuk.baslik, "ArvoOS");
    assert.equal(yuk.metin.length, 240);
    assert.ok(yuk.metin.endsWith("…"));
  });

  test("yalnızca 404/410 cihazı siler", () => {
    assert.equal(cihazGittiMi(410), true);
    assert.equal(cihazGittiMi(404), true);
    assert.equal(cihazGittiMi(429), false);
    assert.equal(cihazGittiMi(undefined), false);
  });
});
