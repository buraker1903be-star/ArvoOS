/*
  DOÇENTLİK SUNUCU İŞLEMLERİNİN SAF ÇEKİRDEĞİ (F6 PR5).

  Sunucu işlemleri (app/panel/docentlik/actions.ts) Next'e ve Supabase'e
  bağlı; birim testinde çalışmıyor. Karar veren her şey burada: form
  doğrulama, belge yolu sözleşmesi, depodan okunan dosyanın kabulü,
  puanın çekirdekle doğrulanması, özet hesabı, ÜAK onay kararı. İşlem
  dosyası yalnızca bunları sırayla çağırıp veritabanına yazıyor.

  PUAN KURALI DEĞİŞMEDİ: hesap lib/docentlik (PR #318, kural sürümü
  arvolab-2026-10-27) ve veritabanındaki tetikleyici (PR #319) ile aynı.
  Buradaki doğrulama ikisinin aynı sonucu verdiğini HER YAZMADA bir kez
  daha sınıyor; istemciden gelen puan hiç okunmuyor.

  Testi tests/unit/docentlik-islem.test.ts.
*/

import { birimSayisiOku, faaliyetAyrintisiOku, hedefPuanlariOku, katsayiOku, kriterPuaniOku, type Sonuc } from "@/lib/docentlik/dogrulama";
import { duzenlemePuani, faaliyetPuani, type PuanKriteri } from "@/lib/docentlik/puan";
import { etkinHedefler, faaliyetDonemi, hedefDurumlari, puanGruplari, tavanUygula, type Hedef, type HedefDurumu, type SayilanGrup } from "@/lib/docentlik/ozet";

/* ---------------------------------------------------------------------- */
/* Sabitler                                                               */
/* ---------------------------------------------------------------------- */

/** 20261114201157'deki kova; adı tek yerde. */
export const DOCENTLIK_KOVASI = "docentlik-belgeleri";
/** Kovanın kendi sınırıyla aynı (20 MB). Sunucu depodan okuyup ayrıca sınar. */
export const BELGE_AZAMI_BAYT = 20 * 1024 * 1024;
/*
  İmzalı adresin ömrü. İmzalı adres, süresi dolana kadar bağlantıyı tutan
  HERKESE erişim veriyor (oturum sormuyor); kısa tutmak, paylaşılan ya da
  günlüğe düşen bir adresin değerini düşürüyor. Ekran adresi tıklanınca
  istiyor, saklamıyor.
*/
export const IMZALI_ADRES_SANIYE = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const uuidMu = (deger: unknown): deger is string => typeof deger === "string" && UUID.test(deger);

const hata = (metin: string): { ok: false; hata: string } => ({ ok: false, hata: metin });
const metin = (ham: unknown) => String(ham ?? "").trim();

/** Uzunluk sınırlı metin alanı; boş ve zorunlu değilse null. */
export function metinAlani(ham: unknown, ad: string, enFazla: number, zorunlu = false): Sonuc<string | null> {
  const m = metin(ham);
  if (!m) return zorunlu ? hata(`${ad} zorunludur.`) : { ok: true, deger: null };
  if (m.length > enFazla) return hata(`${ad} en fazla ${enFazla} karakter olabilir.`);
  return { ok: true, deger: m };
}

/*
  Takvimde gerçekten olan bir gün mü. ArvoLab yalnızca biçime bakıyordu
  ("2024-13-45" geçiyordu, docs/docentlik-puan-cekirdegi.md madde 3);
  veritabanının date sütunu onu zaten reddediyor, ama kullanıcı anlaşılır
  bir cümle yerine veritabanı hatası görürdü. Puan kuralına dokunmuyor:
  biçim denetimi çekirdekte aynen duruyor, bu ek bir ön eleme.
*/
export function gercekTarihMi(deger: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deger)) return false;
  const [y, a, g] = deger.split("-").map(Number);
  const tarih = new Date(Date.UTC(y, a - 1, g));
  return tarih.getUTCFullYear() === y && tarih.getUTCMonth() === a - 1 && tarih.getUTCDate() === g && y >= 1900;
}

/* ---------------------------------------------------------------------- */
/* Formlar                                                                */
/* ---------------------------------------------------------------------- */

