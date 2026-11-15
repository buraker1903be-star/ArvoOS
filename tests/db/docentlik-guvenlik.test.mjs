/*
  DOÇENTLİK GÜVENLİK SENARYOLARI (F6 PR3, 20261114200939).

  Matris (docentlik-rls-matrisi) olağan durumu sınıyor. Burada kenarlar:
  kapalı modül, izin listesinden çıkarma, iptal edilmiş üyelik, kişi
  kuralının rol kuralını ezmesi, NULL ve çapraz kurum, ArvoLab'dan bilinen
  K1 (istemcinin puanı yazması), K2 (kurum/sahip değiştirme), K5 (ÜAK
  onayı), gözetim için veri en aza indirme ve modül kapısının başka bir
  politikayla atlatılamaması.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";
import { AM, AM2, K, R, aktorOl, dene, tohumla } from "./docentlik-ortak.mjs";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const sayi = async (sql, p = []) => (await tek(sql, p)).n;
const gorur = (id) => sayi("select count(*)::int n from public.docentlik_faaliyetleri where id = $1", [id]);

before(async () => {
  db = await veritabani();
  await tohumla(db);
});

describe("Modül kapısı", () => {
  test("kurumda modül kapatılınca sahibi kendi faaliyetini de göremez, yazamaz; Kurum Sahibi de", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = 'docentlik'", [AM]);
      for (const aktor of ["sahip", "kurumSahibi", "gozetim"]) {
        await aktorOl(db, aktor);
        assert.equal(await gorur(R.faaliyet), 0, aktor);
        assert.equal(await sayi("select count(*)::int n from public.docentlik_kriterleri"), 0, aktor);
      }
      await aktorOl(db, "sahip");
      await reddedilir(db,
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title) values ($1, $2, $3, 'x')",
        [AM, K.sahip, R.kriter], /row-level security/);
    }));

  test("kurum izin listesinden çıkarılınca modül kapanır ve erişim düşer", () =>
    islem(db, async () => {
      await rol(db, "service_role");
      await db.query("delete from public.ozel_modul_kurumlari where module_code = 'docentlik' and organization_id = $1", [AM]);
      await aktorOl(db, "sahip");
      assert.equal(await gorur(R.faaliyet), 0);
    }));

  test("kişinin kendisinde gizlenen modül (member_module_permissions) erişimi kapatır", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query(
        "insert into public.member_module_permissions (organization_id, user_id, module_key, can_access, updated_at) values ($1, $2, 'docentlik', false, now())",
        [AM, K.sahip]);
      await aktorOl(db, "sahip");
      assert.equal(await gorur(R.faaliyet), 0);
    }));

  test("izin veren yeni bir politika (using true) modül kapısını AŞAMAZ: kısıtlayıcı politika VE ile birleşir", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.exec("create policy sahte_gevsek on public.docentlik_faaliyetleri for select to authenticated using (true)");
      // Modül açıkken sahte politika gerçekten etkili: yetkisiz üye başkasının faaliyetini görüyor.
      await aktorOl(db, "uye");
      assert.equal(await gorur(R.faaliyet), 1, "sahte politika etkisiz — test bir şey ölçmüyor");
      // Modül kapanınca kısıtlayıcı kapı sahte politikayı da kesiyor.
      await rol(db, "postgres");
      await db.query("update public.organization_modules set is_enabled = false where organization_id = $1 and module_code = 'docentlik'", [AM]);
      await aktorOl(db, "uye");
      assert.equal(await gorur(R.faaliyet), 0, "izin veren bir politika modül kapısını atlattı");
      // Kısıtlayıcı politika olmasa ne olurdu: kapı düşerdi. (Kısıtlayıcının gerekli olduğunun kanıtı.)
      await rol(db, "postgres");
      await db.exec("drop policy docentlik_faaliyetleri_modul_kapisi on public.docentlik_faaliyetleri");
      await aktorOl(db, "uye");
      assert.equal(await gorur(R.faaliyet), 1);
    }));

  test("sözleşme: Doçentlik tablolarındaki HER politika modül kapısını çağırıyor ve her tabloda kısıtlayıcı kapı var", async () => {
    await rol(db, "postgres");
    const politikalar = (await db.query(
      `select tablename, policyname, permissive, coalesce(qual,'') || ' ' || coalesce(with_check,'') as metin
         from pg_policies where schemaname = 'public' and tablename like 'docentlik\\_%'`)).rows;
    assert.ok(politikalar.length >= 25, `beklenenden az politika: ${politikalar.length}`);
    for (const p of politikalar) {
      assert.match(p.metin, /modul_kurumda_acik\(organization_id, 'docentlik'::text\)/, `${p.tablename}.${p.policyname} modül kapısını çağırmıyor`);
    }
    const tablolar = ["docentlik_kriterleri", "docentlik_hedefleri", "docentlik_profilleri", "docentlik_faaliyetleri", "docentlik_uak_tablolari"];
    for (const t of tablolar) {
      assert.ok(politikalar.some((p) => p.tablename === t && p.permissive === "RESTRICTIVE"), `${t}: kısıtlayıcı kapı yok`);
      const { rls } = await tek("select relrowsecurity as rls from pg_class where oid = ('public.' || $1)::regclass", [t]);
      assert.equal(rls, true, `${t}: RLS kapalı`);
    }
  });
});

describe("Üyelik ve yetki", () => {
  test("iptal edilmiş üye kendi eski faaliyetini göremez ve yeni kayıt açamaz", () =>
    islem(db, async () => {
      await rol(db, "authenticated", K.iptal);
      assert.equal(await gorur(R.faaliyetIptal), 0);
      await reddedilir(db,
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title) values ($1, $2, $3, 'x')",
        [AM, K.iptal, R.kriter], /row-level security/);
      await reddedilir(db,
        "insert into public.docentlik_profilleri (organization_id, owner_id) values ($1, $2)",
        [AM, K.iptal], /row-level security/);
    }));

  test("kişi kuralı rol kuralını ezer: rolü tumunu_gor taşıyan ama kişide kapatılan admin göremez", () =>
    islem(db, async () => {
      await rol(db, "authenticated", K.gozetim);
      assert.equal(await gorur(R.faaliyet), 1, "rol düzeyinde verilen yetki çalışmıyor");
      await rol(db, "authenticated", K.gozetimKapali);
      assert.equal(await gorur(R.faaliyet), 0);
    }));

  test("yetki varsayılanı BOŞ: kural yazılmamış admin/manager hiçbir şey yönetemez", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("delete from public.role_capability_permissions where organization_id = $1", [AM]);
      await aktorOl(db, "gozetim");
      assert.equal(await gorur(R.faaliyet), 0);
      await aktorOl(db, "yonetici");
      assert.equal(await gorur(R.faaliyet), 0, "kriter yöneticisi faaliyetleri görmemeli");
    }));

  test("yetkisiz kişi kendisine yetki yazamaz (yetki tablosu kurum yöneticisinin)", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const sonuc = await dene(db,
        "insert into public.member_capability_permissions (organization_id, user_id, capability_key, allowed, updated_at) values ($1, $2, 'docentlik.tumunu_gor', true, now())",
        [AM, K.sahip]);
      assert.equal(sonuc.ok, false);
    }));
});

describe("NULL ve çapraz kurum", () => {
  test("NULL kurumlu satır yazılamaz; NULL kurum hiçbir kapıdan geçmez", () =>
    islem(db, async () => {
      await rol(db, "service_role");
      await reddedilir(db, "insert into public.docentlik_kriterleri (organization_id, code, label) values (null, 'N', 'Null')", [], /null value/);
      await aktorOl(db, "kurumSahibi");
      assert.equal((await tek("select private.modul_kurumda_acik(null, 'docentlik') as v")).v, false);
      assert.equal((await tek("select private.docentlik_yetkisi(null, 'docentlik.tumunu_gor') as v")).v, false);
      await reddedilir(db,
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title) values (null, $1, $2, 'x')",
        [K.kurumSahibi, R.kriter], /null value|row-level security|kriter bulunamadı/);
    }));

  test("yabancı kurumun sahibi (kendi kurumunda tam yetkili) bu kurumun hiçbir satırını görmez, yazamaz", () =>
    islem(db, async () => {
      await aktorOl(db, "yabanci");
      assert.equal(await sayi("select count(*)::int n from public.docentlik_faaliyetleri where organization_id = $1", [AM]), 0);
      assert.equal(await sayi("select count(*)::int n from public.docentlik_faaliyetleri where organization_id = $1", [AM2]), 1, "kendi kurumunu görmeli");
      assert.equal(await sayi("select count(*)::int n from public.docentlik_kriterleri where organization_id = $1", [AM]), 0);
      await reddedilir(db, "insert into public.docentlik_kriterleri (organization_id, code, label) values ($1, 'X', 'Sızma')", [AM], /row-level security/);
      await reddedilir(db,
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title) values ($1, $2, $3, 'x')",
        [AM, K.yabanci, R.kriter], /row-level security/);
    }));

  test("üye başka kuruma faaliyet açamaz; faaliyet başka kurumun kriterine bağlanamaz", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      await reddedilir(db,
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title) values ($1, $2, $3, 'x')",
        [AM2, K.sahip, R.kriterAm2], /row-level security/);
      await reddedilir(db,
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title) values ($1, $2, $3, 'x')",
        [AM, K.sahip, R.kriterAm2], /foreign key|kriter bulunamadı/);
      // Sahibi kendi faaliyetini öteki kurumun kriterine taşıyamaz.
      await reddedilir(db, "update public.docentlik_faaliyetleri set criteria_id = $1 where id = $2", [R.kriterAm2, R.faaliyet], /foreign key|kriter bulunamadı/);
    }));

  test("kriter ve hedef başka kuruma taşınamaz (kurum değişmez); service_role için de", () =>
    islem(db, async () => {
      await aktorOl(db, "yonetici");
      await reddedilir(db, "update public.docentlik_kriterleri set organization_id = $1 where id = $2", [AM2, R.kriterSil], /kurumu değiştirilemez|row-level security/);
      await rol(db, "service_role");
      await reddedilir(db, "update public.docentlik_kriterleri set organization_id = $1 where id = $2", [AM2, R.kriterSil], /kurumu değiştirilemez/);
      await reddedilir(db, "update public.docentlik_hedefleri set organization_id = $1 where id = $2", [AM2, R.hedef], /kurumu değiştirilemez/);
      await reddedilir(db, "update public.docentlik_uak_tablolari set organization_id = $1 where id = $2", [AM2, R.uak], /kurumu değiştirilemez|check constraint/);
    }));
});

describe("K1: puan istemciden yazılamaz", () => {
  test("sahip puanı, katsayıyı ya da kural sürümünü ne eklerken ne düzenlerken yazabilir", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      await reddedilir(db,
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title, computed_points) values ($1, $2, $3, 'x', 9999)",
        [AM, K.sahip, R.kriter], /permission denied/);
      for (const [sutun, deger] of [["computed_points", "9999"], ["paylasim_katsayisi", "1"], ["kural_surumu", "'uydurma'"]]) {
        await reddedilir(db, `update public.docentlik_faaliyetleri set ${sutun} = ${deger} where id = $1`, [R.faaliyet], /permission denied/);
      }
    }));

  test("tohumdaki faaliyetin puanı kriterden hesaplandı: 2 × 20 × 0,5 (diğer yazar) = 20", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const f = await tek("select computed_points::text p, paylasim_katsayisi::text k, kural_surumu from public.docentlik_faaliyetleri where id = $1", [R.faaliyet]);
      assert.deepEqual(f, { p: "20", k: "0.5", kural_surumu: "arvolab-2026-10-27" });
    }));

  test("service_role'ün gönderdiği puan da yok sayılır, tetikleyici yeniden hesaplar", () =>
    islem(db, async () => {
      await rol(db, "service_role");
      const f = await tek(
        `insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title, unit_count, computed_points, paylasim_katsayisi, kural_surumu)
         values ($1, $2, $3, 'x', 3, 9999, 0.01, 'uydurma') returning computed_points::text p, paylasim_katsayisi::text k, kural_surumu`,
        [AM, K.sahip, R.kriter]);
      assert.deepEqual(f, { p: "60", k: "1", kural_surumu: "arvolab-2026-10-27" });
      const g = await tek("update public.docentlik_faaliyetleri set computed_points = 1 where id = $1 returning computed_points::text p", [R.faaliyet]);
      assert.equal(g.p, "20", "girdi değişmeden puan değişmemeli");
    }));

  test("başlık ya da belge değişince puan değişmez; kriter sonradan pahalansa da eski kayıt yeniden fiyatlanmaz", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("update public.docentlik_kriterleri set points_per_unit = 50 where id = $1", [R.kriter]);
      // Belge yolu F6 PR8'den beri yalnızca service_role işleviyle yazılıyor (20261115145234):
      // puanın belgeden etkilenmediğini o yolla sınıyoruz, başlığı sahibin kendisi değiştiriyor.
      await rol(db, "service_role");
      const yol = `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/belge.pdf`;
      const belge = await tek("update public.docentlik_faaliyetleri set belge_yolu = $2 where id = $1 returning computed_points::text p", [R.faaliyet, yol]);
      assert.equal(belge.p, "20");
      await aktorOl(db, "sahip");
      const a = await tek("update public.docentlik_faaliyetleri set title = 'Yeni başlık' where id = $1 returning computed_points::text p", [R.faaliyet]);
      assert.equal(a.p, "20");
      // Birim değişince birim puan KAYITTAN türetilir (20 / (2 × 0,5) = 20), kriterin yeni 50'si değil:
      // 4 × 20 × 0,5 = 40. Kriterden okunsaydı 4 × 50 × 0,5 = 100 olurdu.
      const b = await tek("update public.docentlik_faaliyetleri set unit_count = 4 where id = $1 returning computed_points::text p", [R.faaliyet]);
      assert.equal(b.p, "40");
    }));

  test("tek yazarlı faaliyette yazar her zaman başlıca sayılır; pasif kritere yeni faaliyet açılamaz", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const f = await tek(
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title, yazar_sayisi, baslica_yazar) values ($1, $2, $3, 'x', 1, false) returning baslica_yazar",
        [AM, K.sahip, R.kriter]);
      assert.equal(f.baslica_yazar, true);
      await rol(db, "postgres");
      await db.query("update public.docentlik_kriterleri set is_active = false where id = $1", [R.kriter]);
      await aktorOl(db, "sahip");
      await reddedilir(db,
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title) values ($1, $2, $3, 'x')",
        [AM, K.sahip, R.kriter], /kriter bulunamadı/);
      // Kriteri değişmeyen eski kayıt düzenlenebilir kalır.
      const g = await tek("update public.docentlik_faaliyetleri set unit_count = 3 where id = $1 returning computed_points::text p", [R.faaliyet]);
      assert.equal(g.p, "30", "3 × 20 × 0,5");
    }));

  test("faaliyeti olan kriter silinemez (veri korunur)", () =>
    islem(db, async () => {
      await aktorOl(db, "yonetici");
      await reddedilir(db, "delete from public.docentlik_kriterleri where id = $1", [R.kriter], /foreign key/);
    }));
});

describe("K2: sahiplik", () => {
  test("başkası adına faaliyet ya da profil açılamaz", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      await reddedilir(db,
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title) values ($1, $2, $3, 'x')",
        [AM, K.uye, R.kriter], /row-level security/);
      await reddedilir(db, "insert into public.docentlik_profilleri (organization_id, owner_id) values ($1, $2)", [AM, K.uye], /row-level security/);
      // Yetkili gözetim de başkası adına yazamaz.
      await aktorOl(db, "gozetim");
      await reddedilir(db,
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title) values ($1, $2, $3, 'x')",
        [AM, K.sahip, R.kriter], /row-level security/);
    }));

  test("sahip ve kurum sütunu güncellenemez: istemcide yazma yetkisi yok, service_role'de tetikleyici durdurur", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      await reddedilir(db, "update public.docentlik_faaliyetleri set owner_id = $1 where id = $2", [K.uye, R.faaliyet], /permission denied/);
      await reddedilir(db, "update public.docentlik_faaliyetleri set organization_id = $1 where id = $2", [AM2, R.faaliyet], /permission denied/);
      await reddedilir(db, "update public.docentlik_profilleri set owner_id = $1 where owner_id = $2", [K.uye, K.sahip], /sahibi değiştirilemez/);
      await rol(db, "service_role");
      await reddedilir(db, "update public.docentlik_faaliyetleri set owner_id = $1 where id = $2", [K.uye, R.faaliyet], /sahibi değiştirilemez/);
      await reddedilir(db, "update public.docentlik_faaliyetleri set organization_id = $1 where id = $2", [AM2, R.faaliyet], /kurumu değiştirilemez|foreign key|check constraint/);
    }));

  /*
    F6 PR8: sahip belge_yolu'nu hiç yazamıyor (sütun yetkisi kaldırıldı); yazım
    yalnızca service_role işleviyle. CHECK kısıtı ikinci kat olarak duruyor:
    RLS'i aşan service_role bile kuruma/sahibe/faaliyete bağlı olmayan yolu yazamaz.
  */
  test("belge yolu kurum + sahip + faaliyet kimliğine bağlı; başka bir yol yazılamaz", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      await reddedilir(db, "update public.docentlik_faaliyetleri set belge_yolu = $1 where id = $2",
        [`${AM}/faaliyet/${K.sahip}/${R.faaliyet}/b.pdf`, R.faaliyet], /permission denied/);
      await rol(db, "service_role");
      for (const yol of [
        `${AM2}/faaliyet/${K.sahip}/${R.faaliyet}/b.pdf`,
        `${AM}/faaliyet/${K.uye}/${R.faaliyet}/b.pdf`,
        `${AM}/faaliyet/${K.sahip}/${R.faaliyetIptal}/b.pdf`,
        `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/../../x.pdf`,
        `${AM}/uak/${R.faaliyet}/b.pdf`,
      ]) {
        await reddedilir(db, "update public.docentlik_faaliyetleri set belge_yolu = $1 where id = $2", [yol, R.faaliyet], /check constraint/);
      }
      const ok = await dene(db, "update public.docentlik_faaliyetleri set belge_yolu = $1 where id = $2 returning id",
        [`${AM}/faaliyet/${K.sahip}/${R.faaliyet}/b.pdf`, R.faaliyet]);
      assert.equal(ok.ok && ok.rows.length, 1);
    }));
});

