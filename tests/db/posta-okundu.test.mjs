/*
  OKUNDU BİLGİSİ GMAIL'DEN GELİR, PANELDEN DEĞİL.

  mail_threads.okunmamis'i oturumdan değiştirmek tetikleyiciyle yasak:
  o sütun Gmail'in UNREAD etiketinin kopyası ve eşitleme her turda
  üzerine yazıyor. Panelden değiştirilebilseydi, okundu işareti en geç
  bir sonraki eşitlemede geri alınırdı — düzelmiş gibi duran, kendini
  geri alan bir hata.

  Bu yüzden "okundu yap" akışı önce Gmail'de UNREAD'i kaldırıyor, yerel
  kopyayı da service_role yazıyor (lib/posta-esitleme.ts ·
  konusmayiOkunduYap). Test iki yönü de tutuyor: oturum yazamaz,
  sunucu yazabilir.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);

const SAHIP = "00000000-0000-4000-8000-0000000009a1";
const KURUM = "00000000-0000-4000-8000-0000000009a2";
const KONUSMA = "thread-abc-123";

let db;
before(async () => {
  db = await veritabani();
  /* Posta migration'ları anlık görüntüde yok; üçü de sırayla gerekiyor
     (gelen kutusu, mail_accounts'a dayanıyor). */
  for (const ad of [
    "20261006171515_ortak_posta_kutusu.sql",
    "20261006190207_posta_gelen_kutusu.sql",
    "20261006193918_posta_gecmis_ve_crm_bagi.sql",
  ]) {
    await db.exec(fs.readFileSync(migration(ad), "utf8"));
  }
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','sahip@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code)
      values ('${KURUM}','AM','am','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role)
      values ('${KURUM}','${SAHIP}','owner');
    insert into public.mail_threads (organization_id, thread_id, konu, okunmamis, durum)
      values ('${KURUM}','${KONUSMA}','Teklif hakkında', true, 'acik');
  `);
}

const okunmamisMi = async () =>
  (await db.query(
    `select okunmamis from public.mail_threads where organization_id=$1 and thread_id=$2`,
    [KURUM, KONUSMA])).rows[0].okunmamis;

describe("posta okundu bilgisi", () => {
  test("oturum okunmamis sütununu DEĞİŞTİREMİYOR", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      await reddedilir(
        db,
        `update public.mail_threads set okunmamis = false
           where organization_id = $1 and thread_id = $2`,
        [KURUM, KONUSMA],
        /panelden değiştirilemez/i,
      );
      await rol(db, "postgres");
      assert.equal(await okunmamisMi(), true, "değer korunmalı");
    }));

  test("sunucu (service_role) okundu yapabiliyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      await db.query(
        `update public.mail_threads set okunmamis = false
           where organization_id = $1 and thread_id = $2`, [KURUM, KONUSMA]);
      await rol(db, "postgres");
      assert.equal(await okunmamisMi(), false);
    }));

  test("oturum durum ve ilgilenen kişiyi yine değiştirebiliyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      // Okundu yasağı, ekibin kendi alanlarını kapatmamalı.
      await db.query(
        `update public.mail_threads set durum = 'yanitlandi', ilgilenen_user_id = $3
           where organization_id = $1 and thread_id = $2`, [KURUM, KONUSMA, SAHIP]);
      await rol(db, "postgres");
      const r = await db.query(
        `select durum, ilgilenen_user_id from public.mail_threads
          where organization_id=$1 and thread_id=$2`, [KURUM, KONUSMA]);
      assert.deepEqual(r.rows[0], { durum: "yanitlandi", ilgilenen_user_id: SAHIP });
    }));
});
