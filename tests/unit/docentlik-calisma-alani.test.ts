/*
  DOÇENTLİK ÇALIŞMA ALANI EKRANLARININ SÖZLEŞMESİ (F6 PR6a) — kaynak denetimi.

  Ekranlar Next'e ve Supabase'e bağlı; birim testinde çizilemiyorlar.
  Kararlar lib/docentlik-gorunum.ts'te (ayrı testli), sunucu tarafı PR5'te.
  Burada ekranların o kararları gerçekten kullandığı ve güvenlik/veri
  kurallarını çiğnemediği sınanıyor:
   - veri yalnızca PR5'in veri işlevlerinden (doğrudan Supabase yok);
   - kurum/sahip adresten ya da istemciden okunmuyor (adresten yalnızca sayfa);
   - formda puan alanı yok; istek anahtarı gönderimde üretiliyor, çizimde değil;
     düzenleme sürümü (updated_at) geri gidiyor;
   - silme onayı panelin penceresinde ve formun DIŞINDA (iç içe form yok);
   - kapı yerleşimde duruyor; satır içi stil yok.
*/
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import fs from "node:fs";
import path from "node:path";

const KOK = path.resolve(import.meta.dirname, "../..");
const oku = (yol: string) => fs.readFileSync(path.join(KOK, yol), "utf8");
const DIZIN = "app/panel/docentlik";
const ANA = oku(`${DIZIN}/page.tsx`);
const FAALIYETLER = oku(`${DIZIN}/faaliyetler/page.tsx`);
const PROFIL = oku(`${DIZIN}/profil/page.tsx`);
const FORM = oku(`${DIZIN}/faaliyet-formu.tsx`);
const SIL = oku(`${DIZIN}/faaliyet-sil.tsx`);
const SEKMELER = oku(`${DIZIN}/sekmeler.tsx`);
const YERLESIM = oku(`${DIZIN}/layout.tsx`);
const EKRANLAR = { ANA, FAALIYETLER, PROFIL, FORM, SIL, SEKMELER };
/* Yorumlar gerekçe anlatıyor ("puan alanı YOK" gibi); denetim koda bakar. */
const kod = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("veri ve kimlik", () => {
  test("ekranlar Supabase'e doğrudan gitmiyor; veri PR5'in veri işlevlerinden", () => {
    for (const [ad, k] of Object.entries(EKRANLAR)) {
      assert.ok(!/\bsupabase\b|createClient|createAdminClient|getPanelContext/.test(kod(k)), `${ad}: doğrudan veri erişimi`);
    }
    assert.match(ANA, /from "\.\/veri"/);
    assert.match(FAALIYETLER, /from "\.\.\/veri"/);
    assert.match(PROFIL, /from "\.\.\/veri"/);
  });

  test("kurum ve sahip adresten/istemciden okunmuyor; adresten yalnızca sayfa numarası", () => {
    for (const [ad, k] of Object.entries(EKRANLAR)) {
      assert.ok(!/(organization_id|owner_id|kurum|sahip)\s*[:=]\s*(searchParams|params)/.test(k), ad);
      assert.ok(!/name="(organization_id|owner_id|kurum|kullanici|user_id)"/.test(k), `${ad}: kimlik alanı formda`);
    }
    assert.ok(!/searchParams/.test(ANA) && !/searchParams/.test(PROFIL));
    assert.match(FAALIYETLER, /searchParams: Promise<\{ sayfa\?: string \}>/);
    assert.match(FAALIYETLER, /sayfaNumarasi\(ham\)/);
    assert.match(FAALIYETLER, /if \(liste\.aralikDisi\) redirect\(/, "aralık dışı sayfa çökmez, yönlendirilir");
  });

  test("yalnızca kendi verisi: liste faaliyetlerim(), profil profilim(); gözetim işlevleri bu ekranlarda yok", () => {
    assert.match(FAALIYETLER, /faaliyetlerim\(sayfa\)/);
    assert.match(ANA, /docentlikOzetim\(\)/);
    assert.match(PROFIL, /profilim\(\)/);
    for (const k of [ANA, FAALIYETLER, PROFIL]) assert.ok(!/kurumFaaliyetleri|kisiOzeti/.test(k));
  });

  test("kapı yerleşimde (modül + kişide gizleme) duruyor", () => {
    assert.match(YERLESIM, /modulGerek\(modules, "docentlik"\)/);
    assert.match(YERLESIM, /isNavigationGroupHiddenForRole\(membership\.role, "docentlik", hiddenModuleKeys\)/);
  });
});

describe("faaliyet formu", () => {
  test("puan alanı yok; sunucuya puan gitmiyor", () => {
    assert.ok(!/name="(computed_points|puan|paylasim_katsayisi|kural_surumu|beklenen\w*)"/.test(FORM));
    assert.ok(!/computed_points/.test(kod(FORM)));
  });

  test("istek anahtarı gönderimde üretiliyor (çizimde değil), başarıda sıfırlanıyor, hatada KORUNUYOR", () => {
    const k = kod(FORM);
    assert.match(k, /const anahtar = useRef<string \| null>\(null\)/);
    assert.match(k, /async function gonder\(olay: FormEvent<HTMLFormElement>\) \{[\s\S]*anahtar\.current \?\?= crypto\.randomUUID\(\);[\s\S]*formData\.set\("istek_anahtari", anahtar\.current\);[\s\S]*const sonuc = await faaliyetEkle\(formData\);[\s\S]*if \(sonuc\) \{[\s\S]*anahtar\.current = null;[\s\S]*form\.reset\(\);/);
    // Çizimde rastgele değer yok (sunucu/tarayıcı uyuşmazlığı).
    assert.equal([...k.matchAll(/crypto\.randomUUID\(\)/g)].length, 1);
    assert.ok(!/useState\(\(\) => crypto/.test(k));
    // Başarısız gönderimde anahtar silinmiyor ve form sıfırlanmıyor: ikisi de yalnızca `if (sonuc)` içinde.
    assert.ok(!/anahtar\.current = null;[\s\S]*if \(sonuc\)/.test(k));
    assert.equal([...k.matchAll(/form\.reset\(\)/g)].length, 1);
  });

  test("form <form action> DEĞİL onSubmit ile: React 19 action'lı formu hatada da sıfırlıyordu", () => {
    const k = kod(FORM);
    assert.match(k, /<form onSubmit=\{gonder\}/);
    assert.ok(!/<form[^>]*\saction=/.test(k));
    assert.match(k, /olay\.preventDefault\(\);\s*if \(gonderiliyor\.current\) return;/);
    assert.match(k, /finally \{\s*gonderiliyor\.current = false;\s*setBekliyor\(false\);\s*\}/);
  });

  test("düzenleme sürümü (updated_at) ve kayıt kimliği gizli alanla gidiyor; düzenlemede anahtar yok", () => {
    assert.match(FORM, /<input type="hidden" name="surum" value=\{mevcut\.surum\} \/>/);
    assert.match(FORM, /<input type="hidden" name="faaliyet_id" value=\{mevcut\.id\} \/>/);
    assert.match(FAALIYETLER, /surum: f\.updated_at/);
    assert.match(kod(FORM), /if \(mevcut\) \{\s*await faaliyetDuzenle\(formData\);\s*return;\s*\}/);
  });

  test("çift tıklama: gönderim düğmesi işlem sürerken kilitli, kilit eşzamanlı (ref)", () => {
    assert.match(FORM, /<button type="submit" className="panel-primary" disabled=\{bekliyor\}/);
    assert.match(kod(FORM), /const gonderiliyor = useRef\(false\)/);
  });

  test("erişilebilirlik: her alanın etiketi var, başlıca yazar seçimi fieldset/legend", () => {
    for (const ad of ["kriter_id", "baslik", "birim_sayisi", "yazar_sayisi", "notlar"]) {
      assert.match(FORM, new RegExp(`<label[^>]*>\\s*<span>[^<]+(<b[^>]*>\\*</b>)?</span>\\s*(\\{/\\*[\\s\\S]*?\\*/\\}\\s*)?<(input|select|textarea) name="${ad}"`), ad);
    }
    assert.match(FORM, /<fieldset[\s\S]*<legend>Başlıca yazar mısınız\?<\/legend>/);
    assert.match(FORM, /aria-describedby/);
  });

  test("seçilebilecek kriter yoksa form değil boş durum", () => {
    assert.match(FORM, /if \(!secenekVar\) \{[\s\S]*panel-empty/);
  });
});

describe("silme ve kalıplar", () => {
  test("silme onayı panelin penceresinde ve formun DIŞINDA; gönderim gerçek form gönderimi", () => {
    assert.match(SIL, /<OnayPenceresi/);
    assert.ok(SIL.indexOf("</form>") < SIL.indexOf("<OnayPenceresi"), "onay penceresi formun içinde (iç içe form)");
    assert.match(SIL, /form\.current\?\.requestSubmit\(\)/);
    assert.ok(!/window\.confirm|confirm\(/.test(kod(SIL)));
  });

  test("satır içi stil yok; ilerleme çubuğu yerel <progress>", () => {
    for (const [ad, k] of Object.entries(EKRANLAR)) assert.ok(!/style=\{/.test(k), ad);
    assert.match(ANA, /<progress className=/);
  });

  test("ÜAK notu ve ham/sayılan ayrımı ana ekranda", () => {
    assert.match(ANA, /\{UAK_BILGI_NOTU\}/);
    assert.match(ANA, /<dt>Sayılan puan<\/dt>/);
    assert.match(ANA, /<dt>Ham puan<\/dt>/);
    assert.match(ANA, /hedef\.hedefYok \?/);
  });

  test("yeni dosyaların hiçbiri 'use server' değil (dışarıya uç nokta açılmıyor)", () => {
    for (const [ad, k] of Object.entries(EKRANLAR)) assert.ok(!/^\s*["']use server["'];?\s*$/m.test(k), ad);
    for (const k of [FORM, SIL]) assert.ok(k.startsWith('"use client";'));
  });

  test("her ekran kullandığı CSS'i kendisi import ediyor", () => {
    for (const k of [ANA, FAALIYETLER, PROFIL]) {
      assert.match(k, /docentlik\.css"/);
      assert.match(k, /kayit-detay\.css"/);
      assert.match(k, /kayit-formu\.css"/);
    }
  });
});