describe("K5: ÜAK önerisi ve onayı yalnızca sunucudan", () => {
  test("yönetici durumu/öneriyi/onaylayanı yazamaz; meşru yükleme ve service_role yolu çalışır", () =>
    islem(db, async () => {
      await aktorOl(db, "yonetici");
      const yol = `${AM}/uak/00000000-0000-4000-8000-00000000d598/t.pdf`;
      await reddedilir(db,
        "insert into public.docentlik_uak_tablolari (organization_id, temel_alan, donem, depo_yolu, durum) values ($1, 'Hukuk', '2026', $2, 'onaylandi')",
        [AM, yol], /yalnızca sunucu/);
      const y = await tek(
        "insert into public.docentlik_uak_tablolari (organization_id, temel_alan, donem, depo_yolu, yukleyen) values ($1, 'Hukuk', '2026', $2, $3) returning yukleyen, durum",
        [AM, yol, K.uye]);
      assert.deepEqual(y, { yukleyen: K.yonetici, durum: "yuklendi" }, "yükleyen sunucuda damgalanmalı");
      await reddedilir(db, "update public.docentlik_uak_tablolari set oneri = '{}'::jsonb where id = $1", [R.uak], /yalnızca sunucu/);
      await reddedilir(db, "update public.docentlik_uak_tablolari set durum = 'onaylandi' where id = $1", [R.uak], /yalnızca sunucu/);
      await reddedilir(db, "update public.docentlik_uak_tablolari set depo_yolu = $1 where id = $2", [`${AM2}/uak/x/t.pdf`, R.uak], /check constraint/);
      await rol(db, "service_role");
      const s = await tek("update public.docentlik_uak_tablolari set oneri = '{\"kriterler\":[]}'::jsonb, durum = 'oneri_hazir' where id = $1 returning durum", [R.uak]);
      assert.equal(s.durum, "oneri_hazir");
    }));
});

