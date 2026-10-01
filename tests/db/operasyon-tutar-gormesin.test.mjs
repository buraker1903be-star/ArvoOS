/*
  OPERASYON PERSONELİ TUTAR GÖRMESİN — ama işini kaybetmesin.

  Ekranda tutar zaten gizliydi; VERİ açıktı. İşe atanmış bir 'member'
  kendi oturumuyla doğrudan sorgulayınca crm_contracts.amount,
  crm_proposals.amount ve crm_opportunities.estimated_value okuyordu
  (ölçüldü). Sebep: arvo_can_access_opportunity işin sorumlusuna
  fırsatın TÜM satırına erişim veriyor, RLS ise sütun gizleyemiyor.

  Bu testin iki yüzü var ve ikincisi en az birincisi kadar önemli:
    1) Tutarlar kapandı mı?
    2) Operasyoncu KENDİ işini hâlâ görebiliyor mu? Daraltmanın yan
       etkisi yorumları ve kayıt geçmişini de koparabilirdi: o
       politikalar fırsat satırına alt sorguyla bakıyordu ve alt sorgu
       da RLS'ten geçiyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATIONLAR = [
  "20261001143617_operasyon_personeli_tutar_gormesin.sql",
  "20261001145319_ops_gorunumleri_salt_okunur.sql",
  "20261001150014_tutar_yazmayi_da_yetkili_yapsin.sql",
].map((ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad));

const KURUM = "00000000-0000-4000-8000-000000000101";
const SAHIP = "00000000-0000-4000-8000-000000000102";
const MUDUR = "00000000-0000-4000-8000-000000000103";
const SATISCI = "00000000-0000-4000-8000-000000000104";
const UZMAN = "00000000-0000-4000-8000-000000000105";
const YABANCI = "00000000-0000-4000-8000-000000000106";
const FIRSAT = "00000000-0000-4000-8000-000000000107";
const TEKLIF = "00000000-0000-4000-8000-000000000108";
const SOZLESME = "00000000-0000-4000-8000-000000000109";

let db;
before(async () => {
  db = await veritabani();
  /*
    Görünümler önce düşürülüyor. Anlık görüntü artık ops_opportunities'ı
    kunye sütunuyla taşıyor; bir migration dosyasını yeniden uygulamak
    o sütunu düşürmeye çalışıyor ve Postgres "cannot drop columns from
    view" diyor. Üretimde bir migration ikinci kez uygulanmaz, bu
    yalnızca düzeneğin dosyaya bağlı kalma biçiminden doğuyor.
  */
  await db.exec(`drop view if exists public.ops_contracts, public.ops_opportunities, public.ops_proposals cascade;`);
  // Migration'lar anlık görüntüde zaten var; yeniden uygulamak
  // (drop … if exists + create) zararsız ve testi dosyalara bağlı tutuyor.
  for (const m of MIGRATIONLAR) await db.exec(fs.readFileSync(m, "utf8"));
  /*
    Supabase yeni görünümlere 'authenticated' rolüne DOĞRUDAN yetki
    veriyor; harness bunu taklit etmiyordu. Taklit ediyoruz ki ikinci
    migration'ın bu yetkiyi gerçekten geri aldığı sınanabilsin.
  */
  await db.exec(`grant all on public.ops_contracts, public.ops_opportunities, public.ops_proposals to authenticated;`);
  for (const m of MIGRATIONLAR) await db.exec(fs.readFileSync(m, "utf8"));
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${SAHIP}','sahip@am.com'),('${MUDUR}','mudur@am.com'),
      ('${SATISCI}','satisci@am.com'),('${UZMAN}','uzman@am.com'),('${YABANCI}','baska@am.com');
    insert into public.plans (code,name,description) values ('starter','Başlangıç','');
    insert into public.organizations (id,name,slug,status,plan_code)
      values ('${KURUM}','Akademik Merkez','akademik-merkez','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${MUDUR}','manager'),
      ('${KURUM}','${SATISCI}','member'),('${KURUM}','${UZMAN}','member'),('${KURUM}','${YABANCI}','member');
  `);
  const satisciKaydi = await tek(
    `insert into public.hr_employees (organization_id,user_id,full_name,employment_type,employment_status)
     values ($1,$2,'Satışçı','full_time','active') returning id`, [KURUM, SATISCI]);
  const uzmanKaydi = await tek(
    `insert into public.hr_employees (organization_id,user_id,full_name,employment_type,employment_status)
     values ($1,$2,'Uzman','full_time','active') returning id`, [KURUM, UZMAN]);
  await db.exec(`
    insert into public.crm_opportunities (id,organization_id,title,customer_name,contact_email,created_by,assigned_employee_id,estimated_value)
      values ('${FIRSAT}','${KURUM}','Tez','Ayşe Yılmaz','ayse@example.com','${SAHIP}','${satisciKaydi.id}',3500000);
    insert into public.crm_proposals (id,organization_id,opportunity_id,proposal_no,title,access_token_hash,created_by,status,amount)
      values ('${TEKLIF}','${KURUM}','${FIRSAT}','TKF-T-1','Tez','x','${SAHIP}','accepted',3500000);
    insert into public.crm_contracts
      (id,organization_id,opportunity_id,proposal_id,contract_no,title,access_token_hash,amount,status,start_date,created_by,tracking_code)
      values ('${SOZLESME}','${KURUM}','${FIRSAT}','${TEKLIF}','SOZ-T-1','Tez','x',3500000,'signed',current_date,'${SAHIP}','TUT123');
  `);
  const is = await tek(
    `insert into public.operation_workflows (organization_id,contract_id,title,status,created_by,assigned_employee_id)
     values ($1,$2,'Tez','in_progress',$3,$4) returning id`, [KURUM, SOZLESME, SAHIP, uzmanKaydi.id]);
  await db.query(`update public.crm_contracts set workflow_id=$1 where id=$2`, [is.id, SOZLESME]);
  await db.query(
    `insert into public.crm_internal_comments (organization_id,opportunity_id,context_type,context_id,body,created_by)
     values ($1,$2,'operation',$3,'Müşteri yarın dönecek.',$4)`, [KURUM, FIRSAT, is.id, SAHIP]);
  await db.query(
    `insert into public.activity_logs (organization_id,actor_user_id,action,entity_type,entity_id,metadata)
     values ($1,$2,'update','crm_contract',$3,jsonb_build_object('opportunity_id',$4::text))`,
    [KURUM, SAHIP, SOZLESME, FIRSAT]);
  return is.id;
}

/** Bir kullanıcının tarayıcıdan okuyabildikleri. */
async function okur(kisi) {
  await rol(db, "authenticated", kisi);
  const say = async (sql) => (await db.query(sql)).rows;
  const sonuc = {
    sozlesmeTutari: (await say(`select amount from public.crm_contracts`)).map((r) => Number(r.amount)),
    teklifTutari: (await say(`select amount from public.crm_proposals`)).map((r) => Number(r.amount)),
    firsatDegeri: (await say(`select estimated_value from public.crm_opportunities`)).map((r) => Number(r.estimated_value)),
    opsSozlesme: (await say(`select contract_no, tracking_code from public.ops_contracts`)),
    opsFirsat: (await say(`select customer_name, contact_email from public.ops_opportunities`)),
    opsTeklif: (await say(`select proposal_no from public.ops_proposals`)),
    yorum: (await say(`select body from public.crm_internal_comments`)).map((r) => r.body),
    kayit: (await say(`select action from public.activity_logs`)).map((r) => r.action),
  };
  await rol(db, "postgres");
  return sonuc;
}

describe("operasyon personeli tutar görmesin", () => {
  test("işe atanmış uzman tutarlara ulaşamıyor", () =>
    islem(db, async () => {
      await tohum();
      const r = await okur(UZMAN);
      assert.deepEqual(r.sozlesmeTutari, [], "Sözleşme tutarı okunmamalı");
      assert.deepEqual(r.teklifTutari, [], "Teklif tutarı okunmamalı");
      assert.deepEqual(r.firsatDegeri, [], "Fırsat değeri okunmamalı");
    }));

  test("uzman kendi işinin künyesini, yorumlarını ve kayıt geçmişini GÖRÜYOR", () =>
    islem(db, async () => {
      await tohum();
      const r = await okur(UZMAN);
      // Daraltmanın bedeli bu olmamalı: iş detayı sayfası bu üçüne dayanıyor.
      assert.deepEqual(r.opsSozlesme, [{ contract_no: "SOZ-T-1", tracking_code: "TUT123" }]);
      assert.deepEqual(r.opsFirsat, [{ customer_name: "Ayşe Yılmaz", contact_email: "ayse@example.com" }]);
      assert.deepEqual(r.opsTeklif, [{ proposal_no: "TKF-T-1" }]);
      assert.deepEqual(r.yorum, ["Müşteri yarın dönecek."], "Kurum içi yorumlar açık kalmalı");
      assert.deepEqual(r.kayit, ["update"], "Kayıt geçmişi açık kalmalı");
    }));

  test("yönetici ve fırsatın satışçısı tutarı görmeye devam ediyor", () =>
    islem(db, async () => {
      await tohum();
      for (const kisi of [SAHIP, MUDUR, SATISCI]) {
        const r = await okur(kisi);
        assert.deepEqual(r.sozlesmeTutari, [3500000], `${kisi} sözleşme tutarını görmeli`);
        assert.deepEqual(r.teklifTutari, [3500000]);
        assert.deepEqual(r.firsatDegeri, [3500000]);
        // Görünümler onlara da açık: tek okuma yolu yeter.
        assert.equal(r.opsSozlesme.length, 1);
      }
    }));

  test("işle ilgisi olmayan üye hiçbir şey göremiyor", () =>
    islem(db, async () => {
      await tohum();
      const r = await okur(YABANCI);
      for (const [alan, deger] of Object.entries(r)) {
        assert.deepEqual(deger, [], `${alan} boş olmalı`);
      }
    }));

  test("görünümler SALT OKUNUR: üzerinden yazılamıyor", () =>
    islem(db, async () => {
      await tohum();
      /*
        Görünümler tek tablolu ve basit, yani otomatik güncellenebilir;
        security_invoker kapalı olduğu için yazma görünümün SAHİBİ
        olarak çalışır ve taban tablonun RLS'ini ATLAR. İlk sürümde
        yetki yalnızca public ve anon'dan alınmıştı ve operasyon
        personeli görünümden sözleşme adını değiştirebiliyordu.
      */
      await rol(db, "authenticated", UZMAN);
      await reddedilir(db, `update public.ops_contracts set contract_no = 'HACK' where contract_no = 'SOZ-T-1'`, [], /permission denied/);
      await reddedilir(db, `update public.ops_opportunities set customer_name = 'HACK'`, [], /permission denied/);
      await reddedilir(db, `delete from public.ops_proposals`, [], /permission denied/);
      await rol(db, "postgres");
    }));

  test("uzman göremediği tutarı YAZAMIYOR da", () =>
    islem(db, async () => {
      await tohum();
      /*
        Okumayı kapatmak yetmiyordu: UPDATE politikaları hâlâ işin
        sorumlusuna satırın tamamında yazma hakkı veriyor.

        İNCELİK — saldırı WHERE'SİZ olanı. "where id = …" yazan bir
        güncelleme zaten 0 satır buluyor, çünkü Postgres UPDATE'in
        satırları bulurken SELECT politikasını da uyguluyor ve okuma
        kapalı. Ama WHERE'siz güncelleme satırı buluyor ve ölçümde
        "1 satır" yazıyordu. Göremediği bir alanı yazabilmek
        okumaktan kötü: değişen tutar kimsenin gözüne çarpmaz.
      */
      /*
        Sözleşme ve teklifte BAŞKA kurallar da var ve önce davranıyor:
        imzalı sözleşme ve onaylı teklif tutar değişimini zaten
        kilitliyor. Bu test YENİ korumayı kanıtlamalı, o yüzden ikisi
        de kilitsiz duruma alınıyor; aksi hâlde test geçer ama yanlış
        kuralı ölçmüş olur.
      */
      await rol(db, "postgres");
      await db.query(`update public.crm_contracts set status = 'draft' where id = $1`, [SOZLESME]);
      await db.query(`update public.crm_proposals set status = 'draft' where id = $1`, [TEKLIF]);

      await rol(db, "authenticated", UZMAN);
      await reddedilir(db, `update public.crm_contracts set amount = 1`, [], /yetkiniz yok/);
      await reddedilir(db, `update public.crm_proposals set amount = 1`, [], /yetkiniz yok/);
      await reddedilir(db, `update public.crm_opportunities set estimated_value = 1`, [], /yetkiniz yok|row-level security/);
      await rol(db, "postgres");
      const sozlesme = await tek(`select amount from public.crm_contracts where id = $1`, [SOZLESME]);
      assert.equal(Number(sozlesme.amount), 3500000, "Tutar değişmemiş olmalı");
    }));

  test("tutara dokunmayan güncelleme ve yöneticinin tutar yazması serbest", () =>
    islem(db, async () => {
      await tohum();
      // Operasyonun meşru yazması engellenmemeli: iş bağlantısını koparmak gibi.
      await rol(db, "authenticated", UZMAN);
      await db.query(`update public.crm_contracts set workflow_id = null`);
      await rol(db, "postgres");
      const kopuk = await tek(`select workflow_id from public.crm_contracts where id = $1`, [SOZLESME]);
      assert.equal(kopuk.workflow_id, null, "Operasyonun tutarsız güncellemesi geçmeli");

      /*
        Yönetici tarafı FIRSAT ÜZERİNDEN sınanıyor: imzalanmış
        sözleşmenin tutarını zaten ayrı bir kural kilitliyor
        ("Bu sözleşme imzalandı; tutar ve içeriği değiştirilemez"),
        yani orada yöneticiyi de tetikleyici değil o kural durdurur.
      */
      await rol(db, "authenticated", MUDUR);
      await db.query(`update public.crm_opportunities set estimated_value = 4000000 where id = $1`, [FIRSAT]);
      await rol(db, "postgres");
      const firsat = await tek(`select estimated_value from public.crm_opportunities where id = $1`, [FIRSAT]);
      assert.equal(Number(firsat.estimated_value), 4000000, "Yönetici tutarı değiştirebilmeli");
    }));

  test("görünümler anon'a kapalı", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      // reddedilir() savepoint kullanıyor: ilk hata işlemi bozup
      // sonraki denetimleri yutmasın.
      for (const gorunum of ["ops_contracts", "ops_opportunities", "ops_proposals"]) {
        await reddedilir(db, `select * from public.${gorunum}`, [], /permission denied/);
      }
      await rol(db, "postgres");
    }));
});
