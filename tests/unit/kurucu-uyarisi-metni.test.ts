import assert from "node:assert/strict";
import test from "node:test";
import { kurucuUyariPostasi } from "@/lib/kurucu-uyarisi-metni";

/* Kurucuya anında uyarı e-postası (lib/kurucu-uyarisi-metni.ts, 02.11.2026). */

test("boş satırlar düşer; HTML ile düz metin aynı içerik", () => {
  const p = kurucuUyariPostasi({
    baslik: "Yeni dekont: Salon <A&B>",
    satirlar: [["Kurum", "Salon <A&B>"], ["Tutar", "1.500,00 ₺"], ["Referans", null], ["Not", "  "]],
    not: "Müşteri notu: <acele>",
    adres: "https://yonetim.arvo-os.com/panel/platform/payments",
    dugme: "Ödeme onaylarını aç",
  });
  assert.equal(p.konu, "[Konsol] Yeni dekont: Salon <A&B>");
  assert.ok(p.metin.includes("Tutar: 1.500,00 ₺") && !p.metin.includes("Referans"));
  assert.ok(p.metin.endsWith("Ödeme onaylarını aç: https://yonetim.arvo-os.com/panel/platform/payments"));
  // Müşterinin yazdığı her şey kaçırılmış.
  assert.ok(p.html.includes("Salon &lt;A&amp;B&gt;") && p.html.includes("&lt;acele&gt;"));
  assert.ok(!p.html.includes("<acele>") && !p.html.includes("Referans"));
});
