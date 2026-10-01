/*
  MÜŞTERİ KÜNYESİ OPERASYONDA.

  Operasyon personeli sözleşmeyi ve teklifi göremiyor (20261001143617):
  tutar o kayıtlarda duruyor ve satır erişimi bilerek daraltıldı. Ama işi
  yapan kişinin müşterinin üniversitesini, fakültesini ve bölümünü bilmesi
  gerekiyor. Bu bilgi fırsat kaydında (request_details) duruyordu ve ops
  görünümünde hiç yoktu.

  Testin iki yüzü var:
    1) Künye operasyona AÇILDI mı — ama tutar kapalı KALDI mı?
    2) Yazma yolu yalnızca künyeye mi dokunuyor, yetkisizi kesiyor mu?

  İkincisi asıl risk: crm_opportunities'e UPDATE politikası açmak
  estimated_value'yu da yazılabilir yapardı; onun yerine tek amaçlı bir
  fonksiyon var ve bu test onun sınırlarını tutuyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATIONLAR = [
  "20261001143617_operasyon_personeli_tutar_gormesin.sql",
  "20261001145319_ops_gorunumleri_salt_okunur.sql",
  "20261001205922_musteri_kunyesi_operasyonda.sql",
  "20261001214623_musteri_iletisimi_operasyonda.sql",
].map((ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad));

const KURUM = "00000000-0000-4000-8000-0000000002a1";
const SAHIP = "00000000-0000-4000-8000-0000000002a2";
const SATISCI = "00000000-0000-4000-8000-0000000002a3";
const UZMAN = "00000000-0000-4000-8000-0000000002a4";
const YABANCI = "00000000-0000-4000-8000-0000000002a5";
const FIRSAT = "00000000-0000-4000-8000-0000000002a6";
const TEKLIF = "00000000-0000-4000-8000-0000000002a7";
const SOZLESME = "00000000-0000-4000-8000-0000000002a8";

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
  for (const m of MIGRATIONLAR) await db.exec(fs.readFileSync(m, "utf8"));
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${SAHIP}','sahip@k.com'),('${SATISCI}','satis@k.com'),
      ('${UZMAN}','uzman@k.com'),('${YABANCI}','baska@k.com');
    insert into public.plans (code,name,description) values ('starter','Başlangıç','');
    insert into public.organizations (id,name,slug,status,plan_code)
      values ('${KURUM}','Akademik Merkez','akademik-merkez','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${SATISCI}','member'),
      ('${KURUM}','${UZMAN}','member'),('${KURUM}','${YABANCI}','member');
  `);
  const satisciKaydi = await tek(
    `insert into public.hr_employees (organization_id,user_id,full_name,employment_type,employment_status)
     values ($1,$2,'Satışçı','full_time','active') returning id`, [KURUM, SATISCI]);
  const uzmanKaydi = await tek(
    `insert into public.hr_employees (organization_id,user_id,full_name,employment_type,employment_status)
     values ($1,$2,'Uzman','full_time','active') returning id`, [KURUM, UZMAN]);
  await db.exec(`
    insert into public.crm_opportunities
      (id,organization_id,title,customer_name,created_by,assigned_employee_id,estimated_value,request_details)
      values ('${FIRSAT}','${KURUM}','Tez','Ayşe Yılmaz','${SAHIP}','${satisciKaydi.id}',3500000,
        '{"service_type":"tez","university":"Ege Üniversitesi","scope":"Pazarlıkta 35.000 TL konuşuldu"}'::jsonb);
    insert into public.crm_proposals
      (id,organization_id,opportunity_id,proposal_no,title,access_token_hash,created_by,status,amount)
      values ('${TEKLIF}','${KURUM}','${FIRSAT}','TKF-K-1','Tez','x','${SAHIP}','accepted',3500000);
    insert into public.crm_contracts
      (id,organization_id,opportunity_id,proposal_id,contract_no,title,access_token_hash,amount,status,start_date,created_by)
      values ('${SOZLESME}','${KURUM}','${FIRSAT}','${TEKLIF}','SOZ-K-1','Tez','x',3500000,'signed',current_date,'${SAHIP}');
  `);
  const is = await tek(
    `insert into public.operation_workflows (organization_id,contract_id,title,status,created_by,assigned_employee_id)
     values ($1,$2,'Tez','in_progress',$3,$4) returning id`, [KURUM, SOZLESME, SAHIP, uzmanKaydi.id]);
  await db.query(`update public.crm_contracts set workflow_id=$1 where id=$2`, [is.id, SOZLESME]);
  return is.id;
}

const kunyeOku = async (kisi) => {
  await rol(db, "authenticated", kisi);
  const { rows } = await db.query(`select kunye from public.ops_opportunities`);
  await rol(db, "postgres");
  return rows.map((r) => r.kunye);
};

const ILETISIM = { customer_name: "Ayşe Yılmaz", contact_email: "ayse@example.com", contact_phone: "05324628098" };

const kunyeYaz = async (kisi, kunye, iletisim = ILETISIM) => {
  await rol(db, "authenticated", kisi);
  try {
    return await db.query(`select public.arvo_ops_musteri_kunyesi_yaz($1,$2::jsonb,$3::jsonb) as sonuc`,
      [FIRSAT, JSON.stringify(kunye), JSON.stringify(iletisim)]);
  } finally {
    await rol(db, "postgres");
  }
};

describe("müşteri künyesi operasyonda", () => {
  test("işin uzmanı künyeyi görüyor, tutar yine kapalı", () =>
    islem(db, async () => {
      await tohum();
      assert.deepEqual(await kunyeOku(UZMAN), [{ service_type: "tez", university: "Ege Üniversitesi" }]);
      await rol(db, "authenticated", UZMAN);
      const { rows } = await db.query(`select estimated_value from public.crm_opportunities`);
      await rol(db, "postgres");
      assert.deepEqual(rows, [], "Fırsat değeri hâlâ okunmamalı");
    }));

  test("serbest metin alanı künyeye sızmıyor", () =>
    islem(db, async () => {
      /* scope pazarlık notu taşıyabiliyor; az önce kapatılan tutar kapısı
         serbest metinle yeniden açılmamalı. */
      await tohum();
      const kunye = (await kunyeOku(UZMAN))[0];
      assert.equal(kunye.scope, undefined);
      assert.ok(!JSON.stringify(kunye).includes("35.000"));
    }));

  test("işin uzmanı künyeyi düzenleyebiliyor", () =>
    islem(db, async () => {
      await tohum();
      await kunyeYaz(UZMAN, { university: "Dokuz Eylül Üniversitesi", faculty: "Tıp Fakültesi", department: "Biyokimya" });
      assert.deepEqual(await kunyeOku(UZMAN), [{
        service_type: "tez",
        university: "Dokuz Eylül Üniversitesi",
        faculty: "Tıp Fakültesi",
        department: "Biyokimya",
      }]);
    }));

  test("yazma yalnızca künyeye dokunuyor", () =>
    islem(db, async () => {
      /* Fonksiyon request_details'i birleştiriyor; service_type ve scope
         yerinde kalmalı, tutar da değişmemeli. */
      await tohum();
      await kunyeYaz(UZMAN, { university: "Boğaziçi Üniversitesi" });
      const satir = await tek(`select estimated_value, request_details from public.crm_opportunities where id=$1`, [FIRSAT]);
      assert.equal(Number(satir.estimated_value), 3500000);
      assert.equal(satir.request_details.service_type, "tez");
      assert.equal(satir.request_details.scope, "Pazarlıkta 35.000 TL konuşuldu");
      assert.equal(satir.request_details.university, "Boğaziçi Üniversitesi");
    }));

  test("boş alan künyeden siliniyor", () =>
    islem(db, async () => {
      /* "Boş bıraktım" ile "dokunmadım" ayrımı: form alanların tamamını
         gönderiyor, boş gelen anahtar kalkıyor. */
      await tohum();
      await kunyeYaz(UZMAN, { university: "   ", faculty: "Fen Fakültesi" });
      const kunye = (await kunyeOku(UZMAN))[0];
      assert.equal(kunye.university, undefined);
      assert.equal(kunye.faculty, "Fen Fakültesi");
    }));

  test("ilgisiz üye ne okuyabiliyor ne yazabiliyor", () =>
    islem(db, async () => {
      await tohum();
      assert.deepEqual(await kunyeOku(YABANCI), []);
      await rol(db, "authenticated", YABANCI);
      await reddedilir(db,
        `select public.arvo_ops_musteri_kunyesi_yaz($1,'{"university":"X"}'::jsonb,'{"customer_name":"X"}'::jsonb)`,
        [FIRSAT], /yetkiniz yok/i);
      await rol(db, "postgres");
      const satir = await tek(`select request_details from public.crm_opportunities where id=$1`, [FIRSAT]);
      assert.equal(satir.request_details.university, "Ege Üniversitesi", "Kayıt değişmemeli");
    }));

  test("çalışma türü operasyondan değiştirilemiyor", () =>
    islem(db, async () => {
      /* service_type görev şablonunu seçiyor ve fırsatta belirleniyor;
         künye formundan gelse bile yok sayılmalı. */
      await tohum();
      await kunyeYaz(UZMAN, { service_type: "odev", university: "Ege Üniversitesi" });
      const satir = await tek(`select request_details from public.crm_opportunities where id=$1`, [FIRSAT]);
      assert.equal(satir.request_details.service_type, "tez");
    }));

  test("ad, telefon ve e-posta güncelleniyor — sözleşme de aynı kayıttan okuyor", () =>
    islem(db, async () => {
      /*
        Sözleşme belgesi müşteri adını kendi sütununda tutmuyor;
        crm_opportunities'ten birleştirerek alıyor. Bu yüzden burada
        yapılan düzeltme sözleşmeye de yansıyor — testin asıl söylediği
        bu: iki kayıt ayrışamaz.
      */
      await tohum();
      await kunyeYaz(UZMAN, {}, {
        customer_name: "Ayşe Yılmaz Demir",
        contact_email: "ayse.demir@example.com",
        contact_phone: "0532 462 80 98",
      });
      const firsat = await tek(
        `select customer_name, contact_email, contact_phone from public.crm_opportunities where id=$1`, [FIRSAT]);
      assert.equal(firsat.customer_name, "Ayşe Yılmaz Demir");
      assert.equal(firsat.contact_email, "ayse.demir@example.com");
      assert.equal(firsat.contact_phone, "0532 462 80 98");

      const sozlesme = await tek(
        `select o.customer_name, o.contact_email
           from public.crm_contracts c join public.crm_opportunities o on o.id = c.opportunity_id
          where c.id=$1`, [SOZLESME]);
      assert.equal(sozlesme.customer_name, "Ayşe Yılmaz Demir");
      assert.equal(sozlesme.contact_email, "ayse.demir@example.com");
    }));

  test("imza kanıtına dokunulmuyor", () =>
    islem(db, async () => {
      /* signed_name imza anında müşterinin yazdığı addır; ad düzeltilse
         bile kanıt olduğu gibi kalmalı. */
      await tohum();
      await db.query(`update public.crm_contracts set signed_name=$1, signed_at=now() where id=$2`,
        ["Ayşe Yılmaz", SOZLESME]);
      await kunyeYaz(UZMAN, {}, { ...ILETISIM, customer_name: "Ayşe Yılmaz Demir" });
      const c = await tek(`select signed_name from public.crm_contracts where id=$1`, [SOZLESME]);
      assert.equal(c.signed_name, "Ayşe Yılmaz");
    }));

  test("ad boşaltılamıyor", () =>
    islem(db, async () => {
      /* Sütun NOT NULL ve sözleşme bu addan çiziliyor; sessizce eski
         değeri bırakmak yerine hata veriliyor ki kullanıcı öğrensin. */
      await tohum();
      await rol(db, "authenticated", UZMAN);
      await reddedilir(db,
        `select public.arvo_ops_musteri_kunyesi_yaz($1,'{}'::jsonb,'{"customer_name":"   "}'::jsonb)`,
        [FIRSAT], /boş olamaz/i);
      await rol(db, "postgres");
    }));

  test("geçersiz e-posta reddediliyor", () =>
    islem(db, async () => {
      /* Sözleşme bağlantısı bu adrese gidiyor; "ali" sessizce
         kaydedilirse e-posta hiç ulaşmaz ve kimse fark etmez. */
      await tohum();
      await rol(db, "authenticated", UZMAN);
      await reddedilir(db,
        `select public.arvo_ops_musteri_kunyesi_yaz($1,'{}'::jsonb,'{"customer_name":"Ayşe","contact_email":"ali"}'::jsonb)`,
        [FIRSAT], /e-posta adresi geçersiz/i);
      await rol(db, "postgres");
      const f = await tek(`select contact_email from public.crm_opportunities where id=$1`, [FIRSAT]);
      assert.equal(f.contact_email, null, "Reddedilen kayıt yazılmamalı");
    }));

  test("e-posta ve telefon boşaltılabiliyor", () =>
    islem(db, async () => {
      await tohum();
      await kunyeYaz(UZMAN, {}, { customer_name: "Ayşe Yılmaz", contact_email: "", contact_phone: "" });
      const f = await tek(`select contact_email, contact_phone from public.crm_opportunities where id=$1`, [FIRSAT]);
      assert.equal(f.contact_email, null);
      assert.equal(f.contact_phone, null);
    }));
});
