import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { kimliklerle, tumSatirlar } from "../../lib/rapor-okuma";

/*
  Sayfalamanın kendisi sınanıyor; sahte bir kaynak PostgREST'in
  davranışını taklit ediyor: istenen aralık ne olursa olsun yanıt
  1.000 satırda kesilir.
*/
const kaynak = (adet: number, sayfaBoyu = 1000) => {
  const satirlar = Array.from({ length: adet }, (_, i) => ({ i }));
  const cagrilar: Array<[number, number]> = [];
  const sayfala = async (bas: number, son: number) => {
    cagrilar.push([bas, son]);
    /* PostgREST istenen aralığı verir ama en çok sayfaBoyu kadar. */
    const kesim = Math.min(son - bas + 1, sayfaBoyu);
    return { data: satirlar.slice(bas, bas + kesim), error: null };
  };
  return { sayfala, cagrilar };
};

describe("rapor okuması", () => {
  it("bin satırdan uzun tabloyu eksiksiz okur", async () => {
    const { sayfala, cagrilar } = kaynak(3090);
    const satirlar = await tumSatirlar("sözleşmeler", sayfala);
    assert.equal(satirlar.length, 3090);
    assert.equal(satirlar[0].i, 0);
    assert.equal(satirlar[3089].i, 3089);
    // 1000 + 1000 + 1000 + 90: dördüncü sayfa dolmadığı için duruyor.
    assert.equal(cagrilar.length, 4);
  });

  it("tam katta fazladan bir sayfa daha ister", async () => {
    /* 2.000 satırda ikinci sayfa TAM dolu geliyor; daha veri olup
       olmadığı ancak üçüncü istekle bilinir. */
    const { sayfala, cagrilar } = kaynak(2000);
    assert.equal((await tumSatirlar("cari", sayfala)).length, 2000);
    assert.equal(cagrilar.length, 3);
  });

  it("tek sayfada biten okumada bir kez sorar", async () => {
    const { sayfala, cagrilar } = kaynak(12);
    assert.equal((await tumSatirlar("teklifler", sayfala)).length, 12);
    assert.equal(cagrilar.length, 1);
  });

  it("boş tabloda boş dizi döner", async () => {
    const { sayfala } = kaynak(0);
    assert.deepEqual(await tumSatirlar("işler", sayfala), []);
  });

  it("hatayı yutmaz", async () => {
    await assert.rejects(
      () => tumSatirlar("cari", async () => ({ data: null, error: { message: "izin yok" } })),
      /cari okunamadı: izin yok/,
    );
  });

  it("tavana ulaşınca fırlatır — eksik toplam döndürmez", async () => {
    /* Sessizce kesmek, raporda olduğundan küçük bir toplam
       göstermekti; o yüzden hata. */
    const { sayfala } = kaynak(5000);
    await assert.rejects(
      () => tumSatirlar("sözleşmeler", sayfala, { tavan: 2000 }),
      /satır sınırına ulaşıldı/,
    );
  });

  it("tavan sayfa boyuna tam oturmasa da okumayı kesmez", async () => {
    const { sayfala } = kaynak(1500);
    assert.equal((await tumSatirlar("cari", sayfala, { tavan: 2000 })).length, 1500);
  });
});

describe("kimliklerle okuma", () => {

  it("kimlikleri parçalara bölüp hepsini okur", async () => {
    const kimlikler = Array.from({ length: 450 }, (_, i) => `k${i}`);
    const parcalar: number[] = [];
    const satirlar = await kimliklerle("talepler", kimlikler, async (parca) => {
      parcalar.push(parca.length);
      return { data: parca.map((id) => ({ id })), error: null };
    });
    assert.deepEqual(parcalar, [200, 200, 50]);
    assert.equal(satirlar.length, 450);
  });

  it("yinelenen kimliği bir kez sorar", async () => {
    /* Aynı talebe bağlı iki sözleşme aynı kimliği iki kez üretir;
       iki kez okumak satırı da iki kez getirirdi ve kırılımdaki
       sayılar şişerdi. */
    let sorulan = 0;
    await kimliklerle("talepler", ["a", "a", "b", "a"], async (parca) => {
      sorulan += parca.length;
      return { data: [], error: null };
    });
    assert.equal(sorulan, 2);
  });

  it("boş listede hiç sorgu yapmaz", async () => {
    let cagri = 0;
    const sonuc = await kimliklerle("talepler", [], async () => { cagri += 1; return { data: [], error: null }; });
    assert.equal(cagri, 0);
    assert.deepEqual(sonuc, []);
  });

  it("hatayı yutmaz", async () => {
    await assert.rejects(
      () => kimliklerle("talepler", ["a"], async () => ({ data: null, error: { message: "izin yok" } })),
      /talepler okunamadı: izin yok/,
    );
  });
});
