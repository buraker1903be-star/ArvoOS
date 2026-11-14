/*
  KURUMA ÖZEL MODÜLLER: İZİN LİSTESİ (20261114190657).

  Kanıtlanan: izin listesinde olmayan bir kurumda özel modül HİÇBİR yoldan
  açılamaz — yeni enterprise kurum açılışı, kurucunun modül anahtarı,
  service_role, migration (postgres) ve upsert; izin listesini panel
  kullanıcısı (kurucu dahil) yazamaz; izin kaldırılınca ya da modül
  sonradan özel ilan edilince açık satırlar kapanır; özel olmayan
  modüllerin davranışı değişmez; RLS yardımcısı izin listesi + kurumda
  açık + rolde gizli değil koşullarını birlikte arar.

  Migration BEKLEYEN_MIGRATIONLAR'da: düzenek onu bütün akış testlerine
  uyguluyor, burada yeniden uygulanmıyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-00000000c101";
const AM_SAHIP = "00000000-0000-4000-8000-00000000c102";
const AM_UYE = "00000000-0000-4000-8000-00000000c103";
const YAB_SAHIP = "00000000-0000-4000-8000-00000000c104";
const ARVO = "00000000-0000-4000-8000-00000000c111";
const AM = "00000000-0000-4000-8000-00000000c112";
const YABANCI = "00000000-0000-4000-8000-00000000c113";
const BOS_KURUM = "00000000-0000-4000-8000-00000000c114";

const OZEL = "deneme_ozel";
const GENEL = "deneme_genel";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const acikMi = async (org, modul) =>
  (await tek("select is_enabled from public.organization_modules where organization_id = $1 and module_code = $2", [org, modul]))?.is_enabled ?? null;

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${KURUCU}','kurucu@arvo-os.test'),('${AM_SAHIP}','sahip@am.test'),
      ('${AM_UYE}','uye@am.test'),('${YAB_SAHIP}','sahip@yabanci.test');
    insert into public.plans (code,name,description) values ('starter','Başlangıç',''),('enterprise','Kurumsal','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${ARVO}','ArvoOS','arvo-os','active','starter'),
      ('${AM}','AkademikMerkez','akademikmerkez','active','enterprise'),
      ('${YABANCI}','Yabancı Kurum','yabanci-kurum','active','enterprise'),
      ('${BOS_KURUM}','Boş Kurum','bos-kurum','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values
      ('${ARVO}','${KURUCU}','owner',true),
      ('${AM}','${AM_SAHIP}','owner',true),('${AM}','${AM_UYE}','member',true),
      ('${YABANCI}','${YAB_SAHIP}','owner',true);
    insert into public.arvo_modules (code,name,description,sort_order,is_active) values
      ('${OZEL}','Deneme Özel','Kuruma özel deneme modülü',990,true),
      ('${GENEL}','Deneme Genel','Herkese açık deneme modülü',991,true);
    insert into public.organization_modules (organization_id,module_code,is_enabled) values
      ('${AM}','${OZEL}',false),('${YABANCI}','${OZEL}',false),
      ('${AM}','${GENEL}',false),('${YABANCI}','${GENEL}',false);
    insert into public.ozel_moduller (module_code, aciklama) values ('${OZEL}','Yalnızca AkademikMerkez');
    insert into public.ozel_modul_kurumlari (module_code, organization_id) values ('${OZEL}','${AM}');
  `);
});

describe("Yeni kurum açılışı", () => {
  test("enterprise kurum açılınca özel modül KAPALI doğar, genel modül açık doğar; açılış düşmez", () =>
    islem(db, async () => {
      await rol(db, "authenticated", KURUCU);
      const sonuc = (await tek(
        "select public.provision_customer_organization('Yeni Kurum','yeni-kurum','Eğitim','enterprise','sahip@yeni.test') as r",
      )).r;
      await rol(db, "postgres");
      const yeni = sonuc.organization_id;
      assert.equal(await acikMi(yeni, OZEL), false, "özel modül yeni enterprise kurumda açılmamalı");
      assert.equal(await acikMi(yeni, GENEL), true, "genel modülün enterprise davranışı değişmemeli");
    }));
});

describe("Kurucunun modül anahtarı (authenticated, RLS)", () => {
  test("izin listesinde OLMAYAN kurumda özel modülü açmak açık hatayla reddedilir", () =>
    islem(db, async () => {
      await rol(db, "authenticated", KURUCU);
      await reddedilir(db,
        "update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2",
        [YABANCI, OZEL], /kuruma özeldir/);
      await rol(db, "postgres");
      assert.equal(await acikMi(YABANCI, OZEL), false);
    }));

  test("izin listesindeki kurumda açılır ve kapatılır (meşru akış)", () =>
    islem(db, async () => {
      await rol(db, "authenticated", KURUCU);
      const ac = await db.query(
        "update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2 returning 1", [AM, OZEL]);
      assert.equal(ac.rows.length, 1);
      const kapat = await db.query(
        "update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = $2 returning 1", [AM, OZEL]);
      assert.equal(kapat.rows.length, 1);
      await rol(db, "postgres");
      assert.equal(await acikMi(AM, OZEL), false);
    }));

  test("özel modül her kurumda KAPATILABİLİR (kapatmak hiçbir zaman engellenmez)", () =>
    islem(db, async () => {
      await rol(db, "authenticated", KURUCU);
      const r = await db.query(
        "update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = $2 returning 1", [YABANCI, OZEL]);
      assert.equal(r.rows.length, 1);
    }));

  test("genel modülün davranışı değişmez: izin listesi olmadan her kurumda açılır", () =>
    islem(db, async () => {
      await rol(db, "authenticated", KURUCU);
      const r = await db.query(
        "update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2 returning 1", [YABANCI, GENEL]);
      assert.equal(r.rows.length, 1);
      await rol(db, "postgres");
      assert.equal(await acikMi(YABANCI, GENEL), true);
    }));

  test("kurum sahibi (kurucu değil) modül satırını değiştiremez: RLS sıfır satır (mevcut davranış)", () =>
    islem(db, async () => {
      await rol(db, "authenticated", AM_SAHIP);
      const r = await db.query(
        "update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2 returning 1", [AM, OZEL]);
      assert.equal(r.rows.length, 0);
      await rol(db, "postgres");
      assert.equal(await acikMi(AM, OZEL), false);
    }));
});

describe("İzin listesine erişim", () => {
  test("kurum sahibi izin listesini okuyamaz (sıfır satır) ve yazamaz", () =>
    islem(db, async () => {
      await rol(db, "authenticated", AM_SAHIP);
      assert.equal((await db.query("select * from public.ozel_modul_kurumlari")).rows.length, 0);
      assert.equal((await db.query("select * from public.ozel_moduller")).rows.length, 0);
      await reddedilir(db, "insert into public.ozel_modul_kurumlari (module_code, organization_id) values ($1, $2)",
        [OZEL, YABANCI], /permission denied/);
    }));

  test("kurucu izin listesini okur ama kendine izin YAZAMAZ ve silemez", () =>
    islem(db, async () => {
      await rol(db, "authenticated", KURUCU);
      assert.equal((await db.query("select * from public.ozel_modul_kurumlari where module_code = $1", [OZEL])).rows.length, 1);
      await reddedilir(db, "insert into public.ozel_modul_kurumlari (module_code, organization_id) values ($1, $2)",
        [OZEL, YABANCI], /permission denied/);
      await reddedilir(db, "delete from public.ozel_modul_kurumlari where module_code = $1", [OZEL], /permission denied/);
      await reddedilir(db, "insert into public.ozel_moduller (module_code) values ($1)", [GENEL], /permission denied/);
    }));

  test("anon izin listesine hiç erişemez", () =>
    islem(db, async () => {
      await rol(db, "anon");
      await reddedilir(db, "select * from public.ozel_modul_kurumlari", [], /permission denied/);
      await reddedilir(db, "select * from public.ozel_moduller", [], /permission denied/);
    }));

  test("izin satırı güncellenemez (kaldır + ekle zorunlu)", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await reddedilir(db, "update public.ozel_modul_kurumlari set organization_id = $1 where module_code = $2",
        [YABANCI, OZEL], /değiştirilemez/);
    }));
});

describe("Kimlikten bağımsız koruma: service_role ve migration", () => {
  test("service_role: izinsiz kurumda INSERT kapalıya çevrilir, UPDATE reddedilir", () =>
    islem(db, async () => {
      await rol(db, "service_role");
      await db.query("insert into public.organization_modules (organization_id, module_code, is_enabled) values ($1, $2, true)", [BOS_KURUM, OZEL]);
      await reddedilir(db,
        "update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2",
        [BOS_KURUM, OZEL], /kuruma özeldir/);
      await rol(db, "postgres");
      assert.equal(await acikMi(BOS_KURUM, OZEL), false);
    }));

  test("migration (postgres): izinsiz kurumda UPDATE reddedilir; upsert de geçemez", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await reddedilir(db,
        "update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2",
        [YABANCI, OZEL], /kuruma özeldir/);
      await reddedilir(db,
        `insert into public.organization_modules (organization_id, module_code, is_enabled) values ($1, $2, true)
         on conflict (organization_id, module_code) do update set is_enabled = true`,
        [YABANCI, OZEL], /kuruma özeldir/);
      assert.equal(await acikMi(YABANCI, OZEL), false);
    }));

  test("migration (postgres): izinli kurumda açar (meşru akış)", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2", [AM, OZEL]);
      assert.equal(await acikMi(AM, OZEL), true);
    }));
});

describe("Eşitleme: izin listesi tek doğruluk kaynağı", () => {
  test("kurum izin listesinden çıkarılınca modül o kurumda kapanır", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2", [AM, OZEL]);
      await db.query("delete from public.ozel_modul_kurumlari where module_code = $1 and organization_id = $2", [OZEL, AM]);
      assert.equal(await acikMi(AM, OZEL), false);
    }));

  test("açık bir modül sonradan özel ilan edilince izinsiz kurumlarda kapanır; izin verilip yeniden açılabilir", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = true where module_code = $1", [GENEL]);
      await db.query("insert into public.ozel_moduller (module_code) values ($1)", [GENEL]);
      assert.equal(await acikMi(YABANCI, GENEL), false);
      assert.equal(await acikMi(AM, GENEL), false, "izin verilmeden önce AkademikMerkez'de de kapanır");
      await db.query("insert into public.ozel_modul_kurumlari (module_code, organization_id) values ($1, $2)", [GENEL, AM]);
      assert.equal(await acikMi(AM, GENEL), false, "izin vermek modülü kendiliğinden açmaz");
      await db.query("update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2", [AM, GENEL]);
      assert.equal(await acikMi(AM, GENEL), true);
    }));

  test("modül özel olmaktan çıkarılınca açık olduğu yerde açık kalır ve artık her kurumda açılabilir", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2", [AM, OZEL]);
      await db.query("delete from public.ozel_moduller where module_code = $1", [OZEL]);
      assert.equal(await acikMi(AM, OZEL), true, "kaskatla giden izin satırı modülü kapatmamalı");
      await db.query("update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2", [YABANCI, OZEL]);
      assert.equal(await acikMi(YABANCI, OZEL), true);
    }));
});

describe("RLS yardımcısı: private.modul_kurumda_acik", () => {
  const sor = async (org, modul) => (await tek("select private.modul_kurumda_acik($1, $2) as v", [org, modul])).v;

  test("izinli + açık + üye: true; kapalıyken false", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2", [AM, OZEL]);
      await rol(db, "authenticated", AM_UYE);
      assert.equal(await sor(AM, OZEL), true);
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = $2", [AM, OZEL]);
      await rol(db, "authenticated", AM_UYE);
      assert.equal(await sor(AM, OZEL), false);
    }));

  test("başka kurumun üyesi izinli kurumun modülüne erişemez", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2", [AM, OZEL]);
      await rol(db, "authenticated", YAB_SAHIP);
      assert.equal(await sor(AM, OZEL), false);
      assert.equal(await sor(YABANCI, OZEL), false);
    }));

  test("rolünde gizlenen modül kapalı sayılır (sahip hariç)", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2", [AM, OZEL]);
      await db.query(
        "insert into public.role_module_permissions (organization_id, role, module_key, can_access) values ($1, 'member', $2, false)", [AM, OZEL]);
      await rol(db, "authenticated", AM_UYE);
      assert.equal(await sor(AM, OZEL), false);
      await rol(db, "authenticated", AM_SAHIP);
      assert.equal(await sor(AM, OZEL), true);
    }));

  /*
    İkinci savunma katmanı. Koruma tetikleyicisi izinsiz satırın açılmasını
    engellediği için normal akışta yardımcının izin listesi koşulu hiç
    sınanmıyordu: koşul silinse bile bütün senaryolar yeşil kalıyordu
    (mutasyon denemesi, 14.11.2026). Tetikleyici atlatılmış bir satır
    (süper kullanıcının replica kipi, tetikleyiciden önce yazılmış eski
    veri) RLS'te yine kapalı sayılmalı.
  */
  test("tetikleyici atlatılıp açılmış izinsiz satır RLS'te yine KAPALI sayılır", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.exec("set local session_replication_role = replica");
      await db.query("update public.organization_modules set is_enabled = true where organization_id = $1 and module_code = $2", [YABANCI, OZEL]);
      await db.exec("set local session_replication_role = origin");
      assert.equal(await acikMi(YABANCI, OZEL), true, "düzenek: satır tetikleyicisiz açıldı");
      await rol(db, "authenticated", YAB_SAHIP);
      assert.equal(await sor(YABANCI, OZEL), false);
    }));

  test("özel olmayan modülde izin listesi aranmaz", () =>
    islem(db, async () => {
      await rol(db, "authenticated", YAB_SAHIP);
      assert.equal((await tek("select private.ozel_modul_izinli($1, $2) as v", [YABANCI, GENEL])).v, true);
      assert.equal((await tek("select private.ozel_modul_izinli($1, $2) as v", [YABANCI, OZEL])).v, false);
    }));
});

describe("Fonksiyon yetkileri", () => {
  test("anon yardımcıları çalıştıramaz; tetikleyici fonksiyonları kimseye açık değil", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      const yetki = async (r, f) => (await tek("select has_function_privilege($1, $2, 'execute') as v", [r, f])).v;
      assert.equal(await yetki("anon", "private.modul_kurumda_acik(uuid, text)"), false);
      assert.equal(await yetki("anon", "private.ozel_modul_izinli(uuid, text)"), false);
      assert.equal(await yetki("authenticated", "private.modul_kurumda_acik(uuid, text)"), true);
      for (const f of ["private.ozel_modul_koru()", "private.ozel_modul_ilan_edildi()", "private.ozel_modul_izni_kaldirildi()", "private.ozel_modul_izni_degismez()"]) {
        assert.equal(await yetki("authenticated", f), false, f);
        assert.equal(await yetki("anon", f), false, f);
      }
    }));
});
