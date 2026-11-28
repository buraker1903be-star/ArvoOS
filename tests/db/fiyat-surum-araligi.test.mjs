/*
  DAĞITIM PENCERESİ: İKİ UYGULAMA SÜRÜMÜ × İKİ ŞEMA (28.11.2026).

  Çok para birimi geçişi iki migration'a bölündü:

    EKLEMELİ ŞEMA   20261128114027 (+120350) uygulandı; birincil anahtar
                    hâlâ `kod`, `para_birimi` sütunu var ve TRY.
    BİLEŞİK ŞEMA    20261128122145 de uygulandı; anahtar
                    `(kod, para_birimi)`, kapsam imzası "kod:birim:tutar".

  Canlıda bu iki şema arasında bir ARALIK olacak: uygulamanın yeni
  sürümü Vercel'e çıkıyor, son migration'lar SQL Editor'den elle
  uygulanıyor ve arada dakikalar (29.10.2026'da GÜNLER) geçiyor. Bu
  dosya o aralığı ölçüyor: dört yolun (okuma, taslak kaydetme, geri
  alma, yayım) hangi şemada hangi sürümle çalıştığı.

  Ölçümün iki sonucu kodu değiştirdi:

   1. Yeni sürüm `upsert` KULLANAMIYOR. `on conflict (kod)` bileşik
      şemada, `on conflict (kod, para_birimi)` eklemeli şemada
      "no unique or exclusion constraint" ile düşüyor — yani hangi
      hedefi yazarsak uygulamayı tek bir şemaya çivilemiş oluyoruz.
      Yeni sürüm bu yüzden ÖNCE GÜNCELLE, YOKSA EKLE yapıyor.
   2. Kapsam imzasını uygulama HESAPLAMIYOR, veritabanından okuyor.
      Eskiden iki yerde yaşıyordu: aralıkta işlev "kod:tutar", uygulama
      "kod:birim:tutar" üretiyor, imza hiç tutmuyor ve YAYIM HİÇ
      ÇALIŞMIYORDU. Aşağıdaki "yeni sürüm · yayım" testleri bunu iki
      şemada birden sabitliyor.

  ESKİ SÜRÜM (main @ 5ef77c8e) de iki şemada ayrı ayrı koşuyor, çünkü
  geri dönüş kararı buna bağlı: eklemeli şemada yazma yolu çalışıyor,
  bileşik şemada ÇALIŞMIYOR. Bu yüzden son şemada "eski sürüme dön"
  bir seçenek değil; PR'daki geri dönüş planı bunun üzerine kurulu.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { BEKLEYEN_MIGRATIONLAR, islem, reddedilir, rol, SEMA, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-00000000f001";
const ARVO = "00000000-0000-4000-8000-00000000f0a1";
const KOD = "arvolab-arastirmaci";

/*
  EKLEMELİ ŞEMA = listenin 20261128122145'ten ÖNCEKİ hâli.

  Dosya adları ELLE YAZILMIYOR, listeden kesiliyor: yeni bir migration
  eklendiğinde bu dosya kendiliğinden güncel kalıyor, yoksa "aralık"
  diye ölçtüğümüz şey bir süre sonra gerçek aralık olmaktan çıkar.
  govde-tamam: aralığın tanımı bu — 122145 bilerek uygulanmıyor, eski
  imza gövdesi (20261127182525) o şemada zaten yürürlükte olan gövde.
*/
const BILESIK_MIGRATION = "20261128122145_fiyat_para_birimi_anahtari.sql";
const EKLEMELI_MIGRATIONLAR = BEKLEYEN_MIGRATIONLAR.slice(
  0,
  BEKLEYEN_MIGRATIONLAR.indexOf(BILESIK_MIGRATION),
);

let eklemeli;
let bilesik;

