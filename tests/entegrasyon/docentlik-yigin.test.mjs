/*
  DOÇENTLİK — GERÇEK YIĞIN ENTEGRASYON TESTİ (F6 PR7). CI'DA DEĞİL.

  PGlite testlerinden (tests/db) farkı: burada taklit yok. İstemci
  @supabase/supabase-js; arkasında GERÇEK PostgREST 12.2.3 (satır tavanı
  1000 ve 300 iki ayrı örnek), GERÇEK GoTrue 2.197 (parolayla giriş, JWT),
  GERÇEK Supabase Storage API 1.19.3 (dosya arka ucu) ve PostgreSQL 17.
  Kurulum: scripts/docentlik-entegrasyon/ortam.sh. Yalnızca 127.0.0.1 ve
  yalnızca sentetik veri (tohum.mjs).

  Koşturma: PR7_ANON_KEY=… PR7_SERVICE_KEY=… npm run test:entegrasyon
*/
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { AM, AM2, K, R } from "../db/docentlik-ortak.mjs";

await import("../register.mjs");
const { hepsiniOku } = await import("../../lib/docentlik-sayfalama.ts");
const islem = await import("../../lib/docentlik-islem.ts");

const ANON = process.env.PR7_ANON_KEY;
const SERVIS = process.env.PR7_SERVICE_KEY;
const GECIT = { 1000: "http://127.0.0.1:54400", 300: "http://127.0.0.1:54401" };
const PG = "postgres://postgres:pr7-yerel@127.0.0.1:55433/postgres";
const PAROLA = "pr7-Sentetik-1";
const EPOSTA = {
  sahip: "sahip@am.test", uye: "uye@am.test", gozetim: "gozetim@am.test", yonetici: "yonetici@am.test",
  kurumSahibi: "kurum@am.test", yabanci: "sahip@am2.test", iptal: "iptal@am.test", gozetimKapali: "gozkapali@am.test",
};
const KOVA = "docentlik-belgeleri";
if (!ANON || !SERVIS) throw new Error("PR7_ANON_KEY ve PR7_SERVICE_KEY gerekli (yerel sentetik anahtarlar).");

const psql = (sql) => execFileSync("psql", [PG, "-tAqc", sql], { encoding: "utf8" }).trim();
const istemciler = new Map();
async function oturum(aktor, tavan = 1000) {
  const anahtar = `${aktor}:${tavan}`;
  if (istemciler.has(anahtar)) return istemciler.get(anahtar);
  const c = createClient(GECIT[tavan], ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: EPOSTA[aktor], password: PAROLA });
  if (error) throw new Error(`${aktor} giriş: ${error.message}`);
  istemciler.set(anahtar, c);
  return c;
}
const hataVarsa = (e) => { if (e) throw new Error(e.message); };
const PDF = (ek = "") => new Blob([`%PDF-1.4\n%sentetik ${ek}\n%%EOF\n`], { type: "application/pdf" });
const KRITER = { points_per_unit: 20, baslica_yazar_katsayisi: 0.8, diger_yazar_katsayisi: 0.5, esit_bolusum: false };

/* Sunucu işleminin (faaliyetEkle) yaptığının aynısı: çekirdekten beklenen + RPC. */
async function ekle(c, girdi = {}, istekAnahtari = null, bozuk = null) {
  const f = islem.faaliyetFormu({ kriterId: R.kriter, baslik: "Entegrasyon makalesi", birimSayisi: "1", yazarSayisi: "2", baslicaYazar: "evet", ...girdi });
  assert.ok(f.ok, f.hata);
  const y = f.deger.yazim;
  const b = { ...islem.beklenenEklemePuani(y, KRITER), ...(bozuk ?? {}) };
  return c.rpc("docentlik_faaliyet_ekle", {
    p_org: AM, p_kriter: y.criteria_id, p_baslik: y.title, p_birim: y.unit_count, p_yazar_sayisi: y.yazar_sayisi,
    p_baslica: y.baslica_yazar, p_tarih: y.faaliyet_tarihi, p_notlar: y.notes, p_istek_anahtari: istekAnahtari,
    p_beklenen_puan: b.puan, p_beklenen_katsayi: b.katsayi, p_beklenen_surum: b.surum,
  });
}

const temizlenecek = { faaliyet: [], nesne: [] };
after(async () => {
  if (temizlenecek.faaliyet.length) psql(`delete from public.docentlik_faaliyetleri where id in (${temizlenecek.faaliyet.map((i) => `'${i}'`).join(",")})`);
  for (const c of istemciler.values()) await c.auth.signOut().catch(() => {});
});