export type FaaliyetFormGirdisi = {
  kriterId?: unknown; baslik?: unknown; birimSayisi?: unknown; yazarSayisi?: unknown;
  baslicaYazar?: unknown; faaliyetTarihi?: unknown; notlar?: unknown; istekAnahtari?: unknown;
};

/** Veritabanına giden faaliyet alanları. Hesaplanan sütunlar BİLEREK yok. */
export type FaaliyetYazimi = {
  criteria_id: string;
  title: string;
  unit_count: number;
  yazar_sayisi: number;
  baslica_yazar: boolean;
  faaliyet_tarihi: string | null;
  notes: string | null;
};

export function faaliyetFormu(g: FaaliyetFormGirdisi): Sonuc<{ yazim: FaaliyetYazimi; istekAnahtari: string | null }> {
  if (!uuidMu(metin(g.kriterId))) return hata("Kriter seçilmedi.");
  const baslik = metinAlani(g.baslik, "Başlık", 500, true);
  if (!baslik.ok) return baslik;
  // Hata sırası ArvoLab'la aynı: önce birim, sonra yazar ve tarih (lib/docentlik/puan.ts → faaliyetPuani).
  const birim = birimSayisiOku(g.birimSayisi == null ? null : String(g.birimSayisi));
  if (!birim.ok) return birim;
  if (birim.deger > 100000) return hata("Adet / birim sayısı en fazla 100000 olabilir.");
  const ayrinti = faaliyetAyrintisiOku({
    yazarSayisi: g.yazarSayisi == null ? null : String(g.yazarSayisi),
    baslicaYazar: g.baslicaYazar == null ? null : String(g.baslicaYazar),
    faaliyetTarihi: g.faaliyetTarihi == null ? null : String(g.faaliyetTarihi),
  });
  if (!ayrinti.ok) return ayrinti;
  if (ayrinti.deger.tarih && !gercekTarihMi(ayrinti.deger.tarih)) return hata("Tarih geçersiz.");
  const notlar = metinAlani(g.notlar, "Not", 2000);
  if (!notlar.ok) return notlar;
  const anahtar = metin(g.istekAnahtari);
  if (anahtar && !uuidMu(anahtar)) return hata("İstek anahtarı geçersiz; sayfayı yenileyip tekrar deneyin.");
  return {
    ok: true,
    deger: {
      yazim: {
        criteria_id: metin(g.kriterId),
        title: baslik.deger!,
        unit_count: birim.deger,
        yazar_sayisi: ayrinti.deger.yazarSayisi,
        baslica_yazar: ayrinti.deger.baslica,
        faaliyet_tarihi: ayrinti.deger.tarih,
        notes: notlar.deger,
      },
      istekAnahtari: anahtar || null,
    },
  };
}

export type ProfilYazimi = { doktora_tarihi: string | null; temel_alan: string | null; alt_alan: string | null };

/** Kişinin kendi profili. Doktora tarihi gelecekte olamaz; alt alan temel alansız olamaz. */
export function profilFormu(g: { doktoraTarihi?: unknown; temelAlan?: unknown; altAlan?: unknown }, bugun: string): Sonuc<ProfilYazimi> {
  const tarih = metin(g.doktoraTarihi) || null;
  if (tarih && !gercekTarihMi(tarih)) return hata("Doktora tarihi geçersiz.");
  if (tarih && tarih > bugun) return hata("Doktora tarihi bugünden sonra olamaz.");
  const temel = metinAlani(g.temelAlan, "Temel alan", 120);
  if (!temel.ok) return temel;
  const alt = metinAlani(g.altAlan, "Alt alan", 160);
  if (!alt.ok) return alt;
  // ArvoLab'daki kural: alt alan ancak temel alan seçiliyse anlamlı (scoring.ts → doktoraTarihiKaydet).
  return { ok: true, deger: { doktora_tarihi: tarih, temel_alan: temel.deger, alt_alan: temel.deger ? alt.deger : null } };
}

export type KriterYazimi = {
  label: string; category_group: string | null; points_per_unit: number; notes: string | null;
  baslica_yazar_katsayisi: number | null; diger_yazar_katsayisi: number | null; esit_bolusum: boolean;
  temel_alan: string | null; alt_alan: string | null; is_active: boolean;
};

