/*
  TEKLİFİN GRUBU: SÜTUN İLE TypeScript AYNI ŞEYİ SÖYLÜYOR MU.

  Kural iki yerde yaşıyor: lib/teklif-grubu.ts (ekranda etiket, eski
  kayıtlar) ve crm_proposals.teklif_grubu (süzgeç, sayım, sayfalama
  sunucuda). İki kopya en sık görülen kayma biçimi: biri değişiyor,
  öteki kalıyor ve liste bir şey gösterirken rozet başka şey sayıyor.

  Önlem tek bir örnek tablosu: tests/fixtures/teklif-gruplari.json.
  Aynı tabloyu birim testi TypeScript işlevine, bu test veritabanı
  sütununa uyguluyor.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
/* Sütun artık anlık görüntüde, yetki migration'ı da ortam.mjs'teki
   bekleyenler listesinde: burada uygulanacak bir şey kalmadı. */
const MIGRATIONLAR = [];

const ORNEKLER = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../fixtures/teklif-gruplari.json"), "utf8"),
).ornekler;

const KURUM = "00000000-0000-4000-8000-0000000000g1".replace("g", "a");
const SAHIP = "00000000-0000-4000-8000-0000000000b1";
const FIRSAT = "00000000-0000-4000-8000-0000000000c1";

let db;
before(async () => {
  db = await veritabani();
  // Sütun anlık görüntüye girene kadar migration buradan uygulanıyor.
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@x.com');
    insert into public.plans (code, name, description) values ('starter', 'B', '');
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'AM', 'am', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role)
      values ('${KURUM}', '${SAHIP}', 'owner');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, stage, estimated_value, probability, created_by, created_at, updated_at, request_details)
      values ('${FIRSAT}', '${KURUM}', 'Danışmanlık', 'Müşteri A.Ş.', 'proposal', 100000, 50, '${SAHIP}', now(), now(), '{}'::jsonb);
  `);
});

async function teklifKur({ status, archive_reason, eskiyen }, sira) {
  /* "Eskiyen" teklif, yerine geçen revizyonu gösteriyor: superseded_by
     gerçek bir teklife bakmalı (yabancı anahtar). */
  const yeni = eskiyen
    ? (await db.query(
        `insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, amount, currency, status, access_token_hash, created_by, created_at, updated_at, view_count, tax_status)
         values (gen_random_uuid(), $1, $2, $3, 'Revizyon', 100000, 'TRY', 'sent', md5(random()::text), $4, now(), now(), 0, 'included') returning id`,
        [KURUM, FIRSAT, `REV-${sira}`, SAHIP],
      )).rows[0].id
    : null;
  const { rows } = await db.query(
    `insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, amount, currency, status, archive_reason, superseded_by, access_token_hash, created_by, created_at, updated_at, view_count, tax_status)
     values (gen_random_uuid(), $1, $2, $3, 'Teklif', 100000, 'TRY', $4, $5, $6, md5(random()::text), $7, now(), now(), 0, 'included')
     returning teklif_grubu`,
    [KURUM, FIRSAT, `TEK-${sira}`, status, archive_reason, yeni, SAHIP],
  );
  return rows[0].teklif_grubu;
}

test("ortak örnek tablosu: veritabanı sütunu", async () => {
  assert.ok(ORNEKLER.length >= 10, "örnek tablosu daraltılmış");
  await rol(db, "postgres");
  for (const [sira, ornek] of ORNEKLER.entries()) {
    assert.equal(await teklifKur(ornek, sira), ornek.grup, ornek.ad);
  }
});

test("sütun kendiliğinden güncelleniyor", async () => {
  /* Üretilmiş sütun: arşivleme tetikleyicisi durumu değiştirdiğinde
     grup da değişmeli. Elle yazılan bir sütun olsaydı, durumu
     değiştiren her yol onu da güncellemek zorunda kalırdı — biri
     unutulduğunda liste sessizce yanlış süzerdi. */
  await rol(db, "postgres");
  const { rows } = await db.query(
    `insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, amount, currency, status, access_token_hash, created_by, created_at, updated_at, view_count, tax_status)
     values (gen_random_uuid(), $1, $2, 'TEK-GUNCEL', 'Teklif', 100000, 'TRY', 'draft', md5(random()::text), $3, now(), now(), 0, 'included')
     returning id, teklif_grubu`,
    [KURUM, FIRSAT, SAHIP],
  );
  assert.equal(rows[0].teklif_grubu, "draft");

  const sonra = await db.query(
    `update public.crm_proposals set status = 'archived', archive_reason = 'rejected' where id = $1 returning teklif_grubu`,
    [rows[0].id],
  );
  assert.equal(sonra.rows[0].teklif_grubu, "rejected");
});

test("sütuna elle yazılamıyor", async () => {
  /* Üretilmiş sütun yazmaya kapalı: API'den tabloya yazabilen biri
     grubu değiştirip kendi teklifini başka süzgece taşıyamasın. */
  await rol(db, "postgres");
  await assert.rejects(
    () => db.query(`update public.crm_proposals set teklif_grubu = 'accepted' where organization_id = $1`, [KURUM]),
    /can only be updated to DEFAULT/i,
  );
});
