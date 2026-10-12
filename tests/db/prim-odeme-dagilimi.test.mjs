/*
  PRİM ÖDEMESİNİN İŞ DAĞILIMI (20261012115936).

  Sınananlar:
  1. MEŞRU yol: Kurum Sahibi ödemeyi iki işe dağıtıyor, sonra dağıtımı
     değiştiriyor (eskisi siliniyor, yenisi yazılıyor); boş liste
     dağıtımı kaldırıyor.
  2. Dağıtılan ödemeyi aşamıyor; başka kurumun sözleşmesine dağıtılamıyor.
  3. Satış personeli dağıtım yazamıyor (işlev de, tablo da); kendi
     ödemesinin dağıtımını okuyabiliyor; başka kurum ve anon göremiyor.
  4. Sözleşme silinince dağıtım satırı kalıyor, bağı boşalıyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261012115936_prim_odeme_is_dagilimi.sql"];

const KURUM = "00000000-0000-4000-8000-00000000d501";
const OTEKI = "00000000-0000-4000-8000-00000000d502";
const SAHIP = "00000000-0000-4000-8000-00000000d511";
const SATISCI = "00000000-0000-4000-8000-00000000d512";
const YABANCI = "00000000-0000-4000-8000-00000000d513";
const PERSONEL = "00000000-0000-4000-8000-00000000d521";
const FIRSAT = "00000000-0000-4000-8000-00000000d531";
const SOZ1 = "00000000-0000-4000-8000-00000000d541";
const SOZ2 = "00000000-0000-4000-8000-00000000d542";
const YABANCI_SOZ = "00000000-0000-4000-8000-00000000d543";
const YABANCI_FIRSAT = "00000000-0000-4000-8000-00000000d532";
const ODEME = "00000000-0000-4000-8000-00000000d551";
const TEKLIF = "00000000-0000-4000-8000-00000000d561";
const YABANCI_TEKLIF = "00000000-0000-4000-8000-00000000d562";
const TEKLIF2 = "00000000-0000-4000-8000-00000000d563";

let db;
before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${SAHIP}','sahip@x.com'),('${SATISCI}','satis@x.com'),('${YABANCI}','yabanci@y.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','AM','am','active','starter'),('${OTEKI}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${SATISCI}','member'),('${OTEKI}','${YABANCI}','owner');
    insert into public.hr_employees (id,organization_id,user_id,full_name,employment_status)
      values ('${PERSONEL}','${KURUM}','${SATISCI}','Gizem','active');
    insert into public.crm_opportunities (id,organization_id,title,customer_name,stage,created_by) values
      ('${FIRSAT}','${KURUM}','Tez','Ayşe','won','${SAHIP}'),
      ('${YABANCI_FIRSAT}','${OTEKI}','Tez','Can','won','${YABANCI}');
    insert into public.crm_proposals (id,organization_id,opportunity_id,proposal_no,title,access_token_hash,amount,status,created_by) values
      ('${TEKLIF}','${KURUM}','${FIRSAT}','TKF-1','Tez','t1',100000,'accepted','${SAHIP}'),
      ('${TEKLIF2}','${KURUM}','${FIRSAT}','TKF-2','Tez','t2',100000,'accepted','${SAHIP}'),
      ('${YABANCI_TEKLIF}','${OTEKI}','${YABANCI_FIRSAT}','TKF-9','Tez','t9',100000,'accepted','${YABANCI}');
    insert into public.crm_contracts (id,organization_id,opportunity_id,proposal_id,contract_no,title,access_token_hash,amount,status,created_by) values
      ('${SOZ1}','${KURUM}','${FIRSAT}','${TEKLIF}','SOZ-1','Tez','h1',100000,'sent','${SAHIP}'),
      ('${SOZ2}','${KURUM}','${FIRSAT}','${TEKLIF2}','SOZ-2','Tez','h2',100000,'sent','${SAHIP}'),
      ('${YABANCI_SOZ}','${OTEKI}','${YABANCI_FIRSAT}','${YABANCI_TEKLIF}','SOZ-9','Tez','h9',100000,'sent','${YABANCI}');
    insert into public.hr_commission_payments (id,organization_id,employee_id,amount,paid_on,method)
      values ('${ODEME}','${KURUM}','${PERSONEL}',500000,'2026-10-10','havale');
  `);
});

const dagit = (kalemler) => db.query(`select public.arvo_prim_odemesi_dagit($1, $2::jsonb)`, [ODEME, JSON.stringify(kalemler)]);
const dagilim = async () => (await db.query(`select contract_id, amount::int as amount from public.hr_commission_payment_allocations where payment_id = $1 order by amount desc`, [ODEME])).rows;

describe("meşru yol", () => {
  test("Kurum Sahibi dağıtıyor, değiştiriyor, kaldırıyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await dagit([{ contract_id: SOZ1, amount: 314000 }, { contract_id: SOZ2, amount: 50000 }]);
      assert.deepEqual(await dagilim(), [{ contract_id: SOZ1, amount: 314000 }, { contract_id: SOZ2, amount: 50000 }]);
      await dagit([{ contract_id: SOZ2, amount: 500000 }]);
      assert.deepEqual(await dagilim(), [{ contract_id: SOZ2, amount: 500000 }], "eski dağıtım silinmedi");
      await dagit([]);
      assert.deepEqual(await dagilim(), []);
    }));
});

describe("denetimler", () => {
  test("dağıtılan ödemeyi aşamıyor; başka kurumun sözleşmesine dağıtılamıyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arvo_prim_odemesi_dagit($1, $2::jsonb)`,
        [ODEME, JSON.stringify([{ contract_id: SOZ1, amount: 400000 }, { contract_id: SOZ2, amount: 200000 }])], /ödemenin kendisinden büyük/);
      await reddedilir(db, `select public.arvo_prim_odemesi_dagit($1, $2::jsonb)`,
        [ODEME, JSON.stringify([{ contract_id: YABANCI_SOZ, amount: 1000 }])], /bu kurumda bulunamadı/);
      await reddedilir(db, `select public.arvo_prim_odemesi_dagit($1, $2::jsonb)`,
        [ODEME, JSON.stringify([{ contract_id: SOZ1, amount: 0 }])], /sıfırdan büyük/);
    }));
});

describe("yetki", () => {
  test("satış personeli yazamıyor ama kendi ödemesinin dağıtımını okuyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await dagit([{ contract_id: SOZ1, amount: 100000 }]);
      await rol(db, "authenticated", SATISCI);
      await reddedilir(db, `select public.arvo_prim_odemesi_dagit($1, '[]'::jsonb)`, [ODEME], /yalnızca Kurum Sahibi/);
      await reddedilir(db, `insert into public.hr_commission_payment_allocations (organization_id,payment_id,contract_id,amount) values ($1,$2,$3,1)`,
        [KURUM, ODEME, SOZ2], /permission denied/);
      assert.equal((await dagilim()).length, 1, "personel kendi ödemesinin dağıtımını göremedi");
    }));

  test("başka kurum göremiyor, yazamıyor; anon erişemiyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await dagit([{ contract_id: SOZ1, amount: 100000 }]);
      await rol(db, "authenticated", YABANCI);
      assert.equal((await dagilim()).length, 0, "yabancı dağıtımı gördü");
      await reddedilir(db, `select public.arvo_prim_odemesi_dagit($1, '[]'::jsonb)`, [ODEME], /yalnızca Kurum Sahibi/);
      await rol(db, "anon");
      await reddedilir(db, `select 1 from public.hr_commission_payment_allocations`, [], /permission denied/);
    }));
});

describe("sözleşme silinince", () => {
  test("dağıtım satırı kalıyor, sözleşme bağı boşalıyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await dagit([{ contract_id: SOZ1, amount: 100000 }]);
      await rol(db, "postgres");
      await db.query(`delete from public.crm_contracts where id = $1`, [SOZ1]);
      const { rows } = await db.query(`select contract_id, amount::int as amount from public.hr_commission_payment_allocations where payment_id = $1`, [ODEME]);
      assert.deepEqual(rows, [{ contract_id: null, amount: 100000 }]);
    }));
});
