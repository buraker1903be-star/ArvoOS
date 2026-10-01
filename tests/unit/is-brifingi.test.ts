import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  BRIEF_EN_COK,
  METIN_EN_UZUN,
  VARSAYILAN_BRIEF_ALANLARI,
  brifingDogrula,
  brifingDoluluk,
  brifingFormSorunu,
  brifingOku,
  gecerliAlanlar,
  type BriefField,
} from "@/lib/is-brifingi";

/*
  İş brifingi.

  Gönderilen taslak 8 bölüm ve 60'ın üzerinde onay kutusuydu; böyle bir
  form dürüst doldurulmaz. Buradaki kurallar üç şeyi sabitliyor: boş yanıt
  "yanıt" sayılmaz, seçim soruları uydurma değer kabul etmez, zorunlu alan
  gerçekten zorunludur.
*/
const alan = (over: Partial<BriefField> = {}): BriefField => ({
  code: "kapsam",
  label: "İşin kapsamı",
  field_type: "long_text",
  options: null,
  hint: null,
  is_required: false,
  set_codes: null,
  sort_order: 10,
  is_active: true,
  ...over,
});

describe("brifing formunun tanımı", () => {
  test("geçerli form sorunsuz", () => assert.equal(brifingFormSorunu([alan()]), null));

  test("aynı kod iki kez yazılamaz", () => {
    assert.match(brifingFormSorunu([alan(), alan({ label: "Başka soru" })]) ?? "", /benzersiz/);
  });

  test("seçim sorusunda en az iki şık gerekir", () => {
    // Tek şıklı bir seçim soru değildir; kullanıcıya karar bırakmaz.
    assert.match(brifingFormSorunu([alan({ field_type: "select", options: ["Evet"] })]) ?? "", /en az iki seçenek/);
    assert.equal(brifingFormSorunu([alan({ field_type: "select", options: ["Evet", "Hayır"] })]), null);
  });

  test("seçim olmayan soruda şık taşınamaz", () => {
    // Ekranda görünmeyen veri sessizce taşınırdı.
    assert.match(brifingFormSorunu([alan({ field_type: "text", options: ["a", "b"] })]) ?? "", /seçim sorusu değil/);
  });

  test("bozuk kod, boş başlık ve bilinmeyen tip reddedilir", () => {
    assert.match(brifingFormSorunu([alan({ code: "Kapsam" })]) ?? "", /kodu geçersiz/);
    assert.match(brifingFormSorunu([alan({ label: "x" })]) ?? "", /2–120/);
    assert.match(brifingFormSorunu([alan({ field_type: "numara" as never })]) ?? "", /tipi geçersiz/);
  });

  test("soru sayısı sınırlı", () => {
    const cok = Array.from({ length: BRIEF_EN_COK + 1 }, (_, i) => alan({ code: `a${i}` }));
    assert.match(brifingFormSorunu(cok) ?? "", new RegExp(String(BRIEF_EN_COK)));
  });
});

describe("çalışma türüne göre sorular", () => {
  test("türü belirtilmiş soru yalnızca o türde sorulur", () => {
    const alanlar = [
      alan({ code: "kapsam", set_codes: null, sort_order: 10 }),
      alan({ code: "veri", label: "Veri ne zaman gelecek", set_codes: ["tez", "analiz"], sort_order: 20 }),
    ];
    assert.deepEqual(gecerliAlanlar(alanlar, "tez").map((a) => a.code), ["kapsam", "veri"]);
    // "Veri ne zaman gelecek" sorusunun ödev işinde yeri yok.
    assert.deepEqual(gecerliAlanlar(alanlar, "odev").map((a) => a.code), ["kapsam"]);
    assert.deepEqual(gecerliAlanlar(alanlar, null).map((a) => a.code), ["kapsam"]);
  });

  test("pasif soru hiç sorulmaz", () => {
    assert.deepEqual(gecerliAlanlar([alan({ is_active: false })], "tez"), []);
  });
});

