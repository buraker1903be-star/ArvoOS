/*
  ANA SAYFA · OTOMASYONLAR KARTI (26.11.2026) — saf kural.

  Kartın sorusu yöneticinin sorusu: "sistem arka planda neyi bitirdi,
  neye benim dokunmam gerekiyor?". Cevap UYDURULMUYOR: her satır
  vercel.json'daki gerçek zamanlanmış işlere ve onların koşma
  kayıtlarına (platform_cron_kayitlari → lib/cron-isleri) bağlı.

  SEKİZ İŞ, ÜÇ SATIR. Kurucunun ekranında sekiz teknik satır değil,
  üç iş sonucu var; her satır altındaki işlerin EN KÖTÜ durumunu
  gösteriyor, çünkü "ikisi çalıştı biri düştü" hâli yeşil görünmemeli.
  Posta eşitlemesi ve iş adımı terminleri KİRACI panelinin işleri;
  konsolun ana sayfasında yokler — sistem sağlığı ekranında sekizi de
  tek tek duruyor.

  DURUM SÖZLÜĞÜ İŞİN NE YAPTIĞINA GÖRE. "Tamamlandı" bir çekim için,
  "Gönderildi" bir belge/e-posta için doğru kelime; ikisini tek kelimeye
  indirmek kartı tekdüze ve belirsiz yapıyordu.

  "YENİDEN DENENİYOR" UYDURMA DEĞİL: köprü eşitlemesi on dakikada bir
  koşuyor (vercel.json), yani kayıt başarılı ama köprü hâlâ kapalıysa
  sistem gerçekten yeniden deniyor. Köprü hiç yapılandırılmamışsa
  (anahtar yok) bu bir deneme değil, "Bağlı değil".

  Birim testi: tests/unit/konsol-otomasyonlar.test.ts.
*/
import type { CronDurumu } from "../cron-isleri";

export type OtomasyonDurumu =
  | "tamamlandi"
  | "gonderildi"
  | "yeniden"
  | "mudahale"
  | "bagli_degil"
  | "kayit_yok";

export type OtomasyonTonu = "success" | "warning" | "danger" | "neutral";

export type Otomasyon = {
  anahtar: string;
  ad: string;
  /** Satırın altındaki ikincil cümle: son koşma ya da sebebi. */
  detay: string;
  durum: OtomasyonDurumu;
  etiket: string;
  ton: OtomasyonTonu;
  sonCalisma: Date | null;
};

/** Köprülerin yapılandırma/erişim durumu (sayfanın zaten okuduğu bilgi). */
export type KopruDurumu = {
  /** Anahtarı/ortam değişkeni eksik: bu bir arıza değil, kurulmamışlık. */
  yapilandirilmamis: boolean;
  /** Ulaşılamıyor: eşitleme her turda yeniden deniyor. */
  kopuk: boolean;
};

const ETIKET: Record<OtomasyonDurumu, { etiket: string; ton: OtomasyonTonu }> = {
  tamamlandi: { etiket: "Tamamlandı", ton: "success" },
  gonderildi: { etiket: "Gönderildi", ton: "success" },
  yeniden: { etiket: "Yeniden deneniyor", ton: "warning" },
  mudahale: { etiket: "Müdahale gerekiyor", ton: "danger" },
  bagli_degil: { etiket: "Bağlı değil", ton: "neutral" },
  kayit_yok: { etiket: "Kayıt yok", ton: "neutral" },
};

/** Ana sayfadaki üç satır ve altlarındaki gerçek cron yolları. */
export const OTOMASYON_GRUPLARI = [
  {
    anahtar: "tahsilat",
    ad: "Otomatik tahsilat",
    yollar: ["/api/cron/otomatik-yenileme"],
    basarili: "tamamlandi" as const,
  },
  {
    anahtar: "belgeler",
    ad: "Proforma ve hatırlatmalar",
    yollar: ["/api/cron/otomatik-proforma", "/api/cron/abonelik-hatirlatma"],
    basarili: "gonderildi" as const,
  },
  {
    anahtar: "esitleme",
    ad: "Veri senkronizasyonu",
    yollar: ["/api/cron/arvolab-sync", "/api/cron/arc-sync", "/api/cron/randevu-sync"],
    basarili: "tamamlandi" as const,
  },
] as const;

