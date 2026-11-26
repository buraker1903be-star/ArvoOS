import assert from "node:assert/strict";
import test from "node:test";
import { alanAcik, alanSecimi, kapsamOku, kendiKurumuEngeli, KONSOL_ALANLARI, uygulamalariSuz } from "@/lib/konsol-alanlari";
import { konsolUygulamalari } from "@/app/panel/os/konsol-apps";

test("menüdeki her girdinin yetki alanı katalogda var", () => {
  /* Kurucu menüde gördüğü uygulamayı açabilmeli: menüye yeni bir girdi
     eklenip alan kataloğuna eklenmezse kısıtlı kurucu onu hiç göremez,
     tam yetkili ise kısıtlayamaz.

     Girdinin alanı normalde anahtarıyla aynı; "Otomasyonlar"
     (26.11.2026) kendi ekranı olmayan bir girdi ve sistem sağlığının
     sekmesini açıyor — alanı "sistem". Bu yüzden karşılaştırma
     ANAHTAR değil ALAN üzerinden. */
  const alanlar = konsolUygulamalari()
    .filter((u) => u.key !== "home")
    .map((u) => u.alan ?? u.key);
  const katalog = KONSOL_ALANLARI.map((a) => a.kod);
  for (const alan of alanlar) assert.ok(katalog.includes(alan as never), `${alan} katalogda yok`);
  /* Katalogdaki her alanın da bir girdisi olmalı: kısıtlanabilen ama
     menüde görünmeyen alan, kapatıldığında hiçbir şeyi değiştirmez. */
  for (const kod of katalog) assert.ok(alanlar.includes(kod), `${kod} menüde yok`);
});

test("satır yoksa tam yetki; bozuk satır kimseyi genişletmez", () => {
  assert.equal(kapsamOku(null), null);
  assert.equal(kapsamOku(undefined), null);
  const bozuk = kapsamOku({ alanlar: ["muhasebe", 3] });
  assert.ok(bozuk !== null);
  assert.equal(bozuk.size, 0);
  assert.equal(alanAcik(bozuk, "finans"), false);
  assert.equal(alanAcik(null, "sistem"), true);
});

test("dock süzgeci: ana ekran kalır, kapalı alan düşer", () => {
  const kapsam = kapsamOku({ alanlar: ["destek"] });
  assert.deepEqual(uygulamalariSuz(konsolUygulamalari(), kapsam).map((u) => u.key), ["home", "destek"]);
  /* "Otomasyonlar" sistem yetkisine bağlı: sistemi olan görür, olmayan görmez. */
  const sistemli = kapsamOku({ alanlar: ["sistem"] });
  assert.deepEqual(uygulamalariSuz(konsolUygulamalari(), sistemli).map((u) => u.key), ["home", "otomasyonlar", "sistem"]);
  assert.equal(uygulamalariSuz(konsolUygulamalari(), null).length, konsolUygulamalari().length);
});

test("form seçimi geçerli, tekrarsız ve katalog sırasında", () => {
  assert.deepEqual(alanSecimi(["sistem", "finans", "finans", "yok"]), ["finans", "sistem"]);
  assert.deepEqual(alanSecimi([]), []);
});

test("konsolun kendi kurumu yalnızca tam yetkiliye açık", () => {
  /* Kısıtlı kurucu "Müşteriler" işlemleriyle ArvoOS kurumunun üyeliğine
     dokunup tam yetkiliyi kapatabiliyordu. */
  const kisitli = kapsamOku({ alanlar: ["musteriler"] });
  assert.ok(kendiKurumuEngeli(kisitli, "arvo", "arvo"));
  assert.equal(kendiKurumuEngeli(null, "arvo", "arvo"), null);
  assert.equal(kendiKurumuEngeli(kisitli, "musteri", "arvo"), null);
});
