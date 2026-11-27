/*
  PUAN TETİKLEYİCİSİ ↔ PUAN ÇEKİRDEĞİ EŞDEĞERLİĞİ (F6 PR3).

  Puan artık veritabanında hesaplanıyor (K1: istemci yazamasın diye), ama
  kural lib/docentlik/puan.ts'te ve ArvoLab'la eşdeğerliği PR #318'de
  orada kanıtlandı. İki kopya sapmasın diye burada tetikleyicinin her
  sonucu çekirdeğin kendisine karşı sınanıyor: aynı girdiden birebir aynı
  sayı (Object.is), ekleme ve düzenlemede.

  Çekirdek TypeScript; Node 22 türleri sıyırıyor, çözümleme kancası birim
  testleriyle aynı (tests/register.mjs). Senaryolar tohumlu sözde rastgele:
  her koşu aynı diziyi üretir.

  Bilinen ve BİLEREK farklı tek nokta: hesabın girdileri değişmeyen
  güncelleme (başlık, belge) puana dokunmuyor; çekirdeğin
  duzenlemePuani'si ise her çağrıda yeniden hesaplıyor. O yol burada
  sınanmıyor, docentlik-guvenlik'te ayrı bir senaryo var.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { rol, veritabani } from "./ortam.mjs";
import { AM, K, tohumla } from "./docentlik-ortak.mjs";

await import("../register.mjs");
const cekirdek = await import("../../lib/docentlik/puan.ts");

let db;

function rastgele(tohum) {
  let s = tohum >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { r, tam: (a, b) => a + Math.floor(r() * (b - a + 1)), sec: (l) => l[Math.floor(r() * l.length)] };
}

const PUANLAR = [0, 0.1, 0.5, 1, 2.5, 7, 12.5, 20, 30, 33.3, 0.05, 99.99];
const KATSAYILAR = [null, 0.25, 0.5, 0.8, 1, 0.333333, 0.1];
const BIRIMLER = ["1", "2", "3", "0.5", "0.1", "0.3", "2.5", "3.25", "7", "10", "0.333333", "12.75"];
const kriterler = [];

before(async () => {
  db = await veritabani();
  await tohumla(db);
  await rol(db, "postgres");
  const z = rastgele(31415);
  for (let i = 0; i < 60; i++) {
    const k = {
      id: `00000000-0000-4000-8000-${String(900000000000 + i)}`,
      points_per_unit: z.sec(PUANLAR),
      baslica_yazar_katsayisi: z.sec(KATSAYILAR),
      diger_yazar_katsayisi: z.sec(KATSAYILAR),
      esit_bolusum: z.r() < 0.3,
    };
    kriterler.push(k);
    await db.query(
      `insert into public.docentlik_kriterleri (id, organization_id, code, label, points_per_unit, baslica_yazar_katsayisi, diger_yazar_katsayisi, esit_bolusum)
       values ($1, $2, $3, 'Eşdeğerlik', $4, $5, $6, $7)`,
      [k.id, AM, `E${i}`, k.points_per_unit, k.baslica_yazar_katsayisi, k.diger_yazar_katsayisi, k.esit_bolusum]);
  }
});

const satir = async (id) =>
  (await db.query(
    `select criteria_id, unit_count::text u, computed_points::text p, paylasim_katsayisi::text k, yazar_sayisi, baslica_yazar
       from public.docentlik_faaliyetleri where id = $1`, [id])).rows[0];

describe("Puan tetikleyicisi lib/docentlik çekirdeğiyle birebir", () => {
  test("ekleme ve ardışık düzenlemeler", async (t) => {
    const z = rastgele(271828);
    let senaryo = 0;
    const farklar = [];
    for (let i = 0; i < 1500; i++) {
      const kriter = z.sec(kriterler);
      const girdi = { birimSayisi: z.sec(BIRIMLER), yazarSayisi: String(z.tam(1, 10)), baslicaYazar: z.sec(["evet", "hayir"]) };
      const beklenen = cekirdek.faaliyetPuani(girdi, kriter);
      assert.ok(beklenen.ok);
      const { id } = (await db.query(
        `insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title, unit_count, yazar_sayisi, baslica_yazar)
         values ($1, $2, $3, 'x', $4, $5, $6) returning id`,
        [AM, K.sahip, kriter.id, girdi.birimSayisi, Number(girdi.yazarSayisi), girdi.baslicaYazar === "evet"])).rows[0];
      let kayit = await satir(id);
      senaryo++;
      if (!Object.is(Number(kayit.p), beklenen.deger.puan) || !Object.is(Number(kayit.k), beklenen.deger.paylasimKatsayisi)) {
        farklar.push({ tur: "ekleme", girdi, kriter, veritabani: kayit, cekirdek: beklenen.deger });
      }

      // Aynı kayıt üç kez düzenleniyor: korunan birim puan ve katsayı zincir boyunca birikmeli mi, birebir aynı mı?
      for (let d = 0; d < 3; d++) {
        const yeniKriter = z.r() < 0.3 ? z.sec(kriterler) : kriterler.find((k) => k.id === kayit.criteria_id);
        const yeni = { birimSayisi: z.sec(BIRIMLER), yazarSayisi: String(z.r() < 0.5 ? kayit.yazar_sayisi : z.tam(1, 10)), baslicaYazar: z.sec(["evet", "hayir"]) };
        const mevcut = {
          criteria_id: kayit.criteria_id,
          unit_count: Number(kayit.u),
          computed_points: Number(kayit.p),
          paylasim_katsayisi: Number(kayit.k),
          yazar_sayisi: kayit.yazar_sayisi,
          baslica_yazar: kayit.baslica_yazar,
        };
        const ayrinti = { yazar: Number(yeni.yazarSayisi), baslica: Number(yeni.yazarSayisi) === 1 || yeni.baslicaYazar === "evet" };
        const girdiAyni = Number(yeni.birimSayisi) === mevcut.unit_count && yeniKriter.id === mevcut.criteria_id
          && ayrinti.yazar === mevcut.yazar_sayisi && ayrinti.baslica === mevcut.baslica_yazar;
        if (girdiAyni) continue; // bilerek farklı yol, başlıkta açıklandı
        const beklenenD = cekirdek.duzenlemePuani(yeni, mevcut, yeniKriter.id, () => yeniKriter);
        assert.ok(beklenenD.ok);
        await db.query(
          "update public.docentlik_faaliyetleri set criteria_id = $2, unit_count = $3, yazar_sayisi = $4, baslica_yazar = $5 where id = $1",
          [id, yeniKriter.id, yeni.birimSayisi, ayrinti.yazar, yeni.baslicaYazar === "evet"]);
        kayit = await satir(id);
        senaryo++;
        if (!Object.is(Number(kayit.p), beklenenD.deger.puan) || !Object.is(Number(kayit.k), beklenenD.deger.paylasimKatsayisi)) {
          farklar.push({ tur: "düzenleme", yeni, mevcut, veritabani: kayit, cekirdek: beklenenD.deger });
        }
      }
    }
    t.diagnostic(`${senaryo} senaryo (ekleme + düzenleme), ${farklar.length} fark`);
    assert.ok(senaryo > 4000, `yalnızca ${senaryo} senaryo koştu`);
    assert.deepEqual(farklar.slice(0, 5), [], `${farklar.length} fark`);
  });

  test("JavaScript Math.round'un sınır değerleri veritabanında aynı yuvarlanıyor", async () => {
    await rol(db, "postgres");
    for (const x of [0.5, 1.5, 2.5, -0.5, -1.5, 0.49999999999999994, 4503599627370495.5, 1e-7, 2.4999999, 123456.5000001]) {
      const { v } = (await db.query("select private.docentlik_js_round($1::double precision) as v", [x])).rows[0];
      assert.ok(Object.is(Number(v) + 0, Math.round(x) + 0), `${x}: veritabanı ${v}, JS ${Math.round(x)}`);
    }
  });
});
