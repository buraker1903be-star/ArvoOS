/*
  E-POSTADAN AUTH KULLANICI KİMLİĞİ (davet akışının gerektirdiği arama).

  Davet edilen adres zaten kayıtlıysa, kenar fonksiyonu kişiyi kuruma
  bağlamak için kimliğini bulur. Eskiden bütün proje 200'lük sayfalarla
  taranıyor ve 20 sayfada kesiliyordu. Sınananlar:

  1. Adres büyük/küçük harf ve boşluktan bağımsız bulunuyor — davet
     formundan gelen " Ayse@Kurum.COM " ile kayıttaki adres eşleşmeli.
  2. SİLİNMİŞ hesap dönmüyor: ona üyelik yazmak kimsenin giremediği
     bir kurum kaydı demekti.
  3. İşlev tarayıcıdan çağrılamıyor — açık olsa "bu adresin hesabı var
     mı" sorusu herkese sorulabilirdi.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

/* Boş: işlev ve yetkisi anlık görüntüde (fonksiyon yetkileri dökümde
   taşınıyor). */
const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = [];

const VAR = "00000000-0000-4000-8000-00000000f1a1";
const SILINMIS = "00000000-0000-4000-8000-00000000f1a2";
const ESKI = "00000000-0000-4000-8000-00000000f1a3";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const kimlik = async (posta) => (await tek(`select public.arvo_auth_kullanici_id($1) as id`, [posta])).id;

before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email, created_at) values
      ('${VAR}','ayse@kurum.com', now() - interval '1 day'),
      ('${SILINMIS}','giden@kurum.com', now() - interval '2 days');
    update auth.users set deleted_at = now() where id = '${SILINMIS}';
    /* Aynı adresin eski bir kaydı daha olursa en ESKİSİ dönüyor:
       üyelikler ve davetler o kimliğe bağlı. */
    insert into auth.users (id, email, created_at) values
      ('${ESKI}','ikiz@kurum.com', now() - interval '10 days');
    insert into auth.users (id, email, created_at) values
      (gen_random_uuid(),'ikiz@kurum.com', now());
  `);
});

test("adres harf ve boşluktan bağımsız bulunuyor", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    assert.equal(await kimlik("ayse@kurum.com"), VAR);
    assert.equal(await kimlik("  Ayse@Kurum.COM  "), VAR, "form girdisi böyle gelebiliyor");
    assert.equal(await kimlik("yok@kurum.com"), null);
    assert.equal(await kimlik(""), null);
    assert.equal(await kimlik(null), null);
  });
});

test("silinmiş hesap dönmüyor", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    assert.equal(await kimlik("giden@kurum.com"), null);
  });
});

test("aynı adresin iki kaydı varsa en eskisi", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    assert.equal(await kimlik("ikiz@kurum.com"), ESKI);
  });
});

test("işlev tarayıcıdan çağrılamıyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", VAR);
    await reddedilir(db, `select public.arvo_auth_kullanici_id($1)`, ["ayse@kurum.com"], /permission denied/i);
  });
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select public.arvo_auth_kullanici_id($1)`, ["ayse@kurum.com"], /permission denied/i);
  });
});
