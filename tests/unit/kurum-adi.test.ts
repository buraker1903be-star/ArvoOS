import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { organizationBrandName } from "../../lib/kurum-adi";

/*
  ÜÇ AD, ÜÇ AYRI İŞ ve karıştırılmamalı:
   - `organizations.name`         → TİCARİ UNVAN (teklif, sözleşme,
     gizlilik sözleşmesi — yasal taraf adı),
   - `organizations.display_name` → MARKA (kenar çubuğu, müşteri
     mesajları, RAPOR KÜNYESİ),
   - `organizations.legal_name`   → Ayarlar'daki unvan alanı.

  Kurum sahibinin kararı (24.10.2026): rapor evrakında marka adı
  yazsın, yasal belgelerde ticari unvan kalsın — yönetici hangi
  MARKANIN rakamlarına baktığını görebilsin.
*/
describe("kurumun marka adı", () => {
  it("marka adı varsa onu kullanır", () => {
    assert.equal(organizationBrandName({
      slug: "akademikmerkez", displayName: "AkademikMerkez",
      legalName: "ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD.ŞTİ.",
    }), "AkademikMerkez");
  });

  it("marka adı boş ya da boşluksa ticari unvana düşmez, slug'ı tanır", () => {
    /* İki kurucu kurumun ticari unvanı AYNI; unvandan türetmek
       ikisini aynı ada indirirdi. */
    for (const bos of [null, "", "   "]) {
      assert.equal(organizationBrandName({
        slug: "akademikmerkez", displayName: bos,
        legalName: "ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD.ŞTİ.",
      }), "AkademikMerkez");
      assert.equal(organizationBrandName({
        slug: "arvo-os", displayName: bos,
        legalName: "ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD.ŞTİ.",
      }), "ArvoOS");
    }
  });

  it("yeni kiracıda unvandan şirket ekini atar", () => {
    assert.equal(organizationBrandName({ slug: "beta", displayName: null, legalName: "Beta Danışmanlık Ltd. Şti." }), "Beta Danışmanlık");
    assert.equal(organizationBrandName({ slug: "beta", displayName: null, legalName: "Beta Danışmanlık LTD.ŞTİ." }), "Beta Danışmanlık");
    assert.equal(organizationBrandName({ slug: "gama", displayName: null, legalName: "Gama Eğitim Anonim Şirketi" }), "Gama Eğitim");
    assert.equal(organizationBrandName({ slug: "delta", displayName: null, legalName: "Delta Limited Şirketi" }), "Delta");
  });

  it("eki olmayan unvanı olduğu gibi bırakır", () => {
    assert.equal(organizationBrandName({ slug: "x", displayName: null, legalName: "Epsilon Akademi" }), "Epsilon Akademi");
  });

  it("marka adının başındaki/sonundaki boşluğu kırpar", () => {
    assert.equal(organizationBrandName({ slug: "x", displayName: "  Zeta  ", legalName: "Zeta Ltd. Şti." }), "Zeta");
  });

  it("slug verilmese de çalışır", () => {
    assert.equal(organizationBrandName({ displayName: null, legalName: "Teta Yazılım Ltd. Şti." }), "Teta Yazılım");
  });
});

describe("şirket ekini atma — Türkçe büyük harf", () => {
  const marka = (unvan: string) => organizationBrandName({ slug: "x", displayName: null, legalName: unvan });

  it("BÜYÜK harfli eki de atar", () => {
    /*
      `/şti\.?$/i` kalıbı Türkçe İ'yi i'ye katlamıyordu; "LTD.ŞTİ."
      eşleşmiyor ve ek marka adında kalıyordu. Türkçe'de unvanın
      büyük yazılması olağan, yani bu kusur çoğu kiracıda görünürdü.
    */
    assert.equal(marka("BETA DANIŞMANLIK LTD.ŞTİ."), "BETA DANIŞMANLIK");
    assert.equal(marka("BETA DANIŞMANLIK LTD. ŞTİ."), "BETA DANIŞMANLIK");
    assert.equal(marka("GAMA EĞİTİM ANONİM ŞİRKETİ"), "GAMA EĞİTİM");
    assert.equal(marka("DELTA LİMİTED ŞİRKETİ"), "DELTA");
  });

  it("noktasız i ile yazılmış ekleri de tanır", () => {
    /* Türkçe küçültme büyük "I"yı noktasız ı yapıyor ("LIMITED" →
       "lımıted"); eşleşme kopyasında ı da i'ye indiriliyor. */
    assert.equal(marka("EPSILON YAZILIM LIMITED ŞIRKETI"), "EPSILON YAZILIM");
    assert.equal(marka("ZETA EĞİTİM ANONIM ŞIRKETI"), "ZETA EĞİTİM");
  });

  it("SINIR: Türkçe harfler ASCII yazılmışsa ek atılmıyor", () => {
    /*
      "SIRKETI" (ş yerine s) Türkçe küçültmeyle "şirketi" olmaz ve
      eşleşmez. Bu BİLİNÇLİ bir sınır: ş→s, ğ→g, ü→u gibi bütün
      ASCII'leştirmeleri kovalamak, unvanın ortasındaki meşru
      kelimeleri de kesme riskini getirirdi. Marka adı boş kalmıyor,
      yalnızca eki duruyor — ve kiracı `display_name` girdiği an
      sorun ortadan kalkıyor.
    */
    assert.equal(marka("EPSILON YAZILIM LIMITED SIRKETI"), "EPSILON YAZILIM LIMITED SIRKETI");
  });

  it("özgün büyük/küçük harfi bozmaz", () => {
    // Kesme küçültülmüş kopyadan değil ÖZGÜN metinden yapılıyor.
    assert.equal(marka("Teta Yazılım Ltd. Şti."), "Teta Yazılım");
    assert.equal(marka("TeTa YaZıLıM LTD.ŞTİ."), "TeTa YaZıLıM");
  });

  it("eki olmayan unvana dokunmaz", () => {
    assert.equal(marka("Epsilon Akademi"), "Epsilon Akademi");
    assert.equal(marka("ŞTİ Danışmanlık"), "ŞTİ Danışmanlık");
  });
});
