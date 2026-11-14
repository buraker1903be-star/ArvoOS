/*
  DOÇENTLİK SUNUCU İŞLEMLERİNİN VERİTABANI SÖZLEŞMESİ (F6 PR5).

  Sunucu işlemleri (app/panel/docentlik/actions.ts) Next ve supabase-js
  üzerinden çalışıyor; burada çalıştırılamıyorlar. Sınanan, onların
  veritabanına gönderdiği yazımların AYNISI, kullanıcının kendi rolüyle
  (authenticated) ve gerçek RLS/tetikleyicilerle:
   - meşru akış: ekleme → düzenleme → belge → silme; beklenen puan
     lib/docentlik-islem.ts'in kendisiyle hesaplanıyor (işlemin yaptığı
     doğrulamanın aynısı);
   - çift gönderim: istek anahtarı (20261114213340) ikinci satırı
     reddediyor, ilk kayıt bulunabiliyor; anahtar kişiye bağlı;
   - iyimser eşzamanlılık: eski sürümle güncelleme sıfır satır;
   - işlem sırasında üyelik düşer ya da modül kapanırsa yazma sıfır satır
     ya da RLS hatası;
   - başka kişi/kurum, puan manipülasyonu, istek anahtarını değiştirme;
   - işlemlerin yakaladığı hata kodları (23505, 23503);
   - kapsam dışı kovalara erişim yok.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";
import { AM, AM2, K, R, aktorOl, dene, tohumla } from "./docentlik-ortak.mjs";

await import("../register.mjs");
const islemCekirdegi = await import("../../lib/docentlik-islem.ts");

const DEPO_TAKLIDI = `
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, unique (bucket_id, name));
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated;
`;

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const SUTUNLAR = "id, criteria_id, unit_count, computed_points::text, paylasim_katsayisi::text, yazar_sayisi, baslica_yazar, belge_yolu, updated_at::text, title, notes, faaliyet_tarihi::text";
const KRITER = { points_per_unit: 20, baslica_yazar_katsayisi: 0.8, diger_yazar_katsayisi: 0.5, esit_bolusum: false };

before(async () => {
  db = await veritabani();
  await db.exec(DEPO_TAKLIDI);
  await db.exec(fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/20261114201157_docentlik_belge_kovasi.sql"), "utf8"));
  await tohumla(db);
});

/* İşlemin kurduğu ekleme yazımı (faaliyetFormu → insert). */
async function ekle(form, anahtar = null) {
  const f = islemCekirdegi.faaliyetFormu({ kriterId: R.kriter, ...form, istekAnahtari: anahtar ?? "" });
  assert.ok(f.ok, f.hata);
  const y = f.deger.yazim;
  return dene(db,
    `insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title, unit_count, yazar_sayisi, baslica_yazar, faaliyet_tarihi, notes, istek_anahtari)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning ${SUTUNLAR}`,
    [AM, K.sahip, y.criteria_id, y.title, y.unit_count, y.yazar_sayisi, y.baslica_yazar, y.faaliyet_tarihi, y.notes, f.deger.istekAnahtari]).then((s) => ({ ...s, yazim: y }));
}

