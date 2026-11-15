"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { todayInIstanbul } from "@/lib/istanbul-date";
import {
  DOCENTLIK_KOVASI, IMZALI_ADRES_SANIYE, beklenenDuzenlemePuani, beklenenEklemePuani, depoNesnesiUygunMu,
  faaliyetBelgeYolu, faaliyetBelgeYoluMu, faaliyetFormu, hedefFormu, kriterFormu, metinAlani, pdfMi,
  profilFormu, PUAN_UYUSMAZLIGI, faaliyetYazimHatasi, uakBelgeYolu, uakBelgeYoluMu, uakOnayKarari, uuidMu,
  type FaaliyetYazimi, type KriterSatiri,
} from "@/lib/docentlik-islem";
import { docentlikBaglami, okunamadiysaFirlat, yetkiGerekli, type DocentlikBaglami } from "./baglam";
import { belgeyiBagla, belgeyiKaldir } from "./belge-baglama";

/*
  DOÇENTLİK SUNUCU İŞLEMLERİ (F6 PR5).

  Her işlem:
   - docentlikBaglami() ile başlar (oturum, modül, kişide gizleme);
   - kimliği ve kurumu yalnızca oturumdan alır, formdan ASLA;
   - kullanıcının kendi oturumuyla yazar (service_role YOK — bu dosyada
     createAdminClient bilerek içe aktarılmıyor; RLS her yazmada çalışıyor).
     TEK İSTİSNA belge_yolu (F6 PR8): sütun istemciye kapalı, bağlama
     belge-baglama.ts'teki iki service_role işleviyle; o dosya server-only;
   - "returning" ile etkilenen satırı ister: RLS'in sessizce sıfır satır
     döndürmesi (işlem sırasında üyelik düştü, modül kapandı, kayıt
     başkasının) başarı sayılmaz.

  Puan istemciden hiç okunmuyor ve hiç yazılmıyor: tetikleyici hesaplıyor
  (PR #319), işlem sonucu PR #318 çekirdeğiyle karşılaştırıyor.

  Karar veren saf kurallar lib/docentlik-islem.ts'te (birim testli).
*/

const YOL = "/panel/docentlik";
/*
  "layout" ile: Doçentlik'in BÜTÜN ekranları (özet, faaliyetler, profil ve
  yönetim sayfaları) yenilensin. Eskiden revalidatePath(YOL) yalnızca
  /panel/docentlik sayfasını geçersiz kılıyordu; Next sunucu işleminde
  arayüzü "yalnızca etkilenen yol görüntüleniyorsa" anında yeniliyor —
  Faaliyetlerim sayfasında ekleme/düzenleme/silmeden sonra liste eski
  hâliyle kalıyordu (node_modules/next/dist/docs → revalidatePath).
*/
const yenile = () => revalidatePath(YOL, "layout");
const metin = (formData: FormData, ad: string) => formData.get(ad);
const kimlik = (formData: FormData, ad: string, neyin: string) => {
  const deger = String(formData.get(ad) ?? "").trim();
  if (!uuidMu(deger)) throw new Error(`${neyin} seçilmedi.`);
  return deger;
};

const KRITER_HESAP_SUTUNLARI = "id, points_per_unit, baslica_yazar_katsayisi, diger_yazar_katsayisi, esit_bolusum, is_active";

async function kriterOku(b: DocentlikBaglami, kriterId: string) {
  const { data, error } = await b.supabase.from("docentlik_kriterleri").select(KRITER_HESAP_SUTUNLARI)
    .eq("id", kriterId).eq("organization_id", b.kurum).maybeSingle();
  okunamadiysaFirlat(error, "Kriter");
  return data as (KriterSatiri & { id: string; is_active: boolean }) | null;
}

/* ====================================================================== */
/* Faaliyet                                                               */
/* ====================================================================== */

const KAYIT_SUTUNLARI = "id, criteria_id, unit_count, computed_points, paylasim_katsayisi, kural_surumu, yazar_sayisi, baslica_yazar, belge_yolu, updated_at, title, notes, faaliyet_tarihi";

function faaliyetFormunuOku(formData: FormData) {
  const form = faaliyetFormu({
    kriterId: metin(formData, "kriter_id"), baslik: metin(formData, "baslik"), birimSayisi: metin(formData, "birim_sayisi"),
    yazarSayisi: metin(formData, "yazar_sayisi"), baslicaYazar: metin(formData, "baslica_yazar"),
    faaliyetTarihi: metin(formData, "faaliyet_tarihi"), notlar: metin(formData, "notlar"), istekAnahtari: metin(formData, "istek_anahtari"),
  });
  if (!form.ok) throw new Error(form.hata);
  return form.deger;
}

