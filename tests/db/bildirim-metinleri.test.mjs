/*
  BİLDİRİM METİNLERİ, SÖZLEŞME İMZASI, EKİP MESAJI (20261013100546).

  Sınananlar (gerçek yollardan; plpgsql sütunları yalnızca çalışma anında
  denetler — AGENTS.md):
  1. Metin katmanı: müşteri mesajı bildiriminin başlığı müşterinin adı,
     metni mesajın kendisi (send_customer_file_message üzerinden);
     talep ataması "Yeni Talep Ataması / Ad müşterisinin talebi size
     atanmıştır" (gerçek atama tetikleyicisiyle); teklif kararı
     müşterinin adıyla.
  2. Metin kurulamazsa (bozuk metadata) bildirim eski metniyle YAZILIR.
  3. Sözleşme imzaya geçince yöneticilere ve satış temsilcisine
     "Sözleşme imzalandı" düşer; imzalı sözleşmenin başka güncellemesi
     ikinci bildirim üretmez.
  4. Ekip mesajı: konuşmanın gönderen dışındaki üyesinin cihazı varsa
     sunucuya { mesaj_id } haber gider; gönderenin kendi cihazı için
     gitmez.
  5. Kuruma yayın (satış operasyona aktarıldı gibi): cihazı olan bir üye
     varsa haber gider; herkes bildirimleri kapattıysa gitmez.

  pg_net ve Vault taklit (anlik-bildirim.test.mjs ile aynı).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
// İşlevi yeniden yazan migration'lar SONDA, sırasıyla.
const MIGRATIONLAR = [
  "20261013071812_anlik_bildirim.sql",
  "20261013081415_anlik_bildirim_posta.sql",
  "20261013090223_anlik_bildirim_tercihleri.sql",
  "20261013100546_bildirim_metinleri.sql",
];

const KURUM = "00000000-0000-4000-8000-00000000d701";
const SAHIP = "00000000-0000-4000-8000-00000000d711";
const SATISCI = "00000000-0000-4000-8000-00000000d712";
const FIRSAT = "00000000-0000-4000-8000-00000000d721";
const TEKLIF = "00000000-0000-4000-8000-00000000d722";
const SOZLESME = "00000000-0000-4000-8000-00000000d723";
const KANAL = "00000000-0000-4000-8000-00000000d731";
const KOD = "BLD123";

const TAKLIT = `
create schema if not exists net;
create schema if not exists vault;
create table if not exists net.cagrilar (url text, body jsonb, headers jsonb);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$ begin insert into net.cagrilar values (url, body, headers); return 1; end $$;
create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values ('arvo_push_adres','https://app.arvo-os.com/api/push/gonder'),('arvo_push_sir','sir');
`;

let db;
let satisciId;
before(async () => {
  db = await veritabani();
  await db.exec(TAKLIT);
  for (const ad of MIGRATIONLAR) {
    await db.exec(fs.readFileSync(migration(ad), "utf8").replace(/create extension if not exists pg_net;/, ""));
  }
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','sahip@x.com'),('${SATISCI}','satis@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values ('${KURUM}','AM','am','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${SATISCI}','member');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, created_by)
      values ('${FIRSAT}', '${KURUM}', 'Tez', 'Meral Aydaç', '${SAHIP}');
    insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, access_token_hash, created_by, status)
      values ('${TEKLIF}', '${KURUM}', '${FIRSAT}', 'TKF-2026-000083', 'Tez', 'x', '${SAHIP}', 'accepted');
    insert into public.crm_contracts
      (id, organization_id, opportunity_id, proposal_id, contract_no, title, access_token_hash, amount, status, start_date, created_by, tracking_code)
      values ('${SOZLESME}', '${KURUM}', '${FIRSAT}', '${TEKLIF}', 'SOZ-2026-000051', 'Tez', 'x', 1200000, 'sent', current_date, '${SAHIP}', '${KOD}');
    insert into public.push_subscriptions (organization_id,user_id,endpoint,p256dh,auth) values
      ('${KURUM}','${SAHIP}','https://fcm.googleapis.com/fcm/send/sahip','${"B".repeat(87)}','${"a".repeat(22)}'),
      ('${KURUM}','${SATISCI}','https://fcm.googleapis.com/fcm/send/satis','${"B".repeat(87)}','${"a".repeat(22)}');
  `);
  satisciId = (await db.query(
    `insert into public.hr_employees (organization_id, user_id, full_name, employment_type, employment_status)
     values ($1, $2, 'Gizem Atar', 'full_time', 'active') returning id`, [KURUM, SATISCI])).rows[0].id;
  await db.exec(`delete from net.cagrilar; delete from public.notifications;`);
});

const bildirimler = async (kategori) => (await db.query(
  `select user_id, title, message from public.notifications where category = $1 order by created_at`, [kategori])).rows;
const cagrilar = async () => (await db.query(`select body from net.cagrilar`)).rows.map((r) => r.body);

describe("metin katmanı", () => {
  test("müşteri mesajı: başlık müşterinin adı, metin mesajın kendisi", async () =>
    islem(db, async () => {
      await db.query(`update public.crm_contracts set status = 'signed' where id = $1`, [SOZLESME]);
      await db.exec(`delete from public.notifications;`);
      await rol(db, "service_role");
      await db.query(`select public.send_customer_file_message($1, $2)`, [KOD, "Giriş kısmı ne zaman teslim edilir?"]);
      await rol(db, "postgres");
      const satirlar = await bildirimler("customer_message");
      assert.ok(satirlar.length > 0, "müşteri mesajı bildirimi yok");
      for (const s of satirlar) {
        assert.equal(s.title, "Meral Aydaç");
        assert.equal(s.message, "Giriş kısmı ne zaman teslim edilir?");
      }
    }));

  test("talep ataması gerçek tetikleyiciyle: Yeni Talep Ataması", async () =>
    islem(db, async () => {
      await db.query(`update public.crm_opportunities set assigned_employee_id = $1 where id = $2`, [satisciId, FIRSAT]);
      const [s] = await bildirimler("sales_assignment");
      assert.equal(s.user_id, SATISCI);
      assert.equal(s.title, "Yeni Talep Ataması");
      assert.equal(s.message, "Meral Aydaç müşterisinin talebi size atanmıştır.");
    }));

  test("teklif kararı müşterinin adıyla", async () =>
    islem(db, async () => {
      await db.query(
        `insert into public.notifications (organization_id,user_id,audience,category,title,message,metadata)
         values ($1,$2,'organization','proposal_customer_decision','eski','eski',
                 jsonb_build_object('proposal_id',$3::text,'proposal_no','TKF-2026-000083','decision','accept'))`,
        [KURUM, SAHIP, TEKLIF]);
      const [s] = await bildirimler("proposal_customer_decision");
      assert.equal(s.title, "Teklif onaylandı");
      assert.equal(s.message, "Müşteri Meral Aydaç, TKF-2026-000083 numaralı teklifi onayladı.");
    }));

  test("metin kurulamazsa bildirim eski metniyle yazılır", async () =>
    islem(db, async () => {
      await db.query(
        `insert into public.notifications (organization_id,user_id,audience,category,title,message,metadata)
         values ($1,$2,'organization','sales_assignment','Eski başlık','Eski metin', '{"opportunity_id":"bozuk"}')`,
        [KURUM, SAHIP]);
      const [s] = await bildirimler("sales_assignment");
      assert.equal(s.title, "Eski başlık");
      assert.equal(s.message, "Eski metin");
    }));
});

describe("sözleşme imzalandı", () => {
  test("imzaya geçişte yöneticiye ve satış temsilcisine tek bildirim", async () =>
    islem(db, async () => {
      await db.query(`update public.crm_opportunities set assigned_employee_id = $1 where id = $2`, [satisciId, FIRSAT]);
      await db.query(`update public.crm_contracts set status = 'signed' where id = $1`, [SOZLESME]);
      const satirlar = await bildirimler("contract_signed");
      assert.deepEqual(satirlar.map((s) => s.user_id).sort(), [SAHIP, SATISCI].sort());
      assert.equal(satirlar[0].message, "Müşteri Meral Aydaç, SOZ-2026-000051 numaralı sözleşmeyi imzaladı.");
      // İmzalı sözleşmede başka bir güncelleme ikinci bildirim üretmez.
      await db.query(`update public.crm_contracts set status = 'signed' where id = $1`, [SOZLESME]);
      assert.equal((await bildirimler("contract_signed")).length, 2);
    }));
});

describe("ekip mesajı", () => {
  test("alıcının cihazı varsa sunucuya mesaj kimliği gider", async () =>
    islem(db, async () => {
      await db.exec(`
        insert into public.message_channels (id, organization_id, name, created_by, channel_type, direct_key)
          values ('${KANAL}', '${KURUM}', 'Doğrudan', '${SAHIP}', 'direct', '${SAHIP}:${SATISCI}');
        insert into public.message_channel_members (channel_id, organization_id, user_id) values
          ('${KANAL}','${KURUM}','${SAHIP}'),('${KANAL}','${KURUM}','${SATISCI}');
        delete from net.cagrilar;
      `);
      const { rows } = await db.query(
        `insert into public.internal_messages (organization_id, channel_id, sender_id, body) values ($1,$2,$3,'Dosyayı attım') returning id`,
        [KURUM, KANAL, SAHIP]);
      const c = await cagrilar();
      assert.equal(c.length, 1);
      assert.equal(c[0].mesaj_id, rows[0].id);
    }));

  test("alıcı bildirimleri kapattıysa haber gitmez", async () =>
    islem(db, async () => {
      await db.exec(`
        insert into public.message_channels (id, organization_id, name, created_by, channel_type, direct_key)
          values ('${KANAL}', '${KURUM}', 'Doğrudan', '${SAHIP}', 'direct', '${SAHIP}:${SATISCI}');
        insert into public.message_channel_members (channel_id, organization_id, user_id) values
          ('${KANAL}','${KURUM}','${SAHIP}'),('${KANAL}','${KURUM}','${SATISCI}');
        insert into public.push_tercihleri (organization_id,user_id,acik) values ('${KURUM}','${SATISCI}',false);
        delete from net.cagrilar;
      `);
      await db.query(`insert into public.internal_messages (organization_id, channel_id, sender_id, body) values ($1,$2,$3,'x')`, [KURUM, KANAL, SAHIP]);
      assert.equal((await cagrilar()).length, 0);
    }));
});

describe("kuruma yayın", () => {
  test("satış operasyona aktarıldı: cihazı olan üye varsa haber gider", async () =>
    islem(db, async () => {
      await db.exec(`delete from net.cagrilar;`);
      await db.query(`insert into public.notifications (organization_id,audience,category,title,message) values ($1,'organization','crm_won_automation','t','m')`, [KURUM]);
      assert.equal((await cagrilar()).length, 1);
    }));

  test("herkes bildirimleri kapattıysa yayın gitmez", async () =>
    islem(db, async () => {
      await db.exec(`
        insert into public.push_tercihleri (organization_id,user_id,acik) values ('${KURUM}','${SAHIP}',false),('${KURUM}','${SATISCI}',false);
        delete from net.cagrilar;`);
      await db.query(`insert into public.notifications (organization_id,audience,category,title,message) values ($1,'organization','crm_won_automation','t','m')`, [KURUM]);
      assert.equal((await cagrilar()).length, 0);
    }));
});
