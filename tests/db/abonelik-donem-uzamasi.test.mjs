// OS-05 (09.11.2026): kurumun Abonelik ekranı ödeme sonrası uzamayı
// "dönem bitmediyse dönem sonundan, bittiyse ödeme gününden 1 ay" ve
// "deneme ödemeyle biter" diye anlatıyor (lib/abonelik-donemi.ts). Bu
// dosya o cümlenin dayandığı veritabanı kuralını sabitliyor: işlev bir
// gün değişirse ekrandaki vaat yanlış olur ve bu test düşer.
//
// Ödeme başlatılmıyor: onayın veritabanında çağırdığı iç işlev
// (private.arvo_activate_license_period / _product_period) sentetik
// kurumda doğrudan çalıştırılıyor; dış servis yok.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000000a5";

let db;
before(async () => {
  db = await veritabani();
});

async function tek(sql, params = []) {
  const { rows } = await db.query(sql, params);
  return rows[0];
}

async function kurumKur({ durum, donemSonu, denemeSonu }) {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'Abonelik Deneme', 'abonelik-deneme', 'active', 'starter');
  `);
  await db.query(
    `insert into public.organization_licenses
       (organization_id, plan_code, license_status, trial_started_at, trial_ends_at, current_period_end,
        user_limit, storage_limit_mb, ai_credit_limit, ai_credits_used, module_limits, created_at, updated_at,
        extra_user_fee, extra_user_cap)
     values ($1, 'starter', $2, now() - interval '5 days', $3, $4, 5, 1024, 0, 0, '{}'::jsonb, now(), now(), 0, 0)
     on conflict (organization_id) do update
       set license_status = excluded.license_status, trial_ends_at = excluded.trial_ends_at,
           current_period_end = excluded.current_period_end`,
    [KURUM, durum, denemeSonu, donemSonu],
  );
}

const lisans = () => tek(
  `select license_status, trial_ends_at, current_period_end,
          extract(epoch from current_period_end) as son, extract(epoch from now()) as simdi
     from public.organization_licenses where organization_id = $1`,
  [KURUM],
);
const birAySonra = (tabanSn) => tek(`select extract(epoch from to_timestamp($1) + interval '1 month') as s`, [tabanSn]);

describe("OS-05: ödeme onayında dönem uzaması", () => {
  test("deneme: ödeme denemeyi bitirir, 1 aylık dönem ödeme anından başlar", async () => {
    await islem(db, async () => {
      await kurumKur({ durum: "trialing", donemSonu: null, denemeSonu: "2099-01-01T00:00:00Z" });
      await db.query(`select private.arvo_activate_license_period($1, 'starter', 100000, 'TRY', 'manual', null)`, [KURUM]);
      const l = await lisans();
      assert.equal(l.license_status, "active");
      assert.equal(l.trial_ends_at, null, "kalan deneme günü eklenmez");
      const beklenen = await birAySonra(Number(l.simdi));
      assert.equal(Math.round(Number(l.son)), Math.round(Number(beklenen.s)));
    });
  });

  test("dönem bitmediyse yeni ay dönem sonundan başlar", async () => {
    await islem(db, async () => {
      const { s: eskiSon } = await tek(`select extract(epoch from now() + interval '10 days') as s`);
      await kurumKur({ durum: "active", donemSonu: new Date(Number(eskiSon) * 1000).toISOString(), denemeSonu: null });
      const { son_once } = await tek(`select extract(epoch from current_period_end) as son_once from public.organization_licenses where organization_id = $1`, [KURUM]);
      await db.query(`select private.arvo_activate_license_period($1, 'starter', 100000, 'TRY', 'manual', null)`, [KURUM]);
      const l = await lisans();
      const beklenen = await birAySonra(Number(son_once));
      assert.equal(Math.round(Number(l.son)), Math.round(Number(beklenen.s)));
    });
  });

  test("dönem bittiyse yeni ay ödeme anından başlar", async () => {
    await islem(db, async () => {
      await kurumKur({ durum: "past_due", donemSonu: "2020-01-01T00:00:00Z", denemeSonu: null });
      await db.query(`select private.arvo_activate_license_period($1, 'starter', 100000, 'TRY', 'manual', null)`, [KURUM]);
      const l = await lisans();
      assert.equal(l.license_status, "active");
      const beklenen = await birAySonra(Number(l.simdi));
      assert.equal(Math.round(Number(l.son)), Math.round(Number(beklenen.s)));
    });
  });

  test("ek ürün: aynı kural, satır yoksa açılır", async () => {
    await islem(db, async () => {
      await kurumKur({ durum: "active", donemSonu: "2099-01-01T00:00:00Z", denemeSonu: null });
      await db.query(`select private.arvo_activate_product_period($1, 'arvolab', 'starter', 50000, 'TRY', 'manual', null)`, [KURUM]);
      const u = await tek(
        `select status, trial_ends_at, extract(epoch from current_period_end) as son, extract(epoch from now()) as simdi
           from public.organization_product_licenses where organization_id = $1 and product = 'arvolab'`,
        [KURUM],
      );
      assert.equal(u.status, "active");
      assert.equal(u.trial_ends_at, null);
      const beklenen = await birAySonra(Number(u.simdi));
      assert.equal(Math.round(Number(u.son)), Math.round(Number(beklenen.s)));
    });
  });
});
