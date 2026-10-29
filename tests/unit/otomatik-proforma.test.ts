import assert from "node:assert/strict";
import test from "node:test";
import { donemTutari } from "@/lib/abonelik-tutari";
import { alicilariTopla, otomatikKalemler, proformaPostasi, proformaZamaniMi, sonrakiDonemSonu, turkiyeGunu } from "@/lib/otomatik-proforma";

test("pencere dönem sonuna 0–3 gün kala; deneme ve gecikmiş dışarıda", () => {
  const bugun = "2026-10-29";
  assert.equal(proformaZamaniMi({ durum: "active", donemSonu: "2026-11-01" }, bugun), true, "tam üç gün kala");
  assert.equal(proformaZamaniMi({ durum: "active", donemSonu: "2026-10-29" }, bugun), true, "son gün: iş bir sabah kaçırdıysa");
  assert.equal(proformaZamaniMi({ durum: "active", donemSonu: "2026-11-02" }, bugun), false, "dört gün kala erken");
  assert.equal(proformaZamaniMi({ durum: "active", donemSonu: "2026-10-28" }, bugun), false, "dönem geçmiş");
  assert.equal(proformaZamaniMi({ durum: "trialing", donemSonu: "2026-11-01" }, bugun), false);
  assert.equal(proformaZamaniMi({ durum: "past_due", donemSonu: "2026-10-30" }, bugun), false);
  assert.equal(proformaZamaniMi({ durum: "active", donemSonu: null }, bugun), false);
});

test("dönem sonu Türkiye günüyle: UTC'de 21:30 olan an ertesi gündür", () => {
  assert.equal(turkiyeGunu("2026-10-31T21:30:00Z"), "2026-11-01");
  assert.equal(proformaZamaniMi({ durum: "active", donemSonu: "2026-11-01T21:30:00Z" }, "2026-10-29"), false, "Türkiye'de 2 Kasım: dört gün");
});

test("sonraki dönem ayın son gününe kırpılır", () => {
  assert.equal(sonrakiDonemSonu("2026-01-31"), "2026-02-28");
  assert.equal(sonrakiDonemSonu("2026-11-15"), "2026-12-15");
  assert.equal(sonrakiDonemSonu("2026-12-31"), "2027-01-31");
});

test("ArvoOS kalemleri ödeme bağlantısının tutarını verir; KDV dahil tutar ayrıştırılır", () => {
  const girdi = { aylikUcret: 719000, aktifKullanici: 7, kullaniciLimiti: 5, ekKullaniciUcreti: 29900 };
  const p = otomatikKalemler({ urun: "arvoos", paketAdi: "Kurumsal", bireysel: false, donemBasi: "2026-11-01", donemSonu: "2026-12-01", ...girdi });
  assert.equal(p.kalemler.length, 2);
  assert.equal(p.kalemler[1].miktar, 2);
  assert.equal(p.toplam, donemTutari({ urun: "arvoos", aylikUcret: 719000, aktifKullanici: 7, kullaniciLimiti: 5, ekKullaniciUcreti: 29900 }).tutar);
  assert.equal(p.araToplam + p.kdv, p.toplam);
  assert.match(p.kalemler[0].aciklama, /ArvoOS Kurumsal aboneliği \(1 ay · 01\.11\.2026 – 01\.12\.2026\)/);
});

test("öteki ürünlerde ek kullanıcı kalemi yok; bireysel ArvoLab adıyla", () => {
  const p = otomatikKalemler({ urun: "arvolab", paketAdi: null, bireysel: true, aylikUcret: 499000, donemBasi: "2026-11-01", donemSonu: "2026-12-01", aktifKullanici: 9, kullaniciLimiti: 1, ekKullaniciUcreti: 100 });
  assert.equal(p.kalemler.length, 1);
  assert.equal(p.toplam, 499000);
  assert.match(p.kalemler[0].aciklama, /^ArvoLab bireysel aboneliği/);
});

test("posta: düz metin ve HTML aynı bilgiyi taşır, HTML kaçırılır", () => {
  const posta = proformaPostasi({
    muhatap: "Ayşe <b>", urun: "randevu", proformaNo: "PRF-2026-0007", toplam: 89900, paraBirimi: "TRY", sonGun: "2026-11-01",
    adres: "https://app.arvo-os.com/panel/billing/proforma/x", satici: "Arvo Ltd.", otomatik: true,
    hesaplar: [{ banka: "Banka", hesapSahibi: "Arvo Ltd.", iban: "TR000000000000000000000000" }],
  });
  assert.match(posta.konu, /ArvoCal proforma faturanız · PRF-2026-0007 · son ödeme 01\.11\.2026/);
  for (const parca of ["PRF-2026-0007", "01.11.2026", "TR00 0000", "app.arvo-os.com/panel/billing/proforma/x"]) {
    assert.ok(posta.metin.includes(parca), `düz metinde ${parca}`);
    assert.ok(posta.html.includes(parca), `HTML'de ${parca}`);
  }
  assert.ok(!posta.html.includes("<b>"), "muhatap adı kaçırılıyor");
  assert.ok(posta.html.includes("Ayşe &lt;b&gt;"));
});

test("alıcılar tekrarsız, küçük harf, geçersizler düşer", () => {
  assert.deepEqual(alicilariTopla(["A@x.com", "a@x.com ", null, "yanlis", "b@y.org"]), ["a@x.com", "b@y.org"]);
});

test("bildirim metni kısa ve sınırların içinde", async () => {
  const { proformaBildirimi } = await import("@/lib/otomatik-proforma");
  const b = proformaBildirimi({ urun: "arvolab", proformaNo: "PRF-2026-0009", toplam: 499000, paraBirimi: "TRY", sonGun: "2026-11-01" });
  assert.equal(b.baslik, "ArvoLab proforma faturanız hazır");
  assert.match(b.metin, /PRF-2026-0009 · ₺4\.990,00 \(KDV dahil\) · son ödeme 01\.11\.2026/);
  assert.ok(b.baslik.length <= 200 && b.metin.length <= 500, "ArvoLab bildirim sınırları");
});