describe("1. Eksiksiz sayfalama gerçek PostgREST'te (tavan 1000 ve 300)", () => {
  for (const tavan of [1000, 300]) {
    test(`tavan ${tavan}: tek çağrı kesiliyor, hepsiniOku 1500 dönem ve 1101 profil getiriyor`, async () => {
      const c = await oturum("gozetim", tavan);
      const tek = await c.rpc("docentlik_faaliyet_donemleri", { p_org: AM }).eq("owner_id", K.sahip);
      hataVarsa(tek.error);
      assert.equal(tek.data.length, tavan, "PostgREST tek çağrıyı tavanda kesmeli (eski kisiOzeti hatası)");
      const donem = await hepsiniOku((bas, son) => c.rpc("docentlik_faaliyet_donemleri", { p_org: AM }, { count: "exact" })
        .eq("owner_id", K.sahip).order("faaliyet_id").range(bas, son), { ad: "Dönemler", anahtar: (d) => d.faaliyet_id, hataVarsa });
      assert.equal(donem.length, 1500);
      assert.ok(donem.every((d) => d.donem === "sonra"), "bilinmiyor dönemi kalmamalı");
      const profil = await hepsiniOku((bas, son) => c.rpc("docentlik_profil_ozetleri", { p_org: AM }, { count: "exact" })
        .order("owner_id").range(bas, son), { ad: "Profil", anahtar: (p) => p.owner_id, hataVarsa });
      assert.equal(profil.length, 1101);
      assert.deepEqual(Object.keys(profil[0]).sort(), ["alt_alan", "doktora_tarihi_girildi", "owner_id", "temel_alan"], "doktora tarihi dönmemeli");
    });
  }

  test("kişinin kendi faaliyetleri (veri.ts → butunFaaliyetler) tavan 300'de de 1500 ve toplam 30000", async () => {
    const c = await oturum("sahip", 300);
    const f = await hepsiniOku((bas, son) => c.from("docentlik_faaliyetleri").select("id, computed_points", { count: "exact" })
      .eq("organization_id", AM).eq("owner_id", K.sahip).order("id").range(bas, son), { ad: "F", anahtar: (x) => x.id, hataVarsa });
    assert.equal(f.length, 1500);
    assert.equal(f.reduce((t, x) => t + Number(x.computed_points), 0), 30000);
  });

  test("aralık dışı istek PostgREST'te hata (416/PGRST103): yardımcı onu sessizce boş saymıyor", async () => {
    const c = await oturum("sahip");
    const r = await c.from("docentlik_faaliyetleri").select("id", { count: "exact" }).eq("owner_id", K.sahip).order("id").range(5000, 5999);
    assert.ok(r.error, "aralık dışı istek hata vermeli");
    assert.equal(r.status, 416);
  });
});

