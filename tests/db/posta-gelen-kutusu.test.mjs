/*
  ORTAK POSTA KUTUSU — kimin neyi görebildiği ve yazabildiği.

  İki kural sınanıyor:

  1. MODÜL KAPISI VERİTABANINDA. Panelde modülü kapatmak diğer modüllerde
     yalnızca uygulama katmanında duruyor ve oturum jetonu tarayıcıda
     olduğu için kapatılmış bir modülün tabloları API'den okunabiliyor.
     Posta yeni olduğu için bu açığı devralmadı; karar sırası panelle
     birebir aynı (kişi satırı → rol satırı → açık).

  2. RLS "KİM YAZABİLİR"İ SÖYLER, "NEYİ"Yİ SÖYLEMEZ. Personel konuşmanın
     ortak durumunu (ilgilenen, durum) değiştirebilmeli ama konusunu ve
     tarihini değiştirememeli; o alanlar Gmail'den geliyor. Meşru akış da
     burada yeşil kalmalı, yoksa koruma özelliği kullanılamaz yapar.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATIONLAR = [
  // mail_accounts anlık görüntüden ÖNCE uygulandığı için dökümde yok;
  // geçmiş sütunları ona ekleniyor, o yüzden bu da kurulmalı.
  "20261006171515_ortak_posta_kutusu.sql",
  "20261006190207_posta_gelen_kutusu.sql",
  "20261006193918_posta_gecmis_ve_crm_bagi.sql",
  "20261008180253_posta_kutulari_ve_silme.sql",
].map((ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad));

const KURUM = "00000000-0000-4000-8000-0000000006a1";
const BASKA_KURUM = "00000000-0000-4000-8000-0000000006a2";
const SAHIP = "00000000-0000-4000-8000-0000000006b1";
const PERSONEL = "00000000-0000-4000-8000-0000000006b2";
const YABANCI = "00000000-0000-4000-8000-0000000006b3";
const KONUSMA = "thread-001";
const FIRSAT = "00000000-0000-4000-8000-0000000006c1";
const BASKA_FIRSAT = "00000000-0000-4000-8000-0000000006c2";

let db;
before(async () => {
  db = await veritabani();
  for (const m of MIGRATIONLAR) await db.exec(fs.readFileSync(m, "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${SAHIP}','sahip@y.com'),('${PERSONEL}','personel@y.com'),('${YABANCI}','yabanci@z.com');
    insert into public.plans (code,name,description) values ('starter','Başlangıç','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','Akademik Merkez','akademik-merkez','active','starter'),
      ('${BASKA_KURUM}','Başka Firma','baska-firma','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),
      ('${KURUM}','${PERSONEL}','member'),
      ('${BASKA_KURUM}','${YABANCI}','member');
    insert into public.mail_threads (organization_id,thread_id,konu,son_gonderen_adres,son_mesaj_at,ozet,mesaj_sayisi)
      values ('${KURUM}','${KONUSMA}','Teklif talebi','musteri@x.com',now(),'Merhaba',2);
    insert into public.mail_messages (organization_id,message_id,thread_id,gonderen_adres,konu,tarih,yon)
      values ('${KURUM}','msg-1','${KONUSMA}','musteri@x.com','Teklif talebi',now(),'gelen');
    insert into public.crm_opportunities (id,organization_id,title,customer_name,contact_email,created_by,estimated_value)
      values ('${FIRSAT}','${KURUM}','Tez danışmanlığı','Ayşe Yılmaz','musteri@x.com','${SAHIP}',100000);
    insert into public.crm_opportunities (id,organization_id,title,customer_name,created_by,estimated_value)
      values ('${BASKA_FIRSAT}','${BASKA_KURUM}','Başka iş','Başka Müşteri','${YABANCI}',5000);
  `);
});

const modulKurali = (rolAdi, acik) => db.query(
  `insert into public.role_module_permissions (organization_id,role,module_key,can_access)
   values ($1,$2,'posta',$3)
   on conflict (organization_id,role,module_key) do update set can_access = excluded.can_access`,
  [KURUM, rolAdi, acik]);

const kisiKurali = (userId, acik) => db.query(
  `insert into public.member_module_permissions (organization_id,user_id,module_key,can_access)
   values ($1,$2,'posta',$3)
   on conflict (organization_id,user_id,module_key) do update set can_access = excluded.can_access`,
  [KURUM, userId, acik]);

/*
  Rol değişimi islem() İÇİNDE rol() ile. olarak() kendi işlemini açıp
  geri alıyor; bir islem()'in içinde çağrıldığında dış işlemi de geri
  alıyor ve sonraki ifadeler kuralsız duruma bakıyor.
*/
const konusmaSayisi = async (userId) => {
  await rol(db, "authenticated", userId);
  const { rows } = await db.query(`select thread_id from public.mail_threads`);
  await rol(db, "postgres");
  return rows.length;
};

