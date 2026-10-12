import assert from "node:assert/strict";
import test from "node:test";
import { basHarf, harfSimgesiSvg, kurumSimgeleri } from "../../lib/kurum-simgesi.ts";

/*
  KURUMUN SEKME SİMGESİ (lib/kurum-simgesi). Eskiden sekmede yatay logo
  16×16'ya sıkıştırılıyordu; artık kare simge ya da baş harf.
*/

test("baş harf Türkçe büyük harfle, baştaki işaretler atlanıyor", () => {
  assert.equal(basHarf("istanbul Akademi"), "İ");
  assert.equal(basHarf("ışık Yayın"), "I");
  assert.equal(basHarf("  «Akademik» Merkez"), "A");
  assert.equal(basHarf("3D Atölye"), "3");
  assert.equal(basHarf(""), "•");
  assert.equal(basHarf(null), "•");
});

test("yüklenen kare simge varsa o kullanılıyor; logo hiçbir durumda kullanılmıyor", () => {
  const adres = "https://x.supabase.co/storage/v1/object/public/organization-assets/k/favicon.png?v=1";
  assert.deepEqual(kurumSimgeleri({ name: "AM", primary_color: "#123456", favicon_url: adres }), { icon: adres, apple: adres });
  const harf = kurumSimgeleri({ name: "AkademikMerkez", primary_color: "#123456", favicon_url: null });
  assert.ok(harf.icon.startsWith("data:image/svg+xml,"));
  assert.ok(decodeURIComponent(harf.icon).includes(">A</text>"));
});

test("https olmayan simge adresi yok sayılıyor (javascript:, http:)", () => {
  for (const kotu of ["javascript:alert(1)", "http://x.com/a.png", "bozuk"]) {
    assert.ok(kurumSimgeleri({ name: "AM", primary_color: null, favicon_url: kotu }).icon.startsWith("data:image/svg+xml,"));
  }
});

test("harf simgesi: geçersiz renkte panel vurgusu, açık zeminde koyu yazı", () => {
  assert.ok(harfSimgesiSvg("A", "kırmızı").includes(`fill="#8e6d33"`));
  assert.ok(harfSimgesiSvg("A", "#ffffff").includes(`fill="#0d2138"`));
  assert.ok(harfSimgesiSvg("A", "#0b1b2e").includes(`fill="#ffffff"`));
});
