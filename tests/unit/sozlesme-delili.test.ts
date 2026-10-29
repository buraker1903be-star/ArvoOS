import assert from "node:assert/strict";
import test from "node:test";
import { cihazOzeti, istemciIp, konumOku, konumYazisi, onayPostasi } from "@/lib/sozlesme/delil";
import { kullanimSozlesmesi, sozlesmeDuzMetni, SOZLESME_SURUMU } from "@/lib/sozlesme/kullanim-sozlesmesi";
import { COMPANY } from "@/lib/site/routes";

const basliklar = (h: Record<string, string>) => (ad: string) => h[ad] ?? null;

test("konum barındırıcının başlıklarından; şehir adı çözülüyor, bozuk sayı düşüyor", () => {
  const k = konumOku(basliklar({
    "x-vercel-ip-country": "TR", "x-vercel-ip-country-region": "34", "x-vercel-ip-city": "%C4%B0stanbul",
    "x-vercel-ip-latitude": "41.0082", "x-vercel-ip-longitude": "abc", "x-vercel-ip-timezone": "Europe/Istanbul",
  }));
  assert.deepEqual(k, { ulke: "TR", bolge: "34", sehir: "İstanbul", enlem: 41.0082, boylam: null, saatDilimi: "Europe/Istanbul" });
  assert.equal(konumYazisi(k), "İstanbul, 34, TR", "koordinatın yarısı yoksa koordinat yazılmıyor");
  assert.equal(konumYazisi({ ...k, boylam: 28.97 }), "İstanbul, 34, TR (41.0082, 28.97)");
});

test("başlık yoksa konum uydurulmuyor", () => {
  const k = konumOku(basliklar({}));
  assert.equal(konumYazisi(k), null);
  assert.equal(konumOku(basliklar({ "x-vercel-ip-latitude": "123" })).enlem, null, "geçersiz enlem");
});

test("IP: ileri yönlendirme listesinin ilki", () => {
  assert.equal(istemciIp(basliklar({ "x-forwarded-for": "85.1.2.3, 10.0.0.1" })), "85.1.2.3");
  assert.equal(istemciIp(basliklar({ "x-real-ip": "85.9.9.9" })), "85.9.9.9");
  assert.equal(istemciIp(basliklar({})), null);
});

test("cihaz özeti okunur", () => {
  assert.equal(cihazOzeti("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"), "Chrome · macOS");
  assert.equal(cihazOzeti("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "Safari · iOS");
  assert.equal(cihazOzeti(null), null);
});

test("sözleşme: bölümler 1'den 17'ye kesintisiz, künye ve delil maddesi tam", () => {
  const m = kullanimSozlesmesi();
  assert.deepEqual(m.bolumler.map((b) => Number(b.baslik.split(".")[0])), Array.from({ length: 17 }, (_, i) => i + 1));
  const duz = sozlesmeDuzMetni();
  for (const parca of [COMPANY.legalName, COMPANY.taxNumber, COMPANY.mersis, SOZLESME_SURUMU, "yaklaşık konum", "IP adresi", "m.193", "veri işleyen"]) {
    assert.ok(duz.includes(parca), `metinde ${parca}`);
  }
  assert.equal(sozlesmeDuzMetni(), duz, "özet her seferinde aynı metinden");
});

test("onay postası metnin tamamını ve kayıt bilgilerini iki biçimde de taşıyor", () => {
  const m = kullanimSozlesmesi();
  const p = onayPostasi(m, { zaman: "29.10.2026 19:30 (Türkiye saati)", surum: SOZLESME_SURUMU, ozet: "a".repeat(64), ip: "85.1.2.3", konum: "İstanbul, 34, TR", cihaz: "Chrome · macOS", adres: "app.arvo-os.com", kurum: "Kurum <A>" });
  assert.equal(p.konu, "ArvoOS Kullanım Sözleşmesi onayınız");
  for (const parca of ["85.1.2.3", "İstanbul, 34, TR", "Chrome · macOS", m.bolumler[16].baslik, "a".repeat(64)]) {
    assert.ok(p.metin.includes(parca), `düz metinde ${parca}`);
    assert.ok(p.html.includes(parca), `HTML'de ${parca}`);
  }
  assert.ok(p.html.includes("Kurum &lt;A&gt;") && !p.html.includes("Kurum <A>"), "değerler kaçırılıyor");
});
