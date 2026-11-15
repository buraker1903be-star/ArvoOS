/*
  DOÇENTLİK YÖNETİM EKRANLARININ SÖZLEŞMESİ (F6 PR6b) — kaynak denetimi.

  Ekranlar Next'e ve Supabase'e bağlı; birim testinde çizilemiyorlar.
  Kararlar lib/docentlik-gorunum.ts'te (ayrı testli), yetki ve yazma
  kuralları PR5'in sunucu işlemlerinde ve RLS'te. Burada ekranların:
   - yetki yoksa veri OKUMADAN kapalı durum çizdiği;
   - gözetimin SALT OKUNUR kaldığı (yazma işlemi yok, doktora tarihi yok);
   - belge akışının sunucunun ürettiği yolu kullandığı (istemci yol seçmiyor),
     imzalı adresin kalıcı bir bağlantıya dönüşmediği;
   - ÜAK önerisinin içeriğinin gösterilmediği, onayın kapalı ve nedeniyle
     göründüğü;
   - formların hatada sıfırlanmadığı (onSubmit + kilit)
  sınanıyor.
*/
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import fs from "node:fs";
import path from "node:path";

const KOK = path.resolve(import.meta.dirname, "../..");
const oku = (yol: string) => fs.readFileSync(path.join(KOK, yol), "utf8");
const DIZIN = "app/panel/docentlik";
const KURUM = oku(`${DIZIN}/kurum/page.tsx`);
const KISI = oku(`${DIZIN}/kurum/[kisi]/page.tsx`);
const KRITER = oku(`${DIZIN}/kriterler/page.tsx`);
const UAK = oku(`${DIZIN}/uak/page.tsx`);
const BELGE = oku(`${DIZIN}/belge.tsx`);
const ISLEM = oku(`${DIZIN}/islem-formu.tsx`);
const FAALIYETLER = oku(`${DIZIN}/faaliyetler/page.tsx`);
const VERI = oku(`${DIZIN}/veri.ts`);
const SAYFALAR = { KURUM, KISI, KRITER, UAK };
const kod = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("yetki kapısı", () => {
  test("her yönetim ekranı yetkiyi okur ve yoksa veri okumadan YetkiYok çizer", () => {
    const kapilar: [string, string, RegExp][] = [
      ["KURUM", "tumunuGor", /yetkiler\.tumunuGor \? await gozetimListesi\(\) : \[\]/],
      ["KRITER", "kriterYonet", /yetkiler\.kriterYonet \? await Promise\.all\(\[kriterleriOku\(\), hedefleriOku\(\)\]\) : \[\[\], \[\]\]/],
      ["UAK", "uakYonet", /yetkiler\.uakYonet \? await uakTablolari\(\) : \[\]/],
    ];
    for (const [ad, anahtar, okuma] of kapilar) {
      const k = kod(SAYFALAR[ad as keyof typeof SAYFALAR]);
      assert.match(k, /const yetkiler = await yetkilerim\(\);/, ad);
      assert.match(k, okuma, `${ad}: okuma yetkiye bağlı değil`);
      assert.match(k, new RegExp(`!yetkiler\\.${anahtar} \\? <YetkiYok`), ad);
    }
  });

  test("kişi sayfası: bozuk kimlik 404, yetki yoksa hiçbir okuma yapılmadan döner", () => {
    const k = kod(KISI);
    assert.match(k, /if \(!uuidMu\(kisi\)\) notFound\(\);/);
    const kapi = k.indexOf("if (!yetkiler.tumunuGor)");
    assert.ok(kapi > 0);
    for (const okuma of ["kisiAdi(", "kisiOzeti(", "kurumFaaliyetleri(", "kriterlerTumu("]) {
      assert.ok(k.indexOf(okuma) > kapi, `${okuma} kapıdan önce`);
    }
    assert.match(k, /if \(liste\.aralikDisi\) redirect\(/, "aralık dışı sayfa çökmez");
  });

  test("gözetim okumaları sunucuda da yetkiyi soruyor (yalnızca ekran gizlemesi değil)", () => {
    for (const ad of ["gozetimListesi", "kisiAdi", "uakTablolari"]) {
      assert.match(VERI, new RegExp(`export async function ${ad}\\([^)]*\\)[^{]*\\{[^}]*yetkiGerekli\\(b, "docentlik\\.`), ad);
    }
  });

  test("ekranlar Supabase'e doğrudan gitmiyor; kurum ve sahip adresten okunmuyor", () => {
    for (const [ad, k] of Object.entries(SAYFALAR)) {
      assert.ok(!/\bsupabase\b|createClient|createAdminClient|getPanelContext/.test(kod(k)), ad);
      assert.ok(!/name="(organization_id|owner_id|kurum|user_id)"/.test(k), `${ad}: kimlik alanı formda`);
    }
  });
});

describe("gözetim salt okunur", () => {
  test("kurum ve kişi ekranında hiçbir yazma işlemi yok", () => {
    for (const k of [KURUM, KISI]) {
      assert.ok(!/from "\.\.\/actions"|from "\.\.\/\.\.\/actions"/.test(k), "işlem içe aktarılmış");
      assert.ok(!/FaaliyetBelgesiYukle|FaaliyetBelgesiKaldir|OnayliIslem|IslemFormu|FaaliyetFormu|FaaliyetSil/.test(kod(k)));
    }
    assert.match(KISI, /<FaaliyetBelgesiGoruntule/);
  });

  test("doktora TARİHİ hiçbir gözetim ekranında okunmuyor ya da çizilmiyor", () => {
    for (const k of [KURUM, KISI]) assert.ok(!/doktora_tarihi\b|doktoraTarihi\b(?!Girildi)/.test(kod(k)));
    assert.ok(!/doktora_tarihi\b(?!_girildi)/.test(VERI.slice(VERI.indexOf("export async function gozetimListesi"))));
  });

  test("gözetim ve kişi özeti okumaları eksiksiz (hepsiniOku); tek çağrılık RPC okuması yok", () => {
    const k = kod(VERI);
    // Her RPC okuması hepsiniOku içinde, sayımlı ve benzersiz anahtarla sıralı.
    for (const [rpc, anahtar] of [["docentlik_faaliyet_donemleri", "faaliyet_id"], ["docentlik_profil_ozetleri", "owner_id"]]) {
      const cagrilar = [...k.matchAll(new RegExp(`rpc\\("${rpc}", \\{ p_org: b\\.kurum \\}(, \\{ count: "exact" \\})?\\)`, "g"))];
      assert.equal(cagrilar.length, 1, `${rpc}: tek yerde okunmalı`);
      assert.ok(cagrilar.every((c) => c[1]), `${rpc}: count: "exact" yok`);
      assert.match(k, new RegExp(`rpc\\("${rpc}"[\\s\\S]{0,200}\\.order\\("${anahtar}"\\)\\.range\\(bas, son\\)`), `${rpc}: kararlı sıralama`);
    }
    assert.ok(!/<\s*SAYFA\)\s*(break|return)/.test(k), "kısa sayfa = son sayfa varsayımı geri geldi");
    const kisi = k.slice(k.indexOf("export async function kisiOzeti"), k.indexOf("export async function profilim"));
    assert.match(kisi, /profilOzetleri\(b, kisi\)/);
    assert.match(kisi, /faaliyetDonemleri\(b, kisi\)/, "kişi özeti kurumun bütün dönemlerini okumamalı");
    const g = k.slice(k.indexOf("export async function gozetimListesi"), k.indexOf("export async function kisiAdi"));
    assert.match(g, /Promise\.all\(\[profilOzetleri\(b, null\), faaliyetDonemleri\(b, null\)\]\)/);
  });
});

