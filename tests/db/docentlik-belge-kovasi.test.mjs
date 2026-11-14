/*
  DOÇENTLİK BELGE KOVASI (F6 PR3, 20261114201157).

  Depo şeması test düzeneğinde yok; Supabase'teki tabloların ve
  storage.foldername'in en küçük taklidi kuruluyor (is-ekip-dosyalari ile
  aynı), politikalar gerçek RLS ile sınanıyor. Taklitte UPDATE hakkı da
  veriliyor: "taşıma reddedildi" sonucunun sebebi politika olmalı, eksik
  GRANT değil.

  İMZALI URL: Supabase depo API'si imzayı, çağıran nesneyi okuma
  politikasıyla görebiliyorsa üretir. Burada o politika sınanıyor; API'nin
  kendisi (imza süresi, imzalı adresin sahibine verdiği erişim) bu
  düzenekte YOK — canlı ortamda doğrulanması gerekir.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";
import { AM, AM2, K, R, aktorOl, dene, tohumla } from "./docentlik-ortak.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261114201157_docentlik_belge_kovasi.sql"];

const DEPO_TAKLIDI = `
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, unique (bucket_id, name));
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
`;

const KOVA = "docentlik-belgeleri";
const BELGE = `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/belge.pdf`;
const UAK = `${AM}/uak/00000000-0000-4000-8000-00000000d501/tablo.pdf`;

let db;
before(async () => {
  db = await veritabani();
  await db.exec(DEPO_TAKLIDI);
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await tohumla(db);
  await rol(db, "postgres");
  // owner: depo API'si nesneyi yükleyenin kimliğiyle yazıyor; "sahibi günceller" şablonunu sınamak için gerekli.
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ($1, $2, $4), ($1, $3, $5)`, [KOVA, BELGE, UAK, K.sahip, K.yonetici]);
});

const gorur = async (yol) => (await db.query("select count(*)::int n from storage.objects where bucket_id = $1 and name = $2", [KOVA, yol])).rows[0].n === 1;
const yukler = async (yol, kova = KOVA) => (await dene(db, "insert into storage.objects (bucket_id, name) values ($1, $2) returning id", [kova, yol])).ok;
const siler = async (yol) => {
  const s = await dene(db, "delete from storage.objects where bucket_id = $1 and name = $2 returning id", [KOVA, yol]);
  return s.ok && s.rows.length === 1;
};
const tasir = async (yol, yeni) => {
  const s = await dene(db, "update storage.objects set name = $3 where bucket_id = $1 and name = $2 returning id", [KOVA, yol, yeni]);
  return s.ok && s.rows.length === 1;
};

const AKTORLER = ["anon", "sahip", "uye", "gozetim", "yonetici", "kurumSahibi", "yabanci"];

describe("Kova ayarları", () => {
  test("özel kova, yalnızca PDF, 20 MB", async () => {
    await rol(db, "postgres");
    const k = (await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1", [KOVA])).rows[0];
    assert.deepEqual(k, { public: false, file_size_limit: 20971520, allowed_mime_types: ["application/pdf"] });
  });
});

describe("Faaliyet belgesi ve ÜAK PDF'i: aktör × işlem", () => {
  const beklenen = {
    belge: { select: ["sahip", "gozetim", "kurumSahibi"], insert: ["sahip"], update: [], delete: ["sahip"] },
    uak: { select: ["yonetici", "kurumSahibi"], insert: ["yonetici", "kurumSahibi"], update: [], delete: ["yonetici", "kurumSahibi"] },
  };
  const yollar = {
    belge: { mevcut: BELGE, yeni: `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/ikinci.pdf` },
    uak: { mevcut: UAK, yeni: `${AM}/uak/00000000-0000-4000-8000-00000000d502/yeni.pdf` },
  };
  for (const tur of ["belge", "uak"]) {
    test(tur, async (t) => {
      const farklar = [];
      const satirlar = [];
      for (const aktor of AKTORLER) {
        const sonuc = {};
        for (const islemAdi of ["select", "insert", "update", "delete"]) {
          sonuc[islemAdi] = await islem(db, async () => {
            await aktorOl(db, aktor);
            const { mevcut, yeni } = yollar[tur];
            if (islemAdi === "select") return gorur(mevcut);
            if (islemAdi === "insert") return yukler(yeni);
            if (islemAdi === "update") return tasir(mevcut, yeni);
            return siler(mevcut);
          });
          if (sonuc[islemAdi] !== beklenen[tur][islemAdi].includes(aktor)) farklar.push(`${aktor}/${islemAdi}`);
        }
        satirlar.push(`${aktor.padEnd(12)} ${["select", "insert", "update", "delete"].map((i) => (sonuc[i] ? "✓" : "✗")).join(" ")}`);
      }
      t.diagnostic(`${tur} (select insert update delete)\n${satirlar.join("\n")}`);
      assert.deepEqual(farklar, []);
    });
  }

  test("izinler ayrı: tumunu_gor ÜAK'ı, uak_yonet faaliyet belgesini açmaz", () =>
    islem(db, async () => {
      await aktorOl(db, "gozetim");
      assert.equal(await gorur(UAK), false);
      await aktorOl(db, "yonetici");
      assert.equal(await gorur(BELGE), false);
    }));
});

describe("Sahte ve uydurma yollar (sahibin kendisi denese bile)", () => {
  const sahte = {
    "başka kurumun kimliği": `${AM2}/faaliyet/${K.sahip}/${R.faaliyet}/b.pdf`,
    "başka sahip": `${AM}/faaliyet/${K.uye}/${R.faaliyet}/b.pdf`,
    "var olmayan faaliyet": `${AM}/faaliyet/${K.sahip}/00000000-0000-4000-8000-0000000fffff/b.pdf`,
    "başkasının faaliyeti, kendi kimliğiyle": `${AM}/faaliyet/${K.sahip}/${R.faaliyetIptal}/b.pdf`,
    "öteki kurumun faaliyeti": `${AM2}/faaliyet/${K.yabanci}/${R.faaliyetAm2}/b.pdf`,
    "fazladan klasör": `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/alt/b.pdf`,
    "eksik seviye": `${AM}/faaliyet/${K.sahip}/b.pdf`,
    "üst dizin": `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/../b.pdf`,
    "PDF olmayan": `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/b.exe`,
    "çift uzantı": `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/b.pdf.exe`,
    "kurum slug'ı": `akademikmerkez/faaliyet/${K.sahip}/${R.faaliyet}/b.pdf`,
    "baştaki eğik çizgi": `/${AM}/faaliyet/${K.sahip}/${R.faaliyet}/b.pdf`,
    "bilinmeyen tür": `${AM}/gizli/${K.sahip}/${R.faaliyet}/b.pdf`,
    "boşluk ve özel karakter": `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/a b;.pdf`,
  };
  for (const [ad, yol] of Object.entries(sahte)) {
    test(ad, () =>
      islem(db, async () => {
        await aktorOl(db, "sahip");
        assert.equal(await yukler(yol), false, `yüklendi: ${yol}`);
        // Var olsa bile okunmaz (sunucu ya da başka bir yol yazmış olabilir).
        await rol(db, "postgres");
        await db.query("insert into storage.objects (bucket_id, name) values ($1, $2)", [KOVA, yol]);
        for (const aktor of ["sahip", "gozetim", "kurumSahibi"]) {
          await aktorOl(db, aktor);
          assert.equal(await gorur(yol), false, `${aktor} uydurma yolu gördü: ${yol}`);
        }
      }));
  }

  test("ÜAK yolunda uydurma: başka kurum, eksik klasör, PDF olmayan", () =>
    islem(db, async () => {
      await aktorOl(db, "yonetici");
      for (const yol of [`${AM2}/uak/00000000-0000-4000-8000-00000000d503/t.pdf`, `${AM}/uak/t.pdf`, `${AM}/uak/00000000-0000-4000-8000-00000000d503/t.docx`, `${AM}/uak/klasor/t.pdf`]) {
        assert.equal(await yukler(yol), false, yol);
      }
    }));
});

describe("Kapı, üyelik ve öteki kovalar", () => {
  test("modül kapalıysa sahibi kendi belgesini göremez, yükleyemez; Kurum Sahibi de", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = 'docentlik'", [AM]);
      for (const aktor of ["sahip", "kurumSahibi", "gozetim"]) {
        await aktorOl(db, aktor);
        assert.equal(await gorur(BELGE), false, aktor);
      }
      await aktorOl(db, "sahip");
      assert.equal(await yukler(`${AM}/faaliyet/${K.sahip}/${R.faaliyet}/b2.pdf`), false);
    }));

  test("iptal edilmiş üye kendi faaliyetine belge yükleyemez", () =>
    islem(db, async () => {
      await rol(db, "authenticated", K.iptal);
      assert.equal(await yukler(`${AM}/faaliyet/${K.iptal}/${R.faaliyetIptal}/b.pdf`), false);
    }));

  test("bu kova için yazılmış gevşek bir politika ne modül kapısını ne nesne iznini aşar", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.exec(`create policy sahte_kova on storage.objects for select to authenticated using (bucket_id = '${KOVA}')`);
      // Modül açıkken bile yetkisiz üye göremiyor: kısıtlayıcı kapı nesne iznini de taşıyor.
      await aktorOl(db, "uye");
      assert.equal(await gorur(BELGE), false, "gevşek politika yetkisiz üyeye belgeyi açtı");
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = 'docentlik'", [AM]);
      await aktorOl(db, "sahip");
      assert.equal(await gorur(BELGE), false, "gevşek politika modül kapısını atlattı");
    }));

  test("kısıtlayıcı kapı öteki kovalara dokunmuyor (mevcut modüllerde gerileme yok)", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.exec(`create policy baska_kova_yaz on storage.objects for insert to authenticated with check (bucket_id = 'baska-kova')`);
      await db.exec(`create policy baska_kova_oku on storage.objects for select to authenticated using (bucket_id = 'baska-kova')`);
      await db.query("update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = 'docentlik'", [AM]);
      await aktorOl(db, "uye");
      assert.equal(await yukler("herhangi/bir/yol.png", "baska-kova"), true);
      assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id = 'baska-kova'")).rows[0].n, 1);
    }));
});

/*
  GENİŞ POLİTİKALAR (güvenlik incelemesi, 14.11.2026). Bu depoda öteki
  kovaların politikaları kendi kovalarıyla sınırlı; ama canlıda panelden
  eklenmiş ya da ileride yazılacak kova süzgeçsiz bir politikanın
  Doçentlik kovasını açmaması gerekiyor. En kötü durum kuruluyor: her
  işlem için herkese açık izin veren politika, ayrıca Supabase'in
  "kendi nesnesini günceller" şablonu. Bu politikaların gerçekten etkili
  olduğu öteki kovada gösteriliyor; yoksa test bir şey ölçmez.
*/
const GENIS_POLITIKALAR = `
create policy genis_okuma on storage.objects for select to public using (true);
create policy genis_yukleme on storage.objects for insert to public with check (true);
create policy genis_guncelleme on storage.objects for update to public using (true) with check (true);
create policy genis_silme on storage.objects for delete to public using (true);
create policy sahibi_gunceller on storage.objects for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
`;

