/*
  DOÇENTLİK FAALİYET YAZIMININ ATOMİKLİĞİ (20261115014302).

  Sunucu işlemi artık ekleme ve düzenlemeyi docentlik_faaliyet_ekle /
  docentlik_faaliyet_duzenle işlevleriyle yapıyor: yazım ile PR #318
  çekirdeğinin beklediği puanın karşılaştırması AYNI veritabanı işleminde.
  Burada sınanan, gerçek PostgreSQL (PGlite) işlem davranışı:
   - uyuşmazlıkta (yanlış beklenen değer ya da bilinçli bozulan
     tetikleyici) yeni satır DOĞMAZ, mevcut satırın her sütunu —
     updated_at dahil — olduğu gibi kalır;
   - eski telafi (silme) yolu tıkalı olsa bile kayıt kalmaz;
   - çift gönderim, iyimser eşzamanlılık, başlık düzenlemesinde puanın
     korunması, kriter değişikliği ve kural sürümü;
   - başka kişi/kurum, modül kapanması ve üyelik düşmesi;
   - işlevlerin yetkisi (invoker, anon/service_role kapalı).

  PGlite tek bağlantı: İKİ AYRI OTURUMUN gerçekten eşzamanlı yarışı burada
  kurulamıyor. Sınanan, ikinci yazımın okuduğu sürümün artık geçerli
  olmadığı durum — PostgreSQL READ COMMITTED'da eşzamanlı ikinci UPDATE
  ilkinin işlemesini bekleyip WHERE'i yeni satırda yeniden değerlendirir,
  yani sonuç aynıdır; ama bu, buradaki testin değil PostgreSQL'in
  belgelenmiş davranışının kanıtı (rapor: UNVERIFIED).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";
import { AM, AM2, K, R, aktorOl, tohumla } from "./docentlik-ortak.mjs";

await import("../register.mjs");
const c = await import("../../lib/docentlik-islem.ts");

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const KRITER = { points_per_unit: 20, baslica_yazar_katsayisi: 0.8, diger_yazar_katsayisi: 0.5, esit_bolusum: false };
const SURUM = "arvolab-2026-10-27";
const TUM_SUTUNLAR = `id, organization_id, owner_id, criteria_id, title, unit_count::text, yazar_sayisi, baslica_yazar,
  faaliyet_tarihi::text, notes, computed_points::text, paylasim_katsayisi::text, kural_surumu, belge_yolu,
  istek_anahtari, created_at::text, updated_at::text`;
const EKLE = "select * from public.docentlik_faaliyet_ekle($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)";
const DUZENLE = "select * from public.docentlik_faaliyet_duzenle($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)";

before(async () => {
  db = await veritabani();
  await tohumla(db);
});

/** Kayıt noktası içinde çağırır; hata kodunu da döndürür (dene yalnızca metni veriyor). */
async function cagir(sql, params) {
  await db.exec("savepoint cagir");
  try {
    const s = await db.query(sql, params);
    await db.exec("release savepoint cagir");
    return { ok: true, rows: s.rows };
  } catch (hata) {
    await db.exec("rollback to savepoint cagir");
    return { ok: false, rows: [], kod: hata.code, hata: hata.message };
  }
}

function form(degisiklik = {}) {
  const f = c.faaliyetFormu({ kriterId: R.kriter, baslik: "Makale", birimSayisi: "1", yazarSayisi: "1", baslicaYazar: "evet", ...degisiklik });
  assert.ok(f.ok, f.hata);
  return f.deger;
}

/** Sunucu işleminin (faaliyetEkle) RPC çağrısının aynısı; beklenen değer çekirdekten. */
function ekle({ yazim, istekAnahtari }, beklenen, org = AM) {
  return cagir(EKLE, [org, yazim.criteria_id, yazim.title, yazim.unit_count, yazim.yazar_sayisi, yazim.baslica_yazar,
    yazim.faaliyet_tarihi, yazim.notes, istekAnahtari, beklenen.puan, beklenen.katsayi, beklenen.surum]);
}

