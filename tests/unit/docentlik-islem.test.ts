/*
  DOÇENTLİK SUNUCU İŞLEMLERİNİN SAF ÇEKİRDEĞİ (F6 PR5) — lib/docentlik-islem.ts.

  Sınananlar: form doğrulama (geçersiz tarih ve sayı dahil), belge yolu
  sözleşmesi (uydurma yollar), depodan okunan nesnenin kabulü, PDF
  imzası, puanın PR #318 çekirdeğiyle doğrulanması (ekleme, düzenleme,
  başlık/belge düzenlemesi, kriter değişikliği), özet kurgusu ve kapalı
  ÜAK onayı. Bütün veriler yapay.
*/
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  BELGE_AZAMI_BAYT, DOCENTLIK_KOVASI, IMZALI_ADRES_SANIYE, UAK_ONAYI_ETKIN, beklenenDuzenlemePuani, beklenenEklemePuani,
  depoNesnesiUygunMu, docentlikOzeti, faaliyetBelgeYolu, faaliyetBelgeYoluMu, faaliyetFormu, gercekTarihMi, hedefFormu,
  hesapGirdileriAyniMi, kriterFormu, metinAlani, pdfMi, profilFormu, puanDogrulandiMi, sayiEsitMi, uakBelgeYolu,
  uakBelgeYoluMu, uakOnayKarari, uuidMu, type FaaliyetYazimi,
} from "@/lib/docentlik-islem";
import { etkinHedefler, hedefDurumlari, puanGruplari, tavanUygula } from "@/lib/docentlik/ozet";

const K = "00000000-0000-4000-8000-0000000000a1";
const S = "00000000-0000-4000-8000-0000000000b1";
const F = "00000000-0000-4000-8000-0000000000c1";
const R = "00000000-0000-4000-8000-0000000000d1";
const KR = "00000000-0000-4000-8000-0000000000e1";

const gecerliForm = { kriterId: KR, baslik: "Makale", birimSayisi: "2", yazarSayisi: "3", baslicaYazar: "hayir", faaliyetTarihi: "2022-01-10" };

