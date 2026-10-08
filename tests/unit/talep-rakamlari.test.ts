import assert from "node:assert/strict";
import test from "node:test";
import { agirlikliTahmin, aktifTalepler, teklifBekleyen, type TalepSatiri } from "@/lib/talep-rakamlari";

/*
  Ana sayfa "Teklif bekleyen" kartı.

  08.10.2026: kart 0 teklif bekliyor derken altında ₺5.825.811 tahmini değer
  yazıyordu. Tutar tüm aktif taleplerden (52 yeni talep dahil) hesaplanıyordu.
  Sayı ile tutar aynı kümeden gelmeli.
*/

const satir = (stage: string, estimated_value: number | null, probability: number | null): TalepSatiri => ({ stage, estimated_value, probability });

test("teklif bekleyen yoksa tahmin de sıfırdır; yeni talepler karta sızmaz", () => {
  const satirlar = [satir("lead", 1_000_000, 50), satir("lead", 400_000, 20), satir("pre_review", 300_000, 10)];
  assert.deepEqual(teklifBekleyen(satirlar), { adet: 0, tahmin: 0 });
  // Genel tahmin ise hâlâ bütün aktif talepleri kapsar.
  assert.equal(agirlikliTahmin(aktifTalepler(satirlar)), 500_000 + 80_000 + 30_000);
});

test("yalnızca teklif aşamasındakiler sayılır ve tahmine girer", () => {
  const satirlar = [
    satir("proposal_ready", 200_000, 50),
    satir("proposal_approved", 100_000, 80),
    satir("lead", 9_999_999, 100),
    satir("won", 5_000_000, 100),
  ];
  assert.deepEqual(teklifBekleyen(satirlar), { adet: 2, tahmin: 100_000 + 80_000 });
});

test("eksik değer ya da olasılık sıfır sayılır, satır başına yuvarlanır", () => {
  assert.equal(agirlikliTahmin([satir("proposal_ready", null, 50), satir("proposal_ready", 1000, null)]), 0);
  assert.equal(agirlikliTahmin([satir("proposal_ready", 333, 50), satir("proposal_ready", 333, 50)]), 167 + 167);
});

test("kapalı aşamalar aktif sayılmaz", () => {
  const satirlar = [satir("won", 1, 1), satir("lost", 1, 1), satir("completed", 1, 1), satir("lead", 1, 1)];
  assert.deepEqual(aktifTalepler(satirlar).map((s) => s.stage), ["lead"]);
});