/** Sunucu işleminin (faaliyetDuzenle) RPC çağrısının aynısı. */
function duzenle(id, surum, yazim, beklenen, org = AM) {
  return cagir(DUZENLE, [id, org, surum, yazim.criteria_id, yazim.title, yazim.unit_count, yazim.yazar_sayisi,
    yazim.baslica_yazar, yazim.faaliyet_tarihi, yazim.notes, beklenen.puan, beklenen.katsayi, beklenen.surum]);
}

const satir = (id) => tek(`select ${TUM_SUTUNLAR} from public.docentlik_faaliyetleri where id = $1`, [id]);
const sayi = async (sahip = K.sahip) => (await tek("select count(*)::int n from public.docentlik_faaliyetleri where owner_id = $1", [sahip])).n;

/*
  Test tek işlemin içinde ve now() işlem boyunca sabit; aynı işlemde
  yazılan satırın updated_at'ı ikinci yazımda AYNI kalır. "Önceki bir
  istekte yazılmış" kaydı kurmak için sürüm tetikleyici atlatılarak
  geçmişe alınır.
*/
async function gecmiseAl(id, dakika = 1) {
  await rol(db, "postgres");
  await db.exec("set local session_replication_role = replica");
  await db.query(`update public.docentlik_faaliyetleri set updated_at = now() - make_interval(mins => $2) where id = $1`, [id, dakika]);
  await db.exec("set local session_replication_role = origin");
}

/** Tetikleyiciyi bilinçli bozar: ana tetikleyiciden SONRA çalışan (ad sırası) ikinci bir tetikleyici puana +1 ekler. */
async function tetikleyiciyiBoz() {
  await rol(db, "postgres");
  await db.exec(`
    create function private.docentlik_test_sapma() returns trigger language plpgsql as
      $$ begin new.computed_points := new.computed_points + 1; return new; end $$;
    create trigger docentlik_zz_test_sapma before insert or update on public.docentlik_faaliyetleri
      for each row execute function private.docentlik_test_sapma();`);
}

