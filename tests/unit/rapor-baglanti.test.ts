import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { RAPORLAR } from "../../lib/rapor-tanimlari";

/*
  SEKİZ RAPORUN BAĞLANTILARI EKSİKSİZ Mİ.

  Rapor eklemek üç ayrı yere dokunmayı gerektiriyor: tanım listesi,
  sayfadaki pencere dağıtımı, indirme rotasındaki switch. Biri
  unutulursa HATA ÇIKMAZ:

   - sayfada unutulursa pencere boş açılır,
   - indirmede unutulursa düğme 501 döndürür,
   - yanlış üretece bağlanırsa (kopyala-yapıştır) BAŞKA RAPORUN
     dosyası iner ve kimse fark etmez.

  Bu test kaynak dosyaları okuyup eşlemeyi doğruluyor. Kaynak okumak
  kaba ama bu üç yer ayrı modüllerde ve çalışma anında birbirini
  görmüyor; tip sistemi de bir `case` dalının İÇİNDE doğru işlevin
  çağrıldığını söyleyemiyor.
*/
const oku = (yol: string) => readFileSync(new URL(yol, import.meta.url), "utf8");
const SAYFA = oku("../../app/panel/finance/raporlar/page.tsx");
const ROTA = oku("../../app/panel/finance/raporlar/indir/route.ts");

/** Rapor anahtarı → bileşen ve üreteç adlarının kökü. */
const KOK: Record<string, string> = {
  kokpit: "Kokpit", satis: "Satis", crm: "Crm", tahsilat: "Tahsilat",
  finans: "Finans", personel: "Personel", operasyon: "Operasyon", teklif: "Teklif",
};

describe("rapor bağlantıları", () => {
  it("her raporun anahtarı KOK tablosunda var", () => {
    for (const rapor of RAPORLAR) {
      assert.ok(KOK[rapor.anahtar], `${rapor.anahtar} için bileşen kökü tanımlı değil`);
    }
    assert.equal(Object.keys(KOK).length, RAPORLAR.length, "KOK tablosu fazla/eksik");
  });

  it("sayfa her raporu kendi bileşenine dağıtıyor", () => {
    for (const rapor of RAPORLAR) {
      const kalip = new RegExp(
        `acik\\.anahtar === "${rapor.anahtar}" \\? <${KOK[rapor.anahtar]}Raporu\\b`,
      );
      assert.match(SAYFA, kalip, `${rapor.kod} sayfada ${KOK[rapor.anahtar]}Raporu'na bağlı değil`);
    }
  });

  it("HAZIR listesi sekiz raporun hepsini sayıyor", () => {
    const m = SAYFA.match(/const HAZIR = new Set<RaporAnahtari>\(\[([\s\S]*?)\]\)/);
    assert.ok(m, "HAZIR listesi bulunamadı");
    const liste = [...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
    for (const rapor of RAPORLAR) {
      assert.ok(liste.includes(rapor.anahtar), `${rapor.kod} HAZIR listesinde yok`);
    }
  });

  it("indirme rotası her raporu KENDİ üretecine bağlıyor", () => {
    /* Asıl tehlike burada: `case "crm":` dalının içinde
       `satisSayfalari` çağrılırsa kullanıcı CRM düğmesine basıp
       satış dosyası indirir ve hiçbir yerde hata görünmez. */
    for (const rapor of RAPORLAR) {
      if (rapor.anahtar === "kokpit") continue; // kokpit bilerek indirilmiyor
      const dal = ROTA.match(new RegExp(`case "${rapor.anahtar}":([\\s\\S]*?)break;`));
      assert.ok(dal, `${rapor.kod} için indirme dalı yok`);
      const kok = KOK[rapor.anahtar];
      const bekleniyor = `${kok.charAt(0).toLowerCase()}${kok.slice(1)}`;
      assert.ok(dal[1].includes(`${bekleniyor}Sayfalari`), `${rapor.kod} dalı ${bekleniyor}Sayfalari çağırmıyor`);
      assert.ok(dal[1].includes(`${bekleniyor}Verisi`), `${rapor.kod} dalı ${bekleniyor}Verisi çağırmıyor`);
    }
  });

  it("INDIRILEBILIR listesi ile rota dalları aynı raporları kapsıyor", () => {
    const m = SAYFA.match(/const INDIRILEBILIR = new Set<RaporAnahtari>\(\[([\s\S]*?)\]\)/);
    assert.ok(m, "INDIRILEBILIR listesi bulunamadı");
    const liste = [...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]).sort();
    const dallar = [...ROTA.matchAll(/case "([a-z]+)":/g)].map((x) => x[1]).sort();
    assert.deepEqual(liste, dallar, "Excel düğmesi gösterilen raporlarla rota dalları ayrışmış");
  });

  it("kokpit indirilebilir listesinde değil", () => {
    /* Kokpit sekiz raporun özeti; tablosu yok, yorumu var. Yorumu
       Excel'e dökmek bir hücreye paragraf yazmak olurdu. */
    const m = SAYFA.match(/const INDIRILEBILIR = new Set<RaporAnahtari>\(\[([\s\S]*?)\]\)/);
    assert.ok(m && !m[1].includes('"kokpit"'), "kokpit indirilebilir görünüyor");
  });

  it("her raporun yetki anahtarı lib/yetkiler.ts'te tanımlı", () => {
    const yetkiler = oku("../../lib/yetkiler.ts");
    for (const rapor of RAPORLAR) {
      assert.ok(yetkiler.includes(`"${rapor.yetki}"`), `${rapor.kod} yetkisi (${rapor.yetki}) tanımlı değil`);
    }
    assert.ok(yetkiler.includes('"rapor.disa_aktar"'), "dışa aktarma yetkisi tanımlı değil");
  });
});
