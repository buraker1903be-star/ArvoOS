/*
  DOÇENTLİK ÇALIŞMA ALANININ GÖRÜNÜM KARARLARI (F6 PR6a) — lib/docentlik-gorunum.ts.

  Ekran kendi puanını hesaplamıyor; burada sınanan, PR5 özetinin
  (docentlikOzeti → PR #318 çekirdeği) ekrana DOĞRU taşınması: ham ile
  sayılan puanın ayrılması, hedef yokken uydurma şart üretilmemesi,
  doktora sonrası şartın "yok" ile "ölçülemedi" ayrımı, formdaki kriter
  seçenekleri ve küçük metinler. Bütün veriler yapay.
*/
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { docentlikOzeti } from "@/lib/docentlik-islem";
import {
  UAK_BILGI_NOTU, donemEtiketi, grupSatirlari, gunMetni, hedefGorunumu, kriterSecenekleri, profilEksikleri, puanMetni, yazarMetni,
  type KriterSatiri,
} from "@/lib/docentlik-gorunum";

const KURUM = "00000000-0000-4000-8000-0000000000a1";
const MAKALE = "00000000-0000-4000-8000-0000000000e1";
const PROJE = "00000000-0000-4000-8000-0000000000e2";

const kriterler = [
  { id: MAKALE, category_group: "Makaleler" },
  { id: PROJE, category_group: "Projeler" },
];
const f = (puan: number, kriter: string, donem: "sonra" | "once" | "bilinmiyor" = "sonra") =>
  ({ computed_points: String(puan), criteria_id: kriter, donem });
const ozet = (g: Partial<Parameters<typeof docentlikOzeti>[0]> = {}) => docentlikOzeti({
  faaliyetler: [], kriterler, hedefler: [], kurum: KURUM, temelAlan: null, altAlan: null, doktoraTarihiBiliniyor: true, ...g,
});

describe("profil eksikleri", () => {
  test("boş profil: temel alan ve doktora tarihi UYARI, sonucu yazılı", () => {
    const e = profilEksikleri(null);
    assert.deepEqual(e.map((x) => [x.alan, x.onem]), [["temel_alan", "uyari"], ["doktora_tarihi", "uyari"]]);
    assert.match(e[1].metin, /doktora sonrası şartlar hesaplanamıyor/);
  });
  test("alt alan yalnızca temel alan varken ve yalnızca BİLGİ", () => {
    assert.deepEqual(profilEksikleri({ temel_alan: "Hukuk", alt_alan: null, doktora_tarihi: "2020-01-01" }).map((x) => [x.alan, x.onem]), [["alt_alan", "bilgi"]]);
    assert.deepEqual(profilEksikleri({ temel_alan: null, alt_alan: null, doktora_tarihi: "2020-01-01" }).map((x) => x.alan), ["temel_alan"]);
    assert.deepEqual(profilEksikleri({ temel_alan: "Hukuk", alt_alan: "Kamu", doktora_tarihi: "2020-01-01" }), []);
  });
});

