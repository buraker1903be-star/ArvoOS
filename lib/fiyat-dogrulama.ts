/*
  FİYAT YAYIMI: ÖNİZLEME VE DOĞRULAMA (14.10.2026, Kurucu Konsolu).

  Konsoldan yayımlanan fiyat aynı anda ücretler sayfasına (TR/EN),
  JSON-LD'ye, llms.txt'ye ve kurulumun liste fiyatına gidiyor. Eskiden
  her basamak ayrı ayrı ve hiçbir denetimden geçmeden yayımlanıyordu:
  "1.990" yerine "19.900" yazmak ya da Başlangıç'ı Kurumsal'dan pahalı
  yapmak, sitede o an görünürdü.

  Burada yayımlanacak değişikliklerin listesi (önce → sonra, yüzde) ve
  iki tür bulgu üretiliyor:
   - HATA: yayımı durdurur. Basamak merdiveni bozuluyor.
   - UYARI: kurucunun açıkça onaylaması gerekir. Büyük değişim, ücretsiz
     basamak, rakamın sitedeki yerini "Teklif"e bırakması.

  Saf modül: birim testi tests/unit/fiyat-dogrulama.test.ts. Aynı
  denetim hem önizlemede hem sunucu işleminde çalışıyor; önizlemeyi
  atlayan bir istek de yayımlayamasın.
*/
import { ADD_ONS, PLANS, type PricedProduct } from "./site/pricing";
import { SATIS_PARA_BIRIMLERI, paraBirimiCoz, paraYaz, tutar as paraTutari, type ParaBirimi } from "./para";
import { birimliPlanTutari, fiyatAnahtari, type CokParaliFiyatlar } from "./site/fiyat-kaynagi";

export type FiyatKaydi = {
  kod: string;
  /** ISO kodu. Eski satırlarda sütun yoktu; okuyucu TRY varsayıyor. */
  para_birimi: ParaBirimi;
  aylik_kurus: number | null;
  taslak_kurus: number | null;
  yayimlandi_at: string | null;
  taslak_bekliyor: boolean;
};

export type BekleyenDegisiklik = {
  kod: string;
  /** Hangi para biriminin taslağı. Aynı plan iki birimde ayrı karardır. */
  paraBirimi: ParaBirimi;
  /** Plan için ürün, ek kalem için "ek". */
  urun: PricedProduct | "ek";
  /** Sitede şu an geçerli tutar (kod + yayımlanmış). null = teklif. */
  eski: number | null;
  /** Yayımlanınca geçerli olacak tutar. null = teklif. */
  yeni: number | null;
  /** Yüzde değişim; eski ya da yeni teklif/0 ise null. */
  yuzde: number | null;
};

/** Büyük değişim eşiği (yüzde). Bu kadar ya da fazlası açık onay ister. */
export const BUYUK_DEGISIM_YUZDE = 50;

const urunu = (kod: string): PricedProduct | "ek" | null =>
  PLANS.find((plan) => plan.code === kod)?.product ?? (ADD_ONS.some((kalem) => kalem.code === kod) ? "ek" : null);

/** Bekleyen taslaklar; tanınmayan kod (kodda olmayan eski basamak) atlanır. */
export function bekleyenDegisiklikler(kayitlar: readonly FiyatKaydi[], gecerli: CokParaliFiyatlar): BekleyenDegisiklik[] {
  return kayitlar.flatMap((kayit) => {
    if (!kayit.taslak_bekliyor) return [];
    const urun = urunu(kayit.kod);
    if (!urun) return [];
    /* Karşılaştırma AYNI BİRİMDE: USD taslağının "eski"si USD fiyatıdır,
       TL fiyatı değil. Yoksa yüzde değişim anlamsız bir sayı olurdu. */
    const eski = birimliPlanTutari(kayit.kod, kayit.para_birimi, gecerli);
    const yeni = kayit.taslak_kurus === null ? null : Number(kayit.taslak_kurus);
    const yuzde = eski && yeni !== null && eski > 0 ? Math.round(((yeni - eski) / eski) * 1000) / 10 : null;
    return [{ kod: kayit.kod, paraBirimi: kayit.para_birimi, urun, eski, yeni, yuzde }];
  });
}

