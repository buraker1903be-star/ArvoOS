/*
  DOÇENTLİK SUNUCU İŞLEMLERİNİN SÖZLEŞMESİ (F6 PR5) — kaynak denetimi.

  app/panel/docentlik/actions.ts ve veri.ts Next'e ve Supabase'e bağlı;
  birim testinde çalıştırılamıyorlar. Kararlar lib/docentlik-islem.ts'te
  (ayrı testli), veritabanı tarafı tests/db/docentlik-sunucu-islemleri'nde.
  Burada işlem dosyasının o kararları gerçekten çağırdığı ve güvenlik
  kurallarını çiğnemediği sınanıyor:
   - her dışa açık işlem runPanelAction ile sarılı, her gövde
     docentlikBaglami() ile başlıyor;
   - yönetim işlemleri doğru yetenek anahtarını soruyor;
   - service_role yok; kurum/sahip ve puan istemciden alınmıyor;
   - yazmalar "returning" ile; tek kova Doçentlik kovası;
   - ÜAK onayı veritabanına dokunmadan reddediyor.
*/
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import fs from "node:fs";
import path from "node:path";

const KOK = path.resolve(import.meta.dirname, "../..");
const oku = (yol: string) => fs.readFileSync(path.join(KOK, yol), "utf8");
const ISLEM = oku("app/panel/docentlik/actions.ts");
const VERI = oku("app/panel/docentlik/veri.ts");
const BAGLAM = oku("app/panel/docentlik/baglam.ts");

