import assert from "node:assert/strict";
import test from "node:test";
import { bekleyenDegisiklikler, fiyatDenetimi, yayimSonrasi, type FiyatKaydi , kapsamImzasi } from "@/lib/fiyat-dogrulama";
import { fiyatlariBirlestir } from "@/lib/site/fiyat-kaynagi";

/* Fiyat yayımının önizlemesi ve denetimi (lib/fiyat-dogrulama.ts). */

const gecerli = fiyatlariBirlestir([]);
const kayit = (kod: string, taslak: number | null, ek: Partial<FiyatKaydi> = {}): FiyatKaydi =>
  ({ kod, aylik_kurus: null, taslak_kurus: taslak, yayimlandi_at: null, taslak_bekliyor: true, ...ek });
const denetle = (kayitlar: FiyatKaydi[]) => {
  const d = bekleyenDegisiklikler(kayitlar, gecerli);
  return { d, ...fiyatDenetimi(yayimSonrasi(gecerli, d), d) };
};

test("bugünkü liste denetimden temiz geçiyor", () => {
  const { hatalar, uyarilar } = fiyatDenetimi(gecerli, []);
  assert.deepEqual(hatalar, []);
  assert.deepEqual(uyarilar, []);
});

test("bekleyen değişiklik önce → sonra ve yüzdeyle; bekleyen olmayan ve tanınmayan atlanıyor", () => {
  const eski = gecerli.get("arvoos-baslangic")!;
  const { d } = denetle([
    kayit("arvoos-baslangic", eski + eski / 10),
    kayit("arvoos-kurumsal", 1, { taslak_bekliyor: false }),
    kayit("eski-silinmis-basamak", 100),
  ]);
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].kod, d[0].eski, d[0].yeni, d[0].yuzde], ["arvoos-baslangic", eski, eski + eski / 10, 10]);
});

test("kurum başı merdiven: alt basamak üsttekinden pahalı olamaz", () => {
  const { hatalar } = denetle([kayit("arvoos-baslangic", gecerli.get("arvoos-kurumsal")! + 100)]);
  assert.equal(hatalar.length, 1);
  assert.match(hatalar[0], /üst basamak daha pahalı olmalı/);
});

test("ArvoLab: hacim basamağı yokken Araştırmacı tutarı merdiven hatası üretmez", () => {
  // Ekip 28.10.2026'da kalktı; tekil koltuğun karşılaştırılacağı basamak yok.
  assert.deepEqual(denetle([kayit("arvolab-arastirmaci", gecerli.get("arvolab-arastirmaci")! + 100)]).hatalar, []);
});

test("teklif usulü basamak merdiveni bozmuyor", () => {
  // Özel kurum zaten teklif; Kurumsal'ı da teklife çevirmek hata değil, uyarı.
  const { hatalar, uyarilar } = denetle([kayit("arvoos-kurumsal", null)]);
  assert.deepEqual(hatalar, []);
  assert.match(uyarilar.join(" "), /teklif usulüne geçiyor/);
});

test("büyük değişim ve ücretsiz basamak uyarı veriyor", () => {
  const eski = gecerli.get("ek-kullanici")!;
  assert.match(denetle([kayit("ek-kullanici", eski * 10)]).uyarilar.join(" "), /Yazım hatası değilse/);
  assert.match(denetle([kayit("ek-kullanici", 0)]).uyarilar.join(" "), /ücretsiz/);
  // %10'luk zam sessiz geçiyor.
  assert.deepEqual(denetle([kayit("ek-kullanici", eski + eski / 10)]).uyarilar, []);
});

test("taslak_bekliyor sütunu yoksa eski kural: yayındakinden farklı taslak bekliyor", async () => {
  const { fiyatKaydi } = await import("@/lib/fiyat-dogrulama");
  assert.equal(fiyatKaydi({ kod: "x", aylik_kurus: 100, taslak_kurus: 200, yayimlandi_at: "2026-10-14" }).taslak_bekliyor, true);
  assert.equal(fiyatKaydi({ kod: "x", aylik_kurus: "100", taslak_kurus: "100", yayimlandi_at: "2026-10-14" }).taslak_bekliyor, false);
  // Sütun varsa o geçerli.
  assert.equal(fiyatKaydi({ kod: "x", aylik_kurus: 100, taslak_kurus: 200, yayimlandi_at: null, taslak_bekliyor: false }).taslak_bekliyor, false);
});

test("kapsam imzası: aynı küme farklı sırayla aynı imzayı verir", () => {
  /* Önizlemedeki liste ile işlemdeki liste başka sırada gelebilir;
     sıra bir karar farkı değil. */
  const a = kapsamImzasi([{ kod: "arvolab-arastirmaci", yeni: 19_900 }, { kod: "arvoos-baslangic", yeni: 99_900 }]);
  const b = kapsamImzasi([{ kod: "arvoos-baslangic", yeni: 99_900 }, { kod: "arvolab-arastirmaci", yeni: 19_900 }]);
  assert.equal(a, b);
});

test("kapsam imzası: tutar değişince imza da değişir", () => {
  /* Aynı kod, başka rakam = başka karar. Onay eskiyse yayım
     düşmeli. */
  assert.notEqual(
    kapsamImzasi([{ kod: "arvoos-baslangic", yeni: 99_900 }]),
    kapsamImzasi([{ kod: "arvoos-baslangic", yeni: 109_900 }]),
  );
});

test("kapsam imzası: listeye yeni bir basamak girince imza değişir", () => {
  /* Onayla gönderim arasında başka bir sekmede taslak eklenirse
     kurucu görmediği bir değişikliği yayımlıyordu. */
  const once = kapsamImzasi([{ kod: "arvoos-baslangic", yeni: 99_900 }]);
  const sonra = kapsamImzasi([{ kod: "arvoos-baslangic", yeni: 99_900 }, { kod: "arvolab-arastirmaci", yeni: 19_900 }]);
  assert.notEqual(once, sonra);
});

test("kapsam imzası: 'teklif' (null) ile 0 aynı şey değil", () => {
  assert.notEqual(
    kapsamImzasi([{ kod: "x", yeni: null }]),
    kapsamImzasi([{ kod: "x", yeni: 0 }]),
  );
});

test("yayım işlemi kapsam imzasını karşılaştırıyor", async () => {
  /*
    Kural sunucu işleminde; önizleme imzayı gizli alanda taşıyor.
    Dosya bağını burada sabitliyoruz: imza karşılaştırması kalkarsa
    (ya da alan adı değişirse) bu test düşer ve kuralın sessizce
    kaybolması engellenir.
  */
  const { readFile } = await import("node:fs/promises");
  const islem = await readFile(new URL("../../app/panel/platform/urunler/actions.ts", import.meta.url), "utf8");
  assert.match(islem, /kapsamImzasi\(degisiklikler\)/);
  assert.match(islem, /formData\.get\("kapsam"\)/);
  assert.match(islem, /önizlemeden sonra değişti/i);
  const onizleme = await readFile(new URL("../../app/panel/platform/fiyatlar/fiyat-yayim-onizlemesi.tsx", import.meta.url), "utf8");
  assert.match(onizleme, /name="kapsam"/);
});
