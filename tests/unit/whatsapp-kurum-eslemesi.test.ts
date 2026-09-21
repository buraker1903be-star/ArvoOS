import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { gelenMesajinKurumu } from "@/lib/whatsapp-kurum-eslemesi";

const ARVO = "arvo-kurum";
const SALON = "salon-kurum";
const BASKA = "baska-kurum";

describe("gelen mesajın kurumu", () => {
  test("bağlı numaraya gelen mesaj o kurumundur", () => {
    // En kesin ipucu: müşteri doğrudan işletmenin kendi numarasına yazmış.
    const sonuc = gelenMesajinKurumu({
      bagliKurumId: SALON,
      arvoNumarasi: false,
      sonYazismaKurumId: BASKA,
      arvoKurumId: ARVO,
    });
    assert.deepEqual(sonuc, { organizationId: SALON, kaynak: "bagli_numara" });
  });

  test("bağlı numara, Arvo numarası olsa bile önce gelir", () => {
    const sonuc = gelenMesajinKurumu({ bagliKurumId: SALON, arvoNumarasi: true, arvoKurumId: ARVO });
    assert.equal(sonuc?.kaynak, "bagli_numara");
  });

  test("Arvo numarasında son yazışmanın kurumu kullanılır", () => {
    // Müşteri kime cevap veriyorsa odur.
    const sonuc = gelenMesajinKurumu({ arvoNumarasi: true, sonYazismaKurumId: SALON, arvoKurumId: ARVO });
    assert.deepEqual(sonuc, { organizationId: SALON, kaynak: "son_yazisma" });
  });

  test("hiç yazışma yoksa mesaj Arvo'nun kendi kurumuna düşer", () => {
    /*
      Eskiden burada mesaj HİÇ yazılmıyordu; Arvo'nun numarasına ilk kez
      yazan biri sessizce kayboluyordu. Kişi işletmeye ulaştığını sanıyor,
      karşı tarafta kimse görmüyordu.
    */
    const sonuc = gelenMesajinKurumu({ arvoNumarasi: true, sonYazismaKurumId: null, arvoKurumId: ARVO });
    assert.deepEqual(sonuc, { organizationId: ARVO, kaynak: "arvo_kurumu" });
  });

  test("tanınmayan numaraya gelen bildirim yazılmaz", () => {
    // Ne bir kuruma bağlı ne de Arvo'nunki: kurulum hatası, uydurma kurum seçilmez.
    assert.equal(gelenMesajinKurumu({ arvoNumarasi: false, arvoKurumId: ARVO }), null);
  });

  test("Arvo kurumu kayıtlı değilse tahmin edilmez", () => {
    /*
      Rastgele bir müşteri kurumuna yazmak daha kötü olurdu: o kurumun
      personeli kendisine ait olmayan bir yazışmayı görürdü.
    */
    assert.equal(gelenMesajinKurumu({ arvoNumarasi: true, arvoKurumId: null }), null);
  });

  test("boş kimlikler yok sayılır", () => {
    // Boş dize bir kurum kimliği değildir; sıradaki ipucuna geçilir.
    const sonuc = gelenMesajinKurumu({ bagliKurumId: "", arvoNumarasi: true, arvoKurumId: ARVO });
    assert.deepEqual(sonuc, { organizationId: ARVO, kaynak: "arvo_kurumu" });
  });
});