describe("Gözetim için en az veri", () => {
  test("tumunu_gor profil tablosunu göremez; özet işlevi alanı ve 'tarih girildi mi'yi verir, tarihin kendisini vermez", () =>
    islem(db, async () => {
      await aktorOl(db, "gozetim");
      assert.equal(await sayi("select count(*)::int n from public.docentlik_profilleri"), 0);
      const ozet = (await db.query("select * from public.docentlik_profil_ozetleri($1)", [AM])).rows;
      assert.deepEqual(ozet, [{ owner_id: K.sahip, temel_alan: "Eğitim Bilimleri", alt_alan: null, doktora_tarihi_girildi: true }]);
      assert.ok(!Object.values(ozet[0]).some((v) => String(v).includes("2020")), "doktora tarihi sızdı");
      // Üyeliği iptal edilen kişinin faaliyeti kurumun kaydı olarak kalır; gözetim onu da görür (RLS ile aynı).
      const donem = (await db.query("select faaliyet_id, donem from public.docentlik_faaliyet_donemleri($1) order by faaliyet_id", [AM])).rows;
      assert.deepEqual(donem, [{ faaliyet_id: R.faaliyet, donem: "sonra" }, { faaliyet_id: R.faaliyetIptal, donem: "bilinmiyor" }]);
    }));

  test("yetkisiz üye ve yabancı özet işlevlerinden bir şey alamaz; sahip yalnızca kendi dönemini görür; anon çalıştıramaz", () =>
    islem(db, async () => {
      for (const aktor of ["uye", "yonetici", "yabanci", "sahip"]) {
        await aktorOl(db, aktor);
        assert.equal((await db.query("select * from public.docentlik_profil_ozetleri($1)", [AM])).rows.length, 0, aktor);
      }
      await aktorOl(db, "sahip");
      assert.deepEqual((await db.query("select faaliyet_id, donem from public.docentlik_faaliyet_donemleri($1)", [AM])).rows,
        [{ faaliyet_id: R.faaliyet, donem: "sonra" }]);
      await aktorOl(db, "uye");
      assert.equal((await db.query("select * from public.docentlik_faaliyet_donemleri($1)", [AM])).rows.length, 0);
      await aktorOl(db, "anon");
      await reddedilir(db, "select * from public.docentlik_profil_ozetleri($1)", [AM], /permission denied/);
      await reddedilir(db, "select * from public.docentlik_faaliyet_donemleri($1)", [AM], /permission denied/);
    }));

  test("dönem kuralı çekirdekle aynı: aynı gün 'sonra' değil, tarihsiz 'bilinmiyor'", () =>
    islem(db, async () => {
      await aktorOl(db, "sahip");
      const ekle = async (tarih) => (await tek(
        "insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title, faaliyet_tarihi) values ($1, $2, $3, 'x', $4) returning id",
        [AM, K.sahip, R.kriter, tarih])).id;
      const ayniGun = await ekle("2020-06-15");
      const tarihsiz = await ekle(null);
      const once = await ekle("2019-01-01");
      const harita = Object.fromEntries((await db.query("select faaliyet_id, donem from public.docentlik_faaliyet_donemleri($1)", [AM])).rows.map((r) => [r.faaliyet_id, r.donem]));
      assert.deepEqual([harita[ayniGun], harita[tarihsiz], harita[once]], ["once", "bilinmiyor", "once"]);
    }));
});

