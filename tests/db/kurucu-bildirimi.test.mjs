/*
  KURUCU BİLDİRİMLERİ (audience = 'founder').

  Kanal baştan beri kuruluydu — RLS, zil rozeti, canlı akış, liste ekranı,
  okundu işaretleme — ama hiçbir yer satır YAZMIYORDU; zil hep boştu. İlk
  üretici zamanlanmış iş nöbeti (lib/cron-kaydi): duran bir eşitleme işini
  kurucuya bildiriyor. Kanalın hiç akış testi de yoktu.

  Sınananlar:
  1. organization_id ve user_id BOŞ bir kurucu bildirimi yazılabiliyor
     (ikisi de nullable ama FK'lı; kurucu bildirimi hiçbir kiracıya ait
     değil).
  2. KAPSAM: kurucu okuyor, kiracının kendi yöneticisi OKUMUYOR, anon
     hiç. Kurucuya özel satırın kiracıya görünmesi, sistemin iç
     işleyişini müşteriye anlatmak olurdu.
  3. Gün anahtarıyla tekrar engeli: nöbetin kullandığı
     `metadata->>anahtar` süzgeci satırı buluyor. Posta eşitlemesi iki
     dakikada bir koşuyor; anahtarsız bir uyarı aynı arızayı günde 720
     kez bildirirdi.
  4. audience denetimi tanımadığı değeri reddediyor.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const ARVO = "00000000-0000-4000-8000-00000000d0a1";
const KIRACI = "00000000-0000-4000-8000-00000000d0a2";
const KURUCU = "00000000-0000-4000-8000-00000000d0b1";
const KIRACI_YONETICI = "00000000-0000-4000-8000-00000000d0b2";

const ANAHTAR = "cron:/api/cron/posta-esitleme:gecikti:2026-10-14";

let db;

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${KURUCU}','kurucu@arvo-os.com'),('${KIRACI_YONETICI}','yonetici@kiraci.com');
    insert into public.plans (code, name, description) values ('professional','P','');
    /* Kurucu kontrolü slug'a bakıyor: 'arvo-os' kurumunun owner'ı. */
    insert into public.organizations (id,name,slug,status,plan_code,kind) values
      ('${ARVO}','ArvoOS','arvo-os','active','professional','internal'),
      ('${KIRACI}','Akademik Merkez','akademik','active','professional','customer');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values
      ('${ARVO}','${KURUCU}','owner',true),
      ('${KIRACI}','${KIRACI_YONETICI}','owner',true);

    /* Nöbetin yazdığı satırın birebir aynısı. */
    insert into public.notifications (organization_id, user_id, audience, category, title, message, action_url, metadata)
    values (
      null, null, 'founder', 'cron_gecikti',
      'Posta eşitlemesi gecikti',
      'Durursa ortak kutulara gelen e-posta panele düşmez. Beklenen: 2 dakikada bir. En son başarılı koşma 3 saat önce.',
      '/panel/platform/saglik',
      '{"anahtar":"${ANAHTAR}","yol":"/api/cron/posta-esitleme","durum":"gecikti","aralik_dk":2}'::jsonb
    );

    /* Karşılaştırma için kiracının kendi bildirimi. */
    insert into public.notifications (organization_id, user_id, audience, category, title, message, metadata)
    values ('${KIRACI}', null, 'organization', 'subscription_reminder', 'Dönem bitiyor', 'Üç gün kaldı.', '{}'::jsonb);
  `);
});

test("kurumsuz ve kişisiz kurucu bildirimi yazılabiliyor", async () => {
  await rol(db, "postgres");
  const { rows } = await db.query(
    `select organization_id, user_id, audience, action_url, metadata->>'anahtar' as anahtar
       from public.notifications where audience = 'founder'`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].organization_id, null, "kurucu bildirimi hiçbir kiracıya ait değil");
  assert.equal(rows[0].user_id, null);
  assert.equal(rows[0].action_url, "/panel/platform/saglik");
  assert.equal(rows[0].anahtar, ANAHTAR);
});

test("kurucu okuyor, kiracının yöneticisi kurucu satırını görmüyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const { rows } = await db.query(`select category, audience from public.notifications order by audience`);
    const kurucuSatiri = rows.filter((r) => r.audience === "founder");
    assert.equal(kurucuSatiri.length, 1, "kurucu kendi kanalını okuyor");
    assert.equal(kurucuSatiri[0].category, "cron_gecikti");
  });

  await islem(db, async () => {
    await rol(db, "authenticated", KIRACI_YONETICI);
    const { rows } = await db.query(`select audience from public.notifications`);
    assert.ok(rows.length > 0, "kiracı kendi bildirimini görüyor");
    assert.ok(
      rows.every((r) => r.audience === "organization"),
      "kiracıya kurucu kanalından satır sızmıyor",
    );
  });
});

test("anon hiçbir bildirimi okumuyor", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    const { rows } = await db.query(`select id from public.notifications`);
    assert.equal(rows.length, 0);
  });
});

/*
  Nöbetin tekrar engeli bu süzgeçle çalışıyor. Anahtar gün içeriyor: aynı
  arıza ertesi gün yeniden bildirilir (sorun sürüyorsa kurucu her gün bir
  kez hatırlatılmalı), gün içinde bir kez.
*/
test("gün anahtarı süzgeci satırı buluyor; başka günün anahtarı bulmuyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const bul = async (anahtar) => (await db.query(
      `select id from public.notifications
        where audience = 'founder' and category = 'cron_gecikti' and metadata->>'anahtar' = $1 limit 1`,
      [anahtar],
    )).rows.length;
    assert.equal(await bul(ANAHTAR), 1);
    assert.equal(await bul("cron:/api/cron/posta-esitleme:gecikti:2026-10-15"), 0, "ertesi gün yeniden bildirilir");
    assert.equal(await bul("cron:/api/cron/arc-sync:gecikti:2026-10-14"), 0, "başka işin anahtarı ayrı");
  });
});

test("tanınmayan audience reddediliyor", async () => {
  await islem(db, async () => {
    await rol(db, "postgres");
    await reddedilir(
      db,
      `insert into public.notifications (audience, category, title, message, metadata)
         values ('platform', 'cron_gecikti', 'x', 'y', '{}'::jsonb)`,
      [],
      /audience_check|constraint/i,
    );
  });
});
