/*
  MÜŞTERİ TAKİP SAYFASINDAN YAZINCA PANELDE BİLDİRİM.

  Zincir uçtan uca sınanıyor: müşteri takip sayfasına yazar →
  send_customer_file_message mesajı yazar ve notifications satırlarını
  üretir → panelin zil sayacı (arvo_unread_notification_count) o satırı
  sayar. Üç parçanın da gerçek gövdesi çağrılıyor; plpgsql sütunları
  yalnızca çalışma anında denetler (AGENTS.md), bu yüzden "fonksiyon
  derleniyor" bir kanıt değil.

  Sabitlenen kararlar: işin sorumlusu rolü ne olursa olsun haber alır,
  sıradan üye almaz, bağlantı işe (iş yoksa sözleşmeye) gider ve kapı
  yalnızca service_role'a açıktır — takip sayfası sunucu tarafından
  çağırır, müşterinin tarayıcısı bu fonksiyona erişemez.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, olarak, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20261001125021_musteri_mesaji_satisciya_da_gitsin.sql",
);

const KURUM = "00000000-0000-4000-8000-0000000000e1";
const SAHIP = "00000000-0000-4000-8000-0000000000e2";
const YONETICI = "00000000-0000-4000-8000-0000000000e3";
const MUDUR = "00000000-0000-4000-8000-0000000000e4";
const UZMAN = "00000000-0000-4000-8000-0000000000e5";
const UYE = "00000000-0000-4000-8000-0000000000e6";
const SATISCI = "00000000-0000-4000-8000-0000000000ea";
const FIRSAT = "00000000-0000-4000-8000-0000000000e7";
const TEKLIF = "00000000-0000-4000-8000-0000000000e8";
const SOZLESME = "00000000-0000-4000-8000-0000000000e9";
const KOD = "MSJ123";

let db;
before(async () => {
  db = await veritabani();
  // Anlık görüntü canlıdan alınıyor; bu migration henüz uygulanmadı.
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

/** Atanmış uzmanı olan, imzalanmış ve takip kodu açık bir iş. */
async function tohum({ isVar = true } = {}) {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${SAHIP}', 'sahip@akademikmerkez.com'),
      ('${YONETICI}', 'yonetici@akademikmerkez.com'),
      ('${MUDUR}', 'mudur@akademikmerkez.com'),
      ('${UZMAN}', 'uzman@akademikmerkez.com'),
      ('${UYE}', 'uye@akademikmerkez.com'),
      ('${SATISCI}', 'satisci@akademikmerkez.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'Akademik Merkez', 'akademik-merkez', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values
      ('${KURUM}', '${SAHIP}', 'owner'),
      ('${KURUM}', '${YONETICI}', 'admin'),
      ('${KURUM}', '${MUDUR}', 'manager'),
      ('${KURUM}', '${UZMAN}', 'member'),
      ('${KURUM}', '${UYE}', 'member'),
      ('${KURUM}', '${SATISCI}', 'member');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, created_by)
      values ('${FIRSAT}', '${KURUM}', 'Tez', 'Ayşe', '${SAHIP}');
    insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, access_token_hash, created_by, status)
      values ('${TEKLIF}', '${KURUM}', '${FIRSAT}', 'TKF-M-1', 'Tez', 'x', '${SAHIP}', 'accepted');
    insert into public.crm_contracts
      (id, organization_id, opportunity_id, proposal_id, contract_no, title, access_token_hash,
       amount, status, start_date, created_by, tracking_code)
      values ('${SOZLESME}', '${KURUM}', '${FIRSAT}', '${TEKLIF}', 'SOZ-M-1', 'Tez', 'x',
              1200000, 'signed', current_date, '${SAHIP}', '${KOD}');
  `);
  const uzman = await tek(
    `insert into public.hr_employees (organization_id, user_id, full_name, employment_type, employment_status)
     values ($1, $2, 'Uzman Kişi', 'full_time', 'active') returning id`, [KURUM, UZMAN]);
  const satisci = await tek(
    `insert into public.hr_employees (organization_id, user_id, full_name, employment_type, employment_status)
     values ($1, $2, 'Satışçı Kişi', 'full_time', 'active') returning id`, [KURUM, SATISCI]);
  await db.query(`update public.crm_opportunities set assigned_employee_id = $1 where id = $2`,
    [satisci.id, FIRSAT]);
  if (!isVar) {
    await db.exec(`delete from public.notifications`);
    return { isId: null, uzmanId: uzman.id, satisciId: satisci.id };
  }
  const is = await tek(
    `insert into public.operation_workflows (organization_id, contract_id, title, status, created_by, assigned_employee_id)
     values ($1, $2, 'Tez', 'in_progress', $3, $4) returning id`, [KURUM, SOZLESME, SAHIP, uzman.id]);
  await db.query(`update public.crm_contracts set workflow_id = $1 where id = $2`, [is.id, SOZLESME]);
  // İşi uzmana atamak kendi bildirimini ("iş sana atandı") üretir; sahnenin
  // kurulumu sayıma karışmasın diye temizleniyor.
  await db.exec(`delete from public.notifications`);
  return { isId: is.id, uzmanId: uzman.id, satisciId: satisci.id };
}

/** Takip sayfasının gerçek yolu: sunucu eylemi service_role anahtarıyla çağırır. */
async function musteriYazdi(govde = "Etik kurul belgesini yükledim, bakar mısınız?") {
  await rol(db, "service_role");
  await db.query(`select public.send_customer_file_message($1, $2)`, [KOD, govde]);
  await rol(db, "postgres");
}

describe("müşteri mesajı bildirimi", () => {
  test("mesaj yazılıyor ve sorumlu ile yöneticiler bildirim alıyor", () =>
    islem(db, async () => {
      const { isId } = await tohum();
      await musteriYazdi();

      const mesaj = await tek(
        `select sender_type, workflow_id, body from public.customer_file_messages where contract_id = $1`,
        [SOZLESME]);
      assert.equal(mesaj.sender_type, "customer");
      assert.equal(mesaj.workflow_id, isId);

      const { rows } = await db.query(
        `select user_id, audience, category, title, action_url, metadata, read_at
           from public.notifications where organization_id = $1`, [KURUM]);
      assert.deepEqual(
        rows.map((r) => r.user_id).sort(),
        [SAHIP, YONETICI, MUDUR, UZMAN, SATISCI].sort(),
        "İşin sorumlusu, fırsatın satışçısı ve owner/admin/manager haber almalı",
      );
      // Sıradan üye kendine atanmamış dosyayı zaten açamıyor; haber vermek
      // göremeyeceği bir kaydı bildirmek olurdu.
      assert.ok(!rows.some((r) => r.user_id === UYE), "Sıradan üyeye bildirim gitmemeli");

      for (const satir of rows) {
        assert.equal(satir.audience, "organization");
        assert.equal(satir.category, "customer_message");
        assert.equal(satir.title, "Müşteriden yeni mesaj");
        // İş varken bağlantı doğrudan iş detayına gidiyor; oradan mesaj
        // sekmesi bir tık uzakta.
        assert.equal(satir.action_url, `/panel/operations/${isId}`);
        assert.equal(satir.metadata.workflow_id, isId);
        assert.equal(satir.read_at, null);
      }
    }));

  test("panelin zil sayacı bu bildirimi görüyor", () =>
    islem(db, async () => {
      await tohum();
      await musteriYazdi();
      // Rozet bu RPC ile hesaplanıyor (app/panel/notifications/count.ts);
      // satırın yazılması yetmez, sayaç da görmeli.
      const sayi = await olarak(db, "authenticated", UZMAN, async () =>
        (await db.query(`select public.arvo_unread_notification_count($1) as n`, [KURUM])).rows[0].n);
      assert.equal(sayi, 1);
      const uyeSayisi = await olarak(db, "authenticated", UYE, async () =>
        (await db.query(`select public.arvo_unread_notification_count($1) as n`, [KURUM])).rows[0].n);
      assert.equal(uyeSayisi, 0);
    }));

  test("satışçı iş operasyona geçtikten sonra da haber alıyor", () =>
    islem(db, async () => {
      // Asıl düzeltme bu: fırsatın sorumlusu eskiden yalnızca iş HENÜZ
      // AÇILMAMIŞKEN bildirim alıyordu. Müşteriyi tanıyan kişi, iş
      // operasyona düştü diye sessizleşmemeli.
      const { isId } = await tohum();
      assert.ok(isId, "Bu senaryoda iş açılmış olmalı");
      await musteriYazdi();
      const satir = await tek(
        `select action_url from public.notifications where organization_id = $1 and user_id = $2`,
        [KURUM, SATISCI]);
      assert.ok(satir, "Satışçı bildirimi almalı");
      assert.equal(satir.action_url, `/panel/operations/${isId}`);
    }));

  test("kurumdan ayrılan satışçıya bildirim gitmiyor; aynı kişiyse tek satır yazılıyor", () =>
    islem(db, async () => {
      const { satisciId } = await tohum();
      // Üyeliği kapanmış satışçı: kaydı duruyor ama paneli açamıyor.
      await db.query(
        `update public.organization_memberships set is_active = false where organization_id = $1 and user_id = $2`,
        [KURUM, SATISCI]);
      await musteriYazdi();
      const { rows } = await db.query(
        `select user_id from public.notifications where organization_id = $1 and user_id = $2`,
        [KURUM, SATISCI]);
      assert.equal(rows.length, 0);

      // Satışı yapan kişi işi de yürütüyorsa iki koldan da seçilir;
      // 'select distinct' tek bildirim yazmalı.
      await db.exec(`delete from public.notifications`);
      await db.query(
        `update public.organization_memberships set is_active = true where organization_id = $1 and user_id = $2`,
        [KURUM, SATISCI]);
      await db.query(`update public.operation_workflows set assigned_employee_id = $1 where organization_id = $2`,
        [satisciId, KURUM]);
      await db.query(
        `delete from public.customer_file_messages where contract_id = $1`, [SOZLESME]);
      await musteriYazdi("İkinci mesajım var");
      // Atamanın kendi bildirimi ("iş sana atandı") de yazıldı; sayılan
      // yalnızca müşteri mesajı.
      const kendi = await db.query(
        `select user_id from public.notifications
          where organization_id = $1 and user_id = $2 and category = 'customer_message'`,
        [KURUM, SATISCI]);
      assert.equal(kendi.rows.length, 1, "Aynı kişi iki bildirim almamalı");
    }));

  test("iş açılmamışsa bağlantı sözleşmenin mesaj bölümüne gidiyor", () =>
    islem(db, async () => {
      await tohum({ isVar: false });
      await musteriYazdi();
      const { rows } = await db.query(
        `select distinct action_url from public.notifications where organization_id = $1`, [KURUM]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].action_url, `/panel/crm/contracts/${SOZLESME}#musteri-mesajlari`);
    }));

  test("kapı yalnızca sunucuya açık; müşterinin tarayıcısı çağıramıyor", () =>
    islem(db, async () => {
      await tohum();
      for (const kisi of ["anon", "authenticated"]) {
        await rol(db, kisi, kisi === "authenticated" ? UYE : null);
        await reddedilir(db, `select public.send_customer_file_message($1, $2)`, [KOD, "deneme mesajı"],
          /permission denied/);
      }
      await rol(db, "postgres");
    }));

  test("yirmi saniye kuralı ve uzunluk denetimi bozulmadı", () =>
    islem(db, async () => {
      await tohum();
      await musteriYazdi();
      await rol(db, "service_role");
      await reddedilir(db, `select public.send_customer_file_message($1, $2)`, [KOD, "ikinci mesaj"],
        /kısa bir süre bekleyin/);
      await reddedilir(db, `select public.send_customer_file_message($1, $2)`, [KOD, "a"],
        /2 ile 2000/);
      await rol(db, "postgres");
    }));
});
