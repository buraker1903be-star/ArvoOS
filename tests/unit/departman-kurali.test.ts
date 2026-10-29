import assert from "node:assert/strict";
import test from "node:test";
import { adDegisikligiEngeli, departmanTipi } from "@/lib/departman-kurali";

/* DEPARTMAN KURALLARI: yönetim adına giren/çıkan yeniden adlandırma yalnızca Kurum Sahibi'nin. */

test("yönetim adına çevirmek ve yönetimden çıkarmak Kurum Sahibi'ne kalır", () => {
  assert.match(adDegisikligiEngeli("Satış", "Yönetim", false) ?? "", /Kurum Sahibi yapar/);
  assert.match(adDegisikligiEngeli("Yönetim Kurulu", "Satış", false) ?? "", /yetkisini kaldırır/);
  assert.equal(adDegisikligiEngeli("Satış", "Yönetim", true), null);
});

test("yönetim durumunu değiştirmeyen ad değişikliği serbest", () => {
  assert.equal(adDegisikligiEngeli("Satış", "Satış ve Pazarlama", false), null);
  assert.equal(adDegisikligiEngeli("Yönetim", "Yönetici Ekip", false), null);
});

test("tür adı yetki anlamını söyler", () => {
  assert.equal(departmanTipi("Yönetim").tur, "yonetim");
  assert.equal(departmanTipi("Satış Departmanı").tur, "satis");
  assert.equal(departmanTipi("Operasyon").tur, "operasyon");
  assert.equal(departmanTipi("Muhasebe").tur, "genel");
});
