/*
  MODÜL KAPISI VERİTABANINDA.

  Panelden modül kapatmak yalnızca uygulama katmanındaydı; oturum jetonu
  tarayıcıda olduğu için kapatılmış modülün tabloları PostgREST'ten
  okunabiliyordu. Kapı artık RLS'te.

  TESTİN ASIL YÜKÜ MEŞRU AKIŞ. Koruma eklerken en kolay kırılan şey
  görmesi GEREKENİN görememesi; 19.09.2026'da teklif dondurma kuralı
  yalnızca saldırı senaryolarıyla sınandı ve müşterinin onayını canlıda
  kırdı. Burada her tablo iki yönden sınanıyor: modül açıkken okunuyor
  mu, kapalıyken kapanıyor mu.

  Ayrıca mevcut kuralların KORUNDUĞU sınanıyor: operasyon adımlarında
  "yalnızca işi görebilen", primlerde "yetkili ya da kendi kaydı".
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATIONLAR = [
  "20261006190207_posta_gelen_kutusu.sql",   // private.arvo_modul_acik buradan
  "20261006195339_modul_kapisi_veritabaninda.sql",
].map((ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad));

const KURUM = "00000000-0000-4000-8000-0000000007a1";
const SAHIP = "00000000-0000-4000-8000-0000000007b1";
const PERSONEL = "00000000-0000-4000-8000-0000000007b2";
const PERSONEL_KAYDI = "00000000-0000-4000-8000-0000000007c1";

let db;
before(async () => {
  db = await veritabani();
  for (const m of MIGRATIONLAR) await db.exec(fs.readFileSync(m, "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','sahip@y.com'),('${PERSONEL}','personel@y.com');
    insert into public.plans (code,name,description) values ('starter','Başlangıç','');
    insert into public.organizations (id,name,slug,status,plan_code)
      values ('${KURUM}','Akademik Merkez','akademik-merkez','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${PERSONEL}','member');
    insert into public.hr_employees (id,organization_id,user_id,full_name,employment_type,employment_status)
      values ('${PERSONEL_KAYDI}','${KURUM}','${PERSONEL}','Personel Bir','full_time','active');

    insert into public.account_parties (organization_id,name,party_type,created_by)
      values ('${KURUM}','Musteri Firma','customer','${SAHIP}');
    insert into public.finance_transactions (organization_id,title,amount,currency,transaction_type,status,created_by)
      values ('${KURUM}','Tahsilat',10000,'TRY','income','paid','${SAHIP}');
    insert into public.organization_crm_stages (organization_id,code,name,sort_order)
      values ('${KURUM}','yeni','Yeni',1);
  `);
});

const modulKurali = (modul, acik) => db.query(
  `insert into public.role_module_permissions (organization_id,role,module_key,can_access)
   values ($1,'member',$2,$3)
   on conflict (organization_id,role,module_key) do update set can_access = excluded.can_access`,
  [KURUM, modul, acik]);

/*
  Rol değişimi islem() İÇİNDE yapılıyor, olarak() ile DEĞİL.

  olarak() kendi işlemini açıp sonunda geri alıyor; bir islem()'in
  içinde çağrıldığında DIŞ işlemi de geri alıyor ve o noktadan sonraki
  her ifade kuralsız duruma bakıyor. Kuralı kurup iki kez okuyan bir
  test bu yüzden ikinci okumada yanlış şeyi ölçüyordu — ölçülerek
  bulundu (06.10.2026), tahminle değil.
*/
const sayi = async (userId, tablo) => {
  await rol(db, "authenticated", userId);
  const { rows } = await db.query(`select 1 from public.${tablo}`);
  await rol(db, "postgres");
  return rows.length;
};

describe("modül kapısı veritabanında", () => {
  test("MEŞRU AKIŞ: hiçbir kural yokken personel her şeyi görüyor", async () => {
    // Varsayılan açık: hiçbir kurumun davranışı bu migration'la değişmemeli.
    await rol(db, "postgres");
    await islem(db, async () => {
      assert.equal(await sayi(PERSONEL, "account_parties"), 1);
      assert.equal(await sayi(PERSONEL, "finance_transactions"), 1);
      assert.equal(await sayi(PERSONEL, "organization_crm_stages"), 1);
    });
  });

  test("finans kapatılınca cari ve banka kapanıyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await modulKurali("finance", false);
      assert.equal(await sayi(PERSONEL, "account_parties"), 0);
      // Kurum Sahibi kısıtlanamaz.
      assert.equal(await sayi(SAHIP, "account_parties"), 1);
    });
  });

  test("finans hareketleri İK açıkken görünmeye devam ediyor", async () => {
    /*
      Prim ödemesi finans hareketine düşüyor ve İK ekranından okunuyor:
      kapı "finans VEYA İK". Yalnızca finansa bakmak İK'yı kırardı.
    */
    await rol(db, "postgres");
    await islem(db, async () => {
      await modulKurali("finance", false);
      assert.equal(await sayi(PERSONEL, "finance_transactions"), 1, "İK açıkken görünmeli");
      await modulKurali("hr", false);
      assert.equal(await sayi(PERSONEL, "finance_transactions"), 0, "ikisi de kapalıyken kapanmalı");
    });
  });

  test("CRM kapatılınca aşama listesi kapanıyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await modulKurali("crm", false);
      assert.equal(await sayi(PERSONEL, "organization_crm_stages"), 0);
    });
  });

  test("kişi istisnası rolde kapalı modülü geri açıyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await modulKurali("finance", false);
      await db.query(
        `insert into public.member_module_permissions (organization_id,user_id,module_key,can_access)
         values ($1,$2,'finance',true)`, [KURUM, PERSONEL]);
      assert.equal(await sayi(PERSONEL, "account_parties"), 1);
    });
  });
});