describe("2. Puan çekirdeği ↔ veritabanı tetikleyicisi", () => {
  test("çekirdeğin beklediği değerle ekleme: kayıt çekirdekle birebir", async () => {
    const c = await oturum("sahip");
    const { data, error } = await ekle(c, { yazarSayisi: "3", baslicaYazar: "hayir", birimSayisi: "2" });
    hataVarsa(error);
    temizlenecek.faaliyet.push(data[0].kayit_id);
    const satir = (await c.from("docentlik_faaliyetleri").select("computed_points, paylasim_katsayisi, kural_surumu").eq("id", data[0].kayit_id).single()).data;
    const f = islem.faaliyetFormu({ kriterId: R.kriter, baslik: "x", birimSayisi: "2", yazarSayisi: "3", baslicaYazar: "hayir" });
    const b = islem.beklenenEklemePuani(f.deger.yazim, KRITER);
    assert.equal(Number(satir.computed_points), b.puan);
    assert.equal(Number(satir.paylasim_katsayisi), b.katsayi);
    assert.equal(satir.kural_surumu, b.surum);
  });

  test("DP001: beklenen puan tutmazsa PostgREST hata kodu DP001 ve satır yok", async () => {
    const c = await oturum("sahip");
    const once = psql(`select count(*) from public.docentlik_faaliyetleri where owner_id='${K.sahip}'`);
    const { error } = await ekle(c, {}, null, { puan: 999 });
    assert.equal(error?.code, "DP001");
    assert.match(islem.faaliyetYazimHatasi(error, "kaydedilmedi"), /puan/i);
    assert.equal(psql(`select count(*) from public.docentlik_faaliyetleri where owner_id='${K.sahip}'`), once);
  });

  test("DP002: aynı istek anahtarı başka içerikle → DP002; aynı içerikle → tekrar (tek satır)", async () => {
    const c = await oturum("sahip");
    const anahtar = crypto.randomUUID();
    const ilk = await ekle(c, { baslik: "Tekrar sınaması" }, anahtar);
    hataVarsa(ilk.error);
    temizlenecek.faaliyet.push(ilk.data[0].kayit_id);
    const tekrar = await ekle(c, { baslik: "Tekrar sınaması" }, anahtar);
    hataVarsa(tekrar.error);
    assert.equal(tekrar.data[0].kayit_id, ilk.data[0].kayit_id);
    assert.equal(tekrar.data[0].tekrar, true);
    const baska = await ekle(c, { baslik: "Başka içerik" }, anahtar);
    assert.equal(baska.error?.code, "DP002");
    assert.equal(psql(`select count(*) from public.docentlik_faaliyetleri where istek_anahtari='${anahtar}'`), "1");
  });

  test("aynı isteğin EŞZAMANLI iki gönderimi (iki bağlantı): tek satır", async () => {
    const c1 = await oturum("sahip"), c2 = await oturum("sahip", 300);
    const anahtar = crypto.randomUUID();
    const [a, b] = await Promise.all([ekle(c1, { baslik: "Yarış" }, anahtar), ekle(c2, { baslik: "Yarış" }, anahtar)]);
    const sonuclar = [a, b].filter((x) => !x.error);
    assert.ok(sonuclar.length >= 1, JSON.stringify([a.error, b.error]));
    for (const x of sonuclar) temizlenecek.faaliyet.push(x.data[0].kayit_id);
    assert.equal(psql(`select count(*) from public.docentlik_faaliyetleri where istek_anahtari='${anahtar}'`), "1");
  });

  test("iki oturumlu eşzamanlı düzenleme: aynı sürümü okuyan ikisinden yalnızca biri yazar", async () => {
    const c1 = await oturum("sahip"), c2 = await oturum("sahip", 300);
    const ilk = await ekle(c1, { baslik: "Düzenleme yarışı" });
    hataVarsa(ilk.error);
    const id = ilk.data[0].kayit_id;
    temizlenecek.faaliyet.push(id);
    const surum = (await c1.from("docentlik_faaliyetleri").select("updated_at").eq("id", id).single()).data.updated_at;
    const duzenle = (c, baslik) => {
      const f = islem.faaliyetFormu({ kriterId: R.kriter, baslik, birimSayisi: "1", yazarSayisi: "2", baslicaYazar: "evet" }).deger.yazim;
      const b = islem.beklenenEklemePuani(f, KRITER);
      return c.rpc("docentlik_faaliyet_duzenle", { p_id: id, p_org: AM, p_surum: surum, p_kriter: f.criteria_id, p_baslik: f.title,
        p_birim: f.unit_count, p_yazar_sayisi: f.yazar_sayisi, p_baslica: f.baslica_yazar, p_tarih: f.faaliyet_tarihi, p_notlar: f.notes,
        p_beklenen_puan: b.puan, p_beklenen_katsayi: b.katsayi, p_beklenen_surum: b.surum });
    };
    const [a, b] = await Promise.all([duzenle(c1, "Birinci sekme"), duzenle(c2, "İkinci sekme")]);
    hataVarsa(a.error); hataVarsa(b.error);
    const yazan = [a.data[0].guncellendi, b.data[0].guncellendi].filter(Boolean).length;
    assert.equal(yazan, 1, "yalnızca bir düzenleme yazmalı");
    const baslik = psql(`select title from public.docentlik_faaliyetleri where id='${id}'`);
    assert.ok(["Birinci sekme", "İkinci sekme"].includes(baslik));
  });
});

