/*
  ANALİTİK MODÜLÜ (20261022092820).

  Kanıtlanan: takip kodundan gelen olay yalnızca kayıtlı alan adından
  yazılır; kurumda kapalı modül yazmaz ve okunmaz; özet tekil
  ziyaretçiyi günlük sayar ve formun kaynağını ziyaretçinin o günkü
  GİRİŞ kaynağından alır; başka kurum hiçbir şey göremez; anon yalnızca
  yazma işlevini çağırabilir.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20261022092820_analitik_modulu.sql");
const KURUM = "00000000-0000-4000-8000-00000000a901";
const YABANCI_KURUM = "00000000-0000-4000-8000-00000000a902";
const SAHIP = "00000000-0000-4000-8000-00000000a911";
const YABANCI = "00000000-0000-4000-8000-00000000a912";
const SITE = "00000000-0000-4000-8000-00000000a921";
const ANAHTAR = "abcdef0123456789abcdef01";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','s@x.com'),('${YABANCI}','y@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','AM','am','active','starter'),('${YABANCI_KURUM}','YK','yk','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${YABANCI_KURUM}','${YABANCI}','owner');
  `);
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  /* Düzenek tabloları Supabase varsayılanıyla açıyor; migration'ın kapısı sınansın. */
  await db.exec(`
    revoke all on public.analitik_olaylar from anon, authenticated;
    revoke all on public.analitik_siteler from anon;
    update public.organization_modules set is_enabled = true where organization_id = '${KURUM}' and module_code = 'analitik';
    insert into public.analitik_siteler (id, organization_id, ad, alan_adi, anahtar)
      values ('${SITE}', '${KURUM}', 'AkademikMerkez', 'akademikmerkez.com', '${ANAHTAR}');
  `);
});

async function yaz({ konak = "akademikmerkez.com", tur = "sayfa", yol = "/", kaynak = "Doğrudan", kampanya = null, ip = "1.1.1.1", ua = "UA", ulke = "TR", sehir = "İstanbul" } = {}) {
  await rol(db, "anon");
  await db.query(
    `select public.analitik_olay_yaz($1,$2,$3,$4,$5,null,$6,null,$7,$8,41.0,29.0,'mobil','Safari',$9,$10)`,
    [ANAHTAR, konak, tur, yol, kaynak, kampanya, ulke, sehir, ip, ua],
  );
  await rol(db, "postgres");
}
const olaySayisi = async () => Number((await tek(`select count(*) as n from public.analitik_olaylar`)).n);

describe("yazma", () => {
  test("kayıtlı alan adından ve alt alan adından yazılır; başka siteden yazılmaz", () =>
    islem(db, async () => {
      await yaz();
      await yaz({ konak: "www.akademikmerkez.com" });
      await yaz({ konak: "blog.akademikmerkez.com" });
      await yaz({ konak: "kopyalayan-site.com" });
      await yaz({ konak: "sahteakademikmerkez.com" });
      assert.equal(await olaySayisi(), 3);
      const site = await tek(`select ilk_olay_at, son_olay_at from public.analitik_siteler where id = $1`, [SITE]);
      assert.ok(site.ilk_olay_at, "kurulum kanıtı yazılmalı");
    }));

  test("kurumda kapalı modül yazmaz", () =>
    islem(db, async () => {
      await db.exec(`update public.organization_modules set is_enabled = false where organization_id = '${KURUM}' and module_code = 'analitik'`);
      await yaz();
      assert.equal(await olaySayisi(), 0);
    }));

  test("dakikada 60'tan fazla olay yazılmaz", () =>
    islem(db, async () => {
      for (let i = 0; i < 65; i++) await yaz({ yol: `/s${i}` });
      assert.equal(await olaySayisi(), 60);
    }));

  test("anon tabloyu doğrudan okuyamaz ve yazamaz", () =>
    islem(db, async () => {
      await rol(db, "anon");
      await reddedilir(db, `select * from public.analitik_olaylar`, [], /permission denied/);
      await reddedilir(db, `select public.analitik_ozet($1, current_date, current_date)`, [SITE], /permission denied/);
    }));
});

