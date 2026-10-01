/*
  İŞ BRİFİNGİ, veritabanı tarafı.

  Asıl kanıtlanan şey: satışçının fırsatta yazdığı brifing, iş açılırken
  operasyonun ekranına DÜŞÜYOR. Eskiden bu bilgi hiç tutulmuyordu; iş
  açılıyor ve operasyoncu müşteriyi sıfırdan tanımaya çalışıyordu.

  İki yol da sınanıyor: fırsat "kazanıldı" (sözleşmesiz) ve sözleşmeden
  açılan iş (fırsatı dolaylı biliyor: crm_contracts.opportunity_id).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const SIRA = [
  "20260925113839_is_adimlari_tarihli_ve_kiraci_sablonu.sql",
  "20261001060820_asama_gruplari_ve_firsat_adimlari.sql",
  "20261001062623_sablon_setleri.sql",
  "20261001064709_is_brifingi.sql",
];

const SAHIP = "00000000-0000-4000-8000-000000000071";
const KURUM = "00000000-0000-4000-8000-000000000072";
const FIRSAT = "00000000-0000-4000-8000-000000000073";
const TEKLIF = "00000000-0000-4000-8000-000000000074";
const SOZLESME = "00000000-0000-4000-8000-000000000075";

let db;
before(async () => {
  db = await veritabani();
  // Anlık görüntü canlıdan alınıyor; uygulanmamış migration'lar sırayla kurulur.
  const kurulu = async (tablo) => (await db.query(`select to_regclass($1) as t`, [tablo])).rows[0].t !== null;
  if (!(await kurulu("public.organization_step_templates"))) await db.exec(fs.readFileSync(migration(SIRA[0]), "utf8"));
  const sutun = async (tablo, ad) =>
    (await db.query(
      `select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
      [tablo, ad],
    )).rows.length > 0;
  if (!(await sutun("operation_steps", "phase_title"))) await db.exec(fs.readFileSync(migration(SIRA[1]), "utf8"));
  if (!(await sutun("organization_step_templates", "set_code"))) await db.exec(fs.readFileSync(migration(SIRA[2]), "utf8"));
  if (!(await kurulu("public.organization_brief_fields"))) await db.exec(fs.readFileSync(migration(SIRA[3]), "utf8"));
  /*
    Supabase yeni tabloyu üç role de açar; migration'lar ardından anon'u
    geri alıyor. Harness blanket grant'i tablolar yokken çalıştığı için
    burada tekrarlanıyor — anon bilerek dışarıda.
  */
  await db.exec(`grant all on public.organization_step_templates, public.organization_step_template_sets,
                   public.organization_brief_fields, public.crm_opportunity_briefs,
                   public.operation_workflow_briefs to authenticated, service_role;`);
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'Akademik Merkez', 'akademik-merkez', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role)
      values ('${KURUM}', '${SAHIP}', 'owner');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, created_by, estimated_value)
      values ('${FIRSAT}', '${KURUM}', 'Tez danışmanlığı', 'Ayşe Yılmaz', '${SAHIP}', 1200000);
  `);
}

const BRIFING = {
  kapsam: "Yüksek lisans tezi — yöntem ve analiz dahil",
  musteri_malzemesi: ["Taslak", "Veri"],
  danisman_onayi: true,
};

const brifingYaz = (degerler = BRIFING) =>
  db.query(
    `insert into public.crm_opportunity_briefs (organization_id, opportunity_id, values, updated_by)
     values ($1, $2, $3::jsonb, $4)`,
    [KURUM, FIRSAT, JSON.stringify(degerler), SAHIP],
  );

const isinBrifingi = (isId) =>
  tek(`select values, source_opportunity_id from public.operation_workflow_briefs where workflow_id = $1`, [isId]);

async function firsatiKazan() {
  await rol(db, "postgres");
  await db.query(`update public.crm_opportunities set stage = 'won' where id = $1`, [FIRSAT]);
  return (await tek(
    `select workflow_id from public.crm_automation_runs where opportunity_id = $1`, [FIRSAT])).workflow_id;
}

describe("brifing satıştan operasyona geçiyor", () => {
  test("fırsat kazanılınca işin brifingi oluşuyor", () =>
    islem(db, async () => {
      await tohum();
      await brifingYaz();
      const brifing = await isinBrifingi(await firsatiKazan());
      assert.deepEqual(brifing.values, BRIFING, "satışçının yazdığı metin operasyona aynen geçmeli");
      assert.equal(brifing.source_opportunity_id, FIRSAT, "kaynağı görünmeli: 'satıştan geldi'");
    }));

  test("brifing doldurulmadıysa iş brifingsiz açılıyor (boş satır üretilmiyor)", () =>
    islem(db, async () => {
      await tohum();
      const isId = await firsatiKazan();
      assert.equal(await isinBrifingi(isId), undefined);
    }));

  test("sözleşmeden açılan iş brifingi sözleşmenin fırsatından devralıyor", () =>
    islem(db, async () => {
      await tohum();
      await brifingYaz();
      await rol(db, "postgres");
      await db.exec(`
        insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, access_token_hash, created_by, status)
          values ('${TEKLIF}', '${KURUM}', '${FIRSAT}', 'TKF-B-1', 'Tez', 'x', '${SAHIP}', 'accepted');
        insert into public.crm_contracts
          (id, organization_id, opportunity_id, proposal_id, contract_no, title, access_token_hash,
           amount, status, start_date, created_by)
          values ('${SOZLESME}', '${KURUM}', '${FIRSAT}', '${TEKLIF}', 'SOZ-B-1', 'Tez', 'x',
                  1200000, 'signed', current_date, '${SAHIP}');
      `);
      const is = await tek(
        `insert into public.operation_workflows (organization_id, contract_id, title, status, created_by)
         values ($1, $2, 'Tez', 'planned', $3) returning id`,
        [KURUM, SOZLESME, SAHIP],
      );
      assert.deepEqual((await isinBrifingi(is.id)).values, BRIFING);
    }));

  test("işin kendi brifingi varsa kopya üzerine yazmıyor", () =>
    islem(db, async () => {
      await tohum();
      await brifingYaz();
      await rol(db, "postgres");
      const is = await tek(
        `insert into public.operation_workflows (organization_id, title, status, created_by)
         values ($1, 'Elle açılmış iş', 'planned', $2) returning id`, [KURUM, SAHIP]);
      await db.query(
        `insert into public.operation_workflow_briefs (organization_id, workflow_id, values)
         values ($1, $2, '{"kapsam":"Operasyonun düzelttiği metin"}'::jsonb)`, [KURUM, is.id]);
      // Kopyalama yolu bu işe hiç uğramıyor; yine de açıkça sınanıyor.
      await db.query(`select private.arvo_brief_kopyala($1, $2, $3)`, [KURUM, FIRSAT, is.id]);
      assert.deepEqual((await isinBrifingi(is.id)).values, { kapsam: "Operasyonun düzelttiği metin" });
    }));
});

describe("brifing verisinin kapısı", () => {
  test("values bir nesne olmak zorunda", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await reddedilir(
        db,
        `insert into public.crm_opportunity_briefs (organization_id, opportunity_id, values) values ($1, $2, '"metin"'::jsonb)`,
        [KURUM, FIRSAT],
        /crm_opportunity_briefs_values_check/,
      );
    }));

  test("tek satır sınırsız büyüyemez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      // Serbest metin alanı olan bir formda sınırsız jsonb listeyi okuyan
      // her sorguyu yavaşlatırdı.
      await reddedilir(
        db,
        `insert into public.crm_opportunity_briefs (organization_id, opportunity_id, values)
         values ($1, $2, jsonb_build_object('kapsam', repeat('x', 30000)))`,
        [KURUM, FIRSAT],
        /crm_opportunity_briefs_values_check/,
      );
    }));

  test("başka kurumun brifingi görünmüyor", () =>
    islem(db, async () => {
      await tohum();
      await brifingYaz();
      const YABANCI = "00000000-0000-4000-8000-000000000081";
      const BASKA = "00000000-0000-4000-8000-000000000082";
      await rol(db, "postgres");
      await db.exec(`
        insert into auth.users (id, email) values ('${YABANCI}', 'yabanci@example.com');
        insert into public.organizations (id, name, slug, status, plan_code)
          values ('${BASKA}', 'Başka', 'baska-brifing', 'active', 'starter');
        insert into public.organization_memberships (organization_id, user_id, role)
          values ('${BASKA}', '${YABANCI}', 'owner');
      `);
      await rol(db, "authenticated", YABANCI);
      // RLS hata vermiyor, SIFIR satır gösteriyor.
      assert.equal((await db.query(`select opportunity_id from public.crm_opportunity_briefs`)).rows.length, 0);

      await rol(db, "authenticated", SAHIP);
      assert.equal((await db.query(`select opportunity_id from public.crm_opportunity_briefs`)).rows.length, 1);
    }));

  test("seçim sorusu en az iki şık taşır, seçimsiz soru hiç taşımaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await reddedilir(
        db,
        `insert into public.organization_brief_fields (organization_id, code, label, field_type, options)
         values ($1, 'kanal', 'İletişim kanalı', 'select', '["E-posta"]'::jsonb)`,
        [KURUM],
        /organization_brief_fields_options_check/,
      );
      await reddedilir(
        db,
        `insert into public.organization_brief_fields (organization_id, code, label, field_type, options)
         values ($1, 'kapsam', 'Kapsam', 'long_text', '["a","b"]'::jsonb)`,
        [KURUM],
        /organization_brief_fields_options_check/,
      );
      const yazilan = await db.query(
        `insert into public.organization_brief_fields (organization_id, code, label, field_type, options)
         values ($1, 'kanal', 'İletişim kanalı', 'select', '["E-posta","WhatsApp"]'::jsonb) returning code`,
        [KURUM],
      );
      assert.equal(yazilan.rows.length, 1);
    }));
});
