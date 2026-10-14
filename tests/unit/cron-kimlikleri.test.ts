import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { cronIsleri } from "@/lib/cron-isleri";

/*
  ZAMANLANMIŞ İŞİN KİMLİĞİ ÜÇ YERDE AYNI OLMALI.

  Bir cron'un kimliği üç ayrı yerde yazılı:
    1. vercel.json'daki yol — zamanlayıcı bunu çağırıyor,
    2. rotanın klasör adı — çağrılan adres bu,
    3. rotanın içindeki cronRotasi("…") — koşma kaydı bu anahtarla yazılıyor.

  Üçü ayrışabiliyor ve ayrıştığında SESSİZ: 14.10.2026'da /api/cron/
  arvolab-kredi, arvolab-sync olarak yeniden adlandırıldı; dizin,
  vercel.json ve tanım güncellendi ama rotanın içindeki anahtar eski
  kaldı. Sonuç: Vercel işi çağırıyor, iş 200 dönüyor, kaydını da
  yazıyor — ama ESKİ anahtarla. Kayıt, vercel.json'da olmayan bir iş
  adına yazıldığı için ekranda elendi ve iş saatlerce "hiç koşmamış"
  göründü. Ne derleme, ne lint, ne de başka bir denetim gördü.

  cronRotasi'nın "tek çıkış noktası tiple zorlanıyor" tasarımı bu sınıfı
  tutmuyor: tip, kaydın YAZILDIĞINI garanti ediyor, hangi ADLA
  yazıldığını değil.
*/
const CRON_DIZINI = path.resolve(import.meta.dirname, "../../app/api/cron");

function rotaAnahtarlari() {
  return fs.readdirSync(CRON_DIZINI, { withFileTypes: true })
    .filter((g) => g.isDirectory())
    .map((g) => {
      const kaynak = fs.readFileSync(path.join(CRON_DIZINI, g.name, "route.ts"), "utf8");
      const eslesme = /cronRotasi\(\s*"([^"]+)"/.exec(kaynak);
      return { klasor: g.name, anahtar: eslesme?.[1] ?? null };
    });
}

test("her cron rotası koşma kaydını KENDİ yoluyla yazıyor", () => {
  for (const { klasor, anahtar } of rotaAnahtarlari()) {
    assert.ok(anahtar, `${klasor}: cronRotasi çağrısı bulunamadı — koşma kaydı yazılmıyor olabilir`);
    assert.equal(anahtar, `/api/cron/${klasor}`, `${klasor}: kayıt anahtarı klasör adıyla uyuşmuyor`);
  }
});

test("her cron rotasının vercel.json'da bir zamanlaması var", () => {
  const zamanlananlar = new Set(cronIsleri().map((is) => is.yol));
  for (const { klasor } of rotaAnahtarlari()) {
    assert.ok(
      zamanlananlar.has(`/api/cron/${klasor}`),
      `/api/cron/${klasor} rotası var ama vercel.json'da zamanlaması yok: hiç koşmaz`,
    );
  }
});

test("vercel.json'daki her zamanlamanın bir rotası var", () => {
  const klasorler = new Set(rotaAnahtarlari().map((r) => r.klasor));
  for (const is of cronIsleri()) {
    const ad = is.yol.replace("/api/cron/", "");
    assert.ok(klasorler.has(ad), `vercel.json ${is.yol} çağırıyor ama böyle bir rota yok: her koşma 404`);
  }
});
