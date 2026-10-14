/*
  FİYAT GEÇMİŞİ VE TOPLU YAYIM (20261014064505).

  Sınananlar:
  1. MEŞRU yol: kurucu taslak kaydeder (geçmişte 'taslak'), bekleyen
     bütün taslakları tek çağrıda yayımlar — hepsi AYNI anda yayına
     girer, geçmişe önceki ve yeni tutarla 'yayim' yazılır.
  2. Yayımlanmış satırın taslağı yayımlanana kadar sitede görünmez
     (anon yalnızca yayındaki tutarı okur).
  3. Koda dönüş geçmişe yazılır ve bayrağı kapalı satır ikinci toplu
     yayımda yeniden yayımlanmaz.
  4. Kurucu olmayan kullanıcı yayımlayamaz, geçmişi okuyamaz; anon
     işlevi çağıramaz. Geçmiş elle yazılamaz (kurucu da yazamaz).
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = [
  "20261014064505_fiyat_gecmisi_ve_toplu_yayim.sql",
];

const ARVO = "00000000-0000-4000-8000-00000000d101";
const KIRACI = "00000000-0000-4000-8000-00000000d102";
const KURUCU = "00000000-0000-4000-8000-00000000d111";
const YABANCI = "00000000-0000-4000-8000-00000000d112";

let db;
const taslak = (kod, kurus) => db.query(
  `insert into public.platform_fiyat_listesi (kod, tur, taslak_kurus, taslak_bekliyor, updated_by)
   values ($1, 'plan', $2, true, auth.uid())
   on conflict (kod) do update set taslak_kurus = excluded.taslak_kurus, taslak_bekliyor = true, updated_at = now()`,
  [kod, kurus]);
const gecmis = async () => (await db.query(`select kod, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim from public.platform_fiyat_gecmisi order by id`)).rows;

before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${KURUCU}','k@arvo-os.com'),('${YABANCI}','y@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code,kind) values
      ('${ARVO}','ArvoOS','arvo-os','active','starter','internal'),
      ('${KIRACI}','Kiracı','kiraci','active','starter','customer');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values
      ('${ARVO}','${KURUCU}','owner',true),('${KIRACI}','${YABANCI}','owner',true);
  `);
});

test("kurucu taslak kaydeder ve bütün taslakları tek anda yayımlar", async () =>
  islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    await taslak("arvoos-baslangic", 219000);
    await taslak("arvoos-kurumsal", 649000);

    // Yayımlanmadan site görmez.
    await rol(db, "anon");
    assert.equal((await db.query(`select count(*)::int as n from public.platform_fiyat_listesi`)).rows[0].n, 0);

    await rol(db, "authenticated", KURUCU);
    const { rows: [{ n }] } = await db.query(`select public.platform_fiyatlari_yayimla() as n`);
    assert.equal(n, 2);
    const { rows } = await db.query(`select kod, aylik_kurus, yayimlandi_at, taslak_bekliyor from public.platform_fiyat_listesi order by kod`);
    assert.deepEqual(rows.map((r) => [r.kod, Number(r.aylik_kurus), r.taslak_bekliyor]),
      [["arvoos-baslangic", 219000, false], ["arvoos-kurumsal", 649000, false]]);
    assert.equal(String(rows[0].yayimlandi_at), String(rows[1].yayimlandi_at), "liste tek anda yayına girmeli");

    const g = await gecmis();
    assert.deepEqual(g.map((s) => [s.kod, s.islem]), [
      ["arvoos-baslangic", "taslak"], ["arvoos-kurumsal", "taslak"],
      ["arvoos-baslangic", "yayim"], ["arvoos-kurumsal", "yayim"],
    ]);
    // İlk yayımda önceki tutar koddaki değerdi (yayında satır yoktu).
    assert.equal(g[2].onceki_yayimli, false);
    assert.equal(Number(g[2].yeni_kurus), 219000);
    assert.equal(g[2].kim, KURUCU);

    // Anon artık yayındaki tutarı okur.
    await rol(db, "anon");
    assert.equal((await db.query(`select count(*)::int as n from public.platform_fiyat_listesi`)).rows[0].n, 2);
  }));

test("yayındaki satırın yeni taslağı ve zammı: önceki yayın tutarı geçmişte", async () =>
  islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    await taslak("arc-buyume", 299000);
    await db.query(`select public.platform_fiyatlari_yayimla()`);
    await taslak("arc-buyume", 349000);
    // Taslak yayımlanana kadar yayındaki tutar değişmez.
    await rol(db, "anon");
    assert.equal(Number((await db.query(`select aylik_kurus from public.platform_fiyat_listesi where kod = 'arc-buyume'`)).rows[0].aylik_kurus), 299000);
    await rol(db, "authenticated", KURUCU);
    await db.query(`select public.platform_fiyatlari_yayimla()`);
    const son = (await gecmis()).filter((s) => s.kod === "arc-buyume").at(-1);
    assert.deepEqual([son.islem, Number(son.onceki_kurus), son.onceki_yayimli, Number(son.yeni_kurus)], ["yayim", 299000, true, 349000]);
  }));

test("koda dönüş geçmişe yazılır, eski taslak ikinci yayımda geri gelmez", async () =>
  islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    await taslak("randevu-tek", 79900);
    await db.query(`select public.platform_fiyatlari_yayimla()`);
    await db.query(`update public.platform_fiyat_listesi set aylik_kurus = null, yayimlandi_at = null, taslak_bekliyor = false where kod = 'randevu-tek'`);
    assert.equal((await gecmis()).at(-1).islem, "koda_donus");
    const { rows: [{ n }] } = await db.query(`select public.platform_fiyatlari_yayimla() as n`);
    assert.equal(n, 0, "koda dönen satır yeniden yayımlanmamalı");
  }));

test("kurucu olmayan yayımlayamaz ve geçmişi okuyamaz; anon çağıramaz; geçmiş elle yazılamaz", async () =>
  islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    await taslak("arvoos-baslangic", 1);
    await rol(db, "authenticated", YABANCI);
    await reddedilir(db, `select public.platform_fiyatlari_yayimla()`, [], /kurucu yetkisi/);
    assert.equal((await db.query(`select count(*)::int as n from public.platform_fiyat_gecmisi`)).rows[0].n, 0);
    await rol(db, "anon");
    await reddedilir(db, `select public.platform_fiyatlari_yayimla()`, [], /permission denied/);
    await reddedilir(db, `select * from public.platform_fiyat_gecmisi`, [], /permission denied/);
    await rol(db, "authenticated", KURUCU);
    await reddedilir(db, `insert into public.platform_fiyat_gecmisi (kod, islem) values ('x', 'yayim')`, [], /permission denied/);
    await reddedilir(db, `delete from public.platform_fiyat_gecmisi`, [], /permission denied/);
  }));
