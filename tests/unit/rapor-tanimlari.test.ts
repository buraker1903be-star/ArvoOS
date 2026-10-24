/*
  RAPOR TANIMLARI VE ADRES KURALLARI.

  Raporlar adresten açılıyor; adres yanlış kurulursa filtre kaybolur
  ya da ilgisiz bir filtre başka rapora taşınır. İkisi de sessiz:
  ekranda rapor açılır, yalnızca YANLIŞ veriyi gösterir.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { RAPORLAR, raporBul, gorulebilenRaporlar, raporAdresi, kapatmaAdresi } from "@/lib/rapor-tanimlari";

const TABAN = "/panel/finance/raporlar";

test("sekiz rapor var ve kodları benzersiz", () => {
  assert.equal(RAPORLAR.length, 8);
  const kodlar = new Set(RAPORLAR.map((r) => r.kod));
  assert.equal(kodlar.size, 8, "rapor kodu çıktıda yazıyor; iki rapor aynı kodu taşıyamaz");
  const anahtarlar = new Set(RAPORLAR.map((r) => r.anahtar));
  assert.equal(anahtarlar.size, 8);
});

test("her raporun bir yetki anahtarı var", () => {
  /* Kart, pencere ve dışa aktarma aynı anahtarı soruyor; anahtarsız
     bir rapor yetki kapısı olmadan açılırdı. */
  for (const rapor of RAPORLAR) {
    assert.match(rapor.yetki, /^rapor\./, rapor.anahtar);
  }
});

test("ADRESTEN GELEN DEĞER DOĞRULANIYOR", () => {
  /* Kullanıcı adrese ne yazarsa yazsın: tanınmayan değer rapor
     açmamalı. */
  assert.equal(raporBul("satis")?.anahtar, "satis");
  assert.equal(raporBul("yok"), null);
  assert.equal(raporBul(""), null);
  assert.equal(raporBul(undefined), null);
  assert.equal(raporBul("__proto__"), null);
});

test("yalnızca yetkisi olan raporlar listeleniyor", () => {
  const gorulen = gorulebilenRaporlar((a) => a === "rapor.operasyon");
  assert.deepEqual(gorulen.map((r) => r.anahtar), ["operasyon"]);
});

test("GEÇİŞTE İLGİLİ FİLTRELER TAŞINIYOR", () => {
  const adres = raporAdresi(TABAN, "personel", { aralik: "bu_ay", personel: "e1", sayfa: "3" });
  assert.match(adres, /rapor=personel/);
  assert.match(adres, /aralik=bu_ay/, "dönem her raporda anlamlı");
  assert.match(adres, /personel=e1/, "personel filtresi taşınmalı");
  assert.doesNotMatch(adres, /sayfa=/, "sayfalama taşınmamalı: başka raporun sayfası");
});

test("ek filtre eklenebiliyor, boş değer siliniyor", () => {
  const adres = raporAdresi(TABAN, "tahsilat", { aralik: "bu_ay" }, { durum: "geciken" });
  assert.match(adres, /durum=geciken/);
  const temiz = raporAdresi(TABAN, "tahsilat", { aralik: "bu_ay", personel: "e1" }, { personel: undefined });
  assert.doesNotMatch(temiz, /personel=/);
});

test("KAPATMA dönemi koruyor, rapora özel filtreyi atıyor", () => {
  /* Pencere kapanınca merkez aynı dönemi göstermeli; ama "geciken
     alacak" süzgeci merkezde anlamsız. */
  const adres = kapatmaAdresi(TABAN, { rapor: "tahsilat", aralik: "bu_yil", durum: "geciken", personel: "e1" });
  assert.match(adres, /aralik=bu_yil/);
  assert.doesNotMatch(adres, /rapor=/);
  assert.doesNotMatch(adres, /durum=/);
  assert.doesNotMatch(adres, /personel=/);
});

test("kapatmada hiç parametre kalmazsa soru işareti yok", () => {
  assert.equal(kapatmaAdresi(TABAN, { rapor: "satis" }), TABAN);
});

test("URLSearchParams ile de çalışıyor", () => {
  /* Sunucu bileşeni searchParams'ı nesne, istemci URLSearchParams
     veriyor; ikisi de aynı sonucu üretmeli. */
  const p = new URLSearchParams({ aralik: "bu_ay", personel: "e1" });
  assert.equal(
    raporAdresi(TABAN, "satis", p),
    raporAdresi(TABAN, "satis", { aralik: "bu_ay", personel: "e1" }),
  );
});
