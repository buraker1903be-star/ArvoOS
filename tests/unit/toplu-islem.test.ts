import assert from "node:assert/strict";
import test from "node:test";
import { csvHucresi, csvMetni, csvTutar } from "@/lib/csv";
import { hatirlatmaPostasi, kalemCumlesi } from "@/lib/abonelik-hatirlatma-postasi";

test("CSV: noktalı virgül, BOM, tırnaklama ve formül enjeksiyonu", () => {
  const m = csvMetni(["Ad", "Tutar"], [["Şirket; A.Ş.", csvTutar(123450)], ['"Tırnak"', null], ["=HYPERLINK(1)", "-5"]]);
  assert.ok(m.startsWith("﻿Ad;Tutar\r\n"));
  assert.ok(m.includes('"Şirket; A.Ş.";1234,50'));
  assert.ok(m.includes('"""Tırnak""";'));
  assert.ok(m.includes("'=HYPERLINK(1);'-5"));
  assert.equal(csvHucresi(-5), "-5", "sayı olarak gelen eksi formül değil");
  assert.equal(csvTutar(null), "");
});

test("hatırlatma cümlesi kalan güne göre", () => {
  const k = { urunAdi: "ArvoOS", bitis: "2026-11-01", deneme: false, tutar: 719000 };
  assert.equal(kalemCumlesi(k, "2026-10-29"), "ArvoOS aboneliğinizin dönemi 01.11.2026 tarihinde (3 gün sonra) sona eriyor · aylık ₺7.190,00 (KDV dahil).");
  assert.match(kalemCumlesi(k, "2026-11-01"), /bugün sona eriyor/);
  assert.match(kalemCumlesi({ ...k, deneme: true, tutar: null }, "2026-11-03"), /^ArvoOS deneme süreniz 01\.11\.2026 tarihinde sona erdi\.$/);
});

test("hatırlatma postası: konu geçmiş döneme göre, iki biçim aynı, kaçırılmış", () => {
  const p = hatirlatmaPostasi({ muhatap: "A <b>", kalemler: [{ urunAdi: "ArvoLab", bitis: "2026-10-20", deneme: false, tutar: null }], adres: "https://app.arvo-os.com/panel/billing", bugun: "2026-10-29", satici: "Arvo" });
  assert.equal(p.konu, "Abonelik döneminiz sona erdi");
  for (const parca of ["20.10.2026", "app.arvo-os.com/panel/billing"]) { assert.ok(p.metin.includes(parca)); assert.ok(p.html.includes(parca)); }
  assert.ok(p.html.includes("A &lt;b&gt;") && !p.html.includes("A <b>"));
});
