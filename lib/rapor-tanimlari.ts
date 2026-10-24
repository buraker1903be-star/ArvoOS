/*
  SEKİZ RAPORUN TANIMI — tek kaynak.

  Rapor merkezi, pencere başlığı, yetki kapısı ve yazdırma künyesi
  hepsi buradan okuyor. Tanımı iki yerde tutmak (kartta bir başlık,
  pencerede başka bir başlık) bu depoda defalarca sapma üretti.

  RAPOR KODU çıktıda yazıyor: "hangi rapordu bu" sorusu kâğıda
  basıldıktan sonra da yanıtlanabilsin diye. Kod kalıcıdır,
  değiştirilmez — eski bir çıktıdaki kod bugünkü rapora işaret
  etmeli.

  YETKİ ANAHTARI burada; rapor merkezi kartı, pencere ve dışa
  aktarma aynı anahtarı soruyor (lib/yetkiler.ts). Üç yerde üç ayrı
  kontrol yazmak, birinin unutulması demek.

  Saf modül: testi tests/unit/rapor-tanimlari.test.ts.
*/

import type { IkonAdi } from "@/lib/rapor-ikonlari";

export type RaporAnahtari =
  | "kokpit" | "satis" | "crm" | "tahsilat"
  | "finans" | "personel" | "operasyon" | "teklif";

export type RaporTanimi = {
  anahtar: RaporAnahtari;
  /** Çıktıda yazan kalıcı kod. */
  kod: string;
  baslik: string;
  aciklama: string;
  ikon: IkonAdi;
  /** lib/yetkiler.ts anahtarı. */
  yetki: string;
  /** Tutar gösteriyor mu? Operasyon departmanında tutar maskeli
   *  (migration 20261023184948); kart bunu söyleyebilsin diye. */
  tutarIceriyor: boolean;
};

export const RAPORLAR: readonly RaporTanimi[] = [
  {
    anahtar: "kokpit", kod: "RPR-00", baslik: "Yönetici Kokpiti",
    aciklama: "Bütün raporların özeti ve dikkat gerektiren durumlar",
    ikon: "spark", yetki: "rapor.kokpit", tutarIceriyor: true,
  },
  {
    anahtar: "satis", kod: "RPR-01", baslik: "Satış Analitiği",
    aciklama: "Satış tutarı, adedi, dönüşüm ve personel kırılımı",
    ikon: "seal", yetki: "rapor.satis", tutarIceriyor: true,
  },
  {
    anahtar: "crm", kod: "RPR-02", baslik: "CRM ve Müşteri Analitiği",
    aciklama: "Müşteri kazanımı, kaynak dağılımı ve tekrar satış",
    ikon: "users", yetki: "rapor.crm", tutarIceriyor: true,
  },
  {
    anahtar: "tahsilat", kod: "RPR-03", baslik: "Tahsilat ve Alacak",
    aciklama: "Tahsil edilen, bekleyen ve vadesi geçen alacaklar",
    ikon: "wallet", yetki: "rapor.tahsilat", tutarIceriyor: true,
  },
  {
    anahtar: "finans", kod: "RPR-04", baslik: "Finansal Performans",
    aciklama: "Gelir, gider, kârlılık ve nakit akışı",
    ikon: "chart", yetki: "rapor.finans", tutarIceriyor: true,
  },
  {
    anahtar: "personel", kod: "RPR-05", baslik: "Personel Performansı",
    aciklama: "Kişi bazlı satış, iş yükü ve tamamlama süresi",
    ikon: "badge", yetki: "rapor.personel", tutarIceriyor: true,
  },
  {
    anahtar: "operasyon", kod: "RPR-06", baslik: "Operasyon ve İş Akışı",
    aciklama: "Devam eden, tamamlanan ve geciken işler",
    ikon: "briefcase", yetki: "rapor.operasyon", tutarIceriyor: false,
  },
  {
    anahtar: "teklif", kod: "RPR-07", baslik: "Teklif ve Sözleşme",
    aciklama: "Teklif dönüşümü, imza bekleyen ve aktif sözleşmeler",
    ikon: "doc", yetki: "rapor.teklif", tutarIceriyor: true,
  },
] as const;

const ANAHTARLAR = new Set<string>(RAPORLAR.map((r) => r.anahtar));

/** Adresten gelen değer gerçek bir rapor mu? */
export function raporBul(deger: string | null | undefined): RaporTanimi | null {
  if (!deger || !ANAHTARLAR.has(deger)) return null;
  return RAPORLAR.find((r) => r.anahtar === deger) ?? null;
}

/** Kullanıcının açabildiği raporlar. */
export function gorulebilenRaporlar(izin: (anahtar: string) => boolean): RaporTanimi[] {
  return RAPORLAR.filter((rapor) => izin(rapor.yetki));
}

/*
  PENCERE ADRESİ. Rapor adresten açılıyor (bu depodaki `?pencere=`
  kalıbının aynısı) ve bunun üç bedavası var:

  - sorgular SUNUCUDA kalıyor, yani RLS kendiliğinden uygulanıyor;
  - geri tuşu çalışıyor, önceki rapora dönülüyor;
  - filtreler adreste olduğu için raporlar arası geçişte TAŞINIYOR
    ve bağlantı paylaşılabiliyor.

  `tasinan` listesi hangi filtrelerin geçişte korunacağını söylüyor:
  tarih aralığı her raporda anlamlı, personel/müşteri yalnızca
  ilgili raporda. Hepsini taşımak, teklif raporunu "operasyon
  aşaması" ile süzmeye kalkmak olurdu.
*/
const TASINAN = ["aralik", "baslangic", "bitis", "personel", "musteri"] as const;

export function raporAdresi(
  taban: string,
  anahtar: RaporAnahtari,
  mevcut: URLSearchParams | Record<string, string | undefined>,
  ek: Record<string, string | undefined> = {},
): string {
  const oku = (ad: string) =>
    mevcut instanceof URLSearchParams ? mevcut.get(ad) ?? undefined : mevcut[ad];

  const p = new URLSearchParams();
  p.set("rapor", anahtar);
  for (const ad of TASINAN) {
    const deger = oku(ad);
    if (deger) p.set(ad, deger);
  }
  for (const [ad, deger] of Object.entries(ek)) {
    if (deger) p.set(ad, deger);
    else p.delete(ad);
  }
  return `${taban}?${p.toString()}`;
}

/** Pencereyi kapatan adres: rapora ait olmayan parametreler korunur. */
export function kapatmaAdresi(
  taban: string,
  mevcut: URLSearchParams | Record<string, string | undefined>,
): string {
  const giris = mevcut instanceof URLSearchParams
    ? [...mevcut.entries()]
    : Object.entries(mevcut).filter(([, v]) => v !== undefined) as [string, string][];
  const p = new URLSearchParams();
  for (const [ad, deger] of giris) {
    /* Rapora özel olanlar düşüyor; dönem seçimi sayfada kalıyor ki
       pencere kapanınca merkez aynı dönemi göstersin. */
    if (ad === "rapor" || ad === "personel" || ad === "musteri" || ad === "durum") continue;
    if (deger) p.set(ad, deger);
  }
  const sorgu = p.toString();
  return sorgu ? `${taban}?${sorgu}` : taban;
}
