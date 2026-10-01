/*
  OPERASYON EKİBİ TUTAR GÖRMEZ.

  İş detayındaki "Müşteri nihai evrak teslimi" penceresi ödeme
  durumunu yazıyor: "Ödeme bekleniyor … · kalan ₺25.000". Kalan tutar
  satış/finans bilgisi; tezi yazan uzmanın işini görmesi için gerekli
  değil. Gereken tek şey ödemenin KAPANIP kapanmadığı, çünkü
  "ödeme tamamlanınca açılır" kuralındaki dosyalar ona göre kilitli
  görünüyor.

  Bu testin sınadığı sözleşme: portal_workflow_payment_status herkese
  has_contract ve settled döner, tutarları YALNIZCA owner/admin/manager'a
  döner. Ekranın "tutarı gizle" mantığı yok; gelen değer zaten null
  olduğu için cümle tutarsız biter. Koruma veritabanında.

  Fonksiyon GERÇEKTEN çağrılıyor: plpgsql gövdesi sütunları ve çağırdığı
  fonksiyonları çalışma anında çözüyor (AGENTS.md).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000000f1";
const SAHIP = "00000000-0000-4000-8000-0000000000f2";
const MUDUR = "00000000-0000-4000-8000-0000000000f3";
const UZMAN = "00000000-0000-4000-8000-0000000000f4";
const YABANCI = "00000000-0000-4000-8000-0000000000f5";
const FIRSAT = "00000000-0000-4000-8000-0000000000f6";
const TEKLIF = "00000000-0000-4000-8000-0000000000f7";
const SOZLESME = "00000000-0000-4000-8000-0000000000f8";
const TARAF = "00000000-0000-4000-8000-0000000000f9";

let db;
before(async () => { db = await veritabani(); });

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

/** 35.000 ₺'lik sözleşme, 10.000 ₺ tahsil edilmiş, işi uzman yürütüyor. */
async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${SAHIP}','sahip@akademikmerkez.com'),
      ('${MUDUR}','mudur@akademikmerkez.com'),
      ('${UZMAN}','uzman@akademikmerkez.com'),
      ('${YABANCI}','baska@akademikmerkez.com');
    insert into public.plans (code, name, description) values ('starter','Başlangıç','');
    insert into public.organizations (id,name,slug,status,plan_code)
      values ('${KURUM}','Akademik Merkez','akademik-merkez','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),
      ('${KURUM}','${MUDUR}','manager'),
      ('${KURUM}','${UZMAN}','member'),
      ('${KURUM}','${YABANCI}','member');
    insert into public.account_parties (id,organization_id,party_type,name,created_by)
      values ('${TARAF}','${KURUM}','customer','Ayşe Yılmaz','${SAHIP}');
    insert into public.crm_opportunities (id,organization_id,title,customer_name,created_by)
      values ('${FIRSAT}','${KURUM}','Tez','Ayşe','${SAHIP}');
    insert into public.crm_proposals (id,organization_id,opportunity_id,proposal_no,title,access_token_hash,created_by,status)
      values ('${TEKLIF}','${KURUM}','${FIRSAT}','TKF-O-1','Tez','x','${SAHIP}','accepted');
    insert into public.crm_contracts
      (id,organization_id,opportunity_id,proposal_id,party_id,contract_no,title,access_token_hash,
       amount,status,start_date,created_by,tracking_code)
      values ('${SOZLESME}','${KURUM}','${FIRSAT}','${TEKLIF}','${TARAF}','SOZ-O-1','Tez','x',
              3500000,'signed',current_date,'${SAHIP}','ODM123');
  `);
  const uzmanKaydi = await tek(
    `insert into public.hr_employees (organization_id,user_id,full_name,employment_type,employment_status)
     values ($1,$2,'Uzman Kişi','full_time','active') returning id`, [KURUM, UZMAN]);
  const is = await tek(
    `insert into public.operation_workflows (organization_id,contract_id,title,status,created_by,assigned_employee_id)
     values ($1,$2,'Tez','in_progress',$3,$4) returning id`, [KURUM, SOZLESME, SAHIP, uzmanKaydi.id]);
  await db.query(`update public.crm_contracts set workflow_id=$1 where id=$2`, [is.id, SOZLESME]);
  // 10.000 ₺ tahsilat: kalan 25.000 ₺ olacak.
  await db.query(
    `insert into public.account_entries (organization_id,party_id,entry_type,source_type,amount,description,transaction_date,created_by)
     values ($1,$2,'credit','payment',1000000,'Ara ödeme',current_date,$3)`, [KURUM, TARAF, SAHIP]);
  return is.id;
}

/*
  Rol değişimi "rol()" ile: işlem İÇİNDE "olarak()" çağırmak iç içe bir
  begin açıyor ve onun rollback'i DIŞ işlemi de geri alıyor — tohum
  siliniyor, ikinci çağrı boş dönüyor. ortam.mjs bunun için rol()'ü
  ayrıca veriyor.
*/
async function durum(isId, kisi) {
  await rol(db, "authenticated", kisi);
  const satir = (await db.query(`select * from public.portal_workflow_payment_status($1)`, [isId])).rows[0];
  await rol(db, "postgres");
  return satir;
}

describe("ödeme tutarı gizliliği", () => {
  test("yönetici kalan tutarı görüyor (ekranda yazan sayı)", () =>
    islem(db, async () => {
      const isId = await tohum();
      for (const kisi of [SAHIP, MUDUR]) {
        const r = await durum(isId, kisi);
        assert.equal(r.has_contract, true);
        assert.equal(r.settled, false);
        assert.equal(Number(r.total_amount), 3500000, "tutar kuruş cinsinden");
        assert.equal(Number(r.paid_amount), 1000000);
        assert.equal(Number(r.remaining_amount), 2500000, "kalan ₺25.000");
      }
    }));

  test("işi yürüten uzman tutarları GÖRMÜYOR, ödeme durumunu görüyor", () =>
    islem(db, async () => {
      const isId = await tohum();
      const r = await durum(isId, UZMAN);
      // Dosya kilidi buna bağlı: uzmanın bilmesi gereken tek şey bu.
      assert.equal(r.has_contract, true);
      assert.equal(r.settled, false);
      // Tutarların üçü de null: ekran "· kalan …" ekini hiç basamaz.
      assert.equal(r.total_amount, null);
      assert.equal(r.paid_amount, null);
      assert.equal(r.remaining_amount, null);
    }));

  test("işe atanmamış üye hiç satır alamıyor", () =>
    islem(db, async () => {
      const isId = await tohum();
      const r = await durum(isId, YABANCI);
      assert.equal(r, undefined, "Erişimi olmayan üyeye ödeme durumu dönmemeli");
    }));

  test("ödeme kapanınca uzman 'tamamlandı' görüyor; tutar yine gizli", () =>
    islem(db, async () => {
      const isId = await tohum();
      await rol(db, "postgres");
      await db.query(
        `insert into public.account_entries (organization_id,party_id,entry_type,source_type,amount,description,transaction_date,created_by)
         values ($1,$2,'credit','payment',2500000,'Kalan ödeme',current_date,$3)`, [KURUM, TARAF, SAHIP]);
      const r = await durum(isId, UZMAN);
      assert.equal(r.settled, true);
      assert.equal(r.remaining_amount, null);
    }));
});
