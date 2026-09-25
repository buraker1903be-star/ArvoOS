import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  VARSAYILAN_ADIMLAR,
  hatirlatilacaklar,
  hatirlatmaDurumu,
  hatirlatmaMetni,
  kodTuret,
  sablonSorunu,
  type HatirlatilacakAdim,
} from "@/lib/is-adimlari";

const adim = (over: Partial<HatirlatilacakAdim> = {}): HatirlatilacakAdim => ({
  id: "a1",
  workflow_id: "w1",
  organization_id: "o1",
  title: "Literatür 1. kısım",
  due_date: "2026-10-10",
  is_completed: false,
  reminder_state: null,
  assigned_employee_id: null,
  ...over,
});

describe("termin uyarısı", () => {
  test("geçmiş tarih gecikti, üç gün içi yaklaştı, ötesi sessiz", () => {
    assert.equal(hatirlatmaDurumu(adim({ due_date: "2026-10-09" }), "2026-10-10"), "overdue");
    assert.equal(hatirlatmaDurumu(adim({ due_date: "2026-10-10" }), "2026-10-10"), "due_soon");
    assert.equal(hatirlatmaDurumu(adim({ due_date: "2026-10-13" }), "2026-10-10"), "due_soon");
    assert.equal(hatirlatmaDurumu(adim({ due_date: "2026-10-14" }), "2026-10-10"), null);
  });

  test("biten adım ve tarihsiz adım uyarı üretmez", () => {
    assert.equal(hatirlatmaDurumu(adim({ due_date: "2026-01-01", is_completed: true }), "2026-10-10"), null);
    assert.equal(hatirlatmaDurumu(adim({ due_date: null }), "2026-10-10"), null);
  });

  test("bozuk tarih sessizce 'gecikti' sayılmıyor", () => {
    // Date.parse("2026-13-40") NaN verir; guard olmasaydı fark NaN olur ve
    // "NaN < 0" false döndüğü için adım sessizce hiç uyarılmazdı.
    assert.equal(hatirlatmaDurumu(adim({ due_date: "2026-13-40" }), "2026-10-10"), null);
    assert.equal(hatirlatmaDurumu(adim({ due_date: "2026-02-30" }), "2026-10-10"), null);
  });
});

describe("aynı uyarı iki kez gitmiyor", () => {
  test("durum değişmedikçe yeniden gönderilmez", () => {
    const liste = [
      adim({ id: "yeni", due_date: "2026-10-11", reminder_state: null }),
      adim({ id: "zaten", due_date: "2026-10-11", reminder_state: "due_soon" }),
    ];
    assert.deepEqual(hatirlatilacaklar(liste, "2026-10-10").map((s) => s.adim.id), ["yeni"]);
  });

  test("yaklaştıdan geciktiye geçince bir kez daha gider", () => {
    const liste = [adim({ id: "gecikti", due_date: "2026-10-09", reminder_state: "due_soon" })];
    const cikan = hatirlatilacaklar(liste, "2026-10-10");
    assert.equal(cikan.length, 1);
    assert.equal(cikan[0].durum, "overdue");
  });

  test("tamamlanan adım, işareti dursa bile listeye girmez", () => {
    const liste = [adim({ due_date: "2026-10-01", reminder_state: "due_soon", is_completed: true })];
    assert.deepEqual(hatirlatilacaklar(liste, "2026-10-10"), []);
  });
});

describe("bildirim metni", () => {
  test("gecikme, bugün ve kalan gün ayrı ayrı yazılır", () => {
    assert.match(hatirlatmaMetni("Analiz bölümü", "2026-10-08", "2026-10-10"), /2 gün gecikti/);
    assert.match(hatirlatmaMetni("Analiz bölümü", "2026-10-10", "2026-10-10"), /bugün teslim/);
    assert.match(hatirlatmaMetni("Analiz bölümü", "2026-10-13", "2026-10-10"), /3 gün kaldı/);
  });
});

describe("şablon denetimi", () => {
  const satir = (over = {}) => ({ code: "taslak", title: "Taslak ve kaynaklar", sort_order: 10, day_offset: 7, is_active: true, ...over });

  test("geçerli şablon sorunsuz", () => assert.equal(sablonSorunu([satir()]), null));

  test("aynı kod iki kez yazılamaz", () => {
    // Birincil anahtar (organization_id, code): veritabanı zaten reddeder ama
    // hata mesajı "duplicate key" olurdu; kullanıcı hangi satır olduğunu görmeli.
    assert.match(sablonSorunu([satir(), satir({ title: "Başka adım" })]) ?? "", /benzersiz/);
  });

  test("boş başlık, bozuk kod ve akıl dışı gün sayısı reddedilir", () => {
    assert.match(sablonSorunu([satir({ title: " " })]) ?? "", /adını yazın/);
    assert.match(sablonSorunu([satir({ code: "Taslak Kod" })]) ?? "", /kodu geçersiz/);
    assert.match(sablonSorunu([satir({ day_offset: -1 })]) ?? "", /gün sayısı/);
    assert.match(sablonSorunu([satir({ day_offset: 1.5 })]) ?? "", /gün sayısı/);
  });

  test("ofset boş bırakılabilir: tarihi belli olmayan adım", () => {
    assert.equal(sablonSorunu([satir({ day_offset: null })]), null);
  });
});

describe("başlıktan kod türetme", () => {
  test("Türkçe harfler ASCII'ye iniyor", () => {
    assert.equal(kodTuret("Literatür 1. kısım"), "literatur_1_kisim");
    assert.equal(kodTuret("İç Kontrol Yapılıyor"), "ic_kontrol_yapiliyor");
    assert.equal(kodTuret("Şablon Çalışması"), "sablon_calismasi");
  });

  test("büyük I ile İ karışmıyor", () => {
    /*
      toLocaleLowerCase("tr") "I"yı "ı" yapar, "ı" da ASCII'de "i"dir.
      Sırasıyla çevrilmezse "IŞIK" ile "Işık" aynı koda düşmez ve biri
      "k" gibi bir kırıntıya iner.
    */
    assert.equal(kodTuret("IŞIK"), kodTuret("Işık"));
    assert.equal(kodTuret("IŞIK"), "isik");
  });

  test("üretilen kod desene uyuyor ve çakışınca numaralanıyor", () => {
    assert.match(kodTuret("Sunum"), /^[a-z0-9_]{2,40}$/);
    assert.equal(kodTuret("Sunum", new Set(["sunum"])), "sunum_2");
    // Hiç harf içermeyen başlık boş koda düşerdi; desen 2 karakter istiyor.
    assert.equal(kodTuret("—"), "adim");
  });
});

describe("varsayılan adımlar", () => {
  test("sekiz adım, kodları benzersiz ve desene uygun", () => {
    // add_standard_operation_steps ile aynı liste: "varsayılanı kopyala"
    // düğmesi bunu yazıyor, ikisi ayrışırsa kurum başka bir şablon alır.
    assert.equal(VARSAYILAN_ADIMLAR.length, 8);
    assert.equal(VARSAYILAN_ADIMLAR[0].title, "İş Kabul Edildi");
    assert.equal(VARSAYILAN_ADIMLAR[7].title, "Evrak Teslimine Hazır");
    assert.equal(new Set(VARSAYILAN_ADIMLAR.map((a) => a.code)).size, 8);
    assert.ok(VARSAYILAN_ADIMLAR.every((a) => /^[a-z0-9_]{2,40}$/.test(a.code)));
  });
});