/*
  YAZIM VE PUAN DOĞRULAMASI TEK VERİTABANI İŞLEMİNDE (20261115014302).
  Eskiden ekleme satırı yazıp puan tutmazsa İKİNCİ bir çağrıyla siliyor,
  düzenleme ise güncellemeyi yazıp yalnızca hata dönüyordu: silme düşerse
  ya da düzenlemede, yanlış puanlı kayıt kalıyordu. Artık beklenen puanı
  (PR #318 çekirdeği) RPC'ye veriyoruz; işlev tetikleyicinin hesabıyla
  karşılaştırıp tutmazsa hata fırlatıyor ve işlem bütünüyle geri alınıyor.
  Telafi adımı yok. İşlevler security invoker: RLS, sütun yetkileri ve
  tetikleyici aynen geçerli; beklenen değer puanı BELİRLEMEZ, yalnızca
  reddettirir.
*/
/*
  Veritabanı hata kodundan kullanıcı cümlesi saf modülde
  (lib/docentlik-islem → faaliyetYazimHatasi), birim testli: DP001 (puan
  uyuşmazlığı, işlem geri alındı), DP002 (anahtar başka faaliyette),
  42501 (yetki/modül), 23503 (kriter). Burada yalnızca günlük ve fırlatma.
*/
function yazimHatasi(error: { code?: string; message: string }, eylem: "kaydedilmedi" | "değiştirilmedi"): never {
  if (error.code === PUAN_UYUSMAZLIGI) console.error("[docentlik] puan çekirdekle uyuşmadı; işlem geri alındı", error.message);
  throw new Error(faaliyetYazimHatasi(error, eylem));
}

async function faaliyetEkle__impl(formData: FormData) {
  const b = await docentlikBaglami();
  const { yazim, istekAnahtari } = faaliyetFormunuOku(formData);
  const kriter = await kriterOku(b, yazim.criteria_id);
  if (!kriter || !kriter.is_active) throw new Error("Seçilen kriter bulunamadı.");
  const beklenen = beklenenEklemePuani(yazim, kriter);

  /* Çift gönderim (20261114213340) işlevin içinde: aynı istek anahtarı
     ilk kaydı döndürür (tekrar = true), ikinci satır doğmaz. */
  const { data, error } = await b.supabase.rpc("docentlik_faaliyet_ekle", {
    p_org: b.kurum, p_kriter: yazim.criteria_id, p_baslik: yazim.title, p_birim: yazim.unit_count,
    p_yazar_sayisi: yazim.yazar_sayisi, p_baslica: yazim.baslica_yazar, p_tarih: yazim.faaliyet_tarihi,
    p_notlar: yazim.notes, p_istek_anahtari: istekAnahtari,
    p_beklenen_puan: beklenen.puan, p_beklenen_katsayi: beklenen.katsayi, p_beklenen_surum: beklenen.surum,
  });
  if (error) yazimHatasi(error, "kaydedilmedi");
  const sonuc = (data as { kayit_id: string; tekrar: boolean }[] | null)?.[0];
  if (!sonuc) throw new Error("Faaliyet kaydedilmedi: modül ya da üyeliğiniz bu arada kapanmış olabilir.");
  yenile();
  return { id: sonuc.kayit_id, tekrar: sonuc.tekrar };
}

