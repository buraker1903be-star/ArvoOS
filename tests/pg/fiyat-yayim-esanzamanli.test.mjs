/*
  FİYAT YAYIMI — İKİ BAĞIMSIZ OTURUM (28.11.2026).

  Kapsam kilidinin iddiası eşzamanlılık üzerine: "kontrol ile yazma
  aynı işlemde" ve "kullanıcının onaylamadığı satır yayımlanmaz".
  PGlite tek bağlantılı olduğu için orada iki oturum arasındaki
  kilitlenme ve anlık görüntü farkı HİÇ ölçülemiyor; bu dosya gerçek
  bir PostgreSQL kümesinde iki ayrı `psql` oturumuyla koşuyor
  (tests/pg/ortam-pg.mjs — geçici küme, unix soketi, canlıya
  dokunmadan).

  Sınanan üç şey:
    1. Önizleme ile RPC arasında araya giren taslak: eski onay
       reddediliyor.
    2. Kilit gerçekten bekletiyor: A'nın yayımı B'nin işlemi bitene
       kadar duruyor, B'nin eklediği satır görülüyor ve yayım
       reddediliyor.
    3. Yazma onaylanan (kod, tutar) çiftleriyle sınırlı: kontrolün
       arkasındaki pencerede bile onaylanmayan satır yazılmıyor.

  Ayrıca eski imzasız çağrı ve yetki kuralları burada da koşuyor:
  aynı işlevin PGlite'taki davranışı ile gerçek sunucudaki davranışı
  ayrışırsa bunu testin söylemesi gerekiyor.
*/
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Oturum, POSTGRES_YOK, kumeyiKur } from "./ortam-pg.mjs";

const KURUCU = "00000000-0000-4000-8000-0000000e0001";
const YABANCI = "00000000-0000-4000-8000-0000000e0002";
const ARVO = "00000000-0000-4000-8000-0000000e00a1";
const BASKA = "00000000-0000-4000-8000-0000000e00a2";

const LAB = "arvolab-arastirmaci";
const OS = "arvoos-baslangic";
const UCUNCU = "arvoos-profesyonel";

