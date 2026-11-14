/*
  DOÇENTLİK: NAVİGASYON VE YETKİLENDİRME ENTEGRASYONU (F6 PR4).

  Sınananlar:
   - Yetki kataloğu: üç anahtar, varsayılanı boş, kuruma özel grup.
   - Kuruma özel grup yalnızca modülü açık kurumda görünür; öteki
     grupların görünürlüğü DEĞİŞMEDİ (Analitik grubu modülü olmayan
     kurumda da görünmeye devam ediyor — bugünkü davranış).
   - Kurum Sahibi istisnası korunuyor, ama modülü olmayan kurumda Kurum
     Sahibi de Doçentlik yetkisi taşımıyor.
   - Katalogdaki anahtarlar veritabanının kabul ettiği anahtarlarla aynı
     (private.docentlik_yetkisi): iki liste sapmasın.
   - Dock/mobil menü, yol eşlemesi ve sayfa adı; mevcut modüllerin sırası
     ve görünürlüğü değişmedi.
   - Sayfa ve kaydetme işlemleri kapıyı gerçekten çağırıyor (kaynak
     denetimi: bu dosyalar Next'e bağlı olduğu için birim testinde
     çalıştırılamıyor).
*/
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  KURUMA_OZEL_YETKILER, TUM_YETKILER, YETKI_GRUPLARI, etkinYetkiler, gorunurYetkiAnahtarlari,
  gorunurYetkiGruplari, kurumaOzelYetkileriSuz, yetkiTanimi,
} from "@/lib/yetkiler";
import { docentlikBolumleri } from "@/lib/docentlik-erisim";
import { mobilAltCubuk, osUygulamalari } from "@/app/panel/os/os-apps";
import { moduleKeysForPath, modulesKeyForPath, PERMISSION_MODULES } from "@/lib/role-permissions";
import { panelSayfaAdi } from "@/lib/panel-sayfa-adi";

const KOK = path.resolve(import.meta.dirname, "../..");
const oku = (yol: string) => fs.readFileSync(path.join(KOK, yol), "utf8");
const ANAHTARLAR = ["docentlik.tumunu_gor", "docentlik.kriter_yonet", "docentlik.uak_yonet"];
const CEKIRDEK = ["crm", "operations", "finance", "hr", "documents"];

