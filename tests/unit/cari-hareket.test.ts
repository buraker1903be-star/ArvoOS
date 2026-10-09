import assert from "node:assert/strict";
import test from "node:test";
import { degisiklikDenetle, elleGirilenTur, type CariHareket } from "@/lib/cari-hareket";

const h = (p: Partial<CariHareket>): CariHareket => ({ entry_type: "credit", source_type: "payment", reference_no: null, description: "Müşteri tahsilatı", amount: 100000, ...p });

test("elle girilen tahsilat, iade ve ek hizmet tanınır; elle yazılan referans engel değil", () => {
  assert.equal(elleGirilenTur(h({ reference_no: "TAH:0b0e7c39-1a2b-4c3d-8e9f-001122334455" })), "tahsilat");
  assert.equal(elleGirilenTur(h({ reference_no: "Dekont 4471" })), "tahsilat");
  assert.equal(elleGirilenTur(h({ entry_type: "debit", source_type: "adjustment", description: "Müşteri iadesi · fazla ödeme" })), "iade");
  assert.equal(elleGirilenTur(h({ entry_type: "debit", source_type: "manual", description: "Ek hizmet · Çeviri" })), "ek-hizmet");
});

test("başka kayda bağlı hareketler kilitli", () => {
  assert.equal(elleGirilenTur(h({ reference_no: "PAYTR-ARVO123" })), null);
  assert.equal(elleGirilenTur(h({ description: "PayTR tahsilatı · SOZ-1 1. taksit" })), null);
  assert.equal(elleGirilenTur(h({ reference_no: "FIN:abc" })), null);
  assert.equal(elleGirilenTur(h({ description: "SOZ-2026-000001 fatura tahsilatı" })), null);
  assert.equal(elleGirilenTur(h({ description: "Tahsilat - Tez", reference_no: "SOZ-2026-000001" })), null);
  assert.equal(elleGirilenTur(h({ entry_type: "debit", source_type: "crm_contract", description: "Sözleşme" })), null);
  assert.equal(elleGirilenTur(h({ entry_type: "debit", source_type: "manual", description: "Finans kaydı" })), null);
  // Ödeme olayına bağlı (payment_provider_events) her hareket kilitli.
  assert.equal(elleGirilenTur(h({}), true), null);
});

test("tahsilat düzeltmesi açık bakiyeyi aşamaz; azaltma serbest", () => {
  const ozet = { borc: 4500000, tahsilat: 1500000, iade: 0 };
  assert.equal(degisiklikDenetle("tahsilat", 1500000, 4500000, ozet), null);
  assert.equal(degisiklikDenetle("tahsilat", 1500000, 4500001, ozet), "Tahsilat açık cari bakiyesini aşamaz.");
  assert.equal(degisiklikDenetle("tahsilat", 1500000, 100, ozet), null);
});

test("tahsilat silinince ya da azalınca iade tahsilatı aşamaz", () => {
  const ozet = { borc: 4500000, tahsilat: 1500000, iade: 500000 };
  assert.match(degisiklikDenetle("tahsilat", 1500000, null, ozet) ?? "", /iadeler tahsilatı aşıyor/);
  assert.equal(degisiklikDenetle("tahsilat", 1500000, 500000, ozet), null);
  assert.equal(degisiklikDenetle("iade", 500000, 1500001, ozet), "İade tutarı net tahsilatı aşamaz.");
  assert.equal(degisiklikDenetle("iade", 500000, null, ozet), null);
});

test("ek hizmet azalınca/silinince tahsilat borcu aşamaz", () => {
  const ozet = { borc: 5000000, tahsilat: 4800000, iade: 0 };
  assert.match(degisiklikDenetle("ek-hizmet", 500000, null, ozet) ?? "", /tahsilat borcu aşıyor/);
  assert.equal(degisiklikDenetle("ek-hizmet", 500000, 300000, ozet), null);
  assert.equal(degisiklikDenetle("ek-hizmet", 500000, 900000, ozet), null);
  assert.equal(degisiklikDenetle("ek-hizmet", 500000, 0, ozet), "Tutar sıfırdan büyük olmalı.");
});
