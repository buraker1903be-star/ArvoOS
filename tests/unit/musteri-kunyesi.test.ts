/*
  MÜŞTERİ KÜNYESİ ALANLARI.

  Operasyon sözleşmeyi ve teklifi göremiyor; künye onun müşteri hakkında
  bilgi aldığı tek yer. Alan listesi tek kaynakta duruyor — kart da
  düzenleme formu da oradan çiziliyor.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ILETISIM_ALANLARI,
  KUNYE_ALANLARI,
  KUNYE_EN_UZUN,
  doluAlanlar,
  iletisimiDerle,
  kunyeyiDerle,
} from "@/lib/musteri-kunyesi";

const formdan = (deger: Record<string, string>) => kunyeyiDerle((a) => deger[a] ?? null);

describe("müşteri künyesi", () => {
  test("çalışma türü düzenlenebilir alan değil", () => {
    /* service_type görev şablonunu seçiyor ve fırsatta belirleniyor;
       formda yer alsaydı operasyon iş akışının şablonunu değiştirirdi. */
    assert.ok(!KUNYE_ALANLARI.some((a) => a.anahtar === "service_type"));
  });

  test("boş alan silme isteği olarak gidiyor", () => {
    /* Yalnızca doluları göndermek "boş bıraktım" ile "dokunmadım"ı aynı
       şey yapar ve yanlış yazılmış bir bölüm adı asla silinemezdi. */
    const kunye = formdan({ university: "Ege Üniversitesi", faculty: "   " });
    assert.equal(kunye.university, "Ege Üniversitesi");
    assert.equal(kunye.faculty, "");
    assert.equal(kunye.department, "");
  });

  test("her alan her zaman gönderiliyor", () => {
    const kunye = formdan({});
    assert.deepEqual(Object.keys(kunye).sort(), KUNYE_ALANLARI.map((a) => a.anahtar).sort());
  });

  test("baştaki sondaki boşluk kırpılıyor, uzunluk sınırlanıyor", () => {
    const kunye = formdan({ university: "  Boğaziçi  ", department: "x".repeat(400) });
    assert.equal(kunye.university, "Boğaziçi");
    assert.equal(kunye.department?.length, KUNYE_EN_UZUN);
  });

  test("kart yalnızca dolu alanları liste sırasıyla gösteriyor", () => {
    const liste = doluAlanlar({ department: "Biyokimya", university: "Ege", faculty: "" });
    assert.deepEqual(liste.map((a) => a.anahtar), ["university", "department"]);
    assert.equal(liste[0].etiket, "Üniversite");
  });

  test("künye yoksa kart boş", () => {
    assert.deepEqual(doluAlanlar(null), []);
    assert.deepEqual(doluAlanlar({}), []);
  });
});

describe("iletişim bilgileri", () => {
  test("ad zorunlu, diğerleri değil", () => {
    /* Ad sütunu NOT NULL ve sözleşme belgesi bu addan çiziliyor. */
    const ad = ILETISIM_ALANLARI.find((a) => a.anahtar === "customer_name");
    assert.equal(ad?.zorunlu, true);
    assert.equal(ILETISIM_ALANLARI.find((a) => a.anahtar === "contact_email")?.zorunlu, undefined);
  });

  test("boş alan boş gidiyor, sessizce eskiye dönülmüyor", () => {
    /* Doğrulamayı veritabanı yapıyor ve hatayı kullanıcı görüyor;
       burada eski değere dönmek yanlışlıkla silindiğini gizlerdi. */
    const i = iletisimiDerle((a) => ({ customer_name: "  Ayşe Yılmaz  ", contact_email: "" }[a] ?? null));
    assert.equal(i.customer_name, "Ayşe Yılmaz");
    assert.equal(i.contact_email, "");
    assert.equal(i.contact_phone, "");
  });

  test("künye ve iletişim alanları karışmıyor", () => {
    /* İkisi ayrı yere yazılıyor: künye jsonb'ye, iletişim sütunlara. */
    const kunyeAnahtarlari = new Set(KUNYE_ALANLARI.map((a) => a.anahtar));
    assert.ok(!ILETISIM_ALANLARI.some((a) => kunyeAnahtarlari.has(a.anahtar)));
  });
});