describe("Fonksiyon yetkileri", () => {
  test("anon hiçbir Doçentlik işlevini çalıştıramaz; iç yardımcılar ve tetikleyiciler kimseye açık değil", async () => {
    await rol(db, "postgres");
    const yetki = async (r, f) => (await tek("select has_function_privilege($1, $2, 'execute') as v", [r, f])).v;
    const tumu = (await db.query(
      `select p.oid::regprocedure::text as imza from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where (n.nspname = 'private' and p.proname like 'docentlik\\_%') or (n.nspname = 'public' and p.proname like 'docentlik\\_%')`)).rows.map((r) => r.imza);
    assert.ok(tumu.length >= 9, `işlev listesi eksik: ${tumu}`);
    for (const f of tumu) assert.equal(await yetki("anon", f), false, `anon: ${f}`);
    for (const f of ["private.docentlik_js_round(double precision)", "private.docentlik_yuvarla(double precision)",
      "private.docentlik_paylasim(numeric,numeric,boolean,integer,boolean)", "private.docentlik_sayi(double precision)",
      "private.docentlik_kimlik_koru()", "private.docentlik_faaliyet_puani()", "private.docentlik_uak_koru()"]) {
      assert.equal(await yetki("authenticated", f), false, `authenticated: ${f}`);
      assert.equal(await yetki("service_role", f), false, `service_role: ${f}`);
    }
    assert.equal(await yetki("authenticated", "private.docentlik_yetkisi(uuid,text)"), true, "RLS yardımcısı politikada kullanılıyor");
  });
});

