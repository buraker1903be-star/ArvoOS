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
/* Sıra önemli: ilki görünümü ve tahsilat özetini kuruyor, ikincisi
   özete `gunluk` dilimlerini ekleyip maliyet toplamları işlevini
   getiriyor. Eski olanı tek başına bırakmak özeti gunluk'suz hâline
   döndürürdü. Liste boşaltılamıyor: döküm görünüm yetkilerini
   taşımıyor (AGENTS.md "Testler"). */
const MIGRATIONLAR = [
  "20261011134559_cari_liste_gorunumu.sql",
  "20261011152124_finans_genel_bakis_toplamlari.sql",
];
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
    /*
      GÜNLÜK DİLİMLER (grafik). Pencere 28 gün: 5 gün önceki 40.000
      içinde, 45 gün önceki 10.000 dışında. Grafik TUTAR çiziyor, bu
      yüzden dilimde toplam da var — eskiden pencereye giren her
      tahsilat kaydı tek tek okunup bellekte toplanıyordu.
    */
    assert.equal(o.gunluk.reduce((t, g) => t + Number(g.toplam), 0), 40000);
    assert.equal(o.gunluk.length, 1, "tek güne yazılmış tek tahsilat");
    /* Beklenen gün TABLOYA SORULUYOR, elle hesaplanmıyor: tohum
       hareketi `(now() - 5 gün)::date` ile yazıyor, yani UTC gününe.
       Beklenen günü Türkiye gününden hesaplamak, UTC'de 21:00'den
       sonra koşan testi düşürüyordu (12.10.2026 gecesi yaşandı) —
       işlevin kendisi doğruydu, kıyasın tarafları farklı takvimdeydi. */
    const kayitGunu = (await tek(
      `select to_char(transaction_date, 'YYYY-MM-DD') as g
       from public.account_entries where description = 'Havale'`,
    )).g;
    assert.equal(o.gunluk[0].gun, kayitGunu);
    assert.equal(Number(o.gunluk[0].adet), 1);
  });
});

test("sözleşme maliyeti sözleşme başına tek satır", async () => {
  await islem(db, async () => {
    await rol(db, "postgres");
    /* Gerçek zincir: fırsat → kabul edilmiş teklif → imzalı sözleşme.
       İki maliyet kalemi tek satırda toplanmalı; imzalı olmayan
       sözleşmenin kalemi hiç gelmemeli. */
    const kur = async (no, durum) => (await tek(
      `with f as (
         insert into public.crm_opportunities (organization_id,title,customer_name,contact_phone,contact_email,stage,estimated_value,probability,created_by,created_at,updated_at,request_details)
         values ($1,$2,'Maliyet Musteri','05320000000','m@x.com','contract',1000,80,$3,now(),now(),'{}'::jsonb)
         returning id
       ), t as (
         insert into public.crm_proposals (organization_id,opportunity_id,proposal_no,title,amount,currency,status,access_token_hash,created_by,created_at,updated_at,view_count,tax_status)
         select $1, f.id, $2, $2, 100000, 'TRY', 'accepted', $2, $3, now(), now(), 0, 'included' from f
         returning id, opportunity_id
       )
       insert into public.crm_contracts (organization_id,opportunity_id,proposal_id,contract_no,title,amount,currency,status,access_token_hash,created_by,created_at,updated_at)
       select $1, t.opportunity_id, t.id, $2, $2, 100000, 'TRY', $4, $2 || 'c', $3, now(), now() from t
       returning id`,
      [KURUM, no, SAHIP, durum],
    )).id;
    const imzali = await kur("SOZ-M1", "signed");
    const taslak = await kur("SOZ-M2", "draft");
    await db.query(
      `insert into public.contract_cost_items (id,organization_id,contract_id,category,description,amount,cost_date,status,created_by,created_at,updated_at)
       values (gen_random_uuid(),$1,$2,'personel','Editör',30000,current_date,'paid',$4,now(),now()),
              (gen_random_uuid(),$1,$2,'personel','Analiz',20000,current_date,'planned',$4,now(),now()),
              (gen_random_uuid(),$1,$3,'personel','Taslağın kalemi',70000,current_date,'planned',$4,now(),now())`,
      [KURUM, imzali, taslak, SAHIP],
    );
    await rol(db, "authenticated", SAHIP);
    const { o } = await tek(
      `select public.sozlesme_maliyet_toplamlari($1,$2) as o`, [KURUM, ["signed", "completed"]],
    );
    assert.equal(o.length, 1, "yalnızca imzalı sözleşme");
    assert.equal(o[0].id, imzali);
    assert.equal(Number(o[0].maliyet), 50000, "iki kalem toplanmış");
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
    await reddedilir(db, `select public.sozlesme_maliyet_toplamlari($1,$2)`, [KURUM, ["signed"]], /permission denied/i);
  });
});
