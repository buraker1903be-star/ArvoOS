/*
  GERİ DÖNEN MÜŞTERİ NOTUNDA TUTAR YOK.

  Talep girişinde otomatik düşen bu not crm_internal_comments'e
  yazılıyor ve kurum içi yorumlar OPERASYON ekibine de açık — tasarım
  gereği, çünkü işi yürüten kişinin müşteriyle ne konuşulduğunu
  bilmesi gerekiyor.

  Tutarlar ise veritabanı tarafında operasyon personelinden kapatıldı
  (migration 20261001143617: satır erişimi daraltıldı, tutarsız
  görünümler açıldı). Aynı sayının yorum METNİNDEN sızması o korumayı
  anlamsız kılardı: canlıda "geçmişte 1 teklif (toplam ₺60.000,00),
  1 sözleşme (toplam ₺60.000,00)" yazan notlar vardı.

  Sayılar kalıyor — satışçının "bu müşteri geri döndü" sinyali için
  yeterli; tutarı zaten kendi ekranında görüyor.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { describeReturningCustomer, type CustomerHistoryResult } from "@/app/panel/crm/customer-history-query";

const kayit = (kind: "proposal" | "contract" | "job", title: string, amountLabel: string | null) => ({
  key: `${kind}-1`,
  kind,
  kindLabel: kind === "proposal" ? "Teklif" : kind === "contract" ? "Sözleşme" : "İş",
  title,
  detail: null,
  customerName: "Ayşe Yılmaz",
  amountLabel,
  statusLabel: "Arşiv",
  tone: "neutral" as const,
  dateLabel: "21 Eylül 2026",
  person: "Meral Aydaç",
  personRole: "Satış" as const,
  href: "/panel/crm/requests/1",
  canOpen: true,
  match: "phone" as const,
});

const SONUC: CustomerHistoryResult = {
  items: [
    kayit("proposal", "Tez Danışmanlığı Analiz + Makale", "₺35.000,00"),
    kayit("contract", "Tez Danışmanlığı Analiz + Makale", "₺35.000,00"),
  ],
  total: 2,
  counts: { proposal: 1, contract: 1, job: 0, request: 0 } as CustomerHistoryResult["counts"],
  archivedJobs: 0,
  proposedLabel: "₺35.000,00",
  contractedLabel: "₺35.000,00",
  lastContactLabel: "21 Eylül 2026",
  matchedBy: "phone",
  customerName: "Ayşe Yılmaz",
  limited: false,
  scopedToAssigned: false,
};

describe("geri dönen müşteri notu", () => {
  test("hiçbir tutar geçmiyor", () => {
    const not = describeReturningCustomer(SONUC);
    assert.doesNotMatch(not, /₺|TRY|35\.000|60\.000/, `Notta tutar var:\n${not}`);
  });

  test("sayılar ve kayıt satırları duruyor", () => {
    const not = describeReturningCustomer(SONUC);
    // Satışçının ihtiyacı olan sinyal: kaç teklif, kaç sözleşme, hangi iş.
    assert.match(not, /1 teklif/);
    assert.match(not, /1 sözleşme/);
    assert.match(not, /Tez Danışmanlığı Analiz \+ Makale/);
    assert.match(not, /Meral Aydaç/);
    assert.match(not, /Son temas: 21 Eylül 2026/);
  });

  test("arşiv sayısı gibi tutar olmayan parantezler korunuyor", () => {
    const not = describeReturningCustomer({
      ...SONUC,
      counts: { proposal: 0, contract: 0, job: 3, request: 0 } as CustomerHistoryResult["counts"],
      archivedJobs: 2,
    });
    assert.match(not, /3 iş \(2 tanesi arşivde\)/);
  });
});