describe("3. Doğrudan tablo yazımı (RPC doğrulamasını atlama denemesi)", () => {
  test("istemci computed_points'i kendisi yazamaz: tetikleyici puanı yeniden hesaplar ya da yazım reddedilir", async () => {
    const c = await oturum("sahip");
    const ins = await c.from("docentlik_faaliyetleri").insert({ organization_id: AM, owner_id: K.sahip, criteria_id: R.kriter, title: "Doğrudan",
      unit_count: 1, yazar_sayisi: 1, baslica_yazar: true, computed_points: 99999, paylasim_katsayisi: 1, kural_surumu: "sahte" }).select("id, computed_points, kural_surumu");
    if (!ins.error) {
      temizlenecek.faaliyet.push(ins.data[0].id);
      assert.equal(Number(ins.data[0].computed_points), 20, "tetikleyici puanı yeniden hesaplamalı");
      assert.notEqual(ins.data[0].kural_surumu, "sahte");
    }
    const up = await c.from("docentlik_faaliyetleri").update({ computed_points: 99999 }).eq("id", R.faaliyet).select("computed_points");
    const puan = psql(`select computed_points from public.docentlik_faaliyetleri where id='${R.faaliyet}'`);
    assert.ok(Number(puan) !== 99999, `puan istemciden değişti (${puan}); yanıt: ${JSON.stringify(up.error ?? up.data)}`);
  });

  /*
    Tabloya yetki sütun düzeyinde: puan sütunları istemciye kapalı, hesap
    girdileri açık. RPC'yi atlayan bir yazım çekirdekle karşılaştırmayı
    (DP001) atlar ama puanı BOZAMAZ: tetikleyici girdilerden yeniden hesaplar.
  */
  test("RPC'siz doğrudan ekleme/girdi güncellemesi: puan tetikleyiciden, çekirdekle aynı", async () => {
    const c = await oturum("sahip");
    const ins = await c.from("docentlik_faaliyetleri").insert({ organization_id: AM, owner_id: K.sahip, criteria_id: R.kriter, title: "Doğrudan ekleme",
      unit_count: 3, yazar_sayisi: 2, baslica_yazar: false }).select("id, computed_points");
    hataVarsa(ins.error);
    const id = ins.data[0].id;
    temizlenecek.faaliyet.push(id);
    const beklenen = (birim) => islem.beklenenEklemePuani(islem.faaliyetFormu({ kriterId: R.kriter, baslik: "x", birimSayisi: String(birim), yazarSayisi: "2", baslicaYazar: "hayir" }).deger.yazim, KRITER).puan;
    assert.equal(Number(ins.data[0].computed_points), beklenen(3));
    const up = await c.from("docentlik_faaliyetleri").update({ unit_count: 5 }).eq("id", id).select("computed_points");
    hataVarsa(up.error);
    assert.equal(Number(up.data[0].computed_points), beklenen(5));
  });

  test("belge_yolu doğrudan başka kişinin/kurumun yoluna yazılamaz (veritabanı kısıtı)", async () => {
    const c = await oturum("sahip");
    const r = await c.from("docentlik_faaliyetleri").update({ belge_yolu: `${AM}/faaliyet/${K.uye}/${R.faaliyet}/x.pdf` }).eq("id", R.faaliyet);
    assert.ok(r.error, "başkasının yolu yazıldı");
    assert.equal(psql(`select coalesce(belge_yolu,'') from public.docentlik_faaliyetleri where id='${R.faaliyet}'`), "");
  });

  test("başkasının adına (owner_id) ve başka kuruma doğrudan ekleme reddedilir", async () => {
    const c = await oturum("sahip");
    const r1 = await c.from("docentlik_faaliyetleri").insert({ organization_id: AM, owner_id: K.uye, criteria_id: R.kriter, title: "Sahte sahip", unit_count: 1, yazar_sayisi: 1, baslica_yazar: true });
    assert.ok(r1.error, "başkası adına ekleme kabul edildi");
    const r2 = await c.from("docentlik_faaliyetleri").insert({ organization_id: AM2, owner_id: K.sahip, criteria_id: R.kriterAm2, title: "Öteki kurum", unit_count: 1, yazar_sayisi: 1, baslica_yazar: true });
    assert.ok(r2.error, "başka kuruma ekleme kabul edildi");
  });
});

describe("4. Kurum yalıtımı ve yetki (gerçek RLS + JWT)", () => {
  test("yabancı kurum AM'nin faaliyet, profil, dönem ve kriterini görmez", async () => {
    const c = await oturum("yabanci");
    assert.equal((await c.from("docentlik_faaliyetleri").select("id").eq("organization_id", AM).limit(5)).data.length, 0);
    assert.equal((await c.rpc("docentlik_faaliyet_donemleri", { p_org: AM }).limit(5)).data.length, 0);
    assert.equal((await c.rpc("docentlik_profil_ozetleri", { p_org: AM }).limit(5)).data.length, 0);
    assert.equal((await c.from("docentlik_kriterleri").select("id").eq("organization_id", AM)).data.length, 0);
  });

  test("yetkisiz üye başkasının faaliyetini görmez; gözetim görür; kişi kuralıyla kapatılmış gözetim görmez", async () => {
    assert.equal((await (await oturum("uye")).from("docentlik_faaliyetleri").select("id").eq("owner_id", K.sahip).limit(3)).data.length, 0);
    assert.equal((await (await oturum("gozetim")).from("docentlik_faaliyetleri").select("id").eq("owner_id", K.sahip).limit(3)).data.length, 3);
    assert.equal((await (await oturum("gozetimKapali")).from("docentlik_faaliyetleri").select("id").eq("owner_id", K.sahip).limit(3)).data.length, 0);
  });

  test("gözetim profil TABLOSUNU (doktora tarihi) okuyamaz", async () => {
    const c = await oturum("gozetim");
    const r = await c.from("docentlik_profilleri").select("doktora_tarihi").eq("owner_id", K.sahip);
    assert.equal((r.data ?? []).length, 0);
  });

  test("üyeliği iptal edilen kişi kendi eski faaliyetini de göremez ve ekleyemez", async () => {
    const c = await oturum("iptal");
    assert.equal((await c.from("docentlik_faaliyetleri").select("id").limit(5)).data.length, 0);
    const { error, data } = await ekle(c);
    assert.ok(error || !data?.length, "iptal edilmiş üye ekleyebildi");
  });

  test("anon hiçbir doçentlik verisini okuyamaz", async () => {
    const c = createClient(GECIT[1000], ANON, { auth: { persistSession: false } });
    const r = await c.from("docentlik_faaliyetleri").select("id").limit(1);
    assert.equal((r.data ?? []).length, 0);
    const rpc = await c.rpc("docentlik_profil_ozetleri", { p_org: AM });
    assert.ok(rpc.error, "anon RPC çalıştırabildi");
  });
});