/*
  Düzenleme iyimser eşzamanlılıkla: form, okuduğu kaydın updated_at
  değerini ("surum") geri gönderir; sürüm ZORUNLU. Beklenen puan o sürüme
  göre hesaplanır ve işlev yalnızca o sürüm hâlâ geçerliyse yazar — yani
  karşılaştırma, hesabın dayandığı kayıtla aynı kayda yapılıyor. Arada
  kayıt değiştiyse hiçbir şey yazılmaz; tekrar edilen aynı istek (kayıt
  zaten istenen değerlerde) başarı sayılır, farklıysa kullanıcıya
  yenilemesi söylenir — sessizce üzerine yazmak öteki değişikliği kaybederdi.
*/
async function faaliyetDuzenle__impl(formData: FormData) {
  const b = await docentlikBaglami();
  const id = kimlik(formData, "faaliyet_id", "Faaliyet");
  const surum = String(formData.get("surum") ?? "").trim();
  if (!surum) throw new Error("Kayıt sürümü eksik; sayfayı yenileyip tekrar deneyin.");
  const { yazim } = faaliyetFormunuOku(formData);

  const { data: mevcut, error: okumaHatasi } = await b.supabase.from("docentlik_faaliyetleri").select(KAYIT_SUTUNLARI)
    .eq("id", id).eq("organization_id", b.kurum).eq("owner_id", b.ben).eq("updated_at", surum).maybeSingle();
  okunamadiysaFirlat(okumaHatasi, "Faaliyet");
  if (!mevcut) return ayniIstekMi(b, id, yazim);

  const kriter = await kriterOku(b, yazim.criteria_id);
  /* Kriter değişiyorsa yeni kriter etkin olmalı; değişmiyorsa pasife alınmış kriterin eski kaydı düzenlenebilir kalır (tetikleyiciyle aynı kural). */
  if (!kriter || (!kriter.is_active && yazim.criteria_id !== mevcut.criteria_id)) throw new Error("Seçilen kriter bulunamadı.");
  const beklenen = beklenenDuzenlemePuani(mevcut, yazim, kriter);

  const { data, error } = await b.supabase.rpc("docentlik_faaliyet_duzenle", {
    p_id: id, p_org: b.kurum, p_surum: surum, p_kriter: yazim.criteria_id, p_baslik: yazim.title,
    p_birim: yazim.unit_count, p_yazar_sayisi: yazim.yazar_sayisi, p_baslica: yazim.baslica_yazar,
    p_tarih: yazim.faaliyet_tarihi, p_notlar: yazim.notes,
    p_beklenen_puan: beklenen.puan, p_beklenen_katsayi: beklenen.katsayi, p_beklenen_surum: beklenen.surum,
  });
  if (error) yazimHatasi(error, "değiştirilmedi");
  const sonuc = (data as { kayit_id: string; guncellendi: boolean }[] | null)?.[0];
  if (!sonuc?.guncellendi) return ayniIstekMi(b, id, yazim);
  yenile();
  return { id, tekrar: false };
}

/* Sürüm tutmadı ya da okuma ile yazım arasında kayıt değişti: hiçbir şey yazılmadı. */
async function ayniIstekMi(b: DocentlikBaglami, id: string, yazim: FaaliyetYazimi) {
  const { data: simdiki, error } = await b.supabase.from("docentlik_faaliyetleri").select(KAYIT_SUTUNLARI)
    .eq("id", id).eq("organization_id", b.kurum).eq("owner_id", b.ben).maybeSingle();
  okunamadiysaFirlat(error, "Faaliyet");
  if (!simdiki) throw new Error("Faaliyet değiştirilmedi: kayıt silinmiş, modül kapanmış ya da yetkiniz kalmamış.");
  if (!ayniYazim(simdiki, yazim)) throw new Error("Faaliyet bu arada değişti; sayfayı yenileyip tekrar deneyin.");
  yenile();
  return { id, tekrar: true }; // aynı isteğin tekrarı: zaten kayıtlı
}

function ayniYazim(kayit: Record<string, unknown>, y: FaaliyetYazimi) {
  return kayit.criteria_id === y.criteria_id && kayit.title === y.title && Number(kayit.unit_count) === y.unit_count
    && Number(kayit.yazar_sayisi) === y.yazar_sayisi && Boolean(kayit.baslica_yazar) === y.baslica_yazar
    && (kayit.faaliyet_tarihi ?? null) === y.faaliyet_tarihi && (kayit.notes ?? null) === y.notes;
}

/*
  Silme: önce kayıt, sonra belge nesnesi. Ters sırada nesne silinip kayıt
  silinemezse kayıt var olmayan bir belgeyi gösterirdi; bu sırada en kötü
  durum depoda sahipsiz bir nesne (günlüğe yazılıyor). Zaten silinmiş
  kayıt (tekrar edilen istek) hata değil.
*/
async function faaliyetSil__impl(formData: FormData) {
  const b = await docentlikBaglami();
  const id = kimlik(formData, "faaliyet_id", "Faaliyet");
  const { data, error } = await b.supabase.from("docentlik_faaliyetleri").delete()
    .eq("id", id).eq("organization_id", b.kurum).eq("owner_id", b.ben).select("id, belge_yolu");
  if (error) throw new Error("Faaliyet silinemedi: " + error.message);
  const silinen = data?.[0];
  if (silinen?.belge_yolu) await nesneyiSil(b, silinen.belge_yolu, "faaliyet silindi");
  yenile();
  return { silindi: Boolean(silinen) };
}

