/*
  ÇALIŞMA TÜRÜ FIRSATTA SEÇİLİYOR.

  Tür yalnızca iş açılırken seçilebiliyordu: makale işi, kurumun öntanımlı
  seti tez olduğu için tezin görev listesiyle açılıyordu. Satışçı türü
  biliyor; fırsatta seçiyor ve iş onu devralıyor.

  (Bu testler 01.10.2026'da kaldırılan brifing dosyasından çıkarıldı;
  brifingle ilgileri yoktu, aynı migration'ın komşusuydular.)
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const SAHIP = "00000000-0000-4000-8000-000000000071";
const KURUM = "00000000-0000-4000-8000-000000000072";
const FIRSAT = "00000000-0000-4000-8000-000000000073";
const TEKLIF = "00000000-0000-4000-8000-000000000074";
const SOZLESME = "00000000-0000-4000-8000-000000000075";

let db;
before(async () => {
  db = await veritabani();
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'Akademik Merkez', 'akademik-merkez', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role)
      values ('${KURUM}', '${SAHIP}', 'owner');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, created_by, estimated_value)
      values ('${FIRSAT}', '${KURUM}', 'Tez danışmanlığı', 'Ayşe Yılmaz', '${SAHIP}', 1200000);
  `);
}

async function firsatiKazan() {
  await rol(db, "postgres");
  await db.query(`update public.crm_opportunities set stage = 'won' where id = $1`, [FIRSAT]);
  return (await tek(
    `select workflow_id from public.crm_automation_runs where opportunity_id = $1`, [FIRSAT])).workflow_id;
}

describe("fırsattaki çalışma türü işe taşınıyor", () => {
  const setKur = () =>
    db.exec(`
      insert into public.organization_step_template_sets (organization_id, code, name, is_default) values
        ('${KURUM}', 'tez', 'Tez', true),
        ('${KURUM}', 'makale', 'Makale', false);
      insert into public.organization_step_templates (organization_id, set_code, code, title, sort_order) values
        ('${KURUM}', 'tez', 'oneri', 'Tez Öneri Formu', 10),
        ('${KURUM}', 'makale', 'dergi', 'Hedef Dergi Seçimi', 10);
    `);

  const adimlar = (isId) =>
    db.query(`select title from public.operation_steps where workflow_id = $1 order by sort_order`, [isId])
      .then((r) => r.rows.map((a) => a.title));

  test("fırsat kazanılınca iş, fırsatın türüyle açılıyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await setKur();
      await db.query(`update public.crm_opportunities set step_template_set = 'makale' where id = $1`, [FIRSAT]);
      const isId = await firsatiKazan();
      assert.deepEqual(await adimlar(isId), ["Hedef Dergi Seçimi"], "makale işi tezin listesiyle açılmamalı");
      assert.equal(
        (await tek(`select step_template_set from public.operation_workflows where id = $1`, [isId])).step_template_set,
        "makale",
      );
    }));

  test("sözleşmeden açılan iş türü fırsattan devralıyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await setKur();
      await db.query(`update public.crm_opportunities set step_template_set = 'makale' where id = $1`, [FIRSAT]);
      await db.exec(`
        insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, access_token_hash, created_by, status)
          values ('${TEKLIF}', '${KURUM}', '${FIRSAT}', 'TKF-T-1', 'Makale', 'x', '${SAHIP}', 'accepted');
        insert into public.crm_contracts
          (id, organization_id, opportunity_id, proposal_id, contract_no, title, access_token_hash,
           amount, status, start_date, created_by)
          values ('${SOZLESME}', '${KURUM}', '${FIRSAT}', '${TEKLIF}', 'SOZ-T-1', 'Makale', 'x',
                  500000, 'signed', current_date, '${SAHIP}');
      `);
      const is = await tek(
        `insert into public.operation_workflows (organization_id, contract_id, title, status, created_by)
         values ($1, $2, 'Makale', 'planned', $3) returning id`,
        [KURUM, SOZLESME, SAHIP],
      );
      /*
        Tür BEFORE INSERT'te yazılmalı: adımları üreten tetikleyici AFTER
        INSERT'te çalışıyor. Sonradan yazılsaydı liste yanlış setten
        üretilmiş olurdu ve bu assert "Tez Öneri Formu" görürdü.
      */
      assert.deepEqual(await adimlar(is.id), ["Hedef Dergi Seçimi"]);
    }));

  test("işte tür zaten seçilmişse fırsatınki ezmiyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await setKur();
      await db.query(`update public.crm_opportunities set step_template_set = 'makale' where id = $1`, [FIRSAT]);
      await db.exec(`
        insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, access_token_hash, created_by, status)
          values ('${TEKLIF}', '${KURUM}', '${FIRSAT}', 'TKF-T-2', 'Makale', 'x', '${SAHIP}', 'accepted');
        insert into public.crm_contracts
          (id, organization_id, opportunity_id, proposal_id, contract_no, title, access_token_hash,
           amount, status, start_date, created_by)
          values ('${SOZLESME}', '${KURUM}', '${FIRSAT}', '${TEKLIF}', 'SOZ-T-2', 'Makale', 'x',
                  500000, 'signed', current_date, '${SAHIP}');
      `);
      const is = await tek(
        `insert into public.operation_workflows (organization_id, contract_id, title, status, created_by, step_template_set)
         values ($1, $2, 'Elle tür seçilmiş iş', 'planned', $3, 'tez') returning id`,
        [KURUM, SOZLESME, SAHIP],
      );
      assert.deepEqual(await adimlar(is.id), ["Tez Öneri Formu"]);
    }));

  test("kurumun olmayan türü fırsata yazılamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await setKur();
      await reddedilir(
        db,
        `update public.crm_opportunities set step_template_set = 'odev' where id = $1`,
        [FIRSAT],
        /crm_opportunities_step_set_fkey/,
      );
    }));
});
