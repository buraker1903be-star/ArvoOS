/*
  KURUMUN SÖZLEŞME VE TEKLİF METİNLERİ (20261012083920).

  Kurum metni Ayarlar'dan değiştirebiliyor; imzalanan sözleşme ise
  onaylandığı metinle kalmalı. Sınananlar:

  1. İmza anında kurumun metni sözleşmeye kopyalanıyor; kurum metni
     sonradan değişse de kopya değişmiyor. Kurumun metni yoksa '{}'.
  2. Teklif kararla (personelin kapatması dahil — MEŞRU yol) kopyalanıyor
     ve bu yol koruma yüzünden reddedilmiyor.
  3. Personel kopyayı API'den yazamıyor (ne oluştururken ne sonradan).
  4. Kurum metnini yalnızca Kurum Sahibi/Yönetici yazıyor; üye okuyor,
     başka kurum ve anon göremiyor.
  5. Herkese açık okuma bağlantı belirtecine bağlı: kopya varsa o, yoksa
     güncel metin; yanlış belirteçte hiçbir şey.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261012083920_belge_metinleri.sql"];

const KURUM = "00000000-0000-4000-8000-00000000be01";
const OTEKI = "00000000-0000-4000-8000-00000000be02";
const SAHIP = "00000000-0000-4000-8000-00000000be11";
const SATISCI = "00000000-0000-4000-8000-00000000be12";
const YABANCI = "00000000-0000-4000-8000-00000000be13";
const FIRSAT = "00000000-0000-4000-8000-00000000be21";
const TEKLIF = "00000000-0000-4000-8000-00000000be22";
const SOZLESME = "00000000-0000-4000-8000-00000000be23";
const BELIRTEC = "sozlesme-belirteci";
const TEKLIF_BELIRTECI = "teklif-belirteci";
const ozet = (deger) => crypto.createHash("sha256").update(deger).digest("hex");

const KURUM_METNI = { surum: 1, maddeler: { scope: { baslik: "Konu", metin: "Kurumun kendi konusu." } } };

let db;
before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${SAHIP}','sahip@x.com'),('${SATISCI}','satis@x.com'),('${YABANCI}','yabanci@y.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','AM','am','active','starter'),('${OTEKI}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${SATISCI}','member'),('${OTEKI}','${YABANCI}','owner');
    insert into public.crm_opportunities (id,organization_id,title,customer_name,stage,created_by)
      values ('${FIRSAT}','${KURUM}','Tez','Ayşe','proposal','${SAHIP}');
    insert into public.crm_proposals (id,organization_id,opportunity_id,proposal_no,title,access_token_hash,amount,status,created_by)
      values ('${TEKLIF}','${KURUM}','${FIRSAT}','TKF-1','Tez','${ozet(TEKLIF_BELIRTECI)}',100000,'sent','${SAHIP}');
    insert into public.crm_contracts (id,organization_id,opportunity_id,proposal_id,contract_no,title,access_token_hash,amount,status,created_by)
      values ('${SOZLESME}','${KURUM}','${FIRSAT}','${TEKLIF}','SOZ-1','Tez','${ozet(BELIRTEC)}',100000,'sent','${SAHIP}');
  `);
});

const kurumMetniYaz = (icerik) => db.query(
  `insert into public.organization_document_texts (organization_id, document_type, content)
   values ($1, 'contract', $2::jsonb)
   on conflict (organization_id, document_type) do update set content = excluded.content`,
  [KURUM, JSON.stringify(icerik)]);

describe("imza anında kopya", () => {
  test("sözleşme imzalanınca kurumun metni kopyalanıyor ve sonradan değişmiyor", async () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await kurumMetniYaz(KURUM_METNI);
      // İmza fonksiyonu sunucu tarafında (definer) çalışıyor; aynı bağlam.
      await db.query(`update public.crm_contracts set status = 'signed', signed_at = now(), signed_name = 'Ayşe' where id = $1`, [SOZLESME]);
      await kurumMetniYaz({ surum: 1, maddeler: { scope: { baslik: "Konu", metin: "SONRADAN değişti." } } });
      const { rows } = await db.query(`select document_text from public.crm_contracts where id = $1`, [SOZLESME]);
      assert.deepEqual(rows[0].document_text, KURUM_METNI);
    }));

  test("kurumun metni yoksa '{}' yazılıyor (sonradan eklenen metin imzalıya sızmasın)", async () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query(`update public.crm_contracts set status = 'signed', signed_at = now(), signed_name = 'Ayşe' where id = $1`, [SOZLESME]);
      const { rows } = await db.query(`select document_text from public.crm_contracts where id = $1`, [SOZLESME]);
      assert.deepEqual(rows[0].document_text, {});
    }));

  test("imzasız sözleşmede kopya alınmıyor", async () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await kurumMetniYaz(KURUM_METNI);
      await db.query(`update public.crm_contracts set title = 'Tez 2' where id = $1`, [SOZLESME]);
      const { rows } = await db.query(`select document_text from public.crm_contracts where id = $1`, [SOZLESME]);
      assert.equal(rows[0].document_text, null);
    }));

  test("personelin teklifi kapatması (meşru yol) kopyayı alıyor, reddedilmiyor", async () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query(
        `insert into public.organization_document_texts (organization_id, document_type, content) values ($1,'proposal','{"surum":1}'::jsonb)`, [KURUM]);
      await rol(db, "authenticated", SAHIP);
      await db.query(`update public.crm_proposals set status = 'rejected' where id = $1`, [TEKLIF]);
      await rol(db, "postgres");
      const { rows } = await db.query(`select document_text from public.crm_proposals where id = $1`, [TEKLIF]);
      assert.deepEqual(rows[0].document_text, { surum: 1 });
    }));
});

describe("kopya elle yazılamaz", () => {
  test("personel sözleşmenin kopyasını güncelleyemiyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `update public.crm_contracts set document_text = '{"sahte":true}'::jsonb where id = $1`, [SOZLESME], /yalnızca imza ya da müşteri kararıyla/);
    }));

  test("personel teklifi kopyayla oluşturamıyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db,
        `insert into public.crm_proposals (organization_id,opportunity_id,proposal_no,title,access_token_hash,amount,status,created_by,document_text)
         values ($1,$2,'TKF-2','Tez','y',100,'draft',$3,'{"sahte":true}'::jsonb)`, [KURUM, FIRSAT, SAHIP], /elle yazılamaz/);
    }));
});

describe("kurum metninin yetkisi", () => {
  test("Kurum Sahibi yazıyor, üye okuyor ama yazamıyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await kurumMetniYaz(KURUM_METNI);
      await rol(db, "authenticated", SATISCI);
      const { rows } = await db.query(`select content from public.organization_document_texts where organization_id = $1`, [KURUM]);
      assert.equal(rows.length, 1, "üye kurum metnini okuyamadı");
      // PGlite etkilenen satırı affectedRows ile veriyor (rowCount yok).
      const { affectedRows } = await db.query(`update public.organization_document_texts set content = '{}'::jsonb where organization_id = $1`, [KURUM]);
      assert.equal(affectedRows, 0, "üye kurum metnini değiştirebildi");
    }));

  test("başka kurumun yöneticisi ve anon göremiyor", async () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await kurumMetniYaz(KURUM_METNI);
      await rol(db, "authenticated", YABANCI);
      const { rows } = await db.query(`select 1 from public.organization_document_texts where organization_id = $1`, [KURUM]);
      assert.equal(rows.length, 0, "yabancı kurum metni gördü");
      await rol(db, "anon");
      await reddedilir(db, `select 1 from public.organization_document_texts`, [], /permission denied/);
    }));
});

describe("herkese açık okuma", () => {
  test("bağlantıyla: kopya yoksa güncel metin, varsa kopya; yanlış belirteçte boş", async () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await kurumMetniYaz(KURUM_METNI);
      await rol(db, "anon");
      const oku = async (belirtec) => (await db.query(`select public.arvo_public_document_text($1, 'contract') as metin`, [belirtec])).rows[0].metin;
      assert.deepEqual(await oku(BELIRTEC), KURUM_METNI, "imzasız belge güncel metni görmedi");
      assert.equal(await oku("yanlis"), null);

      await rol(db, "postgres");
      await db.query(`update public.crm_contracts set status = 'signed', signed_at = now(), signed_name = 'Ayşe' where id = $1`, [SOZLESME]);
      await kurumMetniYaz({ surum: 1, maddeler: {} });
      await rol(db, "anon");
      assert.deepEqual(await oku(BELIRTEC), KURUM_METNI, "imzalı belge güncel metne kaydı");
    }));
});