/* ====================================================================== */
/* Profil                                                                 */
/* ====================================================================== */

async function profilKaydet__impl(formData: FormData) {
  const b = await docentlikBaglami();
  const form = profilFormu({ doktoraTarihi: metin(formData, "doktora_tarihi"), temelAlan: metin(formData, "temel_alan"), altAlan: metin(formData, "alt_alan") }, todayInIstanbul());
  if (!form.ok) throw new Error(form.hata);
  const { data, error } = await b.supabase.from("docentlik_profilleri")
    .upsert({ organization_id: b.kurum, owner_id: b.ben, ...form.deger, updated_at: new Date().toISOString() }, { onConflict: "organization_id,owner_id" })
    .select("owner_id");
  if (error) throw new Error("Profil kaydedilemedi: " + error.message);
  if (!data?.length) throw new Error("Profil kaydedilemedi: modül ya da üyeliğiniz bu arada kapanmış olabilir.");
  yenile();
}

/* ====================================================================== */
/* Kriter ve hedef (docentlik.kriter_yonet)                               */
/* ====================================================================== */

const KRITER_YETKISI = "Kriter ve hedefleri yönetme yetkiniz yok.";

function kriterFormunuOku(formData: FormData, islem: "ekleme" | "duzenleme") {
  const form = kriterFormu({
    kod: metin(formData, "kod"), etiket: metin(formData, "etiket"), grup: metin(formData, "grup"), birimPuan: metin(formData, "birim_puan"),
    baslicaKatsayi: metin(formData, "baslica_katsayi"), digerKatsayi: metin(formData, "diger_katsayi"), esitBolusum: metin(formData, "esit_bolusum"),
    temelAlan: metin(formData, "temel_alan"), altAlan: metin(formData, "alt_alan"), notlar: metin(formData, "notlar"), aktif: metin(formData, "aktif"),
  }, islem);
  if (!form.ok) throw new Error(form.hata);
  return form.deger;
}

async function kriterEkle__impl(formData: FormData) {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.kriter_yonet", KRITER_YETKISI);
  const { kod, yazim } = kriterFormunuOku(formData, "ekleme");
  const { data, error } = await b.supabase.from("docentlik_kriterleri")
    .insert({ ...yazim, code: kod, organization_id: b.kurum, updated_by: b.ben }).select("id");
  if (error?.code === "23505") throw new Error("Bu kodla bir kriter zaten var (aynı temel alanda).");
  if (error) throw new Error("Kriter kaydedilemedi: " + error.message);
  if (!data?.length) throw new Error("Kriter kaydedilemedi: yetkiniz ya da modül bu arada kapanmış olabilir.");
  yenile();
  return { id: data[0].id as string };
}

/* Puan değişikliği yalnızca bundan sonra eklenen faaliyetlere uygulanır: eski kayıtların puanı tetikleyicide korunuyor (korunanBirimPuan). */
async function kriterDuzenle__impl(formData: FormData) {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.kriter_yonet", KRITER_YETKISI);
  const id = kimlik(formData, "kriter_id", "Kriter");
  const { yazim } = kriterFormunuOku(formData, "duzenleme");
  const { data, error } = await b.supabase.from("docentlik_kriterleri")
    .update({ ...yazim, updated_by: b.ben, updated_at: new Date().toISOString() })
    .eq("id", id).eq("organization_id", b.kurum).select("id");
  if (error) throw new Error("Kriter kaydedilemedi: " + error.message);
  if (!data?.length) throw new Error("Kriter bulunamadı ya da yetkiniz yok.");
  yenile();
}

async function kriterSil__impl(formData: FormData) {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.kriter_yonet", KRITER_YETKISI);
  const id = kimlik(formData, "kriter_id", "Kriter");
  const { data, error } = await b.supabase.from("docentlik_kriterleri").delete().eq("id", id).eq("organization_id", b.kurum).select("id");
  /* Faaliyeti olan kriter silinemez (yabancı anahtar, veri korunur). Yönlendirme: pasife alın. */
  if (error?.code === "23503") throw new Error("Bu kritere bağlı faaliyetler var; silmek yerine pasife alın.");
  if (error) throw new Error("Kriter silinemedi: " + error.message);
  yenile();
  return { silindi: Boolean(data?.length) };
}