/*
  Kriter formu. Kod yalnızca eklemede okunur: faaliyetler kritere bağlı,
  kodu sonradan değiştirmek geçmiş kayıtların anlamını değiştirir
  (ArvoLab'da da öyle: "Kriter kodu değiştirilemez").
*/
export function kriterFormu(
  g: { kod?: unknown; etiket?: unknown; grup?: unknown; birimPuan?: unknown; baslicaKatsayi?: unknown; digerKatsayi?: unknown;
       esitBolusum?: unknown; temelAlan?: unknown; altAlan?: unknown; notlar?: unknown; aktif?: unknown },
  islem: "ekleme" | "duzenleme",
): Sonuc<{ kod: string | null; yazim: KriterYazimi }> {
  let kod: string | null = null;
  if (islem === "ekleme") {
    const k = metinAlani(g.kod, "Kod", 40, true);
    if (!k.ok) return k;
    kod = k.deger;
  }
  const etiket = metinAlani(g.etiket, "Etiket", 300, true);
  if (!etiket.ok) return etiket;
  const grup = metinAlani(g.grup, "Grup", 120);
  if (!grup.ok) return grup;
  const puan = kriterPuaniOku(g.birimPuan == null ? null : String(g.birimPuan), islem);
  if (!puan.ok) return puan;
  if (puan.deger > 100000) return hata("Birim başına puan en fazla 100000 olabilir.");
  const baslica = katsayiOku(g.baslicaKatsayi == null ? null : String(g.baslicaKatsayi));
  if (!baslica.ok) return baslica;
  const diger = katsayiOku(g.digerKatsayi == null ? null : String(g.digerKatsayi));
  if (!diger.ok) return diger;
  const temel = metinAlani(g.temelAlan, "Temel alan", 120);
  if (!temel.ok) return temel;
  const alt = metinAlani(g.altAlan, "Alt alan", 160);
  if (!alt.ok) return alt;
  const notlar = metinAlani(g.notlar, "Not", 2000);
  if (!notlar.ok) return notlar;
  return {
    ok: true,
    deger: {
      kod,
      yazim: {
        label: etiket.deger!, category_group: grup.deger, points_per_unit: puan.deger, notes: notlar.deger,
        baslica_yazar_katsayisi: baslica.deger, diger_yazar_katsayisi: diger.deger,
        esit_bolusum: metin(g.esitBolusum) === "1" || g.esitBolusum === true,
        temel_alan: temel.deger, alt_alan: temel.deger ? alt.deger : null,
        is_active: !(metin(g.aktif) === "0" || g.aktif === false),
      },
    },
  };
}

export type HedefYazimi = {
  grup: string | null; asgari_puan: number | null; azami_puan: number | null; doktora_sonrasi: boolean;
  temel_alan: string | null; alt_alan: string | null; notlar: string | null;
};

export function hedefFormu(g: { grup?: unknown; asgari?: unknown; azami?: unknown; doktoraSonrasi?: unknown; temelAlan?: unknown; altAlan?: unknown; notlar?: unknown }): Sonuc<HedefYazimi> {
  const doktoraSonrasi = metin(g.doktoraSonrasi) === "1" || g.doktoraSonrasi === true;
  const puanlar = hedefPuanlariOku({
    asgariPuan: g.asgari == null ? null : String(g.asgari),
    azamiPuan: g.azami == null ? null : String(g.azami),
    doktoraSonrasi,
  });
  if (!puanlar.ok) return puanlar;
  for (const p of [puanlar.deger.asgari, puanlar.deger.azami]) if (p !== null && p > 100000) return hata("Puanlar en fazla 100000 olabilir.");
  const grup = metinAlani(g.grup, "Grup", 120);
  if (!grup.ok) return grup;
  const temel = metinAlani(g.temelAlan, "Temel alan", 120);
  if (!temel.ok) return temel;
  const alt = metinAlani(g.altAlan, "Alt alan", 160);
  if (!alt.ok) return alt;
  const notlar = metinAlani(g.notlar, "Not", 1000);
  if (!notlar.ok) return notlar;
  return {
    ok: true,
    deger: {
      grup: grup.deger, asgari_puan: puanlar.deger.asgari, azami_puan: puanlar.deger.azami, doktora_sonrasi: doktoraSonrasi,
      temel_alan: temel.deger, alt_alan: temel.deger ? alt.deger : null, notlar: notlar.deger,
    },
  };
}

