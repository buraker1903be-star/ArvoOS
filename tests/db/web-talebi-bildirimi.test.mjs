/*
  AkademikMerkez'den (ve her kiracı sitesinden) gelen web talebi.

  submit_public_lead talebi düzgün kaydediyordu ama KİMSEYE HABER
  VERMİYORDU: kardeşi submit_site_lead (arvo-os.com) bildirim ve kayıt
  geçmişi yazarken bu yazmıyordu. Hata yoktu, yalnızca o gün panele bakan
  olmazsa iş görülmeden bekliyordu.

  Test fonksiyonu GERÇEKTEN ÇAĞIRIYOR. plpgsql gövdesi sütunları yalnızca
  çalışma anında denetler: var olmayan bir sütuna başvuran fonksiyon
  oluşurken hata vermez, ilk çağrıda düşer — submit_site_lead bu yüzden beş
  gün boyunca her geçerli başvuruyu düşürmüştü (AGENTS.md).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260925120647_web_talebi_bildirim_uretsin.sql",
);

const KURUM = "00000000-0000-4000-8000-0000000000d1";
const SAHIP = "00000000-0000-4000-8000-0000000000d2";
const YONETICI = "00000000-0000-4000-8000-0000000000d3";
const MUDUR = "00000000-0000-4000-8000-0000000000d4";
const UYE = "00000000-0000-4000-8000-0000000000d5";

let db;
before(async () => {
  db = await veritabani();
  // Anlık görüntü canlıdan alınıyor; bu migration henüz uygulanmadı.
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${SAHIP}', 'sahip@akademikmerkez.com'),
      ('${YONETICI}', 'yonetici@akademikmerkez.com'),
      ('${MUDUR}', 'mudur@akademikmerkez.com'),
      ('${UYE}', 'uye@akademikmerkez.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code, custom_domain)
      values ('${KURUM}', 'Akademik Merkez', 'akademik-merkez', 'active', 'starter', 'akademikmerkez.com');
    insert into public.organization_memberships (organization_id, user_id, role) values
      ('${KURUM}', '${SAHIP}', 'owner'),
      ('${KURUM}', '${YONETICI}', 'admin'),
      ('${KURUM}', '${MUDUR}', 'manager'),
      ('${KURUM}', '${UYE}', 'member');
  `);
}

/** Sitedeki "Teklif Al" formunun gerçek yolu: anon anahtarla RPC. */
async function talepGonder({ eposta = "ayse@example.com", hizmet = "Tez Danışmanlığı" } = {}) {
  await rol(db, "anon");
  const satir = await tek(
    `select public.submit_public_lead('akademik-merkez', 'Ayşe Yılmaz', $1, '05001112233', $2,
       'Doktora tezimin literatür bölümü için destek istiyorum.') as id`,
    [eposta, hizmet],
  );
  await rol(db, "postgres");
  return satir.id;
}

describe("web talebi bildirimi", () => {
  test("talep hâlâ kaydediliyor (fonksiyon çalışıyor)", () =>
    islem(db, async () => {
      await tohum();
      const talepId = await talepGonder();
      assert.ok(talepId, "submit_public_lead talep kimliği döndürmeli");

      const firsat = await tek(
        `select title, customer_name, stage, source, request_details from public.crm_opportunities where organization_id = $1`,
        [KURUM],
      );
      assert.equal(firsat.stage, "lead");
      assert.equal(firsat.customer_name, "Ayşe Yılmaz");
      assert.equal(firsat.title, "Tez Danışmanlığı");
      // Kaynak adı kurumun kendi alan adından geliyor, sabit yazılı değil.
      assert.equal(firsat.request_details.source, "akademikmerkez.com");
      assert.equal(firsat.request_details.source_request_id, talepId);
    }));

  test("owner, admin ve manager bildirim alıyor; sıradan üye almıyor", () =>
    islem(db, async () => {
      await tohum();
      await talepGonder();

      const { rows } = await db.query(
        `select user_id, category, action_url, metadata from public.notifications
          where organization_id = $1 order by user_id`, [KURUM]);
      assert.deepEqual(rows.map((r) => r.user_id).sort(), [SAHIP, YONETICI, MUDUR].sort());
      // Atanmamış talebi yalnızca bu roller görebiliyor; üyeye haber vermek
      // açamayacağı bir kaydı bildirmek olurdu.
      assert.ok(!rows.some((r) => r.user_id === UYE), "Sıradan üyeye bildirim gitmemeli");

      const firsat = await tek(`select id from public.crm_opportunities where organization_id = $1`, [KURUM]);
      for (const satir of rows) {
        // Kategori bilerek 'site_lead': panel bunu zaten tanıyor.
        assert.equal(satir.category, "site_lead");
        assert.equal(satir.action_url, `/panel/crm/requests/${firsat.id}`);
        assert.equal(satir.metadata.opportunity_id, firsat.id);
      }
    }));

  test("kayıt geçmişine “oluşturuldu” satırı düşüyor", () =>
    islem(db, async () => {
      await tohum();
      await talepGonder();
      const firsat = await tek(`select id from public.crm_opportunities where organization_id = $1`, [KURUM]);
      const kayit = await tek(
        `select actor_user_id, action, entity_type, entity_id, metadata from public.activity_logs
          where organization_id = $1`, [KURUM]);
      assert.equal(kayit.action, "create");
      assert.equal(kayit.entity_type, "crm_opportunity");
      assert.equal(kayit.entity_id, firsat.id);
      // Talebi bir personel değil ziyaretçi açtı.
      assert.equal(kayit.actor_user_id, null);
    }));

  test("iki dakika kuralı ve doğrulamalar bozulmadı", () =>
    islem(db, async () => {
      await tohum();
      await talepGonder();

      await rol(db, "anon");
      await reddedilir(db,
        `select public.submit_public_lead('akademik-merkez', 'Ayşe Yılmaz', 'ayse@example.com', '05001112233', 'Tez', 'tekrar')`,
        [], /rate_limited/);
      await reddedilir(db,
        `select public.submit_public_lead('akademik-merkez', 'A', 'b@example.com', '', 'Tez', '')`,
        [], /invalid_name/);
      await reddedilir(db,
        `select public.submit_public_lead('akademik-merkez', 'Ayşe Yılmaz', '', '', 'Tez', '')`,
        [], /contact_required/);
      await reddedilir(db,
        `select public.submit_public_lead('olmayan-kurum', 'Ayşe Yılmaz', 'b@example.com', '', 'Tez', '')`,
        [], /organization_not_found/);

      await rol(db, "postgres");
      // Reddedilen çağrılar hiçbir bildirim bırakmamalı.
      const sayi = await tek(`select count(*)::int n from public.notifications where organization_id = $1`, [KURUM]);
      assert.equal(sayi.n, 3, "Yalnızca ilk talebin üç bildirimi olmalı");
    }));

  test("anon fonksiyonu çağırabiliyor ama tabloları okuyamıyor", () =>
    islem(db, async () => {
      await tohum();
      await talepGonder();
      await rol(db, "anon");
      // Fonksiyon security definer; ziyaretçinin kendisi bildirimleri görmemeli.
      const { rows } = await db.query(`select id from public.notifications`);
      assert.equal(rows.length, 0);
    }));
});