describe("ekleme: uyuşmazlıkta sıfır yeni kayıt", () => {
  test("meşru ekleme: çekirdeğin beklediği değerle yazılır, kayıt beklenenle birebir", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const f = form({ birimSayisi: "3", yazarSayisi: "4", baslicaYazar: "evet" });
      const beklenen = c.beklenenEklemePuani(f.yazim, KRITER);
      const s = await ekle(f, beklenen);
      assert.ok(s.ok, s.hata);
      assert.equal(s.rows[0].tekrar, false);
      const k = await satir(s.rows[0].kayit_id);
      assert.ok(c.puanDogrulandiMi(beklenen, k), JSON.stringify({ beklenen, k }));
      assert.deepEqual([k.computed_points, k.paylasim_katsayisi, k.kural_surumu, k.owner_id], ["48", "0.8", SURUM, K.sahip]);
    }));

  for (const [ad, bozuk] of [
    ["puan", (b) => ({ ...b, puan: b.puan + 1 })],
    ["katsayı", (b) => ({ ...b, katsayi: 0.5 })],
    ["kural sürümü", (b) => ({ ...b, surum: "arvolab-2099-01-01" })],
    ["son basamakta puan (1e-6)", (b) => ({ ...b, puan: b.puan + 0.000001 })],
  ]) {
    test(`beklenen ${ad} tutmazsa DP001 ve hiçbir satır kalmaz`, () =>
      islem(db, async () => {
        await aktorOl(db, "sahip");
        const once = await sayi();
        const f = form({ istekAnahtari: "00000000-0000-4000-8000-00000000ab01" });
        const s = await ekle(f, bozuk(c.beklenenEklemePuani(f.yazim, KRITER)));
        assert.equal(s.ok, false);
        assert.equal(s.kod, "DP001", s.hata);
        assert.equal(await sayi(), once, "yeni satır kalmamalı");
        await rol(db, "postgres");
        assert.equal((await tek("select count(*)::int n from public.docentlik_faaliyetleri where istek_anahtari = $1", [f.istekAnahtari])).n, 0,
          "RLS'siz bakışta da satır yok (geri alma gerçek, gizleme değil)");
      }));
  }

  test("bilinçli bozulan tetikleyici: istemcinin doğru beklentisiyle bile kayıt geri alınır (geri alma kanıtı)", () =>
    islem(db, async () => {
      await tetikleyiciyiBoz();
      await aktorOl(db, "sahip");
      const once = await sayi();
      const f = form();
      const s = await ekle(f, c.beklenenEklemePuani(f.yazim, KRITER));
      assert.equal(s.kod, "DP001", s.hata);
      assert.match(s.hata, /kaydedilmedi/);
      assert.equal(await sayi(), once);
    }));

  test("eski telafi yolu (silme) tıkalı olsa bile yanlış puanlı kayıt kalmaz: telafi gerekmiyor", () =>
    islem(db, async () => {
      await tetikleyiciyiBoz();
      await rol(db, "postgres");
      await db.exec(`
        create function private.docentlik_test_silme_yok() returns trigger language plpgsql as
          $$ begin raise exception 'silme düştü (test)'; end $$;
        create trigger docentlik_test_silme_yok before delete on public.docentlik_faaliyetleri
          for each row execute function private.docentlik_test_silme_yok();`);
      await aktorOl(db, "sahip");
      const once = await sayi();
      const f = form();
      const s = await ekle(f, c.beklenenEklemePuani(f.yazim, KRITER));
      assert.equal(s.kod, "DP001");
      assert.equal(await sayi(), once);
    }));

  test("beklenen değer verilmezse yazım yapılmaz (22004) — doğrulamasız yol yok", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const f = form();
      const once = await sayi();
      for (const eksik of [{ puan: null }, { katsayi: null }, { surum: null }]) {
        const s = await ekle(f, { ...c.beklenenEklemePuani(f.yazim, KRITER), ...eksik });
        assert.equal(s.kod, "22004", JSON.stringify(eksik));
      }
      assert.equal(await sayi(), once);
    }));
});

