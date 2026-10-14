/*
  KURUCU KONSOLUNUN KİRACI LİSTESİ GÖRÜNÜMÜ.

  Konsol üç tabloyu bütün kiracılar için okuyordu: kurumlar, bütün
  zamanların bütün davetleri ve bütün kiracıların bütün üyelikleri.
  Son ikisi iş hacmiyle büyüyor; satır tavanına çarpıldığı gün kurulum
  rozetleri ve KOTA sayıları sessizce yanlışlanırdı.

  Sınananlar:
  1. Kiracı başına tek satır: aktif üye sayısı (pasif sayılmaz) ve EN
     SON davet.
  2. Lisans alanları satırda; lisansı olmayan kiracıda boş.
  3. KAPSAM: kurucu bütün kiracıları görüyor, kiracının kendi
     yöneticisi yalnızca kendi satırını, anon hiç.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, migrationYetkileri, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = [
  /* Görünümün paketi lisanstan okuması henüz dökümde değil; migration
     canlıya uygulanıp anlık görüntü yenilenince bu satır düşer. */
  "20261014205949_kiraci_listesi_lisans_paketi.sql",
  /* Üyelik okuma politikası (yönetici kendi kurumunu görsün) henüz
     dökümde değil; görünümün kapsam senaryosu ona dayanıyor. */
  "20261011224845_uyelik_guncelleme_politikasi.sql",
];

/*
  Görünümün KENDİSİ artık dökümde ve orada grup_markasi sütunu da var
  (14.10.2026). Migration'ı bütün olarak uygulamak "cannot drop columns
  from view" ile düşüyor: `create or replace view` sütun ekleyebiliyor
  ama düşüremiyor.

  Dosyayı listeden tamamen çıkarmak da yanlış: döküm GÖRÜNÜM
  yetkilerini taşımıyor ve düzenek Supabase varsayılanını taklit edip
  her görünümü anon'a açıyor. O migration'ın `revoke … from anon`
  satırı gitseydi aşağıdaki "anon görünüme erişemiyor" senaryosu
  hiçbir şey ölçmeyen, ama yeşil kalan bir teste dönerdi (AGENTS.md).
  Bu yüzden yalnızca yetki satırları tekrarlanıyor.
  govde-tamam: DDL dökümden, yetkiler dosyadan.
*/
const YALNIZCA_YETKI = ["20261011230517_platform_kiraci_liste.sql"];

const ARVO = "00000000-0000-4000-8000-00000000a0a1";
const KIRACI = "00000000-0000-4000-8000-00000000a0a2";
const OTEKI = "00000000-0000-4000-8000-00000000a0a3";
const KURUCU = "00000000-0000-4000-8000-00000000a0b1";
const KIRACI_YONETICI = "00000000-0000-4000-8000-00000000a0b2";
const PASIF_UYE = "00000000-0000-4000-8000-00000000a0b3";

let db;
const satirlar = async () => (await db.query(
  `select id, name, aktif_uye, user_limit, monthly_fee, davet_eposta, davet_durumu
   from public.platform_kiraci_liste order by name`,
)).rows;

