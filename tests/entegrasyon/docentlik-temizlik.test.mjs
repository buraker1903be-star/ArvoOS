/*
  SAHİPSİZ BELGE TEMİZLİĞİ — GERÇEK NEXT.JS + GERÇEK STORAGE (F6 PR8). CI'DA DEĞİL.

  Cron rotası (`next start` ile çalışan uygulama) gerçek Supabase Storage
  API'siyle nesneyi siliyor; kira, onay ve deneme gerçek PostgreSQL'de.
  Sınananlar: yalnızca 24 saatten eski + kayıtsız + doçentlik kovası/yolu
  silinir; eşzamanlı iki koşu aynı nesneyi iki kez silmez; Storage kapalıyken
  silme başarısız sayılır ve sonra yeniden denenir; günlüğe/cron kaydına
  yol yazılmaz; istekten parametre okunmaz, yetkisiz istek 401.

  Koşturma: PR7_ANON_KEY=… PR7_SERVICE_KEY=… PR7_CRON_SECRET=… npm run test:entegrasyon
  (uygulama 127.0.0.1:3100'de, ortam.sh + next build/start sonrası)
*/
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { AM, K, R } from "../db/docentlik-ortak.mjs";

const ANON = process.env.PR7_ANON_KEY;
const SERVIS = process.env.PR7_SERVICE_KEY;
const CRON = process.env.PR7_CRON_SECRET;
const UYG = process.env.PR7_UYGULAMA ?? "http://127.0.0.1:3100";
const GECIT = "http://127.0.0.1:54400";
const PG = "postgres://postgres:pr7-yerel@127.0.0.1:55433/postgres";
const KOVA = "docentlik-belgeleri";
const BASKA_KOVA = "pr8-baska-kova";
const GUNLUK = process.env.PR7_NEXT_GUNLUK;
if (!ANON || !SERVIS || !CRON) throw new Error("PR7_ANON_KEY, PR7_SERVICE_KEY, PR7_CRON_SECRET gerekli (yerel sentetik).");

const psql = (sql) => execFileSync("psql", [PG, "-tAqc", sql], { encoding: "utf8" }).trim();
const admin = createClient(GECIT, SERVIS, { auth: { persistSession: false } });
const PDF = () => new Blob([`%PDF-1.4\n%temizlik ${crypto.randomUUID()}\n`], { type: "application/pdf" });
const yeniYol = () => `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/${crypto.randomUUID()}.pdf`;
const yaslandir = (adlar) => psql(`update storage.objects set created_at = now() - interval '2 days' where name in (${adlar.map((a) => `'${a}'`).join(",")})`);
const var_ = (kova, ad) => psql(`select count(*) from storage.objects where bucket_id='${kova}' and name='${ad}'`) === "1";
/* Next boştaki keep-alive soketini ~5 sn'de kapatıyor; docker stop/start (~10 sn) sonrası
   fetch bayat soketi yeniden kullanıp "fetch failed" verebiliyor. Bağlantı her istekte kapanır,
   ağ düzeyinde düşerse bir kez yeniden denenir (rota idempotent: kira ikinci koşuyu boşa düşürür). */
async function kos(bearer = CRON, sorgu = "") {
  const istek = () => fetch(`${UYG}/api/cron/docentlik-belge-temizligi${sorgu}`, { headers: { authorization: `Bearer ${bearer}`, connection: "close" } });
  try { return await istek(); } catch { await new Promise((z) => setTimeout(z, 500)); return istek(); }
}
const sahip = createClient(GECIT, ANON, { auth: { persistSession: false } });
await sahip.auth.signInWithPassword({ email: "sahip@am.test", password: "pr7-Sentetik-1" });
const yukle = async (ad) => { const r = await sahip.storage.from(KOVA).upload(ad, PDF(), { contentType: "application/pdf" }); if (r.error) throw new Error(r.error.message); return ad; };

const tumYollar = [];
after(async () => {
  psql("delete from private.docentlik_belge_temizligi");
  psql(`update public.docentlik_faaliyetleri set belge_yolu = null where id = '${R.faaliyet}'`);
  for (const ad of tumYollar) await admin.storage.from(KOVA).remove([ad]).catch(() => {});
  await admin.storage.from(BASKA_KOVA).remove(["eski.pdf"]).catch(() => {});
});

