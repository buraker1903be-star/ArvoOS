import assert from "node:assert/strict";
import test from "node:test";
import { CEVRIMICI_ESIGI_MS, portalDurumu, zamanYazisi } from "../../lib/portal-ziyareti.ts";

/*
  MÜŞTERİ TAKİP PORTALI ZİYARETİ (lib/portal-ziyareti): kayıt yoksa
  "hiç girmedi", son 70 sn'de görüldüyse çevrimiçi, değilse son görülme.
*/

const simdi = Date.parse("2026-10-12T11:00:00Z"); // Türkiye 14:00
const kayit = (sonGorulme: number) => ({
  first_login_at: "2026-10-01T07:00:00Z", last_login_at: "2026-10-12T10:58:00Z", login_count: 5,
  last_seen_at: new Date(sonGorulme).toISOString(),
});

test("kayıt yoksa müşteri hiç girmemiş", () => {
  assert.deepEqual(portalDurumu(null, simdi), { tur: "hic" });
});

test("son 70 sn'de görüldüyse çevrimiçi (20 sn'lik yenilemenin iki kaçırma payı)", () => {
  assert.equal(portalDurumu(kayit(simdi - 20_000), simdi).tur, "cevrimici");
  assert.equal(portalDurumu(kayit(simdi - CEVRIMICI_ESIGI_MS), simdi).tur, "cevrimici");
  const d = portalDurumu(kayit(simdi - CEVRIMICI_ESIGI_MS - 1), simdi);
  assert.equal(d.tur, "cevrimdisi");
  if (d.tur === "cevrimdisi") assert.equal(d.girisSayisi, 5);
});

test("saat farkı: sunucu saati biraz ileride olsa da çevrimiçi; çok ileride ise değil", () => {
  assert.equal(portalDurumu(kayit(simdi + 3_000), simdi).tur, "cevrimici");
  assert.equal(portalDurumu(kayit(simdi + 60_000), simdi).tur, "cevrimdisi");
});

test("zaman yazısı Türkiye günüyle: bugün, dün, tarih (başka yılda yıl da)", () => {
  assert.equal(zamanYazisi("2026-10-12T10:58:00Z", simdi), "bugün 13:58");
  // UTC'de 11 Ekim 21:30 → Türkiye'de 12 Ekim 00:30: bugün.
  assert.equal(zamanYazisi("2026-10-11T21:30:00Z", simdi), "bugün 00:30");
  assert.equal(zamanYazisi("2026-10-11T06:12:00Z", simdi), "dün 09:12");
  assert.equal(zamanYazisi("2026-10-08T11:03:00Z", simdi), "8 Eki 14:03");
  assert.equal(zamanYazisi("2025-12-30T11:03:00Z", simdi), "30 Ara 2025 14:03");
  assert.equal(zamanYazisi("bozuk", simdi), "—");
});
