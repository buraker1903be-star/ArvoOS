import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sozlesmeGrubu } from "@/lib/sozlesme-grubu";

/* Sözleşmeler listesindeki süzgeç grubu. */

const s = (status: string, workflow_id: string | null = null) => ({ status, workflow_id });

test("taslak ve imza bekleyen", () => {
  assert.equal(sozlesmeGrubu(s("draft"), false), "draft");
  assert.equal(sozlesmeGrubu(s("sent"), false), "sent");
});

test("imzalı: iş açılmadıysa aktif, açıldıysa operasyonda", () => {
  assert.equal(sozlesmeGrubu(s("signed"), false), "imzali");
  assert.equal(sozlesmeGrubu(s("signed", "w"), false), "operasyonda");
});

test("tamamlanan sözleşme ya da işi tamamlanan", () => {
  assert.equal(sozlesmeGrubu(s("completed"), false), "tamam");
  assert.equal(sozlesmeGrubu(s("signed", "w"), true), "tamam");
});

test("reddedilen ve iptal edilen kendi grubunda", () => {
  assert.equal(sozlesmeGrubu(s("rejected"), false), "rejected");
  assert.equal(sozlesmeGrubu(s("cancelled", "w"), true), "cancelled");
});

/*
  ORTAK TABLO. Aynı örnekler crm_sozlesme_liste görünümünün
  sozlesme_grubu sütununa da uygulanıyor
  (tests/db/sozlesme-liste-gorunumu.test.mjs). Kural iki yerde
  yaşıyor; tek bir tablo ikisini birden sabitliyor.
*/
test("ortak örnek tablosu: TypeScript tarafı", async () => {
  const { ornekler } = JSON.parse(
    await readFile(new URL("../fixtures/sozlesme-gruplari.json", import.meta.url), "utf8"),
  ) as { ornekler: { ad: string; status: string; is_durumu: string | null; grup: string }[] };
  assert.ok(ornekler.length >= 8, "örnek tablosu daraltılmış");
  for (const ornek of ornekler) {
    assert.equal(
      sozlesmeGrubu(
        { status: ornek.status, workflow_id: ornek.is_durumu ? "is-1" : null },
        ornek.is_durumu === "completed" || ornek.is_durumu === "archived",
      ),
      ornek.grup,
      ornek.ad,
    );
  }
});
