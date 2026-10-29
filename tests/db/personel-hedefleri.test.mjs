/*
  PERSONEL SATIŞ HEDEFLERİ (migration 20261029181748).

  Hedef bir performans verisi: kimin koyabildiği ve kimin
  görebildiği RLS'te. Sabitlenen:
   - yazma yalnızca Kurum Sahibi/Yönetici; şef (manager) ve çalışan
     API'den doğrudan da yazamıyor;
   - okuma yönetimde ve KİŞİNİN KENDİSİNDE; başkasının hedefi
     çalışana görünmüyor;
   - MEŞRU AKIŞ da sınanıyor (AGENTS.md): yöneticinin hedef koyması,
     güncellemesi ve kaldırması çalışıyor;
   - başka kurumun personeline hedef yazılamıyor (tetikleyici);
   - aynı kişiye aynı ay iki hedef yazılamıyor (tekillik) — yoksa
     rapor aynı hedefi iki kez toplardı;
   - ayın ortasına hedef konamıyor (kısıt).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const SAHIP = "00000000-0000-4000-8000-0000000f0001";
const YONETICI = "00000000-0000-4000-8000-0000000f0002";
const SEF = "00000000-0000-4000-8000-0000000f0003";
const CALISAN = "00000000-0000-4000-8000-0000000f0004";
const KURUM = "00000000-0000-4000-8000-0000000f0101";
const OTEKI_KURUM = "00000000-0000-4000-8000-0000000f0102";
const PERSONEL = "00000000-0000-4000-8000-0000000f0201";
const BASKA_PERSONEL = "00000000-0000-4000-8000-0000000f0202";
const OTEKININ_PERSONELI = "00000000-0000-4000-8000-0000000f0203";

let db;
before(async () => {
  db = await veritabani();
});

const sayim = async (kosul = "true") =>
  Number((await db.query(`select count(*)::int as n from public.hr_personel_hedefleri where ${kosul}`)).rows[0].n);

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${SAHIP}', 'h-sahip@x.co'), ('${YONETICI}', 'h-yonetici@x.co'),
      ('${SEF}', 'h-sef@x.co'), ('${CALISAN}', 'h-calisan@x.co');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${KURUM}', 'Kurum', 'kurum-h', 'active', 'starter'),
      ('${OTEKI_KURUM}', 'Öteki', 'kurum-h2', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values
      ('${KURUM}', '${SAHIP}', 'owner'), ('${KURUM}', '${YONETICI}', 'admin'),
      ('${KURUM}', '${SEF}', 'manager'), ('${KURUM}', '${CALISAN}', 'member');
    insert into public.hr_employees (id, organization_id, full_name, user_id, employment_type, employment_status) values
      ('${PERSONEL}', '${KURUM}', 'Satışçı', '${CALISAN}', 'full_time', 'active'),
      ('${BASKA_PERSONEL}', '${KURUM}', 'Öteki Satışçı', null, 'full_time', 'active'),
      ('${OTEKININ_PERSONELI}', '${OTEKI_KURUM}', 'Dışarıdan', null, 'full_time', 'active');
  `);
}

const hedefYaz = (personel, ay, tutar) =>
  db.query(
    `insert into public.hr_personel_hedefleri (organization_id, employee_id, donem, tutar) values ($1, $2, $3, $4)`,
    [KURUM, personel, ay, tutar],
  );

describe("personel satış hedefleri", () => {
  test("yönetici hedef koyar, günceller ve kaldırır", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI);
      await hedefYaz(PERSONEL, "2026-11-01", 50_000_00);
      assert.equal(await sayim(), 1);

      await db.query(
        `update public.hr_personel_hedefleri set tutar = $1 where employee_id = $2`, [75_000_00, PERSONEL]);
      assert.equal(await sayim("tutar = 7500000"), 1);

      await db.query(`delete from public.hr_personel_hedefleri where employee_id = $1`, [PERSONEL]);
      assert.equal(await sayim(), 0);
    }));

  test("şef ve çalışan hedef yazamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SEF);
      await reddedilir(db, `insert into public.hr_personel_hedefleri (organization_id, employee_id, donem, tutar) values ($1, $2, $3, $4)`,
        [KURUM, PERSONEL, "2026-11-01", 10_000_00], /row-level security|policy/i);
      await rol(db, "authenticated", CALISAN);
      await reddedilir(db, `insert into public.hr_personel_hedefleri (organization_id, employee_id, donem, tutar) values ($1, $2, $3, $4)`,
        [KURUM, PERSONEL, "2026-11-01", 10_000_00], /row-level security|policy/i);
    }));

  test("çalışan kendi hedefini görür, başkasınınkini görmez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI);
      await hedefYaz(PERSONEL, "2026-11-01", 50_000_00);
      await hedefYaz(BASKA_PERSONEL, "2026-11-01", 90_000_00);

      await rol(db, "authenticated", CALISAN);
      const gorulen = (await db.query(`select employee_id from public.hr_personel_hedefleri`)).rows;
      assert.equal(gorulen.length, 1);
      assert.equal(gorulen[0].employee_id, PERSONEL);

      /* Şef (manager) ekibini ölçebilmeli: privileged member okuyor. */
      await rol(db, "authenticated", SEF);
      assert.equal((await db.query(`select 1 from public.hr_personel_hedefleri`)).rows.length, 2);
    }));

  test("başka kurumun personeline hedef yazılamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI);
      await reddedilir(db, `insert into public.hr_personel_hedefleri (organization_id, employee_id, donem, tutar) values ($1, $2, $3, $4)`,
        [KURUM, OTEKININ_PERSONELI, "2026-11-01", 10_000_00], /kendi personeline/);
    }));

  test("aynı kişiye aynı ay iki hedef yazılamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI);
      await hedefYaz(PERSONEL, "2026-11-01", 50_000_00);
      await reddedilir(db, `insert into public.hr_personel_hedefleri (organization_id, employee_id, donem, tutar) values ($1, $2, $3, $4)`,
        [KURUM, PERSONEL, "2026-11-01", 60_000_00], /duplicate key|unique/i);
    }));

  test("ayın ortasına hedef konamaz, eksi tutar yazılamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI);
      await reddedilir(db, `insert into public.hr_personel_hedefleri (organization_id, employee_id, donem, tutar) values ($1, $2, $3, $4)`,
        [KURUM, PERSONEL, "2026-11-15", 10_000_00], /check constraint|donem/i);
      await reddedilir(db, `insert into public.hr_personel_hedefleri (organization_id, employee_id, donem, tutar) values ($1, $2, $3, $4)`,
        [KURUM, PERSONEL, "2026-11-01", -5], /check constraint|tutar/i);
    }));
});
