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
    /* Kiracı dosyaları kaldırıldı (14.10.2026): /panel/platform yalnızca
       Müşteriler'e yönlendiriyor; dosya müşteri detayının penceresi. */
    assert.equal(etkin("/panel/platform/musteriler/8f0e1c2a-0000-4000-8000-000000000000"), "musteriler");

    assert.equal(etkin("/panel/platform/musteriler"), "musteriler");
    assert.equal(etkin("/panel/platform/kullanicilar"), "musteriler");

    assert.equal(etkin("/panel/platform/urunler"), "urunler");
    assert.equal(etkin("/panel/platform/urunler/arc"), "urunler");
    assert.equal(etkin("/panel/platform/moduller"), "urunler");
    assert.equal(etkin("/panel/platform/subscribers"), "urunler");

    assert.equal(etkin("/panel/platform/fiyatlar"), "fiyatlar");

    assert.equal(etkin("/panel/platform/billing"), "abonelikler");
    assert.equal(etkin("/panel/platform/sozlesmeler"), "abonelikler");

    assert.equal(etkin("/panel/platform/tahsilat"), "tahsilat");
    assert.equal(etkin("/panel/platform/payments"), "tahsilat");

    assert.equal(etkin("/panel/platform/ayarlar"), "ayarlar");
    assert.equal(etkin("/panel/platform/saglik"), "ayarlar");
  });

  test("her bölüm gerçek bir adrese gidiyor ve uygulamasının yolunda", () => {
    /* Bölüm, uygulamanın yollarından birinin altında olmazsa o bölüme
       geçildiğinde dock başka bir uygulamayı vurgular. */
    for (const uygulama of uygulamalar) {
      for (const bolum of uygulama.bolumler ?? []) {
        // Sorgu ve çapa (#bölüm) yolun parçası değil; dock yalnızca yola bakıyor.
        const yol = bolum.href.split(/[?#]/)[0];
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

  test("dock kurum sahibinin tarif ettiği sekiz ana menü", () => {
    /* İlk sürümde konsolun dokuz ekranı dokuz dock girdisiydi ve dock
       bir başlatıcıya dönüşmüştü. Girdiler EKRAN değil iş alanı
       (14.10.2026, sekiz ana menü); yeni bir ekran eklenince dock'a
       girdi eklemek yerine ilgili menünün bölümlerine inmeli. Sayı
       büyümeye başlarsa bu test söyler. */
    assert.deepEqual(
      uygulamalar.filter((u) => !u.yalnizBaslatici).map((u) => u.label),
      ["Genel Bakış", "Ürünler", "Müşteriler", "Kurulum", "Ücret ve Paketler", "Abonelikler", "Faturalama ve Tahsilat", "Sistem Ayarları"],
    );
  });
});

/*
  Ctrl+K konsolda yalnızca ekran ve komut adlarını buluyordu: kurucu
  kiracı adı yazınca hiçbir sonuç görmüyordu, oysa konsolda en çok
  tekrarlanan gezinme "şu kurumun dosyasını aç" (14.10.2026). Kutu
  yazılanı Müşteriler listesine aratıyor; o sayfa `?ara=` ile süzüyor.
*/
describe("konsolda kayıt araması", () => {
  const adres = (sorgu: string) => `/panel/platform/musteriler?ara=${encodeURIComponent(sorgu)}`;

  test("arama adresi Müşteriler listesinin süzgecine gidiyor", () => {
    assert.equal(adres("Akademik"), "/panel/platform/musteriler?ara=Akademik");
    assert.equal(etkinUygulama(konsolUygulamalari(), "/panel/platform/musteriler")?.key, "musteriler");
  });

  test("Türkçe karakter ve boşluk adreste kaçırılıyor", () => {
    /* Kaçırılmazsa "Şişli Güzellik" sorgusu adresi bozar ve liste boş
       döner — arama çalışmıyor sanılır. */
    assert.equal(adres("Şişli Güzellik"), "/panel/platform/musteriler?ara=%C5%9Ei%C5%9Fli%20G%C3%BCzellik");
  });
});

/*
  Kiracı dekont gönderdiğinde ya da sözleşme imzalandığında kurucuya
  hiçbir yerden haber gitmiyordu: bekleyen işi görmenin tek yolu ilgili
  ekranı açmaktı. Dock rozeti panelde zaten vardı (posta, mesajlar),
  konsolda kullanılmıyordu (14.10.2026).
*/
describe("konsol dock rozetleri", () => {
  const rozet = (bekleyen?: { odeme?: number; sozlesme?: number }) =>
    Object.fromEntries(konsolUygulamalari(bekleyen).filter((u) => u.rozet).map((u) => [u.key, u.rozet]));

  test("bekleyen iş yoksa rozet çizilmiyor", () => {
    assert.deepEqual(rozet(), {});
    assert.deepEqual(rozet({ odeme: 0, sozlesme: 0 }), {});
  });

  test("dekont kuyruğu Faturalama'da, sözleşme kuyruğu Abonelikler'de", () => {
    assert.deepEqual(rozet({ odeme: 3, sozlesme: 2 }), { abonelikler: 2, tahsilat: 3 });
  });

  test("yalnızca biri doluysa yalnızca o rozetleniyor", () => {
    assert.deepEqual(rozet({ odeme: 1 }), { tahsilat: 1 });
    assert.deepEqual(rozet({ sozlesme: 4 }), { abonelikler: 4 });
  });

  test("eksi ve küsuratlı sayı rozete sızmıyor", () => {
    /* Okuma düşerse çağıran 0 geçiyor; yine de uydurma bir değer
       gelirse rozet negatif ya da "2,4" yazmamalı. */
    assert.deepEqual(rozet({ odeme: -5 }), {});
    assert.deepEqual(rozet({ odeme: 2.6 }), { tahsilat: 3 });
  });
});