describe("meşru akış: ekle → düzenle → belge → sil", () => {
  test("eklemede tetikleyicinin puanı işlem çekirdeğinin beklediğiyle birebir", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const s = await ekle({ baslik: "Makale", birimSayisi: "3", yazarSayisi: "4", baslicaYazar: "evet", faaliyetTarihi: "2023-03-01" });
      assert.ok(s.ok, s.hata);
      const beklenen = islemCekirdegi.beklenenEklemePuani(s.yazim, KRITER);
      assert.ok(islemCekirdegi.puanDogrulandiMi(beklenen, s.rows[0]), JSON.stringify({ beklenen, kayit: s.rows[0] }));
      assert.deepEqual([s.rows[0].computed_points, s.rows[0].paylasim_katsayisi], ["48", "0.8"]);
    }));

  test("düzenlemeler: başlık/not/tarih puanı değiştirmez; kriter pahalanınca eski birim puan korunur; doğrulama her adımda", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const { rows: [ilk], yazim } = await ekle({ baslik: "Makale", birimSayisi: "2", yazarSayisi: "3", baslicaYazar: "hayir" });
      await rol(db, "postgres");
      await db.query("update public.docentlik_kriterleri set points_per_unit = 50 where id = $1", [R.kriter]);
      await aktorOl(db, "sahip");
      let mevcut = ilk;
      for (const degisiklik of [{ title: "Yeni başlık", notes: "not", faaliyet_tarihi: "2024-01-01" }, { unit_count: 4 }, { baslica_yazar: true }, { yazar_sayisi: 1, baslica_yazar: true }]) {
        const yeni = { ...yazim, title: mevcut.title, notes: mevcut.notes, faaliyet_tarihi: mevcut.faaliyet_tarihi, unit_count: Number(mevcut.unit_count), yazar_sayisi: mevcut.yazar_sayisi, baslica_yazar: mevcut.baslica_yazar, ...degisiklik };
        const kriterSatiri = { ...KRITER, points_per_unit: 50 };
        const beklenen = islemCekirdegi.beklenenDuzenlemePuani(mevcut, yeni, kriterSatiri);
        const s = await dene(db,
          `update public.docentlik_faaliyetleri set criteria_id=$2, title=$3, unit_count=$4, yazar_sayisi=$5, baslica_yazar=$6, faaliyet_tarihi=$7, notes=$8
           where id=$1 and owner_id=$9 and organization_id=$10 and updated_at=$11::timestamptz returning ${SUTUNLAR}`,
          [mevcut.id, yeni.criteria_id, yeni.title, yeni.unit_count, yeni.yazar_sayisi, yeni.baslica_yazar, yeni.faaliyet_tarihi, yeni.notes, K.sahip, AM, mevcut.updated_at]);
        assert.ok(s.ok && s.rows.length === 1, `${JSON.stringify(degisiklik)}: ${s.hata ?? "0 satır"}`);
        assert.ok(islemCekirdegi.puanDogrulandiMi(beklenen, s.rows[0]), `${JSON.stringify(degisiklik)}: beklenen ${JSON.stringify(beklenen)}, kayıt ${s.rows[0].computed_points}`);
        mevcut = s.rows[0];
      }
      // İlk adım puanı değiştirmedi (20), birim 4 → 40 (eski birim puan 20, kriterin yeni 50'si değil).
    }));

  test("belge yolu kaydı, kaldırılması ve silmede kayıt önce gider", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const { rows: [f] } = await ekle({ baslik: "Belgeli", birimSayisi: "1" });
      const yol = islemCekirdegi.faaliyetBelgeYolu(AM, K.sahip, f.id, "00000000-0000-4000-8000-00000000aa01");
      assert.equal((await dene(db, "insert into storage.objects (bucket_id, name) values ('docentlik-belgeleri', $1) returning id", [yol])).ok, true, "sahip kendi yoluna yükleyebilmeli");
      const g = await dene(db, "update public.docentlik_faaliyetleri set belge_yolu = $2 where id = $1 and owner_id = $3 returning computed_points::text", [f.id, yol, K.sahip]);
      assert.ok(g.ok && g.rows[0].computed_points === f.computed_points, "belge eklemek puanı değiştirmemeli");
      const sil = await dene(db, "delete from public.docentlik_faaliyetleri where id = $1 and owner_id = $2 returning belge_yolu", [f.id, K.sahip]);
      assert.equal(sil.rows[0].belge_yolu, yol, "işlem silinen kaydın belge yolunu alıp nesneyi sonra siliyor");
      assert.equal((await dene(db, "delete from storage.objects where bucket_id = 'docentlik-belgeleri' and name = $1 returning id", [yol])).rows.length, 0,
        "kayıt gidince nesne de okunamaz/silinemez olur — bu yüzden işlem yolu SİLMEDEN ÖNCE değil, returning ile alıyor");
    }));
});

