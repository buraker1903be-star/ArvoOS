/*
  MAAŞ TAKİBİ VE HAKEDİŞ (migration 20261030065444).

  Maaş kurumdaki en hassas veri; kimin okuyup yazabildiği RLS'te. Sabitlenen:
   - MEŞRU AKIŞ (AGENTS.md): Kurum Sahibi ve Yönetici maaş satırı açar,
     günceller, öder; hakediş yazar, öder, bekleyeni siler;
   - personel YALNIZCA KENDİ satırını okur (kendi pusulası), yazamaz;
   - şef (manager) ve başka çalışan başkasının maaşını GÖREMEZ;
   - başka kurumun personeline kayıt yazılamaz (tetikleyici);
   - aynı kişiye aynı ay iki maaş satırı açılamaz, ayın ortasına açılamaz;
   - ödenmiş hakediş silinemez (finans gideri ve stopaj ona bağlı);
   - ödeme alanları birlikte: tarih var tutar yok bir "ödendi" yazılamaz.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const SAHIP = "00000000-0000-4000-8000-0000000a7001";
const YONETICI = "00000000-0000-4000-8000-0000000a7002";
const SEF = "00000000-0000-4000-8000-0000000a7003";
const CALISAN = "00000000-0000-4000-8000-0000000a7004";
const KURUM = "00000000-0000-4000-8000-0000000a7101";
const OTEKI_KURUM = "00000000-0000-4000-8000-0000000a7102";
const PERSONEL = "00000000-0000-4000-8000-0000000a7201";
const BASKA_PERSONEL = "00000000-0000-4000-8000-0000000a7202";
const OTEKININ_PERSONELI = "00000000-0000-4000-8000-0000000a7203";
const SERBEST = "00000000-0000-4000-8000-0000000a7204";

let db;
before(async () => { db = await veritabani(); });

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${SAHIP}', 'm-sahip@x.co'), ('${YONETICI}', 'm-yonetici@x.co'), ('${SEF}', 'm-sef@x.co'), ('${CALISAN}', 'm-calisan@x.co');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${KURUM}', 'Kurum', 'kurum-m', 'active', 'starter'), ('${OTEKI_KURUM}', 'Öteki', 'kurum-m2', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values
      ('${KURUM}', '${SAHIP}', 'owner'), ('${KURUM}', '${YONETICI}', 'admin'),
      ('${KURUM}', '${SEF}', 'manager'), ('${KURUM}', '${CALISAN}', 'member');
    insert into public.hr_employees (id, organization_id, full_name, user_id, employment_type, employment_status) values
      ('${PERSONEL}', '${KURUM}', 'Kadrolu', '${CALISAN}', 'full_time', 'active'),
      ('${BASKA_PERSONEL}', '${KURUM}', 'Öteki Kadrolu', null, 'full_time', 'active'),
      ('${SERBEST}', '${KURUM}', 'Serbest', null, 'contractor', 'active'),
      ('${OTEKININ_PERSONELI}', '${OTEKI_KURUM}', 'Dışarıdan', null, 'full_time', 'active');
  `);
}

const maasYaz = (personel, kurum = KURUM, donem = "2026-11-01") => db.query(
  `insert into public.hr_maaslar (organization_id, employee_id, donem, anlasilan_net) values ($1, $2, $3, 3000000) returning id`,
  [kurum, personel, donem]);
const hakedisYaz = (personel = SERBEST) => db.query(
  `insert into public.hr_hakedisler (organization_id, employee_id, aciklama, tarih, tutar, stopaj, belge_turu) values ($1, $2, 'Logo tasarımı', '2026-11-05', 1000000, 200000, 'smm') returning id`,
  [KURUM, personel]);

describe("maaş", () => {
  test("yönetim yazar, günceller, öder; sahip ve yönetici okur", () => islem(db, async () => {
    await tohum();
    await rol(db, "authenticated", YONETICI);
    const { rows: [m] } = await maasYaz(PERSONEL);
    await maasYaz(BASKA_PERSONEL);
    await db.query(`update public.hr_maaslar set resmi_net = 3100000, avans = 50000, odendi_on = '2026-11-30', odenen = 3050000, odeme_yontemi = 'havale' where id = $1`, [m.id]);
    await rol(db, "authenticated", SAHIP);
    const { rows } = await db.query(`select employee_id, odenen from public.hr_maaslar order by employee_id`);
    assert.equal(rows.length, 2);
    assert.equal(Number(rows.find((r) => r.employee_id === PERSONEL).odenen), 3050000);
  }));

  test("personel yalnızca kendi satırını okur, yazamaz; şef hiç göremez", () => islem(db, async () => {
    await tohum();
    await rol(db, "authenticated", SAHIP);
    await maasYaz(PERSONEL);
    await maasYaz(BASKA_PERSONEL);
    await rol(db, "authenticated", CALISAN);
    const { rows } = await db.query(`select employee_id from public.hr_maaslar`);
    assert.deepEqual(rows.map((r) => r.employee_id), [PERSONEL]);
    await reddedilir(db, `insert into public.hr_maaslar (organization_id, employee_id, donem, anlasilan_net) values ($1, $2, '2026-12-01', 1)`, [KURUM, PERSONEL], /row-level security/i);
    // PGlite rowCount vermiyor; etkilenen satır `returning` ile sayılıyor.
    const { rows: guncellenen } = await db.query(`update public.hr_maaslar set anlasilan_net = 99 where employee_id = $1 returning id`, [PERSONEL]);
    assert.equal(guncellenen.length, 0, "kendi satırını da değiştiremez");
    await rol(db, "authenticated", SEF);
    assert.equal((await db.query(`select 1 from public.hr_maaslar`)).rows.length, 0, "şef başkasının maaşını görmez");
  }));

  test("başka kurumun personeline yazılamaz; aynı ay iki satır ve ay ortası reddedilir; ödeme alanları birlikte", () => islem(db, async () => {
    await tohum();
    await rol(db, "authenticated", SAHIP);
    await reddedilir(db, `insert into public.hr_maaslar (organization_id, employee_id, donem) values ($1, $2, '2026-11-01')`, [KURUM, OTEKININ_PERSONELI], /kendi personeline/);
    await maasYaz(PERSONEL);
    await reddedilir(db, `insert into public.hr_maaslar (organization_id, employee_id, donem) values ($1, $2, '2026-11-01')`, [KURUM, PERSONEL], /duplicate key|unique/i);
    await reddedilir(db, `insert into public.hr_maaslar (organization_id, employee_id, donem) values ($1, $2, '2026-11-15')`, [KURUM, BASKA_PERSONEL], /check constraint/i);
    await reddedilir(db, `update public.hr_maaslar set odendi_on = '2026-11-30' where employee_id = $1`, [PERSONEL], /odeme_tutarli|check constraint/i);
  }));
});

describe("hakediş", () => {
  test("yönetim yazar ve öder; ödenmiş silinemez, bekleyen silinir", () => islem(db, async () => {
    await tohum();
    await rol(db, "authenticated", YONETICI);
    const { rows: [h] } = await hakedisYaz();
    const { rows: [h2] } = await hakedisYaz();
    await db.query(`update public.hr_hakedisler set durum = 'odendi', odendi_on = '2026-11-10', odeme_yontemi = 'havale' where id = $1`, [h.id]);
    const { rows: silinen } = await db.query(`delete from public.hr_hakedisler where id = any($1::uuid[]) returning id`, [[h.id, h2.id]]);
    assert.deepEqual(silinen.map((r) => r.id), [h2.id], "yalnızca bekleyen silindi");
    const { rows } = await db.query(`select id from public.hr_hakedisler`);
    assert.deepEqual(rows.map((r) => r.id), [h.id]);
  }));

  test("stopaj tutarı aşamaz; başka kurumun kişisine yazılamaz; çalışan başkasının hakedişini görmez", () => islem(db, async () => {
    await tohum();
    await rol(db, "authenticated", SAHIP);
    await hakedisYaz();
    await reddedilir(db, `insert into public.hr_hakedisler (organization_id, employee_id, aciklama, tarih, tutar, stopaj) values ($1, $2, 'İş', '2026-11-05', 1000, 1000)`, [KURUM, SERBEST], /hr_hakedisler_stopaj|check constraint/i);
    await reddedilir(db, `insert into public.hr_hakedisler (organization_id, employee_id, aciklama, tarih, tutar) values ($1, $2, 'İş', '2026-11-05', 1000)`, [KURUM, OTEKININ_PERSONELI], /kendi personeline/);
    await rol(db, "authenticated", CALISAN);
    assert.equal((await db.query(`select 1 from public.hr_hakedisler`)).rows.length, 0);
  }));
});

test("anon hiçbir şey okuyamaz", () => islem(db, async () => {
  await rol(db, "anon");
  await reddedilir(db, `select * from public.hr_maaslar`, [], /permission denied/i);
  await reddedilir(db, `select * from public.hr_hakedisler`, [], /permission denied/i);
}));