describe("form doğrulama", () => {
  test("geçerli faaliyet formu veritabanı alanlarına çevrilir; hesaplanan sütun YOK", () => {
    const f = faaliyetFormu(gecerliForm);
    assert.ok(f.ok);
    assert.deepEqual(f.deger.yazim, { criteria_id: KR, title: "Makale", unit_count: 2, yazar_sayisi: 3, baslica_yazar: false, faaliyet_tarihi: "2022-01-10", notes: null });
    for (const yasak of ["computed_points", "paylasim_katsayisi", "kural_surumu", "organization_id", "owner_id"]) assert.ok(!(yasak in f.deger.yazim), yasak);
  });

  test("istemcinin gönderdiği puan/kurum/sahip alanları formdan hiç okunmaz", () => {
    const f = faaliyetFormu({ ...gecerliForm, computed_points: 9999, organization_id: "x", owner_id: "y" } as never);
    assert.ok(f.ok && !("computed_points" in f.deger.yazim));
  });

  test("geçersiz kriter, başlık, birim, yazar ve tarih reddedilir (ArvoLab metinleriyle)", () => {
    const red = (d: Record<string, unknown>) => { const f = faaliyetFormu({ ...gecerliForm, ...d }); assert.ok(!f.ok); return f.hata; };
    assert.equal(red({ kriterId: "abc" }), "Kriter seçilmedi.");
    assert.equal(red({ baslik: "  " }), "Başlık zorunludur.");
    assert.equal(red({ baslik: "x".repeat(501) }), "Başlık en fazla 500 karakter olabilir.");
    for (const b of ["0", "-1", "abc", "NaN", "Infinity"]) assert.equal(red({ birimSayisi: b }), "Adet / birim sayısı 0'dan büyük bir sayı olmalıdır.", b);
    assert.equal(red({ birimSayisi: "100001" }), "Adet / birim sayısı en fazla 100000 olabilir.");
    for (const y of ["0", "501", "2,5", "x"]) assert.equal(red({ yazarSayisi: y }), "Yazar sayısı 1 ile 500 arasında bir tam sayı olmalı.", y);
    for (const t of ["01.05.2024", "2024-13-45", "2023-02-29", "2024-04-31", "1850-01-01"]) assert.equal(red({ faaliyetTarihi: t }), "Tarih geçersiz.", t);
    assert.equal(red({ istekAnahtari: "tekrar" }), "İstek anahtarı geçersiz; sayfayı yenileyip tekrar deneyin.");
  });

  test("tek yazarlı faaliyette yazar başlıcadır; tarih boş olabilir; istek anahtarı uuid", () => {
    const f = faaliyetFormu({ ...gecerliForm, yazarSayisi: "1", baslicaYazar: "hayir", faaliyetTarihi: "", istekAnahtari: R });
    assert.ok(f.ok);
    assert.equal(f.deger.yazim.baslica_yazar, true);
    assert.equal(f.deger.yazim.faaliyet_tarihi, null);
    assert.equal(f.deger.istekAnahtari, R);
  });

  test("gerçek takvim günü", () => {
    for (const t of ["2024-02-29", "2023-12-31", "2000-01-01"]) assert.ok(gercekTarihMi(t), t);
    for (const t of ["2023-02-29", "2024-00-10", "2024-1-1", "", "2024-12-32"]) assert.ok(!gercekTarihMi(t), t);
  });

  test("profil: doktora tarihi gerçek ve geçmişte; alt alan temel alansız olamaz", () => {
    assert.deepEqual(profilFormu({ doktoraTarihi: "2020-06-15", temelAlan: "Hukuk", altAlan: "Ceza" }, "2026-11-14"),
      { ok: true, deger: { doktora_tarihi: "2020-06-15", temel_alan: "Hukuk", alt_alan: "Ceza" } });
    assert.equal(profilFormu({ doktoraTarihi: "2027-01-01" }, "2026-11-14").ok, false);
    assert.equal(profilFormu({ doktoraTarihi: "2020-02-30" }, "2026-11-14").ok, false);
    assert.deepEqual(profilFormu({ altAlan: "Ceza" }, "2026-11-14"), { ok: true, deger: { doktora_tarihi: null, temel_alan: null, alt_alan: null } });
    assert.equal(profilFormu({ temelAlan: "x".repeat(121) }, "2026-11-14").ok, false);
  });

  test("kriter: kod yalnızca eklemede; katsayı (0,1]; puan ≥ 0; pasife alma", () => {
    const e = kriterFormu({ kod: "A1", etiket: "Makale", birimPuan: "20", baslicaKatsayi: "0,8", digerKatsayi: "0,5" }, "ekleme");
    assert.ok(e.ok && e.deger.kod === "A1" && e.deger.yazim.baslica_yazar_katsayisi === 0.8);
    const d = kriterFormu({ kod: "DEGISMEZ", etiket: "Makale", birimPuan: "20", aktif: "0" }, "duzenleme");
    assert.ok(d.ok && d.deger.kod === null && d.deger.yazim.is_active === false);
    assert.equal(kriterFormu({ etiket: "x", birimPuan: "1" }, "ekleme").ok, false, "kod zorunlu");
    assert.equal(kriterFormu({ kod: "A", etiket: "x", birimPuan: "-1" }, "ekleme").ok, false);
    assert.equal(kriterFormu({ kod: "A", etiket: "x", birimPuan: "1", baslicaKatsayi: "1,2" }, "ekleme").ok, false);
  });

  test("hedef: en az biri; doktora sonrası satırında tavan yok; üst sınır", () => {
    assert.deepEqual(hedefFormu({ asgari: "90", azami: "10", doktoraSonrasi: "1" }), {
      ok: true, deger: { grup: null, asgari_puan: 90, azami_puan: null, doktora_sonrasi: true, temel_alan: null, alt_alan: null, notlar: null },
    });
    assert.equal(hedefFormu({}).ok, false);
    assert.equal(hedefFormu({ asgari: "100001" }).ok, false);
  });

  test("metin alanı", () => {
    assert.deepEqual(metinAlani("  a ", "X", 3), { ok: true, deger: "a" });
    assert.deepEqual(metinAlani("", "X", 3), { ok: true, deger: null });
    assert.equal(metinAlani("abcd", "X", 3).ok, false);
  });
});

