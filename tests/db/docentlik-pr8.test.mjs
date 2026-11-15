/*
  F6 PR8 (20261115145234): belge_yolu güvenliği, sahipsiz belge temizliği,
  gözetim adları ve sayfalı gözetim listesi — gerçek PostgreSQL (PGlite)
  davranışı, Supabase rolleriyle.

  Depo şeması düzenekte yok: storage.objects'in bu işlevlerin okuduğu
  sütunlarla en küçük taklidi kuruluyor (id, bucket_id, name, owner,
  owner_id, metadata, created_at). Storage API'nin kendisi (dosyanın
  silinmesi, imzalı adres) tests/entegrasyon'da gerçek API ile.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";
import { AM, AM2, K, R, aktorOl, tohumla } from "./docentlik-ortak.mjs";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const KOVA = "docentlik-belgeleri";
const yol = (sahip, faaliyet, ad = crypto.randomUUID()) => `${AM}/faaliyet/${sahip}/${faaliyet}/${ad}.pdf`;
const BAGLA = "select * from public.docentlik_belge_bagla($1, $2, $3, $4, $5)";
const KALDIR = "select * from public.docentlik_belge_kaldir($1, $2, $3, $4)";

before(async () => {
  db = await veritabani();
  await tohumla(db);
  await rol(db, "postgres");
  await db.exec(`
    create schema if not exists storage;
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text,
      metadata jsonb, created_at timestamptz not null default now(), unique (bucket_id, name));
    grant usage on schema storage to service_role, authenticated;
    grant select, update on storage.objects to service_role; -- Supabase'te service_role'ün tam yetkisi var; FOR UPDATE kilidi UPDATE yetkisi ister
  `);
});

async function nesne(ad, { sahip = K.sahip, tur = "application/pdf", boyut = 1024, yas = "0 seconds", kova = KOVA } = {}) {
  await rol(db, "postgres");
  return (await db.query(
    `insert into storage.objects (bucket_id, name, owner, owner_id, metadata, created_at)
     values ($1, $2, $3::uuid, $3::text, jsonb_build_object('mimetype', $4::text, 'size', $5::bigint), now() - $6::interval) returning id`,
    [kova, ad, sahip, tur, boyut, yas])).rows[0].id;
}
/* AKTORLER haritasında "kişi kuralıyla kapatılmış gözetim" yok; o aktör rol() ile. */
const ol = (aktor) => (aktor === "gozetimKapali" ? rol(db, "authenticated", K.gozetimKapali) : aktorOl(db, aktor));
/* İşlevin SQLSTATE'i (DB403, DB409…); dene() yalnızca metni veriyor. */
const kod = async (sql, p) => {
  await db.exec("savepoint kod");
  try {
    await db.query(sql, p);
    await db.exec("release savepoint kod");
    return "ok";
  } catch (hata) {
    await db.exec("rollback to savepoint kod");
    return hata.code ?? hata.message;
  }
};

describe("1. belge_yolu istemciye kapalı", () => {
  test("sahip PostgREST yoluyla belge_yolu yazamaz (UPDATE ve INSERT sütun yetkisi yok)", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      await reddedilir(db, "update public.docentlik_faaliyetleri set belge_yolu = $1 where id = $2", [yol(K.sahip, R.faaliyet), R.faaliyet], /permission denied/);
      // Diğer sütunlar hâlâ yazılabiliyor (meşru düzenleme bozulmadı).
      const r = await db.query("update public.docentlik_faaliyetleri set title = 'Başlık' where id = $1 returning id", [R.faaliyet]);
      assert.equal(r.rows.length, 1);
    }));

  test("bağlama/kaldırma işlevlerini yalnızca service_role çalıştırır; security invoker", () =>
    islem(db, async () => {
      for (const aktor of ["sahip", "anon", "gozetim", "kurumSahibi"]) {
        await aktorOl(db, aktor);
        await reddedilir(db, BAGLA, [K.sahip, AM, R.faaliyet, yol(K.sahip, R.faaliyet), null], /permission denied/);
        await reddedilir(db, KALDIR, [K.sahip, AM, R.faaliyet, null], /permission denied/);
      }
      await rol(db, "postgres");
      const definer = (await db.query("select proname, prosecdef from pg_proc where proname in ('docentlik_belge_bagla','docentlik_belge_kaldir')")).rows;
      assert.deepEqual(definer.map((d) => d.prosecdef), [false, false], "bağlama işlevleri definer olmamalı");
    }));
});

