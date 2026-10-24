import assert from "node:assert/strict";
import test from "node:test";
import { ayEkle, tutarDegistir, yenidenBol } from "@/lib/taksit-plani";

const toplam = (p: { tutar: number }[]) => p.reduce((s, t) => s + t.tutar, 0);
const plan = [
  { no: 1, vade: "2026-10-05", tutar: 2250000 },
  { no: 2, vade: "2026-11-05", tutar: 2250000 },
];

test("ay ekleme ay sonunu taşırmaz", () => {
  assert.equal(ayEkle("2026-01-31", 1), "2026-02-28");
  assert.equal(ayEkle("2028-01-31", 1), "2028-02-29");
  assert.equal(ayEkle("2026-11-15", 3), "2027-02-15");
});

test("tutar azalınca fark sonraki taksite gider, toplam korunur", () => {
  const sonuc = tutarDegistir(plan, 1, 1000000);
  assert.ok(Array.isArray(sonuc));
  assert.deepEqual(sonuc.map((t) => t.tutar), [1000000, 3500000]);
  assert.equal(toplam(sonuc), 4500000);
});

test("tutar artınca fark sonrakilerden düşülür; sıfıra inen taksit çıkar", () => {
  const sonuc = tutarDegistir(plan, 1, 4500000);
  assert.ok(Array.isArray(sonuc));
  assert.deepEqual(sonuc, [{ no: 1, vade: "2026-10-05", tutar: 4500000 }]);
  // Sonrakilerin toplamını aşamaz.
  assert.deepEqual(tutarDegistir(plan, 1, 5000000), { hata: "Bu tutar, sonraki taksitlerin toplamını aşıyor; plan sözleşme tutarını geçemez." });
});

test("son taksit azalırsa fark bir ay sonra yeni taksit olur", () => {
  const sonuc = tutarDegistir(plan, 2, 1500000);
  assert.ok(Array.isArray(sonuc));
  assert.deepEqual(sonuc, [
    { no: 1, vade: "2026-10-05", tutar: 2250000 },
    { no: 2, vade: "2026-11-05", tutar: 1500000 },
    { no: 3, vade: "2026-12-05", tutar: 750000 },
  ]);
});

test("taksit seçeneği değişince ödenen korunur, kalan bölünür; artan kuruş baştakilere", () => {
  // 1. taksitin 15.000'i ödenmiş: ödenen kısım ayrı (ödenmiş) taksit olarak kalır.
  const sonuc = yenidenBol(plan.map((t, i) => ({ ...t, odenen: i === 0 ? 1500000 : 0 })), 4500000, { adet: 3, ilkVade: "2026-11-01", aralikAy: 1 });
  assert.ok(Array.isArray(sonuc));
  assert.deepEqual(sonuc, [
    { no: 1, vade: "2026-10-05", tutar: 1500000 },
    { no: 2, vade: "2026-11-01", tutar: 1000000 },
    { no: 3, vade: "2026-12-01", tutar: 1000000 },
    { no: 4, vade: "2027-01-01", tutar: 1000000 },
  ]);
  const kurus = yenidenBol([{ no: 1, vade: "2026-10-01", tutar: 1000, odenen: 0 }], 1000, { adet: 3, ilkVade: "2026-10-01", aralikAy: 2 });
  assert.ok(Array.isArray(kurus));
  assert.deepEqual(kurus.map((t) => [t.vade, t.tutar]), [["2026-10-01", 334], ["2026-12-01", 333], ["2027-02-01", 333]]);
  assert.equal(toplam(kurus), 1000);
});

test("yeniden bölmede geçersiz seçim reddedilir", () => {
  const p = plan.map((t) => ({ ...t, odenen: t.tutar }));
  assert.deepEqual(yenidenBol(p, 4500000, { adet: 2, ilkVade: "2026-11-01", aralikAy: 1 }), { hata: "Bu sözleşmenin ödenecek kalanı yok." });
  assert.deepEqual(yenidenBol(plan.map((t) => ({ ...t, odenen: 0 })), 4500000, { adet: 0, ilkVade: "2026-11-01", aralikAy: 1 }), { hata: "Taksit sayısı 1–36 arasında olmalı." });
});

/*
  TAKSİT NUMARASI VADEYE UYMAK ZORUNDA.

  CANLIDA GÖRÜLDÜ (23.10.2026, SOZ-2026-000059): ödeme takviminde
  taksitler 2, 3, 1, 4 sırasıyla diziliydi — "1. taksit" en son
  vadeliydi. Sebebi `yenidenBol`un son satırıydı: ödenmiş taksitler
  diziye başa, yeni taksitler sona konup SIRAYLA numaralanıyordu;
  yeni ilk vade korunan bir taksitten önceye düştüğünde numara ile
  tarih ayrışıyordu.

  Zararı kozmetik değil: aynı numaralar müşteriye gönderilen ödeme
  takviminde ve hatırlatmalarda da yazıyor. "3. taksitiniz gecikti"
  diyen bir mesajın hangi tarihe ait olduğu belirsiz kalıyordu.
*/
test("yenidenBol: numaralar VADE sırasını izliyor", () => {
  /* Peşin ödenmiş ileri tarihli taksit var, yeni plan daha erken
     başlıyor — kusurun çıktığı durum. */
  const plan = [{ no: 1, vade: "2026-12-23", tutar: 500000, odenen: 500000 }];
  const sonuc = yenidenBol(plan, 1900000, { adet: 2, ilkVade: "2026-10-23", aralikAy: 1 });
  assert.ok(Array.isArray(sonuc), "plan dönmeli");
  const liste = sonuc as { no: number; vade: string; tutar: number }[];
  assert.deepEqual(
    liste.map((t) => t.no),
    [...liste].sort((a, b) => a.vade.localeCompare(b.vade)).map((t) => t.no),
    "numaralar vade sırasını izlemeli",
  );
  assert.equal(liste[0].vade, "2026-10-23", "1. taksit en erken vadeli olmalı");
});

test("yenidenBol: toplam birebir korunuyor", () => {
  /* Sıralama değişti diye bölüştürme bozulmamalı: artan kuruş
     baştaki taksitlere ekleniyor ve toplam sözleşme tutarını
     birebir tutuyor (AGENTS.md). */
  const plan = [{ no: 1, vade: "2026-10-23", tutar: 633300, odenen: 633300 }];
  const sonuc = yenidenBol(plan, 1900000, { adet: 3, ilkVade: "2026-11-23", aralikAy: 1 });
  const liste = sonuc as { no: number; vade: string; tutar: number }[];
  assert.equal(liste.reduce((s, t) => s + t.tutar, 0), 1900000);
});

test("aynı vadeli taksitlerde eklenme sırası korunuyor", () => {
  /* Kısmen ödenmiş bir taksitin ödenen kısmı, kalanından önce
     numaralanmalı: ikisi de aynı güne düşüyor. */
  const plan = [
    { no: 1, vade: "2026-10-23", tutar: 422234, odenen: 422234 },
    { no: 2, vade: "2026-10-23", tutar: 633350, odenen: 211066 },
  ];
  const sonuc = yenidenBol(plan, 1900000, { adet: 1, ilkVade: "2026-10-23", aralikAy: 1 });
  const liste = sonuc as { no: number; vade: string; tutar: number }[];
  assert.equal(liste[0].tutar, 422234, "önce tamamı ödenmiş taksit");
  assert.equal(liste[1].tutar, 211066, "sonra kısmen ödenenin ödenen kısmı");
});
