/*
  KURUCU BİLDİRİM SAYIM DİZİNİ (migration 20261103062213).

  Konsol kabuğunun zil sayımı (audience = 'founder' and read_at is null)
  bütün kurumların toplu bildirimlerini taşıyan read_at dizininde
  geziyordu. Sabitlenen: planlayıcı sayımı kısmi dizinle yapıyor — kurum
  bildirimleri ne kadar çok olursa olsun onlara dokunmadan — ve sayı
  doğru (okunan ve kuruma giden bildirim sayılmıyor).
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000f0101";

let db;
before(async () => {
  db = await veritabani();
});

test("kurucu sayımı kısmi dizinle ve doğru", () =>
  islem(db, async () => {
    await rol(db, "postgres");
    await db.exec(`
      insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
      insert into public.organizations (id, name, slug, status, plan_code) values ('${KURUM}', 'Kurum', 'kurum-dizin', 'active', 'starter');
      insert into public.notifications (organization_id, audience, category, title, message)
        select '${KURUM}', 'organization', 'genel', 'Kurum ' || g, 'x' from generate_series(1, 2000) g;
      insert into public.notifications (organization_id, audience, category, title, message)
        select '${KURUM}', 'founder', 'genel', 'Kurucu ' || g, 'x' from generate_series(1, 5) g;
      update public.notifications set read_at = now() where audience = 'founder' and title = 'Kurucu 1';
      analyze public.notifications;
    `);
    const sorgu = `select count(*)::int as n from public.notifications n where n.read_at is null and n.audience = 'founder'`;
    assert.equal((await db.query(sorgu)).rows[0].n, 4);
    await db.exec(`set local enable_seqscan = off`);
    const plan = (await db.query(`explain ${sorgu}`)).rows.map((r) => r["QUERY PLAN"]).join("\n");
    assert.match(plan, /notifications_kurucu_okunmamis_idx/, plan);
  }));
