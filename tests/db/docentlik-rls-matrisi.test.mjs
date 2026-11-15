/*
  DOÇENTLİK RLS MATRİSİ (F6 PR3, 20261114200939): 5 tablo × 8 aktör × 4 işlem.

  Her hücre ayrı bir işlemde koşuyor ve geri alınıyor; biri ötekini
  kirletmiyor. "İzinli" demek işlemin satırı gerçekten görmesi/yazması
  demek (SELECT 1 satır, INSERT/UPDATE/DELETE "returning" ile 1 satır).
  RLS'in sessizce sıfır satır döndürmesi de, hata vermesi de "reddedildi"
  sayılıyor: ikisi de kullanıcıya bir şey vermiyor.

  Beklentiler kurum sahibinin 14.11.2026 kararlarından:
   - Kriter ve hedef: kurumun her üyesi okur, kriter_yonet (+ Kurum Sahibi) yazar.
   - Profil: YALNIZCA sahibi. Gözetim ve Kurum Sahibi de göremez (veri en aza indirme).
   - Faaliyet: sahibi yönetir; tumunu_gor ve Kurum Sahibi yalnızca okur.
   - ÜAK: yalnızca uak_yonet (+ Kurum Sahibi).
   - Yabancı kurumun sahibi (kendi kurumunda her yetkisi var) hiçbir hücreye giremez.
   - service_role RLS'i atlar (sunucunun yolu); onun kuralı tetikleyicilerde.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";
import { AM, K, R, aktorOl, dene, tohumla } from "./docentlik-ortak.mjs";

let db;
before(async () => {
  db = await veritabani();
  await tohumla(db);
});

const UAK_YOLU = `${AM}/uak/00000000-0000-4000-8000-00000000d599/yeni.pdf`;

const TABLOLAR = {
  docentlik_kriterleri: {
    select: [`select count(*)::int n from public.docentlik_kriterleri where id = $1`, [R.kriter]],
    insert: [`insert into public.docentlik_kriterleri (organization_id, code, label) values ($1, 'Y1', 'Yeni kriter') returning id`, [AM]],
    update: [`update public.docentlik_kriterleri set label = 'Değişti' where id = $1 returning id`, [R.kriter]],
    delete: [`delete from public.docentlik_kriterleri where id = $1 returning id`, [R.kriterSil]],
    izinli: {
      select: ["sahip", "uye", "gozetim", "yonetici", "kurumSahibi", "service_role"],
      insert: ["yonetici", "kurumSahibi", "service_role"],
      update: ["yonetici", "kurumSahibi", "service_role"],
      delete: ["yonetici", "kurumSahibi", "service_role"],
    },
  },
  docentlik_hedefleri: {
    select: [`select count(*)::int n from public.docentlik_hedefleri where id = $1`, [R.hedef]],
    insert: [`insert into public.docentlik_hedefleri (organization_id, grup, asgari_puan) values ($1, 'Atıflar', 10) returning id`, [AM]],
    update: [`update public.docentlik_hedefleri set notlar = 'not' where id = $1 returning id`, [R.hedef]],
    delete: [`delete from public.docentlik_hedefleri where id = $1 returning id`, [R.hedef]],
    izinli: {
      select: ["sahip", "uye", "gozetim", "yonetici", "kurumSahibi", "service_role"],
      insert: ["yonetici", "kurumSahibi", "service_role"],
      update: ["yonetici", "kurumSahibi", "service_role"],
      delete: ["yonetici", "kurumSahibi", "service_role"],
    },
  },
  docentlik_profilleri: {
    select: [`select count(*)::int n from public.docentlik_profilleri where organization_id = $1 and owner_id = $2`, [AM, K.sahip]],
    /* Hedef kişinin (sahip) profili önce kaldırılıyor: yoksa birincil anahtar çakışması RLS'ten önce düşürürdü. */
    hazirlik: [`delete from public.docentlik_profilleri where organization_id = $1 and owner_id = $2`, [AM, K.sahip]],
    insert: [`insert into public.docentlik_profilleri (organization_id, owner_id, temel_alan) values ($1, $2, 'Hukuk') returning owner_id`, [AM, K.sahip]],
    update: [`update public.docentlik_profilleri set temel_alan = 'Hukuk' where organization_id = $1 and owner_id = $2 returning owner_id`, [AM, K.sahip]],
    delete: [`delete from public.docentlik_profilleri where organization_id = $1 and owner_id = $2 returning owner_id`, [AM, K.sahip]],
    izinli: {
      select: ["sahip", "service_role"],
      insert: ["sahip", "service_role"],
      update: ["sahip", "service_role"],
      delete: ["sahip", "service_role"],
    },
  },
  docentlik_faaliyetleri: {
    select: [`select count(*)::int n from public.docentlik_faaliyetleri where id = $1`, [R.faaliyet]],
    insert: [`insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title) values ($1, $2, $3, 'Yeni') returning id`, [AM, K.sahip, R.kriter]],
    update: [`update public.docentlik_faaliyetleri set title = 'Değişti' where id = $1 returning id`, [R.faaliyet]],
    delete: [`delete from public.docentlik_faaliyetleri where id = $1 returning id`, [R.faaliyet]],
    izinli: {
      select: ["sahip", "gozetim", "kurumSahibi", "service_role"],
      insert: ["sahip", "service_role"],
      update: ["sahip", "service_role"],
      delete: ["sahip", "service_role"],
    },
  },
  docentlik_uak_tablolari: {
    select: [`select count(*)::int n from public.docentlik_uak_tablolari where id = $1`, [R.uak]],
    insert: [`insert into public.docentlik_uak_tablolari (organization_id, temel_alan, donem, depo_yolu) values ($1, 'Hukuk', '2026 Ekim', $2) returning id`, [AM, UAK_YOLU]],
    update: [`update public.docentlik_uak_tablolari set donem = '2027 Mart' where id = $1 returning id`, [R.uak]],
    delete: [`delete from public.docentlik_uak_tablolari where id = $1 returning id`, [R.uak]],
    izinli: {
      select: ["yonetici", "kurumSahibi", "service_role"],
      insert: ["yonetici", "kurumSahibi", "service_role"],
      update: ["yonetici", "kurumSahibi", "service_role"],
      delete: ["yonetici", "kurumSahibi", "service_role"],
    },
  },
};

