import assert from "node:assert/strict";
import test from "node:test";
import { basHarf, depodakiSimgeMi, harfSimgesiSvg, kurumSimgeleri, simgeSurumu } from "../../lib/kurum-simgesi.ts";

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

const KURUM = "11111111-2222-4333-8444-555555555555";
const DEPO = "https://abc.supabase.co";
const SIMGE = `${DEPO}/storage/v1/object/public/organization-assets/${KURUM}/favicon.png?v=1`;

test("sayfa etiketi her zaman BİZİM adresimizi gösteriyor; depo adresi ve logo değil", () => {
  const yuklu = kurumSimgeleri({ name: "AM", primary_color: "#123456", favicon_url: SIMGE });
  assert.match(yuklu.icon, /^\/kurum-simgesi\?v=[0-9a-z]+$/);
  assert.equal(yuklu.apple, yuklu.icon);
  const harf = kurumSimgeleri({ name: "AM", primary_color: "#123456", favicon_url: null });
  assert.match(harf.icon, /^\/kurum-simgesi\?v=/);
});

test("sürüm, simge ya da renk değişince değişiyor (tarayıcı önbelleği tazelensin)", () => {
  const a = simgeSurumu({ name: "AM", primary_color: "#123456" });
  assert.notEqual(a, simgeSurumu({ name: "AM", primary_color: "#654321" }));
  assert.notEqual(simgeSurumu({ name: "AM", primary_color: null, favicon_url: SIMGE }), simgeSurumu({ name: "AM", primary_color: null, favicon_url: SIMGE.replace("v=1", "v=2") }));
  assert.equal(a, simgeSurumu({ name: "AM", primary_color: "#123456" }));
});

test("sunucu yalnızca kendi deposundaki, o kurumun simge dosyasını indiriyor", () => {
  assert.equal(depodakiSimgeMi(SIMGE, DEPO, KURUM), true);
  // Başka kurumun dosyası, başka dosya, başka alan adı, http, iç ağ: hayır.
  assert.equal(depodakiSimgeMi(SIMGE, DEPO, "99999999-2222-4333-8444-555555555555"), false);
  assert.equal(depodakiSimgeMi(SIMGE.replace("favicon.png", "logo.png"), DEPO, KURUM), false);
  assert.equal(depodakiSimgeMi(SIMGE.replace("abc.supabase.co", "evil.com"), DEPO, KURUM), false);
  assert.equal(depodakiSimgeMi(SIMGE.replace("https:", "http:"), DEPO, KURUM), false);
  assert.equal(depodakiSimgeMi("https://169.254.169.254/latest/meta-data", DEPO, KURUM), false);
  assert.equal(depodakiSimgeMi(SIMGE, null, KURUM), false);
  assert.equal(depodakiSimgeMi(null, DEPO, KURUM), false);
});

test("harf simgesi: geçersiz renkte panel vurgusu, açık zeminde koyu yazı", () => {
  assert.ok(harfSimgesiSvg("A", "kırmızı").includes(`fill="#8e6d33"`));
  assert.ok(harfSimgesiSvg("A", "#ffffff").includes(`fill="#0d2138"`));
  assert.ok(harfSimgesiSvg("A", "#0b1b2e").includes(`fill="#ffffff"`));
});