describe("belge yolu sözleşmesi", () => {
  test("sunucunun kurduğu yol doğrulanır; kimlikler uuid olmalı", () => {
    const yol = faaliyetBelgeYolu(K, S, F, R);
    assert.equal(yol, `${K}/faaliyet/${S}/${F}/${R}.pdf`);
    assert.ok(faaliyetBelgeYoluMu(yol, K, S, F));
    assert.throws(() => faaliyetBelgeYolu("akademikmerkez", S, F, R));
  });

  test("uydurma faaliyet belgesi yolları reddedilir", () => {
    const baska = "00000000-0000-4000-8000-0000000000ff";
    for (const yol of [
      `${baska}/faaliyet/${S}/${F}/${R}.pdf`, `${K}/faaliyet/${baska}/${F}/${R}.pdf`, `${K}/faaliyet/${S}/${baska}/${R}.pdf`,
      `${K}/faaliyet/${S}/${F}/belge.pdf`, `${K}/faaliyet/${S}/${F}/${R}.exe`, `${K}/faaliyet/${S}/${F}/x/${R}.pdf`,
      `${K}/faaliyet/${S}/${F}/../${R}.pdf`, `/${K}/faaliyet/${S}/${F}/${R}.pdf`, `${K}/uak/${S}/${R}.pdf`, "", 42, null,
    ]) assert.ok(!faaliyetBelgeYoluMu(yol, K, S, F), String(yol));
  });

  test("ÜAK yolu: kurum kendisi, klasör ve dosya uuid", () => {
    const yol = uakBelgeYolu(K, F, R);
    assert.ok(uakBelgeYoluMu(yol, K));
    for (const kotu of [`${S}/uak/${F}/${R}.pdf`, `${K}/uak/${R}.pdf`, `${K}/uak/x/${R}.pdf`, `${K}/faaliyet/${F}/${R}.pdf`, `${K}/uak/${F}/${R}.docx`]) {
      assert.ok(!uakBelgeYoluMu(kotu, K), kotu);
    }
  });

  test("kova ve sınırlar migration'la aynı", () => {
    assert.equal(DOCENTLIK_KOVASI, "docentlik-belgeleri");
    assert.equal(BELGE_AZAMI_BAYT, 20 * 1024 * 1024);
    assert.ok(IMZALI_ADRES_SANIYE > 0 && IMZALI_ADRES_SANIYE <= 300, "imzalı adres kısa ömürlü olmalı");
    assert.ok(uuidMu(R) && !uuidMu("x"));
  });
});

describe("depodan okunan dosya", () => {
  test("boyut ve tür depo bilgisinden", () => {
    assert.deepEqual(depoNesnesiUygunMu({ size: 1024, contentType: "application/pdf" }), { ok: true, deger: 1024 });
    assert.deepEqual(depoNesnesiUygunMu({ size: 1024, contentType: "application/pdf; charset=binary" }), { ok: true, deger: 1024 });
    assert.equal(depoNesnesiUygunMu(null).ok, false);
    assert.equal(depoNesnesiUygunMu({ size: 0, contentType: "application/pdf" }).ok, false);
    assert.equal(depoNesnesiUygunMu({ size: BELGE_AZAMI_BAYT + 1, contentType: "application/pdf" }).ok, false);
    assert.equal(depoNesnesiUygunMu({ size: 10, contentType: "image/png" }).ok, false);
  });
  test("içerik PDF imzası taşımalı", () => {
    assert.ok(pdfMi(new TextEncoder().encode("%PDF-1.7\n")));
    assert.ok(!pdfMi(new TextEncoder().encode("MZ\x90\x00")));
    assert.ok(!pdfMi(new Uint8Array([0x25, 0x50])));
  });
});