async function hedefKaydet__impl(formData: FormData) {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.kriter_yonet", KRITER_YETKISI);
  const form = hedefFormu({
    grup: metin(formData, "grup"), asgari: metin(formData, "asgari_puan"), azami: metin(formData, "azami_puan"),
    doktoraSonrasi: metin(formData, "doktora_sonrasi"), temelAlan: metin(formData, "temel_alan"), altAlan: metin(formData, "alt_alan"), notlar: metin(formData, "notlar"),
  });
  if (!form.ok) throw new Error(form.hata);
  const idHam = String(formData.get("hedef_id") ?? "").trim();
  const yazim = { ...form.deger, updated_by: b.ben, updated_at: new Date().toISOString() };
  const sonuc = idHam
    ? await b.supabase.from("docentlik_hedefleri").update(yazim).eq("id", kimlik(formData, "hedef_id", "Hedef")).eq("organization_id", b.kurum).select("id")
    : await b.supabase.from("docentlik_hedefleri").insert({ ...yazim, organization_id: b.kurum }).select("id");
  if (sonuc.error?.code === "23505") throw new Error("Bu kapsam için (temel alan, alt alan, grup, dönem) zaten bir hedef var.");
  if (sonuc.error) throw new Error("Hedef kaydedilemedi: " + sonuc.error.message);
  if (!sonuc.data?.length) throw new Error("Hedef bulunamadı ya da yetkiniz yok.");
  yenile();
  /* Kimlik döner: formun "başarıda sıfırla" kararı ancak bir değerle verilebiliyor
     (runPanelAction hatada undefined döndürür; değersiz bir işlemin başarısı ayırt edilemez). */
  return { id: sonuc.data[0].id as string };
}

async function hedefSil__impl(formData: FormData) {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.kriter_yonet", KRITER_YETKISI);
  const { data, error } = await b.supabase.from("docentlik_hedefleri").delete()
    .eq("id", kimlik(formData, "hedef_id", "Hedef")).eq("organization_id", b.kurum).select("id");
  if (error) throw new Error("Hedef silinemedi: " + error.message);
  yenile();
  return { silindi: Boolean(data?.length) };
}

/* ====================================================================== */
/* Belgeler (docentlik-belgeleri kovası, 20261114201157)                  */
/* ====================================================================== */

/*
  YÜKLEME AKIŞI. Dosya tarayıcıdan doğrudan kovaya gider (sunucu işlem
  gövdesi büyük dosyayı taşımaz): (1) sunucu yolu üretir, (2) istemci o
  yola yükler, (3) sunucu yolu YENİDEN kurup karşılaştırır, nesneyi
  depodan okuyup boyut/tür/içerik denetler, kaydı günceller. Herhangi bir
  adım düşerse yüklenen nesne silinir (telafi); eski belge ancak kayıt
  yeni yolu aldıktan SONRA silinir — arada bir hata kullanıcıyı belgesiz
  bırakmaz.
*/

/*
  Kayıt doğru durumda; silme düşerse kalan tek iz depoda SAHİPSİZ bir
  nesne. Kova politikası nesneyi kayda bağladığı için (docentlik_belge_izni)
  kimse onu okuyamaz, ama kişisel veri taşıyan bir PDF depoda kalır.
  Bugün yalnızca sabit etiketli bir günlük satırı var
  ("[docentlik][sahipsiz-nesne]") — günlükten aranıp elle silinebilir.
  Kalıcı çözüm (tekrar denenen temizlik kuyruğu + sahipsiz nesne
  taraması) ayrı iş: docs/docentlik-sunucu-islemleri.md → "Depo temizliği".
*/
async function nesneyiSil(b: DocentlikBaglami, yol: string, neden: string) {
  const { error } = await b.supabase.storage.from(DOCENTLIK_KOVASI).remove([yol]);
  if (error) console.error("[docentlik][sahipsiz-nesne]", JSON.stringify({ kova: DOCENTLIK_KOVASI, yol, neden, mesaj: error.message }));
}

