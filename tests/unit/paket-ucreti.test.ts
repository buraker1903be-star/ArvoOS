import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { paketListeFiyatiKurus, ucretSapmasi } from "@/lib/paket-ucreti";
import { PLANS } from "@/lib/site/pricing";

/*
  Kurucu her yeni kiracının aylık ücretini elle yazıyordu ve yayımlanmış
  fiyat listesiyle paneldeki tutar arasında hiçbir bağ yoktu. Eşleme
  burada sınanıyor: veritabanı kodu (starter) ile yayımlanmış kod
  (arvoos-baslangic) aynı şey değil.
*/
describe("paket liste fiyatı", () => {
  test("veritabanı kodu yayımlanmış plana bağlanıyor", () => {
    const baslangic = PLANS.find((p) => p.code === "arvoos-baslangic")!;
    const kurumsal = PLANS.find((p) => p.code === "arvoos-kurumsal")!;
    assert.equal(paketListeFiyatiKurus("starter"), baslangic.aylikKurus);
    assert.equal(paketListeFiyatiKurus("professional"), kurumsal.aylikKurus);
  });

  test("teklif usulü pakette liste fiyatı YOK", () => {
    /* Özel kurum pazarlıkla fiyatlanıyor; uydurma bir varsayılan yazmak
       pazarlıkla belirlenen tutarı liste fiyatı gibi göstermek olurdu. */
    assert.equal(paketListeFiyatiKurus("enterprise"), null);
  });

  test("tanınmayan kod sessizce bir fiyat uydurmuyor", () => {
    assert.equal(paketListeFiyatiKurus("yok-boyle-bir-paket"), null);
    assert.equal(paketListeFiyatiKurus(null), null);
    assert.equal(paketListeFiyatiKurus(undefined), null);
    assert.equal(paketListeFiyatiKurus(""), null);
  });

  test("fiyat listesi değişince eşleme kendiliğinden güncel kalıyor", () => {
    /* Rakam burada YAZILI DEĞİL: lib/site/pricing.ts tek kaynak. Bu test
       rakamı değil BAĞIN kurulduğunu sabitliyor. */
    for (const kod of ["starter", "professional"]) {
      const fiyat = paketListeFiyatiKurus(kod);
      assert.ok(fiyat && fiyat > 0, `${kod}: liste fiyatı okunamadı`);
      assert.equal(fiyat % 100, 0, `${kod}: tam lira değil`);
    }
  });
});

describe("ücret sapması", () => {
  const liste = paketListeFiyatiKurus("starter")!;

  test("ücret girilmemiş kiracı", () => {
    assert.deepEqual(ucretSapmasi("starter", null), { liste, mevcut: null, durum: "girilmedi" });
    /* Sıfır da "girilmedi" sayılıyor: ücretsiz kiracı diye bir şey yok,
       sıfır yazan alan boş bırakılmış demektir. */
    assert.equal(ucretSapmasi("starter", 0).durum, "girilmedi");
  });

  test("liste fiyatıyla aynı", () => {
    assert.equal(ucretSapmasi("starter", liste).durum, "liste");
  });

  test("pazarlıkla değişmiş tutar HATA DEĞİL, yalnızca farklı", () => {
    const sapma = ucretSapmasi("starter", liste - 50_000);
    assert.equal(sapma.durum, "farkli");
    assert.equal(sapma.mevcut, liste - 50_000);
    assert.equal(sapma.liste, liste);
  });

  test("teklif usulü pakette kıyas yapılmıyor", () => {
    assert.equal(ucretSapmasi("enterprise", 1_200_000).durum, "teklif");
  });
});

test("konsoldan yayımlanan fiyat koddaki değerin yerine geçiyor", async () => {
  const { fiyatlariBirlestir } = await import("@/lib/site/fiyat-kaynagi");
  const fiyatlar = fiyatlariBirlestir([{ kod: "arvoos-baslangic", aylikKurus: 249_000 }]);
  assert.equal(paketListeFiyatiKurus("starter", fiyatlar), 249_000);
  // Yayımlanmamış basamak koddaki değerinde.
  assert.equal(paketListeFiyatiKurus("professional", fiyatlar), paketListeFiyatiKurus("professional"));
  assert.equal(ucretSapmasi("starter", 249_000, fiyatlar).durum, "liste");
  assert.equal(ucretSapmasi("starter", paketListeFiyatiKurus("starter"), fiyatlar).durum, "farkli");
});