describe("5. Gerçek Storage API: kova politikası, imzalı adres", () => {
  const yol = (sahip, faaliyet) => `${AM}/faaliyet/${sahip}/${faaliyet}/${crypto.randomUUID()}.pdf`;
  let belge;
  before(async () => { belge = yol(K.sahip, R.faaliyet); });

  test("sahip kendi faaliyetinin yoluna PDF yükler; aynı yola üzerine yazma (upsert) reddedilir", async () => {
    const c = await oturum("sahip");
    const r = await c.storage.from(KOVA).upload(belge, PDF("1"), { contentType: "application/pdf", upsert: false });
    hataVarsa(r.error);
    const tekrar = await c.storage.from(KOVA).upload(belge, PDF("2"), { contentType: "application/pdf", upsert: true });
    assert.ok(tekrar.error, "üzerine yazma kabul edildi");
    const bilgi = await c.storage.from(KOVA).info(belge);
    hataVarsa(bilgi.error);
    assert.equal(bilgi.data.contentType ?? bilgi.data.metadata?.mimetype, "application/pdf");
  });

  test("başkasının ve başka kurumun yoluna, var olmayan faaliyete, PDF olmayana yükleme reddedilir", async () => {
    const c = await oturum("sahip");
    const denemeler = [
      [yol(K.uye, R.faaliyet), PDF(), "application/pdf"],
      [`${AM2}/faaliyet/${K.sahip}/${R.faaliyetAm2}/x.pdf`, PDF(), "application/pdf"],
      [yol(K.sahip, crypto.randomUUID()), PDF(), "application/pdf"],
      [`${AM}/faaliyet/${K.sahip}/${R.faaliyet}/x.png`, new Blob(["png"], { type: "image/png" }), "image/png"],
      [`${AM}/uak/${crypto.randomUUID()}/x.pdf`, PDF(), "application/pdf"],
    ];
    for (const [y, govde, tur] of denemeler) {
      const r = await c.storage.from(KOVA).upload(y, govde, { contentType: tur, upsert: false });
      assert.ok(r.error, `kabul edildi: ${y}`);
    }
  });

  test("20 MB'ı aşan dosya kova sınırında reddedilir", async () => {
    const c = await oturum("sahip");
    const buyuk = new Blob([new Uint8Array(21 * 1024 * 1024)], { type: "application/pdf" });
    const r = await c.storage.from(KOVA).upload(yol(K.sahip, R.faaliyet), buyuk, { contentType: "application/pdf" });
    assert.ok(r.error, "21 MB kabul edildi");
  });

  test("okuma: sahip ve gözetim imzalı adres alır; üye, yabancı ve kapalı gözetim alamaz", async () => {
    for (const aktor of ["sahip", "gozetim"]) {
      const r = await (await oturum(aktor)).storage.from(KOVA).createSignedUrl(belge, 60);
      hataVarsa(r.error);
      const indir = await fetch(r.data.signedUrl);
      assert.equal(indir.status, 200, aktor);
      assert.match(await indir.text(), /^%PDF-/);
    }
    for (const aktor of ["uye", "yabanci", "gozetimKapali"]) {
      const r = await (await oturum(aktor)).storage.from(KOVA).createSignedUrl(belge, 60);
      assert.ok(r.error, `${aktor} imzalı adres aldı`);
      const d = await (await oturum(aktor)).storage.from(KOVA).download(belge);
      assert.ok(d.error, `${aktor} indirdi`);
    }
  });

  test("imzalı adres 60 sn ömürlü (jetonun exp−iat'i) ve süresi dolunca reddediliyor", async () => {
    const c = await oturum("sahip");
    const r60 = await c.storage.from(KOVA).createSignedUrl(belge, 60);
    const jeton = new URL(r60.data.signedUrl).searchParams.get("token");
    const yuk = JSON.parse(Buffer.from(jeton.split(".")[1], "base64url").toString());
    assert.equal(yuk.exp - yuk.iat, 60);
    const r2 = await c.storage.from(KOVA).createSignedUrl(belge, 2);
    assert.equal((await fetch(r2.data.signedUrl)).status, 200);
    await new Promise((z) => setTimeout(z, 3200));
    assert.notEqual((await fetch(r2.data.signedUrl)).status, 200, "süresi dolmuş adres hâlâ açılıyor");
  });

  test("silme: üye ve gözetim silemez; sahip siler", async () => {
    for (const aktor of ["uye", "gozetim"]) {
      await (await oturum(aktor)).storage.from(KOVA).remove([belge]);
      assert.equal(psql(`select count(*) from storage.objects where bucket_id='${KOVA}' and name='${belge}'`), "1", `${aktor} sildi`);
    }
    const r = await (await oturum("sahip")).storage.from(KOVA).remove([belge]);
    hataVarsa(r.error);
    assert.equal(psql(`select count(*) from storage.objects where bucket_id='${KOVA}' and name='${belge}'`), "0");
  });

  test("ÜAK yolu: yalnızca uak_yonet yükler ve okur; faaliyet sahibi okuyamaz", async () => {
    const uakYol = `${AM}/uak/${crypto.randomUUID()}/tablo.pdf`;
    const y = await oturum("yonetici");
    hataVarsa((await y.storage.from(KOVA).upload(uakYol, PDF("uak"), { contentType: "application/pdf" })).error);
    assert.ok((await (await oturum("sahip")).storage.from(KOVA).createSignedUrl(uakYol, 60)).error);
    hataVarsa((await y.storage.from(KOVA).createSignedUrl(uakYol, 60)).error);
    hataVarsa((await y.storage.from(KOVA).remove([uakYol])).error);
  });
});

