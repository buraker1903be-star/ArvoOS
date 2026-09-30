import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ADD_ONS,
  PLANS,
  PRICED_PRODUCTS,
  YILLIK_BEDAVA_AY,
  YILLIK_ODENEN_AY,
  ldFiyat,
  planlar,
  tutarYaz,
  urunAdi,
  urunAdresi,
  yillikKazancKurus,
  yillikKurus,
} from "@/lib/site/pricing";
import { PRICING_TR } from "@/app/(site)/_content/pricing";
import { PRICING_EN } from "@/app/(site)/_content/pricing-en";
import { LOCALES } from "@/lib/site/routes";
import { readFileSync } from "node:fs";

/*
  Yayımlanmış bir fiyat listesinde sessiz hata pahalıdır: yanlış rakam
  müşteriye taahhüt olur. Bu testler üç şeyi sabitler — rakam tek
  kaynakta, iki dil aynı planları gösteriyor, yıllık bedel aylığın tam
  katı (küsurat yok).
*/
describe("fiyat kaynağı", () => {
  test("yıllık bedel aylığın tam katıdır, bölme ve yuvarlama yoktur", () => {
    assert.equal(YILLIK_ODENEN_AY + YILLIK_BEDAVA_AY, 12);
    for (const plan of PLANS) {
      if (plan.aylikKurus === null) {
        assert.equal(yillikKurus(plan), null, `${plan.code}: teklif usulü planın yıllık bedeli olmamalı`);
        continue;
      }
      assert.equal(yillikKurus(plan), plan.aylikKurus * YILLIK_ODENEN_AY, plan.code);
      assert.equal(yillikKazancKurus(plan), plan.aylikKurus * YILLIK_BEDAVA_AY, plan.code);
      assert.equal(Number.isInteger(yillikKurus(plan)), true, `${plan.code}: küsuratlı yıllık bedel`);
    }
  });

  test("tutarlar tam liradır (kuruşlu fiyat yayımlanmaz)", () => {
    for (const plan of PLANS) {
      if (plan.aylikKurus === null) continue;
      assert.equal(plan.aylikKurus % 100, 0, `${plan.code}: ${plan.aylikKurus} kuruş tam lira değil`);
      assert.ok(plan.aylikKurus > 0, `${plan.code}: fiyat pozitif olmalı`);
    }
    for (const ek of ADD_ONS) {
      if (ek.aylikKurus === null) continue;
      assert.equal(ek.aylikKurus % 100, 0, `${ek.code}: tam lira değil`);
    }
  });

  test("plan kodları benzersiz ve her ürünün en az bir fiyatlı basamağı var", () => {
    const kodlar = PLANS.map((p) => p.code);
    assert.equal(new Set(kodlar).size, kodlar.length, "yinelenen plan kodu");
    for (const product of PRICED_PRODUCTS) {
      const liste = planlar(product);
      assert.ok(liste.length >= 2, `${product}: en az iki basamak bekleniyor`);
      assert.ok(liste.some((p) => p.aylikKurus !== null), `${product}: hepsi teklif usulü olamaz`);
      assert.ok(liste.filter((p) => p.oneCikan).length <= 1, `${product}: birden çok öne çıkan basamak`);
    }
  });

  test("koltuk başı basamaklar tutarlı: yalnızca ArvoLab, hacim indirimi gerçek", () => {
    /*
      "Ekip" eskiden 5 kullanıcılık sabit bir paketti ve Kurum'dan farkı
      yalnızca sayıydı. Koltuk başına geçince iki şey doğru kalmalı:
      indirimli koltuk gerçekten ucuz olmalı ve en az kullanıcı şartı
      bulunmalı — yoksa herkes ucuz basamağı tek kişilik alır.
    */
    const kisiBasiOlanlar = PLANS.filter((p) => p.kisiBasi);
    assert.ok(kisiBasiOlanlar.length > 0, "koltuk başı basamak kalmamış");
    for (const plan of kisiBasiOlanlar) {
      assert.equal(plan.product, "arvolab", `${plan.code}: koltuk başı yalnızca ArvoLab'de olmalı`);
    }
    const tek = PLANS.find((p) => p.code === "arvolab-arastirmaci")!;
    const ekip = PLANS.find((p) => p.code === "arvolab-ekip")!;
    assert.ok(ekip.aylikKurus! < tek.aylikKurus!, "Ekip koltuğu tek kullanıcıdan ucuz olmalı");
    assert.ok((ekip.enAzKullanici ?? 0) >= 2, "hacim indiriminin en az kullanıcı şartı yok");
    assert.equal(tek.enAzKullanici, undefined, "tek kullanıcılı basamakta en az şartı olmamalı");
  });

  test("en az kullanıcı yalnızca koltuk başı basamaklarda anlamlı", () => {
    for (const plan of PLANS) {
      if (plan.enAzKullanici !== undefined) {
        assert.equal(plan.kisiBasi, true, `${plan.code}: kurum başı basamakta en az kullanıcı şartı yanıltıcı`);
      }
    }
  });

  test("her plan iki dilde de adlandırılmıştır", () => {
    for (const plan of PLANS) {
      for (const locale of LOCALES) {
        assert.ok(plan.ad[locale]?.trim(), `${plan.code}: ${locale} adı boş`);
      }
    }
  });

  test("ürün adresi: Arvo Randevu'nun tanıtım sayfası yok, dış adrese gider", () => {
    assert.equal(urunAdresi("randevu", "tr").external, true);
    assert.equal(urunAdresi("arvoos", "tr").external, false);
    assert.equal(urunAdresi("arvoos", "tr").href, "/urunler/arvoos");
    assert.equal(urunAdresi("arc", "en").href, "/en/products/arc");
    assert.equal(urunAdi("arc"), "ArvoARC");
  });

  test("biçimlendirme: TR binlik ayırıcı nokta, JSON-LD ayırıcısız", () => {
    assert.equal(tutarYaz(299000, "tr"), "2.990");
    assert.equal(tutarYaz(299000, "en"), "2,990");
    assert.equal(ldFiyat(299000), "2990.00");
    assert.equal(ldFiyat(74900), "749.00");
  });
});