describe("ortak posta kutusu erişimi", () => {
  test("kurumun personeli konuşmaları görüyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => { assert.equal(await konusmaSayisi(PERSONEL), 1); });
  });

  test("başka kurumun üyesi hiçbir şey görmüyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => { assert.equal(await konusmaSayisi(YABANCI), 0); });
  });

  test("posta modülü rolde kapatılınca konuşmalar da kapanıyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await modulKurali("member", false);
      assert.equal(await konusmaSayisi(PERSONEL), 0);
      // Kurum Sahibi kısıtlanamaz.
      assert.equal(await konusmaSayisi(SAHIP), 1);
    });
  });

  test("kişi istisnası rolde kapalı modülü geri açıyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await modulKurali("member", false);
      await kisiKurali(PERSONEL, true);
      assert.equal(await konusmaSayisi(PERSONEL), 1);
    });
  });

  test("MEŞRU AKIŞ: personel ortak durumu güncelleyebiliyor", async () => {
    // Koruma eklerken en kolay kırılan şey bu: ekip konuşmayı üstlenemezse
    // ortak kutunun tek anlamlı özelliği kullanılamaz hâle gelir.
    await rol(db, "postgres");
    await islem(db, async () => {
      await rol(db, "authenticated", PERSONEL);
        const { rows } = await db.query(
          `update public.mail_threads set durum = 'yanitlandi', ilgilenen_user_id = $1
            where organization_id = $2 and thread_id = $3 returning durum, ilgilenen_user_id`,
          [PERSONEL, KURUM, KONUSMA]);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].durum, "yanitlandi");
        assert.equal(rows[0].ilgilenen_user_id, PERSONEL);
      await rol(db, "postgres");
    });
  });

  test("posta alanları panelden değiştirilemiyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await rol(db, "authenticated", PERSONEL);
        await reddedilir(
          db,
          `update public.mail_threads set konu = 'Başka konu' where organization_id = $1 and thread_id = $2`,
          [KURUM, KONUSMA],
          /panelden değiştirilemez/i,
        );
      await rol(db, "postgres");
    });
  });

  test("MEŞRU AKIŞ: personel konuşmayı müşteri kaydına bağlayabiliyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await rol(db, "authenticated", PERSONEL);
        const { rows } = await db.query(
          `update public.mail_threads set opportunity_id = $1
            where organization_id = $2 and thread_id = $3 returning opportunity_id`,
          [FIRSAT, KURUM, KONUSMA]);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].opportunity_id, FIRSAT);
      await rol(db, "postgres");
    });
  });

  test("konuşma başka kurumun kaydına bağlanamıyor", async () => {
    /*
      RLS yazarın yetkisini denetliyor ama hedefi denetlemiyor: posta
      modülüne erişen biri başka kurumun fırsat kimliğini yazabilirdi.
    */
    await rol(db, "postgres");
    await islem(db, async () => {
      await rol(db, "authenticated", PERSONEL);
        await reddedilir(
          db,
          `update public.mail_threads set opportunity_id = $1 where organization_id = $2 and thread_id = $3`,
          [BASKA_FIRSAT, KURUM, KONUSMA],
          /kendi kurumunuzun bir kaydına/i,
        );
      await rol(db, "postgres");
    });
  });

  test("MEŞRU AKIŞ: personel yazışmayı silebiliyor", async () => {
    /* Silme sunucu işleminde ayrı bir yetki istiyor (posta.sil) ama RLS
       katmanında kural modül kapısı: modülü açık olan kendi kurumunun
       yazışmasını silebilmeli, yoksa işlem RLS'te takılırdı. */
    await rol(db, "postgres");
    await islem(db, async () => {
      await rol(db, "authenticated", PERSONEL);
      const { rows } = await db.query(
        `delete from public.mail_threads where organization_id = $1 and thread_id = $2 returning thread_id`,
        [KURUM, KONUSMA]);
      await rol(db, "postgres");
      assert.equal(rows.length, 1);
    });
  });

  test("posta modülü kapalıyken silinemiyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await db.query(
        `insert into public.role_module_permissions (organization_id,role,module_key,can_access)
         values ($1,'member','posta',false)
         on conflict (organization_id,role,module_key) do update set can_access = false`, [KURUM]);
      await rol(db, "authenticated", PERSONEL);
      const { rows } = await db.query(
        `delete from public.mail_threads where organization_id = $1 and thread_id = $2 returning thread_id`,
        [KURUM, KONUSMA]);
      await rol(db, "postgres");
      assert.equal(rows.length, 0, "modülü kapalı personel silebiliyor");
    });
  });

  test("kutular mevcut satırlar için dolduruldu", async () => {
    /* Migration bir kerelik doldurma yapmasaydı, eşitleme o konuşmaya
       yeniden dokunana kadar gönderilenler kutusu boş görünürdü. */
    await rol(db, "postgres");
    const { rows } = await db.query(
      `select gelen_var, giden_var from public.mail_threads where organization_id = $1 and thread_id = $2`,
      [KURUM, KONUSMA]);
    assert.equal(rows[0].gelen_var, true, "gelen mesajı olan konuşma gelen kutusunda değil");
    assert.equal(rows[0].giden_var, false);
  });

  test("sunucu eşitlemesi posta alanlarını yazabiliyor", async () => {
    // Tetikleyici yalnızca istek bağlamı 'authenticated' olduğunda kapıyor;
    // service_role ile gelen eşitleme konuyu ve tarihi yazmak zorunda.
    await rol(db, "postgres");
    await islem(db, async () => {
      const { rows } = await db.query(
        `update public.mail_threads set konu = 'Gmail''den gelen yeni konu', mesaj_sayisi = 3
          where organization_id = $1 and thread_id = $2 returning konu, mesaj_sayisi`,
        [KURUM, KONUSMA]);
      assert.equal(rows[0].konu, "Gmail'den gelen yeni konu");
      assert.equal(rows[0].mesaj_sayisi, 3);
    });
  });
});
