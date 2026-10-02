/*
  KİŞİ BAZLI YETKİ İSTİSNALARI — veritabanı tarafı.

  Yetkiyi panelde hesaplıyoruz (lib/yetkiler.ts) ama kuralların yazıldığı
  tablolar müşteri tarayıcısındaki oturumla doğrudan yazılabiliyor: kapıyı
  RLS tutmak zorunda. Burada sınanan üç şey:

   1. İstisnayı yalnızca Kurum Sahibi / Yönetici yazabilir. Satış personeli
      kendi satırını yazabilseydi yetkilendirme sistemi anlamsızdı.
   2. Kurum Sahibi kısıtlanamaz: 'owner' rolüne kural yazılamaz (kod da
      atlıyor, kısıt kodun atlanabildiği yolu kapatıyor).
   3. İstisna yalnızca kurumun KENDİ üyesine yazılabilir. RLS yazarın
      yetkisini denetliyor ama hedefi denetlemiyordu; başka kurumun
      kullanıcı kimliği user_id olarak yazılabiliyordu.

  Meşru akış da sınanıyor: personel KENDİ satırlarını okuyabilmeli, yoksa
  panel her istekte kendi yetkisini okuyamaz ve kimse içeri giremez.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, olarak, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20261002173447_kisi_bazli_yetki.sql");

const KURUM = "00000000-0000-4000-8000-0000000004a1";
const BASKA_KURUM = "00000000-0000-4000-8000-0000000004a2";
const SAHIP = "00000000-0000-4000-8000-0000000004b1";
const YONETICI = "00000000-0000-4000-8000-0000000004b2";
const PERSONEL = "00000000-0000-4000-8000-0000000004b3";
const YABANCI = "00000000-0000-4000-8000-0000000004b4";

let db;
before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${SAHIP}','sahip@y.com'),('${YONETICI}','yonetici@y.com'),
      ('${PERSONEL}','personel@y.com'),('${YABANCI}','yabanci@z.com');
    insert into public.plans (code,name,description) values ('starter','Başlangıç','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','Akademik Merkez','akademik-merkez','active','starter'),
      ('${BASKA_KURUM}','Başka Firma','baska-firma','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),
      ('${KURUM}','${YONETICI}','admin'),
      ('${KURUM}','${PERSONEL}','member'),
      ('${BASKA_KURUM}','${YABANCI}','member');
  `);
});

const yaz = (userId, key, allowed) =>
  db.query(
    `insert into public.member_capability_permissions (organization_id,user_id,capability_key,allowed)
     values ($1,$2,$3,$4)`,
    [KURUM, userId, key, allowed],
  );

describe("kişi bazlı yetki istisnaları", () => {
  test("yönetici personele istisna yazabilir, personel yazamaz", async () => {
    await olarak(db, "authenticated", YONETICI, async () => {
      await yaz(PERSONEL, "crm.takvim.tum", true);
    });

    await olarak(db, "authenticated", PERSONEL, async () => {
      // Kendi yetkisini kendisi açamaz; açabilseydi sistem anlamsız olurdu.
      await reddedilir(
        db,
        `insert into public.member_capability_permissions (organization_id,user_id,capability_key,allowed)
         values ($1,$2,'crm.teklif.sil',true)`,
        [KURUM, PERSONEL],
        /row-level security/i,
      );
    });
  });

  test("personel kendi satırını okur, başkasının satırını okumaz", async () => {
    await rol(db, "postgres");
    await yaz(PERSONEL, "crm.musteri.sorgula", false);
    await yaz(YONETICI, "hr.prim.gor", false);

    await olarak(db, "authenticated", PERSONEL, async () => {
      const { rows } = await db.query(
        `select user_id from public.member_capability_permissions where organization_id = $1`,
        [KURUM],
      );
      // Panel her istekte kendi yetkisini okumak zorunda: bu satır gelmeli.
      assert.ok(rows.length >= 1, "kendi istisnasını okuyamıyor");
      assert.ok(rows.every((satir) => satir.user_id === PERSONEL), "başkasının istisnası görünüyor");
    });

    await olarak(db, "authenticated", YONETICI, async () => {
      const { rows } = await db.query(
        `select user_id from public.member_capability_permissions where organization_id = $1`,
        [KURUM],
      );
      const kisiler = new Set(rows.map((satir) => satir.user_id));
      assert.ok(kisiler.has(PERSONEL) && kisiler.has(YONETICI), "yönetici ekibin tamamını görmeli");
    });
  });

  test("kurum sahibi rolüne kural yazılamaz", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await reddedilir(
        db,
        `insert into public.role_capability_permissions (organization_id,role,capability_key,allowed)
         values ($1,'owner','crm.teklif.sil',false)`,
        [KURUM],
        /owner_serbest|check/i,
      );
    });
  });

  test("istisna başka kurumun kullanıcısına yazılamaz", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await reddedilir(
        db,
        `insert into public.member_module_permissions (organization_id,user_id,module_key,can_access)
         values ($1,$2,'crm',false)`,
        [KURUM, YABANCI],
        /kurumun kendi üyesine/i,
      );
    });
  });

  test("rol kuralları kurumun her aktif üyesine açık", async () => {
    await rol(db, "postgres");
    await db.query(
      `insert into public.role_capability_permissions (organization_id,role,capability_key,allowed)
       values ($1,'member','crm.teklif.yonet',true)`,
      [KURUM],
    );
    await olarak(db, "authenticated", PERSONEL, async () => {
      const { rows } = await db.query(
        `select allowed from public.role_capability_permissions
          where organization_id = $1 and role = 'member' and capability_key = 'crm.teklif.yonet'`,
        [KURUM],
      );
      assert.equal(rows.length, 1, "panel kendi rolünün kuralını okuyamıyor");
      assert.equal(rows[0].allowed, true);
    });
  });
});
