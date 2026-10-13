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

  test("kiracı listesi alt sayfaları YUTMUYOR", () => {
    assert.equal(etkin("/panel/platform"), "kiracilar");
    /* Kiracı dosyası ayrı bir yol değil, aynı sayfanın sorgusu
       (?organization=…); dock yalnızca YOLA bakıyor (usePathname sorguyu
       taşımıyor), yani dosya açıkken de Kiracılar vurgulu kalıyor. */
    assert.equal(etkin("/panel/platform/"), "kiracilar");
    assert.equal(etkin("/panel/platform/licenses"), "lisans");
    assert.equal(etkin("/panel/platform/billing"), "abonelik");
    assert.equal(etkin("/panel/platform/payments"), "odemeler");
    assert.equal(etkin("/panel/platform/sozlesmeler"), "sozlesmeler");
    assert.equal(etkin("/panel/platform/subscribers"), "aboneler");
    assert.equal(etkin("/panel/platform/members"), "uyeler");
    assert.equal(etkin("/panel/platform/moduller"), "moduller");
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

  test("hepsi dock'ta: konsolda yalnızca başlatıcıda duran uygulama yok", () => {
    /* Panelde Posta ve Mesajlar dock'ta değil (gün boyu açık tutulan
       ekranlar değil). Konsolun dokuz ekranının hepsi gün içinde gidip
       gelinen ekranlar; birini başlatıcıya saklamak onu kaybetmek olur. */
    assert.equal(uygulamalar.filter((u) => u.yalnizBaslatici).length, 0);
  });
});
