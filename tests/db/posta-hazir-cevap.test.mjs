/*
  HAZIR CEVAPLAR — kim okur, kim yazar.

  Metin kurumun: posta modülü açık olan herkes OKUR (cevabı kullanacak
  olan o), yazma da modül kapısından geçer ama asıl yetki sunucuda
  (posta.yonet) — RLS "kim yazabilir"i söyler, "hangi yetkiyle"yi
  söylemez. Burada sınanan kapı ve kurum sınırı.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);

const KURUM = "00000000-0000-4000-8000-00000000c1a1";
const BASKA_KURUM = "00000000-0000-4000-8000-00000000c1a2";
const SAHIP = "00000000-0000-4000-8000-00000000c1b1";
const PERSONEL = "00000000-0000-4000-8000-00000000c1b2";

let db;
before(async () => {
  db = await veritabani();
  // Modül kapısı anlık görüntüde; tablo yeni, buradan kuruluyor.
  await db.exec(fs.readFileSync(migration("20261010121708_posta_hazir_cevaplar.sql"), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','sahip@x.com'),('${PERSONEL}','personel@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code)
      values ('${KURUM}','AM','am','active','starter'),('${BASKA_KURUM}','BK','bk','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role)
      values ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${PERSONEL}','member');
    insert into public.mail_templates (organization_id,ad,govde,olusturan)
      values ('${KURUM}','Fiyat bilgisi','Sayın {{musteri}}, ücret …','${SAHIP}');
    insert into public.mail_templates (organization_id,ad,govde)
      values ('${BASKA_KURUM}','Gizli','başka kurumun metni');
  `);
});

describe("hazır cevaplar", () => {
  test("modülü açık personel okuyor, başka kurumunkini görmüyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", PERSONEL);
      const { rows } = await db.query(`select ad from public.mail_templates order by ad`);
      await rol(db, "postgres");
      assert.deepEqual(rows.map((r) => r.ad), ["Fiyat bilgisi"]);
    }));

  test("posta modülü kapalıyken okunmuyor", async () =>
    islem(db, async () => {
      await db.query(
        `insert into public.role_module_permissions (organization_id,role,module_key,can_access)
         values ($1,'member','posta',false)
         on conflict (organization_id,role,module_key) do update set can_access = false`, [KURUM]);
      await rol(db, "authenticated", PERSONEL);
      const { rows } = await db.query(`select ad from public.mail_templates`);
      await rol(db, "postgres");
      assert.equal(rows.length, 0, "modülü kapalı personel hazır cevapları okuyabiliyor");
    }));

  test("aynı ad iki kez eklenemiyor (büyük/küçük harf duyarsız)", async () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.exec("savepoint ayni_ad");
      let hata = null;
      try {
        await db.query(`insert into public.mail_templates (organization_id,ad,govde) values ($1,'  fiyat BİLGİSİ  ','ikinci metin')`, [KURUM]);
      } catch (e) { hata = e; }
      await db.exec("rollback to savepoint ayni_ad");
      assert.ok(hata, "aynı adla ikinci hazır cevap eklenebiliyor");
      assert.match(hata.message, /mail_templates_ad_uidx|duplicate/i);
    }));

  test("boş ad ve boş metin kısıtla engelleniyor", async () =>
    islem(db, async () => {
      await rol(db, "postgres");
      for (const [ad, govde, beklenen] of [[" a ", "metin", /ad_bos_degil/], ["Ad", "  ", /govde_bos_degil/]]) {
        await db.exec("savepoint kisit");
        let hata = null;
        try {
          await db.query(`insert into public.mail_templates (organization_id,ad,govde) values ($1,$2,$3)`, [KURUM, ad, govde]);
        } catch (e) { hata = e; }
        await db.exec("rollback to savepoint kisit");
        assert.ok(hata && beklenen.test(hata.message), `beklenen kısıt tutmadı: ${ad}/${govde}`);
      }
    }));
});
