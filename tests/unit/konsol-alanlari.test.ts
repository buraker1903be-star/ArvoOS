import assert from "node:assert/strict";
import test from "node:test";
import { alanAcik, alanSecimi, kapsamOku, KONSOL_ALANLARI, uygulamalariSuz } from "@/lib/konsol-alanlari";
import { konsolUygulamalari } from "@/app/panel/os/konsol-apps";

test("alanlar dock'un iş alanlarıyla birebir aynı", () => {
  /* Kurucu menüde gördüğü uygulamayı açabilmeli: dock'a yeni bir uygulama
     eklenip alan kataloğuna eklenmezse kısıtlı kurucu onu hiç göremez,
     tam yetkili ise kısıtlayamaz. */
  const dock = konsolUygulamalari().map((u) => u.key).filter((k) => k !== "home");
  assert.deepEqual(dock, KONSOL_ALANLARI.map((a) => a.kod));
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
  assert.equal(uygulamalariSuz(konsolUygulamalari(), null).length, konsolUygulamalari().length);
});

test("form seçimi geçerli, tekrarsız ve katalog sırasında", () => {
  assert.deepEqual(alanSecimi(["sistem", "finans", "finans", "yok"]), ["finans", "sistem"]);
  assert.deepEqual(alanSecimi([]), []);
});