describe("5b. Açık riskler: sahipsiz nesne ve RPC dışı belge yolu (ölçüm)", () => {
  /*
    Tarayıcı yükleme ile kayıt arasında kapanırsa nesne kovada kalır. Önerilen
    temizliğin TESPİT adımı (scripts/docentlik-entegrasyon/sahipsiz-nesneler.sql)
    gerçek storage.objects üzerinde: kayıtta adı geçmeyen ve belirli bir süreden
    eski nesneler. Silme burada yapılmaz (öneri: service_role'lü, tekrar denenen iş).
  */
  test("sahipsiz nesne tespit sorgusu yalnızca kayıtsız nesneyi buluyor", async () => {
    const c = await oturum("sahip");
    const sahipsiz = `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/${crypto.randomUUID()}.pdf`;
    hataVarsa((await c.storage.from(KOVA).upload(sahipsiz, PDF("sahipsiz"), { contentType: "application/pdf" })).error);
    const sorgu = (await import("node:fs")).readFileSync(new URL("../../scripts/docentlik-entegrasyon/sahipsiz-nesneler.sql", import.meta.url), "utf8")
      .replace(/:esik/g, "'0 seconds'");
    const bulunan = psql(sorgu.replace(/;\s*$/, "")).split("\n").filter(Boolean);
    assert.ok(bulunan.some((s) => s.includes(sahipsiz)), "sahipsiz nesne bulunmadı");
    const bagli = psql(`select belge_yolu from public.docentlik_faaliyetleri where belge_yolu is not null union select depo_yolu from public.docentlik_uak_tablolari`).split("\n").filter(Boolean);
    assert.ok(!bulunan.some((s) => bagli.some((b) => s.includes(b))), "kayda bağlı nesne sahipsiz sayıldı");
    hataVarsa((await c.storage.from(KOVA).remove([sahipsiz])).error);
  });

  /*
    F6 PR8 — KAPATILDI. PR7'de belge_yolu doğrudan PostgREST ile yazılabiliyordu
    ("%PDF-" denetimi atlanabiliyordu). Artık sütun istemciye kapalı ve bağlama
    işlevleri yalnızca service_role'e açık: kullanıcı oturumuyla HİÇBİR yoldan
    bağlanamıyor. Nesne yine application/pdf olarak sunuluyor.
  */
  test("RPC dışı belge_yolu: doğrudan UPDATE ve bağlama işlevi kullanıcı oturumuyla reddedilir; önceki bağlantı korunur", async () => {
    const c = await oturum("sahip");
    const once = psql(`select coalesce(belge_yolu,'') from public.docentlik_faaliyetleri where id='${R.faaliyet}'`);
    const yol = `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/${crypto.randomUUID()}.pdf`;
    hataVarsa((await c.storage.from(KOVA).upload(yol, new Blob(["<html><script>alert(1)</script></html>"], { type: "application/pdf" }), { contentType: "application/pdf" })).error);
    const r = await c.from("docentlik_faaliyetleri").update({ belge_yolu: yol }).eq("id", R.faaliyet).select("belge_yolu");
    assert.equal(r.error?.code, "42501", `doğrudan yazım reddedilmedi: ${JSON.stringify(r.error ?? r.data)}`);
    const rpc = await c.rpc("docentlik_belge_bagla", { p_kullanici: K.sahip, p_org: AM, p_faaliyet: R.faaliyet, p_yol: yol, p_eski: null });
    assert.ok(rpc.error, "kullanıcı oturumu bağlama işlevini çalıştırabildi");
    assert.match(rpc.error.code ?? "", /42501|PGRST202/);
    const rpcKaldir = await c.rpc("docentlik_belge_kaldir", { p_kullanici: K.sahip, p_org: AM, p_faaliyet: R.faaliyet, p_eski: null });
    assert.ok(rpcKaldir.error, "kullanıcı oturumu kaldırma işlevini çalıştırabildi");
    // Başka kullanıcı adına bağlama da (kimliği parametreyle vermek) aynı kapıda düşer.
    const baskasi = await (await oturum("uye")).rpc("docentlik_belge_bagla", { p_kullanici: K.sahip, p_org: AM, p_faaliyet: R.faaliyet, p_yol: yol, p_eski: null });
    assert.ok(baskasi.error);
    assert.equal(psql(`select coalesce(belge_yolu,'') from public.docentlik_faaliyetleri where id='${R.faaliyet}'`), once, "kayıt değişti");
    const imza = await (await oturum("gozetim")).storage.from(KOVA).createSignedUrl(yol, 60);
    if (!imza.error) assert.equal((await fetch(imza.data.signedUrl)).headers.get("content-type"), "application/pdf");
    await c.storage.from(KOVA).remove([yol]);
  });

  test("service_role bağlama işlevi gerçek Storage nesnesini doğrular: başkasının nesnesi ve PDF olmayan reddedilir", async () => {
    const admin = createClient(GECIT[1000], SERVIS, { auth: { persistSession: false } });
    const c = await oturum("sahip");
    const yol = `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/${crypto.randomUUID()}.pdf`;
    hataVarsa((await c.storage.from(KOVA).upload(yol, PDF("bagla"), { contentType: "application/pdf" })).error);
    const once = psql(`select coalesce(belge_yolu,'') from public.docentlik_faaliyetleri where id='${R.faaliyet}'`) || null;
    // Başka kullanıcı adına bağlama: nesnenin sahibi sahip, iddia edilen kullanıcı üye → yol üyeye ait değil.
    const yanlis = await admin.rpc("docentlik_belge_bagla", { p_kullanici: K.uye, p_org: AM, p_faaliyet: R.faaliyet, p_yol: yol, p_eski: once });
    assert.equal(yanlis.error?.code, "DB403");
    // Başka kurum.
    const kurum = await admin.rpc("docentlik_belge_bagla", { p_kullanici: K.sahip, p_org: AM2, p_faaliyet: R.faaliyet, p_yol: yol, p_eski: once });
    assert.equal(kurum.error?.code, "DB403");
    // Meşru bağlama gerçek storage.objects kaydıyla geçer; eski yol iyimser kilitle.
    const ok = await admin.rpc("docentlik_belge_bagla", { p_kullanici: K.sahip, p_org: AM, p_faaliyet: R.faaliyet, p_yol: yol, p_eski: once });
    hataVarsa(ok.error);
    assert.equal(psql(`select belge_yolu from public.docentlik_faaliyetleri where id='${R.faaliyet}'`), yol);
    const ikinci = await admin.rpc("docentlik_belge_bagla", { p_kullanici: K.sahip, p_org: AM, p_faaliyet: R.faaliyet, p_yol: yol, p_eski: null });
    assert.equal(ikinci.error?.code, "DB409", "eski yol beklenmeden yazıldı");
    hataVarsa((await admin.rpc("docentlik_belge_kaldir", { p_kullanici: K.sahip, p_org: AM, p_faaliyet: R.faaliyet, p_eski: yol })).error);
    await c.storage.from(KOVA).remove([yol]);
  });
});