describe("düzenleme: uyuşmazlıkta eski kayıt tamamen korunur", () => {
  for (const [ad, hazirla, bozuk] of [
    ["yanlış beklenen puan", async () => {}, (b) => ({ ...b, puan: b.puan + 5 })],
    ["yanlış kural sürümü", async () => {}, (b) => ({ ...b, surum: "arvolab-2099-01-01" })],
    ["bilinçli bozulan tetikleyici", tetikleyiciyiBoz, (b) => b],
  ]) {
    test(`${ad}: DP001, satırın bütün sütunları ve sürümü aynı`, () =>
      islem(db, async () => {
        await gecmiseAl(R.faaliyet);
        await hazirla();
        await rol(db, "postgres");
        const once = await satir(R.faaliyet);
        await aktorOl(db, "sahip");
        const f = form({ baslik: "Değişmiş başlık", birimSayisi: "5", yazarSayisi: "2", baslicaYazar: "evet", notlar: "yeni not" });
        const beklenen = c.beklenenDuzenlemePuani(once, f.yazim, KRITER);
        const s = await duzenle(R.faaliyet, once.updated_at, f.yazim, bozuk(beklenen));
        assert.equal(s.kod, "DP001", s.hata);
        assert.match(s.hata, /değiştirilmedi/);
        await rol(db, "postgres");
        assert.deepEqual(await satir(R.faaliyet), once);
      }));
  }

  test("meşru düzenleme zinciri: her adım çekirdekle aynı; sürüm her adımda ilerler", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.docentlik_kriterleri set points_per_unit = 50 where id = $1", [R.kriter]);
      const kriter = { ...KRITER, points_per_unit: 50 };
      let dakika = 10;
      for (const degisiklik of [{ baslik: "Yeni başlık", notlar: "not", faaliyetTarihi: "2024-01-01" }, { birimSayisi: "4" }, { baslicaYazar: "evet" }, { yazarSayisi: "1" }]) {
        await gecmiseAl(R.faaliyet, dakika--);
        await rol(db, "postgres");
        const mevcut = await satir(R.faaliyet);
        await aktorOl(db, "sahip");
        const f = form({
          baslik: mevcut.title, notlar: mevcut.notes ?? "", faaliyetTarihi: mevcut.faaliyet_tarihi ?? "", birimSayisi: mevcut.unit_count,
          yazarSayisi: String(mevcut.yazar_sayisi), baslicaYazar: mevcut.baslica_yazar ? "evet" : "hayir", ...degisiklik,
        });
        const beklenen = c.beklenenDuzenlemePuani(mevcut, f.yazim, kriter);
        const s = await duzenle(R.faaliyet, mevcut.updated_at, f.yazim, beklenen);
        assert.ok(s.ok && s.rows[0].guncellendi, `${JSON.stringify(degisiklik)}: ${s.hata}`);
        await rol(db, "postgres");
        const sonra = await satir(R.faaliyet);
        assert.ok(c.puanDogrulandiMi(beklenen, sonra), JSON.stringify({ degisiklik, beklenen, sonra }));
        assert.notEqual(sonra.updated_at, mevcut.updated_at);
      }
      // Başlık adımı 20'yi korudu; birim 4 → 40 (eski birim puan 20, kriterin yeni 50'si değil).
    }));

  test("başlık düzenlemesi: kriter pahalanmış ve puan yuvarlama kaymalı olsa bile mevcut puan aynen kalır", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.docentlik_kriterleri set points_per_unit = 0.1234567, baslica_yazar_katsayisi = null, diger_yazar_katsayisi = null, esit_bolusum = true where id = $1", [R.kriter]);
      await aktorOl(db, "sahip");
      const k1 = { points_per_unit: 0.1234567, baslica_yazar_katsayisi: null, diger_yazar_katsayisi: null, esit_bolusum: true };
      const f = form({ birimSayisi: "2" });
      const e = await ekle(f, c.beklenenEklemePuani(f.yazim, k1));
      assert.ok(e.ok, e.hata);
      const id = e.rows[0].kayit_id;
      await gecmiseAl(id);
      await rol(db, "postgres");
      await db.query("update public.docentlik_kriterleri set points_per_unit = 99 where id = $1", [R.kriter]);
      const mevcut = await satir(id);
      assert.equal(mevcut.computed_points, "0.246913");
      await aktorOl(db, "sahip");
      const g = form({ birimSayisi: "2", baslik: "Düzeltilmiş başlık" });
      const beklenen = c.beklenenDuzenlemePuani(mevcut, g.yazim, { ...k1, points_per_unit: 99 });
      assert.equal(beklenen.puan, 0.246913);
      const s = await duzenle(id, mevcut.updated_at, g.yazim, beklenen);
      assert.ok(s.ok && s.rows[0].guncellendi, s.hata);
      await rol(db, "postgres");
      const sonra = await satir(id);
      assert.deepEqual([sonra.title, sonra.computed_points, sonra.paylasim_katsayisi], ["Düzeltilmiş başlık", "0.246913", "1"]);
    }));

  test("kriter değişikliği: puan yeni kriterden; kural sürümü uyumlu", () =>
    islem(db, async () => {
      await gecmiseAl(R.faaliyet);
      await rol(db, "postgres");
      const mevcut = await satir(R.faaliyet);
      await aktorOl(db, "sahip");
      const f = form({ kriterId: R.kriterSil, birimSayisi: "3", yazarSayisi: "1" });
      const beklenen = c.beklenenDuzenlemePuani(mevcut, f.yazim, { points_per_unit: 1, baslica_yazar_katsayisi: null, diger_yazar_katsayisi: null, esit_bolusum: false });
      assert.deepEqual(beklenen, { puan: 3, katsayi: 1, surum: SURUM });
      const s = await duzenle(R.faaliyet, mevcut.updated_at, f.yazim, beklenen);
      assert.ok(s.ok && s.rows[0].guncellendi, s.hata);
      await rol(db, "postgres");
      assert.ok(c.puanDogrulandiMi(beklenen, await satir(R.faaliyet)));
    }));

  test("eski kural sürümüyle yazılmış kayıt: başlık düzenlemesi o sürümü korur ve öyle beklenir; güncel sürümü beklemek reddedilir", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.exec("set local session_replication_role = replica");
      await db.query("update public.docentlik_faaliyetleri set kural_surumu = 'arvolab-eski', updated_at = now() - interval '1 minute' where id = $1", [R.faaliyet]);
      await db.exec("set local session_replication_role = origin");
      const mevcut = await satir(R.faaliyet);
      await aktorOl(db, "sahip");
      const f = form({ baslik: "Yalnızca başlık", birimSayisi: "2", yazarSayisi: "3", baslicaYazar: "hayir", faaliyetTarihi: "2022-01-10" });
      const beklenen = c.beklenenDuzenlemePuani(mevcut, f.yazim, KRITER);
      assert.equal(beklenen.surum, "arvolab-eski");
      const yanlis = await duzenle(R.faaliyet, mevcut.updated_at, f.yazim, { ...beklenen, surum: SURUM });
      assert.equal(yanlis.kod, "DP001");
      const dogru = await duzenle(R.faaliyet, mevcut.updated_at, f.yazim, beklenen);
      assert.ok(dogru.ok && dogru.rows[0].guncellendi, dogru.hata);
      await rol(db, "postgres");
      assert.equal((await satir(R.faaliyet)).kural_surumu, "arvolab-eski");
    }));

  test("sürüm verilmeden düzenleme yapılamaz (22004)", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const f = form();
      const s = await duzenle(R.faaliyet, null, f.yazim, { puan: 20, katsayi: 0.5, surum: SURUM });
      assert.equal(s.kod, "22004");
    }));
});