describe("ham ve sayılan puan ayrı (tavan)", () => {
  test("grup tavanı aşılınca sayılan tavanda kalır, ham ayrı; hedef SAYILANA göre ölçülür", () => {
    const o = ozet({
      faaliyetler: [f(30, MAKALE), f(25, MAKALE), f(10, PROJE)],
      hedefler: [
        { organization_id: KURUM, grup: "Makaleler", asgari_puan: null, azami_puan: 40 },
        { organization_id: KURUM, grup: null, asgari_puan: 60 },
      ],
    });
    assert.equal(o.ham, 65);
    assert.equal(o.toplam, 50, "makaleler 55 → 40 tavan + projeler 10");
    const gruplar = grupSatirlari(o.gruplar);
    assert.deepEqual(gruplar.map((g) => [g.grup, g.ham, g.sayilan, g.azami, g.tavanaTakildi, g.adet]),
      [["Makaleler", 55, 40, 40, true, 2], ["Projeler", 10, 10, null, false, 1]]);
    assert.deepEqual(gruplar.map((g) => g.oran), [100, 25], "çubuk en yüksek SAYILAN gruba göre");
    const h = hedefGorunumu(o);
    assert.equal(h.toplam[0].mevcut, 50, "ham 65 hedefi (60) tutturmuş gibi gösterilmez");
    assert.equal(h.toplam[0].eksik, 10);
    assert.equal(h.toplam[0].karsilandi, false);
  });

  test("tavana takılmayan grup: sayılan = ham, uyarı yok", () => {
    const g = grupSatirlari(ozet({ faaliyetler: [f(12, MAKALE)], hedefler: [{ organization_id: KURUM, grup: "Makaleler", asgari_puan: null, azami_puan: 40 }] }).gruplar);
    assert.deepEqual([g[0].ham, g[0].sayilan, g[0].tavanaTakildi], [12, 12, false]);
  });

  test("puan yokken grup listesi boş, çubuk sıfıra bölünmez", () => {
    assert.deepEqual(grupSatirlari(ozet().gruplar), []);
    const g = grupSatirlari(ozet({ faaliyetler: [f(0, MAKALE)] }).gruplar);
    assert.equal(g[0].oran, 0);
  });
});

describe("hedefler", () => {
  test("hedef tanımlı değilse uydurma şart yok: hedefYok, eksik 0", () => {
    const h = hedefGorunumu(ozet({ faaliyetler: [f(10, MAKALE)] }));
    assert.equal(h.hedefYok, true);
    assert.deepEqual([h.toplam, h.gruplar, h.eksikToplam], [[], [], 0]);
  });

  test("asgari / azami ayrı: yalnızca azamisi olan grup hedef satırı DEĞİL (tavan), asgari olan satır", () => {
    const h = hedefGorunumu(ozet({
      faaliyetler: [f(10, PROJE)],
      hedefler: [
        { organization_id: KURUM, grup: "Projeler", asgari_puan: 20, azami_puan: 30 },
        { organization_id: KURUM, grup: "Makaleler", asgari_puan: null, azami_puan: 40 },
      ],
    }));
    assert.deepEqual(h.gruplar.map((s) => [s.baslik, s.asgari, s.mevcut, s.eksik, s.oran]), [["Projeler", 20, 10, 10, 50]]);
  });

  test("doktora sonrası şart: tarih biliniyorsa yalnızca 'sonra' faaliyetleri sayılır", () => {
    const hedefler = [
      { organization_id: KURUM, grup: null, asgari_puan: 100 },
      { organization_id: KURUM, grup: null, asgari_puan: 50, doktora_sonrasi: true },
    ];
    const faaliyetler = [f(40, MAKALE, "sonra"), f(70, MAKALE, "once"), f(5, PROJE, "bilinmiyor")];
    const h = hedefGorunumu(ozet({ faaliyetler, hedefler }));
    assert.deepEqual(h.toplam.map((s) => [s.doktoraSonrasi, s.mevcut, s.eksik, s.karsilandi]), [[false, 115, 0, true], [true, 40, 10, false]]);
    assert.equal(h.olculemeyen, 0);
    assert.equal(h.eksikToplam, 1);
  });

  test("doktora tarihi yoksa doktora sonrası şart 'ölçülemedi' sayılır — 'yok' değil, yanlış alarm da değil", () => {
    const o = ozet({
      faaliyetler: [f(40, MAKALE, "bilinmiyor")],
      hedefler: [{ organization_id: KURUM, grup: null, asgari_puan: 50, doktora_sonrasi: true }],
      doktoraTarihiBiliniyor: false,
    });
    assert.equal(o.sonraToplam, null);
    assert.equal(o.olculemeyenHedefSayisi, 1);
    const h = hedefGorunumu(o);
    assert.deepEqual([h.toplam.length, h.hedefYok, h.olculemeyen, h.eksikToplam], [0, false, 1, 0]);
  });

  test("hedefi aşan mevcut: çubuk %100'de kesilir", () => {
    const h = hedefGorunumu(ozet({ faaliyetler: [f(300, MAKALE)], hedefler: [{ organization_id: KURUM, grup: null, asgari_puan: 100 }] }));
    assert.deepEqual([h.toplam[0].oran, h.toplam[0].karsilandi], [100, true]);
  });

  test("başka kurumun hedefi uygulanmaz (çekirdeğin kuralı ekrana aynen gelir)", () => {
    const h = hedefGorunumu(ozet({ faaliyetler: [f(10, MAKALE)], hedefler: [{ organization_id: "00000000-0000-4000-8000-0000000000ff", grup: null, asgari_puan: 100 }] }));
    assert.equal(h.hedefYok, true);
  });
});