describe("Geniş politikalar altında Doçentlik kovası kendi kendine yeter", () => {
  const genisKur = async () => {
    await rol(db, "postgres");
    await db.exec(GENIS_POLITIKALAR);
    await db.query("insert into storage.objects (bucket_id, name, owner) values ('baska-kova', 'a/b.png', $1)", [K.sahip]);
  };

  test("geniş politikalar öteki kovada gerçekten etkili (test kör değil) ve davranışları DEĞİŞMEDİ", () =>
    islem(db, async () => {
      await genisKur();
      for (const aktor of ["anon", "uye", "sahip"]) {
        const [gordu, yukledi, tasidi] = await islem2(async () => {
          await aktorOl(db, aktor);
          const n = (await db.query("select count(*)::int n from storage.objects where bucket_id = 'baska-kova'")).rows[0].n;
          const y = await yukler(`${aktor}/c.png`, "baska-kova");
          const t = await dene(db, "update storage.objects set name = $2 where bucket_id = 'baska-kova' and name = $1 returning id", ["a/b.png", `a/${aktor}.png`]);
          return [n, y, t.ok && t.rows.length];
        });
        assert.deepEqual([gordu, yukledi, tasidi], [1, true, 1], `${aktor}: öteki kovada geniş politika çalışmalı`);
      }
    }));

  test("okuma, yükleme ve silme izinleri geniş politikalara rağmen aynı", () =>
    islem(db, async () => {
      await genisKur();
      const beklenen = {
        anon: [false, false, false], sahip: [true, true, true], uye: [false, false, false], gozetim: [true, false, false],
        yonetici: [false, false, false], kurumSahibi: [true, false, false], yabanci: [false, false, false],
      };
      for (const [aktor, [okur, yukle, sil]] of Object.entries(beklenen)) {
        const sonuc = await islem2(async () => {
          await aktorOl(db, aktor);
          return [await gorur(BELGE), await yukler(`${AM}/faaliyet/${K.sahip}/${R.faaliyet}/yeni-${aktor}.pdf`), await siler(BELGE)];
        });
        assert.deepEqual(sonuc, [okur, yukle, sil], aktor);
      }
      // Uydurma yol da geniş yükleme politikasına rağmen reddediliyor.
      await aktorOl(db, "sahip");
      assert.equal(await yukler(`${AM}/faaliyet/${K.uye}/${R.faaliyet}/b.pdf`), false);
      assert.equal(await yukler(`${AM2}/faaliyet/${K.sahip}/${R.faaliyet}/b.pdf`), false);
    }));

  test("taşıma ve yeniden adlandırma: başka ad, klasör, faaliyet, kullanıcı, kurum ve kova — hiçbiri", () =>
    islem(db, async () => {
      await genisKur();
      const hedefler = {
        "başka ad": `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/yeni-ad.pdf`,
        "başka klasör": `${AM}/uak/00000000-0000-4000-8000-00000000d509/belge.pdf`,
        "başka faaliyet": `${AM}/faaliyet/${K.iptal}/${R.faaliyetIptal}/belge.pdf`,
        "başka kullanıcı": `${AM}/faaliyet/${K.uye}/${R.faaliyet}/belge.pdf`,
        "başka kurum": `${AM2}/faaliyet/${K.yabanci}/${R.faaliyetAm2}/belge.pdf`,
      };
      for (const aktor of ["sahip", "gozetim", "yonetici", "kurumSahibi", "uye", "anon"]) {
        await aktorOl(db, aktor);
        for (const [ad, yeni] of Object.entries(hedefler)) {
          assert.equal(await tasir(BELGE, yeni), false, `${aktor}: ${ad}`);
        }
        const kovaDisi = await dene(db, "update storage.objects set bucket_id = 'baska-kova' where bucket_id = $1 and name = $2 returning id", [KOVA, BELGE]);
        assert.equal(kovaDisi.ok && kovaDisi.rows.length === 1, false, `${aktor}: kovadan dışarı taşıdı`);
        const meta = await dene(db, "update storage.objects set metadata = '{\"x\":1}'::jsonb, owner = $3 where bucket_id = $1 and name = $2 returning id", [KOVA, BELGE, K.uye]);
        assert.equal(meta.ok && meta.rows.length === 1, false, `${aktor}: nesneyi yerinde değiştirdi`);
      }
      // Öteki kovadaki bir nesne bu kovaya taşınamaz (yasal görünen bir yola bile).
      await aktorOl(db, "sahip");
      const iceri = await dene(db, "update storage.objects set bucket_id = $1, name = $2 where bucket_id = 'baska-kova' and name = 'a/b.png' returning id",
        [KOVA, `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/tasinan.pdf`]);
      assert.equal(iceri.ok && iceri.rows.length === 1, false, "öteki kovadan Doçentlik kovasına taşındı");
      await rol(db, "postgres");
      assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id = $1 and name = $2", [KOVA, BELGE])).rows[0].n, 1, "nesne yerinde kalmalı");
    }));

  test("upsert/üzerine yazma: ON CONFLICT DO UPDATE reddedilir, yinelenen yükleme çakışır; nesne değişmez", () =>
    islem(db, async () => {
      await genisKur();
      await aktorOl(db, "sahip");
      const upsert = await dene(db,
        "insert into storage.objects (bucket_id, name, metadata) values ($1, $2, '{\"surum\":2}'::jsonb) on conflict (bucket_id, name) do update set metadata = excluded.metadata returning id",
        [KOVA, BELGE]);
      assert.equal(upsert.ok, false, "sahibi bile üzerine yazdı");
      const tekrar = await dene(db, "insert into storage.objects (bucket_id, name) values ($1, $2)", [KOVA, BELGE]);
      assert.equal(tekrar.ok, false);
      await rol(db, "postgres");
      const { metadata } = (await db.query("select metadata from storage.objects where bucket_id = $1 and name = $2", [KOVA, BELGE])).rows[0];
      assert.equal(metadata, null);
    }));

  test("geniş politika olmadan da (yalnızca bu migration) upsert ve taşıma kapalı", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      assert.equal(await tasir(BELGE, `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/yeni-ad.pdf`), false);
      const upsert = await dene(db,
        "insert into storage.objects (bucket_id, name) values ($1, $2) on conflict (bucket_id, name) do update set metadata = '{}'::jsonb returning id",
        [KOVA, BELGE]);
      assert.equal(upsert.ok, false);
    }));
});

/* İç içe işlem yok; aynı dış işlem içinde bir kayıt noktasına alıp geri sarar. */
async function islem2(isle) {
  await db.exec("savepoint ic_islem");
  try {
    return await isle();
  } finally {
    await rol(db, "postgres");
    await db.exec("rollback to savepoint ic_islem");
  }
}
