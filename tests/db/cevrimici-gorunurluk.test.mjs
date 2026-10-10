/*
  EKİBE ÇEVRİMDIŞI GÖRÜNME — kim kendi görünürlüğünü değiştirebilir.

  Tercih kişinin kendi user_presence satırında. Başkasının satırını
  değiştirebilmek, bir kişinin bir başkasını ekipten gizlemesi ya da
  gizlenmiş birini görünür yapması demek olurdu; RLS'in presence_update_own
  politikası buna zaten izin vermiyor, test onu sabitliyor.

  İşaret son görülmeyi SİLMİYOR: yöneticinin personel ekranı gerçek
  durumu göstermeye devam ediyor (panelde de böyle yazıyor).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);

const KURUM = "00000000-0000-4000-8000-00000000f0a1";
const SAHIP = "00000000-0000-4000-8000-00000000f0b1";
const PERSONEL = "00000000-0000-4000-8000-00000000f0b2";

let db;
before(async () => {
  db = await veritabani();
  // Yeni sütun anlık görüntüye girene kadar buradan kuruluyor.
  await db.exec(fs.readFileSync(migration("20261010014752_cevrimici_gorunurlugu.sql"), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','sahip@x.com'),('${PERSONEL}','personel@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code)
      values ('${KURUM}','AM','am','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role)
      values ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${PERSONEL}','member');
    insert into public.user_presence (organization_id,user_id,session_id,last_seen_at,updated_at)
      values ('${KURUM}','${SAHIP}',gen_random_uuid(),now(),now()),
             ('${KURUM}','${PERSONEL}',gen_random_uuid(),now(),now());
  `);
});

describe("çevrimiçi görünürlüğü", () => {
  test("varsayılan görünür", async () => {
    await rol(db, "postgres");
    const { rows } = await db.query(`select gizli from public.user_presence where user_id = $1`, [PERSONEL]);
    assert.equal(rows[0].gizli, false, "yeni satır gizli başlıyor");
  });

  test("kişi KENDİ görünürlüğünü değiştirebiliyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", PERSONEL);
      const { rows } = await db.query(
        `update public.user_presence set gizli = true where user_id = $1 returning gizli`, [PERSONEL]);
      await rol(db, "postgres");
      assert.deepEqual(rows.map((r) => r.gizli), [true]);
    }));

  test("BAŞKASININ görünürlüğünü değiştiremiyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", PERSONEL);
      /* RLS satırı eliyor: hata değil, hiçbir satır güncellenmiyor. */
      const { rows } = await db.query(
        `update public.user_presence set gizli = true where user_id = $1 returning gizli`, [SAHIP]);
      await rol(db, "postgres");
      assert.equal(rows.length, 0, "personel kurum sahibini gizleyebiliyor");
      const { rows: sonra } = await db.query(`select gizli from public.user_presence where user_id = $1`, [SAHIP]);
      assert.equal(sonra[0].gizli, false);
    }));

  test("gizlenen kişinin son görülmesi silinmiyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", PERSONEL);
      await db.query(`update public.user_presence set gizli = true where user_id = $1`, [PERSONEL]);
      await rol(db, "postgres");
      const { rows } = await db.query(
        `select gizli, last_seen_at is not null as gorulme from public.user_presence where user_id = $1`, [PERSONEL]);
      assert.deepEqual([rows[0].gizli, rows[0].gorulme], [true, true],
        "görünürlük tercihi yönetim kaydını da siliyor");
    }));
});
