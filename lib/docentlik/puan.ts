/*
  DOÇENTLİK PUANI: FAALİYET PUANI (14.11.2026, F6 PR1 — ArvoLab'dan taşındı).

  Kaynak: ArvoLab lib/docentlik-puan.ts (b62bfcf). Algoritmalar BİREBİR
  aynı; değişen yalnızca tiplerin dışa açılması ve yuvarlama çarpanının
  kural sürümünden okunması (varsayılan sürümde değer ve işlem sırası
  kaynakla aynı).

  Saf modül: Next, Supabase, oturum ya da veritabanı yok. Girdi düz
  değerler, çıktı düz değerler; aynı girdi her zaman aynı çıktıyı verir.

  İki katman var:
   - Alt düzey fonksiyonlar (korunanBirimPuan, paylasimKatsayisi,
     paylasimTanimli, puanHesapla) kaynakla AYNI sözleşmede: bozuk girdide
     kaynak ne döndürüyorsa onu döndürür (ör. puanHesapla(NaN, …) NaN).
     Eşdeğerlik testi bunları kaynağa karşı Object.is ile sınıyor;
     davranışlarını "iyileştirmek" eşdeğerliği bozar.
   - Cephe fonksiyonları (faaliyetPuani, duzenlemePuani) ArvoLab'ın
     sunucu işleminde (app/actions/scoring.ts) satır içi duran ekleme ve
     düzenleme mantığını taşır. Bozuk girdiyi fırlatmadan, ArvoLab'ın
     kullanıcıya gösterdiği hata metniyle `{ ok: false }` olarak döndürür.
*/

import { VARSAYILAN_KURAL, yuvarla, type KuralSeti } from "./kural-surumu";
import { birimSayisiOku, faaliyetAyrintisiOku, type Sonuc } from "./dogrulama";

/*
  Aşağıdaki gerekçe yorumları kaynaktan (ArvoLab lib/docentlik-puan.ts)
  aynen alınmıştır.

  Doçentlik faaliyet kaydı DÜZENLENİRKEN birim puanın nereden geleceği.

  Kriter puanı değiştiğinde eski kayıtlar yeniden fiyatlanmaz; bu, ekranda
  kullanıcıya verilmiş bir söz ("Puan değişikliği yalnızca bundan sonra
  eklenen faaliyetlere uygulanır"). Düzenleme eklenince söz sessizce
  bozulabilirdi: başlıktaki bir yazım hatasını düzelten kullanıcının toplam
  puanı, kriterin bu arada değişmiş güncel puanıyla yeniden hesaplanırdı.

  Bu yüzden kriter AYNI kaldığı sürece birim puan kaydın kendisinden geri
  türetilir. Tabloda ayrı bir sütunu yok; computed_points = unit_count ×
  birim puan olarak yazıldığı için bölme onu geri verir.

  Kriter DEĞİŞTİYSE türetilmiş puanın anlamı kalmaz — kullanıcı artık başka
  bir faaliyet beyan ediyor — ve çağıran yeni kriterin güncel puanına bakar.
  null dönmesi "bilmiyorum, sen bak" demektir; 0 dönmek bunu sessizce
  "puansız faaliyet"e çevirirdi.
*/

export interface KayitliPuan {
  criteria_id: string;
  unit_count: number;
  computed_points: number;
  /** Kayıt anındaki ortak yazarlık katsayısı (20261027081037); eski satırlarda 1. */
  paylasim_katsayisi?: number | null;
}

/*
  Ondalık kayması birikmesin diye 6 haneye yuvarlanıyor (kural sürümündeki
  yuvarlamaCarpani): kriter puanları 0.1 adımlı, ama 0.1 × 3 / 3 kayan
  noktada 0.10000000000000002 döner ve her düzenlemede bir hane daha kayardı.
*/
export function korunanBirimPuan(kayit: KayitliPuan, yeniKriterId: string, kural: KuralSeti = VARSAYILAN_KURAL): number | null {
  if (kayit.criteria_id !== yeniKriterId) return null;

  const birim = Number(kayit.unit_count);
  const puan = Number(kayit.computed_points);
  /* Katsayı da bölünüyor: computed_points = birim × birim puan × katsayı.
     Bölünmeseydi ortak yazarlı bir kaydın başlığını düzelten kullanıcının
     birim puanı katsayı kadar küçülür, puanı her düzenlemede yeniden
     paylaştırılırdı. */
  const katsayi = Number(kayit.paylasim_katsayisi ?? 1);
  // Bozuk/eski satır (0 birim, sayı olmayan puan): türetmek yerine kritere sorulur.
  if (!Number.isFinite(birim) || birim <= 0 || !Number.isFinite(puan)) return null;
  if (!Number.isFinite(katsayi) || katsayi <= 0) return null;

  return yuvarla(puan / (birim * katsayi), kural);
}

