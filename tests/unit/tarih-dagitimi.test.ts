import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { tarihleriDagit } from "../../lib/tarih-dagitimi";

/*
  Dağıtımın kanıtlaması gereken şey "tarih üretti" değil: ÜRETMEMESİ
  gereken yerde üretmemesi. Uydurulmuş bir teslim tarihi, boş bir tarihten
  daha zararlı — pano onu gerçek sanıp gecikme uyarısı verir.
*/

const adim = (sira: number, due_date: string | null = null, is_completed = false) =>
  ({ id: `s${sira}`, sort_order: sira * 10, due_date, is_completed });

const tarihleri = (sonuc: ReturnType<typeof tarihleriDagit>) => sonuc.atamalar.map((a) => a.tarih);

describe("aşama tarihlerini dağıtma", () => {
  test("başlangıç ile termin arasına eşit dağıtılıyor, SON aşama tam terminde", () => {
    /*
      Son aşama terminde bitmeli: iş, son aşaması bittiğinde teslim
      ediliyor. Aralığı n+1'e bölseydik son aşama hep terminden önce
      biterdi ve teslim günü boş kalırdı.
    */
    const sonuc = tarihleriDagit(
      [adim(1), adim(2), adim(3), adim(4)],
      { baslangic: "2026-10-01", termin: "2026-10-09" },
    );
    assert.deepEqual(tarihleri(sonuc), ["2026-10-03", "2026-10-05", "2026-10-07", "2026-10-09"]);
    assert.equal(sonuc.atlanan, 0);
  });

  test("ELLE GİRİLEN tarih çapa: ezilmiyor, boşluklar ona göre bölünüyor", () => {
    // "Üçüncü aşamaya 20 Ekim dedim, gerisini sen dağıt" — doğal kullanım.
    const sonuc = tarihleriDagit(
      [adim(1), adim(2), adim(3, "2026-10-20"), adim(4), adim(5)],
      { baslangic: "2026-10-01", termin: "2026-10-30" },
    );
    assert.deepEqual(
      sonuc.atamalar,
      [
        // 1 Eki → 20 Eki arası 19 gün, iki hedef, gerçek çapa: üçe bölünüyor
        { id: "s1", tarih: "2026-10-07" },
        { id: "s2", tarih: "2026-10-14" },
        // 20 Eki → 30 Eki arası 10 gün, iki hedef, sanal termin: ikiye bölünüyor
        { id: "s4", tarih: "2026-10-25" },
        { id: "s5", tarih: "2026-10-30" },
      ],
    );
    assert.equal(sonuc.atamalar.some((a) => a.id === "s3"), false, "çapaya dokunulmamalı");
  });

  test("TAMAMLANMIŞ tarihsiz aşamaya ileri tarih yazılmıyor", () => {
    /*
      Bitmiş bir işe gelecek tarih yazmak "bu aşama gelecekte teslim
      edilecek" demek; takvimde biten iş yeniden belirirdi. Boşluk
      sayımına da girmiyor, yani diğerlerinin dağılımını kaydırmıyor.
    */
    const sonuc = tarihleriDagit(
      [adim(1, null, true), adim(2), adim(3)],
      { baslangic: "2026-10-01", termin: "2026-10-05" },
    );
    assert.deepEqual(sonuc.atamalar, [
      { id: "s2", tarih: "2026-10-03" },
      { id: "s3", tarih: "2026-10-05" },
    ]);
    assert.equal(sonuc.atlanan, 0, "tamamlanmış aşama atlanmış sayılmıyor");
  });

  test("TERMİN yoksa son boşluk dağıtılmıyor", () => {
    // Uydurulmuş bir bitiş tarihi, boş bir tarihten zararlı.
    const sonuc = tarihleriDagit([adim(1), adim(2)], { baslangic: "2026-10-01", termin: null });
    assert.deepEqual(sonuc.atamalar, []);
    assert.equal(sonuc.atlanan, 2, "ekran kaç aşamanın tarihsiz kaldığını yazıyor");
  });

  test("BAŞLANGIÇ yoksa ilk boşluk dağıtılmıyor ama sonrası dağıtılıyor", () => {
    const sonuc = tarihleriDagit(
      [adim(1), adim(2, "2026-10-10"), adim(3)],
      { baslangic: null, termin: "2026-10-20" },
    );
    assert.deepEqual(sonuc.atamalar, [{ id: "s3", tarih: "2026-10-20" }]);
    assert.equal(sonuc.atlanan, 1, "s1'in öncesinde çapa yok");
  });

  test("hiçbir sınır yoksa hiç tarih üretilmiyor", () => {
    const sonuc = tarihleriDagit([adim(1), adim(2)], { baslangic: null, termin: null });
    assert.deepEqual(sonuc.atamalar, []);
    assert.equal(sonuc.atlanan, 2);
  });

  test("ÇELİŞEN çapalar arası dağıtılmıyor", () => {
    /*
      Elle girilmiş iki tarih ters sıradaysa (5. aşama 1 Ekim, 3. aşama
      20 Ekim) aradaki aşamaya tarih uydurmak yanlışı büyütür; o boşluk
      olduğu gibi bırakılıp sayılıyor.
    */
    const sonuc = tarihleriDagit(
      [adim(1, "2026-10-20"), adim(2), adim(3, "2026-10-01")],
      { baslangic: null, termin: null },
    );
    assert.deepEqual(sonuc.atamalar, []);
    assert.equal(sonuc.atlanan, 1);
  });

  test("aralık aşamadan kısaysa aynı güne düşüyorlar", () => {
    // 2 günlük aralığa 4 aşama: sıkıştırmak yerine aynı gün dürüst.
    const sonuc = tarihleriDagit(
      [adim(1), adim(2), adim(3), adim(4)],
      { baslangic: "2026-10-01", termin: "2026-10-03" },
    );
    assert.deepEqual(tarihleri(sonuc), ["2026-10-02", "2026-10-02", "2026-10-03", "2026-10-03"]);
  });

  test("tarihi olan aşama yoksa ve hepsi bitmişse bir şey yapılmıyor", () => {
    const sonuc = tarihleriDagit(
      [adim(1, null, true), adim(2, null, true)],
      { baslangic: "2026-10-01", termin: "2026-10-09" },
    );
    assert.deepEqual(sonuc, { atamalar: [], atlanan: 0 });
  });

  test("sort_order'a göre sıralanıyor, dizideki sıraya göre değil", () => {
    // Sorgudan gelen dizi sırası garanti değil; kayan bir plan üretirdi.
    const sonuc = tarihleriDagit(
      [adim(3), adim(1), adim(2)],
      { baslangic: "2026-10-01", termin: "2026-10-04" },
    );
    assert.deepEqual(sonuc.atamalar, [
      { id: "s1", tarih: "2026-10-02" },
      { id: "s2", tarih: "2026-10-03" },
      { id: "s3", tarih: "2026-10-04" },
    ]);
  });

  test("tek aşama: doğrudan termine konuyor", () => {
    const sonuc = tarihleriDagit([adim(1)], { baslangic: "2026-10-01", termin: "2026-10-09" });
    assert.deepEqual(sonuc.atamalar, [{ id: "s1", tarih: "2026-10-09" }]);
  });
});