async function nesneyiDogrula(b: DocentlikBaglami, yol: string) {
  const { data: bilgi, error } = await b.supabase.storage.from(DOCENTLIK_KOVASI).info(yol);
  if (error || !bilgi) throw new Error("Dosya depoda bulunamadı; lütfen yeniden yükleyin.");
  const uygun = depoNesnesiUygunMu(bilgi);
  if (!uygun.ok) throw new Error(uygun.hata);
  const { data: dosya, error: indirmeHatasi } = await b.supabase.storage.from(DOCENTLIK_KOVASI).download(yol);
  if (indirmeHatasi || !dosya) throw new Error("Yüklenen dosya okunamadı; tekrar deneyin.");
  if (!pdfMi(new Uint8Array(await dosya.slice(0, 8).arrayBuffer()))) throw new Error("Dosya PDF değil. Belgenin PDF'ini yükleyin.");
}

async function kendiFaaliyetim(b: DocentlikBaglami, id: string) {
  const { data, error } = await b.supabase.from("docentlik_faaliyetleri").select("id, belge_yolu")
    .eq("id", id).eq("organization_id", b.kurum).eq("owner_id", b.ben).maybeSingle();
  okunamadiysaFirlat(error, "Faaliyet");
  if (!data) throw new Error("Faaliyet bulunamadı ya da belge ekleme yetkiniz yok.");
  return data;
}

async function belgeYuklemeHazirla__impl(faaliyetId: string) {
  const b = await docentlikBaglami();
  if (!uuidMu(faaliyetId)) throw new Error("Faaliyet seçilmedi.");
  await kendiFaaliyetim(b, faaliyetId);
  return { kova: DOCENTLIK_KOVASI, yol: faaliyetBelgeYolu(b.kurum, b.ben, faaliyetId, crypto.randomUUID()) };
}

async function belgeKaydet__impl(formData: FormData) {
  const b = await docentlikBaglami();
  const id = kimlik(formData, "faaliyet_id", "Faaliyet");
  const yol = String(formData.get("yol") ?? "");
  // İstemcinin gönderdiği yol, sunucunun bu kişi ve faaliyet için kurabileceği tek biçimde değilse hiç dokunulmaz.
  if (!faaliyetBelgeYoluMu(yol, b.kurum, b.ben, id)) throw new Error("Dosya yolu geçersiz.");
  const mevcut = await kendiFaaliyetim(b, id).catch(async (hata) => { await nesneyiSil(b, yol, "faaliyet yok"); throw hata; });
  if (mevcut.belge_yolu === yol) return { yol, tekrar: true }; // aynı isteğin tekrarı
  try {
    await nesneyiDogrula(b, yol);
    /*
      Bağlama service_role işlevinden (belge-baglama.ts): belge_yolu istemciye
      kapalı (20261115145234). İşlev sahip, kurum, modül, nesnenin sahibi/türü/
      boyutu/yaşını yeniden denetler; eski yol beklenenden farklıysa (arada
      başka bir bağlama) hiçbir şey yazmaz ve önceki belge bağlı kalır.
    */
    await belgeyiBagla(b, id, yol, mevcut.belge_yolu);
  } catch (hata) {
    await nesneyiSil(b, yol, "kayıt tamamlanamadı");
    throw hata;
  }
  if (mevcut.belge_yolu) await nesneyiSil(b, mevcut.belge_yolu, "yerine yenisi yüklendi");
  yenile();
  return { yol, tekrar: false };
}

/*
  Kısa ömürlü imzalı adres. Kayıt kullanıcının kendi oturumuyla okunuyor:
  sahibi ya da tumunu_gor değilse RLS satırı göstermiyor; imzayı da depo
  API'si ancak nesneyi okuma politikası izin veriyorsa üretiyor (iki kat).
*/
async function belgeAdresi__impl(faaliyetId: string) {
  const b = await docentlikBaglami();
  if (!uuidMu(faaliyetId)) throw new Error("Faaliyet seçilmedi.");
  const { data, error } = await b.supabase.from("docentlik_faaliyetleri").select("belge_yolu")
    .eq("id", faaliyetId).eq("organization_id", b.kurum).maybeSingle();
  okunamadiysaFirlat(error, "Faaliyet");
  if (!data?.belge_yolu) throw new Error("Belge bulunamadı ya da görme yetkiniz yok.");
  const { data: imza, error: imzaHatasi } = await b.supabase.storage.from(DOCENTLIK_KOVASI).createSignedUrl(data.belge_yolu, IMZALI_ADRES_SANIYE);
  if (imzaHatasi || !imza?.signedUrl) throw new Error("Belge açılamadı; yetkiniz yok ya da dosya bulunamadı.");
  return { adres: imza.signedUrl, saniye: IMZALI_ADRES_SANIYE };
}

