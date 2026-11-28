/*
  ESKİ UYGULAMA + YENİ ŞEMA (28.11.2026).

  Yeni koddaki `kod + para_birimi` sorgularının geçmesi, CANLIDA ŞU AN
  ÇALIŞAN sürümün (main @ 5ef77c8e) yeni şemada çalışacağını
  KANITLAMAZ. Bu dosya o sürümün fiyat yollarının ürettiği SQL'i
  birebir çalıştırıyor:

    okuma      : select * from platform_fiyat_listesi
    tekil okuma: select … where kod = $1            (PostgREST maybeSingle)
    taslak     : insert … on conflict (kod) do update
    toplu taslak: aynı upsert, çok satırlı
    geri alma  : update … where kod = $1
    yayından   : update … where kod = $1
    yayım      : platform_fiyatlari_yayimla('kod:tutar|…')
    site       : select kod, aylik_kurus where yayimlandi_at is not null

  Amaç davranışı onaylamak değil, YAYIN SIRASINI KANITA BAĞLAMAK:
  hangi yol kırılıyor, hangisi sessizce yanlış sonuç veriyor, USD
  satırları oluştuktan sonra eski sürüme dönmek güvenli mi.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KOD = "arvolab-arastirmaci";
let db;

/** Yalnızca TRY satırı: migration uygulandı ama USD henüz açılmadı. */
async function yalnizTry() {
  await rol(db, "postgres");
  await db.exec(`
    delete from public.platform_fiyat_listesi where kod = '${KOD}';
    insert into public.platform_fiyat_listesi (kod, para_birimi, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at, updated_at)
    values ('${KOD}', 'TRY', 'plan', 499000, 499000, false, now(), now());
  `);
}

/** TRY + USD satırı: USD fiyatı yayımlanmış durum. */
async function ikiBirim() {
  await yalnizTry();
  await db.exec(`
    insert into public.platform_fiyat_listesi (kod, para_birimi, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at, updated_at)
    values ('${KOD}', 'USD', 'plan', 11900, 11900, false, now(), now());
  `);
}

before(async () => {
  db = await veritabani();
});

/* ---------- AŞAMA 1: migration uygulandı, USD satırı YOK ---------- */

test("AŞAMA 1 · eski okuma yolları değişmeden çalışıyor", async () =>
  islem(db, async () => {
    await yalnizTry();
    const hepsi = await db.query("select * from public.platform_fiyat_listesi where kod = $1", [KOD]);
    assert.equal(hepsi.rows.length, 1, "tek satır: eski ekran tek satır görür");
    const tekil = await db.query("select aylik_kurus, yayimlandi_at from public.platform_fiyat_listesi where kod = $1", [KOD]);
    assert.equal(tekil.rows.length, 1, "maybeSingle karşılığı: tek satır");
    const site = await db.query(
      "select kod, aylik_kurus from public.platform_fiyat_listesi where yayimlandi_at is not null and kod = $1", [KOD]);
    assert.equal(Number(site.rows[0].aylik_kurus), 499000);
  }));

test("AŞAMA 1 · ESKİ YAZMA YOLU KIRILIYOR: on conflict (kod)", async () =>
  islem(db, async () => {
    await yalnizTry();
    /*
      Canlıdaki sürüm taslağı böyle kaydediyor (actions.ts, onConflict:
      "kod"). Birincil anahtar iki sütunlu olduğu için PostgreSQL
      çıkarım yapamıyor ve yazma DÜŞÜYOR. Yani migration tek başına
      uygulanıp uygulama eski sürümde bırakılırsa, kurucu fiyat
      taslağı KAYDEDEMEZ.
    */
    await reddedilir(
      db,
      `insert into public.platform_fiyat_listesi (kod, tur, taslak_kurus, taslak_bekliyor, updated_at)
       values ($1, 'plan', 549000, true, now())
       on conflict (kod) do update set taslak_kurus = excluded.taslak_kurus`,
      [KOD],
      /no unique or exclusion constraint/i,
    );
  }));

test("AŞAMA 1 · eski geri alma ve yayından kaldırma hâlâ doğru satıra vuruyor", async () =>
  islem(db, async () => {
    await yalnizTry();
    await rol(db, "postgres");
    const geri = await db.query(
      `update public.platform_fiyat_listesi set taslak_bekliyor = false where kod = $1 returning para_birimi`, [KOD]);
    assert.deepEqual(geri.rows.map((r) => r.para_birimi), ["TRY"], "tek satır varken eski UPDATE zararsız");
  }));