/*
  ORTAK YAZARLIK KATSAYISI. Kural kriterde, Yönetici'nin girdiği:
  - eşit bölüşüm: puan yazar sayısına bölünür (1/n). ÜAK tablolarının
    çoğu böyle yazıyor ("puan yazarlar arasında eşit olarak bölünür");
    27.10.2026'ya kadar ifade edilemiyordu ve ortak yazarlı her yayın
    tam puan sayılıyordu.
  - ya da iki sayı: başlıca yazar ve diğer yazarlar.
  Tek yazarlı faaliyet ya da kuralı girilmemiş kriter TAM puan alır —
  bilinmeyen bir paylaşım kuralını tahmin etmek, yanlış bir puanı doğru
  gibi göstermek olurdu.

  (Taşımada eklenen not) Eşit bölüşüm tanımlıysa başlıca/diğer
  katsayılarının ÖNÜNE geçer ve yazar sayısı Math.floor ile tam sayıya
  indirilir; form yalnızca tam sayı kabul ettiği için olağan akışta etkisi
  yok. İkisi de kaynağın davranışı, değiştirilmedi.
*/
export type PaylasimKurali = {
  baslica_yazar_katsayisi?: number | null;
  diger_yazar_katsayisi?: number | null;
  esit_bolusum?: boolean | null;
};

export function paylasimKatsayisi(kriter: PaylasimKurali | null, yazarSayisi: number, baslica: boolean): number {
  if (!kriter || !Number.isFinite(yazarSayisi) || yazarSayisi <= 1) return 1;
  /* Yuvarlanmıyor: 1/3'ü 0,333333'e indirmek 30 puanı 9,99999 yapardı. Puan, hesabın sonunda yuvarlanıyor (puanHesapla). */
  if (kriter.esit_bolusum) return 1 / Math.floor(yazarSayisi);
  const k = baslica ? kriter.baslica_yazar_katsayisi : kriter.diger_yazar_katsayisi;
  const sayi = Number(k);
  return k === null || k === undefined || !Number.isFinite(sayi) || sayi <= 0 || sayi > 1 ? 1 : sayi;
}

/** Kriterde ortak yazarlık kuralı tanımlı mı. */
export const paylasimTanimli = (kriter: PaylasimKurali | null) =>
  Boolean(kriter && (kriter.esit_bolusum || kriter.baslica_yazar_katsayisi != null || kriter.diger_yazar_katsayisi != null));

export const puanHesapla = (birim: number, birimPuan: number, katsayi: number, kural: KuralSeti = VARSAYILAN_KURAL) =>
  yuvarla(birim * birimPuan * katsayi, kural);

/* ---------------------------------------------------------------------- */
/* Cephe: ArvoLab app/actions/scoring.ts ekleme/düzenleme mantığı.        */
/* ---------------------------------------------------------------------- */

/** Kriter satırından hesabın kullandığı alanlar. */
export type PuanKriteri = PaylasimKurali & { points_per_unit: number };

/** Form alanları ham metin olarak; ArvoLab'da FormData'dan aynı adlarla okunuyordu. */
export type FaaliyetGirdisi = {
  /** "unitCount"; boşsa 1. */
  birimSayisi?: string | null;
  /** "yazarSayisi"; boşsa 1. */
  yazarSayisi?: string | null;
  /** "baslicaYazar"; varsayılan "evet". Tek yazarlı faaliyette yok sayılır. */
  baslicaYazar?: string | null;
  /** "faaliyetTarihi"; YYYY-AA-GG ya da boş. */
  faaliyetTarihi?: string | null;
};

