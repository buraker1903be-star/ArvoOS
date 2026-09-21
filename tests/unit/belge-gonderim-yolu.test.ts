import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { belgeGonderimYolu } from "@/lib/belge-gonderim-yolu";

describe("belge hangi yoldan gidecek", () => {
  test("kendi numarası bağlı kurum panelden gönderir", () => {
    assert.equal(belgeGonderimYolu({ kendiNumarasiBagli: true, arvoKurumu: false }), "panel");
  });

  test("numara bağlamamış kurumda eski usul devam eder", () => {
    /*
      Arvo'nun ortak numarasından göndermiyoruz: müşteri hiç tanımadığı bir
      numaradan teklif almış olurdu ve mesaj kurumun kendi kimliğiyle
      gidiyormuş izlenimi yanlış olurdu.
    */
    assert.equal(belgeGonderimYolu({ kendiNumarasiBagli: false, arvoKurumu: false }), "whatsapp-web");
  });

  test("Arvo kendi kurumu için ortak numarayı kullanabilir", () => {
    // Ortak numara zaten Arvo'nun numarası; kimlik yanlış temsil edilmiyor.
    assert.equal(belgeGonderimYolu({ kendiNumarasiBagli: false, arvoKurumu: true }), "panel");
  });

  test("Arvo kendi numarasını bağlasa da panelden gider", () => {
    assert.equal(belgeGonderimYolu({ kendiNumarasiBagli: true, arvoKurumu: true }), "panel");
  });
});