describe("çift gönderim ve eşzamanlılık", () => {
  const ANAHTAR = "00000000-0000-4000-8000-00000000ab02";

  test("aynı istek iki kez: tek satır, ikinci çağrı ilk kaydı döndürür (tekrar)", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const f = form({ istekAnahtari: ANAHTAR });
      const b = c.beklenenEklemePuani(f.yazim, KRITER);
      const ilk = await ekle(f, b);
      const ikinci = await ekle(f, b);
      assert.ok(ilk.ok && ikinci.ok, ikinci.hata);
      assert.deepEqual([ilk.rows[0].tekrar, ikinci.rows[0].tekrar], [false, true]);
      assert.equal(ikinci.rows[0].kayit_id, ilk.rows[0].kayit_id);
      assert.equal((await tek("select count(*)::int n from public.docentlik_faaliyetleri where istek_anahtari = $1", [ANAHTAR])).n, 1);
    }));

  test("uyuşmazlıkla düşen istek anahtarı TÜKETMEZ: düzeltilmiş tekrar kaydı yazar", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const f = form({ istekAnahtari: ANAHTAR });
      const b = c.beklenenEklemePuani(f.yazim, KRITER);
      assert.equal((await ekle(f, { ...b, puan: 999 })).kod, "DP001");
      const tekrar = await ekle(f, b);
      assert.ok(tekrar.ok, tekrar.hata);
      assert.equal(tekrar.rows[0].tekrar, false, "ilk deneme geri alındığı için bu İLK yazım");
    }));

  test("aynı anahtar başka kişide ayrı kayıt; başkasının kaydı 'tekrar' diye dönmez", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const f = form({ istekAnahtari: ANAHTAR });
      const b = c.beklenenEklemePuani(f.yazim, KRITER);
      const sahibin = await ekle(f, b);
      await aktorOl(db, "uye");
      const uyenin = await ekle(f, b);
      assert.ok(uyenin.ok, uyenin.hata);
      assert.equal(uyenin.rows[0].tekrar, false);
      assert.notEqual(uyenin.rows[0].kayit_id, sahibin.rows[0].kayit_id);
    }));

  test("aynı sürümü okuyan iki düzenleme: ilki yazar, ikincisi hiçbir şey yazmaz (guncellendi = false)", () =>
    islem(db, async () => {
      await gecmiseAl(R.faaliyet);
      await rol(db, "postgres");
      const okunan = await satir(R.faaliyet);
      await aktorOl(db, "sahip");
      const a = form({ baslik: "Birinci sekme", birimSayisi: "2", yazarSayisi: "3", baslicaYazar: "hayir" });
      const bb = form({ baslik: "İkinci sekme", birimSayisi: "7", yazarSayisi: "3", baslicaYazar: "hayir" });
      const birinci = await duzenle(R.faaliyet, okunan.updated_at, a.yazim, c.beklenenDuzenlemePuani(okunan, a.yazim, KRITER));
      const ikinci = await duzenle(R.faaliyet, okunan.updated_at, bb.yazim, c.beklenenDuzenlemePuani(okunan, bb.yazim, KRITER));
      assert.deepEqual([birinci.rows[0].guncellendi, ikinci.rows[0].guncellendi], [true, false]);
      await rol(db, "postgres");
      const son = await satir(R.faaliyet);
      assert.deepEqual([son.title, son.unit_count, son.computed_points], ["Birinci sekme", "2", "20"]);
    }));
});

