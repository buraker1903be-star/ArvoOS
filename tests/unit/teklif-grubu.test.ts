import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { teklifGrubu } from "@/lib/teklif-grubu";

/* Teklifler listesindeki süzgeç grubu. */

const t = (status: string, archive_reason: string | null = null, superseded_by: string | null = null) => ({ status, archive_reason, superseded_by });

test("taslak ve gönderilen aktif gruplarda", () => {
  assert.equal(teklifGrubu(t("draft")), "draft");
  assert.equal(teklifGrubu(t("sent")), "sent");
});

test("kabul/ret/süre: durumdan ya da arşiv sebebinden", () => {
  assert.equal(teklifGrubu(t("accepted")), "accepted");
  assert.equal(teklifGrubu(t("archived", "accepted")), "accepted");
  assert.equal(teklifGrubu(t("archived", "rejected")), "rejected");
  assert.equal(teklifGrubu(t("archived", "expired")), "expired");
  // Eskiden hiçbir listede görünmüyordu
  assert.equal(teklifGrubu(t("expired")), "expired");
});

test("yeni revizyonla değişen teklif aktif değil", () => {
  assert.equal(teklifGrubu(t("sent", null, "yeni-id")), "eski");
});

test("sebepsiz arşiv ve bilinmeyen durum arşivde", () => {
  assert.equal(teklifGrubu(t("archived", "invalid")), "arsiv");
  assert.equal(teklifGrubu(t("archived")), "arsiv");
});

/*
  ORTAK TABLO. Aynı örnekler veritabanındaki crm_proposals.teklif_grubu
  sütununa da uygulanıyor (tests/db/teklif-grubu-sutunu.test.mjs).
  Kural iki yerde yaşıyor; tek bir tablo ikisini birden sabitliyor:
  biri değişip öteki kalırsa testlerden biri kırılır.
*/
test("ortak örnek tablosu: TypeScript tarafı", async () => {
  const { ornekler } = JSON.parse(
    await readFile(new URL("../fixtures/teklif-gruplari.json", import.meta.url), "utf8"),
  ) as { ornekler: { ad: string; status: string; archive_reason: string | null; eskiyen: boolean; grup: string }[] };
  assert.ok(ornekler.length >= 10, "örnek tablosu daraltılmış");
  for (const ornek of ornekler) {
    assert.equal(
      teklifGrubu({
        status: ornek.status,
        archive_reason: ornek.archive_reason,
        superseded_by: ornek.eskiyen ? "00000000-0000-4000-8000-000000000001" : null,
      }),
      ornek.grup,
      ornek.ad,
    );
  }
});