describe("formdaki kriter seçenekleri", () => {
  const k = (id: string, d: Partial<KriterSatiri> = {}): KriterSatiri =>
    ({ id, code: id.slice(-2).toUpperCase(), label: `Kriter ${id.slice(-2)}`, category_group: "Makaleler", points_per_unit: 20, is_active: true, temel_alan: null, alt_alan: null, ...d });

  test("pasif kriter ve başka alanın kriteri listelenmez; grup ve puan etiketi", () => {
    const g = kriterSecenekleri([k("k1"), k("k2", { is_active: false }), k("k3", { temel_alan: "Hukuk" }), k("k4", { category_group: null, points_per_unit: "7.5" })],
      { temel_alan: "Eğitim Bilimleri", alt_alan: null, doktora_tarihi: null });
    assert.deepEqual(g.map((x) => [x.grup, x.secenekler.map((s) => s.id)]), [["Makaleler", ["k1"]], ["Diğer", ["k4"]]]);
    assert.equal(g[1].secenekler[0].etiket, "K4 · Kriter k4 (7,5 puan)");
  });

  test("düzenlenen kaydın kendi kriteri pasif olsa da listede kalır ve işaretlenir", () => {
    const g = kriterSecenekleri([k("k1"), k("k2", { is_active: false })], null, "k2");
    const k2 = g.flatMap((x) => x.secenekler).find((s) => s.id === "k2");
    assert.deepEqual(k2 && [k2.pasif], [true]);
  });

  test("hiç uygun kriter yoksa boş liste (form boş durumu gösterir)", () => {
    assert.deepEqual(kriterSecenekleri([k("k1", { is_active: false })], null), []);
  });
});

describe("küçük metinler", () => {
  test("dönem, yazar, puan, gün", () => {
    assert.deepEqual([donemEtiketi("sonra"), donemEtiketi("once"), donemEtiketi("bilinmiyor")], ["Doktora sonrası", "Doktora öncesi", "Dönem bilinmiyor"]);
    assert.deepEqual([yazarMetni(1, false), yazarMetni(3, true), yazarMetni(3, false)], ["Tek yazar", "3 yazar · başlıca", "3 yazar"]);
    assert.deepEqual([puanMetni(0.246913), puanMetni("12.5"), puanMetni(null), puanMetni("abc"), puanMetni(0)], ["0,25", "12,5", "—", "—", "0"]);
    assert.deepEqual([gunMetni("2024-03-01"), gunMetni(null), gunMetni("bozuk")], ["01.03.2024", "—", "—"]);
  });

  test("ÜAK notu kesin bir uygunluk hükmü vermiyor", () => {
    assert.match(UAK_BILGI_NOTU, /bilgilendirme amaçlı/);
    assert.match(UAK_BILGI_NOTU, /resmî değerlendirmesi yerine geçmez/);
    assert.doesNotMatch(UAK_BILGI_NOTU, /uygunsunuz|başvurabilirsiniz/i);
  });
});
