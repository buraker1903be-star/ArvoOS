/*
  BİLDİRİM LİSTESİ SUNUCUDA (20261013145720).

  Sayfa bildirimleri artık arvo_bildirimler'den sayfa sayfa, sayıları
  arvo_bildirim_ozeti'nden alıyor. Sınananlar:
  1. MEŞRU yol: kişi kendi bildirimini ve kurumun toplu bildirimini görür;
     toplu bildirimin okunma bilgisi KİŞİYE göre gelir.
  2. Başkasına özel bildirim, başka kurumun bildirimi ve kişinin
     kaldırdığı bildirim listede yok.
  3. Başlık (kategori listesi) ve "Diğer" (listenin dışı) süzgeci.
  4. Özetin okunmamış toplamı, üst çubuk rozetinin işleviyle
     (arvo_unread_notification_count) AYNI — iki ayrı sayı olmasın.
  5. anon çağıramaz.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = [
  "20261013145720_bildirim_listesi_sunucuda.sql",
];
const KURUM = "00000000-0000-4000-8000-00000000b701";
const OTEKI = "00000000-0000-4000-8000-00000000b702";
const BEN = "00000000-0000-4000-8000-00000000b711";
const DIGER = "00000000-0000-4000-8000-00000000b712";
const YABANCI = "00000000-0000-4000-8000-00000000b713";
const N = (son) => `00000000-0000-4000-8000-00000000b8${son}`;

let db;
const liste = async (kategoriler = null, diger = false, okunmamis = false) => {
  const { rows } = await db.query(
    `select id, category, read_at from public.arvo_bildirimler($1, false, $2, $3, $4) order by created_at desc`,
    [KURUM, kategoriler, diger, okunmamis]);
  return rows;
};

before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${BEN}','b@x.com'),('${DIGER}','d@x.com'),('${YABANCI}','y@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values ('${KURUM}','AM','am','active','starter'),('${OTEKI}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values ('${KURUM}','${BEN}','member'),('${KURUM}','${DIGER}','member'),('${OTEKI}','${YABANCI}','owner');
    insert into public.notifications (id, organization_id, user_id, audience, category, title, message, metadata, read_at, created_at) values
      ('${N("01")}','${KURUM}','${BEN}','organization','sales_assignment','Atama','m','{}', null, now() - interval '1 hour'),
      ('${N("02")}','${KURUM}','${BEN}','organization','internal_comment','Yorum','m','{}', now(), now() - interval '2 hours'),
      ('${N("03")}','${KURUM}',null,'organization','management_announcement','Duyuru 1','m','{}', null, now() - interval '3 hours'),
      ('${N("04")}','${KURUM}',null,'organization','management_announcement','Duyuru 2','m','{}', null, now() - interval '4 hours'),
      ('${N("05")}','${KURUM}','${BEN}','organization','bilinmeyen_tur','Tuhaf','m','{}', null, now() - interval '5 hours'),
      ('${N("06")}','${KURUM}','${BEN}','organization','internal_comment','Kaldırılan','m','{}', now(), now() - interval '6 hours'),
      ('${N("07")}','${KURUM}','${DIGER}','organization','sales_assignment','Başkasının','m','{}', null, now()),
      ('${N("08")}','${OTEKI}',null,'organization','management_announcement','Öteki kurum','m','{}', null, now());
    -- Duyuru 1'i ben okudum (toplu bildirim: kişiye özel okunma), 06'yı kaldırdım.
    insert into public.notification_user_reads (notification_id, user_id, read_at) values ('${N("03")}','${BEN}', now());
    insert into public.notification_user_dismissals (notification_id, user_id) values ('${N("06")}','${BEN}');
  `);
});

describe("bildirim listesi", () => {
  test("kişi kendi ve toplu bildirimini görür; toplu bildirimin okunması kişiye göre", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", BEN);
      const satirlar = await liste();
      assert.deepEqual(satirlar.map((s) => s.id), [N("01"), N("02"), N("03"), N("04"), N("05")]);
      const okunmus = Object.fromEntries(satirlar.map((s) => [s.id, Boolean(s.read_at)]));
      assert.equal(okunmus[N("03")], true, "okuduğum duyuru okunmuş görünmeli");
      assert.equal(okunmus[N("04")], false, "okumadığım duyuru okunmamış görünmeli");

      // Aynı duyuru öteki kişi için hâlâ okunmamış.
      await rol(db, "authenticated", DIGER);
      const oteki = await liste(["management_announcement"]);
      assert.deepEqual(oteki.map((s) => [s.id, Boolean(s.read_at)]), [[N("03"), false], [N("04"), false]]);
    }));

  test("başkasına özel, başka kurumun ve kaldırılmış bildirim listede yok", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", BEN);
      const idler = (await liste()).map((s) => s.id);
      assert.ok(!idler.includes(N("07")), "başkasına özel bildirim göründü");
      assert.ok(!idler.includes(N("08")), "başka kurumun bildirimi göründü");
      assert.ok(!idler.includes(N("06")), "kaldırılan bildirim göründü");
      // Yabancı bu kurumun hiçbir bildirimini göremez (RLS işlevin içinde de geçerli).
      await rol(db, "authenticated", YABANCI);
      assert.deepEqual(await liste(), []);
    }));

  test("başlık, Diğer ve okunmamış süzgeci", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", BEN);
      assert.deepEqual((await liste(["internal_comment"])).map((s) => s.id), [N("02")]);
      // Diğer: bilinen kategorilerin dışı.
      const bilinen = ["sales_assignment", "internal_comment", "management_announcement"];
      assert.deepEqual((await liste(bilinen, true)).map((s) => s.id), [N("05")]);
      assert.deepEqual((await liste(null, false, true)).map((s) => s.id), [N("01"), N("04"), N("05")]);
    }));

  test("özetin okunmamış toplamı rozetin işleviyle aynı", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", BEN);
      const { rows: [o] } = await db.query(
        `select public.arvo_bildirim_ozeti($1, false, now() - interval '150 minutes') as ozet,
                public.arvo_unread_notification_count($1) as rozet`, [KURUM]);
      const ozet = o.ozet;
      const topla = (alan) => ozet.reduce((t, s) => t + Number(s[alan]), 0);
      assert.equal(topla("adet"), 5);
      assert.equal(topla("okunmamis"), Number(o.rozet));
      assert.equal(topla("okunmamis"), 3);
      assert.equal(topla("bugun"), 2, "son 150 dakikada iki bildirim var");
      const duyuru = ozet.find((s) => s.kategori === "management_announcement");
      assert.deepEqual([Number(duyuru.adet), Number(duyuru.okunmamis)], [2, 1]);
    }));

  test("okunanları toplu kaldırma: kişi kendi okuduklarını gizleyebilir, okunmamışlar kalır", async () =>
    islem(db, async () => {
      // actions.ts dismissReadNotifications'ın yaptığı: okunmuşları işlevden oku, kaldırma satırı yaz.
      await rol(db, "authenticated", BEN);
      await db.query(`
        insert into public.notification_user_dismissals (notification_id, user_id)
        select b.id, auth.uid() from public.arvo_bildirimler($1, false, null, false, false) b
        where b.read_at is not null
        on conflict (notification_id, user_id) do nothing`, [KURUM]);
      assert.deepEqual((await liste()).map((s) => s.id), [N("01"), N("04"), N("05")]);
      // Toplu duyuruyu öteki kişi hâlâ görüyor.
      await rol(db, "authenticated", DIGER);
      assert.deepEqual((await liste(["management_announcement"])).map((s) => s.id), [N("03"), N("04")]);
    }));

  test("anon çağıramaz", async () =>
    islem(db, async () => {
      await rol(db, "anon");
      await reddedilir(db, `select * from public.arvo_bildirimler($1, false, null, false, false)`, [KURUM], /permission denied/);
      await reddedilir(db, `select public.arvo_bildirim_ozeti($1, false, now())`, [KURUM], /permission denied/);
    }));
});
