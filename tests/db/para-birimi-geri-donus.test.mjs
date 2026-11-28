/*
  HAZIRLANMIŞ GERİ DÖNÜŞ BETİĞİ (28.11.2026).

  `supabase/geri-donus/20261128122145-geri-al.sql` elle çalıştırılan bir
  betik; numaralı migration DEĞİL (olsaydı her dağıtımda geçişi geri
  alırdı). Hazır bir geri dönüş yolu, çalıştığı ÖLÇÜLMEDİKÇE bir plan
  değil — kriz anında ilk kez denenen betik kriz anında ilk kez
  hata verir. Üç şey sınanıyor:

   1. Çalıştıktan sonra ESKİ sürümün yazma yolu (`on conflict (kod)`)
      yeniden çalışıyor.
   2. Aynı kodun iki birimde satırı varsa betik HİÇBİR ŞEY YAPMADAN
      düşüyor (veri silmiyor, "USD'yi topluca kaldır" demiyor).
   3. Yayım yolu geri alınmış biçimle (kod:tutar) çalışmaya devam
      ediyor — yarım bir geri dönüş, geri dönüş değil.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const BETIK = fs.readFileSync(
  path.resolve(import.meta.dirname, "../../supabase/geri-donus/20261128122145-geri-al.sql"),
  "utf8",
);

const KURUCU = "00000000-0000-4000-8000-0000000ab001";
const ARVO = "00000000-0000-4000-8000-0000000ab0a1";
const KOD = "arvolab-arastirmaci";

async function kur(db) {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${KURUCU}','kurucu@arvo-os.com');
    insert into public.plans (code,name,description) values ('starter','Başlangıç','') on conflict (code) do nothing;
    insert into public.organizations (id,name,slug,status,plan_code) values ('${ARVO}','ArvoOS','arvo-os','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values ('${ARVO}','${KURUCU}','owner',true);
    update public.platform_fiyat_listesi set taslak_bekliyor = false where taslak_bekliyor;
    delete from public.platform_fiyat_listesi where kod = '${KOD}';
    insert into public.platform_fiyat_listesi (kod, para_birimi, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at, updated_at)
    values ('${KOD}', 'TRY', 'plan', 499000, 499000, false, now(), now());
  `);
}

test("betik çalışınca ESKİ sürümün yazma yolu geri geliyor", async () => {
  const db = await veritabani();
  await kur(db);
  await rol(db, "postgres");
  /* Önce bugünkü durum: eski yol düşüyor. */
  await assert.rejects(
    () => db.query(
      `insert into public.platform_fiyat_listesi (kod, tur, taslak_kurus, taslak_bekliyor, updated_at)
       values ($1, 'plan', 549000, true, now())
       on conflict (kod) do update set taslak_kurus = excluded.taslak_kurus`, [KOD]),
    /no unique or exclusion constraint/i,
  );

  await db.exec(BETIK);

  const y = await db.query(
    `insert into public.platform_fiyat_listesi (kod, tur, taslak_kurus, taslak_bekliyor, updated_at)
     values ($1, 'plan', 549000, true, now())
     on conflict (kod) do update set taslak_kurus = excluded.taslak_kurus, taslak_bekliyor = true
     returning para_birimi`, [KOD]);
  assert.deepEqual(y.rows.map((r) => r.para_birimi), ["TRY"], "sütun kalıyor, varsayılan TRY");

  /* Yayım da eski biçimle çalışıyor. Rol değişimi İŞLEM İÇİNDE:
     `set local role` yalnızca işlemde geçerli, dışarıda çağrılan
     `rol()` hiçbir şey yapmıyor ve sorgu veritabanı sahibiyle koşuyor
     (AGENTS.md). Bu test ilk yazılışında tam o yüzden düştü. */
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const imza = (await db.query("select public.platform_fiyat_kapsam_imzasi() as i")).rows[0].i;
    assert.equal(imza, `${KOD}:549000`, "imza geri alınmış biçimde");
    const n = (await db.query("select public.platform_fiyatlari_yayimla($1) as n", [imza])).rows[0].n;
    assert.equal(Number(n), 1);
  });
});

test("aynı kodun iki birimi varsa betik HİÇBİR ŞEY YAPMADAN düşüyor", async () => {
  const db = await veritabani();
  await kur(db);
  await rol(db, "postgres");
  await db.exec(`
    insert into public.platform_fiyat_listesi (kod, para_birimi, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at, updated_at)
    values ('${KOD}', 'USD', 'plan', 11900, 11900, false, now(), now());
  `);
  await assert.rejects(() => db.exec(BETIK), /Geri alınamaz.*birden çok para biriminde/i);

  /* Satırlar yerinde: betik veri silmiyor. */
  const s = await db.query(
    "select para_birimi from public.platform_fiyat_listesi where kod = $1 order by para_birimi", [KOD]);
  assert.deepEqual(s.rows.map((r) => r.para_birimi), ["TRY", "USD"]);
  /* Anahtar da hâlâ bileşik: yarım uygulanmış bir geri dönüş yok. */
  const anahtar = (await db.query(`
    select string_agg(a.attname, ',' order by k.ord) as sutunlar
      from pg_constraint c
      join lateral unnest(c.conkey) with ordinality as k(attnum, ord) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.conrelid = 'public.platform_fiyat_listesi'::regclass and c.contype = 'p'`)).rows[0].sutunlar;
  assert.equal(anahtar, "kod,para_birimi");
});
