/*
  PANEL KABUĞU TEK ÇAĞRIDA (20261013114758).

  İşlev, panel yerleşiminin ayrı ayrı attığı okumaları tek gidiş-dönüşte
  yapıyor; SECURITY INVOKER olduğu için her parça çağıranın RLS'iyle
  çalışmalı. Sınananlar:
  1. MEŞRU yol: kurum üyesi kendi personel kaydını, lisansları, çevrimiçi
     ekibi, mesaj kanallarını ve okunmamış sayılarını alıyor.
  2. Başka kurumun verisi hiçbir parçada görünmüyor (RLS işlevin içinde
     de geçerli).
  3. Ekibe gizli görünen kişi çevrimiçi listede yok; kendi tercihim
     "kendi_gizli"de.
  4. anon çağıramaz.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
// İşlevi yeniden yazan migration SONDA (kurum simgesi alanı).
const MIGRATIONLAR = [
  // organizations.favicon_url (anlık görüntüden yeni).
  "20261012111830_sekme_simgesi.sql",
  "20261013114758_panel_kabugu_tek_cagri.sql",
  "20261013144032_panel_kabugu_kurum_simgesi.sql",
];
const KURUM = "00000000-0000-4000-8000-00000000a701";
const OTEKI = "00000000-0000-4000-8000-00000000a702";
const SAHIP = "00000000-0000-4000-8000-00000000a711";
const UYE = "00000000-0000-4000-8000-00000000a712";
const YABANCI = "00000000-0000-4000-8000-00000000a713";
const KANAL = "00000000-0000-4000-8000-00000000a731";

let db;
const kabuk = async (kim, posta = true, mesaj = true) => {
  await rol(db, "authenticated", kim);
  const { rows } = await db.query(
    `select public.arvo_panel_kabugu($1, false, $2, $3, now() - interval '3 minutes') as k`, [KURUM, posta, mesaj]);
  return rows[0].k;
};

before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','s@x.com'),('${UYE}','u@x.com'),('${YABANCI}','y@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values ('${KURUM}','AM','am','active','starter'),('${OTEKI}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${UYE}','member'),('${OTEKI}','${YABANCI}','owner');
    insert into public.hr_employees (organization_id,user_id,full_name,employment_status) values
      ('${KURUM}','${SAHIP}','Sahip Kişi','active'),('${KURUM}','${UYE}','Üye Kişi','active'),('${OTEKI}','${YABANCI}','Yabancı Kişi','active');
    insert into public.organization_product_licenses (organization_id, product, status) values ('${KURUM}','arvolab','active'),('${OTEKI}','arc','active');
    insert into public.user_presence (organization_id, user_id, session_id, last_seen_at, updated_at, gizli) values
      ('${KURUM}','${SAHIP}', gen_random_uuid(), now(), now(), false),('${KURUM}','${UYE}', gen_random_uuid(), now(), now(), true),('${OTEKI}','${YABANCI}', gen_random_uuid(), now(), now(), false);
    insert into public.message_channels (id, organization_id, name, created_by, channel_type, direct_key)
      values ('${KANAL}','${KURUM}','Doğrudan','${SAHIP}','direct','${SAHIP}:${UYE}');
    insert into public.message_channel_members (channel_id, organization_id, user_id) values ('${KANAL}','${KURUM}','${SAHIP}'),('${KANAL}','${KURUM}','${UYE}');
  `);
});

describe("panel kabuğu", () => {
  test("kurum üyesi kendi kurumunun kabuk verisini tek çağrıda alır", async () =>
    islem(db, async () => {
      const k = await kabuk(SAHIP);
      assert.equal(k.personel.full_name, "Sahip Kişi");
      assert.ok("simge" in k, "kurum simgesi alanı yok");
      assert.deepEqual(k.lisanslar, ["arvolab"]);
      assert.equal(typeof k.bildirim, "number");
      assert.equal(k.posta_okunmamis, 0);
      assert.ok(Array.isArray(k.mesaj.kanallar));
      assert.ok(Array.isArray(k.mesaj.okunmamis));
      assert.deepEqual(k.ekip.map((e) => e.full_name).sort(), ["Sahip Kişi", "Üye Kişi"]);
    }));

  test("başka kurumun verisi hiçbir parçada görünmez", async () =>
    islem(db, async () => {
      const k = await kabuk(YABANCI);
      // Yabancı bu kurumun üyesi değil: RLS her parçayı boşaltır.
      assert.equal(k.personel, null);
      assert.deepEqual(k.lisanslar, []);
      assert.deepEqual(k.varlik, []);
      assert.deepEqual(k.mesaj.kanallar, []);
      assert.ok(!JSON.stringify(k).includes("Sahip Kişi"));
    }));

  test("ekibe gizli görünen kişi çevrimiçi listede yok; kendi tercihim kendi_gizli'de", async () =>
    islem(db, async () => {
      const sahip = await kabuk(SAHIP);
      assert.deepEqual(sahip.varlik.map((v) => v.user_id), [SAHIP]);
      assert.equal(sahip.kendi_gizli, false);
      const uye = await kabuk(UYE);
      assert.equal(uye.kendi_gizli, true);
    }));

  test("posta ve mesaj istenmezse o parçalar boş/yok", async () =>
    islem(db, async () => {
      const k = await kabuk(SAHIP, false, false);
      assert.equal(k.posta_okunmamis, 0);
      assert.equal(k.mesaj, undefined);
    }));

  test("anon çağıramaz", async () =>
    islem(db, async () => {
      await rol(db, "anon");
      await reddedilir(db, `select public.arvo_panel_kabugu($1, false, true, true, now())`, [KURUM], /permission denied/);
    }));
});