/** Kurucu bağlamı + tek bir TRY satırı. */
async function kur(db) {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${KURUCU}','kurucu@arvo-os.com') on conflict (id) do nothing;
    insert into public.plans (code,name,description) values ('starter','Başlangıç','') on conflict (code) do nothing;
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${ARVO}','ArvoOS','arvo-os','active','starter') on conflict (id) do nothing;
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values
      ('${ARVO}','${KURUCU}','owner',true) on conflict do nothing;
  `);
}

/** Yalnızca TRY satırı, yayında; bekleyen başka taslak yok. */
async function tekSatir(db) {
  await rol(db, "postgres");
  await db.exec(`
    update public.platform_fiyat_listesi set taslak_bekliyor = false where taslak_bekliyor;
    delete from public.platform_fiyat_listesi where kod = '${KOD}';
    insert into public.platform_fiyat_listesi (kod, para_birimi, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at, updated_at)
    values ('${KOD}', 'TRY', 'plan', 499000, 499000, false, now(), now());
  `);
}

/* ---------- YENİ SÜRÜMÜN SQL'İ (bu daldaki actions.ts) ---------- */

/** Taslak kaydetme: ÖNCE GÜNCELLE, YOKSA EKLE (upsert değil). */
async function yeniTaslakKaydet(db, birim, kurus) {
  const g = await db.query(
    `update public.platform_fiyat_listesi
        set taslak_kurus = $3, taslak_bekliyor = true, updated_at = now()
      where kod = $1 and para_birimi = $2
      returning kod`,
    [KOD, birim, kurus]);
  if (g.rows.length) return "guncelledi";
  await db.query(
    `insert into public.platform_fiyat_listesi (kod, para_birimi, tur, taslak_kurus, taslak_bekliyor, updated_at)
     values ($1, $2, 'plan', $3, true, now())`,
    [KOD, birim, kurus]);
  return "ekledi";
}

/** Yayım: imza VERİTABANINDAN okunuyor, sonra aynı metin geri gidiyor. */
async function yeniYayimla(db) {
  const imza = (await db.query("select public.platform_fiyat_kapsam_imzasi() as i")).rows[0].i;
  const n = (await db.query("select public.platform_fiyatlari_yayimla($1) as n", [imza])).rows[0].n;
  return { imza, n: Number(n) };
}

before(async () => {
  eklemeli = await veritabani(SEMA, EKLEMELI_MIGRATIONLAR);
  bilesik = await veritabani();
  await kur(eklemeli);
  await kur(bilesik);
});

/* ================= EKLEMELİ ŞEMA (aralığın içi) ================= */

test("EKLEMELİ ŞEMA · anahtar hâlâ tek sütun, sütun var ve TRY", async () =>
  islem(eklemeli, async () => {
    await tekSatir(eklemeli);
    const anahtar = (await eklemeli.query(`
      select string_agg(a.attname, ',' order by k.ord) as sutunlar
        from pg_constraint c
        join lateral unnest(c.conkey) with ordinality as k(attnum, ord) on true
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
       where c.conrelid = 'public.platform_fiyat_listesi'::regclass and c.contype = 'p'`)).rows[0].sutunlar;
    assert.equal(anahtar, "kod", "aralıkta birincil anahtar henüz genişlemedi");
    const s = await eklemeli.query(
      "select para_birimi from public.platform_fiyat_listesi where kod = $1", [KOD]);
    assert.deepEqual(s.rows.map((r) => r.para_birimi), ["TRY"]);
  }));

test("EKLEMELİ ŞEMA · YENİ SÜRÜM: okuma, taslak, geri alma, yayından kaldırma çalışıyor", async () =>
  islem(eklemeli, async () => {
    await tekSatir(eklemeli);
    assert.equal(await yeniTaslakKaydet(eklemeli, "TRY", 549000), "guncelledi");
    const t = await eklemeli.query(
      "select taslak_kurus, taslak_bekliyor from public.platform_fiyat_listesi where kod = $1 and para_birimi = $2",
      [KOD, "TRY"]);
    assert.equal(Number(t.rows[0].taslak_kurus), 549000);
    assert.equal(t.rows[0].taslak_bekliyor, true);

    /* Geri alma ve yayından kaldırma: birim süzgeçli UPDATE, eklemeli
       şemada da doğru satıra vuruyor (tek satır var). */
    const geri = await eklemeli.query(
      `update public.platform_fiyat_listesi set taslak_bekliyor = false, taslak_kurus = aylik_kurus
         where kod = $1 and para_birimi = $2 returning para_birimi`, [KOD, "TRY"]);
    assert.deepEqual(geri.rows.map((r) => r.para_birimi), ["TRY"]);
    const kaldir = await eklemeli.query(
      `update public.platform_fiyat_listesi set yayimlandi_at = null
         where kod = $1 and para_birimi = $2 returning para_birimi`, [KOD, "TRY"]);
    assert.deepEqual(kaldir.rows.map((r) => r.para_birimi), ["TRY"]);
  }));

test("EKLEMELİ ŞEMA · YENİ SÜRÜM: yayım ÇALIŞIYOR (imza veritabanından)", async () =>
  islem(eklemeli, async () => {
    await tekSatir(eklemeli);
    await yeniTaslakKaydet(eklemeli, "TRY", 549000);
    await rol(eklemeli, "authenticated", KURUCU);
    const { imza, n } = await yeniYayimla(eklemeli);
    /* Aralıkta işlev ESKİ biçimi üretiyor; uygulama onu olduğu gibi
       geri gönderdiği için yayım çalışıyor. */
    assert.equal(imza, `${KOD}:549000`, "aralıkta imza biçimi kod:tutar");
    assert.equal(n, 1, "yayım geçti");
    await rol(eklemeli, "postgres");
    const s = await eklemeli.query(
      "select aylik_kurus, taslak_bekliyor from public.platform_fiyat_listesi where kod = $1", [KOD]);
    assert.equal(Number(s.rows[0].aylik_kurus), 549000);
    assert.equal(s.rows[0].taslak_bekliyor, false);
  }));

test("EKLEMELİ ŞEMA · imzayı UYGULAMA hesaplasaydı yayım düşerdi (eski davranışın kanıtı)", async () =>
  islem(eklemeli, async () => {
    await tekSatir(eklemeli);
    await yeniTaslakKaydet(eklemeli, "TRY", 549000);
    await rol(eklemeli, "authenticated", KURUCU);
    /*
      28.11.2026'ya kadar imza `lib/fiyat-dogrulama → kapsamImzasi` ile
      hesaplanıyordu ve yeni sürüm "kod:BIRIM:tutar" üretiyor. Aralıkta
      işlevin beklediği biçim bu DEĞİL: imza hiç tutmuyor, yani yayım
      düğmesi dağıtım ile migration arasında hiç çalışmıyor.
    */
    await reddedilir(
      eklemeli,
      "select public.platform_fiyatlari_yayimla($1)",
      [`${KOD}:TRY:549000`],
      /kapsam|önizleme|değişti/i,
    );
  }));

test("EKLEMELİ ŞEMA · USD SATIRI AÇILAMIYOR: ikinci birim ikinci migration'ı bekliyor", async () =>
  islem(eklemeli, async () => {
    await tekSatir(eklemeli);
    /*
      Aralığın bilinen SINIRI. Sütun var ama anahtar tek sütunlu, yani
      aynı kodun ikinci satırı birincil anahtarı çiğniyor. Sonuç: yeni
      sürüm aralıkta TRY fiyatını yönetiyor, USD fiyatı GİREMİYOR.
      Kabul edilebilir, çünkü USD satışı 20261128122145 uygulanmadan
      açılmıyor (lib/satis-para-birimi.ts yayımlanmış USD fiyatı
      istiyor). Ekranda ayrıca hata yerine anlaşılır bir mesaj
      çıkmalı — PR'daki uyumluluk tablosunda yazılı.
    */
    await reddedilir(
      eklemeli,
      `insert into public.platform_fiyat_listesi (kod, para_birimi, tur, taslak_kurus, taslak_bekliyor, updated_at)
       values ($1, 'USD', 'plan', 11900, true, now())`,
      [KOD],
      /duplicate key|unique/i,
    );
  }));

test("EKLEMELİ ŞEMA · ESKİ SÜRÜM: upsert on conflict (kod) hâlâ çalışıyor", async () =>
  islem(eklemeli, async () => {
    await tekSatir(eklemeli);
    await rol(eklemeli, "postgres");
    /* Birinci aşamanın tek amacı bu: migration uygulanır, uygulama eski
       sürümde kalır ve kurucu fiyat yönetmeye devam eder. */
    const y = await eklemeli.query(
      `insert into public.platform_fiyat_listesi (kod, tur, taslak_kurus, taslak_bekliyor, updated_at)
       values ($1, 'plan', 549000, true, now())
       on conflict (kod) do update set taslak_kurus = excluded.taslak_kurus, taslak_bekliyor = true
       returning para_birimi`, [KOD]);
    assert.deepEqual(y.rows.map((r) => r.para_birimi), ["TRY"]);
  }));

test("EKLEMELİ ŞEMA · ESKİ SÜRÜM: imzasız yayım çalışıyor", async () =>
  islem(eklemeli, async () => {
    await tekSatir(eklemeli);
    await rol(eklemeli, "postgres");
    await eklemeli.exec(
      `update public.platform_fiyat_listesi set taslak_kurus = 549000, taslak_bekliyor = true where kod = '${KOD}'`);
    await rol(eklemeli, "authenticated", KURUCU);
    const n = (await eklemeli.query("select public.platform_fiyatlari_yayimla() as n")).rows[0].n;
    assert.equal(Number(n), 1);
  }));

/* ================= BİLEŞİK ŞEMA (geçişin sonu) ================= */

test("BİLEŞİK ŞEMA · YENİ SÜRÜM: aynı taslak yolu iki birimde çalışıyor", async () =>
  islem(bilesik, async () => {
    await tekSatir(bilesik);
    assert.equal(await yeniTaslakKaydet(bilesik, "TRY", 549000), "guncelledi");
    assert.equal(await yeniTaslakKaydet(bilesik, "USD", 11900), "ekledi", "USD satırı burada açılıyor");
    const s = await bilesik.query(
      `select para_birimi, taslak_kurus from public.platform_fiyat_listesi
        where kod = $1 order by para_birimi`, [KOD]);
    assert.deepEqual(s.rows.map((r) => [r.para_birimi, Number(r.taslak_kurus)]), [["TRY", 549000], ["USD", 11900]]);
  }));

test("BİLEŞİK ŞEMA · YENİ SÜRÜM: yayım ÇALIŞIYOR (imza yine veritabanından)", async () =>
  islem(bilesik, async () => {
    await tekSatir(bilesik);
    await yeniTaslakKaydet(bilesik, "TRY", 549000);
    await yeniTaslakKaydet(bilesik, "USD", 11900);
    await rol(bilesik, "authenticated", KURUCU);
    const { imza, n } = await yeniYayimla(bilesik);
    assert.equal(imza, `${KOD}:TRY:549000|${KOD}:USD:11900`, "son şemada biçim kod:birim:tutar");
    assert.equal(n, 2);
    /* AYNI uygulama kodu, iki şema, iki farklı imza biçimi, iki
       çalışan yayım: biçim sorusu uygulamadan tamamen çıktı. */
  }));

test("BİLEŞİK ŞEMA · ESKİ SÜRÜM: yazma yolu DÜŞÜYOR — geri dönüş bir seçenek değil", async () =>
  islem(bilesik, async () => {
    await tekSatir(bilesik);
    await rol(bilesik, "postgres");
    /*
      Bu yüzden "USD satırları yayından kaldırılırsa eski sürüme dönmek
      güvenli" DEĞİL: `on conflict (kod)` satırların İÇERİĞİNE değil
      ANAHTARA bakıyor, USD satırı hiç olmasa bile düşüyor.
    */
    await reddedilir(
      bilesik,
      `insert into public.platform_fiyat_listesi (kod, tur, taslak_kurus, taslak_bekliyor, updated_at)
       values ($1, 'plan', 549000, true, now())
       on conflict (kod) do update set taslak_kurus = excluded.taslak_kurus`,
      [KOD],
      /no unique or exclusion constraint/i,
    );
  }));

test("BİLEŞİK ŞEMA · ESKİ SÜRÜM: tek satır varken bile upsert düşüyor (USD yok)", async () =>
  islem(bilesik, async () => {
    await tekSatir(bilesik);
    await rol(bilesik, "postgres");
    const sayi = (await bilesik.query(
      "select count(*)::int as n from public.platform_fiyat_listesi where para_birimi = 'USD'")).rows[0].n;
    assert.equal(Number(sayi), 0, "veritabanında hiç USD satırı yok");
    await reddedilir(
      bilesik,
      `insert into public.platform_fiyat_listesi (kod, tur, taslak_kurus, taslak_bekliyor, updated_at)
       values ($1, 'plan', 549000, true, now())
       on conflict (kod) do update set taslak_kurus = excluded.taslak_kurus`,
      [KOD],
      /no unique or exclusion constraint/i,
    );
  }));
