import assert from "node:assert/strict";
import test from "node:test";
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
