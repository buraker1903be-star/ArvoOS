import assert from "node:assert/strict";
import test from "node:test";
import { bekleyenDegisiklikler, fiyatDenetimi, yayimSonrasi, type FiyatKaydi  } from "@/lib/fiyat-dogrulama";
import { birimliPlanTutari, cokParaliBirlestir } from "@/lib/site/fiyat-kaynagi";
import type { ParaBirimi } from "@/lib/para";

/* Fiyat yayımının önizlemesi ve denetimi (lib/fiyat-dogrulama.ts). */

const gecerli = cokParaliBirlestir([]);
/* Tutarlar artık birim başına: "geçerli" tablonun anahtarı kod+birim. */
const simdiki = (kod: string, birim: ParaBirimi = "TRY") => birimliPlanTutari(kod, birim, gecerli)!;
const kayit = (kod: string, taslak: number | null, ek: Partial<FiyatKaydi> = {}): FiyatKaydi =>
  ({ kod, para_birimi: "TRY", aylik_kurus: null, taslak_kurus: taslak, yayimlandi_at: null, taslak_bekliyor: true, ...ek });
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
  const eski = simdiki("arvoos-baslangic");
  const { d } = denetle([
    kayit("arvoos-baslangic", eski + eski / 10),
    kayit("arvoos-kurumsal", 1, { taslak_bekliyor: false }),
    kayit("eski-silinmis-basamak", 100),
  ]);
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].kod, d[0].eski, d[0].yeni, d[0].yuzde], ["arvoos-baslangic", eski, eski + eski / 10, 10]);
});

test("kurum başı merdiven: alt basamak üsttekinden pahalı olamaz", () => {
  const { hatalar } = denetle([kayit("arvoos-baslangic", simdiki("arvoos-kurumsal") + 100)]);
  assert.equal(hatalar.length, 1);
  assert.match(hatalar[0], /üst basamak daha pahalı olmalı/);
});

test("ArvoLab: hacim basamağı yokken Araştırmacı tutarı merdiven hatası üretmez", () => {
  // Ekip 28.10.2026'da kalktı; tekil koltuğun karşılaştırılacağı basamak yok.
  assert.deepEqual(denetle([kayit("arvolab-arastirmaci", simdiki("arvolab-arastirmaci") + 100)]).hatalar, []);
});

test("teklif usulü basamak merdiveni bozmuyor", () => {
  // Özel kurum zaten teklif; Kurumsal'ı da teklife çevirmek hata değil, uyarı.
  const { hatalar, uyarilar } = denetle([kayit("arvoos-kurumsal", null)]);
  assert.deepEqual(hatalar, []);
  assert.match(uyarilar.join(" "), /teklif usulüne geçiyor/);
});

test("büyük değişim ve ücretsiz basamak uyarı veriyor", () => {
  const eski = simdiki("ek-kullanici");
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

test("yayım işlemi kapsam imzasını karşılaştırıyor", async () => {
  /*
    Kural sunucu işleminde; önizleme imzayı gizli alanda taşıyor.
    Dosya bağını burada sabitliyoruz: imza karşılaştırması kalkarsa
    (ya da alan adı değişirse) bu test düşer ve kuralın sessizce
    kaybolması engellenir.

    İmzayı ARTIK VERİTABANI üretiyor (28.11.2026): biçim tek yerde
    yaşamalı, yoksa dağıtım ile migration arasındaki aralıkta
    uygulama "kod:birim:tutar", işlev "kod:tutar" üretip imza hiç
    tutmuyordu. Bu yüzden burada beklenen şey yerel hesap DEĞİL,
    `platform_fiyat_kapsam_imzasi` RPC çağrısı.
  */
  const { readFile } = await import("node:fs/promises");
  const islem = await readFile(new URL("../../app/panel/platform/urunler/actions.ts", import.meta.url), "utf8");
  assert.match(islem, /rpc\("platform_fiyat_kapsam_imzasi"\)/);
  /* Yerel hesap GERİ GELMESİN: yardımcı artık yok, dolayısıyla
     import edilmiş olması da yeter. (Yorumda adı geçebilir — ilk
     yazılışta bu testi tam o yüzden kendi yorumum düşürdü.) */
  const importlar = islem.slice(0, islem.indexOf("\n\n"));
  assert.doesNotMatch(importlar, /kapsamImzasi/, "yayım yolu imzayı yerel hesaplamamalı");
  assert.match(islem, /formData\.get\("kapsam"\)/);
  assert.match(islem, /önizlemeden sonra değişti/i);
  const onizleme = await readFile(new URL("../../app/panel/platform/fiyatlar/fiyat-yayim-onizlemesi.tsx", import.meta.url), "utf8");
  assert.match(onizleme, /name="kapsam"/);
});

/*
  ÇOK PARA BİRİMİ (28.11.2026). Üç kural sabitleniyor: iki birim ayrı
  merdiven, imza birimi ayırt ediyor, eksik USD fiyatı merdiven hatası
  değil.
*/
test("TRY ve USD merdivenleri birbirine karışmıyor", () => {
  /* USD listesi TRY listesinden küçük rakamlardan oluşuyor; ikisi bir
     arada denetlenirse "üst basamak daha ucuz" diye sahte hata çıkardı. */
  const { hatalar } = denetle([
    kayit("arvoos-baslangic", 5_900, { para_birimi: "USD" }),
    kayit("arvoos-kurumsal", 17_900, { para_birimi: "USD" }),
  ]);
  assert.deepEqual(hatalar, []);
});

test("USD merdiveni kendi içinde bozulursa hata veriyor", () => {
  const { hatalar } = denetle([kayit("arvoos-baslangic", 25_000, { para_birimi: "USD" })]);
  assert.equal(hatalar.length, 1);
  assert.match(hatalar[0], /USD/);
});

test("aynı planın iki birimi ayrı değişiklik", () => {
  const { d } = denetle([
    kayit("arvolab-arastirmaci", 599_000),
    kayit("arvolab-arastirmaci", 12_900, { para_birimi: "USD" }),
  ]);
  assert.equal(d.length, 2);
  assert.deepEqual(d.map((x) => x.paraBirimi).sort(), ["TRY", "USD"]);
  /* Yüzde kendi biriminde: USD taslağı TL fiyatıyla karşılaştırılmıyor. */
  const usd = d.find((x) => x.paraBirimi === "USD")!;
  assert.equal(usd.eski, simdiki("arvolab-arastirmaci", "USD"));
});

test("eski satırda para birimi yoksa TRY sayılıyor", async () => {
  const { fiyatKaydi } = await import("@/lib/fiyat-dogrulama");
  const k = fiyatKaydi({ kod: "arvoos-baslangic", aylik_kurus: 1, taslak_kurus: 2, yayimlandi_at: null });
  assert.equal(k.para_birimi, "TRY");
  /* Tanınmayan bir değer de USD sayılmıyor: TRY'ye düşüyor. */
  const bozuk = fiyatKaydi({ kod: "arvoos-baslangic", aylik_kurus: 1, taslak_kurus: 2, yayimlandi_at: null, para_birimi: "GBP" });
  assert.equal(bozuk.para_birimi, "TRY");
});