describe("çift gönderim ve tekrar deneme", () => {
  const ANAHTAR = "00000000-0000-4000-8000-00000000bb01";

  test("aynı istek anahtarıyla ikinci ekleme 23505 ile düşer; ilk kayıt anahtarla bulunur; puan bir kez sayılır", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const ilk = await ekle({ baslik: "Makale", birimSayisi: "1" }, ANAHTAR);
      assert.ok(ilk.ok);
      const ikinci = await ekle({ baslik: "Makale", birimSayisi: "1" }, ANAHTAR);
      assert.equal(ikinci.ok, false);
      assert.match(ikinci.hata, /duplicate key|docentlik_faaliyetleri_istek_anahtari/);
      const bulunan = await tek("select id from public.docentlik_faaliyetleri where organization_id=$1 and owner_id=$2 and istek_anahtari=$3", [AM, K.sahip, ANAHTAR]);
      assert.equal(bulunan.id, ilk.rows[0].id);
      assert.equal((await tek("select count(*)::int n from public.docentlik_faaliyetleri where istek_anahtari=$1", [ANAHTAR])).n, 1);
    }));

  test("anahtarsız eklemeler birbirini engellemez; anahtar kişiye bağlı (başkasının anahtarı onun kaydını döndürmez)", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      assert.ok((await ekle({ baslik: "A", birimSayisi: "1" })).ok);
      assert.ok((await ekle({ baslik: "A", birimSayisi: "1" })).ok);
      assert.ok((await ekle({ baslik: "B", birimSayisi: "1" }, ANAHTAR)).ok);
      await rol(db, "authenticated", K.uye);
      const s = await dene(db,
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title, istek_anahtari) values ($1,$2,$3,'Üye',$4) returning id",
        [AM, K.uye, R.kriter, ANAHTAR]);
      assert.ok(s.ok, "aynı anahtar başka kişide ayrı kayıt");
      assert.equal((await tek("select count(*)::int n from public.docentlik_faaliyetleri where istek_anahtari=$1", [ANAHTAR])).n, 1, "üye sahibin kaydını görmemeli");
    }));

  test("istek anahtarı sonradan değiştirilemez", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      await reddedilir(db, "update public.docentlik_faaliyetleri set istek_anahtari = $1 where id = $2", [ANAHTAR, R.faaliyet], /permission denied/);
    }));

  test("iyimser eşzamanlılık: eski sürümle güncelleme sıfır satır, kayıt üzerine yazılmaz", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const { rows: [eklenen] } = await ekle({ baslik: "Sürüm", birimSayisi: "1" });
      /*
        Test tek bir işlemin içinde ve now() işlem boyunca sabit: aynı
        işlemdeki güncelleme updated_at'ı AYNI değere yazar. Canlıda her
        istek ayrı işlem; kaydın daha önceki bir istekte yazıldığını
        kurmak için updated_at tetikleyici atlatılarak geçmişe alınıyor.
      */
      await rol(db, "postgres");
      await db.exec("set local session_replication_role = replica");
      await db.query("update public.docentlik_faaliyetleri set updated_at = now() - interval '1 minute' where id = $1", [eklenen.id]);
      await db.exec("set local session_replication_role = origin");
      const f = await tek("select id, updated_at::text from public.docentlik_faaliyetleri where id = $1", [eklenen.id]);
      await aktorOl(db, "sahip");
      const birinci = await dene(db, "update public.docentlik_faaliyetleri set title='Birinci' where id=$1 and updated_at=$2::timestamptz returning updated_at::text", [f.id, f.updated_at]);
      assert.equal(birinci.rows.length, 1);
      const ikinci = await dene(db, "update public.docentlik_faaliyetleri set title='İkinci' where id=$1 and updated_at=$2::timestamptz returning id", [f.id, f.updated_at]);
      assert.equal(ikinci.rows.length, 0, "eski sürüm reddedilmeli");
      assert.equal((await tek("select title from public.docentlik_faaliyetleri where id=$1", [f.id])).title, "Birinci");
    }));

  test("zaten silinmiş kaydı silmek sıfır satır (işlem bunu hata saymıyor)", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const { rows: [f] } = await ekle({ baslik: "Sil", birimSayisi: "1" });
      assert.equal((await dene(db, "delete from public.docentlik_faaliyetleri where id=$1 and owner_id=$2 returning id", [f.id, K.sahip])).rows.length, 1);
      assert.equal((await dene(db, "delete from public.docentlik_faaliyetleri where id=$1 and owner_id=$2 returning id", [f.id, K.sahip])).rows.length, 0);
    }));
});