describe("özet", () => {
  test("tekil ziyaretçi, kaynak ve formun giriş kaynağı", () =>
    islem(db, async () => {
      // Ziyaretçi A: Instagram'dan girdi, iki sayfa gezdi, form doldurdu (formun yönlendireni site içi = Doğrudan).
      await yaz({ ip: "A", kaynak: "Instagram", kampanya: "ekim" });
      await yaz({ ip: "A", yol: "/iletisim" });
      await yaz({ ip: "A", yol: "/iletisim", tur: "form" });
      // Ziyaretçi B: Google, tek sayfa.
      await yaz({ ip: "B", kaynak: "Google", ulke: "DE", sehir: "Berlin" });

      await rol(db, "authenticated", SAHIP);
      const { ozet } = await tek(`select public.analitik_ozet($1, current_date - 1, current_date + 1) as ozet`, [SITE]);
      await rol(db, "postgres");

      assert.equal(ozet.ziyaretci, 2);
      assert.equal(ozet.sayfa, 3);
      assert.equal(ozet.form, 1);
      assert.equal(ozet.tekSayfa, 1);
      const instagram = ozet.kaynaklar.find((k) => k.ad === "Instagram");
      assert.equal(instagram.adet, 1);
      assert.equal(instagram.form, 1, "form Instagram'a yazılmalı, Doğrudan'a değil");
      assert.deepEqual(ozet.kampanyalar.map((k) => k.ad), ["ekim"]);
      assert.deepEqual(ozet.ulkeler.map((u) => u.ad).sort(), ["DE", "TR"]);
      assert.equal(ozet.gunluk.length, 1);
    }));

  test("canlı: şu an ve akış", () =>
    islem(db, async () => {
      await yaz({ ip: "A" });
      await yaz({ ip: "B" });
      await rol(db, "authenticated", SAHIP);
      const { canli } = await tek(`select public.analitik_canli($1) as canli`, [SITE]);
      await rol(db, "postgres");
      assert.equal(canli.suAn, 2);
      assert.equal(canli.akis.length, 2);
      assert.equal(canli.noktalar.length, 1);
    }));

  test("başka kurumun üyesi özeti, canlıyı ve siteyi göremez", () =>
    islem(db, async () => {
      await rol(db, "authenticated", YABANCI);
      await reddedilir(db, `select public.analitik_ozet($1, current_date, current_date)`, [SITE], /yetkiniz yok/);
      await reddedilir(db, `select public.analitik_canli($1)`, [SITE], /yetkiniz yok/);
      const { rows } = await db.query(`select id from public.analitik_siteler`);
      assert.equal(rows.length, 0);
    }));

  test("kurumda kapatılan modülün verisi okunmaz", () =>
    islem(db, async () => {
      await db.exec(`update public.organization_modules set is_enabled = false where organization_id = '${KURUM}' and module_code = 'analitik'`);
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.analitik_ozet($1, current_date, current_date)`, [SITE], /yetkiniz yok/);
    }));
});

describe("site kaydı", () => {
  test("anahtar ve kurum panelden değiştirilemez", () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `update public.analitik_siteler set anahtar = 'baska0123456789abcdef' where id = $1`, [SITE], /değiştirilemez/);
      await db.query(`update public.analitik_siteler set ad = 'Yeni ad' where id = $1`, [SITE]);
      await rol(db, "postgres");
      assert.equal((await tek(`select ad from public.analitik_siteler where id = $1`, [SITE])).ad, "Yeni ad");
    }));

  test("geçersiz alan adı reddedilir", () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `insert into public.analitik_siteler (organization_id, ad, alan_adi) values ($1, 'X', 'https://a.com/')`, [KURUM], /check/);
    }));
});
