/*
  DOÇENTLİK GÖZETİM OKUMALARI 1000 SATIRI AŞINCA (F6 PR6b son kabul).

  PostgREST burada yok; onun yaptığı tam olarak şu: işlevin sonucuna
  süzgeç (owner_id = …), sıralama, LIMIT/OFFSET ve count: "exact" için
  toplam. Taklit okuyucu bunu GERÇEK işlev üzerinde (PGlite, gerçek RLS ve
  security definer kapısı) yapıyor ve uygulamanın kullandığı aynı
  yardımcıdan (lib/docentlik-sayfalama → hepsiniOku) geçiyor; satır tavanı
  1000, sıralama app/panel/docentlik/veri.ts'teki anahtarlarla aynı.

  Eskiden kisiOzeti dönemleri tek çağrıyla okuyordu: 1500 faaliyetli bir
  kurumda ilk 1000 dışındakiler "bilinmiyor" dönemine düşüyordu. Burada
  hem o kayıp yeniden üretiliyor hem de yeni okumanın eksiksiz olduğu,
  doktora TARİHİNİN hiçbir satırda dönmediği, kurum ve yetki sınırının
  aynı kaldığı sınanıyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";
import { AM, K, aktorOl, tohumla } from "./docentlik-ortak.mjs";

await import("../register.mjs");
const { hepsiniOku } = await import("../../lib/docentlik-sayfalama.ts");

let db;
const TAVAN = 1000;
const FAALIYET = 1500;
const KISI = 1100;

before(async () => {
  db = await veritabani();
  await tohumla(db);
  await rol(db, "postgres");
  // Sahibe 1500 faaliyet (hepsi doktora sonrası), kuruma profili olan 1100 sentetik kişi.
  await db.exec(`
    insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title, unit_count, yazar_sayisi, baslica_yazar, faaliyet_tarihi)
    select '${AM}', '${K.sahip}', '00000000-0000-4000-8000-00000000d101', 'Sentetik ' || g, 1, 1, true, date '2023-01-01' + g
    from generate_series(1, ${FAALIYET - 1}) g;
    insert into auth.users (id, email)
    select ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, 'k' || g || '@sentetik.test' from generate_series(1, ${KISI}) g;
    insert into public.docentlik_profilleri (organization_id, owner_id, doktora_tarihi, temel_alan)
    select '${AM}', ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, case when g % 2 = 0 then date '2019-01-01' end, 'Alan ' || (g % 7)
    from generate_series(1, ${KISI}) g;
  `);
});

/** PostgREST taklidi: süzgeç + sıralama + aralık (satır tavanıyla) + count: "exact". */
function postgrest(islev, { sahip = null, sira }) {
  return async (bas, son) => {
    const kosul = sahip ? "where owner_id = $2" : "";
    const params = sahip ? [AM, sahip] : [AM];
    const toplam = (await db.query(`select count(*)::int n from public.${islev}($1) ${kosul}`, params)).rows[0].n;
    const adet = Math.min(son - bas + 1, TAVAN);
    const satirlar = (await db.query(`select * from public.${islev}($1) ${kosul} order by ${sira} limit ${adet} offset ${bas}`, params)).rows;
    return { data: satirlar, error: null, count: toplam };
  };
}
const secenek = (ad, anahtar) => ({ ad, anahtar, hataVarsa: (e) => { if (e) throw e; } });