describe("2. bağlama işlevi: sahip, kurum, modül, üyelik, nesne", () => {
  test("meşru bağlama: geçerli PDF bağlanır, önceki yol döner; ikinci bağlama eski yolu iyimser kilitle ister", () =>
    islem(db, async () => {
      const y1 = yol(K.sahip, R.faaliyet); await nesne(y1);
      await rol(db, "service_role");
      assert.equal((await tek(BAGLA, [K.sahip, AM, R.faaliyet, y1, null])).eski_yol, null);
      const y2 = yol(K.sahip, R.faaliyet); await nesne(y2);
      await rol(db, "service_role");
      assert.equal(await kod(BAGLA, [K.sahip, AM, R.faaliyet, y2, null]), "DB409", "eski yol beklenmezse yazılmaz");
      assert.equal((await tek("select belge_yolu from public.docentlik_faaliyetleri where id = $1", [R.faaliyet])).belge_yolu, y1, "önceki bağlantı korunur");
      assert.equal((await tek(BAGLA, [K.sahip, AM, R.faaliyet, y2, y1])).eski_yol, y1);
    }));

  test("başkasının nesnesi, başkasının yolu, başka kurum, kapalı modül, iptal üyelik: hiçbiri bağlanmaz", () =>
    islem(db, async () => {
      const uyeninNesnesi = yol(K.sahip, R.faaliyet); await nesne(uyeninNesnesi, { sahip: K.uye });
      const baskaYol = yol(K.uye, R.faaliyet); await nesne(baskaYol, { sahip: K.uye });
      const iptalYol = `${AM}/faaliyet/${K.iptal}/${R.faaliyetIptal}/${crypto.randomUUID()}.pdf`; await nesne(iptalYol, { sahip: K.iptal });
      await rol(db, "service_role");
      assert.equal(await kod(BAGLA, [K.sahip, AM, R.faaliyet, uyeninNesnesi, null]), "DB404", "başkasının yüklediği nesne");
      assert.equal(await kod(BAGLA, [K.sahip, AM, R.faaliyet, baskaYol, null]), "DB403", "başka kişinin yolu");
      assert.equal(await kod(BAGLA, [K.uye, AM, R.faaliyet, baskaYol, null]), "DB403", "başkasının faaliyeti");
      assert.equal(await kod(BAGLA, [K.yabanci, AM2, R.faaliyetAm2, `${AM2}/faaliyet/${K.yabanci}/${R.faaliyetAm2}/${crypto.randomUUID()}.pdf`, null]), "DB404", "nesne yoksa (kurum yolu geçerli)");
      assert.equal(await kod(BAGLA, [K.sahip, AM2, R.faaliyet, yol(K.sahip, R.faaliyet), null]), "DB403", "kurum uyuşmuyor");
      assert.equal(await kod(BAGLA, [K.iptal, AM, R.faaliyetIptal, iptalYol, null]), "DB403", "üyeliği iptal");
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = 'docentlik'", [AM]);
      const y = yol(K.sahip, R.faaliyet); await nesne(y);
      await rol(db, "service_role");
      assert.equal(await kod(BAGLA, [K.sahip, AM, R.faaliyet, y, null]), "DB403", "modül kapalı");
      await rol(db, "postgres");
      assert.equal((await tek("select belge_yolu from public.docentlik_faaliyetleri where id = $1", [R.faaliyet])).belge_yolu, null);
    }));

  test("PDF olmayan, boş, 20 MB'ı aşan, 1 saatten eski ve temizlikte kiralanmış nesne bağlanmaz", () =>
    islem(db, async () => {
      const durumlar = [
        [{ tur: "text/html" }, "DB415"], [{ boyut: 0 }, "DB415"], [{ boyut: 21 * 1024 * 1024 }, "DB415"], [{ yas: "2 hours" }, "DB410"],
      ];
      for (const [secenek, beklenen] of durumlar) {
        const y = yol(K.sahip, R.faaliyet); await nesne(y, secenek);
        await rol(db, "service_role");
        assert.equal(await kod(BAGLA, [K.sahip, AM, R.faaliyet, y, null]), beklenen, JSON.stringify(secenek));
      }
      const y = yol(K.sahip, R.faaliyet); const id = await nesne(y);
      await db.query("insert into private.docentlik_belge_temizligi (nesne_id, ad, kira, kira_bitis) values ($1, $2, gen_random_uuid(), now() + interval '5 minutes')", [id, y]);
      await rol(db, "service_role");
      assert.equal(await kod(BAGLA, [K.sahip, AM, R.faaliyet, y, null]), "DB410", "temizlikte");
      assert.equal(await kod(BAGLA, [K.sahip, AM, R.faaliyet, "../x.pdf", null]), "DB403", "biçimsiz yol");
    }));

  test("kaldırma: yalnızca sahip, eski yol beklenmeli", () =>
    islem(db, async () => {
      const y = yol(K.sahip, R.faaliyet); await nesne(y);
      await rol(db, "service_role");
      await tek(BAGLA, [K.sahip, AM, R.faaliyet, y, null]);
      assert.equal(await kod(KALDIR, [K.uye, AM, R.faaliyet, y]), "DB403");
      assert.equal(await kod(KALDIR, [K.sahip, AM, R.faaliyet, null]), "DB409");
      assert.equal((await tek(KALDIR, [K.sahip, AM, R.faaliyet, y])).eski_yol, y);
      assert.equal((await tek("select belge_yolu from public.docentlik_faaliyetleri where id = $1", [R.faaliyet])).belge_yolu, null);
    }));
});