describe("işlem sırasında yetki/modül değişirse", () => {
  test("üyelik düşünce düzenleme sıfır satır, ekleme RLS hatası", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.organization_memberships set is_active=false where organization_id=$1 and user_id=$2", [AM, K.sahip]);
      await aktorOl(db, "sahip");
      assert.equal((await dene(db, "update public.docentlik_faaliyetleri set title='x' where id=$1 returning id", [R.faaliyet])).rows.length, 0);
      const e = await ekle({ baslik: "x", birimSayisi: "1" });
      assert.equal(e.ok, false);
      assert.match(e.hata, /row-level security/);
    }));

  test("modül kapanınca profil upsert'i, kriter eklemesi ve belge yolu yazımı da reddedilir", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled=false where organization_id=$1 and module_code='docentlik'", [AM]);
      await aktorOl(db, "sahip");
      const p = await dene(db, "insert into public.docentlik_profilleri (organization_id, owner_id, temel_alan) values ($1,$2,'Hukuk') on conflict (organization_id, owner_id) do update set temel_alan = excluded.temel_alan returning owner_id", [AM, K.sahip]);
      assert.equal(p.ok && p.rows.length > 0, false);
      await aktorOl(db, "kurumSahibi");
      assert.equal((await dene(db, "insert into public.docentlik_kriterleri (organization_id, code, label) values ($1,'Q','q') returning id", [AM])).ok, false);
      await aktorOl(db, "sahip");
      const yol = islemCekirdegi.faaliyetBelgeYolu(AM, K.sahip, R.faaliyet, "00000000-0000-4000-8000-00000000aa02");
      assert.equal((await dene(db, "update public.docentlik_faaliyetleri set belge_yolu=$2 where id=$1 returning id", [R.faaliyet, yol])).rows.length, 0);
    }));
});

describe("başka kişi, başka kurum, manipülasyon", () => {
  test("profil upsert'i yalnızca kendi satırı; işlemin onConflict yazımı başkası adına çalışmaz", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const kendi = await dene(db, "insert into public.docentlik_profilleri (organization_id, owner_id, doktora_tarihi) values ($1,$2,'2020-01-01') on conflict (organization_id, owner_id) do update set doktora_tarihi=excluded.doktora_tarihi returning owner_id", [AM, K.sahip]);
      assert.equal(kendi.rows.length, 1);
      const baskasi = await dene(db, "insert into public.docentlik_profilleri (organization_id, owner_id) values ($1,$2) on conflict (organization_id, owner_id) do update set temel_alan='x' returning owner_id", [AM, K.uye]);
      assert.equal(baskasi.ok, false);
    }));

  test("başkasının faaliyetini düzenleme/silme sıfır satır; başka kurumun kriteriyle ekleme reddedilir", () =>
    islem(db, async () => {
      await aktorOl(db, "uye");
      assert.equal((await dene(db, "update public.docentlik_faaliyetleri set title='x' where id=$1 returning id", [R.faaliyet])).rows.length, 0);
      assert.equal((await dene(db, "delete from public.docentlik_faaliyetleri where id=$1 returning id", [R.faaliyet])).rows.length, 0);
      await aktorOl(db, "sahip");
      const e = await dene(db, "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title) values ($1,$2,$3,'x') returning id", [AM, K.sahip, R.kriterAm2]);
      assert.equal(e.ok, false);
    }));

  test("puan manipülasyonu: istemci puan yazamaz; yazmaya çalışmak isteği düşürür", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      await reddedilir(db, "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title, computed_points) values ($1,$2,$3,'x',9999)", [AM, K.sahip, R.kriter], /permission denied/);
      await reddedilir(db, "update public.docentlik_faaliyetleri set computed_points=9999 where id=$1", [R.faaliyet], /permission denied/);
    }));
});