describe("yanıtların doğrulanması", () => {
  test("boş yanıt kaydedilmez: 'boş' ile 'yanıtlanmadı' aynı şey değil", () => {
    const { values, hata } = brifingDogrula([alan()], { kapsam: "   " });
    assert.equal(hata, null);
    assert.deepEqual(values, {});
  });

  test("zorunlu alan boş bırakılamaz", () => {
    assert.match(brifingDogrula([alan({ is_required: true })], {}).hata ?? "", /zorunlu/);
    assert.equal(brifingDogrula([alan({ is_required: true })], { kapsam: "Tez yazımı" }).hata, null);
  });

  test("seçim soruları yalnızca kendi şıklarını kabul eder", () => {
    const secim = alan({ code: "kanal", field_type: "select", options: ["E-posta", "WhatsApp"] });
    assert.deepEqual(brifingDogrula([secim], { kanal: "WhatsApp" }).values, { kanal: "WhatsApp" });
    assert.match(brifingDogrula([secim], { kanal: "Güvercin" }).hata ?? "", /geçersiz seçenek/);
  });

  test("çok seçimli alan dizi döndürür, tek seçim de kabul edilir", () => {
    const cok = alan({ code: "malzeme", field_type: "multi_select", options: ["Taslak", "Veri"] });
    assert.deepEqual(brifingDogrula([cok], { malzeme: ["Taslak", "Veri"] }).values, { malzeme: ["Taslak", "Veri"] });
    assert.deepEqual(brifingDogrula([cok], { malzeme: "Veri" }).values, { malzeme: ["Veri"] });
    assert.deepEqual(brifingDogrula([cok], {}).values, {});
  });

  test("evet/hayır üç durumlu: evet, hayır ve yanıtsız", () => {
    const ikili = alan({ code: "danisman", field_type: "bool" });
    assert.deepEqual(brifingDogrula([ikili], { danisman: "evet" }).values, { danisman: true });
    assert.deepEqual(brifingDogrula([ikili], { danisman: "hayir" }).values, { danisman: false });
    // Yanıtsız bırakmak "hayır" değildir: soru sorulmamış demektir.
    assert.deepEqual(brifingDogrula([ikili], { danisman: "" }).values, {});
  });

  test("tarih gün anahtarı olmalı, metin sınırı var", () => {
    const tarih = alan({ code: "ara", field_type: "date" });
    assert.deepEqual(brifingDogrula([tarih], { ara: "2026-10-20" }).values, { ara: "2026-10-20" });
    assert.match(brifingDogrula([tarih], { ara: "20.10.2026" }).hata ?? "", /gün\/ay\/yıl/);
    assert.match(brifingDogrula([alan()], { kapsam: "x".repeat(METIN_EN_UZUN + 1) }).hata ?? "", /en fazla/);
  });

  test("formda olmayan anahtar yazılmaz", () => {
    // Tanımsız alan kodu gönderen bir istemci jsonb'yi kirletemez.
    assert.deepEqual(brifingDogrula([alan()], { kapsam: "Tez", gizli: "x" }).values, { kapsam: "Tez" });
  });
});

describe("brifingin okunması", () => {
  const alanlar = [
    alan({ code: "kapsam" }),
    alan({ code: "malzeme", field_type: "multi_select", options: ["Taslak", "Veri"], sort_order: 20 }),
    alan({ code: "danisman", field_type: "bool", sort_order: 30 }),
  ];

  test("değerler okunur metne çevriliyor", () => {
    const satirlar = brifingOku(alanlar, { kapsam: "Tez yazımı", malzeme: ["Taslak", "Veri"], danisman: false });
    assert.deepEqual(satirlar.map((s) => s.yazi), ["Tez yazımı", "Taslak, Veri", "Hayır"]);
  });

  test("eksik brifing görünür: doluluk sayılıyor", () => {
    assert.deepEqual(brifingDoluluk(alanlar, { kapsam: "Tez yazımı" }), { dolu: 1, toplam: 3 });
    assert.deepEqual(brifingDoluluk(alanlar, null), { dolu: 0, toplam: 3 });
    // "false" bir yanıttır; boş sayılmamalı.
    assert.deepEqual(brifingDoluluk(alanlar, { danisman: false }), { dolu: 1, toplam: 3 });
  });
});

describe("ön ayar", () => {
  test("sektörsüz ve kendi kurallarına uygun", () => {
    /*
      Ön ayar ürünün içinde; akademik alanlar (danışman, benzerlik raporu)
      buraya girerse ArvoOS tek bir sektörün yazılımına döner. Adım
      şablonlarında tam olarak bu olmuştu.
    */
    const satirlar = VARSAYILAN_BRIEF_ALANLARI.map((a, i) => ({ ...a, sort_order: (i + 1) * 10, is_active: true }));
    assert.equal(brifingFormSorunu(satirlar), null);
    const metin = JSON.stringify(VARSAYILAN_BRIEF_ALANLARI).toLocaleLowerCase("tr-TR");
    for (const sektor of ["tez", "danışman", "turnitin", "makale", "üniversite"]) {
      assert.equal(metin.includes(sektor), false, `ön ayarda sektöre özel sözcük: ${sektor}`);
    }
  });
});