export type FaaliyetPuani = {
  birimSayisi: number;
  yazarSayisi: number;
  baslica: boolean;
  tarih: string | null;
  /** Kayda yazılan birim puan (eklemede kriterin puanı, düzenlemede korunmuş olabilir). */
  birimPuan: number;
  paylasimKatsayisi: number;
  puan: number;
  /** Düzenlemede kaydın kendi birim puanı ve katsayısı korunduysa true. */
  korundu: boolean;
  kuralSurumu: string;
};

/*
  Eklemedeki hesap. ArvoLab'da hata sırası: önce birim sayısı, sonra yazar
  ve tarih — kullanıcıya ilk hatalı alan gösteriliyor, sıra korunur.
*/
export function faaliyetPuani(girdi: FaaliyetGirdisi, kriter: PuanKriteri, kural: KuralSeti = VARSAYILAN_KURAL): Sonuc<FaaliyetPuani> {
  const birim = birimSayisiOku(girdi.birimSayisi);
  if (!birim.ok) return birim;
  const ayrinti = faaliyetAyrintisiOku(girdi, kural);
  if (!ayrinti.ok) return ayrinti;
  const birimPuan = Number(kriter.points_per_unit);
  const katsayi = paylasimKatsayisi(kriter, ayrinti.deger.yazarSayisi, ayrinti.deger.baslica);
  return {
    ok: true,
    deger: {
      birimSayisi: birim.deger,
      ...ayrinti.deger,
      birimPuan,
      paylasimKatsayisi: katsayi,
      puan: puanHesapla(birim.deger, birimPuan, katsayi, kural),
      korundu: false,
      kuralSurumu: kural.kod,
    },
  };
}

/** Düzenlenen kaydın veritabanındaki hâli. */
export type MevcutKayit = KayitliPuan & {
  yazar_sayisi?: number | null;
  baslica_yazar?: boolean | null;
};

/*
  Düzenlemedeki hesap. Kriter ve yazar bilgisi aynı kaldıysa kaydın kendi
  birim puanı VE katsayısı korunur (kriter tablosu sonradan değişmiş
  olabilir; başlık düzeltmesi puanı değiştirmemeli). Kriter değiştiyse
  birim puan kriterden, yazar bilgisi değiştiyse katsayı kriterden
  yeniden hesaplanır.

  Kriter yalnızca gerektiğinde okunur; ArvoLab'da da kriter satırı ancak
  bir şey yeniden hesaplanacaksa çekiliyordu. Bu yüzden `kriter` bir
  fonksiyon: çağıran gerekmedikçe veritabanına gitmez.
*/
export function duzenlemePuani(
  girdi: FaaliyetGirdisi,
  mevcut: MevcutKayit,
  kriterId: string,
  kriter: () => PuanKriteri,
  kural: KuralSeti = VARSAYILAN_KURAL,
): Sonuc<FaaliyetPuani> {
  const birim = birimSayisiOku(girdi.birimSayisi);
  if (!birim.ok) return birim;
  const ayrinti = faaliyetAyrintisiOku(girdi, kural);
  if (!ayrinti.ok) return ayrinti;
  const { yazarSayisi, baslica } = ayrinti.deger;

  let birimPuan = korunanBirimPuan(mevcut, kriterId, kural);
  const yazarAyni = Number(mevcut.yazar_sayisi ?? 1) === yazarSayisi && Boolean(mevcut.baslica_yazar ?? true) === baslica;
  let katsayi = birimPuan !== null && yazarAyni ? Number(mevcut.paylasim_katsayisi ?? 1) : null;
  const korundu = birimPuan !== null && katsayi !== null;
  if (birimPuan === null || katsayi === null) {
    const k = kriter();
    if (birimPuan === null) birimPuan = Number(k.points_per_unit);
    katsayi = paylasimKatsayisi(k, yazarSayisi, baslica);
  }
  return {
    ok: true,
    deger: {
      birimSayisi: birim.deger,
      ...ayrinti.deger,
      birimPuan,
      paylasimKatsayisi: katsayi,
      puan: puanHesapla(birim.deger, birimPuan, katsayi, kural),
      korundu,
      kuralSurumu: kural.kod,
    },
  };
}
