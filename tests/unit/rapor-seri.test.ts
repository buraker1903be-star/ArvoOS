/*
  KPI PENCERESİNİN ÜST ŞERİDİ.

  25.10.2026'da canlıda görüldü: "Dönem tahsilatı" penceresinin
  toplam satırı **45288815** yazıyordu. Satırlar doğruydu (₺58.000,
  ₺152.888 …) çünkü her nokta biçimli `etiket`ini taşıyor; toplam ise
  pencerenin içinde yeniden hesaplanıp HİÇ biçimlenmeden basılıyordu.
  Kuruş da bir sayı olduğu için ekranda "bozuk" görünmüyor, yalnızca
  YANLIŞ görünüyor — ve kullanıcı ona bakıp karar veriyor.

  Hesap artık burada; test de hesabın kendisini sabitliyor.
*/
import assert from "node:assert/strict";
import test from "node:test";
import { seriOzeti, type SeriNoktasi } from "@/lib/rapor-seri";
import { money } from "@/lib/rapor-bicim";

/** Canlıdaki altı aylık tahsilat serisi (kuruş). */
const TAHSILAT: SeriNoktasi[] = [
  { ad: "Tem 2026", eksen: "Tem", deger: 0, etiket: money(0) },
  { ad: "Ağu 2026", eksen: "Ağu", deger: 5_800_000, etiket: money(5_800_000) },
  { ad: "Eyl 2026", eksen: "Eyl", deger: 15_288_815, etiket: money(15_288_815) },
  { ad: "Eki 2026", eksen: "Eki", deger: 24_200_000, etiket: money(24_200_000), simdiki: true },
  { ad: "Kas 2026", eksen: "Kas", deger: 0, etiket: money(0) },
  { ad: "Ara 2026", eksen: "Ara", deger: 0, etiket: money(0) },
];

test("toplam kuruş kalıyor, ekrana lira olarak çıkıyor", () => {
  const ozet = seriOzeti(TAHSILAT);
  assert.equal(ozet.toplam, 45_288_815);
  /* Pencerede görünecek olan bu; ham sayı değil. `money` kuruşu
     gizliyor (maximumFractionDigits: 0), yani ₺452.888,15 → ₺452.888. */
  assert.equal(money(ozet.toplam), "₺452.888");
});

test("ortalama DOLU ayın değil, serideki her noktanın ortalaması", () => {
  /* "Altı ayda ayda ne kadar" sorusunun karşılığı bu; boş ay da bir
     dönem. Dolu aya bölmek ortalamayı üçe katlardı. */
  const ozet = seriOzeti(TAHSILAT);
  assert.equal(ozet.ortalama, Math.round(45_288_815 / 6));
});

test("ortalama TAM KURUŞ: para biçimleyicisine küsurat gitmiyor", () => {
  const ozet = seriOzeti([
    { ad: "a", deger: 100, etiket: "₺1" },
    { ad: "b", deger: 101, etiket: "₺1" },
    { ad: "c", deger: 100, etiket: "₺1" },
  ]);
  assert.equal(Number.isInteger(ozet.ortalama), true);
  assert.equal(ozet.ortalama, 100);
});

test("en yüksek nokta adıyla birlikte dönüyor", () => {
  const ozet = seriOzeti(TAHSILAT);
  assert.equal(ozet.enBuyuk, 24_200_000);
  assert.equal(ozet.tepe, "Eki 2026");
});

test("eşit tepe varsa İLKİ seçiliyor — seri sırası korunuyor", () => {
  const ozet = seriOzeti([
    { ad: "Ocak", deger: 500, etiket: "₺5" },
    { ad: "Şubat", deger: 500, etiket: "₺5" },
  ]);
  assert.equal(ozet.tepe, "Ocak");
});

test("boş seri sıfır döndürüyor, çökmüyor", () => {
  /* `Math.max()` argümansız -Infinity döndürüyor ve ekranda "-∞"
     yazardı; yeni bir kurumda her seri boş. */
  const ozet = seriOzeti([]);
  assert.deepEqual(ozet, { toplam: 0, ortalama: 0, enBuyuk: 0 });
  assert.equal(money(ozet.enBuyuk), "₺0");
});

test("tamamı sıfır olan seride tepe yine de bir ad taşıyor", () => {
  const ozet = seriOzeti([
    { ad: "Tem", deger: 0, etiket: "₺0" },
    { ad: "Ağu", deger: 0, etiket: "₺0" },
  ]);
  assert.equal(ozet.enBuyuk, 0);
  assert.equal(ozet.tepe, "Tem");
});

test("adet serisi binlik ayırıcıyla yazılıyor, para işaretiyle değil", () => {
  /* Aynı grafik hem kuruş hem adet taşıyor; `money()` adede
     uygulanınca 25 kişi "₺0" görünüyordu (mini lejantta 24.10'da
     düzeltilmiş, pencerenin dökümünde atlanmıştı). */
  const ozet = seriOzeti([
    { ad: "Oca", deger: 1200, etiket: "1.200" },
    { ad: "Şub", deger: 300, etiket: "300" },
  ]);
  assert.equal(ozet.toplam.toLocaleString("tr-TR"), "1.500");
  assert.equal(money(ozet.toplam), "₺15", "kuruş sanılırsa bu çıkar — döküm biçimi seriden gelmeli");
});
