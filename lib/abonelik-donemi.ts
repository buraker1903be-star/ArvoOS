/*
  ABONELİK DÖNEM BİLGİSİ (OS-05, 09.11.2026).

  Verinin anlamı (canlı şema ve işlevler):
    - ArvoOS lisansı organization_licenses'ta (kurum başına bir satır);
      ek ürünler (arvolab, arc, randevu) organization_product_licenses'ta.
      İkisi aynı ürünü taşımıyor (ürün tablosunun check kısıtı 'arvoos'u
      kabul etmiyor), öncelik çakışması yok.
    - Deneme sürecindeki (trialing) lisansın bitişi trial_ends_at'te;
      ödenmiş dönemin bitişi current_period_end'de. Platformun yenileme
      takvimi bu kuralla okuyordu (platform/billing/yenileme-takvimi.tsx):
      trialing → trial_ends_at, diğerleri → current_period_end.
    - Ödeme onayı (private.arvo_activate_license_period /
      arvo_activate_product_period) dönemi 1 ay uzatır: dönem bitmediyse
      dönem sonundan, bittiyse (ya da hiç yoksa) ödeme anından; deneme
      süresi ödemeyle biter (trial_ends_at = null), kalan deneme günü
      eklenmez.

  Eskiden kurumun Abonelik ekranı yalnızca current_period_end'i okuyordu:
  deneme sürecindeki kurumda dönem sonu "—" çıkıyordu, oysa deneme bitişi
  kayıtlıydı. Lisans satırı hiç yoksa da durum "Deneme" varsayılıyordu —
  veride karşılığı olmayan bir abonelik türü. Burada yeni bir öncelik
  kuralı YOK: takvimdeki kural ortak yere taşındı.

  Saf modül: tests/unit/abonelik-donemi.test.ts.
*/

export type AbonelikDurumu = "inactive" | "trialing" | "active" | "past_due" | "suspended" | "canceled";

export type DonemGirdisi = {
  /** Lisans satırının durumu; satır hiç yoksa null. */
  durum: string | null;
  donemSonu: string | null;
  denemeSonu: string | null;
};

export type DonemBilgisi = {
  /** Gösterilecek bitiş (ISO) ya da yok. */
  tarih: string | null;
  /** Tarihin etiketi. */
  etiket: "Deneme sonu" | "Dönem sonu";
  /** Tarih yoksa bilinen nedeni; varsa ek not (ör. deneme ödemeyle biter). */
  aciklama: string | null;
  /** Durum bilinmiyor (lisans satırı yok ya da tanınmayan durum). */
  bilinmiyor: boolean;
};

const BILINEN = new Set<string>(["inactive", "trialing", "active", "past_due", "suspended", "canceled"]);

/** Bitiş tarihinin kaynağı: platform yenileme takviminin kuralıyla aynı. */
export function bitisDamgasi(durum: string | null, donemSonu: string | null, denemeSonu: string | null): string | null {
  return durum === "trialing" ? denemeSonu : donemSonu;
}

export function abonelikDonemi({ durum, donemSonu, denemeSonu }: DonemGirdisi): DonemBilgisi {
  if (durum === null) {
    return { tarih: null, etiket: "Dönem sonu", aciklama: "Lisans kaydı bulunamadı; durum ve dönem bilinmiyor. ArvoOS ile iletişime geçin.", bilinmiyor: true };
  }
  if (!BILINEN.has(durum)) {
    return { tarih: null, etiket: "Dönem sonu", aciklama: `Lisans durumu tanınmıyor (${durum}); dönem bilgisi gösterilemiyor.`, bilinmiyor: true };
  }
  const tarih = bitisDamgasi(durum, donemSonu, denemeSonu);
  const etiket = durum === "trialing" ? "Deneme sonu" : "Dönem sonu";
  if (durum === "trialing") {
    return {
      tarih,
      etiket,
      aciklama: tarih
        ? "Ödeme onaylanınca deneme biter; 1 aylık dönem ödeme gününden başlar."
        : "Deneme süresinin bitiş tarihi kayıtlı değil.",
      bilinmiyor: false,
    };
  }
  if (tarih) return { tarih, etiket, aciklama: null, bilinmiyor: false };
  const neden: Record<string, string> = {
    inactive: "Abonelik kapalı; açık dönem yok.",
    canceled: "Abonelik iptal edildi; açık dönem yok.",
    suspended: "Lisans askıda; dönem sonu kayıtlı değil.",
    active: "Lisans aktif, ancak dönem sonu tarihi kayıtlı değil.",
    past_due: "Ödeme gecikmiş; dönem sonu tarihi kayıtlı değil.",
  };
  return { tarih: null, etiket, aciklama: neden[durum], bilinmiyor: false };
}

/** Özetteki "en yakın bitiş": yalnızca açık aboneliklerin (aktif, deneme, gecikmiş) tarihlerinden. */
export function enYakinBitis<T extends { durum: string | null; donem: DonemBilgisi }>(abonelikler: readonly T[]): T | null {
  return abonelikler
    .filter((a) => a.durum !== null && ["active", "trialing", "past_due"].includes(a.durum) && a.donem.tarih)
    .sort((x, y) => String(x.donem.tarih).localeCompare(String(y.donem.tarih)))[0] ?? null;
}

/** Ödeme onayında dönemin nasıl uzadığı (arvo_activate_*_period); kart ve havale metinleri bunu söylüyor. */
export const ODEME_UZAMA_KURALI = "Ödeme onaylanınca dönem 1 ay uzar: dönem bitmediyse dönem sonundan, bittiyse ödeme gününden itibaren.";
