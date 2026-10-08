import assert from "node:assert/strict";
import test from "node:test";
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
