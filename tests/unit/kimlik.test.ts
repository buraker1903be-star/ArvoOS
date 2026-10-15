import assert from "node:assert/strict";
import test from "node:test";
import { kimlikMi } from "@/lib/kimlik";

/*
  Bozuk kimlik çökme ekranı veriyordu: Postgres uuid olmayan değeri
  22P02 ile reddediyor, sayfa da onu okuma hatası sayıp fırlatıyordu
  (16.10.2026, yedi detay sayfasında canlıda ölçüldü).
*/
test("uuid biçimi tanınıyor", () => {
  assert.equal(kimlikMi("97ee8187-1a2b-4c3d-8e4f-0123456789ab"), true);
  assert.equal(kimlikMi("97EE8187-1A2B-4C3D-8E4F-0123456789AB"), true, "büyük harf de uuid");
});

test("kırpılmış ve bozuk değerler kimlik değil", () => {
  // Satır sonuna denk gelip yarım giden bağlantı.
  assert.equal(kimlikMi("4f0c6edb-a539-4de4-a080"), false);
  assert.equal(kimlikMi("abc"), false);
  assert.equal(kimlikMi("97ee8187-xxxx-4c3d-8e4f-0123456789ab"), false);
  assert.equal(kimlikMi("97ee8187-1a2b-4c3d-8e4f-0123456789ab "), false, "boşluk sorguya gitmemeli");
  assert.equal(kimlikMi(""), false);
  assert.equal(kimlikMi(undefined), false);
  assert.equal(kimlikMi(null), false);
});
