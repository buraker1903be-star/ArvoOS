/*
  Operasyon kayıt geçmişinin okunabilirliği (migration 20260926185634).

  İş detayı sayfası "Kayıt geçmişi" panosunu çiziyordu ama pano HER ZAMAN
  boştu: activity_logs üzerindeki tek SELECT politikası entity_type'ı üç CRM
  türüyle sınırlıyor ve eşleşen bir crm_opportunities satırı şart koşuyordu.
  'operation_workflow' satırları yazılsalar bile kimseye görünmüyordu.

  Burada kanıtlanan şey iki yönlü: kaydın işine erişebilen görüyor,
  erişemeyen görmüyor. Erişim kuralı politikada YENİDEN yazılmıyor; alt
  sorgu operation_workflows üzerinde ve o tablonun kendi RLS'i geçerli
  (private.arvo_can_access_workflow). İki yerde ayrı yazılan erişim kuralı
  ilk düzeltmede ayrışır.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260926185634_operasyon_kayit_gecmisi_okunabilsin.sql",
);

const KURUM = "00000000-0000-4000-8000-0000000000b1";
const BASKA_KURUM = "00000000-0000-4000-8000-0000000000b2";
const YONETICI = "00000000-0000-4000-8000-0000000000b3";
const YABANCI = "00000000-0000-4000-8000-0000000000b4";
const CALISAN_KULLANICI = "00000000-0000-4000-8000-0000000000b5";
const CALISAN = "00000000-0000-4000-8000-0000000000b6";
const IS = "00000000-0000-4000-8000-0000000000b7";
const BASKA_IS = "00000000-0000-4000-8000-0000000000b8";

let db;
before(async () => {
  db = await veritabani();
  // Anlık görüntü canlıdan alınıyor; migration henüz uygulanmadı olabilir.
  const { rows } = await db.query(
    `select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_logs' and policyname = 'activity_logs_select_operations'`,
  );
  if (!rows.length) await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${KURUM}', 'Akademik Merkez', 'akademik-merkez', 'active', 'starter'),
      ('${BASKA_KURUM}', 'Başka Kurum', 'baska-kurum', 'active', 'starter');
    insert into auth.users (id, email) values
      ('${YONETICI}', 'y@x.co'), ('${YABANCI}', 'b@x.co'), ('${CALISAN_KULLANICI}', 'c@x.co');
    insert into public.organization_memberships (organization_id, user_id, role, is_active) values
      ('${KURUM}', '${YONETICI}', 'manager', true),
      ('${KURUM}', '${CALISAN_KULLANICI}', 'member', true),
      ('${BASKA_KURUM}', '${YABANCI}', 'owner', true);
    insert into public.hr_employees (id, organization_id, full_name, employment_status, user_id) values
      ('${CALISAN}', '${KURUM}', 'Operasyoncu', 'active', '${CALISAN_KULLANICI}');
    insert into public.operation_workflows (id, organization_id, title, status, assigned_employee_id, created_by) values
      ('${IS}', '${KURUM}', 'Emine Hanım — Tez', 'in_progress', '${CALISAN}', '${YONETICI}'),
      ('${BASKA_IS}', '${BASKA_KURUM}', 'Başka kurumun işi', 'in_progress', null, '${YABANCI}');
  `);
}

/** Bir olay yazar (uygulamanın yazdığı biçimle aynı). */
async function olayYaz(isId, kurumId, aktor, ek = {}) {
  await rol(db, "postgres");
  await db.query(
    `insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
     values ($1, $2, 'step_due', 'operation_workflow', $3, $4::jsonb, now())`,
    [kurumId, aktor, isId, JSON.stringify({ step_title: "İç kontrol", changes: [{ field: "due_date", label: "Aşama teslim tarihi", from: "2026-10-05", to: "2026-10-12" }], ...ek })],
  );
}

const okunan = async (kim) => {
  await rol(db, "authenticated", kim);
  const { rows } = await db.query(`select entity_id, metadata from public.activity_logs order by id`);
  return rows;
};

