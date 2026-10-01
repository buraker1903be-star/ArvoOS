/*
  REVİZYON PENCERESİ, veritabanı tarafı.

  Pencere TÜRETİLİYOR: teslim anı + gün sayısı. Elle girilen bir tarih,
  teslim ertelendiğinde sessizce yanlış kalırdı. Burada sabitlenen üç şey:
  pencere iş tamamlanınca açılıyor, teslim tarihi bir daha değişmiyor
  (revizyon için yeniden açılan iş pencereyi uzatmıyor), ve süre
  tanımlı değilse uydurma bir tarih üretilmiyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20261001090934_revizyon_penceresi.sql",
);

const SAHIP = "00000000-0000-4000-8000-0000000000a7";
const KURUM = "00000000-0000-4000-8000-0000000000a8";

let db;
before(async () => {
  db = await veritabani();
  const { rows } = await db.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'operation_workflows' and column_name = 'revision_until'`,
  );
  if (!rows.length) await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const gun = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

async function tohum({ kurumGun = 60 } = {}) {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code, revision_days)
      values ('${KURUM}', 'Akademik Merkez', 'akademik-merkez', 'active', 'starter', ${kurumGun ?? "null"});
    insert into public.organization_memberships (organization_id, user_id, role)
      values ('${KURUM}', '${SAHIP}', 'owner');
  `);
  return (await tek(
    `insert into public.operation_workflows (organization_id, title, status, created_by)
     values ($1, 'Tez', 'planned', $2) returning id`, [KURUM, SAHIP])).id;
}

const penceresi = (id) =>
  tek(`select delivered_at, revision_until, revision_days from public.operation_workflows where id = $1`, [id]);

const tamamla = (id) =>
  db.query(`update public.operation_workflows set status = 'completed' where id = $1`, [id]);

describe("revizyon penceresi", () => {
  test("iş tamamlanmadan pencere açılmıyor", () =>
    islem(db, async () => {
      const isId = await tohum();
      const satir = await penceresi(isId);
      assert.equal(satir.delivered_at, null);
      assert.equal(satir.revision_until, null);
    }));

  test("tamamlanınca kurumun varsayılan süresiyle açılıyor", () =>
    islem(db, async () => {
      const isId = await tohum({ kurumGun: 60 });
      await tamamla(isId);
      const satir = await penceresi(isId);
      assert.ok(satir.delivered_at, "teslim anı yazılmalı");
      const bugun = (await tek(`select (now() at time zone 'Europe/Istanbul')::date as g`)).g;
      const beklenen = new Date(bugun.getTime() + 60 * 86400000).toISOString().slice(0, 10);
      assert.equal(gun(satir.revision_until), beklenen);
    }));

  test("işin kendi süresi kurumun varsayılanını eziyor", () =>
    islem(db, async () => {
      const isId = await tohum({ kurumGun: 60 });
      await db.query(`update public.operation_workflows set revision_days = 30 where id = $1`, [isId]);
      await tamamla(isId);
      const bugun = (await tek(`select (now() at time zone 'Europe/Istanbul')::date as g`)).g;
      assert.equal(
        gun((await penceresi(isId)).revision_until),
        new Date(bugun.getTime() + 30 * 86400000).toISOString().slice(0, 10),
      );
    }));

  test("revizyon için yeniden açılan iş pencereyi UZATMIYOR", () =>
    islem(db, async () => {
      /*
        Teslim anı ilk teslimde yazılıp bir daha değişmiyor. Değişseydi
        "iki ay" fiilen sınırsız olurdu: her revizyonda pencere yeniden
        başlardı.
      */
      const isId = await tohum({ kurumGun: 60 });
      await tamamla(isId);
      const ilk = await penceresi(isId);
      await db.query(`update public.operation_workflows set status = 'in_progress' where id = $1`, [isId]);
      await tamamla(isId);
      const sonra = await penceresi(isId);
      assert.deepEqual(gun(sonra.delivered_at), gun(ilk.delivered_at));
      assert.deepEqual(gun(sonra.revision_until), gun(ilk.revision_until));
    }));

  test("süre tanımlı değilse pencere üretilmiyor", () =>
    islem(db, async () => {
      const isId = await tohum({ kurumGun: null });
      await tamamla(isId);
      const satir = await penceresi(isId);
      assert.ok(satir.delivered_at, "teslim anı yine yazılmalı");
      assert.equal(satir.revision_until, null, "uydurma bir tarih üretilmemeli");
    }));

  test("süre sonradan verilince pencere geriye dönük hesaplanıyor", () =>
    islem(db, async () => {
      // Özel anlaşma teslimden sonra konuşulabiliyor; teslim tarihi sabit
      // olduğu için bu güvenli.
      const isId = await tohum({ kurumGun: null });
      await tamamla(isId);
      await db.query(`update public.operation_workflows set revision_days = 45 where id = $1`, [isId]);
      assert.ok((await penceresi(isId)).revision_until);
    }));
});