describe("erişim ve işlem sırasında değişen yetki", () => {
  test("başka kişinin faaliyeti: düzenleme hiçbir şey yazmaz; satır aynı", () =>
    islem(db, async () => {
      await gecmiseAl(R.faaliyet);
      await rol(db, "postgres");
      const once = await satir(R.faaliyet);
      for (const aktor of ["uye", "gozetim", "kurumSahibi", "yabanci"]) {
        await aktorOl(db, aktor);
        const f = form({ baslik: "Ele geçirme", birimSayisi: "2", yazarSayisi: "3", baslicaYazar: "hayir" });
        const s = await duzenle(R.faaliyet, once.updated_at, f.yazim, c.beklenenDuzenlemePuani(once, f.yazim, KRITER));
        assert.ok(s.ok && s.rows[0].guncellendi === false, `${aktor}: ${s.hata ?? "yazdı"}`);
      }
      await rol(db, "postgres");
      assert.deepEqual(await satir(R.faaliyet), once);
    }));

  test("başka kurum: ekleme RLS ile reddedilir; başka kurumun faaliyeti düzenlenemez", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      // Öteki kurumun KENDİ kriteriyle: tetikleyicinin kriter denetimi geçiyor, karar RLS'te.
      const f = form({ kriterId: R.kriterAm2 });
      const b = c.beklenenEklemePuani(f.yazim, { points_per_unit: 99, baslica_yazar_katsayisi: null, diger_yazar_katsayisi: null, esit_bolusum: false });
      const s = await ekle(f, b, AM2);
      assert.equal(s.ok, false);
      assert.match(s.hata, /row-level security|violates/);
      await rol(db, "postgres");
      const once = await satir(R.faaliyetAm2);
      await aktorOl(db, "sahip");
      const d = await duzenle(R.faaliyetAm2, once.updated_at, form({ kriterId: R.kriterAm2 }).yazim, { puan: 99, katsayi: 1, surum: SURUM }, AM2);
      assert.equal(d.rows[0]?.guncellendi ?? false, false);
      await rol(db, "postgres");
      assert.deepEqual(await satir(R.faaliyetAm2), once);
    }));

  test("modül kapanınca: ekleme reddedilir, düzenleme yazmaz", () =>
    islem(db, async () => {
      await gecmiseAl(R.faaliyet);
      await rol(db, "postgres");
      const once = await satir(R.faaliyet);
      await db.query("update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = 'docentlik'", [AM]);
      await aktorOl(db, "sahip");
      const f = form();
      const e = await ekle(f, c.beklenenEklemePuani(f.yazim, KRITER));
      assert.equal(e.ok, false);
      const g = form({ baslik: "x", birimSayisi: "2", yazarSayisi: "3", baslicaYazar: "hayir" });
      const d = await duzenle(R.faaliyet, once.updated_at, g.yazim, c.beklenenDuzenlemePuani(once, g.yazim, KRITER));
      assert.equal(d.rows[0]?.guncellendi ?? false, false);
      await rol(db, "postgres");
      assert.deepEqual(await satir(R.faaliyet), once);
      assert.equal(await sayi(), 1);
    }));

  test("üyelik düşünce: ekleme reddedilir, düzenleme yazmaz", () =>
    islem(db, async () => {
      await gecmiseAl(R.faaliyet);
      await rol(db, "postgres");
      const once = await satir(R.faaliyet);
      await db.query("update public.organization_memberships set is_active = false where organization_id = $1 and user_id = $2", [AM, K.sahip]);
      await aktorOl(db, "sahip");
      const f = form();
      assert.equal((await ekle(f, c.beklenenEklemePuani(f.yazim, KRITER))).ok, false);
      const g = form({ baslik: "x", birimSayisi: "2", yazarSayisi: "3", baslicaYazar: "hayir" });
      const d = await duzenle(R.faaliyet, once.updated_at, g.yazim, c.beklenenDuzenlemePuani(once, g.yazim, KRITER));
      assert.equal(d.rows[0]?.guncellendi ?? false, false);
      await rol(db, "postgres");
      assert.deepEqual(await satir(R.faaliyet), once);
    }));

  test("kimlik oturumdan: işlev sahip parametresi almıyor, kayıt çağıranın adına", () =>
    islem(db, async () => {
      await aktorOl(db, "uye");
      const f = form();
      const s = await ekle(f, c.beklenenEklemePuani(f.yazim, KRITER));
      assert.ok(s.ok, s.hata);
      await rol(db, "postgres");
      assert.equal((await satir(s.rows[0].kayit_id)).owner_id, K.uye);
      const arg = await tek("select pg_get_function_identity_arguments('public.docentlik_faaliyet_ekle'::regproc) a");
      assert.doesNotMatch(arg.a, /owner|sahip|computed|puan numeric/);
    }));
});

