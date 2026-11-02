import assert from "node:assert/strict";
import test from "node:test";
import { basariOrani, kosuOzeti, sureMetni, type Kosu } from "@/lib/cron-gecmisi";

/* Zamanlanmış işin çalışma geçmişi (lib/cron-gecmisi.ts, 02.11.2026). */
const k = (sonuc: Kosu["sonuc"], basladi_at: string, sure_ms: number | null = 1000): Kosu => ({ sonuc, basladi_at, sure_ms });

test("süren başarısızlık dizisi ve başladığı an", () => {
  const o = kosuOzeti([
    k("hata", "2026-11-02T12:10:00Z"),
    k("eksik", "2026-11-02T12:00:00Z"),
    k("hata", "2026-11-02T11:50:00Z"),
    k("tamam", "2026-11-02T11:40:00Z"),
    k("hata", "2026-11-02T11:30:00Z"),
  ]);
  assert.equal(o.ardisikHata, 3);
  // "Ne zamandan beri": dizinin en eski çalışması, tamamdan sonraki ilk düşüş.
  assert.equal(o.hataBaslangici, "2026-11-02T11:50:00Z");
  assert.equal(o.diziPencereyiAsiyor, false);
});

test("son çalışma başarılıysa dizi yok; hepsi düşmüşse başlangıç pencerenin dışında olabilir", () => {
  assert.deepEqual(kosuOzeti([k("tamam", "2026-11-02T12:00:00Z"), k("hata", "2026-11-02T11:00:00Z")]).ardisikHata, 0);
  const hepsi = kosuOzeti([k("hata", "2026-11-02T12:00:00Z"), k("hata", "2026-11-02T11:00:00Z")]);
  assert.equal(hepsi.diziPencereyiAsiyor, true);
  assert.equal(kosuOzeti([]).hataBaslangici, null);
});

test("ortalama süre yalnızca yazılmış sürelerden; oran ve süre yazımı", () => {
  assert.equal(kosuOzeti([k("tamam", "a", 1000), k("tamam", "b", null), k("tamam", "c", 3000)]).ortalamaMs, 2000);
  assert.equal(kosuOzeti([k("tamam", "a", null)]).ortalamaMs, null);
  assert.equal(basariOrani(0, 0), null);
  assert.equal(basariOrani(720, 684), 95);
  assert.equal(sureMetni(850), "850 ms");
  assert.equal(sureMetni(2500), "2,5 sn");
  assert.equal(sureMetni(180_000), "3 dk");
});
