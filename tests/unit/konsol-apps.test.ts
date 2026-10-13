import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { konsolUygulamalari } from "@/app/panel/os/konsol-apps";
import { etkinUygulama } from "@/app/panel/os/os-apps";

/*
  Konsol 13.10.2026'da panelin işletim sistemi kabuğuna geçti: sol menü
  yerine dock. Dock'un "hangi uygulama açık" kararı yol öneklerinin
  UZUNLUĞUNA dayanıyor ve konsolda bütün yollar "/panel/platform" ile
  başlıyor — yani Kiracılar uygulaması, dikkat edilmezse bütün alt
  sayfaları yutar ve dock hep onu vurgular.
*/
describe("kurucu konsolu uygulamaları", () => {
  const uygulamalar = konsolUygulamalari();
  const etkin = (yol: string) => etkinUygulama(uygulamalar, yol)?.key ?? null;

  test("ana ekran yalnızca tam /panel", () => {
    assert.equal(etkin("/panel"), "home");
    assert.equal(etkin("/panel/"), "home");
  });

  test("her sayfa doğru uygulamaya düşüyor", () => {
    /* Konsolda bütün yollar /panel/platform ile başlıyor: Kurulumlar
       uygulaması, dikkat edilmezse bütün alt sayfaları yutar ve dock
       sen Finans'tayken bile Kurulumlar'ı vurgular. etkinUygulama en
       UZUN eşleşeni seçtiği için alt sayfalar kendi uygulamasını
       buluyor; bu test onu sabitliyor. */
    assert.equal(etkin("/panel/platform/kurulumlar"), "kurulumlar");
    assert.equal(etkin("/panel/platform"), "kurulumlar");
    /* Kiracı dosyası ayrı bir yol değil, bu sayfanın sorgusu
       (?organization=…); dock yalnızca YOLA bakıyor. */
    assert.equal(etkin("/panel/platform/"), "kurulumlar");
    assert.equal(etkin("/panel/platform/licenses"), "kurulumlar");

    assert.equal(etkin("/panel/platform/kullanicilar"), "kullanicilar");
    assert.equal(etkin("/panel/platform/members"), "kullanicilar");
    assert.equal(etkin("/panel/platform/musteriler"), "kullanicilar");

    assert.equal(etkin("/panel/platform/urunler"), "urunler");
    assert.equal(etkin("/panel/platform/moduller"), "urunler");
    assert.equal(etkin("/panel/platform/subscribers"), "urunler");

    assert.equal(etkin("/panel/platform/billing"), "finans");
    assert.equal(etkin("/panel/platform/payments"), "finans");
    assert.equal(etkin("/panel/platform/sozlesmeler"), "finans");

    assert.equal(etkin("/panel/platform/saglik"), "saglik");
  });

  test("her bölüm gerçek bir adrese gidiyor ve uygulamasının yolunda", () => {
    /* Bölüm, uygulamanın yollarından birinin altında olmazsa o bölüme
       geçildiğinde dock başka bir uygulamayı vurgular. */
    for (const uygulama of uygulamalar) {
      for (const bolum of uygulama.bolumler ?? []) {
        const yol = bolum.href.split("?")[0];
        assert.ok(yol.startsWith("/panel"), `${uygulama.key}/${bolum.key}: panel dışı adres`);
        const sahip = etkinUygulama(uygulamalar, yol)?.key;
        assert.ok(
          sahip === uygulama.key || uygulamalar.some((u) => u.key === sahip && u.yalnizBaslatici),
          `${uygulama.key}/${bolum.key}: bölüm ${sahip} uygulamasına düşüyor`,
        );
      }
    }
  });

  test("her uygulamanın anahtarı ve adresi benzersiz", () => {
    const anahtarlar = uygulamalar.map((u) => u.key);
    assert.equal(new Set(anahtarlar).size, anahtarlar.length, "yinelenen uygulama anahtarı");
    const adresler = uygulamalar.map((u) => u.href);
    assert.equal(new Set(adresler).size, adresler.length, "iki uygulama aynı adrese gidiyor");
  });

  test("ana ekran dışındaki her uygulamanın yol öneki var", () => {
    /* Yolu olmayan uygulama dock'ta hiçbir zaman etkin görünmez: kurucu
       tıklıyor, sayfa açılıyor ama dock'ta vurgu başka bir yerde kalıyor. */
    for (const uygulama of uygulamalar) {
      if (uygulama.key === "home") continue;
      assert.ok(uygulama.yollar.length > 0, `${uygulama.key}: yol öneki yok`);
      assert.ok(uygulama.yollar.includes(uygulama.href), `${uygulama.key}: kendi adresi yollarında değil`);
    }
  });

  test("dock kurum sahibinin tarif ettiği altı uygulama", () => {
    /* İlk sürümde konsolun dokuz ekranı dokuz dock girdisiydi ve dock
       bir başlatıcıya dönüşmüştü. Liste artık işin ekseninde; yeni bir
       ekran eklenince dock'a girdi eklemek yerine ilgili uygulamanın
       bölümlerine inmeli. Sayı büyümeye başlarsa bu test söyler. */
    assert.deepEqual(
      uygulamalar.filter((u) => !u.yalnizBaslatici).map((u) => u.label),
      ["Ana Sayfa", "Kurulumlar", "Kullanıcılar", "Ürünler", "Finans", "Sistem Sağlığı"],
    );
  });
});
