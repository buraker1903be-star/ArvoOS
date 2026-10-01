import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  REVIZYON_UYARI_GUN,
  revizyonBilgisi,
  revizyonOzeti,
  revizyonUyarilari,
  type RevizyonSatiri,
} from "@/lib/revizyon";

/*
  Revizyon penceresi.

  "2 ay ücretsiz revizyon" sözleşme metninde bir cümleydi; panelde hiçbir
  karşılığı yoktu. Dolmuş bir hak için ücretsiz çalışmak da, dolmamış bir
  hakkı reddetmek de müşteriyle tartışma demekti.
*/
const is = (over: Partial<RevizyonSatiri> = {}): RevizyonSatiri => ({
  id: "w1",
  organization_id: "o1",
  title: "Tez",
  customer_name: "Emine Yılmaz",
  revision_until: "2026-12-20",
  revision_reminder_state: null,
  assigned_employee_id: null,
  ...over,
});

describe("pencerenin durumu", () => {
  test("açık, doluyor ve dolmuş ayrımı", () => {
    assert.deepEqual(revizyonBilgisi("2026-12-20", "2026-10-01"), { durum: "open", kalanGun: 80 });
    assert.deepEqual(revizyonBilgisi("2026-10-05", "2026-10-01"), { durum: "ending_soon", kalanGun: 4 });
    assert.deepEqual(revizyonBilgisi("2026-10-01", "2026-10-01"), { durum: "ending_soon", kalanGun: 0 });
    assert.deepEqual(revizyonBilgisi("2026-09-28", "2026-10-01"), { durum: "ended", kalanGun: -3 });
  });

  test("eşik tam sınırda da uyarıyor", () => {
    const sinir = revizyonBilgisi("2026-10-08", "2026-10-01");
    assert.equal(sinir?.kalanGun, REVIZYON_UYARI_GUN);
    assert.equal(sinir?.durum, "ending_soon");
  });

  test("süre tanımlı değilse pencere yok", () => {
    // Boş bir tarih uydurmuyoruz: kurumun revizyon penceresi olmayabilir.
    assert.equal(revizyonBilgisi(null, "2026-10-01"), null);
    assert.equal(revizyonBilgisi("20.12.2026", "2026-10-01"), null);
    assert.equal(revizyonOzeti(null, "2026-10-01"), null);
  });

  test("özet cümlesi gün ve tarihi birlikte veriyor", () => {
    assert.equal(revizyonOzeti("2026-12-20", "2026-10-01"), "Revizyon hakkı 20.12.2026 tarihine kadar · 80 gün kaldı");
    assert.equal(revizyonOzeti("2026-10-01", "2026-10-01"), "Revizyon hakkı bugün doluyor (01.10.2026)");
    assert.equal(revizyonOzeti("2026-09-28", "2026-10-01"), "Revizyon hakkı 28.09.2026 tarihinde doldu");
  });
});

describe("hatırlatma", () => {
  test("açık pencere için uyarı üretilmiyor", () => {
    assert.deepEqual(revizyonUyarilari([is()], "2026-10-01"), []);
  });

  test("bitişe yaklaşınca ve dolunca birer kez uyarıyor", () => {
    const yaklasan = revizyonUyarilari([is({ revision_until: "2026-10-05" })], "2026-10-01");
    assert.equal(yaklasan.length, 1);
    assert.equal(yaklasan[0].durum, "ending_soon");
    assert.match(yaklasan[0].mesaj, /Emine Yılmaz/);
    assert.match(yaklasan[0].mesaj, /4 gün/);

    // Aynı uyarı iki kez gitmiyor: en son hangi durum için gittiği işte yazılı.
    const tekrar = revizyonUyarilari(
      [is({ revision_until: "2026-10-05", revision_reminder_state: "ending_soon" })], "2026-10-01");
    assert.deepEqual(tekrar, []);

    // Pencere dolunca durum değişiyor, uyarı yeniden gidiyor.
    const dolan = revizyonUyarilari(
      [is({ revision_until: "2026-09-28", revision_reminder_state: "ending_soon" })], "2026-10-01");
    assert.equal(dolan.length, 1);
    assert.equal(dolan[0].durum, "ended");
    assert.match(dolan[0].mesaj, /ücretlendirilecek/);
  });

  test("müşteri adı yoksa iş başlığı kullanılıyor", () => {
    const uyari = revizyonUyarilari([is({ customer_name: "  ", revision_until: "2026-10-02" })], "2026-10-01");
    assert.match(uyari[0].mesaj, /^Tez /);
  });

  test("penceresi olmayan iş hiç uyarı üretmiyor", () => {
    assert.deepEqual(revizyonUyarilari([is({ revision_until: null })], "2026-10-01"), []);
  });

  /*
    CRON SORGUSUNUN DAYANDIĞI KOŞUL. Bildirimi gönderilmiş ("ended")
    işler artık SQL'de eleniyor; aksi hâlde revizyon penceresi geçmişte
    kalan her iş sonsuza kadar sorguya giriyor, 200 satırlık partiyi
    dolduruyor ve yeni dolan bir pencere hiç sıraya giremiyordu.

    Bu eleme ancak "ended" gerçekten SON durumsa güvenli. Test onu
    sabitliyor: tarih ne kadar geride olursa olsun, durumu "ended" olan
    iş bir daha uyarı üretmiyor. Bu doğru olmaktan çıkarsa sorgudan
    eleme sessizce bildirim kaybına dönüşür.
  */
  test("ended sonlanmış durumdur: bir daha uyarı üretmiyor", () => {
    for (const bugun of ["2026-10-01", "2026-11-15", "2027-06-30", "2030-01-01"]) {
      assert.deepEqual(
        revizyonUyarilari(
          [is({ revision_until: "2026-09-28", revision_reminder_state: "ended" })],
          bugun,
        ),
        [],
        bugun,
      );
    }
  });

  test("ending_soon işleri sorguda kalmalı: ended bildirimini sonra alıyorlar", () => {
    /* SQL elemesi yalnızca "ended" olanları çıkarıyor; bu test neden
       "ending_soon"un da çıkarılamayacağını gösteriyor. */
    const dolan = revizyonUyarilari(
      [is({ revision_until: "2026-09-28", revision_reminder_state: "ending_soon" })],
      "2026-10-01",
    );
    assert.equal(dolan.length, 1);
    assert.equal(dolan[0].durum, "ended");
  });
});