/** Değişiklikler yayımlanınca geçerli olacak fiyat tablosu. */
export function yayimSonrasi(gecerli: CokParaliFiyatlar, degisiklikler: readonly BekleyenDegisiklik[]): CokParaliFiyatlar {
  const sonuc: CokParaliFiyatlar = new Map(gecerli);
  for (const d of degisiklikler) sonuc.set(fiyatAnahtari(d.kod, d.paraBirimi), d.yeni);
  return sonuc;
}

const tl = (kurus: number, birim: ParaBirimi) => paraYaz(paraTutari(kurus, birim));
const adi = (kod: string) => {
  const plan = PLANS.find((p) => p.code === kod);
  return plan ? `${plan.ad.tr} (${kod})` : kod;
};

/**
 * Yayımlanacak listenin denetimi.
 *
 * Merdiven kuralı ürünün fiyatlama biçimine göre:
 *  - Kurum başına satılan üründe (ArvoOS, ArvoARC, Randevu) fiyatlı
 *    basamaklar listedeki sırayla ARTMALI; üst basamak daha fazlasını
 *    satıyor, ucuz olması merdiveni anlamsız kılar.
 *  - Kişi başına satılan üründe (ArvoLab) hacim basamağı (en az N
 *    kullanıcı şartlı) koltuk başına tekil basamaktan UCUZ olmalı —
 *    sebebi o indirim. Ekip'in Araştırmacı'dan ucuz olması hata değil,
 *    tasarımın kendisi.
 */
export function fiyatDenetimi(sonra: CokParaliFiyatlar, degisiklikler: readonly BekleyenDegisiklik[]): { hatalar: string[]; uyarilar: string[] } {
  const hatalar: string[] = [];
  const uyarilar: string[] = [];

  /*
    MERDİVEN HER PARA BİRİMİNDE AYRI DENETLENİYOR. TRY listesi ile USD
    listesi birbirinden bağımsız yayımlanabiliyor; birini ötekinin
    rakamlarıyla karşılaştırmak (4.990 TRY > 119 USD) anlamsız bir hata
    üretirdi. Bir birimde fiyatı olmayan basamak o birimin
    merdiveninde yok sayılıyor — eksik USD fiyatı ayrı bir uyarı
    konusu, merdiven hatası değil.
  */
  for (const birim of SATIS_PARA_BIRIMLERI) {
    const tutar = (kod: string) => birimliPlanTutari(kod, birim, sonra);
    const urunler = [...new Set(PLANS.map((plan) => plan.product))];
    for (const urun of urunler) {
      const basamaklar = PLANS.filter((plan) => plan.product === urun);
      if (basamaklar.some((plan) => plan.kisiBasi)) {
        const tekil = basamaklar.find((plan) => plan.kisiBasi && !plan.enAzKullanici);
        for (const hacim of basamaklar.filter((plan) => plan.kisiBasi && plan.enAzKullanici)) {
          const t = tekil ? tutar(tekil.code) : null;
          const h = tutar(hacim.code);
          if (t !== null && h !== null && h >= t) {
            hatalar.push(`${adi(hacim.code)} hacim indirimi; koltuk başı ${tl(h, birim)}, ${adi(tekil!.code)} ${tl(t, birim)} — indirimli basamak daha ucuz olmalı.`);
          }
        }
        continue;
      }
      const fiyatli = basamaklar.map((plan) => ({ plan, t: tutar(plan.code) })).filter((b) => b.t !== null) as { plan: (typeof basamaklar)[number]; t: number }[];
      for (let i = 1; i < fiyatli.length; i++) {
        if (fiyatli[i].t <= fiyatli[i - 1].t) {
          hatalar.push(`${adi(fiyatli[i].plan.code)} ${tl(fiyatli[i].t, birim)}, altındaki ${adi(fiyatli[i - 1].plan.code)} ${tl(fiyatli[i - 1].t, birim)} — üst basamak daha pahalı olmalı.`);
        }
      }
    }
  }

  for (const d of degisiklikler) {
    if (d.yuzde !== null && Math.abs(d.yuzde) >= BUYUK_DEGISIM_YUZDE) {
      uyarilar.push(`${adi(d.kod)}: ${tl(d.eski!, d.paraBirimi)} → ${tl(d.yeni!, d.paraBirimi)} (%${d.yuzde > 0 ? "+" : ""}${d.yuzde.toLocaleString("tr-TR")}). Yazım hatası değilse onaylayın.`);
    }
    if (d.yeni === 0) uyarilar.push(`${adi(d.kod)} ${d.paraBirimi} listesinde ücretsiz yayımlanacak.`);
    if (d.eski !== null && d.yeni === null) uyarilar.push(`${adi(d.kod)} ${d.paraBirimi} listesinde teklif usulüne geçiyor: rakam yerine "Teklif" görünecek.`);
  }
  return { hatalar, uyarilar };
}

