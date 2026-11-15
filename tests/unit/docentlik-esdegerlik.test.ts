/*
  DOÇENTLİK PUANI — ArvoLab ↔ ArvoOS EŞDEĞERLİK DENETİMİ (F6 PR1).

  Kabul şartı: kapsama alınan her senaryoda ArvoOS çekirdeği
  (lib/docentlik/) ArvoLab'ın verdiği sonucu BİREBİR vermeli. "Yaklaşık"
  yok: sayılar Object.is ile, nesneler deepStrictEqual ile karşılaştırılır
  (−0 ile 0 bile ayrı sayılır). Kaynak:

   - tests/unit/kaynak/arvolab/docentlik-puan.ts ve docentlik-ozeti.ts —
     ArvoLab main b62bfcf'ten bayt bayt kopya. Kopyanın değişmediği
     aşağıda git blob özetiyle denetlenir; ArvoLab'a ağ erişimi gerekmez.
   - tests/unit/kaynak/arvolab/scoring-mantigi.ts — sunucu işlemindeki
     satır içi hesap ve doğrulamanın satır aralıklı aktarımı.

  Senaryolar yapay: elle seçilmiş sınır değerleri ızgarası (geçersiz
  değerler dahil) ve tohumlu sözde rastgele üretim (her koşuda aynı dizi).
  Farklar gizlenmez: hangi fonksiyonda kaç fark çıktığı ve ilk örnekler
  test çıktısına yazılır, tek bir fark testi düşürür.
*/

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import * as kaynakPuan from "./kaynak/arvolab/docentlik-puan";
import * as kaynakOzet from "./kaynak/arvolab/docentlik-ozeti";
import * as kaynakIslem from "./kaynak/arvolab/scoring-mantigi";

import * as puan from "@/lib/docentlik/puan";
import * as ozet from "@/lib/docentlik/ozet";
import * as dogrulama from "@/lib/docentlik/dogrulama";

/* ---------------------------------------------------------------------- */
/* Kaynak kopyasının bütünlüğü                                            */
/* ---------------------------------------------------------------------- */