describe("5c. Gözetim adları ve sayfalı liste (gerçek PostgREST)", () => {
  test("gözetim: 1100+ kişi 50'lik sayfalarla eksiksiz, tekrar yok, toplam özetle aynı; adlar dar işlevden", async () => {
    const c = await oturum("gozetim", 300);
    const ozet = (await c.rpc("docentlik_gozetim_ozeti", { p_org: AM })).data[0];
    const toplam = Number(ozet.kisi_sayisi);
    assert.ok(toplam >= 1101, String(toplam));
    const gorulen = new Set();
    for (let atla = 0; atla < toplam; atla += 50) {
      const { data, error } = await c.rpc("docentlik_gozetim_listesi", { p_org: AM, p_sinir: 50, p_atla: atla });
      hataVarsa(error);
      assert.equal(data.length, Math.min(50, toplam - atla));
      for (const s of data) { assert.ok(!gorulen.has(s.kisi)); gorulen.add(s.kisi); assert.ok(!("doktora_tarihi" in s)); }
    }
    assert.equal(gorulen.size, toplam);
    const ilk = (await c.rpc("docentlik_gozetim_listesi", { p_org: AM, p_sinir: 50, p_atla: 0 })).data.map((s) => s.kisi);
    const adlar = await c.rpc("docentlik_kisi_adlari", { p_org: AM, p_kisiler: ilk });
    hataVarsa(adlar.error);
    assert.equal(adlar.data.length, 50);
    assert.ok(adlar.data.every((a) => a.ad && Object.keys(a).sort().join() === "ad,kisi"), "yalnızca kişi ve ad");
    assert.ok(adlar.data.some((a) => a.ad === "Ayşe Sentetik"));
  });

  test("ad işlevi: üye, kapalı gözetim, yabancı boş; anon reddedilir; profiles hâlâ kapalı", async () => {
    for (const aktor of ["uye", "gozetimKapali", "yabanci"]) {
      const r = await (await oturum(aktor)).rpc("docentlik_kisi_adlari", { p_org: AM, p_kisiler: [K.sahip, K.uye] });
      assert.equal((r.data ?? []).length, 0, aktor);
      const l = await (await oturum(aktor)).rpc("docentlik_gozetim_listesi", { p_org: AM, p_sinir: 50, p_atla: 0 });
      assert.equal((l.data ?? []).length, 0, aktor);
    }
    const anon = createClient(GECIT[1000], ANON, { auth: { persistSession: false } });
    assert.ok((await anon.rpc("docentlik_kisi_adlari", { p_org: AM, p_kisiler: [K.sahip] })).error);
    const p = await (await oturum("gozetim")).from("profiles").select("full_name").eq("id", K.sahip);
    assert.equal((p.data ?? []).length, 0, "profiles RLS gevşemiş");
  });
});