/**
 * Veritabanı satırından FiyatKaydi. taslak_bekliyor sütunu
 * 20261014064505'te geldi; o uygulanmadan önce okunan satırda yok ve
 * eski kural geçerli: yayındakinden farklı bir taslak "bekliyor".
 */
export function fiyatKaydi(ham: {
  kod: string; aylik_kurus: number | string | null; taslak_kurus: number | string | null;
  yayimlandi_at: string | null; taslak_bekliyor?: boolean | null; para_birimi?: string | null;
}): FiyatKaydi {
  const aylik = ham.aylik_kurus === null ? null : Number(ham.aylik_kurus);
  const taslak = ham.taslak_kurus === null ? null : Number(ham.taslak_kurus);
  return {
    kod: ham.kod,
    /* Sütun 28.11.2026'da geldi; öncesinde yazılmış her satır TRY.
       Tanınmayan bir değer de TRY sayılmıyor, TRY'ye DÜŞÜYOR —
       bilinmeyen birimi USD saymak, TL tutarını dolar göstermekti. */
    para_birimi: paraBirimiCoz(ham.para_birimi) ?? "TRY",
    aylik_kurus: aylik,
    taslak_kurus: taslak,
    yayimlandi_at: ham.yayimlandi_at,
    taslak_bekliyor: typeof ham.taslak_bekliyor === "boolean" ? ham.taslak_bekliyor : taslak !== null && taslak !== aylik,
  };
}

/*
  ÖNİZLEMENİN KAPSAM İMZASI (27.11.2026 ara kontrolü).

  Yayım işlemi bekleyen BÜTÜN taslakları yayımlıyor (14.10.2026
  kararı: yarı güncel liste olmasın). Ekran bunu önceden yazıyor —
  etkilenen ürünler listeleniyor ve ayrı bir onay kutusu isteniyor —
  ama ONAY ile GÖNDERİM arasında taslak kümesi değişebiliyordu:
  başka bir sekmede ya da başka bir kurucu tarafından yeni bir
  basamak taslağa alınırsa, kurucu görmediği bir değişikliği
  yayımlamış oluyordu. Ekrandaki liste doğru, onay yanlış şeye
  verilmiş oluyordu.

  İmza önizlemede neyin GÖSTERİLDİĞİNİ taşıyor; işlem onu yeniden
  hesaplayıp karşılaştırıyor. Fark varsa yayım yapılmıyor, ekran
  tazeleniyor ve onay yeniden isteniyor.

  Sıralı ve kod+PARA BİRİMİ+tutar üçlüsünden: aynı küme farklı sırayla
  gelse de aynı imza çıkmalı, tutarı değişen bir basamak ise FARKLI
  kabul edilmeli (aynı kod, başka rakam = başka karar). Para birimi
  28.11.2026'da eklendi: aynı planın USD ve TRY taslağı iki ayrı
  karardır ve biri ötekinin onayıyla yayımlanamaz. Veritabanındaki
  ikizi public.platform_fiyat_kapsam_imzasi() aynı biçimi üretiyor.
*/
export function kapsamImzasi(degisiklikler: readonly { kod: string; paraBirimi: ParaBirimi; yeni: number | null }[]): string {
  return [...degisiklikler]
    .map((d) => `${d.kod}:${d.paraBirimi}:${d.yeni === null ? "teklif" : d.yeni}`)
    .sort()
    .join("|");
}