/* ---------------------------------------------------------------------- */
/* Belge yolu sözleşmesi (20261114201157)                                  */
/* ---------------------------------------------------------------------- */

/*
  Yolu SUNUCU üretir, istemci yalnızca o yola yükler. Kayıt sırasında
  gelen yol yeniden kurulup karşılaştırılır: istemcinin gönderdiği yol hiç
  "olduğu gibi" kabul edilmiyor. Dosya adı kullanıcının dosya adı değil,
  rastgele bir kimlik (ad metinde saklanır): yol hiçbir kullanıcı metni
  taşımadığı için "..", boşluk ya da özel karakter sorunu doğmuyor.
*/
export const faaliyetBelgeOneki = (kurum: string, sahip: string, faaliyet: string) => `${kurum}/faaliyet/${sahip}/${faaliyet}/`;

export function faaliyetBelgeYolu(kurum: string, sahip: string, faaliyet: string, rastgele: string): string {
  if (![kurum, sahip, faaliyet, rastgele].every(uuidMu)) throw new Error("Belge yolu kurulamadı.");
  return `${faaliyetBelgeOneki(kurum, sahip, faaliyet)}${rastgele}.pdf`;
}

export function faaliyetBelgeYoluMu(yol: unknown, kurum: string, sahip: string, faaliyet: string): yol is string {
  if (typeof yol !== "string") return false;
  const onek = faaliyetBelgeOneki(kurum, sahip, faaliyet);
  if (!yol.startsWith(onek)) return false;
  const kalan = yol.slice(onek.length);
  return kalan.endsWith(".pdf") && uuidMu(kalan.slice(0, -4));
}

export function uakBelgeYolu(kurum: string, klasor: string, rastgele: string): string {
  if (![kurum, klasor, rastgele].every(uuidMu)) throw new Error("Belge yolu kurulamadı.");
  return `${kurum}/uak/${klasor}/${rastgele}.pdf`;
}

export function uakBelgeYoluMu(yol: unknown, kurum: string): yol is string {
  if (typeof yol !== "string") return false;
  const parca = yol.split("/");
  return parca.length === 4 && parca[0] === kurum && parca[1] === "uak" && uuidMu(parca[2])
    && parca[3].endsWith(".pdf") && uuidMu(parca[3].slice(0, -4));
}

/*
  Depodan okunan nesne kabul edilebilir mi. Boyut ve tür istemcinin
  söylediği değil, depo API'sinin (storage.info) döndürdüğü; kovanın
  kendi sınırı da aynı (yalnızca PDF, 20 MB). Tür bildirimi istemcinin
  yükleme başlığından geliyor, bu yüzden içerik ayrıca pdfMi ile sınanır.
*/
export function depoNesnesiUygunMu(bilgi: { size?: unknown; contentType?: unknown } | null | undefined): Sonuc<number> {
  if (!bilgi) return hata("Dosya depoda bulunamadı; lütfen yeniden yükleyin.");
  const boyut = Number(bilgi.size ?? 0);
  const tur = String(bilgi.contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!Number.isFinite(boyut) || boyut <= 0) return hata("Dosya boş.");
  if (boyut > BELGE_AZAMI_BAYT) return hata("Dosya 20 MB sınırını aşıyor.");
  if (tur !== "application/pdf") return hata("Yalnızca PDF yüklenebilir.");
  return { ok: true, deger: boyut };
}

/** Dosyanın gerçekten PDF olduğu: ilk baytlar "%PDF-". Uzantı ve bildirilen tür değiştirilebilir. */
export function pdfMi(baytlar: Uint8Array): boolean {
  const imza = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return baytlar.length >= imza.length && imza.every((b, i) => baytlar[i] === b);
}

/* ---------------------------------------------------------------------- */
/* Puanın doğrulanması                                                    */
/* ---------------------------------------------------------------------- */

/** Veritabanından gelen numeric (metin ya da sayı) çekirdeğin sayısıyla birebir mi. */
export const sayiEsitMi = (beklenen: number, kayit: unknown) => Object.is(Number(kayit), beklenen);

export type KriterSatiri = {
  points_per_unit: number | string; baslica_yazar_katsayisi: number | string | null;
  diger_yazar_katsayisi: number | string | null; esit_bolusum: boolean;
};

