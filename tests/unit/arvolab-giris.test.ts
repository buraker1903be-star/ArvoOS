import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { arvolabGirisAdresi } from "@/lib/arvolab-giris";

describe("ArvoLab giriş adresi", () => {
  test("ArvoLab'ın /auth/confirm yoluna token_hash ile gider", () => {
    /*
      action_link kullanıldığında oturum adresin # kısmında dönüyor ve
      sunucu onu görmüyordu: kişi ArvoLab'a varıyor, giriş ekranı çıkıyordu.
    */
    const adres = new URL(arvolabGirisAdresi("https://lab.arvo-os.com", "abc123"));
    assert.equal(adres.origin, "https://lab.arvo-os.com");
    assert.equal(adres.pathname, "/auth/confirm");
    assert.equal(adres.searchParams.get("token_hash"), "abc123");
    assert.equal(adres.searchParams.get("type"), "magiclink");
    assert.equal(adres.searchParams.get("next"), "/dashboard");
  });

  test("bilinmeyen hedef panele düşürülür", () => {
    // ArvoLab'ın safeConfirmNext'i zaten eliyor; iki yerde aynı kural,
    // birinin sapmasını önlüyor.
    const adres = new URL(arvolabGirisAdresi("https://lab.arvo-os.com", "t", "//evil.example"));
    assert.equal(adres.searchParams.get("next"), "/dashboard");
  });

  test("izinli ikinci hedef korunur", () => {
    const adres = new URL(arvolabGirisAdresi("https://lab.arvo-os.com", "t", "/reset-password"));
    assert.equal(adres.searchParams.get("next"), "/reset-password");
  });
});