/** `async function ad__impl(...) { … }` gövdeleri (bir sonraki üst düzey işleve kadar). */
function govdeler(kaynak: string): Map<string, string> {
  const sonuc = new Map<string, string>();
  const desen = /^async function (\w+)__impl\(/gm;
  const yerler = [...kaynak.matchAll(desen)].map((m) => ({ ad: m[1], bas: m.index! }));
  yerler.forEach((y, i) => sonuc.set(y.ad, kaynak.slice(y.bas, yerler[i + 1]?.bas ?? kaynak.length)));
  return sonuc;
}
const GOVDELER = govdeler(ISLEM);
const DISA_ACIK = [...ISLEM.matchAll(/^export async function (\w+)\(/gm)].map((m) => m[1]);

describe("işlem dosyası", () => {
  test("'use server'; dışa açık her işlemin bir __impl gövdesi var ve runPanelAction ile sarılı", () => {
    assert.ok(ISLEM.startsWith('"use server";'));
    assert.ok(DISA_ACIK.length >= 18, `beklenenden az işlem: ${DISA_ACIK.join(", ")}`);
    for (const ad of DISA_ACIK) {
      assert.ok(GOVDELER.has(ad), `${ad}: gövde yok`);
      assert.match(ISLEM, new RegExp(`export async function ${ad}\\([^)]*\\) \\{ return runPanelAction\\(\\(\\) => ${ad}__impl\\(`), `${ad}: runPanelAction yok`);
    }
    // "use server" dosyasında dışa açık her şey bir uç nokta: yardımcı ya da sabit dışa açılmamalı.
    assert.deepEqual([...ISLEM.matchAll(/^export (?!async function)(\w+)/gm)].map((m) => m[0]), []);
  });

  test("her gövde docentlikBaglami() ile başlıyor (oturum + modül + kişide gizleme)", () => {
    for (const [ad, govde] of GOVDELER) {
      const ilkSatirlar = govde.split("\n").slice(1, 3).join("\n");
      assert.match(ilkSatirlar, /const b = await docentlikBaglami\(\);/, `${ad}: kapı ilk iş değil`);
    }
  });

  test("yönetim işlemleri doğru yetenek anahtarını soruyor", () => {
    const KRITER = ["kriterEkle", "kriterDuzenle", "kriterSil", "hedefKaydet", "hedefSil"];
    const UAK = ["uakYuklemeHazirla", "uakKaydet", "uakAdresi", "uakSil", "uakOnayla"];
    for (const ad of KRITER) assert.match(GOVDELER.get(ad)!, /yetkiGerekli\(b, "docentlik\.kriter_yonet"/, ad);
    for (const ad of UAK) assert.match(GOVDELER.get(ad)!, /yetkiGerekli\(b, "docentlik\.uak_yonet"/, ad);
    // Faaliyet, profil ve belge işlemleri kişinin kendi verisi: yetenek değil üyelik + sahiplik (owner_id = oturum).
    for (const ad of ["faaliyetDuzenle", "faaliyetSil", "belgeKaydet", "belgeKaldir"]) assert.match(GOVDELER.get(ad)!, /owner_id", b\.ben\)|kendiFaaliyetim\(b,/, ad);
  });

  test("service_role yok; kurum ve sahip yalnızca oturumdan", () => {
    for (const kaynak of [ISLEM, VERI, BAGLAM]) {
      // Yorumlar "service_role YOK" diyebilir; bakılan kod: içe aktarma ve ortam değişkeni.
      assert.ok(!/import[^;]*\b(createAdminClient|createServiceClient)\b/.test(kaynak), "service_role istemcisi içe aktarılıyor");
      assert.ok(!/process\.env\.[A-Z_]*SERVICE/.test(kaynak), "service_role anahtarı okunuyor");
      assert.ok(!/formData\.get\("(organization_id|owner_id|kurum|kullanici|user_id)"\)/.test(kaynak), "kimlik formdan okunuyor");
    }
    assert.match(BAGLAM, /kurum: baglam\.membership\.organization_id, ben: baglam\.userId/);
  });

  test("puan istemciden okunmuyor ve yazılmıyor; beklenen çekirdekten, karşılaştırma yazımla aynı RPC'de", () => {
    assert.ok(!/computed_points\s*:/.test(ISLEM), "computed_points yazılıyor");
    assert.ok(!/paylasim_katsayisi\s*:|kural_surumu\s*:/.test(ISLEM));
    assert.ok(!/formData\.get\("(computed_points|puan|paylasim_katsayisi|beklenen\w*)"\)/.test(ISLEM));
    for (const [ad, hesap, rpc] of [
      ["faaliyetEkle", /beklenenEklemePuani\(yazim, kriter\)/, "docentlik_faaliyet_ekle"],
      ["faaliyetDuzenle", /beklenenDuzenlemePuani\(mevcut, yazim, kriter\)/, "docentlik_faaliyet_duzenle"],
    ] as const) {
      const g = GOVDELER.get(ad)!;
      assert.match(g, new RegExp(`${hesap.source}[\\s\\S]*\\.rpc\\("${rpc}"`), `${ad}: beklenen hesaplanıp RPC'ye verilmiyor`);
      assert.match(g, /p_beklenen_puan: beklenen\.puan, p_beklenen_katsayi: beklenen\.katsayi, p_beklenen_surum: beklenen\.surum/, ad);
    }
  });

  test("faaliyet ekleme/düzenleme tabloya DOĞRUDAN yazmıyor ve telafi silmesi yok (atomiklik RPC'de)", () => {
    for (const ad of ["faaliyetEkle", "faaliyetDuzenle"]) {
      const g = GOVDELER.get(ad)!;
      assert.ok(!/\.(insert|update|upsert|delete)\(/.test(g), `${ad}: ayrı HTTP çağrısıyla yazıyor`);
    }
    assert.ok(!/puanDogrulandiMi/.test(ISLEM), "yazımdan SONRA doğrulama (eski, atomik olmayan yol) geri gelmiş");
    assert.match(ISLEM, /const PUAN_UYUSMAZLIGI = "DP001"/);
    assert.match(ISLEM, /error\.code === PUAN_UYUSMAZLIGI/);
  });

  test("yazmalar returning ile (sıfır satır başarı sayılmaz)", () => {
    const yazmalar = [...ISLEM.matchAll(/\.(insert|update|upsert|delete)\(/g)].length;
    const returning = [...ISLEM.matchAll(/\.(insert|update|upsert|delete)\([\s\S]{0,400}?\.select\(/g)].length;
    // Eski tek istisna (eklemede telafi silmesi) RPC'ye geçince kalktı.
    assert.equal(yazmalar - returning, 0, `returning'siz yazma sayısı ${yazmalar - returning}`);
  });

  test("tek kova; yol sunucuda kuruluyor ve kayıtta yeniden doğrulanıyor; telafi silmesi var", () => {
    const kovalar = [...ISLEM.matchAll(/storage\.from\(([^)]+)\)/g)].map((m) => m[1]);
    assert.ok(kovalar.length > 0 && kovalar.every((k) => k === "DOCENTLIK_KOVASI"), kovalar.join(","));
    assert.match(GOVDELER.get("belgeYuklemeHazirla")!, /faaliyetBelgeYolu\(b\.kurum, b\.ben, faaliyetId, crypto\.randomUUID\(\)\)/);
    assert.match(GOVDELER.get("belgeKaydet")!, /if \(!faaliyetBelgeYoluMu\(yol, b\.kurum, b\.ben, id\)\) throw/);
    assert.match(GOVDELER.get("belgeKaydet")!, /catch \(hata\) \{\s*await nesneyiSil\(b, yol/);
    assert.match(GOVDELER.get("uakKaydet")!, /if \(!uakBelgeYoluMu\(yol, b\.kurum\)\) throw/);
    assert.match(GOVDELER.get("uakKaydet")!, /catch \(hata\) \{\s*await nesneyiSil\(b, yol/);
    assert.match(ISLEM, /createSignedUrl\([^,]+, IMZALI_ADRES_SANIYE\)/);
    assert.match(ISLEM, /async function nesneyiDogrula[\s\S]*depoNesnesiUygunMu[\s\S]*pdfMi/);
  });

  test("silmede önce kayıt, sonra nesne (tersi kaydı yok bir belgeye bağlı bırakırdı)", () => {
    for (const ad of ["faaliyetSil", "belgeKaldir", "uakSil"]) {
      const g = GOVDELER.get(ad)!;
      // HER çağrı kayıttan sonra: yalnızca ilkine bakan sürüm, öne eklenen
      // ikinci bir silmeyi görmüyordu (mutasyon denemesi M11).
      const kayit = g.search(/\.(delete|update)\(/);
      assert.ok(kayit > 0, `${ad}: kayıt yazımı yok`);
      const cagrilar = [...g.matchAll(/nesneyiSil\(/g)].map((m) => m.index!);
      assert.ok(cagrilar.length > 0, `${ad}: nesne silinmiyor`);
      for (const i of cagrilar) assert.ok(i > kayit, `${ad}: nesne kayıttan önce siliniyor`);
    }
  });

  test("çift gönderim: istek anahtarı RPC'ye gidiyor; düzenleme sürüm ZORUNLU, iyimser eşzamanlı", () => {
    assert.match(GOVDELER.get("faaliyetEkle")!, /p_istek_anahtari: istekAnahtari/);
    const d = GOVDELER.get("faaliyetDuzenle")!;
    assert.match(d, /if \(!surum\) throw/);
    assert.match(d, /\.eq\("updated_at", surum\)/, "beklenen puan okunan sürüme göre hesaplanmalı");
    assert.match(d, /p_surum: surum/);
    assert.match(d, /if \(!sonuc\?\.guncellendi\) return ayniIstekMi\(/);
  });

  test("ÜAK onayı veritabanına dokunmadan reddediyor", () => {
    const g = GOVDELER.get("uakOnayla")!;
    assert.match(g, /uakOnayKarari\(\)/);
    assert.match(g, /throw new Error\(karar\.neden\)/);
    assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(g));
  });
});

describe("okuma ve bağlam dosyaları", () => {
  test("veri.ts ve baglam.ts 'use server' DEĞİL, istemciye girmez (server-only)", () => {
    for (const kaynak of [VERI, BAGLAM]) {
      assert.ok(!/^\s*["']use server["'];?\s*$/m.test(kaynak), "yönerge olarak 'use server' var");
      assert.ok(kaynak.startsWith('import "server-only";'));
    }
  });

  test("okumalar hata yutmuyor; tumunu_gor ve uak_yonet soruluyor; doktora tarihi gözetim yolundan dönmüyor", () => {
    const okumalar = [...VERI.matchAll(/const \{ data[^}]*error[^}]*\} = await/g)].length + [...VERI.matchAll(/await Promise\.all\(/g)].length;
    assert.ok(okumalar > 0);
    assert.ok([...VERI.matchAll(/okunamadiysaFirlat\(/g)].length >= 10);
    assert.match(VERI, /export async function kurumFaaliyetleri[\s\S]*?yetkiGerekli\(b, "docentlik\.tumunu_gor"/);
    assert.match(VERI, /export async function kisiOzeti[\s\S]*?yetkiGerekli\(b, "docentlik\.tumunu_gor"/);
    assert.match(VERI, /export async function uakTablolari[\s\S]*?yetkiGerekli\(b, "docentlik\.uak_yonet"/);
    const kisi = VERI.slice(VERI.indexOf("export async function kisiOzeti"), VERI.indexOf("export async function profilim"));
    assert.ok(!/docentlik_profilleri|doktora_tarihi[^_]/.test(kisi), "gözetim yolu profil tablosunu/doktora tarihini okuyor");
  });

  test("özet okuması satır tavanına çarpmıyor: sayfa sayfa bütün faaliyetler", () => {
    assert.match(VERI, /for \(let bas = 0; ; bas \+= SAYFA\)[\s\S]*if \(\(data\?\.length \?\? 0\) < SAYFA\) return satirlar;/);
  });
});