/* Önce kayıt, sonra nesne (silmeyle aynı gerekçe). */
async function belgeKaldir__impl(formData: FormData) {
  const b = await docentlikBaglami();
  const id = kimlik(formData, "faaliyet_id", "Faaliyet");
  const mevcut = await kendiFaaliyetim(b, id);
  if (!mevcut.belge_yolu) return { kaldirildi: false };
  await belgeyiKaldir(b, id, mevcut.belge_yolu);
  await nesneyiSil(b, mevcut.belge_yolu, "belge kaldırıldı");
  yenile();
  return { kaldirildi: true };
}

/* ====================================================================== */
/* ÜAK tabloları (docentlik.uak_yonet)                                    */
/* ====================================================================== */

const UAK_YETKISI = "ÜAK tablolarını yönetme yetkiniz yok.";

async function uakYuklemeHazirla__impl() {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.uak_yonet", UAK_YETKISI);
  return { kova: DOCENTLIK_KOVASI, yol: uakBelgeYolu(b.kurum, crypto.randomUUID(), crypto.randomUUID()) };
}

/*
  Bir temel alan için TEK tablo (unique). Var olan tablonun yerine
  yenisini koymak, önce mevcut olanı kaldırmayı gerektiriyor: tablonun
  durum/öneri/onay sütunlarını yalnızca sunucu yolu (service_role)
  sıfırlayabiliyor (K5), kullanıcı oturumuyla yerinde değiştirmek eski
  "onaylandı" durumunu YENİ PDF'in üstünde bırakırdı.
*/
async function uakKaydet__impl(formData: FormData) {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.uak_yonet", UAK_YETKISI);
  const yol = String(formData.get("yol") ?? "");
  if (!uakBelgeYoluMu(yol, b.kurum)) throw new Error("Dosya yolu geçersiz.");
  const temel = metinAlani(formData.get("temel_alan"), "Temel alan", 120, true);
  const donem = metinAlani(formData.get("donem"), "Dönem", 40, true);
  const dosyaAdi = metinAlani(formData.get("dosya_adi"), "Dosya adı", 300);
  for (const alan of [temel, donem, dosyaAdi]) if (!alan.ok) { await nesneyiSil(b, yol, "form geçersiz"); throw new Error(alan.hata); }
  try {
    const { data: var_, error: varHatasi } = await b.supabase.from("docentlik_uak_tablolari").select("id, depo_yolu")
      .eq("organization_id", b.kurum).eq("temel_alan", (temel as { deger: string }).deger).maybeSingle();
    okunamadiysaFirlat(varHatasi, "ÜAK tablosu");
    if (var_) {
      if (var_.depo_yolu === yol) return { id: var_.id as string, tekrar: true };
      throw new Error("Bu temel alan için bir ÜAK tablosu var; yenisini yüklemek için önce mevcut tabloyu kaldırın.");
    }
    await nesneyiDogrula(b, yol);
    const { data, error } = await b.supabase.from("docentlik_uak_tablolari").insert({
      organization_id: b.kurum, temel_alan: (temel as { deger: string }).deger, donem: (donem as { deger: string }).deger,
      dosya_adi: (dosyaAdi as { deger: string | null }).deger, depo_yolu: yol,
    }).select("id");
    if (error) throw new Error("ÜAK tablosu kaydedilemedi: " + error.message);
    if (!data?.length) throw new Error("ÜAK tablosu kaydedilemedi: yetkiniz ya da modül bu arada kapanmış olabilir.");
    yenile();
    return { id: data[0].id as string, tekrar: false };
  } catch (hata) {
    await nesneyiSil(b, yol, "ÜAK kaydı tamamlanamadı");
    throw hata;
  }
}

