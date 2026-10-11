/*
  SÖZLEŞME LİSTESİ GÖRÜNÜMÜ — grup kuralı ve kapsam.

  Grup kuralı üç tabloya birden bakıyor (sözleşme, iş akışı) ve bu
  yüzden hem TypeScript'te hem görünümde yaşıyor. Aynı örnek tablosu
  (tests/fixtures/sozlesme-gruplari.json) iki tarafa da uygulanıyor:
  biri değişip öteki kalırsa testlerden biri kırılır.

  Kapsam da sınanıyor: görünüm invoker, başka kurumun kullanıcısı
  hiçbir satır görmemeli.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261011081708_sozlesme_liste_gorunumu.sql"];
const ORNEKLER = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../fixtures/sozlesme-gruplari.json"), "utf8"),
).ornekler;

const KURUM = "00000000-0000-4000-8000-00000000f1a1";
const BASKA = "00000000-0000-4000-8000-00000000f1a2";
const SAHIP = "00000000-0000-4000-8000-00000000f1b1";
const YABANCI = "00000000-0000-4000-8000-00000000f1b2";
const FIRSAT = "00000000-0000-4000-8000-00000000f1c1";

let db;
before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}','sahip@x.com'),('${YABANCI}','yabanci@x.com');
    insert into public.plans (code, name, description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','AM','am','active','starter'),('${BASKA}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${BASKA}','${YABANCI}','owner');
    insert into public.crm_opportunities (id,organization_id,title,customer_name,contact_phone,stage,estimated_value,probability,created_by,created_at,updated_at,request_details)
      values ('${FIRSAT}','${KURUM}','Danışmanlık','Ayşe Yılmaz','+90 (532) 111 22 33','proposal',100000,50,'${SAHIP}',now(),now(),'{}'::jsonb);
  `);

  /* Her örnek için bir sözleşme; iş durumu verilmişse bağlı bir iş
     akışı da. Teklif zorunlu (proposal_id NOT NULL), her sözleşmenin
     kendi teklifi var. */
  for (const [sira, ornek] of ORNEKLER.entries()) {
    const { rows: [teklif] } = await db.query(
      `insert into public.crm_proposals (id,organization_id,opportunity_id,proposal_no,title,amount,currency,status,access_token_hash,created_by,created_at,updated_at,view_count,tax_status)
       values (gen_random_uuid(),$1,$2,$3,'T',1000,'TRY','accepted',md5(random()::text),$4,now(),now(),0,'included') returning id`,
      [KURUM, FIRSAT, `TEK-S${sira}`, SAHIP],
    );
    let is = null;
    if (ornek.is_durumu) {
      /* İş önce normal durumda açılıp sonra güncelleniyor: tetikleyici
         yeni işin doğrudan arşivde oluşturulmasını engelliyor
         ("Yeni iş arşivde oluşturulamaz") — tohumu kısa yazmak bu
         kuralı atlamak olurdu. */
      const { rows: [satir] } = await db.query(
        `insert into public.operation_workflows (id,organization_id,title,customer_name,status,created_by,created_at,updated_at)
         values (gen_random_uuid(),$1,'İş','Ayşe','in_progress',$2,now(),now()) returning id`,
        [KURUM, SAHIP],
      );
      is = satir.id;
      /* Arşive yalnızca TAMAMLANAN iş gidebiliyor (ikinci tetikleyici);
         gerçek akışın sırası: in_progress → completed → archived. */
      for (const durum of ornek.is_durumu === "archived" ? ["completed", "archived"]
           : ornek.is_durumu === "in_progress" ? [] : [ornek.is_durumu]) {
        await db.query(`update public.operation_workflows set status = $2 where id = $1`, [is, durum]);
      }
    }
    await db.query(
      `insert into public.crm_contracts (id,organization_id,opportunity_id,proposal_id,contract_no,title,amount,currency,status,workflow_id,access_token_hash,created_by,created_at,updated_at)
       values (gen_random_uuid(),$1,$2,$3,$4,'S',1000,'TRY',$5,$6,md5(random()::text),$7,now(),now())`,
      [KURUM, FIRSAT, teklif.id, `SOZ-${sira}`, ornek.status, is, SAHIP],
    );
  }
});

test("ortak örnek tablosu: görünümün grup sütunu", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const { rows } = await db.query(
      `select contract_no, sozlesme_grubu from public.crm_sozlesme_liste order by contract_no`,
    );
    assert.equal(rows.length, ORNEKLER.length);
    for (const [sira, ornek] of ORNEKLER.entries()) {
      const satir = rows.find((r) => r.contract_no === `SOZ-${sira}`);
      assert.equal(satir?.sozlesme_grubu, ornek.grup, ornek.ad);
    }
  });
});

test("müşteri bilgisi ve telefon anahtarı geliyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const { rows } = await db.query(
      `select customer_name, telefon_rakamlari from public.crm_sozlesme_liste limit 1`,
    );
    assert.equal(rows[0].customer_name, "Ayşe Yılmaz");
    assert.equal(rows[0].telefon_rakamlari, "5321112233");
  });
});

test("başka kurumun kullanıcısı hiçbir satır görmüyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", YABANCI);
    const { rows } = await db.query(`select count(*)::int as adet from public.crm_sozlesme_liste`);
    assert.equal(rows[0].adet, 0);
  });
});

test("anon görünüme erişemiyor", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select * from public.crm_sozlesme_liste`, [], /permission denied/i);
  });
});