describe("3. sahipsiz belge temizliği", () => {
  const al = (esik = "24 hours", sinir = 100) => db.query("select * from public.docentlik_temizlik_al($1::interval, $2)", [esik, sinir]);

  test("aday yalnızca: bu kova + doçentlik yolu + 24 saatten eski + hiçbir kayda bağlı değil", () =>
    islem(db, async () => {
      const sahipsiz = yol(K.sahip, R.faaliyet); const sahipsizId = await nesne(sahipsiz, { yas: "2 days" });
      await nesne(yol(K.sahip, R.faaliyet), { yas: "2 hours" }); // yeni: eşiğin altında
      const bagli = yol(K.sahip, R.faaliyet); await nesne(bagli, { yas: "2 days" });
      await db.query("update public.docentlik_faaliyetleri set belge_yolu = $1 where id = $2", [bagli, R.faaliyet]);
      await db.query("update public.docentlik_uak_tablolari set depo_yolu = depo_yolu where id = $1", [R.uak]);
      const uakYolu = (await tek("select depo_yolu from public.docentlik_uak_tablolari where id = $1", [R.uak])).depo_yolu;
      await nesne(uakYolu, { yas: "2 days" });
      await nesne(`${AM}/tez/${crypto.randomUUID()}.pdf`, { yas: "2 days" }); // biçimsiz
      await nesne(sahipsiz, { yas: "2 days", kova: "project-files" }); // başka kova, aynı ad
      await rol(db, "service_role");
      const adaylar = (await al("1 second")).rows; // eşik düşürülemez
      assert.deepEqual(adaylar.map((a) => a.nesne_id), [sahipsizId]);
      assert.equal(adaylar[0].ad, sahipsiz);
    }));

  test("kira: ikinci temizleyici aynı nesneyi alamaz; onay yalnızca kira sahibine ve hâlâ sahipsizse", () =>
    islem(db, async () => {
      const a = yol(K.sahip, R.faaliyet); const aId = await nesne(a, { yas: "2 days" });
      const b = yol(K.sahip, R.faaliyet); const bId = await nesne(b, { yas: "2 days" });
      await rol(db, "service_role");
      const ilk = (await al()).rows;
      assert.equal(ilk.length, 2);
      assert.equal((await al()).rows.length, 0, "kirali nesneler ikinci kez alınmaz");
      const kira = ilk[0].kira;
      assert.equal((await tek("select public.docentlik_temizlik_onayla($1, gen_random_uuid()) as ad", [aId])).ad, null, "yanlış kira");
      assert.equal((await tek("select public.docentlik_temizlik_onayla($1, $2) as ad", [aId, kira])).ad, a);
      // Kira sırasında kayda bağlandıysa (beklenmeyen) silinmez ve kira bırakılır.
      await rol(db, "postgres");
      await db.query("update public.docentlik_faaliyetleri set belge_yolu = $1 where id = $2", [b, R.faaliyet]);
      await rol(db, "service_role");
      assert.equal((await tek("select public.docentlik_temizlik_onayla($1, $2) as ad", [bId, kira])).ad, null);
      await rol(db, "postgres");
      // Eskiden satır siliniyordu; artık kapanıyor (ad kilidi 24 saat, 20261115154855).
      assert.equal((await tek("select count(*)::int n from private.docentlik_belge_temizligi where nesne_id = $1 and kapandi_at is not null and kira is null", [bId])).n, 1);
    }));

  test("başarısız silme: deneme sayılır, geri çekilme süresince alınmaz, süre dolunca yeniden denenir; başarı kaydı kapatır", () =>
    islem(db, async () => {
      const a = yol(K.sahip, R.faaliyet); const aId = await nesne(a, { yas: "2 days" });
      await rol(db, "service_role");
      const [aday] = (await al()).rows;
      await db.query("select public.docentlik_temizlik_sonuc($1, $2, false, $3)", [aId, aday.kira, "geçici hata"]);
      const durum = await tek("select * from public.docentlik_temizlik_durumu()");
      assert.deepEqual([Number(durum.bekleyen_hatali), durum.en_cok_deneme], [1, 1]);
      assert.equal((await al()).rows.length, 0, "geri çekilme süresinde alınmaz");
      await rol(db, "postgres");
      await db.query("update private.docentlik_belge_temizligi set kira_bitis = now() - interval '1 second' where nesne_id = $1", [aId]);
      await rol(db, "service_role");
      const [yeniden] = (await al()).rows;
      assert.equal(yeniden.nesne_id, aId);
      await db.query("select public.docentlik_temizlik_sonuc($1, $2, true, null)", [aId, yeniden.kira]);
      const sonra = await tek("select * from public.docentlik_temizlik_durumu()");
      assert.deepEqual([Number(sonra.bekleyen_hatali), sonra.en_cok_deneme], [0, 0], "kapanmış satır görünürlükte sayılmaz");
      await rol(db, "postgres");
      assert.equal((await tek("select count(*)::int n from private.docentlik_belge_temizligi where kapandi_at is null")).n, 0);
      // 24 saat sonra kapanmış satır süpürülür (nesne gerçekte Storage API'siyle silindi; taklitte elle).
      await db.query("delete from storage.objects where id = $1", [aId]);
      await db.query("update private.docentlik_belge_temizligi set kapandi_at = now() - interval '25 hours'");
      await rol(db, "service_role");
      await al();
      await rol(db, "postgres");
      assert.equal((await tek("select count(*)::int n from private.docentlik_belge_temizligi")).n, 0);
    }));

  test("ad kilidi: temizlik kaydı olan ad (kirali, kapanmış) faaliyete bağlanamaz — aynı adla yeniden yüklense bile", () =>
    islem(db, async () => {
      const a = yol(K.sahip, R.faaliyet); const aId = await nesne(a, { yas: "2 days" });
      await rol(db, "service_role");
      const [aday] = (await al()).rows;
      assert.equal((await tek("select public.docentlik_temizlik_onayla($1, $2) as ad", [aId, aday.kira])).ad, a);
      // Onaydan sonra sahip nesneyi silip AYNI adla yeniden yükler (yeni kimlik, yeni tarih).
      await rol(db, "postgres");
      await db.query("delete from storage.objects where id = $1", [aId]);
      await nesne(a);
      await rol(db, "service_role");
      assert.equal(await kod("select * from public.docentlik_belge_bagla($1, $2, $3, $4, null)", [K.sahip, AM, R.faaliyet, a]), "DB410", "kirali ad bağlandı");
      // Kira dolup başka bir temizleyici kapatsa bile (gecikmiş silme hâlâ yolda olabilir) 24 saat kilitli.
      await rol(db, "postgres");
      await db.query("update private.docentlik_belge_temizligi set kira_bitis = now() - interval '1 second'");
      await rol(db, "service_role");
      await al(); // nesnesi gitmiş açık satır kapanır
      await rol(db, "postgres");
      assert.equal((await tek("select count(*)::int n from private.docentlik_belge_temizligi where ad = $1 and kapandi_at is not null", [a])).n, 1);
      await rol(db, "service_role");
      assert.equal(await kod("select * from public.docentlik_belge_bagla($1, $2, $3, $4, null)", [K.sahip, AM, R.faaliyet, a]), "DB410", "kapanmış ad bağlandı");
      await rol(db, "postgres");
      assert.equal((await tek("select coalesce(belge_yolu, '') y from public.docentlik_faaliyetleri where id = $1", [R.faaliyet])).y === a, false);
    }));

  test("ÜAK depo_yolu (authenticated): yalnızca kendi yüklediği, 1 saatten yeni ve temizlikte olmayan nesne", () =>
    islem(db, async () => {
      const uak = (u) => `${AM}/uak/${u}/t.pdf`;
      const yeni = uak("00000000-0000-4000-8000-0000000e0001");
      const eski = uak("00000000-0000-4000-8000-0000000e0002");
      const baskasinin = uak("00000000-0000-4000-8000-0000000e0003");
      const kirali = uak("00000000-0000-4000-8000-0000000e0004");
      const yok = uak("00000000-0000-4000-8000-0000000e0005");
      await nesne(yeni, { sahip: K.yonetici });
      await nesne(eski, { sahip: K.yonetici, yas: "2 days" });
      await nesne(baskasinin, { sahip: K.kurumSahibi });
      const kId = await nesne(kirali, { sahip: K.yonetici });
      await rol(db, "postgres");
      await db.query("insert into private.docentlik_belge_temizligi (nesne_id, ad, kapandi_at) values ($1, $2, now())", [kId, kirali]);
      const ekle = (y, alan) => kod("insert into public.docentlik_uak_tablolari (organization_id, temel_alan, donem, depo_yolu) values ($1, $2, '2026', $3) returning id", [AM, alan, y]);
      await aktorOl(db, "yonetici");
      for (const [y, ad] of [[eski, "eski"], [baskasinin, "başkasının"], [kirali, "temizlikteki"], [yok, "olmayan"]]) {
        assert.equal(await ekle(y, `PR8 ${ad}`), "42501", `${ad} nesneye ÜAK kaydı yazıldı`);
      }
      // Var olan kaydın yolunu eski nesneye çevirmek de reddedilir; başka sütun güncellemesi serbest.
      assert.equal(await kod("update public.docentlik_uak_tablolari set depo_yolu = $1 where id = $2 returning id", [eski, R.uak]), "42501");
      assert.equal(await kod("update public.docentlik_uak_tablolari set donem = '2027' where id = $1 returning id", [R.uak]), "ok");
      assert.equal(await ekle(yeni, "PR8 meşru"), "ok", "meşru akış (yeni yüklenen kendi nesnesi) çalışmalı");
      // service_role yolu (sunucu) bu kurala tabi değil — tetikleyici yalnızca authenticated için.
      await rol(db, "service_role");
      assert.equal(await kod("update public.docentlik_uak_tablolari set depo_yolu = $1 where id = $2 returning id", [eski, R.uak]), "ok");
    }));

  test("temizlik işlevleri ve kira tablosu yalnızca service_role'e açık", () =>
    islem(db, async () => {
      for (const aktor of ["sahip", "kurumSahibi", "anon"]) {
        await aktorOl(db, aktor);
        await reddedilir(db, "select * from public.docentlik_temizlik_al('24 hours', 10)", [], /permission denied/);
        await reddedilir(db, "select public.docentlik_temizlik_onayla(gen_random_uuid(), gen_random_uuid())", [], /permission denied/);
        await reddedilir(db, "select public.docentlik_temizlik_sonuc(gen_random_uuid(), gen_random_uuid(), true, null)", [], /permission denied/);
        await reddedilir(db, "select * from private.docentlik_belge_temizligi", [], /permission denied/);
      }
    }));
});