/** Veritabanının numeric sütunları metin gelebilir; çekirdek sayı istiyor. */
export const puanKriteri = (k: KriterSatiri): PuanKriteri => ({
  points_per_unit: Number(k.points_per_unit),
  baslica_yazar_katsayisi: k.baslica_yazar_katsayisi == null ? null : Number(k.baslica_yazar_katsayisi),
  diger_yazar_katsayisi: k.diger_yazar_katsayisi == null ? null : Number(k.diger_yazar_katsayisi),
  esit_bolusum: Boolean(k.esit_bolusum),
});

const cekirdekGirdisi = (y: FaaliyetYazimi) => ({
  birimSayisi: String(y.unit_count),
  yazarSayisi: String(y.yazar_sayisi),
  baslicaYazar: y.baslica_yazar ? "evet" : "hayir",
  faaliyetTarihi: y.faaliyet_tarihi,
});

/*
  Beklenen puan, katsayı ve KURAL SÜRÜMÜ. Sürüm de karşılaştırılıyor:
  tetikleyici (20261114200939) ileride başka bir kural sürümüyle yazmaya
  başlarsa ama çekirdek eski sürümle hesaplarsa, sayılar tesadüfen tutsa
  bile kayıt "hangi kuralla hesaplandı" sorusuna yanlış cevap taşırdı.
  Karşılaştırmanın kendisi veritabanında, yazımla AYNI işlemde
  (20261115014302); burada yalnızca beklenen hesaplanıyor.
*/
export type BeklenenPuan = { puan: number; katsayi: number; surum: string };

/** Eklemede beklenen puan: lib/docentlik/puan.ts → faaliyetPuani. */
export function beklenenEklemePuani(y: FaaliyetYazimi, kriter: KriterSatiri): BeklenenPuan {
  const s = faaliyetPuani(cekirdekGirdisi(y), puanKriteri(kriter));
  if (!s.ok) throw new Error(s.hata);
  return { puan: s.deger.puan, katsayi: s.deger.paylasimKatsayisi, surum: s.deger.kuralSurumu };
}

export type MevcutFaaliyet = {
  criteria_id: string; unit_count: number | string; computed_points: number | string;
  paylasim_katsayisi: number | string; yazar_sayisi: number; baslica_yazar: boolean; kural_surumu: string;
};

/*
  Hesabın girdileri değişti mi — tetikleyicideki koşulun birebir aynısı
  (20261114200939 → docentlik_faaliyet_puani). Değişmediyse puana
  dokunulmaz: başlık, not ya da belge değişikliği puanı değiştirmez.
*/
export function hesapGirdileriAyniMi(m: MevcutFaaliyet, y: FaaliyetYazimi): boolean {
  const baslica = y.yazar_sayisi === 1 ? true : y.baslica_yazar;
  return Number(m.unit_count) === y.unit_count && m.criteria_id === y.criteria_id
    && Number(m.yazar_sayisi) === y.yazar_sayisi && Boolean(m.baslica_yazar) === baslica;
}

/** Düzenlemede beklenen puan: girdiler aynıysa eski değer, değilse duzenlemePuani. */
export function beklenenDuzenlemePuani(m: MevcutFaaliyet, y: FaaliyetYazimi, kriter: KriterSatiri): BeklenenPuan {
  // Girdiler aynıyken tetikleyici puanı, katsayıyı VE sürümü olduğu gibi bırakıyor.
  if (hesapGirdileriAyniMi(m, y)) return { puan: Number(m.computed_points), katsayi: Number(m.paylasim_katsayisi), surum: m.kural_surumu };
  const s = duzenlemePuani(cekirdekGirdisi(y), {
    criteria_id: m.criteria_id,
    unit_count: Number(m.unit_count),
    computed_points: Number(m.computed_points),
    paylasim_katsayisi: Number(m.paylasim_katsayisi),
    yazar_sayisi: Number(m.yazar_sayisi),
    baslica_yazar: Boolean(m.baslica_yazar),
  }, y.criteria_id, () => puanKriteri(kriter));
  if (!s.ok) throw new Error(s.hata);
  return { puan: s.deger.puan, katsayi: s.deger.paylasimKatsayisi, surum: s.deger.kuralSurumu };
}