const KAYNAK_DIZINI = path.resolve(import.meta.dirname, "kaynak/arvolab");
/** ArvoLab main b62bfcf698e680b73810cf747cc7355020f95b72'teki git blob kimlikleri. */
const KAYNAK_BLOBLARI = {
  "docentlik-puan.ts": "e24bc7ab818734c528779abe0469fde5a3207f58",
  "docentlik-ozeti.ts": "4f758858617bf6ee59ca3cbf1b29b6bc37312a72",
};
const gitBlob = (icerik: Buffer) =>
  createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${icerik.length}\0`), icerik])).digest("hex");

describe("kaynak kopyası", () => {
  for (const [dosya, blob] of Object.entries(KAYNAK_BLOBLARI)) {
    test(`${dosya} ArvoLab b62bfcf ile bayt bayt aynı`, () => {
      assert.equal(gitBlob(fs.readFileSync(path.join(KAYNAK_DIZINI, dosya))), blob);
    });
  }
});

/* ---------------------------------------------------------------------- */
/* Karşılaştırma düzeneği                                                 */
/* ---------------------------------------------------------------------- */

type Fark = { girdi: unknown; kaynak: unknown; arvoos: unknown };
type Rapor = { ad: string; senaryo: number; farklar: Fark[] };
const raporlar: Rapor[] = [];

function ayni(a: unknown, b: unknown): boolean {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

/** Fırlatma da bir sonuçtur: iki taraf aynı biçimde fırlatmalı. */
function calistir(f: () => unknown): unknown {
  try {
    return { donus: f() };
  } catch (e) {
    return { firlatti: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

function karsilastir(ad: string, girdiler: Iterable<unknown>, kaynak: (g: never) => unknown, arvoos: (g: never) => unknown) {
  const rapor: Rapor = { ad, senaryo: 0, farklar: [] };
  for (const g of girdiler) {
    rapor.senaryo++;
    const a = calistir(() => kaynak(g as never));
    const b = calistir(() => arvoos(g as never));
    if (!ayni(a, b)) rapor.farklar.push({ girdi: g, kaynak: a, arvoos: b });
  }
  raporlar.push(rapor);
  return rapor;
}

function farkYok(r: Rapor, enAzSenaryo: number) {
  // Boş ızgara "fark yok" demez: senaryo sayısı da sınanır.
  assert.ok(r.senaryo >= enAzSenaryo, `${r.ad}: yalnızca ${r.senaryo} senaryo koştu`);
  assert.equal(
    r.farklar.length,
    0,
    `${r.ad}: ${r.farklar.length}/${r.senaryo} fark. İlk örnekler:\n${JSON.stringify(r.farklar.slice(0, 5), null, 2)}`,
  );
}

function* carpim<T extends unknown[]>(...listeler: { [K in keyof T]: readonly T[K][] }): Generator<T> {
  if (listeler.length === 0) {
    yield [] as unknown as T;
    return;
  }
  const [ilk, ...kalan] = listeler;
  for (const x of ilk) for (const r of carpim(...(kalan as never[][]))) yield [x, ...r] as unknown as T;
}

/** Tohumlu sözde rastgele (mulberry32): her koşuda aynı senaryolar. */
function rastgele(tohum: number) {
  let s = tohum >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    r,
    tam: (a: number, b: number) => a + Math.floor(r() * (b - a + 1)),
    sec: <T>(l: readonly T[]) => l[Math.floor(r() * l.length)],
  };
}

/* ---------------------------------------------------------------------- */
/* Değer ızgaraları                                                       */
/* ---------------------------------------------------------------------- */

const SAYILAR = [0, -0, 1, -1, 0.1, 0.3, 0.5, 0.8, 1 / 3, 2, 2.5, 3, 7, 10, 12.5, 20, 30, 100, 1e6, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
const KATSAYILAR = [null, undefined, 0, -0.5, 0.25, 0.5, 0.8, 1, 1.0000001, 2, Number.NaN];
const YAZAR = [Number.NaN, -1, 0, 0.5, 1, 1.5, 2, 3, 3.7, 4, 7, 10, 500, Number.POSITIVE_INFINITY];
const KRITERLER: (puan.PaylasimKurali | null)[] = [
  null,
  {},
  { esit_bolusum: true },
  { esit_bolusum: false },
  { esit_bolusum: null },
  ...KATSAYILAR.flatMap((b) => KATSAYILAR.map((d) => ({ baslica_yazar_katsayisi: b, diger_yazar_katsayisi: d }))),
  { esit_bolusum: true, baslica_yazar_katsayisi: 0.8, diger_yazar_katsayisi: 0.5 },
];
const METINLER = ["", " ", "0", "-0", "1", "1,0", "1.0", "2", "2,5", "2.5", " 3 ", "0,8", "1.500", "1,5,0", "1e3", "abc", "Infinity", "NaN", "500", "501", "0x10", "  0,25  ", "-1", "100000"];
const TARIHLER = [null, "", "2024-05-01", "2024-5-1", "01.05.2024", "2024-13-45", " 2023-12-31 ", "2024-05-01T10:00"];
const BASLICA = [null, undefined, "evet", "hayir", "", "Evet"];

/* ---------------------------------------------------------------------- */
/* Faaliyet puanı (lib/docentlik-puan.ts)                                 */
/* ---------------------------------------------------------------------- */

describe("eşdeğerlik: faaliyet puanı", () => {
  test("puanHesapla", () => {
    const r = karsilastir(
      "puanHesapla",
      carpim(SAYILAR, SAYILAR, [...SAYILAR.slice(0, 10), 1 / 7, 0.25]),
      ([a, b, c]: [number, number, number]) => kaynakPuan.puanHesapla(a, b, c),
      ([a, b, c]: [number, number, number]) => puan.puanHesapla(a, b, c),
    );
    farkYok(r, 5000);
  });

  test("paylasimKatsayisi", () => {
    const r = karsilastir(
      "paylasimKatsayisi",
      carpim(KRITERLER, YAZAR, [true, false]),
      ([k, n, b]: [puan.PaylasimKurali | null, number, boolean]) => kaynakPuan.paylasimKatsayisi(k, n, b),
      ([k, n, b]: [puan.PaylasimKurali | null, number, boolean]) => puan.paylasimKatsayisi(k, n, b),
    );
    farkYok(r, 3000);
  });

  test("paylasimTanimli", () => {
    const r = karsilastir("paylasimTanimli", KRITERLER, (k: puan.PaylasimKurali | null) => kaynakPuan.paylasimTanimli(k), (k: puan.PaylasimKurali | null) => puan.paylasimTanimli(k));
    farkYok(r, 100);
  });

  test("korunanBirimPuan", () => {
    const kayitlar = carpim(["a", "b"], SAYILAR, SAYILAR, KATSAYILAR);
    const r = karsilastir(
      "korunanBirimPuan",
      (function* () {
        for (const [id, birim, p, k] of kayitlar) yield { kayit: { criteria_id: "a", unit_count: birim, computed_points: p, paylasim_katsayisi: k }, yeni: id };
      })(),
      (g: { kayit: puan.KayitliPuan; yeni: string }) => kaynakPuan.korunanBirimPuan(g.kayit, g.yeni),
      (g: { kayit: puan.KayitliPuan; yeni: string }) => puan.korunanBirimPuan(g.kayit, g.yeni),
    );
    farkYok(r, 10000);
  });

  test("tur-tur düzenleme: birim puan kayıttan geri türetilir, artık birikmez", () => {
    // Aynı kaydı arka arkaya düzenlemek iki tarafta aynı diziyi üretmeli.
    const z = rastgele(20261114);
    const senaryolar = Array.from({ length: 2000 }, () => ({
      birimPuan: z.tam(0, 300) / 10,
      katsayi: z.sec([1, 0.8, 0.5, 1 / 3, 0.25, 1 / 7]),
      birimler: Array.from({ length: 6 }, () => z.tam(1, 400) / z.sec([1, 2, 10])),
    }));
    const zincir = (p: typeof puan | typeof kaynakPuan, s: (typeof senaryolar)[number]) => {
      let kayit = { criteria_id: "k", unit_count: s.birimler[0], computed_points: p.puanHesapla(s.birimler[0], s.birimPuan, s.katsayi), paylasim_katsayisi: s.katsayi };
      const iz = [kayit.computed_points];
      for (const birim of s.birimler.slice(1)) {
        const bp = p.korunanBirimPuan(kayit, "k");
        kayit = { ...kayit, unit_count: birim, computed_points: p.puanHesapla(birim, bp ?? Number.NaN, s.katsayi) };
        iz.push(kayit.computed_points);
      }
      return iz;
    };
    const r = karsilastir("korunan puan zinciri", senaryolar, (s: (typeof senaryolar)[number]) => zincir(kaynakPuan, s), (s: (typeof senaryolar)[number]) => zincir(puan, s));
    farkYok(r, 2000);
  });
});

/* ---------------------------------------------------------------------- */
/* Sunucu işleminin doğrulama ve hesap mantığı (app/actions/scoring.ts)   */
/* ---------------------------------------------------------------------- */

const form = (alanlar: Record<string, string | null | undefined>) => {
  const f = new FormData();
  for (const [ad, deger] of Object.entries(alanlar)) if (deger !== null && deger !== undefined) f.set(ad, deger);
  return f;
};
/** Kaynak `{ error }`/`{ hata }` döndürüyor, çekirdek `{ ok:false, hata }`: karşılaştırma için tek biçime iner. */
const kaynakSonucu = (s: object) =>
  "error" in s ? { ok: false, hata: (s as { error: string }).error } : "hata" in s ? { ok: false, hata: (s as { hata: string }).hata } : { ok: true, deger: s };

describe("eşdeğerlik: girdi doğrulama", () => {
  test("katsayı alanı", () => {
    const r = karsilastir(
      "katsayiOku",
      [null, ...METINLER],
      (m: string | null) => {
        const s = kaynakIslem.katsayiOku(m);
        return "hata" in s ? { ok: false, hata: s.hata } : { ok: true, deger: s.deger };
      },
      (m: string | null) => dogrulama.katsayiOku(m),
    );
    farkYok(r, METINLER.length);
  });

  test("yazar sayısı, başlıca yazar, tarih", () => {
    const r = karsilastir(
      "faaliyetAyrintisiOku",
      carpim<[string | null, string | null | undefined, string | null]>([null, ...METINLER], BASLICA, TARIHLER),
      ([y, b, t]: [string | null, string | null | undefined, string | null]) =>
        kaynakSonucu(kaynakIslem.faaliyetAyrintisi(form({ yazarSayisi: y, baslicaYazar: b, faaliyetTarihi: t }))),
      ([y, b, t]: [string | null, string | null | undefined, string | null]) =>
        dogrulama.faaliyetAyrintisiOku({ yazarSayisi: y, baslicaYazar: b, faaliyetTarihi: t }),
    );
    farkYok(r, 1000);
  });

  test("kriter birim puanı (ekleme ve düzenleme)", () => {
    for (const islem of ["ekleme", "duzenleme"] as const) {
      const r = karsilastir(
        `kriterPuaniOku/${islem}`,
        [null, ...METINLER],
        (m: string | null) => {
          const f = form({ pointsPerUnit: m });
          const s = islem === "ekleme" ? kaynakIslem.kriterPuaniEkleme(f) : kaynakIslem.kriterPuaniDuzenleme(f);
          return "error" in s ? { ok: false, hata: s.error } : { ok: true, deger: s.points };
        },
        (m: string | null) => dogrulama.kriterPuaniOku(m, islem),
      );
      farkYok(r, METINLER.length);
    }
  });

  test("hedef asgari/azami", () => {
    const r = karsilastir(
      "hedefPuanlariOku",
      carpim<[string | null, string | null, boolean]>([null, ...METINLER], [null, ...METINLER], [true, false]),
      ([a, z, d]: [string | null, string | null, boolean]) =>
        kaynakSonucu(kaynakIslem.hedefPuanlari(form({ asgariPuan: a, azamiPuan: z, doktoraSonrasi: d ? "1" : null }))),
      ([a, z, d]: [string | null, string | null, boolean]) => dogrulama.hedefPuanlariOku({ asgariPuan: a, azamiPuan: z, doktoraSonrasi: d }),
    );
    farkYok(r, 1000);
  });
});

describe("eşdeğerlik: faaliyet ekleme ve düzenleme hesabı", () => {
  const PUAN_KRITERLERI: puan.PuanKriteri[] = KRITERLER.filter((k): k is puan.PaylasimKurali => k !== null).flatMap((k) =>
    [0, 0.5, 7, 12.5, 20, 30].map((p) => ({ ...k, points_per_unit: p })),
  );
  // Kaynağın kayda yazdığı alanlar çekirdeğin çıktısından aynı adlarla türetilir.
  const kayitBicimi = (s: dogrulama.Sonuc<puan.FaaliyetPuani>) =>
    s.ok
      ? {
          ok: true,
          deger: {
            unit_count: s.deger.birimSayisi,
            computed_points: s.deger.puan,
            paylasim_katsayisi: s.deger.paylasimKatsayisi,
            yazar_sayisi: s.deger.yazarSayisi,
            baslica_yazar: s.deger.baslica,
            faaliyet_tarihi: s.deger.tarih,
          },
        }
      : s;

  test("ekleme", () => {
    const BIRIM = [null, "", "1", "2", "0,5", "3.25", "0", "-1", "abc", "1.500"];
    const YAZAR_M = [null, "1", "2", "3", "4", "10", "0", "2,5"];
    const r = karsilastir(
      "faaliyetPuani (ekleme)",
      carpim<[string | null, string | null, string | null, puan.PuanKriteri]>(BIRIM, YAZAR_M, ["evet", "hayir", null], PUAN_KRITERLERI),
      ([b, y, bas, k]: [string | null, string | null, string | null, puan.PuanKriteri]) =>
        kaynakSonucu(kaynakIslem.eklemeHesabi(form({ unitCount: b, yazarSayisi: y, baslicaYazar: bas }), k)),
      ([b, y, bas, k]: [string | null, string | null, string | null, puan.PuanKriteri]) =>
        kayitBicimi(puan.faaliyetPuani({ birimSayisi: b, yazarSayisi: y, baslicaYazar: bas }, k)),
    );
    farkYok(r, 50000);
  });

  test("düzenleme (kriter okuma sayısı dahil)", () => {
    const z = rastgele(1903);
    const senaryolar = Array.from({ length: 20000 }, () => {
      const kriter = z.sec(PUAN_KRITERLERI);
      const eskiBirim = z.sec([1, 2, 3, 0.5, 0, -1, Number.NaN]);
      const eskiKatsayi = z.sec([null, undefined, 1, 0.8, 0.5, 1 / 3, 0, Number.NaN]);
      const eskiYazar = z.sec([null, undefined, 1, 2, 3, 4]);
      return {
        alanlar: {
          unitCount: z.sec([null, "", "1", "2", "0,5", "4", "0", "x"]),
          yazarSayisi: z.sec([null, "1", "2", "3", "4", "0"]),
          baslicaYazar: z.sec(["evet", "hayir", null]),
          faaliyetTarihi: z.sec([null, "2024-05-01", "bozuk"]),
        },
        kriterId: z.sec(["a", "b"]),
        mevcut: {
          criteria_id: "a",
          unit_count: eskiBirim,
          computed_points: z.sec([0, 10, 16, 24, 7.5, 33.333333, Number.NaN]),
          paylasim_katsayisi: eskiKatsayi,
          yazar_sayisi: eskiYazar,
          baslica_yazar: z.sec([null, undefined, true, false]),
        },
        kriter,
      };
    });
    type S = (typeof senaryolar)[number];
    const r = karsilastir(
      "duzenlemePuani",
      senaryolar,
      (s: S) => {
        let okuma = 0;
        const sonuc = kaynakSonucu(kaynakIslem.duzenlemeHesabi(form(s.alanlar), s.kriterId, s.mevcut, () => (okuma++, s.kriter)));
        return { sonuc, okuma };
      },
      (s: S) => {
        let okuma = 0;
        const sonuc = kayitBicimi(
          puan.duzenlemePuani(
            { birimSayisi: s.alanlar.unitCount, yazarSayisi: s.alanlar.yazarSayisi, baslicaYazar: s.alanlar.baslicaYazar, faaliyetTarihi: s.alanlar.faaliyetTarihi },
            s.mevcut,
            s.kriterId,
            () => (okuma++, s.kriter),
          ),
        );
        return { sonuc, okuma };
      },
    );
    farkYok(r, 20000);
  });
});

/* ---------------------------------------------------------------------- */
/* Özet, hedef, tavan, dönem (lib/docentlik-ozeti.ts)                     */
/* ---------------------------------------------------------------------- */

const GRUP_ADLARI = [null, "", " ", "Makale", "Makaleler", " Makale ", "Atıf", "Atıflar", "Şiir", "Sergi", "Çeviri", "İlahiyat", "ışık", "Diğer"];
const KURUMLAR = [null, "k1", "k2"];
const ALANLAR = [null, "", "Hukuk", "Güzel Sanatlar", "Sağlık Bilimleri"];
const ALT_ALANLAR = [null, "", "Müzik · Kompozisyon", "Müzik · Yorumculuk", "Plastik"];

function kayitlarUret(z: ReturnType<typeof rastgele>) {
  return Array.from({ length: z.tam(0, 25) }, (_, i) => ({
    id: i,
    computed_points: z.sec([0, 0.1, 0.2, 1, 2.5, 5, 7.333333, 10, 12.5, 20, 30, 1 / 3, Number.NaN, z.tam(0, 2000) / 100]),
    criteria: z.r() < 0.08 ? null : { category_group: z.sec(GRUP_ADLARI) },
  }));
}

function hedeflerUret(z: ReturnType<typeof rastgele>): kaynakOzet.Hedef[] {
  return Array.from({ length: z.tam(0, 12) }, () => ({
    organization_id: z.sec(KURUMLAR),
    temel_alan: z.sec(ALANLAR),
    alt_alan: z.sec(ALT_ALANLAR),
    grup: z.sec(GRUP_ADLARI),
    asgari_puan: z.sec([null, 0, 5, 10, 40, 90, 100, 120, -5]),
    azami_puan: z.sec([null, undefined, 5, 10, 30]),
    doktora_sonrasi: z.sec([null, undefined, true, false]),
  }));
}

describe("eşdeğerlik: özet, hedef, tavan, dönem", () => {
  const z = rastgele(271026);
  const SENARYO = 4000;
  const senaryolar = Array.from({ length: SENARYO }, () => ({
    tum: kayitlarUret(z),
    sonra: z.r() < 0.3 ? null : kayitlarUret(z),
    hedefler: hedeflerUret(z),
    kurum: z.sec(KURUMLAR),
    alan: z.sec(ALANLAR),
    alt: z.sec(ALT_ALANLAR),
  }));
  type S = (typeof senaryolar)[number];

  test("puanGruplari", () => {
    farkYok(karsilastir("puanGruplari", senaryolar, (s: S) => kaynakOzet.puanGruplari(s.tum), (s: S) => ozet.puanGruplari(s.tum)), SENARYO);
  });

  test("etkinHedefler", () => {
    farkYok(
      karsilastir(
        "etkinHedefler",
        senaryolar,
        (s: S) => kaynakOzet.etkinHedefler(s.hedefler, s.kurum, s.alan, s.alt),
        (s: S) => ozet.etkinHedefler(s.hedefler, s.kurum, s.alan, s.alt),
      ),
      SENARYO,
    );
  });

  test("tavanUygula + hedefDurumlari (uçtan uca hesap zinciri)", () => {
    const zincir = (o: typeof ozet | typeof kaynakOzet, s: S) => {
      const etkin = o.etkinHedefler(s.hedefler, s.kurum, s.alan, s.alt);
      const tum = o.tavanUygula(o.puanGruplari(s.tum), etkin);
      const sonra = s.sonra ? o.tavanUygula(o.puanGruplari(s.sonra), etkin) : null;
      return { etkin, tum, sonra, durum: o.hedefDurumlari(etkin, tum, sonra) };
    };
    farkYok(karsilastir("uçtan uca zincir", senaryolar, (s: S) => zincir(kaynakOzet, s), (s: S) => zincir(ozet, s)), SENARYO);
  });

  test("tavanUygula ve hedefDurumlari süzülmemiş hedeflerle de aynı", () => {
    farkYok(
      karsilastir(
        "tavanUygula/hedefDurumlari (ham)",
        senaryolar,
        (s: S) => {
          const t = kaynakOzet.tavanUygula(kaynakOzet.puanGruplari(s.tum), s.hedefler);
          return [t, kaynakOzet.hedefDurumlari(s.hedefler, t, s.sonra ? kaynakOzet.puanGruplari(s.sonra) : null)];
        },
        (s: S) => {
          const t = ozet.tavanUygula(ozet.puanGruplari(s.tum), s.hedefler);
          return [t, ozet.hedefDurumlari(s.hedefler, t, s.sonra ? ozet.puanGruplari(s.sonra) : null)];
        },
      ),
      SENARYO,
    );
  });

  test("kriterGruplari", () => {
    const zk = rastgele(42);
    const listeler = Array.from({ length: 2000 }, () =>
      Array.from({ length: zk.tam(0, 15) }, () => ({ code: zk.sec(["A1", "A2", "A10", "a2", "B1", "B01", "X", "Ç1", "1", "10", "2"]), category_group: zk.sec(GRUP_ADLARI) })),
    );
    // Kaynak listeyi yerinde sıralıyor; iki tarafa ayrı kopya verilir ki biri ötekini etkilemesin.
    farkYok(
      karsilastir("kriterGruplari", listeler, (l: { code: string; category_group: string | null }[]) => kaynakOzet.kriterGruplari(structuredClone(l)), (l: { code: string; category_group: string | null }[]) => ozet.kriterGruplari(structuredClone(l))),
      2000,
    );
  });

  test("faaliyetDonemi", () => {
    farkYok(
      karsilastir(
        "faaliyetDonemi",
        carpim<[string | null | undefined, string | null | undefined]>([...TARIHLER, undefined, "2024-05-02", "2019-01-01"], [...TARIHLER, undefined, "2024-05-02"]),
        ([f, d]: [string | null | undefined, string | null | undefined]) => kaynakOzet.faaliyetDonemi(f, d),
        ([f, d]: [string | null | undefined, string | null | undefined]) => ozet.faaliyetDonemi(f, d),
      ),
      100,
    );
  });

  test("kriterUygun", () => {
    farkYok(
      karsilastir(
        "kriterUygun",
        carpim<[string | null, string | null, string | null, string | null]>(ALANLAR, ALT_ALANLAR, ALANLAR, ALT_ALANLAR),
        ([ka, kalt, a, alt]: [string | null, string | null, string | null, string | null]) => kaynakOzet.kriterUygun({ temel_alan: ka, alt_alan: kalt }, a, alt),
        ([ka, kalt, a, alt]: [string | null, string | null, string | null, string | null]) => ozet.kriterUygun({ temel_alan: ka, alt_alan: kalt }, a, alt),
      ),
      600,
    );
  });

  test("puanYazisi (aynı çalışma ortamında)", () => {
    farkYok(karsilastir("puanYazisi", [...SAYILAR, 1234567.891, 0.005, 0.015], (n: number) => kaynakOzet.puanYazisi(n), (n: number) => ozet.puanYazisi(n)), SAYILAR.length);
  });

  test("sabitler", () => {
    assert.equal(ozet.GRUPSUZ, kaynakOzet.GRUPSUZ);
    assert.deepEqual(ozet.TEMEL_ALAN_ONERILERI, kaynakOzet.TEMEL_ALAN_ONERILERI);
  });
});

/* Rapor: her koşuda fonksiyon başına senaryo ve fark sayısı test çıktısına yazılır. */
describe("eşdeğerlik raporu", () => {
  test("özet", (t) => {
    const toplam = raporlar.reduce((n, r) => n + r.senaryo, 0);
    const fark = raporlar.reduce((n, r) => n + r.farklar.length, 0);
    for (const r of raporlar) t.diagnostic(`${r.ad}: ${r.senaryo} senaryo, ${r.farklar.length} fark`);
    t.diagnostic(`TOPLAM: ${raporlar.length} karşılaştırma, ${toplam} senaryo, ${fark} fark`);
    assert.equal(fark, 0);
  });
});