before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await migrationYetkileri(db, YALNIZCA_YETKI);
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${KURUCU}','kurucu@arvo-os.com'),('${KIRACI_YONETICI}','yonetici@kiraci.com'),('${PASIF_UYE}','pasif@kiraci.com');
    insert into public.plans (code, name, description) values ('starter','B',''),('professional','P','');
    /* Kurucu kontrolü slug'a bakıyor: 'arvo-os' kurumunun owner'ı. */
    insert into public.organizations (id,name,slug,status,plan_code,kind) values
      ('${ARVO}','ArvoOS','arvo-os','active','professional','internal'),
      ('${KIRACI}','Akademik Merkez','akademik','active','professional','customer'),
      ('${OTEKI}','Lisanssız Kurum','lisanssiz','trial','starter','customer');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values
      ('${ARVO}','${KURUCU}','owner',true),
      ('${KIRACI}','${KIRACI_YONETICI}','owner',true),
      ('${KIRACI}','${PASIF_UYE}','member',false);
    /* LİSANS SATIRI KENDİLİĞİNDEN AÇILIYOR: kurum oluşturulurken
       tetikleyici paket koduna göre bir lisans yazıyor. Tohum bu yüzden
       INSERT değil UPDATE yapıyor — insert "duplicate key" veriyor ve
       o kuralı atlamak testi gerçeğin dışına çıkarırdı. */
    update public.organization_licenses
       set user_limit = 10, storage_limit_mb = 5120, monthly_fee = 450000, license_status = 'active'
     where organization_id = '${KIRACI}';
    /* İki davet: biri eski kabul edilmiş, biri yeni gönderilmiş.
       Görünüm EN SONU vermeli. */
    insert into public.organization_invitations (id,organization_id,email,role,invited_by,status,expires_at,created_at,updated_at,sent_at)
      values
      (gen_random_uuid(),'${KIRACI}','eski@kiraci.com','member','${KURUCU}','accepted', now() + interval '7 days', now() - interval '10 days', now(), now() - interval '10 days'),
      (gen_random_uuid(),'${KIRACI}','yeni@kiraci.com','member','${KURUCU}','sent', now() + interval '7 days', now() - interval '1 day', now(), now() - interval '1 day');
  `);
});

test("kiracı başına tek satır: aktif üye ve en son davet", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const liste = await satirlar();
    assert.equal(liste.length, 3, "kurucu bütün kurumları görüyor");
    const kiraci = liste.find((s) => s.id === KIRACI);
    assert.equal(Number(kiraci.aktif_uye), 1, "pasif üye sayılmıyor");
    assert.equal(kiraci.davet_eposta, "yeni@kiraci.com", "en son davet");
    assert.equal(kiraci.davet_durumu, "sent");
    assert.equal(Number(kiraci.user_limit), 10);
    assert.equal(Number(kiraci.monthly_fee), 450000);
  });
});

test("yeni kurumun lisansı kendiliğinden geliyor; üyesi ve daveti yok", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const oteki = (await satirlar()).find((s) => s.id === OTEKI);
    assert.ok(oteki, "kurum listede duruyor");
    /*
      Lisans satırı kurumla birlikte açılıyor (tetikleyici): görünümün
      lisans alanları bu yüzden boş değil. Beklenen limitler TABLOYA
      soruluyor — paket koduna göre değişiyor ve sabit yazmak kuralı
      yoksaymak olurdu.
    */
    const beklenen = (await db.query(
      `select user_limit, storage_limit_mb from public.organization_licenses where organization_id = $1`, [OTEKI],
    )).rows[0];
    assert.ok(beklenen, "tetikleyici lisansı açtı");
    assert.equal(Number(oteki.user_limit), Number(beklenen.user_limit));
    assert.equal(Number(oteki.aktif_uye), 0, "üyesi yok");
    assert.equal(oteki.davet_eposta, null, "daveti olmayan kurumda boş");
  });
});

test("kiracının yöneticisi yalnızca kendi satırını görüyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", KIRACI_YONETICI);
    const liste = await satirlar();
    /* Görünüm security_invoker: satırları kurumlar tablosunun kendi
       politikaları açıyor. Kiracı kendi lisansını ve kendi üye
       sayısını görüyor — yeni bir şey açılmıyor, başkasının kaydı
       görünmüyor. */
    assert.deepEqual(liste.map((s) => s.id), [KIRACI]);
  });
});

test("anon görünüme erişemiyor", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select * from public.platform_kiraci_liste`, [], /permission denied/i);
  });
});

/*
  PAKET LİSANSTAN OKUNUYOR.

  Paket iki sütunda duruyor (organizations.plan_code ve
  organization_licenses.plan_code) ve ayrışabiliyordu. Görünüm kurumunkini
  veriyordu; lisans penceresi lisansınkini okuyordu. Görünür etiketten
  daha kötüsü sayıya girmesiydi: Sistem Sağlığı'nın "paketiyle uyuşmayan
  limitler" kartı LİSANSIN limitlerini KURUMUN paketinin varsayılanıyla
  kıyaslayıp olmayan bir sapma uyduruyordu (14.10.2026, Deneme Salon).

  Yetkili olan lisans: limit, ücret, dönem ve durum onunla aynı satırda.
*/
test("görünümün paketi LİSANSTAN geliyor, kurum kaydından değil", async () => {
  await rol(db, "postgres");
  await db.exec(`
    update public.organizations set plan_code = 'professional' where id = '${KIRACI}';
    update public.organization_licenses set plan_code = 'enterprise' where organization_id = '${KIRACI}';
  `);
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const { rows } = await db.query(`select plan_code from public.platform_kiraci_liste where id = $1`, [KIRACI]);
    assert.equal(rows[0].plan_code, "enterprise", "ayrışmada lisansın paketi geçerli");
  });
  // Kurum kaydı bilerek değişmiyor: görünüm onu artık okumuyor.
  const { rows: ham } = await db.query(`select plan_code from public.organizations where id = $1`, [KIRACI]);
  assert.equal(ham[0].plan_code, "professional");
});

test("lisansı olmayan kurumda kurumun paketi okunuyor", async () => {
  await rol(db, "postgres");
  await db.exec(`
    delete from public.organization_licenses where organization_id = '${OTEKI}';
    update public.organizations set plan_code = 'starter' where id = '${OTEKI}';
  `);
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const { rows } = await db.query(`select plan_code, license_status from public.platform_kiraci_liste where id = $1`, [OTEKI]);
    assert.equal(rows[0].license_status, null, "lisans satırı yok");
    assert.equal(rows[0].plan_code, "starter", "coalesce kurumun koduna düşüyor");
  });
});
