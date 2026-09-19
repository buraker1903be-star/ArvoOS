import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renewalReminders, whatsappNumber, type RenewalLicense } from "@/lib/renewal-reminders";

const NOW = Date.parse("2026-09-20T09:00:00Z");
const day = (n: number) => new Date(NOW + n * 86_400_000).toISOString();
const org = { id: "o1", name: "Deneme Salon", display_name: null, contact_phone: "0532 111 22 33" };
const lic = (x: Partial<RenewalLicense>): RenewalLicense => ({
  organization_id: "o1", product: "randevu", status: "active", monthly_fee: 75000, current_period_end: day(3), trial_ends_at: null, ...x,
});

describe("renewalReminders", () => {
  test("7 gün içinde bitenler ve 30 güne kadar gecikenler, en acil önce", () => {
    const rows = renewalReminders([
      lic({ current_period_end: day(3) }),
      lic({ product: "arc", current_period_end: day(-2), status: "past_due" }),
      lic({ product: "arvolab", current_period_end: day(20) }),
      lic({ product: "arvolab", current_period_end: day(-40) }),
      lic({ product: "arvolab", current_period_end: null }),
    ], [org], NOW);
    assert.deepEqual(rows.map((r) => [r.product, r.daysLeft]), [["arc", -2], ["randevu", 3]]);
  });

  test("Randevu mesajı Randevu'nun ödeme sayfasını, diğerleri ArvoOS'u gösterir", () => {
    const [randevu] = renewalReminders([lic({})], [org], NOW);
    assert.match(randevu.message, /randevu\.arvo-os\.com\/panel\/ayarlar/);
    assert.match(randevu.message, /3 gün sonra/);
    assert.match(randevu.message, /750/);
    assert.match(randevu.whatsappUrl!, /^https:\/\/wa\.me\/905321112233\?text=/);
    const [arc] = renewalReminders([lic({ product: "arc", current_period_end: day(-1) })], [org], NOW);
    assert.match(arc.message, /sona erdi.*app\.arvo-os\.com\/panel\/billing/s);
  });

  test("deneme bitişi de hatırlatılır; kendi markalarımız ve iptaller hariç", () => {
    assert.match(renewalReminders([lic({ status: "trialing", trial_ends_at: day(1), current_period_end: null })], [org], NOW)[0].message, /deneme süreniz yarın/);
    assert.equal(renewalReminders([lic({})], [{ ...org, kind: "internal" }], NOW).length, 0);
    assert.equal(renewalReminders([lic({ status: "canceled" })], [org], NOW).length, 0);
  });
});

test("whatsappNumber yalnızca Türkiye cep numarasını kabul eder", () => {
  assert.equal(whatsappNumber("+90 532 111 22 33"), "905321112233");
  assert.equal(whatsappNumber("5321112233"), "905321112233");
  assert.equal(whatsappNumber("0212 111 22 33"), null);
  assert.equal(whatsappNumber(null), null);
});
