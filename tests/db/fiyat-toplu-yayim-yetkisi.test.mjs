/*
  TOPLU FİYAT YAYIMI — KAPSAM VE YETKİ (27.11.2026, kapanış turu · madde 4).

  Fiyat düzenleme 27.11.2026'da ürünün kendi "Fiyat basamakları"
  bölümüne indi (app/panel/platform/fiyatlar/fiyat-duzenleme.tsx).
  Yayım kuralı DEĞİŞMEDİ: `platform_fiyatlari_yayimla()` bekleyen
  BÜTÜN taslakları tek UPDATE ile yayımlıyor (14.10.2026 kararı —
  yarı güncel bir liste yayımlanmasın). Bölüm artık tek bir ürünün
  içinde durduğu için bunun iki sonucu var ve ikisi de burada
  sabitleniyor:

    1. İKİ ÜRÜNDE taslak varken ArvoLab'ın içinden yayımlamak
       ÖTEKİNİ DE yayımlıyor. Ekran bunu önceden yazıyor (etkilenen
       ürünler listeleniyor ve ayrı bir onay kutusu isteniyor); test
       davranışın gerçekten böyle olduğunu kanıtlıyor, yoksa ekrandaki
       uyarı doğru olmayan bir şeyi anlatıyor olurdu.
    2. İşlem KURUCUYA ÖZEL. Fonksiyon security INVOKER ve
       private.is_arvoos_founder() arıyor; kurucu olmayan oturum
       reddediliyor, anon'a execute yetkisi hiç verilmemiş.

  "İptal" de burada: taslağı geri almak kurucunun UPDATE'i, RLS onu
  kurucuya açıyor ve kurucu olmayana kapatıyor.

  Canlı fiyatlara dokunulmuyor: her şey PGlite'ta, işlem içinde.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-00000000f001";
const YABANCI = "00000000-0000-4000-8000-00000000f002";
const ARVO = "00000000-0000-4000-8000-00000000f0a1";
const BASKA = "00000000-0000-4000-8000-00000000f0a2";

/* İki AYRI ürünün basamağı: senaryonun bütün anlamı bu ikisinin
   birlikte yayımlanması. */
const ARVOLAB_KODU = "arvolab-arastirmaci";
const ARVOOS_KODU = "arvoos-baslangic";

let db;

const satirlar = async () => Object.fromEntries((await db.query(
  `select kod, aylik_kurus, taslak_kurus, taslak_bekliyor
     from public.platform_fiyat_listesi where kod = any($1) order by kod`,
  [[ARVOLAB_KODU, ARVOOS_KODU]])).rows.map((r) => [r.kod, {
    aylik: Number(r.aylik_kurus),
    taslak: r.taslak_kurus === null ? null : Number(r.taslak_kurus),
    bekliyor: r.taslak_bekliyor,
  }]));

/** İki üründe de bekleyen taslak kurar. */
async function ikiUrundeTaslak() {
  await rol(db, "postgres");
  await db.exec(`
    delete from public.platform_fiyat_listesi where kod in ('${ARVOLAB_KODU}', '${ARVOOS_KODU}');
    insert into public.platform_fiyat_listesi (kod, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at, updated_at)
    values
      ('${ARVOLAB_KODU}', 'plan', 499000, 549000, true, now(), now()),
      ('${ARVOOS_KODU}',  'plan', 239000, 259000, true, now(), now());
  `);
}

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  /* Kurucu: 'arvo-os' kurumunun etkin owner'ı (is_arvoos_founder onu
     arıyor). Yabancı: başka kurumun owner'ı — oturumu var, kurucu değil. */
  await db.exec(`
    insert into auth.users (id,email) values
      ('${KURUCU}','kurucu@arvo-os.com'),('${YABANCI}','yabanci@deneme.com');
    insert into public.plans (code,name,description) values ('starter','Başlangıç','')
      on conflict (code) do nothing;
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${ARVO}','ArvoOS','arvo-os','active','starter'),
      ('${BASKA}','Başka Kurum','baska-kurum','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values
      ('${ARVO}','${KURUCU}','owner',true),
      ('${BASKA}','${YABANCI}','owner',true);
  `);
});