describe("operasyon kayıt geçmişi", () => {
  test("işe erişen yönetici geçmişi görüyor", () =>
    islem(db, async () => {
      await tohum();
      await olayYaz(IS, KURUM, YONETICI);
      const satirlar = await okunan(YONETICI);
      assert.equal(satirlar.length, 1);
      assert.equal(satirlar[0].entity_id, IS);
      assert.equal(satirlar[0].metadata.step_title, "İç kontrol", "hangi aşama olduğu taşınmalı");
    }));

  test("işin sorumlusu da görüyor", () =>
    islem(db, async () => {
      /*
        Erişim kuralı yalnızca yöneticilere değil, işin atanmış çalışanına da
        açık (arvo_can_access_workflow). Politika o kuralı kendi yazmadığı
        için bu kendiliğinden doğru olmalı; sınanmazsa bilinmez.
      */
      await tohum();
      await olayYaz(IS, KURUM, YONETICI);
      assert.equal((await okunan(CALISAN_KULLANICI)).length, 1);
    }));

  test("başka kurumun kullanıcısı göremiyor", () =>
    islem(db, async () => {
      await tohum();
      await olayYaz(IS, KURUM, YONETICI);
      assert.deepEqual(await okunan(YABANCI), []);
    }));

  test("kendi kurumunun işi için yazılmış olayı görür, komşunun işini görmez", () =>
    islem(db, async () => {
      await tohum();
      await olayYaz(IS, KURUM, YONETICI);
      await olayYaz(BASKA_IS, BASKA_KURUM, YABANCI);
      const satirlar = await okunan(YONETICI);
      assert.deepEqual(satirlar.map((r) => r.entity_id), [IS]);
    }));

  test("var olmayan işe işaret eden kayıt görünmüyor", () =>
    islem(db, async () => {
      /*
        entity_id metin: uydurma bir kimlikle yazılmış satır, politikanın
        alt sorgusu eşleşmediği için görünmez. Aksi halde kendi kurumuna
        satır ekleyip başkasının geçmişini karıştırmak mümkün olurdu.
      */
      await tohum();
      await olayYaz("00000000-0000-4000-8000-0000000000ff", KURUM, YONETICI);
      assert.deepEqual(await okunan(YONETICI), []);
    }));

  test("uuid olmayan entity_id hata fırlatmıyor", () =>
    islem(db, async () => {
      /*
        CRM olayları da aynı tabloda ve entity_id her zaman uuid olmak
        zorunda değil. Politika ters yönde cast yapsaydı (entity_id::uuid)
        böyle bir satır sorguyu tümden düşürürdü; w.id::text karşılaştırması
        bu yüzden seçildi.
      */
      await tohum();
      await olayYaz(IS, KURUM, YONETICI);
      await rol(db, "postgres");
      await db.exec(`
        insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
        values ('${KURUM}', null, 'update', 'operation_workflow', 'uuid-degil', '{}'::jsonb, now());
      `);
      const satirlar = await okunan(YONETICI);
      assert.deepEqual(satirlar.map((r) => r.entity_id), [IS]);
    }));

  test("UYGULAMANIN YAZDIĞI yol açık: authenticated olarak eklenip okunabiliyor", () =>
    islem(db, async () => {
      /*
        Yukarıdaki testler kaydı postgres olarak ekliyor, yani RLS'i atlıyor
        ve yalnızca OKUMA kuralını sınıyor. Uygulamanın yolu bu değil:
        logActivity kullanıcının istemcisiyle yazıyor ve activity_logs_insert
        politikasından geçmek zorunda.

        Bu ayrım burada kritik, çünkü logActivity hatayı YUTUYOR (dosya
        başındaki nota göre bilinçli: geçmiş yazılamazsa kullanıcının işlemi
        düşmemeli). Yani ekleme politikası reddederse geçmiş sessizce boş
        kalır ve hiçbir belirti olmaz — tam da bugün düzeltilen hatanın
        biçimi. Yazma yolunu sınamazsak aynı sessizlik geri gelir.
      */
      await tohum();
      await rol(db, "authenticated", YONETICI);
      await db.query(
        `insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
         values ($1, $2, 'step_due', 'operation_workflow', $3, $4::jsonb, now())`,
        [KURUM, YONETICI, IS, JSON.stringify({ step_title: "İç kontrol", changes: [] })],
      );
      const satirlar = await okunan(YONETICI);
      assert.equal(satirlar.length, 1, "uygulamanın yazdığı kayıt okunabilmeli");
      assert.equal(satirlar[0].metadata.step_title, "İç kontrol");
    }));

  test("başkasının adına kayıt yazılamıyor", () =>
    islem(db, async () => {
      // activity_logs_insert actor_user_id = auth.uid() istiyor: geçmiş
      // kanıt değerini yitirmemeli.
      await tohum();
      await rol(db, "authenticated", YONETICI);
      await reddedilir(
        db,
        `insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
         values ('${KURUM}', '${CALISAN_KULLANICI}', 'step_due', 'operation_workflow', '${IS}', '{}'::jsonb, now())`,
        [],
        /policy|permission/i,
      );
    }));

  test("başka kurumun işine kayıt yazılamıyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI);
      await reddedilir(
        db,
        `insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
         values ('${BASKA_KURUM}', '${YONETICI}', 'step_due', 'operation_workflow', '${BASKA_IS}', '{}'::jsonb, now())`,
        [],
        /policy|permission/i,
      );
    }));

  test("CRM kaydı bu politikayla açılmıyor", () =>
    islem(db, async () => {
      // Politika yalnızca operation_workflow türüne izin veriyor; CRM
      // zincirinin kendi kuralı yerinde kalmalı.
      await tohum();
      await rol(db, "postgres");
      await db.exec(`
        insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
        values ('${KURUM}', '${YONETICI}', 'update', 'crm_contract', '${IS}', '{}'::jsonb, now());
      `);
      assert.deepEqual(await okunan(YONETICI), [], "fırsatı olmayan CRM kaydı görünmemeli");
    }));
});