describe("fiyat yayımı · iki bağımsız oturum", { skip: POSTGRES_YOK ?? false }, () => {
  let kume;
  /** S: tohum ve doğrulama oturumu (veritabanı sahibi, RLS dışı). */
  let S;
  /** A: kurucunun oturumu. B: ikinci bağımsız oturum. */
  let A;
  let B;

  const kurucuOl = (o, kim = KURUCU) => o.calistir(
    `set role authenticated; select set_config('request.jwt.claims', '{"sub":"${kim}","role":"authenticated"}', false);`);

  /** Her senaryo aynı yerden başlasın: iki üründe bekleyen taslak. */
  const tohum = () => S.calistir(`
    delete from public.platform_fiyat_listesi where kod in ('${LAB}', '${OS}', '${UCUNCU}');
    insert into public.platform_fiyat_listesi (kod, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at, updated_at)
    values ('${LAB}', 'plan', 499000, 549000, true, now(), now()),
           ('${OS}',  'plan', 239000, 259000, true, now(), now());
  `);

  const durum = async () => {
    const { satirlar } = await S.calistir(
      `select kod || ' ' || aylik_kurus || ' ' || taslak_bekliyor
         from public.platform_fiyat_listesi
        where kod in ('${LAB}', '${OS}', '${UCUNCU}') order by kod;`);
    return satirlar;
  };

  const imza = async (o) => (await o.calistir("select public.platform_fiyat_kapsam_imzasi();")).satirlar[0];

  before(async () => {
    kume = await kumeyiKur();
    S = new Oturum(kume.soket, "S");
    A = new Oturum(kume.soket, "A");
    B = new Oturum(kume.soket, "B");
    const kurulum = await S.calistir(`
      insert into auth.users (id, email) values
        ('${KURUCU}', 'kurucu@arvo-os.com'), ('${YABANCI}', 'yabanci@deneme.com');
      insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '')
        on conflict (code) do nothing;
      insert into public.organizations (id, name, slug, status, plan_code) values
        ('${ARVO}', 'ArvoOS', 'arvo-os', 'active', 'starter'),
        ('${BASKA}', 'Başka Kurum', 'baska-kurum', 'active', 'starter');
      insert into public.organization_memberships (organization_id, user_id, role, is_active) values
        ('${ARVO}', '${KURUCU}', 'owner', true),
        ('${BASKA}', '${YABANCI}', 'owner', true);
    `);
    assert.equal(kurulum.hata, null, `tohum kurulamadı: ${kurulum.hata}`);
    await kurucuOl(A);
    await kurucuOl(B);
  });

  after(() => {
    for (const o of [S, A, B]) o?.kapat();
    kume?.kapat();
  });

  test("önizlemeden sonra ikinci oturum taslak eklerse eski onay reddediliyor", async () => {
    await tohum();
    /* A ekranı açıyor: gördüğü kümenin imzası. */
    const onay = await imza(A);

    /* B bağımsız bir oturum: üçüncü basamağı taslağa alıp COMMIT ediyor. */
    const eklendi = await B.calistir(`
      insert into public.platform_fiyat_listesi (kod, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, updated_at)
      values ('${UCUNCU}', 'plan', 399000, 429000, true, now());
    `);
    assert.equal(eklendi.hata, null);

    const sonuc = await A.calistir(`select public.platform_fiyatlari_yayimla('${onay}');`);
    assert.match(sonuc.hata ?? "", /önizlemeden sonra değişti/);

    /* Hiçbir satır yayımlanmadı: üçü de taslakta, tutarlar eski. */
    assert.deepEqual(await durum(), [
      `${LAB} 499000 true`, `${OS} 239000 true`, `${UCUNCU} 399000 true`,
    ]);
  });

  test("yayım, ikinci oturumun işlemi bitene kadar BEKLİYOR ve sonra reddediyor", async () => {
    await tohum();
    const onay = await imza(A);

    /*
      B bir işlem açıyor: var olan bir taslağı (aynı tutarla) güncelleyip
      satırı kilitliyor ve araya YENİ bir taslak koyuyor — ikisi de
      henüz COMMIT değil.
    */
    await B.calistir("begin;");
    await B.calistir(`update public.platform_fiyat_listesi set taslak_kurus = 549000 where kod = '${LAB}';`);
    await B.calistir(`
      insert into public.platform_fiyat_listesi (kod, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, updated_at)
      values ('${UCUNCU}', 'plan', 399000, 429000, true, now());
    `);

    await A.calistir("begin;");
    const yayim = A.baslat(`select public.platform_fiyatlari_yayimla('${onay}');`);
    /*
      İşlevin ilk ifadesi `for update`: B'nin kilidine takılıyor.
      Beklemiyorsa kilit yok demektir — kontrol ile yazma arasına
      başka bir oturum girebilir.
    */
    assert.equal(await Oturum.bekliyorMu(yayim), true, "yayım B'nin kilidini beklemedi");

    await B.calistir("commit;");
    const sonuc = await yayim;
    /* Kilit çözülünce imza YENİDEN hesaplanıyor ve B'nin satırını
       görüyor: kullanıcının onayı artık güncel değil. */
    assert.match(sonuc.hata ?? "", /önizlemeden sonra değişti/);
    await A.calistir("rollback;");

    assert.deepEqual(await durum(), [
      `${LAB} 499000 true`, `${OS} 239000 true`, `${UCUNCU} 399000 true`,
    ]);
  });

  test("araya giren satır, yazma anına kadar gelse bile yayımlanmıyor", async () => {
    await tohum();
    /* A'nın onayladığı küme: iki satır. */
    const onay = await imza(A);

    /* B araya üçüncü taslağı koyuyor ve COMMIT ediyor — yani yazma
       anında bekleyen ÜÇ satır var. */
    await B.calistir(`
      insert into public.platform_fiyat_listesi (kod, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, updated_at)
      values ('${UCUNCU}', 'plan', 399000, 429000, true, now());
    `);

    /*
      ÖNCE TESTİN KÖR OLMADIĞI GÖSTERİLİYOR. Eski yazma biçimi
      ("bekleyen her satır") aynı durumda ÜÇÜNCÜ satırı da yayına
      çıkarıyordu — kullanıcı onu hiç görmemişti. İşlem geri
      alınıyor; buradaki tek amaç farkın gerçek olduğunu ölçmek.
    */
    await A.calistir("begin;");
    const eskiBicim = await A.calistir(`
      update public.platform_fiyat_listesi
         set aylik_kurus = taslak_kurus, taslak_bekliyor = false
       where taslak_bekliyor returning kod;`);
    assert.equal(eskiBicim.satirlar.length, 3, "eski biçim üç satıra dokunmalıydı");
    assert.ok(eskiBicim.satirlar.includes(UCUNCU), "eski biçim onaylanmayan satırı da yayımlıyordu");
    await A.calistir("rollback;");

    /*
      Yazma yarısı doğrudan çağrılıyor: imza denetimi ile UPDATE
      arasındaki pencerenin tam karşılığı. Şimdi yalnızca onaylanan
      çiftler yazılıyor.
    */
    const sonuc = await A.calistir(`select private.fiyat_kapsam_yayimla('${onay}', now());`);
    assert.equal(sonuc.hata, null);
    assert.equal(sonuc.satirlar[0], "2");

    assert.deepEqual(await durum(), [
      /* Onaylanan ikisi yayında… */
      `${LAB} 549000 false`, `${OS} 259000 false`,
      /* …onaylanmayan satır ESKİ tutarında ve hâlâ taslakta. */
      `${UCUNCU} 399000 true`,
    ]);
  });

  test("güncel kapsamla yeniden onay geçiyor", async () => {
    await tohum();
    await B.calistir(`
      insert into public.platform_fiyat_listesi (kod, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, updated_at)
      values ('${UCUNCU}', 'plan', 399000, 429000, true, now());
    `);
    /* Kullanıcı ekranı yeniliyor: yeni kapsam, yeni onay. */
    const guncel = await imza(A);
    const sonuc = await A.calistir(`select public.platform_fiyatlari_yayimla('${guncel}');`);
    assert.equal(sonuc.hata, null);
    assert.equal(sonuc.satirlar[0], "3");
    assert.deepEqual(await durum(), [
      `${LAB} 549000 false`, `${OS} 259000 false`, `${UCUNCU} 429000 false`,
    ]);
  });

  test("eski imzasız çağrı bekleyen her taslağı yayımlamaya devam ediyor", async () => {
    await tohum();
    const sonuc = await A.calistir("select public.platform_fiyatlari_yayimla();");
    assert.equal(sonuc.hata, null);
    assert.equal(sonuc.satirlar[0], "2");
    assert.deepEqual(await durum(), [`${LAB} 549000 false`, `${OS} 259000 false`]);
  });

  test("kurucu olmayan oturum iki biçimde de reddediliyor, tutarlar değişmiyor", async () => {
    await tohum();
    const onay = await imza(A);
    const yabanci = new Oturum(kume.soket, "Y");
    try {
      await kurucuOl(yabanci, YABANCI);
      const imzali = await yabanci.calistir(`select public.platform_fiyatlari_yayimla('${onay}');`);
      assert.match(imzali.hata ?? "", /kurucu yetkisi/i);
      const imzasiz = await yabanci.calistir("select public.platform_fiyatlari_yayimla();");
      assert.match(imzasiz.hata ?? "", /kurucu yetkisi/i);
    } finally {
      yabanci.kapat();
    }
    assert.deepEqual(await durum(), [`${LAB} 499000 true`, `${OS} 239000 true`]);
  });

  test("anon yayım işlevlerini hiç çağıramıyor", async () => {
    const anon = new Oturum(kume.soket, "anon");
    try {
      await anon.calistir("set role anon;");
      const a = await anon.calistir("select public.platform_fiyatlari_yayimla('x:1');");
      assert.match(a.hata ?? "", /permission denied/i);
      const b = await anon.calistir("select private.fiyat_kapsam_yayimla('x:1', now());");
      assert.match(b.hata ?? "", /permission denied/i);
    } finally {
      anon.kapat();
    }
  });
});