test("kurucu yayımlayınca İKİ ÜRÜNÜN taslağı da canlıya çıkıyor", async () =>
  islem(db, async () => {
    await ikiUrundeTaslak();

    await rol(db, "authenticated", KURUCU);
    const sayi = (await db.query("select public.platform_fiyatlari_yayimla() as n")).rows[0].n;
    /* İki satır: ekrandaki "2 değişikliği yayımla" düğmesi gerçekten
       iki ürünü birden yayımlıyor. */
    assert.equal(Number(sayi), 2);

    await rol(db, "postgres");
    const s = await satirlar();
    assert.equal(s[ARVOLAB_KODU].aylik, 549000);
    assert.equal(s[ARVOOS_KODU].aylik, 259000);
    assert.equal(s[ARVOLAB_KODU].bekliyor, false);
    assert.equal(s[ARVOOS_KODU].bekliyor, false);
  }));

test("kurucu olmayan oturumda yayım reddediliyor, tutarlar değişmiyor", async () =>
  islem(db, async () => {
    await ikiUrundeTaslak();

    await rol(db, "authenticated", YABANCI);
    await reddedilir(db, "select public.platform_fiyatlari_yayimla()", [], /kurucu yetkisi/i);

    await rol(db, "postgres");
    const s = await satirlar();
    /* Yayımlanan hiçbir şey yok: eski tutarlar ve bekleyen taslaklar yerinde. */
    assert.equal(s[ARVOLAB_KODU].aylik, 499000);
    assert.equal(s[ARVOOS_KODU].aylik, 239000);
    assert.equal(s[ARVOLAB_KODU].bekliyor, true);
    assert.equal(s[ARVOOS_KODU].bekliyor, true);
  }));

test("anon fonksiyonu hiç çağıramıyor", async () =>
  islem(db, async () => {
    await ikiUrundeTaslak();
    await rol(db, "anon");
    /* Yetki hiç verilmemiş: kurucu kontrolüne bile gelmiyor. */
    await reddedilir(db, "select public.platform_fiyatlari_yayimla()", [], /permission denied/i);
  }));

test("iptal: kurucu taslağı geri alıyor, yabancı alamıyor", async () =>
  islem(db, async () => {
    await ikiUrundeTaslak();

    /* Yabancı taslağı temizleyemez: RLS satırı eliyor, hiçbir satır
       güncellenmiyor (sessiz başarı DEĞİL — sayı sıfır). */
    await rol(db, "authenticated", YABANCI);
    const yabanci = await db.query(
      `update public.platform_fiyat_listesi set taslak_bekliyor = false, taslak_kurus = null
         where kod = $1 returning kod`, [ARVOLAB_KODU]);
    assert.equal(yabanci.rows.length, 0);

    await rol(db, "postgres");
    assert.equal((await satirlar())[ARVOLAB_KODU].bekliyor, true);

    /* Kurucu geri alabiliyor ve YALNIZCA o satır düşüyor; ötekinin
       taslağı duruyor. */
    await rol(db, "authenticated", KURUCU);
    const kurucu = await db.query(
      `update public.platform_fiyat_listesi set taslak_bekliyor = false, taslak_kurus = null
         where kod = $1 returning kod`, [ARVOLAB_KODU]);
    assert.equal(kurucu.rows.length, 1);

    await rol(db, "postgres");
    const s = await satirlar();
    assert.equal(s[ARVOLAB_KODU].bekliyor, false);
    assert.equal(s[ARVOLAB_KODU].taslak, null);
    assert.equal(s[ARVOOS_KODU].bekliyor, true);
  }));