describe("ücretler sayfası içeriği", () => {
  const diller = [
    ["tr", PRICING_TR],
    ["en", PRICING_EN],
  ] as const;

  test("her karttaki plan kodu gerçekten var", () => {
    const kodlar = new Set(PLANS.map((p) => p.code));
    for (const [dil, c] of diller) {
      for (const group of c.groups) {
        for (const card of group.cards) {
          assert.ok(kodlar.has(card.code), `${dil}: bilinmeyen plan kodu ${card.code}`);
        }
      }
    }
  });

  test("her plan sayfada tam olarak bir kez görünür", () => {
    for (const [dil, c] of diller) {
      const gosterilen = c.groups.flatMap((g) => g.cards.map((k) => k.code));
      assert.deepEqual(
        [...gosterilen].sort(),
        PLANS.map((p) => p.code).sort(),
        `${dil}: sayfadaki basamaklar pricing.ts ile aynı değil`,
      );
      assert.equal(new Set(gosterilen).size, gosterilen.length, `${dil}: aynı plan iki kez`);
    }
  });

  test("iki dil aynı ürünleri aynı sırada ve aynı basamaklarla gösterir", () => {
    assert.deepEqual(
      PRICING_TR.groups.map((g) => g.product),
      PRICING_EN.groups.map((g) => g.product),
    );
    assert.deepEqual(
      PRICING_TR.groups.map((g) => g.cards.map((k) => k.code)),
      PRICING_EN.groups.map((g) => g.cards.map((k) => k.code)),
    );
  });

  test("kart içinde bir grup yalnızca kendi ürününün basamaklarını taşır", () => {
    const urun = new Map(PLANS.map((p) => [p.code, p.product]));
    for (const [dil, c] of diller) {
      for (const group of c.groups) {
        for (const card of group.cards) {
          assert.equal(urun.get(card.code), group.product, `${dil}: ${card.code} yanlış grupta`);
        }
      }
    }
  });

  test("ek kalem kodları gerçek", () => {
    const kodlar = new Set(ADD_ONS.map((a) => a.code));
    for (const [dil, c] of diller) {
      for (const item of c.addOns.items) {
        assert.ok(kodlar.has(item.code), `${dil}: bilinmeyen ek kalem ${item.code}`);
      }
      assert.equal(c.addOns.items.length, ADD_ONS.length, `${dil}: ek kalem sayısı tutmuyor`);
    }
  });

  test("metinlerde elle yazılmış tutar yoktur", () => {
    /*
      Rakam metne sızarsa tek kaynak kuralı sessizce çöker. "TL" geçen
      bir cümle, fiyatın içerik dosyasına elle yazıldığının işaretidir.
    */
    for (const [dil, c] of diller) {
      const metin = JSON.stringify(c);
      assert.equal(/\d\s*TL\b/.test(metin), false, `${dil}: içerikte elle yazılmış TL tutarı var`);
    }
  });

  test("koltuk başı birim metni iki dilde de tanımlı", () => {
    for (const [dil, c] of diller) {
      for (const anahtar of ["perMonth", "perYear", "perMonthUser", "perYearUser"] as const) {
        assert.ok(c.cycle[anahtar]?.trim(), `${dil}: ${anahtar} boş`);
      }
      assert.notEqual(c.cycle.perMonthUser, c.cycle.perMonth, `${dil}: koltuk başı birim kurum başıyla aynı`);
    }
  });

  test("koşullar bölümü yasal sayfalara bağlanır", () => {
    for (const [dil, c] of diller) {
      assert.ok(c.policy.items.length >= 5, `${dil}: koşul maddeleri eksik`);
      assert.equal(c.policy.links.length, 3, `${dil}: üç yasal sayfaya da bağlanmalı`);
      for (const link of c.policy.links) {
        assert.ok(link.href.startsWith("/"), `${dil}: ${link.href} site içi olmalı`);
      }
    }
  });
});

describe("ücretler sayfasının görünürlük kuralları", () => {
  /*
    Ürün sekmesi CSS ile çalışıyor: `.pricing[data-urun="X"] .pgroup[data-urun="X"]`.
    CSS iki niteliği birbiriyle karşılaştıramadığı için her ürünün kendi
    satırı gerekiyor. PRICED_PRODUCTS'a yeni ürün eklenip bu satır
    unutulursa grup HİÇ görünmez — sekmeye basılır, sayfa boş kalır.
  */
  const css = readFileSync(new URL("../../app/(site)/site-pricing.css", import.meta.url), "utf8");

  test("her ürünün kendi görünürlük satırı var", () => {
    for (const product of PRICED_PRODUCTS) {
      assert.ok(
        css.includes(`.pricing[data-urun="${product}"] .pgroup[data-urun="${product}"]`),
        `${product}: site-pricing.css'te görünürlük kuralı yok`,
      );
    }
  });

  test("JavaScript yokken bütün gruplar açık kalır", () => {
    /* Gizleme kuralı data-urun'e bağlı olmalı; koşulsuz `.pgroup { display: none }`
       yazılsaydı JS yüklenmeden sayfada tek bir fiyat görünmezdi. */
    assert.ok(css.includes(".pricing[data-urun] .pgroup { display: none; }"));
    assert.equal(/^\s*\.site \.pgroup \{[^}]*display:\s*none/m.test(css), false);
  });
});
