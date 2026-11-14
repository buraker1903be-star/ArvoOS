/*
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
  Ondalık kayması birikmesin diye 6 haneye yuvarlanıyor: kriter puanları
  0.1 adımlı, ama 0.1 × 3 / 3 kayan noktada 0.10000000000000002 döner ve
  her düzenlemede bir hane daha kayardı.
*/
const YUVARLA = 1e6;

export function korunanBirimPuan(kayit: KayitliPuan, yeniKriterId: string): number | null {
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

  return Math.round((puan / (birim * katsayi)) * YUVARLA) / YUVARLA;
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
*/
type PaylasimKurali = { baslica_yazar_katsayisi?: number | null; diger_yazar_katsayisi?: number | null; esit_bolusum?: boolean | null };

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

export const puanHesapla = (birim: number, birimPuan: number, katsayi: number) =>
  Math.round(birim * birimPuan * katsayi * YUVARLA) / YUVARLA;
