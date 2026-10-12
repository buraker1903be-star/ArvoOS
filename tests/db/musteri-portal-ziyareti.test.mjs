/*
  MÜŞTERİ TAKİP PORTALI ZİYARETİ (20261012131639).

  Sınananlar:
  1. MEŞRU yol: sorgu ekranından giriş (p_tur='giris') ilk/son girişi ve
     sayıyı yazıyor; açık sekmenin yenilemesi (p_tur yok) yalnızca son
     görülmeyi günceller, giriş sayısını artırmaz.
  2. Kapının asıl işi bozulmadı: geçersiz kod ziyaret yazmıyor, sonuçsuz
     deneme sayılıyor ve 30'da sınır devreye giriyor.
  3. Kayıt kurum üyelerine okunur; başka kurum ve anon göremez; personel
     elle yazamaz, kapıyı da çağıramaz (yalnızca service_role).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261012131639_musteri_portal_ziyareti.sql"];

const KURUM = "00000000-0000-4000-8000-00000000e601";
const OTEKI = "00000000-0000-4000-8000-00000000e602";
const SAHIP = "00000000-0000-4000-8000-00000000e611";
const YABANCI = "00000000-0000-4000-8000-00000000e613";
const FIRSAT = "00000000-0000-4000-8000-00000000e621";
const TEKLIF = "00000000-0000-4000-8000-00000000e622";
const SOZLESME = "00000000-0000-4000-8000-00000000e623";
const KOD = "ABC234";

let db;
before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','sahip@x.com'),('${YABANCI}','yabanci@y.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','AM','am','active','starter'),('${OTEKI}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${OTEKI}','${YABANCI}','owner');
    insert into public.crm_opportunities (id,organization_id,title,customer_name,stage,created_by)
      values ('${FIRSAT}','${KURUM}','Tez','Ayşe','won','${SAHIP}');
    insert into public.crm_proposals (id,organization_id,opportunity_id,proposal_no,title,access_token_hash,amount,status,created_by)
      values ('${TEKLIF}','${KURUM}','${FIRSAT}','TKF-1','Tez','t1',100000,'accepted','${SAHIP}');
    insert into public.crm_contracts (id,organization_id,opportunity_id,proposal_id,contract_no,title,access_token_hash,amount,status,tracking_code,created_by)
      values ('${SOZLESME}','${KURUM}','${FIRSAT}','${TEKLIF}','SOZ-1','Tez','h1',100000,'sent','${KOD}','${SAHIP}');
  `);
});

const kapi = (kod, tur = null, ip = "1.2.3.4") =>
  db.query(`select * from public.arvo_tracking_guard($1, $2, $3)`, [ip, kod, tur]);
const ziyaret = async () =>
  (await db.query(`select login_count, first_login_at is not null as ilk, last_login_at, last_seen_at from public.crm_contract_portal_visits where contract_id = $1`, [SOZLESME])).rows[0];

describe("ziyaret kaydı", () => {
  test("giriş sayılıyor; yenileme yalnızca son görülmeyi güncelliyor", async () =>
    islem(db, async () => {
      await rol(db, "service_role");
      assert.deepEqual((await kapi(KOD, "giris")).rows[0], { allowed: true, code_exists: true });
      const ilk = await ziyaret();
      assert.equal(ilk.login_count, 1);
      assert.equal(ilk.ilk, true);
      await kapi(KOD); // 20 sn'lik yenileme
      await kapi(KOD);
      const sonra = await ziyaret();
      assert.equal(sonra.login_count, 1, "yenileme giriş sayıldı");
      assert.deepEqual(sonra.last_login_at, ilk.last_login_at);
      await kapi(KOD, "giris");
      assert.equal((await ziyaret()).login_count, 2);
    }));

  test("yalnızca yenileme (giriş olmadan) gelirse kayıt açılır, giriş sayısı sıfır", async () =>
    islem(db, async () => {
      await rol(db, "service_role");
      await kapi(KOD);
      const z = await ziyaret();
      assert.equal(z.login_count, 0);
      assert.equal(z.ilk, false);
      assert.ok(z.last_seen_at);
    }));
});

describe("kapının asıl işi", () => {
  test("geçersiz kod ziyaret yazmıyor; 30 sonuçsuz denemede sınır", async () =>
    islem(db, async () => {
      await rol(db, "service_role");
      for (let i = 0; i < 30; i++) {
        assert.deepEqual((await kapi("ZZZ999", null, "9.9.9.9")).rows[0], { allowed: true, code_exists: false });
      }
      assert.deepEqual((await kapi("ZZZ999", null, "9.9.9.9")).rows[0], { allowed: false, code_exists: false });
      // Başka IP'den geçerli kod hâlâ açılıyor.
      assert.deepEqual((await kapi(KOD, "giris", "5.5.5.5")).rows[0], { allowed: true, code_exists: true });
      const { rows } = await db.query(`select count(*)::int as n from public.crm_contract_portal_visits`);
      assert.equal(rows[0].n, 1);
    }));
});

describe("yetki", () => {
  test("kurum üyesi okuyor; başka kurum göremiyor; anon erişemiyor", async () =>
    islem(db, async () => {
      await rol(db, "service_role");
      await kapi(KOD, "giris");
      await rol(db, "authenticated", SAHIP);
      assert.equal((await db.query(`select 1 from public.crm_contract_portal_visits`)).rows.length, 1);
      await rol(db, "authenticated", YABANCI);
      assert.equal((await db.query(`select 1 from public.crm_contract_portal_visits`)).rows.length, 0, "yabancı kurum ziyareti gördü");
      await rol(db, "anon");
      await reddedilir(db, `select 1 from public.crm_contract_portal_visits`, [], /permission denied/);
    }));

  test("personel kaydı elle yazamıyor, kapıyı çağıramıyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `insert into public.crm_contract_portal_visits (contract_id, organization_id) values ($1, $2)`, [SOZLESME, KURUM], /permission denied/);
      await reddedilir(db, `select * from public.arvo_tracking_guard('1.1.1.1', $1, 'giris')`, [KOD], /permission denied/);
      await rol(db, "anon");
      await reddedilir(db, `select * from public.arvo_tracking_guard('1.1.1.1', $1, 'giris')`, [KOD], /permission denied/);
    }));
});