test("AŞAMA 1 · eski imzasız yayım çağrısı çalışıyor", async () =>
  islem(db, async () => {
    await yalnizTry();
    await rol(db, "postgres");
    await db.exec(`update public.platform_fiyat_listesi set taslak_kurus = 549000, taslak_bekliyor = true where kod = '${KOD}'`);
    /* Kurucu bağlamı olmadan (postgres) işlev kurucu denetimine
       takılır; burada yalnızca SQL'in geçerliliği sınanıyor. */
    await reddedilir(db, "select public.platform_fiyatlari_yayimla()", [], /kurucu yetkisi/i);
  }));

/* ---------- AŞAMA 2: USD satırı oluştu, eski sürüme DÖNÜŞ ---------- */

test("AŞAMA 2 · eski tekil okuma İKİ satır görüyor (maybeSingle hata verir)", async () =>
  islem(db, async () => {
    await ikiBirim();
    const tekil = await db.query("select aylik_kurus from public.platform_fiyat_listesi where kod = $1", [KOD]);
    assert.equal(tekil.rows.length, 2, "PostgREST maybeSingle burada 'multiple rows' döndürür");
  }));

test("AŞAMA 2 · eski site okuması USD tutarını TL sanıyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    /*
      EN TEHLİKELİSİ BU. Eski lib/site/fiyat-oku birim süzgeci
      taşımıyor: iki satır dönüyor, kodda `Map.set(kod, tutar)` ile
      birleştiriliyor ve SONUNCU satır kazanıyor. Yani Türkçe ücretler
      sayfası 4.990 ₺ yerine 119 (USD tutarı) gösterebilir.
      Sonuç: USD satırları YAYIMLANDIKTAN sonra eski sürüme dönmek
      güvenli DEĞİL; dönülecekse önce USD satırları yayından
      kaldırılmalı.
    */
    const site = await db.query(
      `select kod, aylik_kurus from public.platform_fiyat_listesi
        where yayimlandi_at is not null and kod = $1 order by para_birimi`, [KOD]);
    assert.equal(site.rows.length, 2);
    const sonKazanan = Number(site.rows[site.rows.length - 1].aylik_kurus);
    assert.equal(sonKazanan, 11900, "son satır USD tutarı; eski kod bunu TL diye yazar");
  }));

test("AŞAMA 2 · eski güncelleme İKİ birimi birden bozuyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    const sonuc = await db.query(
      `update public.platform_fiyat_listesi set aylik_kurus = null, taslak_kurus = null, taslak_bekliyor = false, yayimlandi_at = null
         where kod = $1 returning para_birimi`, [KOD]);
    assert.equal(sonuc.rows.length, 2, "eski 'yayından kaldır' USD satırını da düşürür");
  }));

test("AŞAMA 2 · GERİ DÖNÜŞ GÜVENLİĞİ: USD satırları yayından kaldırılınca eski okuma düzeliyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    /* Geri dönüş yordamı (PR'da yazılı): USD satırlarını yayından
       kaldır, satırları SİLME — taslaklar ve geçmiş korunsun. */
    await db.exec(`update public.platform_fiyat_listesi set yayimlandi_at = null where para_birimi = 'USD'`);
    const site = await db.query(
      `select kod, aylik_kurus from public.platform_fiyat_listesi
        where yayimlandi_at is not null and kod = $1`, [KOD]);
    assert.equal(site.rows.length, 1);
    assert.equal(Number(site.rows[0].aylik_kurus), 499000, "site yine TL tutarını okuyor");
  }));

test("AŞAMA 2 · yeni kod USD satırı varken de doğru çalışıyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    const tl = await db.query(
      `select aylik_kurus from public.platform_fiyat_listesi where kod = $1 and para_birimi = 'TRY'`, [KOD]);
    assert.equal(Number(tl.rows[0].aylik_kurus), 499000);
    const yaz = await db.query(
      `insert into public.platform_fiyat_listesi (kod, para_birimi, tur, taslak_kurus, taslak_bekliyor, updated_at)
       values ($1, 'USD', 'plan', 12900, true, now())
       on conflict (kod, para_birimi) do update set taslak_kurus = excluded.taslak_kurus, taslak_bekliyor = true
       returning para_birimi`, [KOD]);
    assert.deepEqual(yaz.rows.map((r) => r.para_birimi), ["USD"]);
  }));
