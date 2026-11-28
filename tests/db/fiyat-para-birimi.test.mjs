/*
  FİYAT LİSTESİ ÇOK PARA BİRİMLİ — BİLEŞİK ANAHTAR UYUMLULUĞU
  (28.11.2026, migration 20261128114027).

  Birincil anahtar `kod`tan `(kod, para_birimi)`ye genişledi. Asıl risk
  yeni kodda değil ESKİ kodda: yalnızca `kod` ile okuyan, güncelleyen
  ya da upsert eden bir yol, aynı planın iki satırı varken yanlış
  satıra dokunur ya da ikisini birden değiştirir. Bu dosya o yolların
  veritabanı tarafındaki karşılığını sınıyor:

   - `where kod = …` ile UPDATE iki satırı birden değiştiriyor mu
     (evet — bu yüzden uygulama tarafında birim süzgeci eklendi),
   - `where kod = … and para_birimi = …` yalnızca kendi satırını
     değiştiriyor mu,
   - eski `upsert … on conflict (kod)` artık çalışmıyor, yerine
     `(kod, para_birimi)` geliyor mu,
   - imzasız eski yayım çağrısı iki birimi de yayımlamaya devam ediyor
     mu (geriye dönük uyumluluk),
   - kapsamlı yayım yalnızca onaylanan (kod, birim, tutar) üçlülerini
     yazıyor mu.

  Migration SIRASI sorusu da burada cevaplanıyor: sütun varsayılanla
  ekleniyor, mevcut satırlar TRY kalıyor ve yalnızca `kod` ile okuyan
  ESKİ uygulama tek satır gördüğü sürece aynı davranmaya devam ediyor.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-00000000c001";
const YABANCI = "00000000-0000-4000-8000-00000000c002";
const ARVO = "00000000-0000-4000-8000-00000000c0a1";
const BASKA = "00000000-0000-4000-8000-00000000c0a2";

const KOD = "arvolab-arastirmaci";

let db;

const satirlar = async (kod = KOD) => (await db.query(
  `select kod, para_birimi, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at is not null as yayimli
     from public.platform_fiyat_listesi where kod = $1 order by para_birimi`, [kod])).rows.map((r) => ({
  kod: r.kod,
  birim: r.para_birimi,
  aylik: r.aylik_kurus === null ? null : Number(r.aylik_kurus),
  taslak: r.taslak_kurus === null ? null : Number(r.taslak_kurus),
  bekliyor: r.taslak_bekliyor,
  yayimli: r.yayimli,
}));

/** Aynı planın iki birimde satırı: TRY yayında, USD yayında. */
async function ikiBirim() {
  await rol(db, "postgres");
  await db.exec(`
    delete from public.platform_fiyat_listesi where kod = '${KOD}';
    insert into public.platform_fiyat_listesi (kod, para_birimi, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at, updated_at)
    values ('${KOD}', 'TRY', 'plan', 499000, 499000, false, now(), now()),
           ('${KOD}', 'USD', 'plan', 11900, 11900, false, now(), now());
  `);
}

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${KURUCU}','kurucu@arvo-os.com'),('${YABANCI}','yabanci@deneme.com');
    insert into public.plans (code,name,description) values ('starter','Başlangıç','') on conflict (code) do nothing;
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${ARVO}','ArvoOS','arvo-os','active','starter'),
      ('${BASKA}','Başka Kurum','baska-kurum','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values
      ('${ARVO}','${KURUCU}','owner',true),
      ('${BASKA}','${YABANCI}','owner',true);
  `);
});

test("sütun varsayılanla geliyor: eski satırlar TRY kalıyor", async () =>
  islem(db, async () => {
    await rol(db, "postgres");
    await db.exec(`
      delete from public.platform_fiyat_listesi where kod = 'eski-satir-testi';
      insert into public.platform_fiyat_listesi (kod, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at, updated_at)
      values ('eski-satir-testi', 'plan', 100000, 100000, false, now(), now());
    `);
    const s = await satirlar("eski-satir-testi");
    assert.equal(s.length, 1);
    assert.equal(s[0].birim, "TRY", "para birimi yazılmayan satır TRY");
  }));

test("bileşik anahtar: aynı kod iki birimde yaşayabiliyor, aynı birimde ikinci satır olamaz", async () =>
  islem(db, async () => {
    await ikiBirim();
    assert.deepEqual((await satirlar()).map((s) => s.birim), ["TRY", "USD"]);
    await reddedilir(
      db,
      `insert into public.platform_fiyat_listesi (kod, para_birimi, tur, aylik_kurus, taslak_bekliyor, updated_at)
       values ('${KOD}', 'USD', 'plan', 1, false, now())`,
      [],
      /duplicate key|unique/i,
    );
  }));

test("ISO kısıtı: tanınmayan para birimi reddediliyor", async () =>
  islem(db, async () => {
    await rol(db, "postgres");
    await reddedilir(
      db,
      `insert into public.platform_fiyat_listesi (kod, para_birimi, tur, aylik_kurus, taslak_bekliyor, updated_at)
       values ('kisit-testi', 'GBP', 'plan', 1, false, now())`,
      [],
      /para_birimi_check/i,
    );
  }));

test("ESKİ YOL: yalnızca kod ile UPDATE İKİ satırı birden değiştiriyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    /*
      Bu, migration'dan sonra eski kodun yaşayacağı somut hata. Testin
      amacı davranışı onaylamak değil, KAYIT ALTINA ALMAK: uygulama
      tarafındaki her yol (taslağı geri al, yayından kaldır, upsert)
      bu yüzden birim süzgeci aldı.
    */
    const sonuc = await db.query(
      `update public.platform_fiyat_listesi set taslak_bekliyor = true, taslak_kurus = 1 where kod = $1 returning para_birimi`,
      [KOD]);
    assert.equal(sonuc.rows.length, 2, "kod tek başına iki satıra dokunuyor");
  }));

test("YENİ YOL: kod + para birimi yalnızca kendi satırını değiştiriyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    const sonuc = await db.query(
      `update public.platform_fiyat_listesi set taslak_bekliyor = true, taslak_kurus = 549000
         where kod = $1 and para_birimi = 'TRY' returning para_birimi`, [KOD]);
    assert.deepEqual(sonuc.rows.map((r) => r.para_birimi), ["TRY"]);

    const s = await satirlar();
    assert.deepEqual(s.find((x) => x.birim === "TRY"), { kod: KOD, birim: "TRY", aylik: 499000, taslak: 549000, bekliyor: true, yayimli: true });
    /* USD satırı el değmeden duruyor. */
    assert.deepEqual(s.find((x) => x.birim === "USD"), { kod: KOD, birim: "USD", aylik: 11900, taslak: 11900, bekliyor: false, yayimli: true });
  }));

test("upsert on conflict (kod, para_birimi) öteki birimi bozmuyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    await db.exec(`
      insert into public.platform_fiyat_listesi (kod, para_birimi, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, updated_at)
      values ('${KOD}', 'USD', 'plan', 11900, 12900, true, now())
      on conflict (kod, para_birimi) do update
        set taslak_kurus = excluded.taslak_kurus, taslak_bekliyor = excluded.taslak_bekliyor, updated_at = excluded.updated_at;
    `);
    const s = await satirlar();
    assert.equal(s.find((x) => x.birim === "USD").taslak, 12900);
    assert.equal(s.find((x) => x.birim === "TRY").taslak, 499000, "TRY satırı değişmedi");
  }));

test("eski upsert biçimi (on conflict kod) artık kabul edilmiyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    /* Eski istemci bu biçimi gönderirse SESSİZCE yanlış satırı yazmak
       yerine hata alıyor: birincil anahtar artık iki sütunlu. */
    await reddedilir(
      db,
      `insert into public.platform_fiyat_listesi (kod, tur, aylik_kurus, taslak_bekliyor, updated_at)
       values ('${KOD}', 'plan', 1, false, now()) on conflict (kod) do nothing`,
      [],
      /no unique or exclusion constraint/i,
    );
  }));

test("TRY akışı USD satırı varken de doğru satırı okuyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    const tl = await db.query(
      `select aylik_kurus from public.platform_fiyat_listesi where kod = $1 and para_birimi = 'TRY'`, [KOD]);
    assert.equal(Number(tl.rows[0].aylik_kurus), 499000);
    /* Sitenin okuması da birimle süzülüyor (lib/site/fiyat-oku). */
    const site = await db.query(
      `select kod, aylik_kurus from public.platform_fiyat_listesi
        where para_birimi = 'TRY' and yayimlandi_at is not null and kod = $1`, [KOD]);
    assert.equal(site.rows.length, 1);
    assert.equal(Number(site.rows[0].aylik_kurus), 499000);
  }));

test("fiyat geçmişi para birimini yazıyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    await db.exec(`delete from public.platform_fiyat_gecmisi where kod = '${KOD}'`);
    await db.query(
      `update public.platform_fiyat_listesi set taslak_kurus = 12900, taslak_bekliyor = true
         where kod = $1 and para_birimi = 'USD'`, [KOD]);
    const g = await db.query(
      `select para_birimi, islem, yeni_kurus from public.platform_fiyat_gecmisi where kod = $1 order by id desc limit 1`, [KOD]);
    assert.equal(g.rows[0].para_birimi, "USD");
    assert.equal(g.rows[0].islem, "taslak");
    assert.equal(Number(g.rows[0].yeni_kurus), 12900);
  }));

test("kapsam imzası kod:para:tutar biçiminde", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    await db.exec(`
      delete from public.platform_fiyat_listesi where kod <> '${KOD}' and taslak_bekliyor;
      update public.platform_fiyat_listesi set taslak_kurus = 549000, taslak_bekliyor = true where kod = '${KOD}' and para_birimi = 'TRY';
      update public.platform_fiyat_listesi set taslak_kurus = 12900, taslak_bekliyor = true where kod = '${KOD}' and para_birimi = 'USD';
    `);
    await rol(db, "authenticated", KURUCU);
    const imza = (await db.query("select public.platform_fiyat_kapsam_imzasi() as i")).rows[0].i;
    assert.equal(imza, `${KOD}:TRY:549000|${KOD}:USD:12900`);
  }));

test("kapsamlı yayım yalnızca onaylanan BİRİMİ yayımlıyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    await db.exec(`
      delete from public.platform_fiyat_listesi where kod <> '${KOD}' and taslak_bekliyor;
      update public.platform_fiyat_listesi set taslak_kurus = 549000, taslak_bekliyor = true where kod = '${KOD}' and para_birimi = 'TRY';
      update public.platform_fiyat_listesi set taslak_kurus = 12900, taslak_bekliyor = true where kod = '${KOD}' and para_birimi = 'USD';
    `);
    await rol(db, "authenticated", KURUCU);
    /* Yalnızca USD satırı onaylanıyor; TRY taslağı bekliyor kalmalı.
       (Doğrudan yazma yarısı: imza denetimi ile UPDATE arasındaki
       pencerenin karşılığı.) */
    const sayi = (await db.query(
      "select private.fiyat_kapsam_yayimla($1, now()) as n", [`${KOD}:USD:12900`])).rows[0].n;
    assert.equal(Number(sayi), 1);

    await rol(db, "postgres");
    const s = await satirlar();
    assert.equal(s.find((x) => x.birim === "USD").aylik, 12900);
    assert.equal(s.find((x) => x.birim === "USD").bekliyor, false);
    assert.equal(s.find((x) => x.birim === "TRY").aylik, 499000, "TRY yayımlanmadı");
    assert.equal(s.find((x) => x.birim === "TRY").bekliyor, true);
  }));

test("ESKİ İSTEMCİ: imzasız yayım iki birimi de yayımlamaya devam ediyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    await db.exec(`
      delete from public.platform_fiyat_listesi where kod <> '${KOD}' and taslak_bekliyor;
      update public.platform_fiyat_listesi set taslak_kurus = 549000, taslak_bekliyor = true where kod = '${KOD}' and para_birimi = 'TRY';
      update public.platform_fiyat_listesi set taslak_kurus = 12900, taslak_bekliyor = true where kod = '${KOD}' and para_birimi = 'USD';
    `);
    await rol(db, "authenticated", KURUCU);
    const sayi = (await db.query("select public.platform_fiyatlari_yayimla() as n")).rows[0].n;
    assert.equal(Number(sayi), 2, "imzasız çağrı bekleyen her taslağı yayımlıyor");
  }));

test("ESKİ BİÇİMDEKİ onay (kod:tutar) reddediliyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "postgres");
    await db.exec(`
      delete from public.platform_fiyat_listesi where kod <> '${KOD}' and taslak_bekliyor;
      update public.platform_fiyat_listesi set taslak_kurus = 549000, taslak_bekliyor = true where kod = '${KOD}' and para_birimi = 'TRY';
    `);
    await rol(db, "authenticated", KURUCU);
    /* Sessizce yanlış satırı yayımlamaktansa reddetmek doğru. */
    await reddedilir(db, "select public.platform_fiyatlari_yayimla($1)", [`${KOD}:549000`], /önizlemeden sonra değişti/i);
    await rol(db, "postgres");
    assert.equal((await satirlar()).find((x) => x.birim === "TRY").bekliyor, true);
  }));

test("yetki: kurucu olmayan çok para birimli yayımı da yapamıyor", async () =>
  islem(db, async () => {
    await ikiBirim();
    await rol(db, "authenticated", YABANCI);
    await reddedilir(db, "select public.platform_fiyatlari_yayimla($1)", [`${KOD}:USD:12900`], /kurucu yetkisi/i);
  }));