test("iptalden sonra yayım yalnızca kalan taslağı canlıya çıkarıyor", async () =>
  islem(db, async () => {
    await ikiUrundeTaslak();

    await rol(db, "authenticated", KURUCU);
    await db.query(
      `update public.platform_fiyat_listesi set taslak_bekliyor = false, taslak_kurus = null where kod = $1`,
      [ARVOLAB_KODU]);
    const sayi = (await db.query("select public.platform_fiyatlari_yayimla() as n")).rows[0].n;
    assert.equal(Number(sayi), 1);

    await rol(db, "postgres");
    const s = await satirlar();
    /* İptal edilen ürün ESKİ tutarında kaldı; öteki yayımlandı. */
    assert.equal(s[ARVOLAB_KODU].aylik, 499000);
    assert.equal(s[ARVOOS_KODU].aylik, 259000);
  }));

/*
  KAPSAM KİLİDİ (28.11.2026). Önizleme ile yazma arasında taslak
  kümesi değişirse eski onayla yayım yapılmamalı. Kontrol işlevin
  İÇİNDE: satırlar kilitleniyor, imza orada yeniden hesaplanıyor —
  yoksa okuma ile RPC arasındaki aralıkta eklenen bir taslak yine
  görülmeden yayımlanırdı.
*/
const imza = async () => (await db.query("select public.platform_fiyat_kapsam_imzasi() as i")).rows[0].i;

test("kapsam imzası arayüzdekiyle aynı biçimde: kod:tutar, artan, | ile", async () =>
  islem(db, async () => {
    await ikiUrundeTaslak();
    await rol(db, "authenticated", KURUCU);
    assert.equal(await imza(), `${ARVOLAB_KODU}:549000|${ARVOOS_KODU}:259000`);
  }));

test("imza tutuyorsa yayımlanıyor", async () =>
  islem(db, async () => {
    await ikiUrundeTaslak();
    await rol(db, "authenticated", KURUCU);
    const beklenen = await imza();
    const sayi = (await db.query("select public.platform_fiyatlari_yayimla($1) as n", [beklenen])).rows[0].n;
    assert.equal(Number(sayi), 2);
  }));

test("araya yeni bir taslak girerse ESKİ onayla yayımlanmıyor", async () =>
  islem(db, async () => {
    await ikiUrundeTaslak();
    await rol(db, "authenticated", KURUCU);
    const eskiOnay = await imza();

    /* İkinci oturum üçüncü bir basamağı taslağa alıyor. */
    await rol(db, "postgres");
    await db.exec(`
      insert into public.platform_fiyat_listesi (kod, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, updated_at)
      values ('arvoos-profesyonel', 'plan', 399000, 429000, true, now())
      on conflict (kod) do update set taslak_kurus = excluded.taslak_kurus, taslak_bekliyor = true;
    `);

    await rol(db, "authenticated", KURUCU);
    await reddedilir(
      db,
      "select public.platform_fiyatlari_yayimla($1)",
      [eskiOnay],
      /önizlemeden sonra değişti/i,
    );
    /* Hiçbir şey yayımlanmadı: üç taslak da bekliyor. */
    const kalan = (await db.query("select count(*)::int as n from public.platform_fiyat_listesi where taslak_bekliyor")).rows[0].n;
    assert.equal(Number(kalan), 3);
  }));

test("tutarı değişen bir taslak da eski onayı düşürüyor", async () =>
  islem(db, async () => {
    await ikiUrundeTaslak();
    await rol(db, "authenticated", KURUCU);
    const eskiOnay = await imza();
    await rol(db, "postgres");
    await db.exec(`update public.platform_fiyat_listesi set taslak_kurus = 599000 where kod = '${ARVOLAB_KODU}'`);
    await rol(db, "authenticated", KURUCU);
    await reddedilir(db, "select public.platform_fiyatlari_yayimla($1)", [eskiOnay], /önizlemeden sonra değişti/i);
  }));

test("kapsamlı yayım da KURUCUYA özel", async () =>
  islem(db, async () => {
    await ikiUrundeTaslak();
    await rol(db, "authenticated", YABANCI);
    await reddedilir(db, "select public.platform_fiyatlari_yayimla($1)", [""], /kurucu yetkisi/i);
  }));