/*
  YETKİ ANAHTARI KAPSAMI (güvenlik incelemesi, 14.11.2026).
  private.docentlik_yetkisi yalnızca üç Doçentlik anahtarıyla çalışır.
  Başka bir modülün yeteneği, yazımı benzeyen bir anahtar ya da başka bir
  kurumda verilmiş yetki Doçentlik erişimi SAĞLAMAZ.
*/
describe("Yetki anahtarı kapsamı", () => {
  const yetki = async (org, anahtar) => (await tek("select private.docentlik_yetkisi($1, $2) as v", [org, anahtar])).v;

  test("Kurum Sahibi istisnası yalnızca tanımlı üç anahtarda: bilinmeyen ve başka modülün anahtarı HAYIR", () =>
    islem(db, async () => {
      await aktorOl(db, "kurumSahibi");
      for (const a of ["docentlik.tumunu_gor", "docentlik.kriter_yonet", "docentlik.uak_yonet"]) assert.equal(await yetki(AM, a), true, a);
      for (const a of ["crm.teklif.sil", "crm.kayit.ata", "settings.yetki.yonet", "docentlik.bilinmeyen", "docentlik.*", "", "Docentlik.tumunu_gor"]) {
        assert.equal(await yetki(AM, a), false, `owner + '${a}'`);
      }
      assert.equal(await yetki(AM, null), false, "NULL anahtar");
    }));

  test("başka modülün yeteneği ya da yazımı benzeyen anahtar, kurumca 'izinli' yazılmış olsa bile erişim vermez", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query(
        `insert into public.member_capability_permissions (organization_id, user_id, capability_key, allowed, updated_at) values
           ($1, $2, 'crm.kayit.ata', true, now()), ($1, $2, 'crm.teklif.sil', true, now()),
           ($1, $2, 'Docentlik.tumunu_gor', true, now()), ($1, $2, ' docentlik.tumunu_gor', true, now()),
           ($1, $2, 'docentlik.tumunu_gor ', true, now()), ($1, $2, 'docentlik.tumunu_gör', true, now())`,
        [AM, K.uye]);
      await db.query(
        "insert into public.role_capability_permissions (organization_id, role, capability_key, allowed, updated_at) values ($1, 'member', 'operations.is.sil', true, now())",
        [AM]);
      await aktorOl(db, "uye");
      assert.equal(await gorur(R.faaliyet), 0, "başka bir anahtar faaliyetleri açtı");
      assert.equal((await db.query("select * from public.docentlik_profil_ozetleri($1)", [AM])).rows.length, 0);
      await reddedilir(db, "insert into public.docentlik_kriterleri (organization_id, code, label) values ($1, 'X', 'x')", [AM], /row-level security/);
      for (const a of ["crm.kayit.ata", "Docentlik.tumunu_gor", " docentlik.tumunu_gor", "docentlik.tumunu_gor ", "docentlik.tumunu_gör", "operations.is.sil"]) {
        assert.equal(await yetki(AM, a), false, `'${a}'`);
      }
      assert.equal(await yetki(AM, "docentlik.tumunu_gor"), false, "doğru anahtar hiç verilmedi");
    }));

  test("yetki kuruma bağlı: başka kurumda verilen tumunu_gor bu kurumda geçmez", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query("insert into public.organization_memberships (organization_id, user_id, role, is_active) values ($1, $2, 'member', true)", [AM, K.yabanci]);
      await db.query(
        "insert into public.member_capability_permissions (organization_id, user_id, capability_key, allowed, updated_at) values ($1, $2, 'docentlik.tumunu_gor', true, now())",
        [AM2, K.yabanci]);
      await aktorOl(db, "yabanci");
      assert.equal(await yetki(AM2, "docentlik.tumunu_gor"), true, "kendi kurumunda (owner) yetkili");
      assert.equal(await yetki(AM, "docentlik.tumunu_gor"), false, "başka kurumdaki yetki bu kurumda geçti");
      assert.equal(await gorur(R.faaliyet), 0);
    }));

  test("korunan davranışlar: iptal edilmiş üyede owner bile değil, kişi kuralı rolü ezer, varsayılan HAYIR", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      // İptal edilmiş Kurum Sahibi: istisna da düşer.
      await db.query("update public.organization_memberships set is_active = false where organization_id = $1 and user_id = $2", [AM, K.kurumSahibi]);
      await aktorOl(db, "kurumSahibi");
      assert.equal(await yetki(AM, "docentlik.tumunu_gor"), false);
      await rol(db, "authenticated", K.gozetimKapali);
      assert.equal(await yetki(AM, "docentlik.tumunu_gor"), false, "kişi kuralı (false) rol kuralını (true) ezmeli");
      await aktorOl(db, "gozetim");
      assert.equal(await yetki(AM, "docentlik.tumunu_gor"), true, "rol kuralı çalışmalı");
      assert.equal(await yetki(AM, "docentlik.kriter_yonet"), false, "kural yoksa varsayılan HAYIR");
    }));
});