describe("4. gözetim adları (dar işlev; profiles RLS gevşetilmedi)", () => {
  const ADLAR = "select * from public.docentlik_kisi_adlari($1, $2::uuid[])";
  before(async () => {
    await rol(db, "postgres");
    await db.query(`insert into public.profiles (id, full_name) values ($1, 'Profil Adı'), ($2, 'Yabancı Kişi') on conflict (id) do update set full_name = excluded.full_name`, [K.sahip, K.yabanci]);
    await db.query(`insert into public.hr_employees (organization_id, user_id, full_name) values ($1, $2, 'Personel Kaydındaki Ad')`, [AM, K.uye]);
    await db.query(`insert into public.profiles (id, full_name) values ($1, 'Üye Profil Adı') on conflict (id) do update set full_name = excluded.full_name`, [K.uye]);
  });

  test("tumunu_gor: yalnızca aynı kurumun üyelerinin adı; personel kaydı profili ezer; yalnızca (kisi, ad)", () =>
    islem(db, async () => {
      await aktorOl(db, "gozetim");
      const r = await db.query(ADLAR, [AM, [K.sahip, K.uye, K.yabanci, crypto.randomUUID()]]);
      assert.deepEqual(r.fields.map((f) => f.name), ["kisi", "ad"]);
      const harita = Object.fromEntries(r.rows.map((x) => [x.kisi, x.ad]));
      assert.equal(harita[K.sahip], "Profil Adı");
      assert.equal(harita[K.uye], "Personel Kaydındaki Ad");
      assert.ok(!(K.yabanci in harita), "başka kurumun kişisi döndü");
      assert.equal(r.rows.length, 2);
      // profiles tablosu doğrudan hâlâ kapalı
      assert.equal((await db.query("select count(*)::int n from public.profiles where id = $1", [K.sahip])).rows[0].n, 0);
    }));

  test("yetkisiz üye, kişi kuralıyla kapatılmış gözetim, yabancı ve anon hiçbir ad almaz", () =>
    islem(db, async () => {
      for (const aktor of ["uye", "gozetimKapali", "yabanci", "yonetici"]) {
        await ol(aktor);
        assert.equal((await db.query(ADLAR, [AM, [K.sahip, K.uye]])).rows.length, 0, aktor);
      }
      await aktorOl(db, "yabanci");
      assert.equal((await db.query(ADLAR, [AM2, [K.sahip]])).rows.length, 0, "kendi kurumunda başka kurumun kişisi");
      await aktorOl(db, "anon");
      await reddedilir(db, ADLAR, [AM, [K.sahip]], /permission denied/);
    }));

  test("modül kapanınca boş; 200'den fazla kişi reddedilir; definer ama yalnızca authenticated'a açık", () =>
    islem(db, async () => {
      await aktorOl(db, "gozetim");
      await reddedilir(db, ADLAR, [AM, Array.from({ length: 201 }, () => crypto.randomUUID())], /200/);
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = 'docentlik'", [AM]);
      await aktorOl(db, "gozetim");
      assert.equal((await db.query(ADLAR, [AM, [K.sahip]])).rows.length, 0);
      await rol(db, "postgres");
      const yetki = async (r) => (await tek("select has_function_privilege($1, 'public.docentlik_kisi_adlari(uuid, uuid[])', 'execute') v", [r])).v;
      assert.deepEqual([await yetki("authenticated"), await yetki("anon"), await yetki("service_role")], [true, false, false]);
    }));
});

