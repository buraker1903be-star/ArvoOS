/*
  "TOP KİMDE", veritabanı tarafı.

  Sabitlenen şey: bekleme süresinin damgasını UYGULAMA DEĞİL VERİTABANI
  koyuyor. Panelden yazan yol damgayı koyar, SQL Editor'den ya da köprüden
  yazan yol unuturdu; "kaç gündür bekliyor" o satırlarda sessizce yanlış
  çıkardı.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20261001085845_bekleyen_taraf.sql",
);

const SAHIP = "00000000-0000-4000-8000-000000000091";
const KURUM = "00000000-0000-4000-8000-000000000092";

let db;
before(async () => {
  db = await veritabani();
  const { rows } = await db.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'operation_workflows' and column_name = 'waiting_party'`,
  );
  if (!rows.length) await db.exec(fs.readFileSync(MIGRATION, "utf8"));
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
  `);
  return (await tek(
    `insert into public.operation_workflows (organization_id, title, status, created_by)
     values ($1, 'Tez', 'planned', $2) returning id`, [KURUM, SAHIP])).id;
}

const isi = (id) =>
  tek(`select waiting_party, waiting_note, waiting_since from public.operation_workflows where id = $1`, [id]);

describe("bekleyen taraf", () => {
  test("yeni iş bizde başlar ve damgası konur", () =>
    islem(db, async () => {
      const isId = await tohum();
      const satir = await isi(isId);
      assert.equal(satir.waiting_party, "us");
      assert.ok(satir.waiting_since, "süre sayacı en baştan işlemeli");
    }));

  test("taraf değişince damga yenileniyor", () =>
    islem(db, async () => {
      const isId = await tohum();
      const once = (await isi(isId)).waiting_since;
      await db.query(
        `update public.operation_workflows set waiting_party = 'customer', waiting_note = 'ham veri' where id = $1`,
        [isId],
      );
      const sonra = await isi(isId);
      assert.equal(sonra.waiting_party, "customer");
      assert.equal(sonra.waiting_note, "ham veri");
      assert.ok(sonra.waiting_since >= once, "damga ileri gitmeli");
    }));

  test("taraf değişirken eski not taşınmıyor", () =>
    islem(db, async () => {
      const isId = await tohum();
      await db.query(
        `update public.operation_workflows set waiting_party = 'customer', waiting_note = 'ham veri' where id = $1`, [isId]);
      // "Danışman onayı"na geçerken "ham veri" notu kalsaydı yanlış bilgi olurdu.
      await db.query(`update public.operation_workflows set waiting_party = 'third_party' where id = $1`, [isId]);
      assert.equal((await isi(isId)).waiting_note, null);
    }));

  test("bizde bekleyen işin notu olmaz", () =>
    islem(db, async () => {
      const isId = await tohum();
      await db.query(
        `update public.operation_workflows set waiting_party = 'customer', waiting_note = 'ham veri' where id = $1`, [isId]);
      await db.query(`update public.operation_workflows set waiting_party = 'us' where id = $1`, [isId]);
      assert.equal((await isi(isId)).waiting_note, null, "beklenen bir şey yokken not kalmamalı");
    }));

  test("tanınmayan taraf yazılamaz", () =>
    islem(db, async () => {
      const isId = await tohum();
      await reddedilir(
        db,
        `update public.operation_workflows set waiting_party = 'danisman' where id = $1`,
        [isId],
        /operation_workflows_waiting_party_check/,
      );
    }));

  test("işin durumu ile bekleyen taraf birbirine karışmıyor", () =>
    islem(db, async () => {
      /*
        'blocked' işin ilerlemediğini söyler, bekleyen taraf ilerlemeyi
        KİMİN sürdüreceğini. Devam eden bir iş de müşteriden yanıt
        bekliyor olabilir.
      */
      const isId = await tohum();
      await db.query(
        `update public.operation_workflows set status = 'in_progress', waiting_party = 'customer' where id = $1`, [isId]);
      const satir = await tek(
        `select status, waiting_party from public.operation_workflows where id = $1`, [isId]);
      assert.deepEqual([satir.status, satir.waiting_party], ["in_progress", "customer"]);
    }));
});
