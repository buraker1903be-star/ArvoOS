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

/*
  TAKSİT SEÇENEĞİ DEĞİŞİNCE TOPLAM BÖLÜNÜR, KALAN DEĞİL.

  Kural 23.10.2026'da kurum sahibinin kararıyla değişti. Eskiden
  ödenmiş kısımlar ayrı satır olarak korunuyor ve yalnızca KALAN
  tutar bölünüyordu; canlıda 19.000 TL'lik bir sözleşmede "3 taksit"
  seçilince ekranda BEŞ satır çıkıyordu (SOZ-2026-000059) ve bir şey
  ödendiği anda plan bir daha eşit taksitli hâle gelemiyordu.

  Buna gerek yok: ödeme zaten TÜRETİLEREK dağıtılıyor
  (lib/taksit-dagitimi.ts — net tahsilat en erken vadeden başlayarak
  taksitlere yazılıyor), taksitlerde "ödenen" sütunu yok. Toplam üçe
  bölününce ödenen tutar ilk taksite kendiliğinden sayılıyor.
*/
test("taksit seçeneği değişince TOPLAM bölünür; artan kuruş baştakilere", () => {
  const sonuc = yenidenBol(
    plan.map((t, i) => ({ ...t, odenen: i === 0 ? 1500000 : 0 })),
    4500000,
    { adet: 3, ilkVade: "2026-11-01", aralikAy: 1 },
  );
  assert.ok(Array.isArray(sonuc));
  /* Ödenmiş 15.000 ayrı satır DEĞİL: toplam 45.000 üçe bölünüyor. */
  assert.deepEqual(sonuc, [
    { no: 1, vade: "2026-11-01", tutar: 1500000 },
    { no: 2, vade: "2026-12-01", tutar: 1500000 },
    { no: 3, vade: "2027-01-01", tutar: 1500000 },
  ]);

  const kurus = yenidenBol([{ no: 1, vade: "2026-10-01", tutar: 1000, odenen: 0 }], 1000, { adet: 3, ilkVade: "2026-10-01", aralikAy: 2 });
  assert.ok(Array.isArray(kurus));
  assert.deepEqual(kurus.map((t) => [t.vade, t.tutar]), [["2026-10-01", 334], ["2026-12-01", 333], ["2027-02-01", 333]]);
  assert.equal(toplam(kurus), 1000);
});

test("CANLIDAKİ SÖZLEŞME: 19.000 üçe bölününce üç satır", () => {
  /* SOZ-2026-000059 — kurum sahibinin bildirdiği durum. 6.333 TL
     tahsil edilmişti ve ekranda dört karışık satır vardı. */
  const bozuk = [
    { no: 1, vade: "2026-10-23", tutar: 422234, odenen: 422234 },
    { no: 2, vade: "2026-10-23", tutar: 633350, odenen: 211066 },
    { no: 3, vade: "2026-11-12", tutar: 211066, odenen: 0 },
    { no: 4, vade: "2026-11-23", tutar: 633350, odenen: 0 },
  ];
  const sonuc = yenidenBol(bozuk, 1900000, { adet: 3, ilkVade: "2026-10-23", aralikAy: 1 });
  assert.ok(Array.isArray(sonuc));
  assert.equal(sonuc.length, 3, "üç satır olmalı");
  assert.deepEqual(sonuc.map((t) => t.tutar), [633334, 633333, 633333]);
  assert.equal(toplam(sonuc), 1900000, "toplam sözleşme tutarını birebir tutmalı");
});

test("yeniden bölmede geçersiz seçim reddedilir", () => {
  /* TAMAMI ÖDENMİŞ SÖZLEŞME ARTIK REDDEDİLMİYOR: eskiden "kalan
     yok" diye hata veriyordu, çünkü yalnızca kalan bölünüyordu.
     Toplam bölündüğü için tamamı ödenmiş bir sözleşmenin planı da
     yeniden düzenlenebiliyor — üç taksit de "ödendi" görünür. */
  const p = plan.map((t) => ({ ...t, odenen: t.tutar }));
  const tamOdenmis = yenidenBol(p, 4500000, { adet: 2, ilkVade: "2026-11-01", aralikAy: 1 });
  assert.ok(Array.isArray(tamOdenmis), "tamamı ödenmiş sözleşme de bölünebilmeli");
  assert.equal(toplam(tamOdenmis), 4500000);

  /* Ödenen sözleşme tutarını AŞIYORSA hâlâ reddediliyor. */
  assert.deepEqual(
    yenidenBol([{ no: 1, vade: "2026-10-01", tutar: 5000000, odenen: 5000000 }], 4500000, { adet: 2, ilkVade: "2026-11-01", aralikAy: 1 }),
    { hata: "Ödenen tutar sözleşme tutarını aşıyor; plan yeniden bölünemez." },
  );
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
  /* Sıralama kararlı: aynı güne düşen taksitlerde üretim sırası
     bozulmuyor. Aylık aralıkla üretilen plan zaten ayrı günlere
     düşüyor; bu testin işi sıralamanın kararlı KALDIĞINI
     sabitlemek. */
  const sonuc = yenidenBol(
    [{ no: 1, vade: "2026-10-23", tutar: 300, odenen: 0 }],
    300,
    { adet: 3, ilkVade: "2026-10-23", aralikAy: 1 },
  );
  const liste = sonuc as { no: number; vade: string; tutar: number }[];
  assert.deepEqual(liste.map((t) => t.vade), ["2026-10-23", "2026-11-23", "2026-12-23"]);
  assert.deepEqual(liste.map((t) => t.no), [1, 2, 3]);
});
