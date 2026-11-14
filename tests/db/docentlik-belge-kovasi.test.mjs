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
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
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
  await db.query(`insert into storage.objects (bucket_id, name) values ($1, $2), ($1, $3)`, [KOVA, BELGE, UAK]);
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

  test("bu kova için yazılmış gevşek bir politika modül kapısını aşamaz", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.exec(`create policy sahte_kova on storage.objects for select to authenticated using (bucket_id = '${KOVA}')`);
      await aktorOl(db, "uye");
      assert.equal(await gorur(BELGE), true, "sahte politika etkisiz — test bir şey ölçmüyor");
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = 'docentlik'", [AM]);
      await aktorOl(db, "uye");
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
