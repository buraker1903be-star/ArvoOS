// arvo-os.com iletişim formu (20261028083410, ad 20261028145415): ArvoCal konusu kendi
// başlığıyla açılır, yeni diller satış notuna doğru yazılır, eski 'arc'
// konusu reddedilmez. Fonksiyon GERÇEKTEN çağrılıyor (plpgsql sütunları
// çalışma anında denetler, AGENTS.md).
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000000e1";
const SAHIP = "00000000-0000-4000-8000-0000000000e2";
const IP = "a".repeat(64);

let db;
before(async () => {
  db = await veritabani();
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@arvo-os.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'Arvo', 'arvo-os', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values ('${KURUM}', '${SAHIP}', 'owner');
  `);
}

/** Sitedeki formun yolu: anon anahtarla RPC (app/_site/lead-actions.ts). */
async function gonder(ilgi, dil, eposta) {
  await rol(db, "anon");
  const { submit_site_lead: sonuc } = await tek(
    `select public.submit_site_lead('Ayşe Yılmaz', $1, '', '', $2, 'Merhaba', $3, '/', $4, true)`,
    [eposta, ilgi, dil, IP],
  );
  await rol(db, "postgres");
  return sonuc;
}

const firsat = (ref) => tek(`select title, notes, request_details->>'service_type' as hizmet from public.crm_opportunities where request_details->>'site_reference' = $1`, [ref]);

describe("site formu konuları ve dilleri", () => {
  test("MEŞRU: ArvoCal demosu kendi başlığıyla, Almanca talep 'Dil: Almanca' ile açılır", () =>
    islem(db, async () => {
      await tohum();
      const sonuc = await gonder("randevu", "de", "a@example.com");
      assert.equal(sonuc.ok, true, JSON.stringify(sonuc));
      const f = await firsat(sonuc.reference);
      assert.equal(f.title, "Web sitesi · ArvoCal demo talebi");
      assert.equal(f.hizmet, "ArvoCal demo");
      assert.match(f.notes, /Dil: Almanca/);
    }));

  test("eski 'arc' konusu reddedilmez, e-ticaret sitesi talebi olur; bilinmeyen konu ve dil", () =>
    islem(db, async () => {
      await tohum();
      const arc = await gonder("arc", "en", "b@example.com");
      assert.equal(arc.ok, true, JSON.stringify(arc));
      assert.equal((await firsat(arc.reference)).hizmet, "E-ticaret sitesi");
      assert.match((await firsat(arc.reference)).notes, /Dil: İngilizce/);

      const bilinmeyen = await gonder("xyz", "tr", "c@example.com");
      assert.deepEqual(bilinmeyen, { ok: false, code: "invalid_interest" });

      // Bilinmeyen dil Türkçe sayılır (eski davranış).
      const dil = await gonder("services", "jp", "d@example.com");
      assert.match((await firsat(dil.reference)).notes, /Dil: Türkçe/);
    }));
});
