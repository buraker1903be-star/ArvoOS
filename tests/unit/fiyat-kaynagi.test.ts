import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  birimliPlanTutari,
  birimliYillikTutar,
  cokParaliBirlestir,
  fiyatAnahtari,
  fiyatlariBirlestir,
  fiyatliBirimler,
} from "@/lib/site/fiyat-kaynagi";
import { DOVIZ_FIYATLARI } from "@/lib/site/doviz-fiyatlari";
import { ADD_ONS, PLANS, YILLIK_ODENEN_AY } from "@/lib/site/pricing";

/*
  Fiyat 14.10.2026'ya kadar yalnızca koddaydı ve değiştirmek dağıtım
  gerektiriyordu. Veritabanı artık tutarı geçersiz kılabiliyor ama KODUN
  YERİNE GEÇMİYOR: bu testler "veritabanı okunamazsa site fiyatsız
  kalmaz" sözünü sabitliyor.
*/
describe("fiyat çözümü", () => {
  test("veritabanı boşsa koddaki değerler geçerli", () => {
    const fiyatlar = fiyatlariBirlestir([]);
    for (const plan of PLANS) assert.equal(fiyatlar.get(plan.code), plan.aylikKurus, plan.code);
    for (const kalem of ADD_ONS) assert.equal(fiyatlar.get(kalem.code), kalem.aylikKurus, kalem.code);
  });

  test("yayımlanmış tutar koddakinin üstüne yazıyor", () => {
    const fiyatlar = fiyatlariBirlestir([{ kod: "arvoos-baslangic", aylikKurus: 123_400 }]);
    assert.equal(fiyatlar.get("arvoos-baslangic"), 123_400);
    /* Yalnızca o satır değişiyor; ötekiler koddaki değerinde kalıyor. */
    const kurumsal = PLANS.find((p) => p.code === "arvoos-kurumsal")!;
    assert.equal(fiyatlar.get("arvoos-kurumsal"), kurumsal.aylikKurus);
  });

  test("ek kalemler de geçersiz kılınabiliyor", () => {
    const fiyatlar = fiyatlariBirlestir([{ kod: "ek-kullanici", aylikKurus: 29_900 }]);
    assert.equal(fiyatlar.get("ek-kullanici"), 29_900);
  });

  test("teklif usulü basamak veritabanından fiyatlanabiliyor", () => {
    /* Kodda null (teklif). Kurucu bir gün yayımlarsa site onu gösterir;
       kuralı kod değil kurucu belirliyor. */
    assert.equal(fiyatlariBirlestir([]).get("arvoos-ozel"), null);
    assert.equal(fiyatlariBirlestir([{ kod: "arvoos-ozel", aylikKurus: 1_500_000 }]).get("arvoos-ozel"), 1_500_000);
  });

  test("yayımlanmış tutar null ise basamak teklif usulüne döner", () => {
    assert.equal(fiyatlariBirlestir([{ kod: "arvoos-baslangic", aylikKurus: null }]).get("arvoos-baslangic"), null);
  });

  test("TANINMAYAN KOD yok sayılıyor", () => {
    /*
      Veritabanında kalmış eski bir basamak kodu, kodda olmayan bir
      fiyatı ortaya çıkarmamalı: basamağın kendisi (adı, birimi, hangi
      üründe olduğu) hâlâ kodda tanımlı ve orada yoksa yayımlanacak bir
      şey de yok.
    */
    const fiyatlar = fiyatlariBirlestir([{ kod: "cok-eski-paket", aylikKurus: 999_900 }]);
    assert.equal(fiyatlar.has("cok-eski-paket"), false);
  });

  test("her plan ve ek kalem çözümde var", () => {
    const fiyatlar = fiyatlariBirlestir([]);
    assert.equal(fiyatlar.size, PLANS.length + ADD_ONS.length);
  });
});

/*
  ÇOK PARA BİRİMLİ KATMAN (28.11.2026). TL tarafının kuralları aynen
  geçerli; eklenen tek şey birimin anahtarın parçası olması.
*/
describe("çok para birimli fiyat çözümü", () => {
  test("veritabanı boşsa TRY pricing.ts'ten, USD doviz.ts'ten geliyor", () => {
    const tablo = cokParaliBirlestir([]);
    const lab = PLANS.find((p) => p.code === "arvolab-arastirmaci")!;
    assert.equal(birimliPlanTutari("arvolab-arastirmaci", "TRY", tablo), lab.aylikKurus);
    assert.equal(birimliPlanTutari("arvolab-arastirmaci", "USD", tablo), DOVIZ_FIYATLARI["arvolab-arastirmaci"]!.USD);
  });

  test("bir birimin yayımlanmış tutarı ÖTEKİNE dokunmuyor", () => {
    /* Kurum sahibinin açık isteği: TRY alanındaki 4.990,00 para birimi
       değişince 4.990,00 USD olarak kopyalanmasın. */
    const tablo = cokParaliBirlestir([{ kod: "arvolab-arastirmaci", paraBirimi: "USD", aylikKurus: 14_900 }]);
    assert.equal(birimliPlanTutari("arvolab-arastirmaci", "USD", tablo), 14_900);
    assert.equal(
      birimliPlanTutari("arvolab-arastirmaci", "TRY", tablo),
      PLANS.find((p) => p.code === "arvolab-arastirmaci")!.aylikKurus,
    );
  });

  test("tanınmayan kod yok sayılıyor", () => {
    const tablo = cokParaliBirlestir([{ kod: "olmayan-plan", paraBirimi: "USD", aylikKurus: 1 }]);
    assert.equal(tablo.has(fiyatAnahtari("olmayan-plan", "USD")), false);
  });

  test("yıllık bedel her iki birimde de aylığın tam katı", () => {
    const tablo = cokParaliBirlestir([{ kod: "arvoos-baslangic", paraBirimi: "USD", aylikKurus: 5_900 }]);
    assert.equal(birimliYillikTutar("arvoos-baslangic", "USD", tablo), 5_900 * YILLIK_ODENEN_AY);
  });

  test("teklif usulü basamak fiyatlı sayılmıyor", () => {
    /* USD satışını açma koşulu "yayımlanmış USD fiyatı"; teklif usulü
       basamakta rakam yok, yani koşul sağlanmıyor. */
    const tablo = cokParaliBirlestir([]);
    assert.deepEqual(fiyatliBirimler("arvolab-kurum", tablo), []);
    assert.deepEqual(fiyatliBirimler("arvolab-arastirmaci", tablo), ["TRY", "USD"]);
  });

  test("USD fiyatı olmayan plan eksik bildiriyor", () => {
    const tablo = cokParaliBirlestir([]);
    tablo.set(fiyatAnahtari("arvoos-baslangic", "USD"), null);
    assert.equal(birimliPlanTutari("arvoos-baslangic", "USD", tablo), null);
    assert.deepEqual(fiyatliBirimler("arvoos-baslangic", tablo), ["TRY"]);
  });
});
