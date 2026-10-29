/*
  PLATFORM BANKA HESAPLARI (29.10.2026): konsolun Tahsilat → Banka
  hesapları sekmesi kurucunun oturumuyla yazıyor (RLS:
  founder_manage_bank_accounts). Sabitlenen: kurucu ekler, düzenler,
  pasife alır ve pasifi görür; başka bir kurumun sahibi hesap ekleyemez,
  değiştiremez ve pasif hesabı göremez — müşteriye giden IBAN'ı yalnızca
  Arvo belirler.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-0000000b0001";
const YABANCI = "00000000-0000-4000-8000-0000000b0002";
const ARVO = "00000000-0000-4000-8000-0000000b0101";
const KURUM = "00000000-0000-4000-8000-0000000b0102";
const HESAP = "00000000-0000-4000-8000-0000000b0201";

let db;
before(async () => {
  db = await veritabani();
});

const satirlar = async (sql, p = []) => (await db.query(sql, p)).rows;

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${KURUCU}', 'k@arvo.co'), ('${YABANCI}', 'y@x.co');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${ARVO}', 'Arvo', 'arvo-os', 'active', 'starter'), ('${KURUM}', 'Kurum', 'kurum-b', 'active', 'starter')
      on conflict (slug) do nothing;
    insert into public.organization_memberships (organization_id, user_id, role) values
      ((select id from public.organizations where slug = 'arvo-os'), '${KURUCU}', 'owner'), ('${KURUM}', '${YABANCI}', 'owner');
    insert into public.platform_bank_accounts (id, bank_name, iban, currency, is_active, sort_order, created_at, updated_at)
      values ('${HESAP}', 'Eski Banka', 'TR000000000000000000000001', 'TRY', false, 20, now(), now());
  `);
}

describe("platform banka hesapları", () => {
  test("kurucu ekler, düzenler, pasifi görür", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      const [yeni] = await satirlar(
        `insert into public.platform_bank_accounts (bank_name, account_holder, iban, currency, is_active, sort_order, created_at, updated_at)
         values ('T. Garanti Bankası', 'Arvo Yazılım A.Ş.', 'TR480006200115100006290081', 'TRY', true, 10, now(), now()) returning id`);
      assert.ok(yeni?.id);
      const [guncel] = await satirlar(`update public.platform_bank_accounts set account_holder = 'Arvo A.Ş.' where id = $1 returning account_holder`, [yeni.id]);
      assert.equal(guncel?.account_holder, "Arvo A.Ş.");
      assert.ok((await satirlar(`select id from public.platform_bank_accounts where id = $1`, [HESAP])).length, "kurucu pasif hesabı da görmeli");
    }));

  test("başka kurumun sahibi ekleyemez, değiştiremez, pasifi göremez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YABANCI);
      await reddedilir(db,
        `insert into public.platform_bank_accounts (bank_name, iban, currency, is_active, sort_order, created_at, updated_at)
         values ('Sahte', 'TR480006200115100006290081', 'TRY', true, 1, now(), now())`, [], /row-level security|permission denied/);
      const degisen = await satirlar(`update public.platform_bank_accounts set bank_name = 'Sahte' where id = $1 returning id`, [HESAP]);
      assert.equal(degisen.length, 0);
      assert.equal((await satirlar(`select id from public.platform_bank_accounts where id = $1`, [HESAP])).length, 0);
    }));
});
