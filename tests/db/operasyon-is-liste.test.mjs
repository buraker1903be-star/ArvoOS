/*
  İŞLER LİSTESİ GÖRÜNÜMÜ VE ÖZETİ.

  Sayfa işleri adımlarıyla çekip sözleşme bağlantısını, müşteri
  iletişimini ve okunmamış mesaj sayısını ayrı sorgularla birleştiriyordu.
  Görünüm hepsini tek satırda veriyor; burada sınanan üç şey:

  1. Yan sorgular doğru sayıyor mu (adımlar, okunmamış mesaj).
  2. Özet aktif ve arşiv kümelerini ayırıyor mu — kart arşivdekileri de
     sayar, liste saymaz.
  3. Kapsam: başka kurumun kullanıcısı hiçbir satır görmemeli.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261011085634_operasyon_is_liste.sql"];

const KURUM = "00000000-0000-4000-8000-00000000a2a1";
const BASKA = "00000000-0000-4000-8000-00000000a2a2";
const SAHIP = "00000000-0000-4000-8000-00000000a2b1";
const YABANCI = "00000000-0000-4000-8000-00000000a2b2";
const IS_ACIK = "00000000-0000-4000-8000-00000000a2c1";
const FIRSAT = "00000000-0000-4000-8000-00000000a2d1";
const SOZLESME = "00000000-0000-4000-8000-00000000a2d2";
const IS_ARSIV = "00000000-0000-4000-8000-00000000a2c2";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

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

    insert into public.operation_workflows (id,organization_id,title,customer_name,status,priority,due_date,created_by,created_at,updated_at,waiting_party)
      values ('${IS_ACIK}','${KURUM}','Tez düzenleme','Ayşe','in_progress','normal',current_date + 3,'${SAHIP}',now(),now(),'customer');
    insert into public.operation_steps (id,organization_id,workflow_id,title,is_completed,sort_order)
      values (gen_random_uuid(),'${KURUM}','${IS_ACIK}','Adım 1',true,1),
             (gen_random_uuid(),'${KURUM}','${IS_ACIK}','Adım 2',false,2),
             (gen_random_uuid(),'${KURUM}','${IS_ACIK}','Adım 3',false,3);
    /* Mesaj bir SÖZLEŞMEYE bağlı (contract_id not null): müşteri
       yazışması sözleşme dosyasının altında yaşıyor. Zinciri kısa
       kesmek kuralı atlamak olurdu. */
    insert into public.crm_opportunities (id,organization_id,title,customer_name,contact_phone,contact_email,stage,estimated_value,probability,created_by,created_at,updated_at,request_details)
      values ('${FIRSAT}','${KURUM}','Tez','Ayşe','05321112233','ayse@x.com','proposal',1000,50,'${SAHIP}',now(),now(),'{}'::jsonb);
    insert into public.crm_proposals (id,organization_id,opportunity_id,proposal_no,title,amount,currency,status,access_token_hash,created_by,created_at,updated_at,view_count,tax_status)
      values (gen_random_uuid(),'${KURUM}','${FIRSAT}','TEK-O1','T',1000,'TRY','accepted','o1','${SAHIP}',now(),now(),0,'included');
    insert into public.crm_contracts (id,organization_id,opportunity_id,proposal_id,contract_no,title,amount,currency,status,workflow_id,access_token_hash,created_by,created_at,updated_at)
      values ('${SOZLESME}','${KURUM}','${FIRSAT}',(select id from public.crm_proposals where proposal_no = 'TEK-O1'),'SOZ-O1','S',1000,'TRY','signed','${IS_ACIK}','o1h','${SAHIP}',now(),now());
    update public.operation_workflows set contract_id = '${SOZLESME}' where id = '${IS_ACIK}';
    insert into public.customer_file_messages (id,organization_id,contract_id,workflow_id,sender_type,sender_name,body,created_at)
      values (gen_random_uuid(),'${KURUM}','${SOZLESME}','${IS_ACIK}','customer','Ayşe','Soru 1',now()),
             (gen_random_uuid(),'${KURUM}','${SOZLESME}','${IS_ACIK}','customer','Ayşe','Soru 2',now());

    insert into public.operation_workflows (id,organization_id,title,customer_name,status,priority,due_date,delivered_at,created_by,created_at,updated_at,waiting_party)
      values ('${IS_ARSIV}','${KURUM}','Biten iş','Veli','in_progress','normal',current_date - 3, now() - interval '1 day','${SAHIP}',now(),now(),'us');
  `);
  /* Arşiv gerçek akışla: yeni iş doğrudan arşivde oluşturulamıyor,
     arşive yalnızca tamamlanan iş gidebiliyor (tetikleyiciler). */
  await db.exec(`
    update public.operation_workflows set status = 'completed' where id = '${IS_ARSIV}';
    update public.operation_workflows set status = 'archived' where id = '${IS_ARSIV}';
  `);
});

test("adımlar ve okunmamış mesajlar satırda sayılı geliyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const satir = await tek(
      `select adim_toplam, adim_tamam, okunmamis_mesaj from public.operasyon_is_liste where id = $1`,
      [IS_ACIK],
    );
    /* Beklenen sayı tabloya SORULUYOR, elle yazılmıyor: sözleşme işe
       bağlanınca tetikleyici şablon adımlarını da ekliyor (tohumdaki
       üç adımın yanına) — sabit sayı yazmak o kuralı sessizce
       yoksaymak olurdu. */
    const gercek = await tek(
      `select count(*)::int as toplam, count(*) filter (where is_completed)::int as tamam
       from public.operation_steps where workflow_id = $1`, [IS_ACIK],
    );
    assert.equal(Number(satir.adim_toplam), gercek.toplam);
    assert.equal(Number(satir.adim_tamam), gercek.tamam);
    assert.ok(gercek.toplam >= 3 && gercek.tamam >= 1, "tohumdaki adımlar duruyor");
    assert.equal(Number(satir.okunmamis_mesaj), 2);
  });
});

test("okunan mesaj sayıdan düşüyor", async () => {
  await islem(db, async () => {
    await rol(db, "postgres");
    await db.query(`update public.customer_file_messages set read_at = now() where workflow_id = $1`, [IS_ACIK]);
    await rol(db, "authenticated", SAHIP);
    const satir = await tek(`select okunmamis_mesaj from public.operasyon_is_liste where id = $1`, [IS_ACIK]);
    assert.equal(Number(satir.okunmamis_mesaj), 0);
  });
});

test("özet arşivi sayıyor ama aktif kümeden ayırıyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const { o } = await tek(`select public.operasyon_is_istatistikleri($1) as o`, [KURUM]);
    assert.equal(o.toplam, 2, "arşivdeki iş de sayılıyor");
    assert.equal(o.arsiv, 1);
    /* Adım ilerlemesi yalnızca AKTİF işlerden: biten işin adımları
       oranı sonsuza kadar yukarı çekerdi. Beklenen yine tablodan. */
    const aktifAdim = await tek(
      `select count(*)::int as toplam, count(*) filter (where s.is_completed)::int as tamam
       from public.operation_steps s join public.operation_workflows w on w.id = s.workflow_id
       where w.organization_id = $1 and w.status not in ('completed','archived','cancelled')`, [KURUM],
    );
    assert.equal(Number(o.adim_toplam), aktifAdim.toplam);
    assert.equal(Number(o.adim_tamam), aktifAdim.tamam);
    assert.equal(o.musteri_bekleyen, 1, "müşteride bekleyen aktif iş");
    assert.equal(o.okunmamis_is, 1);
    /* Terminine göre GEÇ teslim: termin üç gün önce, teslim dün.
       Ölçülen bir iş var, zamanında olan yok — karşılaştırmanın yönü
       burada sınanıyor. */
    assert.equal(o.teslimli, 1);
    assert.equal(o.zamaninda, 0);
  });
});

test("başka kurumun kullanıcısı hiçbir iş görmüyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", YABANCI);
    const satir = await tek(`select count(*)::int as adet from public.operasyon_is_liste`);
    assert.equal(satir.adet, 0);
    const { o } = await tek(`select public.operasyon_is_istatistikleri($1) as o`, [KURUM]);
    assert.equal(o.toplam, 0);
  });
});

test("anon ne görünüme ne işleve erişebiliyor", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select * from public.operasyon_is_liste`, [], /permission denied/i);
    await reddedilir(db, `select public.operasyon_is_istatistikleri($1)`, [KURUM], /permission denied/i);
  });
});
