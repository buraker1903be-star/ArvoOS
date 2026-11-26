import { test } from "node:test";
import assert from "node:assert/strict";
import type { CronDurumu } from "../../lib/cron-isleri";
import { OTOMASYON_GRUPLARI, otomasyonlar, sonOtomatikKontrol } from "../../lib/konsol/otomasyonlar";
import { cronIsleri } from "../../lib/cron-isleri";

/*
  Otomasyon kartı yöneticiye "sistem neyi bitirdi" diyor; yanlış yeşil
  rozet, olmayan bir güvenceyi satar. Bu yüzden her satır gerçek cron
  kaydına bağlı ve aşağıdaki kurallar sabitleniyor.
*/

const is = (yol: string, ek: Partial<CronDurumu> = {}): CronDurumu => ({
  yol,
  ad: yol.replace("/api/cron/", ""),
  aciklama: "",
  zamanlama: "*/10 * * * *",
  aralikDk: 10,
  eklendi: "2026-10-01",
  durum: "tamam",
  sonCalisma: new Date("2026-11-26T09:42:00Z"),
  sonBasarili: new Date("2026-11-26T09:42:00Z"),
  sonSonuc: "tamam",
  sureMs: 1200,
  gecikmeDk: null,
  ayrinti: null,
  ...ek,
});

const hepsiTamam = () => [
  is("/api/cron/otomatik-yenileme"),
  is("/api/cron/otomatik-proforma"),
  is("/api/cron/abonelik-hatirlatma"),
  is("/api/cron/arvolab-sync"),
  is("/api/cron/arc-sync"),
  is("/api/cron/randevu-sync"),
];

test("gruplardaki her yol vercel.json'da gerçekten var", () => {
  /* Kart var olmayan bir işi "çalışıyor" gösteremez: yol değişirse ya da
     cron kaldırılırsa bu test düşer. */
  const yollar = new Set(cronIsleri().map((i) => i.yol));
  for (const grup of OTOMASYON_GRUPLARI) {
    for (const yol of grup.yollar) assert.ok(yollar.has(yol), `${yol} vercel.json'da yok`);
  }
});

test("hepsi çalıştıysa işin NE OLDUĞUNA göre etiket", () => {
  const [tahsilat, belgeler, esitleme] = otomasyonlar(hepsiTamam(), [{ yapilandirilmamis: false, kopuk: false }]);
  assert.equal(tahsilat.etiket, "Tamamlandı");
  assert.equal(belgeler.etiket, "Gönderildi");
  assert.equal(esitleme.etiket, "Tamamlandı");
  assert.equal(esitleme.ton, "success");
});

test("tek iş düşerse grup yeşil kalmaz", () => {
  /* "İkisi çalıştı biri düştü" hâli yeşil görünürse kart yalan söyler. */
  const durumlar = hepsiTamam().map((d) =>
    d.yol === "/api/cron/abonelik-hatirlatma" ? { ...d, durum: "dustu" as const } : d);
  const belgeler = otomasyonlar(durumlar)[1];
  assert.equal(belgeler.durum, "mudahale");
  assert.equal(belgeler.ton, "danger");
  assert.match(belgeler.detay, /son koşma düştü/);
});

test("gecikme müdahale ister ve kaç dakika olduğunu yazar", () => {
  const durumlar = hepsiTamam().map((d) =>
    d.yol === "/api/cron/otomatik-yenileme" ? { ...d, durum: "gecikti" as const, gecikmeDk: 94 } : d);
  const tahsilat = otomasyonlar(durumlar)[0];
  assert.equal(tahsilat.durum, "mudahale");
  assert.match(tahsilat.detay, /94 dakika gecikti/);
});

test("kaydı olmayan iş 'kayıt yok' — başarısız değil", () => {
  /* Kayıt tutma 14.10.2026'da başladı; kaydı olmayan iş kırmızı değil. */
  const durumlar = hepsiTamam().map((d) =>
    d.yol === "/api/cron/otomatik-yenileme" ? { ...d, durum: "hic" as const, sonCalisma: null, sonBasarili: null } : d);
  const tahsilat = otomasyonlar(durumlar)[0];
  assert.equal(tahsilat.durum, "kayit_yok");
  assert.equal(tahsilat.ton, "neutral");
  assert.equal(tahsilat.sonCalisma, null);
});

test("köprü kopuksa eşitleme 'yeniden deneniyor', yapılandırılmamışsa 'bağlı değil'", () => {
  const kopuk = otomasyonlar(hepsiTamam(), [{ yapilandirilmamis: false, kopuk: true }])[2];
  assert.equal(kopuk.durum, "yeniden");
  assert.equal(kopuk.ton, "warning");
  assert.match(kopuk.detay, /on dakikada bir/);

  const yok = otomasyonlar(hepsiTamam(), [{ yapilandirilmamis: true, kopuk: true }])[2];
  assert.equal(yok.durum, "bagli_degil");
  assert.equal(yok.ton, "neutral");

  /* Köprü sorunu YALNIZCA eşitleme satırını etkiler. */
  const [tahsilat, belgeler] = otomasyonlar(hepsiTamam(), [{ yapilandirilmamis: true, kopuk: true }]);
  assert.equal(tahsilat.ton, "success");
  assert.equal(belgeler.ton, "success");
});

test("cron düşmüşse köprü sağlam olsa da müdahale yazar", () => {
  /* Sıra önemli: kaydın kendisi düştüyse köprünün iyi olması avutmaz. */
  const durumlar = hepsiTamam().map((d) =>
    d.yol === "/api/cron/arc-sync" ? { ...d, durum: "dustu" as const } : d);
  assert.equal(otomasyonlar(durumlar, [{ yapilandirilmamis: false, kopuk: false }])[2].durum, "mudahale");
});

test("son otomatik kontrol = en yeni BAŞARILI koşma", () => {
  const durumlar = [
    is("/api/cron/arc-sync", { sonBasarili: new Date("2026-11-26T09:42:00Z") }),
    /* Daha yeni ama BAŞARISIZ bir koşma "kontrol edildi" saymaz. */
    is("/api/cron/arvolab-sync", { durum: "dustu", sonCalisma: new Date("2026-11-26T09:52:00Z"), sonBasarili: new Date("2026-11-26T08:12:00Z") }),
  ];
  assert.deepEqual(sonOtomatikKontrol(durumlar), new Date("2026-11-26T09:42:00Z"));
  assert.equal(sonOtomatikKontrol([is("/api/cron/arc-sync", { sonBasarili: null })]), null);
});