describe("puanın çekirdekle doğrulanması", () => {
  const kriter = { points_per_unit: "20", baslica_yazar_katsayisi: "0.8", diger_yazar_katsayisi: "0.5", esit_bolusum: false };
  const form = (d: Partial<FaaliyetYazimi> = {}): FaaliyetYazimi => ({ criteria_id: KR, title: "Makale", unit_count: 2, yazar_sayisi: 3, baslica_yazar: false, faaliyet_tarihi: null, notes: null, ...d });

  test("ekleme: 2 × 20 × 0,5 = 20; veritabanının metin olarak döndürdüğü numeric ile birebir", () => {
    const b = beklenenEklemePuani(form(), kriter);
    assert.deepEqual(b, { puan: 20, katsayi: 0.5 });
    assert.ok(puanDogrulandiMi(b, { computed_points: "20", paylasim_katsayisi: "0.5" }));
    assert.ok(!puanDogrulandiMi(b, { computed_points: "20.000001", paylasim_katsayisi: "0.5" }), "en küçük sapma da yakalanmalı");
    assert.ok(!puanDogrulandiMi(b, { computed_points: "9999", paylasim_katsayisi: "0.5" }));
  });

  test("eşit bölüşüm ve 1/3 katsayısının metin gösterimi", () => {
    const b = beklenenEklemePuani(form({ unit_count: 1 }), { points_per_unit: 30, baslica_yazar_katsayisi: null, diger_yazar_katsayisi: null, esit_bolusum: true });
    assert.equal(b.puan, 10);
    assert.ok(sayiEsitMi(b.katsayi, "0.3333333333333333"));
  });

  const mevcut = { criteria_id: KR, unit_count: "2", computed_points: "20", paylasim_katsayisi: "0.5", yazar_sayisi: 3, baslica_yazar: false };

  test("başlık, not ya da tarih değişince puan aynen kalır (hesap girdileri aynı)", () => {
    const yeni = form({ title: "Yeni başlık", notes: "not", faaliyet_tarihi: "2023-01-01" });
    assert.ok(hesapGirdileriAyniMi(mevcut, yeni));
    // Kriterin puanı bu arada 50 olsa bile.
    assert.deepEqual(beklenenDuzenlemePuani(mevcut, yeni, { ...kriter, points_per_unit: "50" }), { puan: 20, katsayi: 0.5 });
  });

  /*
    Kısayol bir hızlandırma değil, DOĞRULUK kuralı: yuvarlanmış puandan
    geri türetilen birim puan (0.246913 / 2) yeniden çarpılınca 0.246914
    çıkıyor. Tetikleyici girdiler aynıyken kaydı ellemediği için kısayolu
    olmayan bir doğrulama, başlığı düzelten her kullanıcıya "puan
    tutmadı" derdi. Mutasyon denemesinde (M10) bu senaryo yoktu.
  */
  test("girdiler aynıyken yuvarlama kayması olan puan da aynen kalır", () => {
    const k = { points_per_unit: 0.1234567, baslica_yazar_katsayisi: null, diger_yazar_katsayisi: null, esit_bolusum: true };
    const ilk = beklenenEklemePuani(form({ unit_count: 2, yazar_sayisi: 1 }), k);
    assert.equal(ilk.puan, 0.246913);
    const kayit = { criteria_id: KR, unit_count: "2", computed_points: String(ilk.puan), paylasim_katsayisi: "1", yazar_sayisi: 1, baslica_yazar: true };
    assert.deepEqual(beklenenDuzenlemePuani(kayit, form({ unit_count: 2, yazar_sayisi: 1, title: "Düzeltilmiş" }), k), { puan: 0.246913, katsayi: 1 });
  });

  test("kriter sonradan pahalansa da birim değişikliğinde eski birim puan korunur (korunanBirimPuan)", () => {
    const b = beklenenDuzenlemePuani(mevcut, form({ unit_count: 4 }), { ...kriter, points_per_unit: "50" });
    assert.deepEqual(b, { puan: 40, katsayi: 0.5 });
  });

  test("yazar bilgisi değişince katsayı kriterden; kriter değişince birim puan yeni kriterden", () => {
    assert.deepEqual(beklenenDuzenlemePuani(mevcut, form({ baslica_yazar: true }), kriter), { puan: 32, katsayi: 0.8 });
    const yeniKriter = "00000000-0000-4000-8000-0000000000e2";
    assert.deepEqual(beklenenDuzenlemePuani(mevcut, form({ criteria_id: yeniKriter, unit_count: 1, yazar_sayisi: 1 }), { points_per_unit: "7", baslica_yazar_katsayisi: null, diger_yazar_katsayisi: null, esit_bolusum: false }), { puan: 7, katsayi: 1 });
  });

  test("tek yazara düşürülen faaliyette başlıca bayrağı da değişmiş sayılır (tetikleyiciyle aynı)", () => {
    assert.ok(!hesapGirdileriAyniMi(mevcut, form({ yazar_sayisi: 1, baslica_yazar: false })));
  });
});