/**
 * Kayıt beklenenle aynı mı. Sunucu işlemi bunu artık YAZIMDAN SONRA sormuyor
 * (yazım ve karşılaştırma tek işlemde, 20261115014302); veritabanı
 * işlevlerinin karşılaştırmasının TS ikizi olarak testlerde kullanılıyor.
 */
export const puanDogrulandiMi = (beklenen: BeklenenPuan, kayit: { computed_points: unknown; paylasim_katsayisi: unknown; kural_surumu: unknown }) =>
  sayiEsitMi(beklenen.puan, kayit.computed_points) && sayiEsitMi(beklenen.katsayi, kayit.paylasim_katsayisi)
  && beklenen.surum === kayit.kural_surumu;

/* ---------------------------------------------------------------------- */
/* Yazım hatası → kullanıcı cümlesi                                       */
/* ---------------------------------------------------------------------- */

/* Puan uyuşmazlığı: işlem geri alındı (20261115014302). */
export const PUAN_UYUSMAZLIGI = "DP001";
/* Aynı istek anahtarı FARKLI içerikle geldi (20261115101820): bu bir tekrar
   değil; ilk kaydı "kaydedildi" diye döndürmek yeni faaliyeti sessizce kaybederdi. */
export const ANAHTAR_BASKA_ICERIKTE = "DP002";

/*
  Faaliyet ekleme/düzenleme RPC'sinin hatasından kullanıcı cümlesi. Saf ve
  testli: cümle, kullanıcının NE YAPACAĞINI söylemeli (yöneticiye bildir,
  sayfayı yenile, yetkini kontrol et). Bilinmeyen hata veritabanının
  metnini taşır — kod listede yok diye boş "hata oluştu" demek, destek
  ekibinin sebebi bulmasını imkânsızlaştırırdı.
*/
export function faaliyetYazimHatasi(error: { code?: string | null; message: string }, eylem: "kaydedilmedi" | "değiştirilmedi"): string {
  switch (error.code) {
    case PUAN_UYUSMAZLIGI: return `Puan doğrulanamadı; faaliyet ${eylem}. Lütfen yöneticinize bildirin.`;
    case ANAHTAR_BASKA_ICERIKTE: return "Bu form daha önce başka bir faaliyetle gönderilmiş; faaliyet kaydedilmedi. Sayfayı yenileyip yeniden girin.";
    case "23503": return "Seçilen kriter bulunamadı.";
    case "42501": return `Faaliyet ${eylem}: modül ya da üyeliğiniz kapanmış olabilir.`;
    default: return `Faaliyet ${eylem}: ${error.message}`;
  }
}

/* ---------------------------------------------------------------------- */
/* Özet: grup puanları, tavan, hedef durumları (lib/docentlik/ozet.ts)     */
/* ---------------------------------------------------------------------- */

export type OzetFaaliyeti = { computed_points: number | string; criteria_id: string; donem: "sonra" | "once" | "bilinmiyor" };
export type OzetKriteri = { id: string; category_group: string | null };

