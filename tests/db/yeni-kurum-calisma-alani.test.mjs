/*
  YENİ KURULAN KURUM SAHİBİNİN ÇALIŞMA ALANINDA GÖRÜNÜR (20261015140030).

  provision_customer_organization kurumu `status = 'trial'` ile açıyordu,
  oysa get_my_workspaces `status = 'active'` arıyor. Sonuç: kurucu kurumu
  açıyor, sahip daveti kabul edip panele giriyor ve çalışma alanı listesi
  BOŞ dönüyor — lib/panel-context kullanıcıyı /kurulum'a yolluyor,
  ekranda "Kullanıcınıza henüz kurum ve paket atanmamış" yazıyor. Konsol
  ise aynı anda kurumu kurulmuş, sahibi aktif gösteriyor.

  Canlıda 15.10.2026'da yakalandı (Arvo Deneme kurumu). Bugüne kadar
  görünmemesinin sebebi, çalışan kurumların status'unun erişim anahtarıyla
  'active'e çekilmiş olması: konsoldan erişimi kapatıp açmak
  (licenses/actions cekirdekErisimi) status'u 'active' yazıyor.

  Burada sınanan üç şey:
   1. Kuruluş kurumu erişime AÇIK doğuruyor.
   2. Sahip etkin üye olunca get_my_workspaces kurumu döndürüyor.
   3. Migration'ın onarımı: 'trial'da kalmış eski kurum açılıyor,
      'suspended' olan KAPALI kalıyor (bilerek kapatılmış).
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = [
  "20261015140030_yeni_kurum_erisime_acik.sql",
];

const KURUCU = "00000000-0000-4000-8000-00000000e101";
const SAHIP = "00000000-0000-4000-8000-00000000e102";
const ARVO = "00000000-0000-4000-8000-00000000e111";
const ESKI_DENEME = "00000000-0000-4000-8000-00000000e112";
const ASKIDA = "00000000-0000-4000-8000-00000000e113";

let db;
const kurumDurumu = async (id) =>
  (await db.query("select status::text as d from public.organizations where id = $1", [id])).rows[0].d;

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  /*
    Migration'dan ÖNCEKİ durum: kurulmuş ama 'trial'da kalmış bir kurum
    ve bilerek askıya alınmış bir kurum. Kurucunun kendi kurumu
    (is_arvoos_founder onu arıyor) ayrıca gerekiyor.
  */
  await db.exec(`
    insert into auth.users (id,email) values
      ('${KURUCU}','kurucu@arvo-os.com'),('${SAHIP}','sahip@deneme.com');
    insert into public.plans (code,name,description) values ('starter','Başlangıç','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${ARVO}','ArvoOS','arvo-os','active','starter'),
      ('${ESKI_DENEME}','Eski Deneme','eski-deneme','trial','starter'),
      ('${ASKIDA}','Askıdaki','askidaki','suspended','starter');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values
      ('${ARVO}','${KURUCU}','owner',true),
      ('${ESKI_DENEME}','${SAHIP}','owner',true),
      ('${ASKIDA}','${SAHIP}','owner',true);
  `);
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
});

test("migration 'trial'da kalmış kurumu açıyor, askıdakine dokunmuyor", async () => {
  await rol(db, "postgres");
  assert.equal(await kurumDurumu(ESKI_DENEME), "active");
  assert.equal(await kurumDurumu(ASKIDA), "suspended");
});

test("yeni kurulan kurum erişime açık doğuyor ve sahibinin çalışma alanında görünüyor", async () =>
  islem(db, async () => {
    /* olarak() DEĞİL rol(): olarak kendi işlemini açıp sonunda geri alıyor,
       bir islem()'in içinde çağrılınca dış işlemi de geri alır ve bu
       noktadan sonraki her ifade kurulmamış veriye bakar (AGENTS.md). */
    await rol(db, "authenticated", KURUCU);
    const { rows } = await db.query(
      "select public.provision_customer_organization($1,$2,$3,$4,$5) as sonuc",
      ["Yeni Kurum", "yeni-kurum", "general", "starter", "yeni@sahip.com"],
    );
    const yeniId = rows[0].sonuc.organization_id;

    await rol(db, "postgres");
    assert.equal(await kurumDurumu(yeniId), "active", "kuruluş kurumu erişime açık açmalı");

    /* Sahip daveti kabul edince üye oluyor; çalışma alanı listesi onu
       bu noktadan sonra görmeli. */
    await db.query(
      "insert into public.organization_memberships (organization_id,user_id,role,is_active) values ($1,$2,'owner',true)",
      [yeniId, SAHIP],
    );
    await rol(db, "authenticated", SAHIP);
    const { rows: alanlar } = await db.query("select organization_id from public.get_my_workspaces()");
    assert.ok(
      alanlar.some((satir) => satir.organization_id === yeniId),
      "yeni kurum sahibinin çalışma alanı listesinde görünmeli",
    );
  }));
