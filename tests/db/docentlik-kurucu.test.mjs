/*
  KURUCU DOÇENTLİK VERİSİNİ KENDİLİĞİNDEN GÖRMEZ (F6 PR4).

  Kurucu (Arvo'nun kendi kurumunun sahibi, private.is_arvoos_founder)
  konsoldan kurumların modüllerini açıp kapatabilir; bu, verilerini görmek
  demek değil. Doçentlik politikaları kurucuya hiçbir dal açmıyor
  (20261114200939) ve panel kurucu konsolunu Arvo'nun kendi kurumuyla
  çalıştırıyor, orada modül yok.

  Kurucu AkademikMerkez'in de üyesiyse o ÜYELİĞİN rolüyle girer: Kurum
  Sahibi istisnası kurucu olduğu için değil, o kurumun sahibi olduğu
  için. Son senaryo bunu sabitliyor.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";
import { AM, K, R, tohumla } from "./docentlik-ortak.mjs";

const ARVO = "00000000-0000-4000-8000-00000000d0f1";
const KURUCU = "00000000-0000-4000-8000-00000000d0f2";
const TABLOLAR = ["docentlik_kriterleri", "docentlik_hedefleri", "docentlik_profilleri", "docentlik_faaliyetleri", "docentlik_uak_tablolari"];

let db;
const sayi = async (sql, p = []) => (await db.query(sql, p)).rows[0].n;

before(async () => {
  db = await veritabani();
  await tohumla(db);
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${KURUCU}','kurucu@arvo-os.test');
    insert into public.organizations (id, name, slug, status, plan_code) values ('${ARVO}','ArvoOS','arvo-os','active','starter');
    insert into public.organization_memberships (organization_id, user_id, role, is_active) values ('${ARVO}','${KURUCU}','owner',true);
  `);
});

test("kurucu kurucudur ama Doçentlik tablolarının hiçbirinde satır görmez, yetkisi yok", () =>
  islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    assert.equal((await db.query("select private.is_arvoos_founder() as v")).rows[0].v, true, "tohum: kurucu değil");
    for (const t of TABLOLAR) assert.equal(await sayi(`select count(*)::int n from public.${t}`), 0, t);
    assert.equal((await db.query("select * from public.docentlik_profil_ozetleri($1)", [AM])).rows.length, 0);
    assert.equal((await db.query("select * from public.docentlik_faaliyet_donemleri($1)", [AM])).rows.length, 0);
    for (const a of ["docentlik.tumunu_gor", "docentlik.kriter_yonet", "docentlik.uak_yonet"]) {
      assert.equal((await db.query("select private.docentlik_yetkisi($1, $2) as v", [AM, a])).rows[0].v, false, a);
    }
    assert.equal((await db.query("select private.modul_kurumda_acik($1, 'docentlik') as v", [AM])).rows[0].v, false);
  }));

test("kurucu modülü konsoldan kapatabilir (yönetim yetkisi), bu ona veri açmaz", () =>
  islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const { rows } = await db.query(
      "update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = 'docentlik' returning is_enabled", [AM]);
    assert.equal(rows.length, 1, "kurucu modül anahtarını değiştirebilmeli");
    assert.equal(await sayi("select count(*)::int n from public.docentlik_faaliyetleri"), 0);
  }));

test("kurucu AkademikMerkez'in sahibiyse o üyeliğin rolüyle görür (Kurum Sahibi istisnası korunuyor)", () =>
  islem(db, async () => {
    await rol(db, "postgres");
    await db.query("insert into public.organization_memberships (organization_id, user_id, role, is_active) values ($1, $2, 'owner', true)", [AM, KURUCU]);
    await rol(db, "authenticated", KURUCU);
    assert.equal(await sayi("select count(*)::int n from public.docentlik_faaliyetleri where id = $1", [R.faaliyet]), 1);
    // Profil yine kapalı: Kurum Sahibi istisnası doktora tarihini açmaz.
    assert.equal(await sayi("select count(*)::int n from public.docentlik_profilleri where owner_id = $1", [K.sahip]), 0);
  }));
