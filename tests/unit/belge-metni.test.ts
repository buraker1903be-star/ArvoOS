import assert from "node:assert/strict";
import test from "node:test";
import {
  birimleriYaz, etkinSira, kalinAyir, kurumMetniCoz, maddeEkle, maddeyiGeriEkle, maddeyiKaldir, maddeyiKaydet, maddeyiSifirla, maddeyiTasi,
  metniCoz, metniDenetle, surumleriBirlestir, yerTutucuDoldur, type KurumMetni, type SiraKurali,
} from "../../lib/belge-metni.ts";

/*
  KURUMUN BELGE METİNLERİ (lib/belge-metni). Kayıt yalnızca kurumun
  DEĞİŞİKLİKLERİNİ tutuyor; belge = Arvo'nun metni + değişiklikler. Bu
  testler o birleşimin kurallarını sabitliyor: zorunlu madde düşmüyor,
  yürürlük sonda kalıyor, tüketici satırları tacire gitmiyor.
*/

const KURAL: SiraKurali = { varsayilan: ["parties", "scope", "payment", "privacy", "effect"], zorunlu: ["parties", "payment", "effect"], son: "effect" };
const bos: KurumMetni = { surum: 1 };

test("bozuk kayıt güvenle okunuyor", () => {
  assert.deepEqual(kurumMetniCoz(null), { surum: 1, sira: null, maddeler: {} });
  assert.deepEqual(kurumMetniCoz({ sira: ["a", 3, "a"], maddeler: { x: { baslik: "B", metin: "M" }, y: { baslik: 1 } } }), { surum: 1, sira: ["a"], maddeler: { x: { baslik: "B", metin: "M" } } });
});

test("etkin sıra: zorunlu madde geri eklenir, yürürlük sonda, tanınmayan atlanır", () => {
  assert.deepEqual(etkinSira(KURAL.varsayilan, bos, KURAL.zorunlu, KURAL.son), KURAL.varsayilan);
  // Kayıt elle bozulup ödeme maddesi silinmiş, yürürlük başa alınmış, bilinmeyen bir anahtar eklenmiş.
  const kurum = kurumMetniCoz({ sira: ["effect", "scope", "parties", "yok"] });
  assert.deepEqual(etkinSira(KURAL.varsayilan, kurum, KURAL.zorunlu, KURAL.son), ["scope", "parties", "payment", "effect"]);
});

test("söz dizimi: paragraf, liste, başlık, blok", () => {
  const satirlar = metniCoz("Birinci\nsatır devam.\n\n- a\n- b\n  devam\n\n## Alt\n\n[[odeme_plani]]", true);
  assert.deepEqual(satirlar, [
    { tur: "p", metin: "Birinci satır devam." },
    { tur: "liste", ogeler: ["a", "b devam"] },
    { tur: "baslik", metin: "Alt" },
    { tur: "blok", ad: "odeme_plani" },
  ]);
});

test("[tüketici] / [tacir] satırları müşteri türüne göre süzülüyor; teklifte (null) hepsi görünüyor", () => {
  const metin = "Ortak.\n\n[tüketici] Cayma hakkı.\n\n[tacir] Ticari.\n\n- ortak öğe\n- [tacir] iflas";
  assert.deepEqual(metniCoz(metin, true).map((x) => (x.tur === "p" ? x.metin : x.tur === "liste" ? x.ogeler.join("|") : "")), ["Ortak.", "Cayma hakkı.", "ortak öğe"]);
  assert.deepEqual(metniCoz(metin, false).map((x) => (x.tur === "p" ? x.metin : x.tur === "liste" ? x.ogeler.join("|") : "")), ["Ortak.", "Ticari.", "ortak öğe|iflas"]);
  assert.equal(metniCoz(metin, null).length, 4);
});

test("yer tutucu ve madde numarası dolduruluyor; bilinmeyen olduğu gibi kalıyor", () => {
  const no = (anahtar: string) => ({ payment: 7 } as Record<string, number>)[anahtar] ?? null;
  assert.equal(yerTutucuDoldur("{musteri}, {madde:payment}. madde, {bilinmeyen}, {madde:yok}", { musteri: "Ayşe" }, no), "Ayşe, 7. madde, {bilinmeyen}, {madde:yok}");
});

test("denetim: boş alan, sınır, bilinmeyen yer tutucu ve blok", () => {
  const izin = { yerTutucular: ["musteri"], bloklar: ["odeme_plani"], maddeler: ["payment"] };
  assert.deepEqual(metniDenetle("Başlık", "{musteri} {madde:payment}\n\n[[odeme_plani]]", izin), []);
  const hatalar = metniDenetle(" ", "{musteri} {tutar} {madde:yok}\n\n[[tablo]]", izin);
  assert.equal(hatalar.length, 3);
  assert.match(hatalar[1], /\{tutar\}.*\{madde:yok\}/);
  assert.match(hatalar[2], /\[\[tablo\]\]/);
  assert.match(metniDenetle("B", "x".repeat(20_001), izin)[0], /en fazla/);
});