describe("özet kurgusu çekirdekle aynı", () => {
  const kriterler = [{ id: "m", category_group: "Makale" }, { id: "a", category_group: "Atıf" }];
  const hedefler = [
    { organization_id: K, grup: null, asgari_puan: 100 },
    { organization_id: K, grup: null, asgari_puan: 90, doktora_sonrasi: true },
    { organization_id: K, grup: "Atıf", asgari_puan: null, azami_puan: 10 },
  ];
  const faaliyetler = [
    { computed_points: "60", criteria_id: "m", donem: "sonra" as const },
    { computed_points: "30", criteria_id: "a", donem: "once" as const },
  ];

  test("tavan, toplam ve doktora sonrası hedefi; doğrudan çekirdek çağrısıyla birebir", () => {
    const o = docentlikOzeti({ faaliyetler, kriterler, hedefler, kurum: K, temelAlan: null, altAlan: null, doktoraTarihiBiliniyor: true });
    const kayit = (f: (typeof faaliyetler)[number]) => ({ computed_points: Number(f.computed_points), criteria: { category_group: kriterler.find((k) => k.id === f.criteria_id)!.category_group } });
    const etkin = etkinHedefler(hedefler, K, null, null);
    const tum = tavanUygula(puanGruplari(faaliyetler.map(kayit)), etkin);
    const sonra = tavanUygula(puanGruplari(faaliyetler.filter((f) => f.donem === "sonra").map(kayit)), etkin);
    const durum = hedefDurumlari(etkin, tum, sonra);
    assert.equal(o.toplam, 70);
    assert.equal(o.ham, 90);
    assert.equal(o.sonraToplam, 60);
    assert.deepEqual(o.toplamHedefleri, durum.toplamHedefleri);
    assert.deepEqual(o.grupHedefleri, durum.grupHedefleri);
  });

  test("doktora tarihi bilinmiyorsa doktora sonrası şartı ölçülmez", () => {
    const o = docentlikOzeti({ faaliyetler, kriterler, hedefler, kurum: K, temelAlan: null, altAlan: null, doktoraTarihiBiliniyor: false });
    assert.equal(o.sonraToplam, null);
    assert.deepEqual(o.toplamHedefleri.map((h) => h.doktoraSonrasi), [false]);
  });

  test("başka kurumun hedefi sayılmaz", () => {
    const o = docentlikOzeti({ faaliyetler, kriterler, hedefler, kurum: S, temelAlan: null, altAlan: null, doktoraTarihiBiliniyor: true });
    assert.deepEqual(o.toplamHedefleri, []);
  });
});

describe("ÜAK onayı", () => {
  test("doğrulama hazır olmadan onay her koşulda reddedilir", () => {
    assert.equal(UAK_ONAYI_ETKIN, false);
    const k = uakOnayKarari();
    assert.equal(k.izin, false);
    assert.match(k.neden, /henüz etkin değil/);
  });
});
