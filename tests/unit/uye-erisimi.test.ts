import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { erisimDegisikligiEngeli } from "@/lib/uye-erisimi";

const engel = (o: Partial<Parameters<typeof erisimDegisikligiEngeli>[0]>) =>
  erisimDegisikligiEngeli({ kendisiMi: false, aciliyorMu: false, hedefRol: "member", digerAktifSahip: 1, ...o });

describe("üye erişimi değişikliği", () => {
  test("sıradan üyenin erişimi kapatılabilir", () => {
    assert.equal(engel({}), null);
  });

  test("erişim açmak hiçbir zaman engellenmez", () => {
    // Açmak kilitlemeye yol açmaz; son sahip kuralı yalnızca kapatmada geçerli.
    assert.equal(engel({ aciliyorMu: true, hedefRol: "owner", digerAktifSahip: 0 }), null);
    assert.equal(engel({ aciliyorMu: true, kendisiMi: true }), null);
  });

  test("kişi kendi erişimini kapatamaz", () => {
    // Kendini dışarıda bırakır ve geri açacak kimse kalmayabilir.
    assert.match(engel({ kendisiMi: true }) ?? "", /Kendi erişiminizi/);
  });

  test("son aktif sahibin erişimi kapatılamaz", () => {
    /*
      Veritabanındaki koruma yalnızca istek bağlamı olan çağrılarda
      çalışıyor; konsol service_role ile yazdığı için oradan geçmiyor.
      Kural burada olmazsa kurum sahipsiz kalır ve kimse giremez.
    */
    assert.match(engel({ hedefRol: "owner", digerAktifSahip: 0 }) ?? "", /en az bir aktif Kurum Sahibi/);
  });

  test("başka sahip varsa bir sahibin erişimi kapatılabilir", () => {
    assert.equal(engel({ hedefRol: "owner", digerAktifSahip: 1 }), null);
  });

  test("kendisi olmak son sahip kuralından önce gelir", () => {
    // İki engel birden geçerliyse daha anlaşılır olanı gösteriliyor.
    assert.match(engel({ kendisiMi: true, hedefRol: "owner", digerAktifSahip: 0 }) ?? "", /Kendi erişiminizi/);
  });
});
