/*
  ÜYELİK GÜNCELLEME POLİTİKASI.

  organization_memberships'te RLS açıktı ama tabloda yalnızca SELECT
  politikası vardı: panelden rol değiştirmek ve "erişimi kapat" demek
  HİÇBİR satıra dokunmuyordu — Kurum Sahibi'nin oturumunda bile. Bu
  dosya hem o deliği hem de yeni politikanın sınırlarını sabitliyor.

  Sınananlar:
  0. Yönetici kurumun BÜTÜN üyeliklerini okuyabiliyor (yetkilendirme
     ekranının kişi listesi bundan besleniyor), sıradan personel
     yalnızca kendi satırını.
  1. Kurum Sahibi rol değiştirebiliyor ve erişimi kapatabiliyor.
  2. Yönetici de değiştirebiliyor AMA Kurum Sahibi satırına
     dokunamıyor ve kimseyi (kendisi dahil) Kurum Sahibi yapamıyor.
  3. Sıradan personel kimsenin rolünü değiştiremiyor.
  4. Başka kurumun yöneticisi hiç dokunamıyor.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261011224845_uyelik_guncelleme_politikasi.sql"];

const KURUM = "00000000-0000-4000-8000-00000000f2a1";
const BASKA = "00000000-0000-4000-8000-00000000f2a2";
const SAHIP = "00000000-0000-4000-8000-00000000f2b1";
const YONETICI = "00000000-0000-4000-8000-00000000f2b2";
const UZMAN = "00000000-0000-4000-8000-00000000f2b3";
const YABANCI_YONETICI = "00000000-0000-4000-8000-00000000f2b4";

let db;
const rolu = async (kullanici) => (await db.query(
  `select role::text as rol, is_active from public.organization_memberships where organization_id = $1 and user_id = $2`,
  [KURUM, kullanici],
)).rows[0];
const degistir = async (hedef, yeniRol) => (await db.query(
  `update public.organization_memberships set role = $3 where organization_id = $1 and user_id = $2 returning user_id`,
  [KURUM, hedef, yeniRol],
)).rows.length;

before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${SAHIP}','sahip@x.com'),('${YONETICI}','yonetici@x.com'),
      ('${UZMAN}','uzman@x.com'),('${YABANCI_YONETICI}','yabanci@x.com');
    insert into public.plans (code, name, description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','AM','am','active','starter'),('${BASKA}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${YONETICI}','admin'),
      ('${KURUM}','${UZMAN}','operasyoncu'),('${BASKA}','${YABANCI_YONETICI}','admin');
  `);
});

test("yönetici bütün üyelikleri okuyor, personel yalnızca kendisini", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", YONETICI);
    const adet = (await db.query(
      `select count(*)::int as adet from public.organization_memberships where organization_id = $1`, [KURUM],
    )).rows[0].adet;
    assert.equal(adet, 3, "yetkilendirme ekranının kişi listesi bundan besleniyor");
  });
  await islem(db, async () => {
    await rol(db, "authenticated", UZMAN);
    const satirlar = (await db.query(`select user_id from public.organization_memberships`)).rows;
    assert.deepEqual(satirlar.map((s) => s.user_id), [UZMAN], "personel başkasının rolünü görmüyor");
  });
});

test("Kurum Sahibi rol değiştirip erişimi kapatabiliyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    assert.equal(await degistir(UZMAN, "manager"), 1, "politika yoktu, 0 satır dönüyordu");
    assert.equal((await rolu(UZMAN)).rol, "manager");
    const kapatilan = (await db.query(
      `update public.organization_memberships set is_active = false
       where organization_id = $1 and user_id = $2 returning user_id`, [KURUM, UZMAN],
    )).rows.length;
    assert.equal(kapatilan, 1, "erişimi kapatmak da aynı politikadan geçiyor");
  });
});

test("Yönetici müdür atayabiliyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", YONETICI);
    assert.equal(await degistir(UZMAN, "manager"), 1);
    assert.equal((await rolu(UZMAN)).rol, "manager");
  });
});

test("Yönetici Kurum Sahibi satırına dokunamıyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", YONETICI);
    /* Eskiden bu koruma yalnızca TypeScript'teydi; API'den doğrudan
       gelen istek için hiçbir engel yoktu. */
    assert.equal(await degistir(SAHIP, "member"), 0, "sahibi düşürmek engellendi");
    await rol(db, "postgres");
    assert.equal((await rolu(SAHIP)).rol, "owner");
  });
});

test("Yönetici kimseyi Kurum Sahibi yapamıyor — kendisi dahil", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", YONETICI);
    /*
      Burada politika DEĞİL, tetikleyici konuşuyor: owner vermeye
      çalışmak sessizce süzülmüyor, açık bir hata fırlatıyor
      (private.arvo_guard_owner_role sınıfı). Politikanın with check'i
      aynı kuralın ikinci katmanı — tetikleyici kaldırılsa bile satır
      yazılmaz. Test hangisinin konuştuğunu değil, SONUCU sabitliyor.
    */
    await reddedilir(db, `update public.organization_memberships set role = 'owner'
                          where organization_id = $1 and user_id = $2`, [KURUM, UZMAN],
      /Kurum Sahibi yetkisi yalnızca bir Kurum Sahibi/i);
    await reddedilir(db, `update public.organization_memberships set role = 'owner'
                          where organization_id = $1 and user_id = $2`, [KURUM, YONETICI],
      /Kurum Sahibi yetkisi yalnızca bir Kurum Sahibi/i);
    await rol(db, "postgres");
    assert.equal((await rolu(UZMAN)).rol, "operasyoncu");
    assert.equal((await rolu(YONETICI)).rol, "admin");
  });
});

test("sıradan personel ve başka kurumun yöneticisi hiç dokunamıyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", UZMAN);
    assert.equal(await degistir(YONETICI, "member"), 0);
  });
  await islem(db, async () => {
    await rol(db, "authenticated", YABANCI_YONETICI);
    assert.equal(await degistir(UZMAN, "manager"), 0, "kurum sınırı");
  });
});
