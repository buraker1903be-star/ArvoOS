/*
  DOÇENTLİK EKSİKSİZ OKUMA (lib/docentlik-sayfalama → hepsiniOku).

  Taklit okuyucu PostgREST gibi davranıyor: satırları verilen anahtara göre
  sıralıyor, aralığı (range) uyguluyor, sunucunun satır tavanını (max-rows)
  aşan kısmı KESİYOR ve count: "exact" ile toplamı döndürüyor. Eskiden
  kisiOzeti dönemleri tek çağrıyla okuyordu (1000'den sonrası kayboluyordu)
  ve döngüler "kısa sayfa = son sayfa" varsayıyordu (küçük max-rows'ta ilk
  sayfada duruyordu); ikisi de burada yeniden üretilip sabitleniyor.
*/
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { EksikOkumaHatasi, hepsiniOku, type SayfaOkuyucu } from "@/lib/docentlik-sayfalama";

type Satir = { id: string; owner_id: string };
const satirlar = (n: number, sahip = "a"): Satir[] => Array.from({ length: n }, (_, i) => ({ id: `f-${String(i).padStart(6, "0")}`, owner_id: sahip }));

function postgrest(veri: Satir[], { tavan = 1000, sira = (s: Satir) => s.id, cagri = { n: 0 } } = {}): SayfaOkuyucu<Satir> {
  return async (bas, son) => {
    cagri.n++;
    const sirali = [...veri].sort((x, y) => (sira(x) < sira(y) ? -1 : sira(x) > sira(y) ? 1 : 0));
    const istenen = sirali.slice(bas, son + 1);
    return { data: istenen.slice(0, tavan), error: null, count: veri.length };
  };
}
const secenek = { ad: "Faaliyetler", anahtar: (s: Satir) => s.id, hataVarsa: (e: unknown) => { if (e) throw new Error("okunamadı"); } };

describe("hepsiniOku — tam okuma", () => {
  test("1000'den fazla kayıt (2500) eksiksiz ve sıralı geliyor", async () => {
    const cagri = { n: 0 };
    const sonuc = await hepsiniOku(postgrest(satirlar(2500), { cagri }), secenek);
    assert.equal(sonuc.length, 2500);
    assert.equal(new Set(sonuc.map((s) => s.id)).size, 2500);
    assert.equal(cagri.n, 3);
  });

  test("tam sayfa sınırı (1000 ve 2000): fazladan, aralık dışı istek atılmıyor", async () => {
    for (const n of [1000, 2000]) {
      const cagri = { n: 0 };
      const sonuc = await hepsiniOku(postgrest(satirlar(n), { cagri }), secenek);
      assert.equal(sonuc.length, n);
      assert.equal(cagri.n, n / 1000, `${n}: PostgREST aralık dışına 416 döndürür`);
    }
  });

  test("1001 kayıt: son sayfadaki tek satır kaybolmuyor", async () => {
    const sonuc = await hepsiniOku(postgrest(satirlar(1001)), secenek);
    assert.equal(sonuc.at(-1)?.id, "f-001000");
  });

  test("sunucu tavanı sayfa boyundan KÜÇÜK (max-rows 300): kısa sayfa son sayfa sayılmıyor", async () => {
    const cagri = { n: 0 };
    const sonuc = await hepsiniOku(postgrest(satirlar(1250), { tavan: 300, cagri }), secenek);
    assert.equal(sonuc.length, 1250);
    assert.equal(cagri.n, 5);
  });

  test("boş sonuç: tek çağrı, boş liste", async () => {
    const cagri = { n: 0 };
    assert.deepEqual(await hepsiniOku(postgrest([], { cagri }), secenek), []);
    assert.equal(cagri.n, 1);
  });

  test("ESKİ DAVRANIŞ yeniden üretildi: tek çağrı 1000'de kesiliyor, hepsiniOku kesmiyor", async () => {
    const oku = postgrest(satirlar(1700));
    const tek = await oku(0, Number.MAX_SAFE_INTEGER);
    assert.equal(tek.data?.length, 1000, "tek çağrı tavanda kesilir");
    assert.equal((await hepsiniOku(oku, secenek)).length, 1700);
  });
});

describe("hepsiniOku — eksiksizlik denetimi", () => {
  test("benzersiz OLMAYAN sıralama anahtarı (aynı değerler): aynı kayıt iki kez gelirse fırlatır", async () => {
    // Herkesin sıralama değeri aynı; her sayfa isteğinde sıra değişiyor (Postgres eşitlikte sıra garanti etmez).
    const veri = satirlar(1500);
    let tur = 0;
    const kararsiz: SayfaOkuyucu<Satir> = async (bas, son) => {
      tur++;
      const karisik = tur % 2 ? veri : [...veri].reverse();
      return { data: karisik.slice(bas, Math.min(son + 1, bas + 1000)), error: null, count: veri.length };
    };
    await assert.rejects(hepsiniOku(kararsiz, secenek), EksikOkumaHatasi);
  });

  test("benzersiz anahtar + aynı sahip değerleri: owner_id tekrarlansa da kayıp/tekrar yok", async () => {
    const veri = [...satirlar(800, "a"), ...satirlar(800, "b").map((s) => ({ ...s, id: s.id.replace("f-", "g-") }))];
    const sonuc = await hepsiniOku(postgrest(veri), secenek);
    assert.equal(sonuc.length, 1600);
    assert.equal(sonuc.filter((s) => s.owner_id === "b").length, 800);
  });

  test("toplam okuma sırasında değişirse fırlatır (eksik listeyle hesap yapılmaz)", async () => {
    let n = 1500;
    const degisen: SayfaOkuyucu<Satir> = async (bas, son) => {
      const veri = satirlar(n);
      n += 1; // her istekte yeni kayıt
      return { data: veri.slice(bas, Math.min(son + 1, bas + 1000)), error: null, count: veri.length };
    };
    await assert.rejects(hepsiniOku(degisen, secenek), /okunurken değişti/);
  });

  test("toplam varken sayfa boş dönerse fırlatır", async () => {
    const eksik: SayfaOkuyucu<Satir> = async (bas) => ({ data: bas === 0 ? satirlar(1000) : [], error: null, count: 1500 });
    await assert.rejects(hepsiniOku(eksik, secenek), /1000\/1500/);
  });

  test("toplam alınamazsa (count yok) fırlatır: eksiksizlik doğrulanamıyor", async () => {
    const sayimsiz: SayfaOkuyucu<Satir> = async () => ({ data: satirlar(10), error: null, count: null });
    await assert.rejects(hepsiniOku(sayimsiz, secenek), /toplam kayıt sayısı alınamadı/);
  });

  test("Supabase hatası panelin hata işleviyle fırlatılıyor", async () => {
    const hatali: SayfaOkuyucu<Satir> = async () => ({ data: null, error: { message: "permission denied" }, count: null });
    await assert.rejects(hepsiniOku(hatali, secenek), /okunamadı/);
  });

  test("üst sınır: sonsuz döngü yerine anlaşılır hata", async () => {
    await assert.rejects(hepsiniOku(postgrest(satirlar(50)), { ...secenek, azami: 10 }), /üst sınırı aşıyor/);
  });
});
