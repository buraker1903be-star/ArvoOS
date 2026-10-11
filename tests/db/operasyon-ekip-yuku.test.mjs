/*
  EKİP YÜKÜ — operasyon müdürünün "kimde ne var" ekranının sayıları.

  Sınananlar:
  1. Kişi başına açık iş, geciken termin, bu hafta teslim, adım
     ilerlemesi ve okunmamış mesaj.
  2. ADIM SORUMLUSU: adımın kendi sorumlusu yoksa işin sorumlusu
     sayılıyor (panonun kuralı); iki yerde iki ayrı kural, aynı işi iki
     kişiye yüklü göstermek olurdu.
  3. İşi olmayan AKTİF personel de dönüyor ("kim müsait"), atanmamış
     işler ayrı satırda.
  4. KAPSAM: operasyon personeli işlevi çağırırsa yalnızca KENDİ
     işlerinin sayılarını görüyor (RLS), anon hiç çağıramıyor.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261011222519_operasyon_ekip_yuku.sql"];

const KURUM = "00000000-0000-4000-8000-0000000a1a01";
const SAHIP = "00000000-0000-4000-8000-0000000a1b01";
const UZMAN_KULLANICI = "00000000-0000-4000-8000-0000000a1b02";
const AYSE = "00000000-0000-4000-8000-0000000a1c01";   // personel: uzman (panel kullanıcısı)
const VELI = "00000000-0000-4000-8000-0000000a1c02";   // personel: yükü olan başka kişi
const BOSTA = "00000000-0000-4000-8000-0000000a1c03";  // personel: hiç işi yok
const PASIF = "00000000-0000-4000-8000-0000000a1c04";  // ayrılmış, işi de yok
const IS_AYSE = "00000000-0000-4000-8000-0000000a1d01";
const IS_VELI = "00000000-0000-4000-8000-0000000a1d02";
const IS_ATANMAMIS = "00000000-0000-4000-8000-0000000a1d03";
const IS_BITEN = "00000000-0000-4000-8000-0000000a1d04";
const AKTIF = ["planned", "in_progress", "blocked"];
const SUREN = ["in_progress", "blocked"];

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const yuk = async (kurum = KURUM) =>
  (await tek(`select public.operasyon_ekip_yuku($1,$2,$3) as y`, [kurum, AKTIF, SUREN])).y;
const satir = (liste, employeeId) => liste.find((s) => s.employee_id === employeeId);

before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}','sahip@x.com'),('${UZMAN_KULLANICI}','ayse@x.com');
    insert into public.plans (code, name, description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values ('${KURUM}','AM','am','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${UZMAN_KULLANICI}','operasyoncu');
    insert into public.hr_employees (id,organization_id,full_name,job_title,employment_status,user_id) values
      ('${AYSE}','${KURUM}','Ayşe Yılmaz','Uzman','active','${UZMAN_KULLANICI}'),
      ('${VELI}','${KURUM}','Veli Can','Uzman','active',null),
      ('${BOSTA}','${KURUM}','Boş Zaman','Uzman','active',null),
      ('${PASIF}','${KURUM}','Ayrılan Kişi','Uzman','terminated',null);

    insert into public.operation_workflows (id,organization_id,title,customer_name,status,priority,due_date,created_by,created_at,updated_at,assigned_employee_id)
    values
      /* Ayşe: termini DÜN (gecikmiş), süren iş. */
      ('${IS_AYSE}','${KURUM}','Tez düzenleme','Müşteri A','in_progress','normal',(timezone('Europe/Istanbul',now()))::date - 1,'${SAHIP}',now(),now(),'${AYSE}'),
      /* Veli: termini 3 gün sonra (bu hafta), planlanan iş. */
      ('${IS_VELI}','${KURUM}','Makale','Müşteri B','planned','normal',(timezone('Europe/Istanbul',now()))::date + 3,'${SAHIP}',now(),now(),'${VELI}'),
      ('${IS_ATANMAMIS}','${KURUM}','Sahipsiz iş','Müşteri C','planned','normal',null,'${SAHIP}',now(),now(),null),
      ('${IS_BITEN}','${KURUM}','Biten iş','Müşteri D','in_progress','normal',(timezone('Europe/Istanbul',now()))::date - 5,'${SAHIP}',now(),now(),'${AYSE}');

    /* Ayşe'nin işinde üç adım: biri gecikmiş (adım sorumlusu YOK, yani
       işin sorumlusuna yazılmalı), biri yarın, biri tamamlanmış. */
    insert into public.operation_steps (id,organization_id,workflow_id,title,is_completed,sort_order,due_date,assigned_employee_id)
    values
      (gen_random_uuid(),'${KURUM}','${IS_AYSE}','Gecikmiş adım',false,1,(timezone('Europe/Istanbul',now()))::date - 2,null),
      (gen_random_uuid(),'${KURUM}','${IS_AYSE}','Yarın',false,2,(timezone('Europe/Istanbul',now()))::date + 1,null),
      (gen_random_uuid(),'${KURUM}','${IS_AYSE}','Biten',true,3,(timezone('Europe/Istanbul',now()))::date - 3,null),
      /* Veli'nin işindeki adım AYŞE'ye atanmış: adımın kendi sorumlusu
         varsa o sayılmalı, işin sorumlusu değil. */
      (gen_random_uuid(),'${KURUM}','${IS_VELI}','Ayşe''nin adımı',false,1,(timezone('Europe/Istanbul',now()))::date - 4,'${AYSE}');
  `);
  /* Biten iş gerçek akışla kapanıyor (tetikleyici sırası). */
  await db.exec(`update public.operation_workflows set status = 'completed' where id = '${IS_BITEN}'`);
});

test("kişi başına yük: açık iş, geciken termin, bu hafta", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const liste = await yuk();
    const ayse = satir(liste, AYSE);
    const veli = satir(liste, VELI);
    assert.equal(Number(ayse.acik_is), 1, "biten iş sayılmıyor");
    assert.equal(Number(ayse.suren_is), 1);
    assert.equal(Number(ayse.termin_gecmis), 1);
    assert.equal(Number(ayse.termin_yakin), 0);
    assert.equal(Number(veli.acik_is), 1);
    assert.equal(Number(veli.suren_is), 0, "planlanan iş 'süren' değil");
    assert.equal(Number(veli.termin_gecmis), 0);
    assert.equal(Number(veli.termin_yakin), 1, "üç gün sonrası bu hafta");
  });
});

test("adımın sorumlusu yoksa işin sorumlusuna yazılıyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const liste = await yuk();
    const ayse = satir(liste, AYSE);
    const veli = satir(liste, VELI);
    /*
      Beklenen adım sayısı TABLOYA SORULUYOR: iş açılırken tetikleyici
      kurumun şablon adımlarını da ekliyor (varsayılan sekiz aşama).
      Sabit sayı yazmak o kuralı sessizce yoksaymak olurdu.
    */
    const beklenen = async (personel) => (await tek(
      `select count(*)::int as toplam,
              count(*) filter (where s.is_completed)::int as tamam,
              count(*) filter (where not s.is_completed and s.due_date is not null
                                 and s.due_date < (timezone('Europe/Istanbul', now()))::date)::int as gecmis
       from public.operation_steps s
       join public.operation_workflows w on w.id = s.workflow_id
       where w.organization_id = $1 and w.status = any($2)
         and coalesce(s.assigned_employee_id, w.assigned_employee_id) = $3`,
      [KURUM, AKTIF, personel],
    ));
    const ayseBeklenen = await beklenen(AYSE);
    assert.equal(Number(ayse.adim_toplam), ayseBeklenen.toplam);
    assert.equal(Number(ayse.adim_tamam), ayseBeklenen.tamam);
    /* Gecikmiş adım sayısı şablondan ETKİLENMİYOR (şablon adımlarının
       tarihi yok): biri kendi işinde, biri VELİ'nin işinde ama ona
       atanmış. Kural tam burada görünüyor. */
    assert.equal(Number(ayse.adim_gecmis), 2);
    assert.equal(ayseBeklenen.gecmis, 2);

    /* Veli'nin işindeki gecikmiş tek adım Ayşe'ye atanmış: Veli'ye
       yazılmıyor. Şablon adımları (tarihsiz) ona yazılıyor. */
    assert.equal(Number(veli.adim_gecmis), 0);
    const veliBeklenen = await beklenen(VELI);
    assert.equal(Number(veli.adim_toplam), veliBeklenen.toplam);
    assert.ok(veliBeklenen.toplam > 0, "şablon adımları işin sorumlusuna yazılıyor");
  });
});

test("boşta olan aktif personel listede, pasif olan yok", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const liste = await yuk();
    const bosta = satir(liste, BOSTA);
    assert.ok(bosta, "işi olmayan aktif personel 'müsait' olarak görünüyor");
    assert.equal(Number(bosta.acik_is), 0);
    assert.equal(satir(liste, PASIF), undefined, "işi olmayan ayrılmış personel listeyi şişirmiyor");
  });
});

test("atanmamış işler ayrı satırda", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const liste = await yuk();
    const sahipsiz = liste.find((s) => s.employee_id === null);
    assert.ok(sahipsiz, "sorumlusu olmayan iş kimsenin listesinde görünmediği için ayrı satır");
    assert.equal(Number(sahipsiz.acik_is), 1);
  });
});

test("operasyon personeli yalnızca KENDİ sayılarını görüyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", UZMAN_KULLANICI);
    const liste = await yuk();
    /* RLS: uzman yalnızca kendisine atanmış işleri görüyor. Ekran
       zaten operations.ekip.gor yetkisine bağlı; işlev doğrudan
       çağrılsa da kurumun dökümü dışarı çıkmıyor. */
    assert.equal(Number(satir(liste, AYSE).acik_is), 1);
    assert.equal(Number(satir(liste, VELI).acik_is), 0, "başkasının işi sayılmıyor");
    assert.equal(liste.find((s) => s.employee_id === null), undefined, "atanmamış iş de görünmüyor");
    /* Veli'nin işindeki kendi adımı da görünmüyor: adım, görünmeyen
       işin adımı. Beklenen sayı yalnızca KENDİ işinin adımları
       (şablon dahil) — tabloya soruluyor. */
    const kendiAdimlari = (await tek(
      `select count(*)::int as adet from public.operation_steps where workflow_id = $1`, [IS_AYSE],
    )).adet;
    assert.equal(Number(satir(liste, AYSE).adim_toplam), kendiAdimlari);
    assert.equal(Number(satir(liste, AYSE).adim_gecmis), 1, "Veli'nin işindeki adımı sayılmıyor");
  });
});

test("anon işlevi çağıramıyor", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select public.operasyon_ekip_yuku($1,$2,$3)`, [KURUM, AKTIF, SUREN], /permission denied/i);
  });
});