const AKTOR_ADLARI = ["anon", "sahip", "uye", "gozetim", "yonetici", "kurumSahibi", "yabanci", "service_role"];
const ISLEMLER = ["select", "insert", "update", "delete"];

async function hucre(tablo, aktor, islemAdi) {
  const t = TABLOLAR[tablo];
  return islem(db, async () => {
    if (islemAdi === "insert" && t.hazirlik) {
      await rol(db, "postgres");
      await db.query(t.hazirlik[0], t.hazirlik[1]);
    }
    await aktorOl(db, aktor);
    const [sql, params] = t[islemAdi];
    const sonuc = await dene(db, sql, params);
    if (islemAdi === "select") return sonuc.ok && sonuc.rows[0]?.n === 1;
    return sonuc.ok && sonuc.rows.length === 1;
  });
}

describe("Doçentlik RLS matrisi: 5 tablo × 8 aktör × 4 işlem", () => {
  for (const tablo of Object.keys(TABLOLAR)) {
    test(tablo, async (t) => {
      const farklar = [];
      const satirlar = [];
      for (const aktor of AKTOR_ADLARI) {
        const hucreler = [];
        for (const islemAdi of ISLEMLER) {
          const beklenen = TABLOLAR[tablo].izinli[islemAdi].includes(aktor);
          const gercek = await hucre(tablo, aktor, islemAdi);
          hucreler.push(gercek ? "✓" : "✗");
          if (gercek !== beklenen) farklar.push(`${aktor}/${islemAdi}: beklenen ${beklenen ? "izinli" : "red"}, gerçek ${gercek ? "izinli" : "red"}`);
        }
        satirlar.push(`${aktor.padEnd(12)} ${hucreler.join(" ")}`);
      }
      t.diagnostic(`${tablo}  (select insert update delete)\n${satirlar.join("\n")}`);
      assert.deepEqual(farklar, [], farklar.join("\n"));
    });
  }

  test("matris boş değil: her tabloda en az bir izinli ve bir reddedilen hücre var (testin kendisi kör değil)", async () => {
    for (const tablo of Object.keys(TABLOLAR)) {
      const izinli = await hucre(tablo, "service_role", "select");
      const red = await hucre(tablo, "anon", "select");
      assert.equal(izinli, true, `${tablo}: service_role göremiyor — tohum eksik`);
      assert.equal(red, false, `${tablo}: anon görüyor`);
    }
  });
});