describe("6. Kriter, hedef ve ÜAK yönetimi", () => {
  test("kriter: yönetici ekler/siler; üye ekleyemez", async () => {
    const y = await oturum("yonetici");
    const kod = `E${Date.now() % 100000}`;
    const r = await y.from("docentlik_kriterleri").insert({ organization_id: AM, code: kod, label: "Entegrasyon kriteri", points_per_unit: 5 }).select("id");
    hataVarsa(r.error);
    const u = await (await oturum("uye")).from("docentlik_kriterleri").insert({ organization_id: AM, code: kod + "U", label: "x", points_per_unit: 1 }).select("id");
    assert.ok(u.error || !u.data?.length, "üye kriter ekledi");
    hataVarsa((await y.from("docentlik_kriterleri").delete().eq("id", r.data[0].id)).error);
  });

  test("faaliyeti olan kriter silinemez (yabancı anahtar)", async () => {
    const r = await (await oturum("yonetici")).from("docentlik_kriterleri").delete().eq("id", R.kriter).select("id");
    assert.ok(r.error, "faaliyeti olan kriter silindi");
  });

  test("hedef: doktora sonrası satırına azami yazılamaz (veritabanı kısıtı)", async () => {
    const r = await (await oturum("yonetici")).from("docentlik_hedefleri").insert({ organization_id: AM, grup: "X", asgari_puan: 10, azami_puan: 20, doktora_sonrasi: true });
    assert.ok(r.error);
  });

  test("ÜAK: öneri/durum sütunlarını kullanıcı oturumu yazamaz (yalnızca service_role)", async () => {
    const y = await oturum("yonetici");
    const ins = await y.from("docentlik_uak_tablolari").insert({ organization_id: AM, temel_alan: `Entegrasyon ${Date.now()}`, donem: "2026", depo_yolu: `${AM}/uak/${crypto.randomUUID()}/t.pdf`, durum: "onaylandi" }).select("id, durum");
    if (!ins.error) {
      assert.notEqual(ins.data[0].durum, "onaylandi", "kullanıcı onaylandı yazabildi");
      const up = await y.from("docentlik_uak_tablolari").update({ durum: "onaylandi", oneri: { sahte: true } }).eq("id", ins.data[0].id).select("durum");
      assert.ok(up.error || up.data?.[0]?.durum !== "onaylandi", "kullanıcı onay durumunu yazdı");
      psql(`delete from public.docentlik_uak_tablolari where id='${ins.data[0].id}'`);
    }
  });
});

describe("7. Modül kapanması", () => {
  test("modül kapanınca okuma boş, ekleme reddedilir; açılınca geri gelir", async () => {
    const c = await oturum("sahip");
    psql(`update public.organization_modules set is_enabled=false where organization_id='${AM}' and module_code='docentlik'`);
    try {
      assert.equal((await c.from("docentlik_faaliyetleri").select("id").limit(1)).data.length, 0);
      const { error, data } = await ekle(c);
      assert.ok(error || !data?.length, "modül kapalıyken eklendi");
      assert.ok((await c.storage.from(KOVA).upload(`${AM}/faaliyet/${K.sahip}/${R.faaliyet}/${crypto.randomUUID()}.pdf`, PDF(), { contentType: "application/pdf" })).error);
    } finally {
      psql(`update public.organization_modules set is_enabled=true where organization_id='${AM}' and module_code='docentlik'`);
    }
    assert.equal((await c.from("docentlik_faaliyetleri").select("id").limit(1)).data.length, 1);
  });
});