async function uakAdresi__impl(tabloId: string) {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.uak_yonet", UAK_YETKISI);
  if (!uuidMu(tabloId)) throw new Error("ÜAK tablosu seçilmedi.");
  const { data, error } = await b.supabase.from("docentlik_uak_tablolari").select("depo_yolu").eq("id", tabloId).eq("organization_id", b.kurum).maybeSingle();
  okunamadiysaFirlat(error, "ÜAK tablosu");
  if (!data) throw new Error("ÜAK tablosu bulunamadı.");
  const { data: imza, error: imzaHatasi } = await b.supabase.storage.from(DOCENTLIK_KOVASI).createSignedUrl(data.depo_yolu, IMZALI_ADRES_SANIYE);
  if (imzaHatasi || !imza?.signedUrl) throw new Error("Belge açılamadı.");
  return { adres: imza.signedUrl, saniye: IMZALI_ADRES_SANIYE };
}

async function uakSil__impl(formData: FormData) {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.uak_yonet", UAK_YETKISI);
  const { data, error } = await b.supabase.from("docentlik_uak_tablolari").delete()
    .eq("id", kimlik(formData, "tablo_id", "ÜAK tablosu")).eq("organization_id", b.kurum).select("id, depo_yolu");
  if (error) throw new Error("ÜAK tablosu kaldırılamadı: " + error.message);
  const silinen = data?.[0];
  if (silinen?.depo_yolu) await nesneyiSil(b, silinen.depo_yolu, "ÜAK tablosu kaldırıldı");
  yenile();
  return { silindi: Boolean(silinen) };
}

/*
  ONAY KAPALI (lib/docentlik-islem.ts → UAK_ONAYI_ETKIN). Ayrı bir işlem
  olarak duruyor ki yetkisi ve sözleşmesi şimdiden belli olsun; doğrulama
  gelene kadar her koşulda reddeder ve veritabanına dokunmaz.
*/
async function uakOnayla__impl(formData: FormData) {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.uak_yonet", UAK_YETKISI);
  kimlik(formData, "tablo_id", "ÜAK tablosu");
  const karar = uakOnayKarari();
  throw new Error(karar.neden);
}

/* ====================================================================== */
/* Dışa açılan işlemler: hepsi runPanelAction ile (hata mesajı kullanıcıya) */
/* ====================================================================== */

export async function faaliyetEkle(formData: FormData) { return runPanelAction(() => faaliyetEkle__impl(formData), "Faaliyet eklendi"); }
export async function faaliyetDuzenle(formData: FormData) { return runPanelAction(() => faaliyetDuzenle__impl(formData), "Faaliyet kaydedildi"); }
export async function faaliyetSil(formData: FormData) { return runPanelAction(() => faaliyetSil__impl(formData), "Faaliyet silindi"); }
export async function profilKaydet(formData: FormData) { return runPanelAction(() => profilKaydet__impl(formData), "Profil kaydedildi"); }
export async function kriterEkle(formData: FormData) { return runPanelAction(() => kriterEkle__impl(formData), "Kriter eklendi"); }
export async function kriterDuzenle(formData: FormData) { return runPanelAction(() => kriterDuzenle__impl(formData), "Kriter kaydedildi"); }
export async function kriterSil(formData: FormData) { return runPanelAction(() => kriterSil__impl(formData), "Kriter silindi"); }
export async function hedefKaydet(formData: FormData) { return runPanelAction(() => hedefKaydet__impl(formData), "Hedef kaydedildi"); }
export async function hedefSil(formData: FormData) { return runPanelAction(() => hedefSil__impl(formData), "Hedef silindi"); }
export async function belgeYuklemeHazirla(faaliyetId: string) { return runPanelAction(() => belgeYuklemeHazirla__impl(faaliyetId)); }
export async function belgeKaydet(formData: FormData) { return runPanelAction(() => belgeKaydet__impl(formData), "Belge eklendi"); }
export async function belgeAdresi(faaliyetId: string) { return runPanelAction(() => belgeAdresi__impl(faaliyetId)); }
export async function belgeKaldir(formData: FormData) { return runPanelAction(() => belgeKaldir__impl(formData), "Belge kaldırıldı"); }
export async function uakYuklemeHazirla() { return runPanelAction(() => uakYuklemeHazirla__impl()); }
export async function uakKaydet(formData: FormData) { return runPanelAction(() => uakKaydet__impl(formData), "ÜAK tablosu yüklendi"); }
export async function uakAdresi(tabloId: string) { return runPanelAction(() => uakAdresi__impl(tabloId)); }
export async function uakSil(formData: FormData) { return runPanelAction(() => uakSil__impl(formData), "ÜAK tablosu kaldırıldı"); }
export async function uakOnayla(formData: FormData) { return runPanelAction(() => uakOnayla__impl(formData)); }
