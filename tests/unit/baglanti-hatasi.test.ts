/*
  Sunucu işleminin isteği koptuğunda (lib/baglanti-hatasi, F6 PR7). Eskiden
  "Failed to fetch" yakalanmıyordu: gerçek Next.js'te yanıtı kaybolan istek
  kaydı yazdı, ekran hiçbir şey söylemedi.
*/
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { BAGLANTI_KOPTU, baglantiHatasiMi } from "@/lib/baglanti-hatasi";

test("tarayıcıların ağ hatası biçimleri bağlantı hatası sayılır", () => {
  for (const mesaj of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed", "fetch failed"]) {
    assert.equal(baglantiHatasiMi(new TypeError(mesaj)), true, mesaj);
  }
});

test("sunucunun verdiği hata ve başka türler bağlantı hatası SAYILMAZ (yutulmasın)", () => {
  assert.equal(baglantiHatasiMi(new Error("Puan doğrulanamadı")), false);
  assert.equal(baglantiHatasiMi(new TypeError("x is not a function")), false);
  assert.equal(baglantiHatasiMi("Failed to fetch"), false);
  assert.equal(baglantiHatasiMi(undefined), false);
});

test("mesaj 'olmadı' değil 'bilinmiyor' diyor ve güvenli yolu söylüyor", () => {
  assert.match(BAGLANTI_KOPTU, /bilinmiyor/);
  assert.match(BAGLANTI_KOPTU, /ikinci kez oluşmaz/);
});

test("formlar kopmayı yakalıyor; faaliyet formu anahtarı silmiyor; başka hata yeniden fırlatılıyor", () => {
  const oku = (p: string) => fs.readFileSync(path.resolve(import.meta.dirname, "../..", p), "utf8");
  const form = oku("app/panel/docentlik/faaliyet-formu.tsx");
  assert.match(form, /catch \(hata\) \{[\s\S]*?if \(!baglantiHatasiMi\(hata\)\) throw hata;\s*setAgHatasi\(BAGLANTI_KOPTU\);/);
  const yakala = form.slice(form.indexOf("catch (hata)"), form.indexOf("finally", form.indexOf("catch (hata)")));
  assert.ok(!/anahtar\.current = null/.test(yakala), "kopmada istek anahtarı silinmemeli");
  assert.match(oku("app/panel/docentlik/islem-formu.tsx"), /if \(!baglantiHatasiMi\(hata\)\) throw hata;\s*setAgHatasi\(BAGLANTI_KOPTU_GENEL\);/);
  assert.match(oku("app/panel/docentlik/belge.tsx"), /catch \(hata\) \{ if \(!baglantiHatasiMi\(hata\) \|\| !kopunca\) throw hata; kopunca\(BAGLANTI_KOPTU_GENEL\); \}/);
});