describe("işlevlerin yetkisi", () => {
  test("security invoker, search_path sabit; anon ve service_role çalıştıramaz, authenticated çalıştırır", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      for (const ad of ["docentlik_faaliyet_ekle", "docentlik_faaliyet_duzenle"]) {
        const f = await tek(`select p.prosecdef, p.proconfig, p.oid::regprocedure::text imza from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [ad]);
        assert.equal(f.prosecdef, false, `${ad} definer olmamalı`);
        assert.ok(f.proconfig?.some((x) => x.startsWith("search_path=")), `${ad} search_path`);
        for (const [r, beklenen] of [["anon", false], ["service_role", false], ["authenticated", true], ["public", false]]) {
          const v = r === "public"
            ? (await tek("select bool_or(acl.privilege_type = 'EXECUTE' and acl.grantee = 0) v from pg_proc p, aclexplode(p.proacl) acl where p.oid = $1::regprocedure", [f.imza])).v ?? false
            : (await tek("select has_function_privilege($1, $2, 'execute') v", [r, f.imza])).v;
          assert.equal(v, beklenen, `${ad} → ${r}`);
        }
      }
    }));

  test("anon çağıramaz", () =>
    islem(db, async () => {
      await aktorOl(db, "anon");
      const s = await cagir(EKLE, [AM, R.kriter, "x", 1, 1, true, null, null, null, 20, 1, SURUM]);
      assert.equal(s.ok, false);
      assert.match(s.hata, /permission denied/);
    }));
});