describe("kişi özeti: dönemler kişiye süzülü ve eksiksiz", () => {
  test("ESKİ YOL yeniden üretildi: kurumun dönemleri tek çağrıda 1000'de kesiliyor, kişinin faaliyetleri kayboluyor", () =>
    islem(db, async () => {
      await aktorOl(db, "gozetim");
      const tek = (await db.query(`select * from public.docentlik_faaliyet_donemleri($1) limit ${TAVAN}`, [AM])).rows;
      const harita = new Map(tek.map((d) => [d.faaliyet_id, d.donem]));
      const kisinin = (await db.query("select id from public.docentlik_faaliyetleri where owner_id = $1", [K.sahip])).rows;
      const bilinmiyor = kisinin.filter((f) => !harita.has(f.id)).length;
      assert.ok(bilinmiyor > 0, "tek çağrı tavanı aşmadı — senaryo hiçbir şey ölçmüyor");
    }));

  test("yeni yol: 1500 faaliyetin 1500 dönemi de geliyor, hepsi 'sonra', tekrar yok", () =>
    islem(db, async () => {
      await aktorOl(db, "gozetim");
      const donemler = await hepsiniOku(postgrest("docentlik_faaliyet_donemleri", { sahip: K.sahip, sira: "faaliyet_id" }), secenek("Dönemler", (d) => d.faaliyet_id));
      assert.equal(donemler.length, FAALIYET);
      assert.ok(donemler.every((d) => d.owner_id === K.sahip && d.donem === "sonra"));
      assert.ok(donemler.every((d) => !("doktora_tarihi" in d)), "doktora tarihi sızdı");
    }));

  test("kurum geneli (gözetim listesi): bütün faaliyetler sayılıyor", () =>
    islem(db, async () => {
      await aktorOl(db, "gozetim");
      const donemler = await hepsiniOku(postgrest("docentlik_faaliyet_donemleri", { sira: "faaliyet_id" }), secenek("Dönemler", (d) => d.faaliyet_id));
      await rol(db, "postgres");
      const gercek = (await db.query("select count(*)::int n from public.docentlik_faaliyetleri where organization_id = $1", [AM])).rows[0].n;
      assert.equal(donemler.length, gercek);
    }));
});

describe("gözetim listesi: profil özetleri 1000'i aşınca eksiksiz", () => {
  test("1101 profil (1100 sentetik + sahip) eksiksiz; satırlarda doktora tarihi yok, yalnızca 'girildi mi'", () =>
    islem(db, async () => {
      await aktorOl(db, "gozetim");
      const profiller = await hepsiniOku(postgrest("docentlik_profil_ozetleri", { sira: "owner_id" }), secenek("Profil özetleri", (p) => p.owner_id));
      assert.equal(profiller.length, KISI + 1);
      assert.deepEqual(Object.keys(profiller[0]).sort(), ["alt_alan", "doktora_tarihi_girildi", "owner_id", "temel_alan"]);
      assert.equal(profiller.filter((p) => p.doktora_tarihi_girildi).length, KISI / 2 + 1);
      assert.ok(!profiller.some((p) => Object.values(p).some((v) => /2019|2020/.test(String(v)))), "doktora tarihi sızdı");
    }));

  test("kişiye süzülü profil özeti tek satır", () =>
    islem(db, async () => {
      await aktorOl(db, "gozetim");
      const p = await hepsiniOku(postgrest("docentlik_profil_ozetleri", { sahip: K.sahip, sira: "owner_id" }), secenek("Profil özetleri", (x) => x.owner_id));
      assert.deepEqual(p, [{ owner_id: K.sahip, temel_alan: "Eğitim Bilimleri", alt_alan: null, doktora_tarihi_girildi: true }]);
    }));
});

describe("sınırlar değişmedi", () => {
  test("yetkisiz üye ve yabancı kurum sayfalı okumada da hiçbir şey almaz; sahip yalnızca kendi dönemlerini", () =>
    islem(db, async () => {
      for (const aktor of ["uye", "yabanci"]) {
        await aktorOl(db, aktor);
        assert.deepEqual(await hepsiniOku(postgrest("docentlik_profil_ozetleri", { sira: "owner_id" }), secenek("P", (x) => x.owner_id)), [], aktor);
        assert.deepEqual(await hepsiniOku(postgrest("docentlik_faaliyet_donemleri", { sira: "faaliyet_id" }), secenek("D", (x) => x.faaliyet_id)), [], aktor);
      }
      await aktorOl(db, "sahip");
      const kendi = await hepsiniOku(postgrest("docentlik_faaliyet_donemleri", { sira: "faaliyet_id" }), secenek("D", (x) => x.faaliyet_id));
      assert.equal(kendi.length, FAALIYET);
      assert.ok(kendi.every((d) => d.owner_id === K.sahip));
    }));

  test("modül kapanınca sayfalı okuma boş döner (kapı işlevde)", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = 'docentlik'", [AM]);
      await aktorOl(db, "gozetim");
      assert.deepEqual(await hepsiniOku(postgrest("docentlik_faaliyet_donemleri", { sira: "faaliyet_id" }), secenek("D", (x) => x.faaliyet_id)), []);
    }));
});