describe("işlemlerin yakaladığı hata kodları", () => {
  test("faaliyeti olan kriteri silmek 23503 (işlem: 'pasife alın'); aynı kodla kriter ve aynı kapsamda hedef 23505", () =>
    islem(db, async () => {
      await aktorOl(db, "yonetici");
      const sil = await dene(db, "delete from public.docentlik_kriterleri where id=$1", [R.kriter]);
      assert.match(sil.hata, /foreign key/);
      const kod = await dene(db, "insert into public.docentlik_kriterleri (organization_id, code, label) values ($1,'A1','Yinelenen')", [AM]);
      assert.match(kod.hata, /duplicate key/);
      const hedef = await dene(db, "insert into public.docentlik_hedefleri (organization_id, grup, asgari_puan) values ($1,null,50)", [AM]);
      assert.match(hedef.hata, /duplicate key/);
      const pasif = await dene(db, "update public.docentlik_kriterleri set is_active=false where id=$1 returning id", [R.kriter]);
      assert.equal(pasif.rows.length, 1, "pasife alma yolu açık olmalı");
    }));

  test("ÜAK: aynı temel alan için ikinci tablo 23505 (işlem: 'önce mevcut tabloyu kaldırın'); onay sütunları kullanıcıya kapalı", () =>
    islem(db, async () => {
      await aktorOl(db, "yonetici");
      const yol = islemCekirdegi.uakBelgeYolu(AM, "00000000-0000-4000-8000-00000000cc01", "00000000-0000-4000-8000-00000000cc02");
      const ikinci = await dene(db, "insert into public.docentlik_uak_tablolari (organization_id, temel_alan, donem, depo_yolu) values ($1,'Eğitim Bilimleri','2027',$2)", [AM, yol]);
      assert.match(ikinci.hata, /duplicate key/);
      await reddedilir(db, "update public.docentlik_uak_tablolari set durum='onaylandi' where id=$1", [R.uak], /yalnızca sunucu/);
    }));
});

describe("Storage kapsamı", () => {
  test("işlemlerin kullandığı tek kova Doçentlik kovası; kapsam dışı kovalara yazma/okuma politikası yok", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("insert into storage.objects (bucket_id, name) values ('operation-team-files', $1), ('hr-documents', $1)", [`${AM}/x/y.pdf`]);
      for (const aktor of ["sahip", "kurumSahibi", "yonetici"]) {
        await aktorOl(db, aktor);
        for (const kova of ["operation-team-files", "hr-documents", "baska-kova"]) {
          assert.equal((await tek("select count(*)::int n from storage.objects where bucket_id = $1", [kova])).n, 0, `${aktor} → ${kova} okudu`);
          const y = await dene(db, "insert into storage.objects (bucket_id, name) values ($1, $2) returning id", [kova, islemCekirdegi.faaliyetBelgeYolu(AM, K.sahip, R.faaliyet, "00000000-0000-4000-8000-00000000dd01")]);
          assert.equal(y.ok, false, `${aktor} → ${kova} yazdı`);
        }
      }
    }));

  test("imzalı adresin ön koşulu okuma politikası: yetkisiz üye ve yabancı nesneyi göremez", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      const yol = islemCekirdegi.faaliyetBelgeYolu(AM, K.sahip, R.faaliyet, "00000000-0000-4000-8000-00000000dd02");
      await db.query("insert into storage.objects (bucket_id, name) values ('docentlik-belgeleri', $1)", [yol]);
      for (const [aktor, gorur] of [["sahip", 1], ["gozetim", 1], ["uye", 0], ["yabanci", 0], ["yonetici", 0]]) {
        await aktorOl(db, aktor);
        assert.equal((await tek("select count(*)::int n from storage.objects where bucket_id='docentlik-belgeleri' and name=$1", [yol])).n, gorur, aktor);
      }
    }));
});

describe("gözetim okuması", () => {
  test("kişi özeti için kullanılan işlevler doktora tarihini döndürmüyor", () =>
    islem(db, async () => {
      await aktorOl(db, "gozetim");
      const p = (await db.query("select * from public.docentlik_profil_ozetleri($1)", [AM])).rows;
      assert.ok(p.length > 0);
      for (const satir of p) assert.ok(!("doktora_tarihi" in satir));
      const d = (await db.query("select * from public.docentlik_faaliyet_donemleri($1)", [AM])).rows;
      for (const satir of d) assert.deepEqual(Object.keys(satir).sort(), ["donem", "faaliyet_id", "owner_id"]);
    }));
});

void AM2;