describe("5. sayfalı gözetim listesi (1100+ kişi)", () => {
  const LISTE = "select * from public.docentlik_gozetim_listesi($1, $2, $3)";
  before(async () => {
    await rol(db, "postgres");
    await db.exec(`
      insert into auth.users (id, email)
      select ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, 'k' || g || '@sentetik.test' from generate_series(1, 1100) g;
      insert into public.docentlik_profilleri (organization_id, owner_id, doktora_tarihi, temel_alan)
      select '${AM}', ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, case when g % 2 = 0 then date '2019-01-01' end, 'Alan'
      from generate_series(1, 1100) g;
    `);
  });

  test("sayfa sınırları, toplam, kararlı sıralama, sayfalar arası tekrar/kayıp yok", () =>
    islem(db, async () => {
      await aktorOl(db, "gozetim");
      const ozet = await tek("select * from public.docentlik_gozetim_ozeti($1)", [AM]);
      const toplam = Number(ozet.kisi_sayisi);
      assert.ok(toplam >= 1101, String(toplam));
      const gorulen = new Set();
      let onceki = null;
      for (let atla = 0; atla < toplam; atla += 50) {
        const r = (await db.query(LISTE, [AM, 50, atla])).rows;
        assert.equal(r.length, Math.min(50, toplam - atla));
        for (const s of r) {
          assert.equal(Number(s.toplam), toplam);
          assert.ok(!gorulen.has(s.kisi), "tekrar");
          gorulen.add(s.kisi);
          const anahtar = [-Number(s.faaliyet_sayisi), s.kisi];
          if (onceki) assert.ok(onceki[0] < anahtar[0] || (onceki[0] === anahtar[0] && onceki[1] < anahtar[1]), "sıra kararsız");
          onceki = anahtar;
        }
      }
      assert.equal(gorulen.size, toplam);
      assert.equal((await db.query(LISTE, [AM, 50, toplam])).rows.length, 0, "son sayfanın ötesi boş");
      assert.equal((await db.query(LISTE, [AM, 500, 0])).rows.length, 100, "sayfa boyu en çok 100");
      const r0 = await db.query(LISTE, [AM, 1, 0]);
      assert.ok(!r0.fields.some((f) => f.name === "doktora_tarihi"), "doktora tarihi dönmemeli");
      const tarihsiz = (await db.query(`select count(*)::int n from (select k from (select owner_id k from public.docentlik_profilleri where organization_id=$1 union select owner_id from public.docentlik_faaliyetleri where organization_id=$1) x) y`, [AM])).rows;
      assert.ok(tarihsiz); // sorgu RLS altında; özet kendi içinde tutarlı:
      assert.ok(Number(ozet.tarihsiz_sayisi) >= 550 && Number(ozet.tarihsiz_sayisi) <= toplam);
    }));

  test("yetkisiz üye, kapalı gözetim, yabancı boş; anon çalıştıramaz", () =>
    islem(db, async () => {
      for (const aktor of ["uye", "gozetimKapali", "yabanci"]) {
        await ol(aktor);
        assert.equal((await db.query(LISTE, [AM, 50, 0])).rows.length, 0, aktor);
        assert.equal((await db.query("select * from public.docentlik_gozetim_ozeti($1)", [AM])).rows.length, 0, aktor);
      }
      await aktorOl(db, "anon");
      await reddedilir(db, LISTE, [AM, 50, 0], /permission denied/);
    }));
});