/*
  ArvoLab'daki ekranın kurgusu (PR #318'deki ozet testleriyle aynı):
  bütün faaliyetler gruplanır ve tavan uygulanır; doktora tarihi
  biliniyorsa yalnızca "sonra" dönemindekiler ayrıca gruplanır; hedef
  durumları ikisinden hesaplanır. Doktora tarihi bilinmiyorsa doktora
  sonrası şartı ölçülmez (yanlış alarm verilmez).

  Dönem çağırandan geliyor: kişinin kendi ekranında tarihten
  (faaliyetDonemi), gözetim ekranında tarihi göstermeyen
  docentlik_faaliyet_donemleri işlevinden.
*/
export function docentlikOzeti(g: {
  faaliyetler: readonly OzetFaaliyeti[];
  kriterler: readonly OzetKriteri[];
  hedefler: readonly Hedef[];
  kurum: string;
  temelAlan: string | null;
  altAlan: string | null;
  doktoraTarihiBiliniyor: boolean;
}): {
  toplam: number; ham: number; gruplar: SayilanGrup<OzetFaaliyeti>[]; sonraToplam: number | null;
  toplamHedefleri: HedefDurumu[]; grupHedefleri: HedefDurumu[];
  /** Doktora tarihi bilinmediği için ÖLÇÜLEMEYEN doktora sonrası hedef sayısı (ekranda "hesaplanamadı" demek için). */
  olculemeyenHedefSayisi: number;
} {
  const grupHaritasi = new Map(g.kriterler.map((k) => [k.id, k.category_group]));
  const kayit = (f: OzetFaaliyeti) => ({ ...f, computed_points: Number(f.computed_points), criteria: { category_group: grupHaritasi.get(f.criteria_id) ?? null } });
  const etkin = etkinHedefler([...g.hedefler], g.kurum, g.temelAlan, g.altAlan);
  const tum = tavanUygula(puanGruplari(g.faaliyetler.map(kayit)), etkin);
  const sonra = g.doktoraTarihiBiliniyor
    ? tavanUygula(puanGruplari(g.faaliyetler.filter((f) => f.donem === "sonra").map(kayit)), etkin)
    : null;
  const durum = hedefDurumlari(etkin, tum, sonra);
  /* Çekirdek bu hedefleri sessizce atlıyor (yanlış alarm vermemek için);
     ekran ise "şart yok" ile "şart var ama ölçülemedi"yi ayırmalı — yoksa
     doktora tarihini girmemiş kişi doktora sonrası şartı hiç yokmuş sanır. */
  const olculemeyenHedefSayisi = sonra === null
    ? etkin.filter((h) => h.doktora_sonrasi && h.asgari_puan != null && Number(h.asgari_puan) > 0).length
    : 0;
  return {
    olculemeyenHedefSayisi,
    toplam: tum.toplam,
    ham: tum.ham,
    gruplar: tum.gruplar as unknown as SayilanGrup<OzetFaaliyeti>[],
    sonraToplam: sonra?.toplam ?? null,
    ...durum,
  };
}

/** Kişinin kendi ekranında dönem, kendi doktora tarihinden (çekirdekteki kural). */
export const kendiDonemi = (faaliyetTarihi: string | null, doktoraTarihi: string | null) => faaliyetDonemi(faaliyetTarihi, doktoraTarihi);

/* ---------------------------------------------------------------------- */
/* ÜAK onayı                                                              */
/* ---------------------------------------------------------------------- */

/*
  ÜAK ÖNERİSİNİN ONAYI KAPALI. ArvoLab'da öneri yapay zekâ ile PDF'ten
  okunuyor ve önerideki her sayının PDF metninde geçtiği doğrulanıyordu
  (lib/ai/uak-tablosu.ts). Bu PR'da yapay zekâ ve PDF metni okuma yok:
  doğrulanmamış bir öneriyi onaylamak, kurumun bütün akademisyenlerine
  uydurma olabilecek kriter ve hedef yazmak demek. Doğrulama gelene kadar
  onay işlemi her koşulda reddeder; sabit bilerek koddadır, panelden
  açılamaz.
*/
export const UAK_ONAYI_ETKIN = false as const;

export function uakOnayKarari(): { izin: false; neden: string } {
  return { izin: false, neden: "ÜAK önerisi onayı henüz etkin değil: önerinin PDF içeriğiyle doğrulanması hazır olmadan onaylanamaz." };
}

/*
  BELGE BAĞLAMA İŞLEVİNİN HATA KODLARI (20261115145234 → docentlik_belge_bagla /
  docentlik_belge_kaldir). Sunucunun ham iletisi kullanıcıya gitmiyor; her
  kodun Türkçe karşılığı burada. Bilinmeyen kod genel mesaja düşer (yol ya
  da kimlik sızmasın).
*/
export function belgeBaglamaHatasi(error: { code?: string | null; message?: string | null }): string {
  switch (error.code) {
    case "DB403": return "Bu faaliyete belge ekleme yetkiniz yok ya da modül kapalı.";
    case "DB404": return "Dosya depoda bulunamadı; yeniden yükleyin.";
    case "DB409": return "Belge bu arada değişti; sayfayı yenileyip yeniden deneyin.";
    case "DB410": return "Yükleme zaman aşımına uğradı; dosyayı yeniden yükleyin.";
    case "DB415": return "Dosya PDF değil ya da boyutu uygun değil.";
    case "DB400": return "Belge bilgisi eksik.";
    case "42501": return "Belge ekleme yetkiniz yok.";
    default: return "Belge kaydedilemedi; lütfen yeniden deneyin.";
  }
}