describe("temizlik rotası (gerçek Next.js + Storage)", () => {
  test("yetkisiz istek 401; sorgu değişkeni (eşik) yok sayılır", async () => {
    assert.equal((await kos("yanlis")).status, 401);
    assert.equal((await fetch(`${UYG}/api/cron/docentlik-belge-temizligi`)).status, 401);
  });

  test("eşzamanlı iki koşu: yalnızca eski + kayıtsız + bu kovadaki nesneler, her biri bir kez silinir", async () => {
    psql("delete from private.docentlik_belge_temizligi");
    const sahipsiz = [await yukle(yeniYol()), await yukle(yeniYol()), await yukle(yeniYol())];
    const yeni = await yukle(yeniYol());
    const bagli = await yukle(yeniYol());
    tumYollar.push(...sahipsiz, yeni, bagli);
    const eski = psql(`select coalesce(belge_yolu,'') from public.docentlik_faaliyetleri where id='${R.faaliyet}'`) || null;
    const b = await admin.rpc("docentlik_belge_bagla", { p_kullanici: K.sahip, p_org: AM, p_faaliyet: R.faaliyet, p_yol: bagli, p_eski: eski });
    if (b.error) throw new Error(b.error.message);
    await admin.storage.createBucket(BASKA_KOVA, { public: false }).catch(() => {});
    await admin.storage.from(BASKA_KOVA).upload("eski.pdf", PDF(), { contentType: "application/pdf", upsert: true });
    yaslandir([...sahipsiz, bagli]);
    psql(`update storage.objects set created_at = now() - interval '2 days' where bucket_id='${BASKA_KOVA}'`);

    const [r1, r2] = await Promise.all([kos(undefined, "?esik=0&sinir=100000"), kos()]);
    assert.equal(r1.status, 200); assert.equal(r2.status, 200);
    const [j1, j2] = [await r1.json(), await r2.json()];
    assert.equal(j1.silinen + j2.silinen, 3, JSON.stringify([j1, j2]));
    assert.equal(j1.basarisiz + j2.basarisiz, 0);
    for (const ad of sahipsiz) {
      assert.equal(var_(KOVA, ad), false, "sahipsiz nesne kaldı");
      assert.ok((await admin.storage.from(KOVA).download(ad)).error, "dosya hâlâ indirilebiliyor");
    }
    assert.ok(var_(KOVA, yeni), "24 saatten yeni nesne silindi");
    assert.ok(var_(KOVA, bagli), "kayda bağlı nesne silindi");
    assert.ok(var_(BASKA_KOVA, "eski.pdf"), "başka kovadaki nesne silindi");
    // Satırlar silinmiyor, kapanıyor (24 saatlik ad kilidi, 20261115154855).
    assert.equal(psql("select count(*) from private.docentlik_belge_temizligi where kapandi_at is null"), "0");
    // Cron kaydı: sayılar var, yol yok.
    const kayit = psql(`select ayrinti::text from public.platform_cron_kayitlari where is_adi='/api/cron/docentlik-belge-temizligi' order by basladi_at desc limit 1`);
    assert.match(kayit, /"silinen"/);
    assert.ok(!kayit.includes(AM) && !kayit.includes(".pdf"), `cron kaydında yol: ${kayit}`);
  });

  test("Storage kapalıyken silme başarısız sayılır (yol günlüğe yazılmaz); açılınca geri çekilme sonrası yeniden denenir", async () => {
    psql("delete from private.docentlik_belge_temizligi");
    const ad = await yukle(yeniYol());
    tumYollar.push(ad);
    yaslandir([ad]);
    execFileSync("docker", ["stop", "pr7storage"]);
    let j;
    try {
      const r = await kos();
      j = await r.json();
    } finally {
      execFileSync("docker", ["start", "pr7storage"]);
      for (let i = 0; i < 60; i++) {
        try { if ((await fetch("http://127.0.0.1:55000/status")).ok) break; } catch {}
        await new Promise((z) => setTimeout(z, 1000));
      }
    }
    assert.equal(j.basarisiz, 1, JSON.stringify(j));
    assert.equal(j.bekleyen_hatali, 1);
    const satir = psql(`select deneme || '|' || (kira is null) || '|' || (kira_bitis > now()) || '|' || coalesce(son_hata,'') from private.docentlik_belge_temizligi`);
    const [deneme, kiraBos, ertelendi, hata] = satir.split("|");
    assert.deepEqual([deneme, kiraBos, ertelendi], ["1", "true", "true"], satir);
    assert.ok(!hata.includes(AM) && !hata.includes(".pdf"), `deneme kaydında yol: ${hata}`);
    assert.ok(var_(KOVA, ad), "nesne silinmemeli (Storage kapalıydı)");
    // Geri çekilme süresinde tekrar alınmaz.
    assert.equal((await (await kos()).json()).aday, 0);
    psql("update private.docentlik_belge_temizligi set kira_bitis = now() - interval '1 second'");
    const j2 = await (await kos()).json();
    assert.equal(j2.silinen, 1, JSON.stringify(j2));
    assert.equal(var_(KOVA, ad), false);
    assert.equal(psql("select count(*) from private.docentlik_belge_temizligi where kapandi_at is null"), "0");
  });

  test("sunucu günlüğünde sahipsiz nesne yolu yok", { skip: !GUNLUK }, () => {
    const gunluk = fs.readFileSync(GUNLUK, "utf8");
    for (const ad of tumYollar) assert.ok(!gunluk.includes(ad), "günlükte yol");
    assert.ok(!gunluk.includes(`${AM}/faaliyet/`), "günlükte doçentlik yolu");
  });
});
