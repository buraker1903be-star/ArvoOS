/*
  SÜRESİ DOLAN AKTİF LİSANS GECİKMİŞ OLUR (20261014071519).

  Sınananlar:
  1. Dönem sonu geçmiş 'active' lisans (çekirdek ve ürün) 'past_due'.
  2. Dönemi süren aktif, dönem sonu boş aktif ve DENEME lisanslarına
     dokunulmuyor (denemeyi çekmek ürünlerde açık denemeleri kapatırdı).
  3. Kendi kurumumuz (internal) dokunulmuyor.
  4. Dönen liste eşitlenecek ürün lisanslarını bildiriyor.
  5. Kiracı (authenticated) ve anon çağıramıyor.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = [
  "20261014071519_suresi_dolan_gecikmise.sql",
];

const BITMIS = "00000000-0000-4000-8000-00000000e101";
const SUREN = "00000000-0000-4000-8000-00000000e102";
const DENEME = "00000000-0000-4000-8000-00000000e103";
const SURESIZ = "00000000-0000-4000-8000-00000000e104";
const IC = "00000000-0000-4000-8000-00000000e105";
const KISI = "00000000-0000-4000-8000-00000000e111";

let db;
const durum = async (kurum) => (await db.query(`select license_status as d from public.organization_licenses where organization_id = $1`, [kurum])).rows[0]?.d;
const urunDurumu = async (kurum, urun) => (await db.query(`select status as d from public.organization_product_licenses where organization_id = $1 and product = $2`, [kurum, urun])).rows[0]?.d;

before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${KISI}','k@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code,kind) values
      ('${BITMIS}','Bitmiş','bitmis','active','starter','customer'),
      ('${SUREN}','Süren','suren','active','starter','customer'),
      ('${DENEME}','Deneme','deneme','trial','starter','customer'),
      ('${SURESIZ}','Süresiz','suresiz','active','starter','customer'),
      ('${IC}','Arvo','arvo-os','active','starter','internal');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values ('${BITMIS}','${KISI}','owner',true);
  `);
  // Lisans satırı kurum açılınca tetikleyiciyle oluşuyor; durumu burada sabitliyoruz.
  for (const [kurum, d, son, deneme] of [
    [BITMIS, "active", "now() - interval '2 days'", "null"],
    [SUREN, "active", "now() + interval '10 days'", "null"],
    [DENEME, "trialing", "null", "now() - interval '3 days'"],
    [SURESIZ, "active", "null", "null"],
    [IC, "active", "now() - interval '5 days'", "null"],
  ]) {
    const { rows: guncellenen } = await db.query(`update public.organization_licenses set license_status = $2, current_period_end = ${son}, trial_ends_at = ${deneme} where organization_id = $1 returning 1`, [kurum, d]);
    assert.equal(guncellenen.length, 1, "kurum açılınca lisans satırı oluşmalı (create_default_organization_license)");
  }
  await db.exec(`
    insert into public.organization_product_licenses (organization_id, product, status, current_period_end) values
      ('${BITMIS}','arvolab','active', now() - interval '1 day'),
      ('${SUREN}','arc','active', now() + interval '5 days'),
      ('${DENEME}','randevu','trialing', null);
  `);
});

test("dönemi bitmiş aktif lisans gecikmiş olur; ötekilere dokunulmaz", async () =>
  islem(db, async () => {
    await rol(db, "service_role");
    const { rows: [{ s }] } = await db.query(`select public.platform_gecikenleri_isaretle() as s`);
    await rol(db, "postgres");
    assert.equal(await durum(BITMIS), "past_due");
    assert.equal(await urunDurumu(BITMIS, "arvolab"), "past_due");
    assert.equal(await durum(SUREN), "active");
    assert.equal(await urunDurumu(SUREN, "arc"), "active");
    assert.equal(await durum(DENEME), "trialing", "deneme durumu değişmemeli (ürünlerde erişimi keserdi)");
    assert.equal(await urunDurumu(DENEME, "randevu"), "trialing");
    assert.equal(await durum(SURESIZ), "active");
    assert.equal(await durum(IC), "active", "kendi kurumumuz işaretlenmemeli");
    assert.deepEqual(s.cekirdek, [BITMIS]);
    assert.deepEqual(s.urun, [{ organization_id: BITMIS, product: "arvolab" }]);
  }));

test("kiracı ve anon çağıramaz", async () =>
  islem(db, async () => {
    await rol(db, "authenticated", KISI);
    await reddedilir(db, `select public.platform_gecikenleri_isaretle()`, [], /permission denied/);
    await rol(db, "anon");
    await reddedilir(db, `select public.platform_gecikenleri_isaretle()`, [], /permission denied/);
  }));
