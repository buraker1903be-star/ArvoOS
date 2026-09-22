import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { kurusuTlYaz, niyetiCoz, niyetiFormdanOku, ucretiKurusaCevir } from "@/lib/abonelik-niyeti";

const form = (alanlar: Record<string, string>) => (ad: string) => alanlar[ad] ?? "";

describe("ücret dönüşümü", () => {
  test("TL kuruşa çevrilir", () => {
    assert.equal(ucretiKurusaCevir("4500"), 450000);
  });

  test("bin ayırıcı nokta doğru okunur", () => {
    /*
      "1.500" bin beş yüzdür, bir buçuk değil. Yanlış okumak müşteriye bin
      kat yanlış fiyat yazmak demek.
    */
    assert.equal(ucretiKurusaCevir("1.500"), 150000);
  });

  test("kuruş virgülle girilebilir", () => {
    assert.equal(ucretiKurusaCevir("4500,50"), 450050);
  });

  test("boş ücret null döner", () => {
    // Girilmemiş ücreti sıfır saymak, ücretsiz bir abonelik açmak olurdu.
    assert.equal(ucretiKurusaCevir(""), null);
    assert.equal(ucretiKurusaCevir("  "), null);
  });

  test("geçersiz ve eksi değer null döner", () => {
    assert.equal(ucretiKurusaCevir("abc"), null);
    assert.equal(ucretiKurusaCevir("-100"), null);
  });

  test("kuruş TL metnine geri çevrilir", () => {
    assert.equal(kurusuTlYaz(450000), "4500");
    assert.equal(kurusuTlYaz(null), "");
  });
});

describe("formdan niyet", () => {
  test("yalnızca işaretli modüller yazılır", () => {
    // Ücreti girilmiş ama seçilmemiş bir modül, kazayla açılacak modüldü.
    const niyet = niyetiFormdanOku(form({
      modul_arvolab: "on", ucret_arvolab: "1800", paket_arvolab: "professional",
      ucret_arc: "1200",
    }));
    assert.equal(niyet.modules.length, 1);
    assert.equal(niyet.modules[0].product, "arvolab");
    assert.equal(niyet.modules[0].monthly_fee, 180000);
    assert.equal(niyet.modules[0].plan_code, "professional");
  });

  test("bağımsız kutusu tersine çevrilir", () => {
    // Kutu "bağımsız" diye işaretleniyor; sakladığımız değer integrated.
    const niyet = niyetiFormdanOku(form({ modul_arc: "on", bagimsiz_arc: "on" }));
    assert.equal(niyet.modules[0].integrated, false);
  });

  test("işaretsiz bağımsız kutusu entegre demektir", () => {
    const niyet = niyetiFormdanOku(form({ modul_arc: "on" }));
    assert.equal(niyet.modules[0].integrated, true);
  });

  test("tanınmayan paket null olur", () => {
    const niyet = niyetiFormdanOku(form({ modul_arvoos: "on", paket_arvoos: "uydurma" }));
    assert.equal(niyet.modules[0].plan_code, null);
  });

  test("hiç modül seçilmezse boş niyet", () => {
    assert.deepEqual(niyetiFormdanOku(form({})), { modules: [] });
  });
});

describe("saklanan niyetin çözülmesi", () => {
  test("geçerli kayıt okunur", () => {
    const niyet = niyetiCoz({ modules: [{ product: "arvolab", monthly_fee: 180000, integrated: false }] });
    assert.equal(niyet.modules[0].monthly_fee, 180000);
    assert.equal(niyet.modules[0].integrated, false);
  });

  test("tanınmayan ürün atılır", () => {
    /*
      Ürün listesinden çıkarılmış bir kod yüzünden onay ekranının
      patlaması, o satırı görmezden gelmekten kötü.
    */
    const niyet = niyetiCoz({ modules: [{ product: "eskiurun" }, { product: "arc" }] });
    assert.deepEqual(niyet.modules.map((m) => m.product), ["arc"]);
  });

  test("aynı ürün iki kez yazılmışsa sonuncusu geçerli", () => {
    // İki lisans satırı yazmak onayda çakışma hatası verirdi.
    const niyet = niyetiCoz({ modules: [{ product: "arc", monthly_fee: 100 }, { product: "arc", monthly_fee: 200 }] });
    assert.equal(niyet.modules.length, 1);
    assert.equal(niyet.modules[0].monthly_fee, 200);
  });

  test("bozuk ve boş girdi boş niyet döner", () => {
    assert.deepEqual(niyetiCoz(null), { modules: [] });
    assert.deepEqual(niyetiCoz({ modules: "x" }), { modules: [] });
    assert.deepEqual(niyetiCoz({}), { modules: [] });
  });

  test("integrated belirtilmemişse entegre sayılır", () => {
    assert.equal(niyetiCoz({ modules: [{ product: "arc" }] }).modules[0].integrated, true);
  });
});