describe("belge akışı", () => {
  test("yol sunucudan geliyor; istemci yolu kendisi kurmuyor", () => {
    const k = kod(BELGE);
    assert.match(k, /const hazir = await belgeYuklemeHazirla\(faaliyetId\);/);
    assert.match(k, /const hazir = await uakYuklemeHazirla\(\);/);
    assert.equal([...k.matchAll(/kovayaYukle\(hazir\.kova, hazir\.yol, dosya!\)/g)].length, 2);
    assert.ok(!/`[^`]*\/\$\{[^`]*`\s*,\s*dosya/.test(k), "istemcide yol şablonu");
  });

  test("kovaya yükleme upsert'süz ve yalnızca PDF türüyle", () => {
    assert.match(BELGE, /upload\(yol, dosya, \{ contentType: "application\/pdf", upsert: false \}\)/);
  });

  test("ön denetim yükleme isteğinden ÖNCE; yükleme hatası formda, kayıt sonrası form sıfırlanıyor", () => {
    const k = kod(BELGE);
    for (const blok of k.split("export function").filter((b) => /YuklemeHazirla\(/.test(b))) {
      assert.ok(blok.indexOf("pdfOnDenetimi(dosya)") < blok.indexOf("YuklemeHazirla("));
      assert.match(blok, /if \(yuklemeHatasi\) \{ setHata\(yuklemeHatasi\); return; \}/);
      assert.match(blok, /if \(kayit\) \{ form\.reset\(\); setDosya\(null\); \}/);
    }
    assert.match(BELGE, /role="alert"/);
  });

  test("imzalı adres yalnızca tıklamada isteniyor; pencere eşzamanlı açılıyor, opener kopuyor", () => {
    const k = kod(BELGE);
    assert.match(k, /olay\.preventDefault\(\);\s*const pencere = window\.open\("about:blank", "_blank"\);\s*if \(pencere\) pencere\.opener = null;/);
    assert.ok(!/href=\{[^}]*adres/.test(k), "imzalı adres bağlantı olarak çizilmiş");
    assert.ok(!/getPublicUrl/.test(k));
  });

  test("faaliyet listesinde belge sütunu: görüntüle, ekle/değiştir, kaldır (onaylı)", () => {
    assert.match(FAALIYETLER, /<FaaliyetBelgesiGoruntule/);
    assert.match(FAALIYETLER, /<FaaliyetBelgesiYukle faaliyetId=\{f\.id\} degistir=\{Boolean\(f\.belge_yolu\)\}/);
    assert.match(FAALIYETLER, /<FaaliyetBelgesiKaldir/);
    assert.match(BELGE, /<OnayliIslem islem=\{belgeKaldir\}/);
  });
});

describe("sunucu hatası kullanıcıya ulaşıyor", () => {
  test("her sunucu işleminin yanıtından sonra bildirim HEMEN yoklatılıyor (15 sn'lik submit yoklaması büyük yüklemede yetmiyordu)", () => {
    const k = kod(BELGE);
    for (const cagri of ["await adresAl()", "await belgeYuklemeHazirla(faaliyetId)", "await belgeKaydet(fd)", "await uakYuklemeHazirla()", "await uakKaydet(fd)"]) {
      assert.match(k, new RegExp(`${cagri.replace(/[()]/g, "\\$&")};\\s*panelBildiriminiYokla\\(\\);`), cagri);
    }
    assert.match(kod(ISLEM), /await islem\(new FormData\(form\)\);\s*panelBildiriminiYokla\(\);/);
    assert.match(kod(ISLEM), /await islem\(fd\); panelBildiriminiYokla\(\);/);
    const TOAST = oku("app/panel/flash-toast.tsx");
    assert.match(TOAST, /window\.addEventListener\("arvo:flash-check", yokla\)/);
    assert.match(TOAST, /window\.removeEventListener\("arvo:flash-check", yokla\)/);
    assert.match(TOAST, /document\.addEventListener\("submit", handleSubmit\)/, "mevcut submit yoklaması korunmalı");
    assert.match(oku("lib/panel-bildirim-yokla.ts"), /window\.dispatchEvent\(new Event\("arvo:flash-check"\)\)/);
  });
});

describe("kriter ve hedef yönetimi", () => {
  test("işlemler PR5'inkiler; ekleme/düzenleme IslemFormu, silme onaylı", () => {
    for (const islem of ["kriterEkle", "kriterDuzenle", "hedefKaydet"]) assert.match(KRITER, new RegExp(`<IslemFormu islem=\\{${islem}\\}`), islem);
    assert.match(KRITER, /<OnayliIslem islem=\{kriterSil\} alanlar=\{\{ kriter_id: k\.id \}\}/);
    assert.match(KRITER, /<OnayliIslem islem=\{hedefSil\} alanlar=\{\{ hedef_id: h\.id \}\}/);
  });

  test("durum seçim kutusuyla: işaretsiz onay kutusu gönderilmez ve sunucu boşu 'etkin' sayar", () => {
    assert.match(KRITER, /<select name="aktif"/);
    assert.ok(!/type="checkbox" name="aktif"/.test(KRITER));
  });

  test("kod düzenlemede değişmiyor; eski puanların değişmediği formda yazıyor", () => {
    assert.match(KRITER, /name="kod"[^>]*disabled=\{Boolean\(k\)\}/);
    assert.match(KRITER, /geçmiş faaliyetlerin puanını değiştirmez/);
  });
});

describe("ÜAK", () => {
  test("öneri içeriği gösterilmiyor; yalnızca durum", () => {
    assert.ok(!/\boneri\b/.test(kod(UAK).replace(/oneri_hazir/g, "")), "öneri içeriği ekranda");
    assert.ok(!/oneri/.test(VERI.slice(VERI.indexOf("export async function uakTablolari"), VERI.indexOf("export async function yetkilerim"))));
    assert.match(UAK, /uakDurumu\(t\.durum\)/);
  });

  test("onay düğmesi devre dışı ve nedenini gösteriyor; onay işlemi çağrılmıyor", () => {
    assert.match(UAK, /<button type="button" className="panel-secondary" disabled aria-describedby="uak-onay-neden">Onayla<\/button>/);
    assert.match(UAK, /id="uak-onay-neden"[^>]*>Onay kapalı: \{onay\.neden\}/);
    assert.ok(!/uakOnayla/.test(kod(UAK)));
  });

  test("tarih Türkiye saatiyle", () => assert.match(UAK, /istanbulDateTime\(t\.yuklendi_at/));
});

describe("ortak kalıplar", () => {
  test("IslemFormu onSubmit + eşzamanlı kilit; yalnızca başarıda sıfırlıyor", () => {
    const k = kod(ISLEM);
    assert.match(k, /<form onSubmit=\{gonder\}/);
    assert.match(k, /useRef\(false\)/);
    assert.ok(!/<form onSubmit[^>]*\saction=/.test(k));
  });

  test("onay penceresi formun DIŞINDA (iç içe form yok)", () => {
    const blok = ISLEM.slice(ISLEM.indexOf("export function OnayliIslem"));
    assert.ok(blok.indexOf("</form>") < blok.indexOf("<OnayPenceresi"));
    assert.match(blok, /requestSubmit\(\)/);
  });

  test("satır içi stil yok, 'use server' yok, her ekran CSS'ini import ediyor", () => {
    for (const [ad, k] of Object.entries({ ...SAYFALAR, BELGE, ISLEM })) {
      assert.ok(!/style=\{/.test(k), ad);
      assert.ok(!/^\s*["']use server["'];?\s*$/m.test(k), ad);
    }
    for (const k of Object.values(SAYFALAR)) {
      assert.match(k, /docentlik\.css"/);
      assert.match(k, /kayit-detay\.css"/);
    }
    for (const k of [BELGE, ISLEM]) assert.ok(k.startsWith('"use client";'));
  });
});
