import assert from "node:assert/strict";
import test from "node:test";
import { sablonAdiEngeli, sablonGovdesiEngeli, sablonuDoldur } from "@/lib/posta-sablon";

/* Hazır cevapların yer tutucu doldurması ve sınırları. */

test("yer tutucular doldurulur", () => {
  assert.equal(
    sablonuDoldur("Sayın {{musteri}}, teşekkürler.\n{{ben}} · {{kurum}}",
      { musteri: "Ayşe Yılmaz", ben: "Burak Erdoğan", kurum: "Akademik Merkez" }),
    "Sayın Ayşe Yılmaz, teşekkürler.\nBurak Erdoğan · Akademik Merkez",
  );
  // Büyük harf ve boşluklu yazım da tanınıyor.
  assert.equal(sablonuDoldur("Merhaba {{ MUSTERI }}", { musteri: "Ali" }), "Merhaba Ali");
});

test("değeri olmayan yer tutucu yalnız noktalama bırakmıyor", () => {
  /* "Sayın {{musteri}}," ad bilinmiyorken "Sayın ," üretmemeli. */
  assert.equal(sablonuDoldur("Sayın {{musteri}}, merhaba.", {}), "Sayın, merhaba.");
  assert.equal(sablonuDoldur("{{ben}} {{kurum}} ekibi", { kurum: "Arvo" }), "Arvo ekibi");
});

test("tanınmayan yer tutucu olduğu gibi kalıyor", () => {
  // Sessizce kaybolsaydı kullanıcı yazdığı şeyin gitmediğini fark etmezdi.
  assert.equal(sablonuDoldur("Kod: {{siparis_no}}", { musteri: "Ali" }), "Kod: {{siparis_no}}");
});

test("ad ve gövde sınırları Türkçe hata veriyor", () => {
  assert.match(sablonAdiEngeli("a") ?? "", /en az 2/);
  assert.match(sablonAdiEngeli("ş".repeat(81)) ?? "", /en fazla 80/);
  assert.equal(sablonAdiEngeli("  Fiyat bilgisi  "), null);
  assert.match(sablonGovdesiEngeli(" ") ?? "", /boş olamaz/);
  assert.match(sablonGovdesiEngeli("x".repeat(5001)) ?? "", /5\.000/);
  assert.equal(sablonGovdesiEngeli("Merhaba"), null);
});