test("Arvo maddesi ilk hâliyle kaydedilirse değişiklik silinir (Arvo güncellemesi kuruma gelsin)", () => {
  const arvo = { baslik: "Konu", metin: "Metin." };
  const degisti = maddeyiKaydet(bos, "scope", { baslik: "Konu", metin: "Kurumun metni." }, arvo);
  assert.deepEqual(degisti.maddeler, { scope: { baslik: "Konu", metin: "Kurumun metni." } });
  assert.deepEqual(maddeyiKaydet(degisti, "scope", { baslik: "Konu ", metin: "Metin.\r\n" }, arvo).maddeler, {});
  assert.deepEqual(maddeyiSifirla(degisti, "scope").maddeler, {});
});

test("zorunlu madde çıkarılamıyor; çıkarılan Arvo maddesi kendi yerine geri ekleniyor", () => {
  assert.throws(() => maddeyiKaldir(bos, "payment", KURAL), /gerekli/);
  const kaldirildi = maddeyiKaldir(bos, "scope", KURAL);
  assert.deepEqual(kaldirildi.sira, ["parties", "payment", "privacy", "effect"]);
  // Geri eklenince sıra Arvo'nunkiyle aynı olur ve kayda yazılmaz (null).
  assert.equal(maddeyiGeriEkle(kaldirildi, "scope", KURAL).sira, null);
});

test("taşıma: yürürlük yerinde kalıyor, sınırda bir şey yapmıyor", () => {
  assert.deepEqual(maddeyiTasi(bos, "privacy", "yukari", KURAL).sira, ["parties", "scope", "privacy", "payment", "effect"]);
  assert.equal(maddeyiTasi(bos, "privacy", "asagi", KURAL), bos, "yürürlüğün altına inebildi");
  assert.equal(maddeyiTasi(bos, "effect", "yukari", KURAL), bos, "yürürlük taşınabildi");
  assert.equal(maddeyiTasi(bos, "parties", "yukari", KURAL), bos);
});

test("kurum maddesi yürürlüğün önüne ekleniyor, silinince kaydı da gidiyor", () => {
  const { kurum, anahtar } = maddeEkle(bos, { baslik: "Ek", metin: "Ek hüküm." }, KURAL, () => 0.5);
  assert.match(anahtar, /^ek-/);
  assert.deepEqual(kurum.sira, ["parties", "scope", "payment", "privacy", anahtar, "effect"]);
  assert.deepEqual(etkinSira(KURAL.varsayilan, kurum, KURAL.zorunlu, KURAL.son).at(-2), anahtar);
  const silindi = maddeyiKaldir(kurum, anahtar, KURAL);
  assert.equal(silindi.maddeler?.[anahtar], undefined);
  assert.equal(silindi.sira, null);
});

test("tüketici ve tacir sürümleri tek metinde birleşiyor", () => {
  const tuketici = [{ tur: "p" as const, metin: "Ortak." }, { tur: "p" as const, metin: "Tüketici." }, { tur: "li" as const, metin: "a" }];
  const tacir = [{ tur: "p" as const, metin: "Ortak." }, { tur: "p" as const, metin: "Tacir." }, { tur: "li" as const, metin: "a" }, { tur: "li" as const, metin: "iflas" }];
  const metin = birimleriYaz(surumleriBirlestir(tuketici, tacir));
  assert.equal(metin, "Ortak.\n\n[tacir] Tacir.\n\n[tüketici] Tüketici.\n\n- a\n- [tacir] iflas");
  // Ve geri okununca her tür kendi sürümünü alıyor.
  assert.deepEqual(metniCoz(metin, true).map((x) => (x.tur === "p" ? x.metin : x.tur === "liste" ? x.ogeler.join("|") : "")), ["Ortak.", "Tüketici.", "a"]);
  assert.deepEqual(metniCoz(metin, false).map((x) => (x.tur === "p" ? x.metin : x.tur === "liste" ? x.ogeler.join("|") : "")), ["Ortak.", "Tacir.", "a|iflas"]);
});

test("**kalın** parçalanıyor", () => {
  assert.deepEqual(kalinAyir("**Havale:** yalnızca"), [{ metin: "Havale:", kalin: true }, { metin: " yalnızca", kalin: false }]);
  assert.deepEqual(kalinAyir("düz"), [{ metin: "düz", kalin: false }]);
});
