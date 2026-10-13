/*
  PANEL BAĞLAMI TEK ÇAĞRIDA (20261013121621).

  1. MEŞRU yol: üye, çalışma alanlarını, kurumun açık modüllerini ve
     yetki kurallarını (rol + kendi istisnası) tek çağrıda alır.
  2. Başkasının kişi istisnası dönmez (yalnızca çağıranın).
  3. Üyesi olmadığı kurumu sorarsa kural parçaları boş döner (RLS);
     çalışma alanları yalnızca kendi kurumları.
  4. anon çağıramaz.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20261013121621_panel_baglami_tek_cagri.sql");
const KURUM = "00000000-0000-4000-8000-000000008701";
const OTEKI = "00000000-0000-4000-8000-000000008702";
const SAHIP = "00000000-0000-4000-8000-000000008711";
const UYE = "00000000-0000-4000-8000-000000008712";
const YABANCI = "00000000-0000-4000-8000-000000008713";

let db;
const baglam = async (kim, org) => {
  await rol(db, "authenticated", kim);
  return (await db.query(`select public.arvo_panel_baglami($1) as b`, [org])).rows[0].b;
};

before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','s@x.com'),('${UYE}','u@x.com'),('${YABANCI}','y@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values ('${KURUM}','AM','am','active','starter'),('${OTEKI}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${UYE}','member'),('${OTEKI}','${YABANCI}','owner');
    insert into public.arvo_modules (code,name,description,sort_order,is_active) values ('crm','CRM','',1,true) on conflict (code) do nothing;
    insert into public.organization_modules (organization_id,module_code,is_enabled) values ('${KURUM}','crm',true) on conflict do nothing;
    insert into public.role_capability_permissions (organization_id, role, capability_key, allowed) values ('${KURUM}','member','crm.teklif.sil',false);
    insert into public.member_capability_permissions (organization_id, user_id, capability_key, allowed) values
      ('${KURUM}','${UYE}','crm.teklif.sil',true),('${KURUM}','${SAHIP}','posta.gor',false);
  `);
});

describe("panel bağlamı", () => {
  test("üye çalışma alanını, modülleri ve kurallarını tek çağrıda alır", async () =>
    islem(db, async () => {
      const b = await baglam(UYE, KURUM);
      assert.deepEqual(b.calisma_alanlari.map((w) => w.organization_id), [KURUM]);
      assert.ok(b.moduller.some((m) => m.module_code === "crm"));
      assert.ok(b.rol_yetki.some((r) => r.role === "member" && r.capability_key === "crm.teklif.sil" && r.allowed === false));
      assert.deepEqual(b.kisi_yetki, [{ capability_key: "crm.teklif.sil", allowed: true }], "yalnızca kendi istisnası dönmeli");
    }));

  test("üyesi olmadığı kurumun kuralları dönmez", async () =>
    islem(db, async () => {
      const b = await baglam(YABANCI, KURUM);
      assert.deepEqual(b.calisma_alanlari.map((w) => w.organization_id), [OTEKI]);
      assert.deepEqual(b.rol_yetki, []);
      assert.deepEqual(b.kisi_yetki, []);
      assert.deepEqual(b.moduller, []);
    }));

  test("anon çağıramaz", async () =>
    islem(db, async () => {
      await rol(db, "anon");
      await reddedilir(db, `select public.arvo_panel_baglami($1)`, [KURUM], /permission denied/);
    }));
});