describe("yetki kataloğu", () => {
  test("üç anahtar, tek grupta, varsayılanı boş, RLS'e bağlı değil", () => {
    const grup = YETKI_GRUPLARI.find((g) => g.id === "docentlik");
    assert.ok(grup);
    assert.equal(grup.kurumaOzel, true);
    assert.equal(grup.modul, "docentlik");
    assert.deepEqual(grup.yetkiler.map((y) => y.key), ANAHTARLAR);
    for (const key of ANAHTARLAR) {
      const t = yetkiTanimi(key);
      assert.deepEqual(t?.varsayilan, [], `${key}: varsayılan boş olmalı (veritabanı varsayılanı bilmiyor)`);
      assert.equal(t?.rlsBagli, undefined, key);
    }
    assert.deepEqual([...KURUMA_OZEL_YETKILER].sort(), [...ANAHTARLAR].sort());
  });

  test("katalog ↔ veritabanı: private.docentlik_yetkisi tam olarak bu üç anahtarı kabul ediyor", () => {
    const sql = oku("supabase/migrations/20261114200939_docentlik_sema_rls.sql");
    const govde = sql.slice(sql.indexOf("create or replace function private.docentlik_yetkisi"));
    const liste = govde.match(/p_key in \(([^)]*)\)/);
    assert.ok(liste, "işlevde anahtar listesi bulunamadı");
    const dbAnahtarlari = [...liste[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(dbAnahtarlari, [...ANAHTARLAR].sort());
    // Politikalarda kullanılan her docentlik.* anahtarı katalogda olmalı.
    for (const m of sql.matchAll(/'(docentlik\.[a-z_]+)'/g)) assert.ok(ANAHTARLAR.includes(m[1]), `politikada katalog dışı anahtar: ${m[1]}`);
  });
});

describe("kuruma özel grup görünürlüğü", () => {
  test("modülü açık olmayan kurumda Doçentlik grubu ve anahtarları yok", () => {
    for (const moduller of [[], CEKIRDEK, [...CEKIRDEK, "analitik"], ["docentlikx"], ["DOCENTLIK"]]) {
      assert.ok(!gorunurYetkiGruplari(moduller).some((g) => g.id === "docentlik"), JSON.stringify(moduller));
      for (const key of ANAHTARLAR) assert.ok(!gorunurYetkiAnahtarlari(moduller).has(key));
    }
  });

  test("modülü açık kurumda grup görünür", () => {
    assert.ok(gorunurYetkiGruplari([...CEKIRDEK, "docentlik"]).some((g) => g.id === "docentlik"));
  });

  test("öteki grupların görünürlüğü DEĞİŞMEDİ: modülden bağımsız hepsi görünür", () => {
    const beklenen = YETKI_GRUPLARI.filter((g) => g.id !== "docentlik").map((g) => g.id);
    assert.deepEqual(gorunurYetkiGruplari([]).map((g) => g.id), beklenen);
    assert.deepEqual(gorunurYetkiGruplari(["crm"]).map((g) => g.id), beklenen);
    assert.ok(beklenen.includes("analitik"), "Analitik grubu modülü olmayan kurumda da görünmeye devam etmeli");
    // Doçentlik dışındaki her anahtar her kurumda yazılabilir kalır.
    const acik = gorunurYetkiAnahtarlari([]);
    for (const y of TUM_YETKILER) if (!ANAHTARLAR.includes(y.key)) assert.ok(acik.has(y.key), y.key);
  });

  test("modül erişim matrisi (PERMISSION_MODULES) değişmedi: Doçentlik orada YOK", () => {
    assert.ok(!PERMISSION_MODULES.some((m) => (m.key as string) === "docentlik"),
      "hazır yetki profilleri bu listeyi her kişiye yazıyor; Doçentlik eklenirse bütün kurumlara satır yazılır");
  });
});

describe("Kurum Sahibi istisnası ve modül süzgeci", () => {
  test("Kurum Sahibi modülü açık kurumda üç yetkiye de sahip", () => {
    const y = kurumaOzelYetkileriSuz(etkinYetkiler({ rol: "owner" }), [...CEKIRDEK, "docentlik"]);
    for (const key of ANAHTARLAR) assert.ok(y.has(key), key);
  });

  test("modülü olmayan kurumda Kurum Sahibi de Doçentlik yetkisi taşımıyor; öteki yetkileri aynen kalıyor", () => {
    const tam = etkinYetkiler({ rol: "owner" });
    const suzulmus = kurumaOzelYetkileriSuz(tam, CEKIRDEK);
    for (const key of ANAHTARLAR) assert.ok(!suzulmus.has(key), key);
    assert.deepEqual([...suzulmus].sort(), [...tam].filter((k) => !ANAHTARLAR.includes(k)).sort());
  });

  test("varsayılan HAYIR: kural yazılmamış admin/manager/member hiçbir Doçentlik yetkisi taşımıyor", () => {
    for (const rol of ["admin", "manager", "member", "operasyoncu"]) {
      const y = kurumaOzelYetkileriSuz(etkinYetkiler({ rol }), ["docentlik"]);
      for (const key of ANAHTARLAR) assert.ok(!y.has(key), `${rol}: ${key}`);
    }
  });

  test("rol kuralı açar, kişi kuralı rolü ezer; başka modülün anahtarı açmaz", () => {
    const rolKurallari = [{ capability_key: "docentlik.tumunu_gor", allowed: true }];
    assert.ok(etkinYetkiler({ rol: "admin", rolKurallari }).has("docentlik.tumunu_gor"));
    assert.ok(!etkinYetkiler({ rol: "admin", rolKurallari, kisiKurallari: [{ capability_key: "docentlik.tumunu_gor", allowed: false }] }).has("docentlik.tumunu_gor"));
    const yabanci = etkinYetkiler({ rol: "member", kisiKurallari: [{ capability_key: "crm.kayit.ata", allowed: true }, { capability_key: "Docentlik.tumunu_gor", allowed: true }] });
    for (const key of ANAHTARLAR) assert.ok(!yabanci.has(key), key);
  });

  test("kişide gizlenen Doçentlik modülü yetkileri de kapatır (katalog kuralı 2)", () => {
    const y = etkinYetkiler({ rol: "admin", gizliModuller: new Set(["docentlik"]), rolKurallari: [{ capability_key: "docentlik.kriter_yonet", allowed: true }] });
    assert.ok(!y.has("docentlik.kriter_yonet"));
  });
});

describe("Doçentlik giriş sayfasının bölümleri", () => {
  const izinKumesi = (anahtarlar: string[]) => (key: string) => anahtarlar.includes(key);
  test("her üye yalnızca kendi bölümünü görür", () => {
    assert.deepEqual(docentlikBolumleri(izinKumesi([])).map((b) => b.key), ["faaliyetlerim"]);
    assert.deepEqual(docentlikBolumleri(izinKumesi(["crm.kayit.ata", "analitik.gor"])).map((b) => b.key), ["faaliyetlerim"]);
  });
  test("her yetki yalnızca kendi bölümünü açar", () => {
    assert.deepEqual(docentlikBolumleri(izinKumesi(["docentlik.tumunu_gor"])).map((b) => b.key), ["faaliyetlerim", "kurum"]);
    assert.deepEqual(docentlikBolumleri(izinKumesi(["docentlik.kriter_yonet"])).map((b) => b.key), ["faaliyetlerim", "kriterler"]);
    assert.deepEqual(docentlikBolumleri(izinKumesi(["docentlik.uak_yonet"])).map((b) => b.key), ["faaliyetlerim", "uak"]);
    assert.deepEqual(docentlikBolumleri(izinKumesi(ANAHTARLAR)).map((b) => b.key), ["faaliyetlerim", "kurum", "kriterler", "uak"]);
  });
});

describe("navigasyon", () => {
  const cekirdekModuller = CEKIRDEK.map((code) => ({ code, name: code }));
  const docentlikli = [...cekirdekModuller, { code: "docentlik", name: "Doçentlik" }];

  test("modülü açık olmayan kurumda (izin listesi dışı ya da kapalı) dock'ta Doçentlik yok", () => {
    for (const role of ["owner", "admin", "member"]) {
      assert.ok(!osUygulamalari({ modules: cekirdekModuller, role }).some((u) => u.key === "docentlik"), role);
    }
  });

  test("modülü açık kurumda dock'ta; adres ve ikon doğru", () => {
    const app = osUygulamalari({ modules: docentlikli, role: "member" }).find((u) => u.key === "docentlik");
    assert.ok(app);
    assert.equal(app.href, "/panel/docentlik");
    assert.equal(app.ikon, "docentlik");
    assert.ok(app.yollar.includes("/panel/docentlik"));
  });

  test("rolde/kişide gizlenen modül görünmez; Kurum Sahibi hiç kısıtlanmaz", () => {
    const gizli = new Set(["docentlik"]);
    assert.ok(!osUygulamalari({ modules: docentlikli, role: "admin", hiddenModuleKeys: gizli }).some((u) => u.key === "docentlik"));
    assert.ok(osUygulamalari({ modules: docentlikli, role: "owner", hiddenModuleKeys: gizli }).some((u) => u.key === "docentlik"));
  });

  test("mevcut uygulamaların sırası ve mobil alt çubuk değişmedi", () => {
    const once = osUygulamalari({ modules: cekirdekModuller, role: "admin" }).map((u) => u.key);
    const sonra = osUygulamalari({ modules: docentlikli, role: "admin" }).map((u) => u.key).filter((k) => k !== "docentlik");
    assert.deepEqual(sonra, once);
    const mobilOnce = mobilAltCubuk(osUygulamalari({ modules: cekirdekModuller, role: "admin" })).birincil.map((u) => u.key);
    const mobilSonra = mobilAltCubuk(osUygulamalari({ modules: docentlikli, role: "admin" }));
    assert.deepEqual(mobilSonra.birincil.map((u) => u.key), mobilOnce, "Doçentlik telefonda öne çıkan dört girişi değiştirmemeli");
    assert.ok(mobilSonra.digerleri.some((u) => u.key === "docentlik"), "telefonda 'Daha fazla'da olmalı");
  });

  test("yol eşlemesi ve sayfa adı", () => {
    assert.equal(modulesKeyForPath("/panel/docentlik"), "docentlik");
    assert.deepEqual(moduleKeysForPath("/panel/docentlik/kriterler"), ["docentlik"]);
    assert.equal(panelSayfaAdi("/panel/docentlik")?.ad, "Doçentlik");
  });
});

describe("kapılar kaynakta (Next'e bağlı dosyalar)", () => {
  test("rota yerleşimi modül kapısını ve kişi/rol gizlemesini çağırıyor; çökme değil yönlendirme", () => {
    const yerlesim = oku("app/panel/docentlik/layout.tsx");
    assert.match(yerlesim, /modulGerek\(modules, "docentlik"\)/);
    assert.match(yerlesim, /isNavigationGroupHiddenForRole\(membership\.role, "docentlik", hiddenModuleKeys\)/);
    assert.ok(!/assertModuleAccess\(/.test(yerlesim), "fırlatan kapı üretimde 'Bir sorun oluştu' ekranı verir");
  });

  test("giriş sayfası Doçentlik tablolarını okumuyor (veri ekranları sonraki PR'da, RLS'in arkasında)", () => {
    const sayfa = oku("app/panel/docentlik/page.tsx");
    assert.ok(!/\.from\(|\.rpc\(|createAdminClient/.test(sayfa));
  });

  test("Yetkilendirme ekranı ve kişi yetkileri yalnızca görünür grupları çiziyor", () => {
    for (const dosya of ["app/panel/settings/permissions/page.tsx", "app/panel/settings/permissions/kisi-yetkileri.tsx"]) {
      const metin = oku(dosya);
      assert.match(metin, /gorunurYetkiGruplari\(modules\.map/, dosya);
      assert.ok(!/YETKI_GRUPLARI\.(map|find|filter)\(/.test(metin), `${dosya} süzülmemiş katalogu çiziyor`);
    }
  });

  test("kaydetme işlemleri: grup kapısı, kişi istisnasında görünür anahtarlar, profilde kuruma özel anahtarlara dokunmama", () => {
    const islem = oku("app/panel/settings/permissions/actions.ts");
    assert.match(islem, /gorunurYetkiGruplari\(modules\.map\(\(modul\) => modul\.code\)\)\.some\(\(grup\) => grup\.id === grupId\)/);
    assert.match(islem, /\.filter\(\(yetki\) => gorunurAnahtarlar\.has\(yetki\.key\)\)/);
    assert.match(islem, /\[\.\.\.gorunurAnahtarlar\]\.filter/);
    assert.match(islem, /!KURUMA_OZEL_YETKILER\.has\(key\)/);
  });

  test("panel bağlamı yetki kümesini kuruma özel modüle göre süzüyor", () => {
    assert.match(oku("lib/panel-context.ts"), /yetkiler = kurumaOzelYetkileriSuz\(yetkiler, modules\.map/);
  });
});
