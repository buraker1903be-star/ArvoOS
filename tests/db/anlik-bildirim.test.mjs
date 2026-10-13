/*
  ANLIK BİLDİRİM (20261013071812).

  Sınananlar:
  1. MEŞRU yol: kişiye özel bildirim açılınca, kişinin cihazı ve Vault
     sırları varsa sunucuya TEK haber gidiyor (adres, sır, bildirim kimliği).
  2. Kuruma yayın (user_id boş), cihazı olmayan kişi, Vault'ta sır yok:
     haber gitmiyor.
  3. Haber verilemezse (pg_net hata fırlatıyor) bildirimin KENDİSİ yine
     yazılıyor — tetikleyici hiçbir durumda bildirimi düşürmez.
  4. Cihaz kayıtları istemciye kapalı: authenticated ve anon okuyamıyor.
  5. Gelen posta (kuruma yayın, posta_gelen): yalnızca kurumda postayı
     açmış (kişi tercihi, 20261013090223) ve cihazı olan biri varsa haber
     gider; başka yayınlar hiç.
  6. Kişi bildirimleri kapattıysa (tercih acik = false) kişiye özel
     bildirim de, gelen posta da gitmez — ayar bütün cihazlarında geçerli.

  pg_net ve Vault test düzeneğinde yok: en küçük taklitleri burada
  kuruluyor; net.http_post çağrıları bir tabloya yazılıyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
// İşlevi yeniden yazan migration'lar SONDA, sırasıyla.
const MIGRATIONLAR = [
  "20261013071812_anlik_bildirim.sql",
  "20261013081415_anlik_bildirim_posta.sql",
  "20261013090223_anlik_bildirim_tercihleri.sql",
];

const KURUM = "00000000-0000-4000-8000-00000000e701";
const SAHIP = "00000000-0000-4000-8000-00000000e711";
const PERSONEL = "00000000-0000-4000-8000-00000000e712";

const TAKLIT = `
create schema if not exists net;
create schema if not exists vault;
create table if not exists net.cagrilar (url text, body jsonb, headers jsonb);
create table if not exists net.ayar (bozuk boolean not null default false);
insert into net.ayar values (false);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$
begin
  if (select bozuk from net.ayar limit 1) then raise exception 'pg_net kapalı'; end if;
  insert into net.cagrilar values (url, body, headers);
  return 1;
end $$;
create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
`;

let db;
before(async () => {
  db = await veritabani();
  // Gerçek eklenti yok; migration'daki "create extension" satırı taklitte atlanır.
  await db.exec(TAKLIT);
  for (const ad of MIGRATIONLAR) {
    const sql = fs.readFileSync(migration(ad), "utf8").replace(/create extension if not exists pg_net;/, "");
    await db.exec(sql);
  }
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','sahip@x.com'),('${PERSONEL}','saha@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values ('${KURUM}','AM','am','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${PERSONEL}','operasyoncu');
    insert into public.push_subscriptions (organization_id,user_id,endpoint,p256dh,auth)
      values ('${KURUM}','${PERSONEL}','https://fcm.googleapis.com/fcm/send/abc','${"B".repeat(87)}','${"a".repeat(22)}');
  `);
});

const sirlariKur = () => db.exec(`
  insert into vault.decrypted_secrets values ('arvo_push_adres','https://app.arvo-os.com/api/push/gonder'),('arvo_push_sir','gizli-sir')
  on conflict (name) do nothing;`);
const bildirimAc = (kime, kategori = "operation") => db.query(
  `insert into public.notifications (organization_id,user_id,audience,category,title,message,action_url)
   values ($1,$2,'organization',$3,'Yeni iş','Size iş atandı','/panel/operations') returning id`, [KURUM, kime, kategori]);
const cagrilar = async () => (await db.query(`select url, body, headers from net.cagrilar`)).rows;

describe("meşru yol", () => {
  test("kişiye özel bildirim + kayıtlı cihaz + sırlar: sunucuya tek haber", async () =>
    islem(db, async () => {
      await sirlariKur();
      const { rows } = await bildirimAc(PERSONEL);
      const c = await cagrilar();
      assert.equal(c.length, 1);
      assert.equal(c[0].url, "https://app.arvo-os.com/api/push/gonder");
      assert.equal(c[0].body.id, rows[0].id);
      assert.equal(c[0].headers.Authorization, "Bearer gizli-sir");
    }));
});

describe("haber gitmeyen durumlar", () => {
  test("kuruma yayın (user_id boş) push'a gitmez", async () =>
    islem(db, async () => {
      await sirlariKur();
      await bildirimAc(null);
      assert.equal((await cagrilar()).length, 0);
    }));

  test("cihazı olmayan kişi için istek atılmaz", async () =>
    islem(db, async () => {
      await sirlariKur();
      await bildirimAc(SAHIP);
      assert.equal((await cagrilar()).length, 0);
    }));

  test("Vault'ta sır yoksa hiçbir şey yapılmaz", async () =>
    islem(db, async () => {
      await bildirimAc(PERSONEL);
      assert.equal((await cagrilar()).length, 0);
    }));

  test("pg_net hata verse de bildirim yazılır", async () =>
    islem(db, async () => {
      await sirlariKur();
      await db.exec(`update net.ayar set bozuk = true`);
      const { rows } = await bildirimAc(PERSONEL);
      const yazilan = await db.query(`select 1 from public.notifications where id = $1`, [rows[0].id]);
      assert.equal(yazilan.rows.length, 1, "haber verilemeyince bildirim de düştü");
    }));
});

const postaAc = () => db.exec(`insert into public.push_tercihleri (organization_id,user_id,posta) values ('${KURUM}','${PERSONEL}',true)
  on conflict (organization_id,user_id) do update set posta = true`);
const bildirimleriKapat = () => db.exec(`insert into public.push_tercihleri (organization_id,user_id,acik) values ('${KURUM}','${PERSONEL}',false)
  on conflict (organization_id,user_id) do update set acik = false`);

describe("kişi tercihi bütün cihazlarda", () => {
  test("bildirimleri kapatan kişiye kişiye özel bildirim gitmez", async () =>
    islem(db, async () => {
      await sirlariKur();
      await bildirimleriKapat();
      await bildirimAc(PERSONEL);
      assert.equal((await cagrilar()).length, 0);
    }));

  test("bildirimleri kapatan kişi postayı açık bıraksa da gelen posta gitmez", async () =>
    islem(db, async () => {
      await sirlariKur();
      await postaAc();
      await bildirimleriKapat();
      await bildirimAc(null, "posta_gelen");
      assert.equal((await cagrilar()).length, 0);
    }));

  test("tercihler istemciye kapalı", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", PERSONEL);
      await reddedilir(db, `select 1 from public.push_tercihleri`, [], /permission denied/);
    }));
});

describe("gelen posta (kişi kendisi açarsa)", () => {
  test("anahtar kapalıyken gelen posta haber vermez", async () =>
    islem(db, async () => {
      await sirlariKur();
      await bildirimAc(null, "posta_gelen");
      assert.equal((await cagrilar()).length, 0);
    }));

  test("bir cihazda anahtar açıksa gelen posta tek haber verir", async () =>
    islem(db, async () => {
      await sirlariKur();
      await postaAc();
      const { rows } = await bildirimAc(null, "posta_gelen");
      const c = await cagrilar();
      assert.equal(c.length, 1);
      assert.equal(c[0].body.id, rows[0].id);
    }));

  test("anahtar açık olsa da posta dışındaki yayın (eşitleme durumu) gitmez", async () =>
    islem(db, async () => {
      await sirlariKur();
      await postaAc();
      await bildirimAc(null, "posta_esitleme");
      assert.equal((await cagrilar()).length, 0);
    }));
});

describe("cihaz kayıtları istemciye kapalı", () => {
  test("authenticated kendi kaydını bile okuyamaz; anon hiç", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", PERSONEL);
      await reddedilir(db, `select 1 from public.push_subscriptions`, [], /permission denied/);
    }));
  test("anon okuyamaz", async () =>
    islem(db, async () => {
      await rol(db, "anon");
      await reddedilir(db, `select 1 from public.push_subscriptions`, [], /permission denied/);
    }));
});
