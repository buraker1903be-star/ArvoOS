/*
  CARİ LİSTESİ GÖRÜNÜMÜ — toplamlar TypeScript'in beklediğiyle aynı mı.

  Görünüm KURAL taşımıyor, yalnızca dört toplam veriyor; bakiye kararı
  TypeScript'te kalıyor (tests/unit/cari-bakiye.test.ts). Burada
  sınanan, o dört toplamın TypeScript'in hareketlerden çıkardığıyla
  birebir aynı olması — özellikle iki tuzak:

  "Ek hizmet ·" eşleşmesi büyük/küçük harfe duyarlı ve ÖNEK: "ek
  hizmet" ya da ortada geçen metin sayılmamalı — sözleşme borcunun
  üstüne yanlış kalem eklemek müşteriden fazla tahsilat demek.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261011134559_cari_liste_gorunumu.sql"];
/* Ortak örnek tablosu: aynı hareketler TypeScript tarafında da
   sınanıyor (tests/unit/cari-bakiye.test.ts). */
const ORNEK = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../fixtures/cari-hareketleri.json"), "utf8"),
);

const KURUM = "00000000-0000-4000-8000-00000000c4a1";
const BASKA = "00000000-0000-4000-8000-00000000c4a2";
const SAHIP = "00000000-0000-4000-8000-00000000c4b1";
const YABANCI = "00000000-0000-4000-8000-00000000c4b2";
const CARI = "00000000-0000-4000-8000-00000000c4c1";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}','sahip@x.com'),('${YABANCI}','yabanci@x.com');
    insert into public.plans (code, name, description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','AM','am','active','starter'),('${BASKA}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${BASKA}','${YABANCI}','owner');
    insert into public.account_parties (id,organization_id,party_type,name,is_active,created_by,created_at,updated_at)
      values ('${CARI}','${KURUM}','customer','Ayşe Yılmaz',true,'${SAHIP}',now(),now());
  `);
  /* Örnek tablosundaki hareketler; tarihler tahsilat pencerelerini
     sınamak için ayrıca veriliyor. */
  const gunler = { "tahsilat": 5, "ikinci tahsilat": 45 };
  for (const h of ORNEK.hareketler) {
    await db.query(
      `insert into public.account_entries (id,organization_id,party_id,entry_type,source_type,amount,currency,description,transaction_date,created_by,created_at)
       values (gen_random_uuid(),$1,$2,$3,$4,$5,'TRY',$6,(now() - ($7 || ' days')::interval)::date,$8,now())`,
      [KURUM, CARI, h.entry_type, h.source_type, h.amount, h.description, String(gunler[h.ad] ?? 20), SAHIP],
    );
  }
});

test("ortak örnek tablosu: görünümün toplamları", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const satir = await tek(
      `select defter_borc, ek_hizmet, tahsilat, iade, son_hareket_at from public.cari_liste where id = $1`,
      [CARI],
    );
    assert.deepEqual(
      {
        defter_borc: Number(satir.defter_borc),
        ek_hizmet: Number(satir.ek_hizmet),
        tahsilat: Number(satir.tahsilat),
        iade: Number(satir.iade),
      },
      ORNEK.toplamlar,
    );
    assert.ok(satir.son_hareket_at, "son hareket tarihi geldi");
  });
});

test("tahsilat özeti pencereleri", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const { o } = await tek(`select public.cari_tahsilat_ozeti($1) as o`, [KURUM]);
    // 5 gün önceki 40.000 son 30 günde; 45 gün önceki 10.000 önceki 30 günde.
    assert.equal(Number(o.son30), 40000);
    assert.equal(Number(o.onceki30), 10000);
    assert.equal(o.aylik.reduce((t, a) => t + Number(a.toplam), 0), 50000);
  });
});

test("başka kurumun kullanıcısı cari görmüyor, anon erişemiyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", YABANCI);
    assert.equal((await tek(`select count(*)::int as adet from public.cari_liste`)).adet, 0);
    assert.equal(Number((await tek(`select public.cari_tahsilat_ozeti($1) as o`, [KURUM])).o.son30), 0);
  });
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select * from public.cari_liste`, [], /permission denied/i);
    await reddedilir(db, `select public.cari_tahsilat_ozeti($1)`, [KURUM], /permission denied/i);
  });
});
