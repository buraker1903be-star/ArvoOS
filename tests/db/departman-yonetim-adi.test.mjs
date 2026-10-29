/*
  DEPARTMANIN ADI YÖNETİM YETKİSİ TAŞIYOR (migration 20261029112549).

  Adı "Yönetim" ile başlayan departmandaki aktif personel Kurum Sahibi
  sayılıyor. Personeli oraya almak zaten yalnızca Kurum Sahibi'nin işiydi;
  departmanın ADINI çevirmek o korumaya uğramıyordu. Sabitlenen:
   - yönetici (admin) "Satış"ı "Yönetim" yapamaz, yönetimi başka ada
     çeviremez, yönetim departmanını silemez — API'den doğrudan da;
   - meşru akışlar açık: yöneticinin olağan yeniden adlandırması ve
     silmesi, Kurum Sahibi'nin yönetim adına çevirmesi;
   - Kurum Sahibi çevirince içindeki üye HEMEN Kurum Sahibi olur, geri
     çevirince eski rolüne döner (eskiden ilk personel güncellemesini
     bekliyordu).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const SAHIP = "00000000-0000-4000-8000-0000000d0001";
const YONETICI = "00000000-0000-4000-8000-0000000d0002";
const CALISAN = "00000000-0000-4000-8000-0000000d0003";
const KURUM = "00000000-0000-4000-8000-0000000d0101";
const SATIS = "00000000-0000-4000-8000-0000000d0201";
const YONETIM = "00000000-0000-4000-8000-0000000d0202";
const BOS = "00000000-0000-4000-8000-0000000d0203";

let db;
before(async () => {
  db = await veritabani();
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 's@x.co'), ('${YONETICI}', 'y@x.co'), ('${CALISAN}', 'c@x.co');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values ('${KURUM}', 'Kurum', 'kurum-d', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values
      ('${KURUM}', '${SAHIP}', 'owner'), ('${KURUM}', '${YONETICI}', 'admin'), ('${KURUM}', '${CALISAN}', 'member');
    insert into public.hr_departments (id, organization_id, name) values
      ('${SATIS}', '${KURUM}', 'Satış'), ('${YONETIM}', '${KURUM}', 'Yönetim'), ('${BOS}', '${KURUM}', 'Eski Birim');
    insert into public.hr_employees (organization_id, full_name, user_id, department_id, employment_type, employment_status)
      values ('${KURUM}', 'Çalışan', '${CALISAN}', '${SATIS}', 'full_time', 'active');
  `);
}

const rolu = async (kullanici) => (await tek(
  `select role::text as role from public.organization_memberships where organization_id = $1 and user_id = $2`, [KURUM, kullanici])).role;

describe("departmanın yönetim adı", () => {
  test("yönetici Satış'ı Yönetim yapamaz; çalışan Kurum Sahibi olmaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI);
      await reddedilir(db, `update public.hr_departments set name = 'Yönetim Ekibi' where id = $1`, [SATIS], /yalnızca Kurum Sahibi/);
      await rol(db, "postgres");
      assert.equal(await rolu(CALISAN), "member");
    }));

  test("yönetici yönetim departmanını başka ada çeviremez ve silemez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI);
      await reddedilir(db, `update public.hr_departments set name = 'Genel' where id = $1`, [YONETIM], /yalnızca Kurum Sahibi/);
      await reddedilir(db, `delete from public.hr_departments where id = $1`, [YONETIM], /yalnızca Kurum Sahibi/);
    }));

  test("meşru akış: yöneticinin olağan adlandırması ve silmesi geçer", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI);
      const yeni = await tek(`update public.hr_departments set name = 'Satış ve Pazarlama' where id = $1 returning name`, [SATIS]);
      assert.equal(yeni?.name, "Satış ve Pazarlama");
      const silinen = await tek(`delete from public.hr_departments where id = $1 returning id`, [BOS]);
      assert.equal(silinen?.id, BOS);
    }));

  test("Kurum Sahibi çevirince üye hemen Kurum Sahibi olur, geri çevirince eski rolüne döner", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      await db.query(`update public.hr_departments set name = 'Yönetim Kurulu' where id = $1`, [SATIS]);
      await rol(db, "postgres");
      assert.equal(await rolu(CALISAN), "owner");
      await rol(db, "authenticated", SAHIP);
      await db.query(`update public.hr_departments set name = 'Satış' where id = $1`, [SATIS]);
      await rol(db, "postgres");
      assert.equal(await rolu(CALISAN), "member");
    }));
});