/** En yeni tarih; hiçbiri yoksa null. */
function enYeni(tarihler: (Date | null)[]): Date | null {
  const dolu = tarihler.filter((t): t is Date => t instanceof Date);
  if (!dolu.length) return null;
  return dolu.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}

/**
 * Üç otomasyon satırı.
 *
 * @param durumlar cronDurumlari() çıktısı — sekiz işin hepsi.
 * @param kopruler Ürün köprülerinin durumu; yalnızca "esitleme" satırını
 *   etkiler. Köprü kopuksa kayıt başarılı olsa bile satır yeşil olmaz:
 *   kopya eskiyor ve kurucunun bunu görmesi gerekiyor.
 */
export function otomasyonlar(durumlar: CronDurumu[], kopruler: KopruDurumu[] = []): Otomasyon[] {
  const haritada = new Map(durumlar.map((d) => [d.yol, d]));
  return OTOMASYON_GRUPLARI.map((grup) => {
    const isler = grup.yollar.map((y) => haritada.get(y)).filter((d): d is CronDurumu => Boolean(d));
    const sonCalisma = enYeni(isler.map((i) => i.sonCalisma));
    const sonBasarili = enYeni(isler.map((i) => i.sonBasarili));

    /* Hiç iş bulunamadıysa (yol değişmiş ya da cron kaldırılmış) sessiz
       kalmak yanlış: kart "bu işi göremiyorum" demeli. */
    if (!isler.length) {
      return satir(grup.anahtar, grup.ad, "kayit_yok", "Zamanlanmış iş tanımı bulunamadı.", null);
    }

    const dusen = isler.filter((i) => i.durum === "dustu");
    const geciken = isler.filter((i) => i.durum === "gecikti");
    const kayitsiz = isler.filter((i) => i.durum === "hic");

    if (dusen.length) {
      return satir(grup.anahtar, grup.ad, "mudahale", `${dusen[0].ad}: son koşma düştü.`, sonCalisma);
    }
    if (geciken.length) {
      const gecikme = geciken[0].gecikmeDk;
      return satir(grup.anahtar, grup.ad, "mudahale",
        `${geciken[0].ad}: ${gecikme === null ? "beklenen saatte koşmadı" : `${gecikme} dakika gecikti`}.`, sonCalisma);
    }
    if (kayitsiz.length === isler.length) {
      return satir(grup.anahtar, grup.ad, "kayit_yok", "Henüz çalışma kaydı yok.", null);
    }

    if (grup.anahtar === "esitleme") {
      /* Kayıt temiz ama köprü kapalıysa eşitleme boşa koşuyor. */
      if (kopruler.some((k) => k.yapilandirilmamis)) {
        return satir(grup.anahtar, grup.ad, "bagli_degil", "Bir ürün köprüsünün anahtarı tanımlı değil.", sonBasarili);
      }
      if (kopruler.some((k) => k.kopuk)) {
        return satir(grup.anahtar, grup.ad, "yeniden", "Bir ürüne ulaşılamıyor; eşitleme on dakikada bir yeniden deniyor.", sonBasarili);
      }
    }

    return satir(grup.anahtar, grup.ad, grup.basarili, sonCalismaCumlesi(isler.length, kayitsiz.length), sonBasarili);
  });
}

function sonCalismaCumlesi(toplam: number, kayitsiz: number): string {
  if (!kayitsiz) return toplam === 1 ? "Son çalışma başarılı." : `${toplam} iş de başarılı.`;
  return `${toplam - kayitsiz}/${toplam} iş çalıştı; kalanının kaydı yok.`;
}

function satir(anahtar: string, ad: string, durum: OtomasyonDurumu, detay: string, sonCalisma: Date | null): Otomasyon {
  return { anahtar, ad, detay, durum, sonCalisma, ...ETIKET[durum] };
}

/**
 * Başlığın altındaki "son otomatik kontrol" saati: HERHANGİ bir
 * zamanlanmış işin en yeni BAŞARILI koşması. Başarısız koşmayı saymak
 * "kontrol edildi" demek olurdu; edilmedi.
 */
export function sonOtomatikKontrol(durumlar: CronDurumu[]): Date | null {
  return enYeni(durumlar.map((d) => d.sonBasarili));
}
