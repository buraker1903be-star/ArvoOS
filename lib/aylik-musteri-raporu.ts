/*
  AYLIK MÜŞTERİ RAPORU (02.11.2026) — saf kural. Ekran
  app/panel/platform/rapor, testi tests/unit/aylik-musteri-raporu.test.ts.

  Ay sonunda kurucunun sorduğu üç soru tek sayfada: kaç yeni müşteri
  geldi, kaçı gitti, gelir ne oldu. Gelir tahsilat işlevinden
  (platform_tahsilat_aylik), müşteri hareketleri buradan.

  "KAYBEDİLDİ" NASIL ÖLÇÜLÜYOR: kayıp = bugün AÇIK HİÇBİR lisansı
  olmayan müşteri; kaybın günü lisanslarının EN SON kapandığı gün.
  Lisansın kapandığı an 02.11.2026'dan beri tutuluyor (closed_at,
  migration 20261102101259 — tetikleyici yazıyor). Ondan önce kapanan
  lisansta bu an bilinmiyor; orada dönem sonu (ya da deneme sonu)
  kullanılıyor — "dönemi bu ay bitti ve yenilenmedi". updated_at
  kullanılmıyor: her düzenlemede değişiyor. Bireysel abonede de
  kapanış anı (closed_at) esas.

  Türkiye günü: sunucu UTC; ayın ilk gecesi 00:00–03:00 arasında açılan
  kayıt önceki aya düşmesin (turkiyeGunu).

  Arvo'nun kendisi ve grup markaları müşteri değil (lib/kurum-turu).
*/
import { turkiyeGunu } from "./otomatik-proforma";
import { kurumTuru } from "./kurum-turu";

const ACIK = new Set(["active", "trialing", "past_due"]);

export type RaporKurumu = {
  id: string; ad: string; kind: string | null; grup_markasi: boolean | null; created_at: string;
  license_status: string | null; current_period_end: string | null; trial_ends_at: string | null;
  /** Lisansın kapandığı an (02.11.2026'dan beri tutuluyor); bilinmiyorsa null. */
  closed_at?: string | null;
  /** Kayıp nedeni ve notu (lib/kapanis-nedeni, 02.11.2026'dan beri). */
  kapanis_nedeni?: string | null;
  kapanis_notu?: string | null;
};
export type RaporLisansi = { organization_id: string; product: string; status: string; current_period_end: string | null; trial_ends_at: string | null; created_at: string; closed_at?: string | null; kapanis_nedeni?: string | null; kapanis_notu?: string | null };
export type RaporAbonesi = { id: string; ad: string; product: string; status: string; created_at: string; closed_at: string | null; current_period_end: string | null; trial_ends_at: string | null };

/** "2026-11-01" → ["2026-11-01", "2026-11-30"]. */
export function ayAraligi(ay: string): [string, string] {
  const [y, a] = ay.split("-").map(Number);
  return [ay, new Date(Date.UTC(y, a, 0)).toISOString().slice(0, 10)];
}

const icinde = (damga: string | null | undefined, [bas, son]: [string, string]) => {
  if (!damga) return false;
  const gun = turkiyeGunu(damga);
  return gun >= bas && gun <= son;
};

/** Lisansın bittiği gün: denemedeyse deneme sonu, değilse dönem sonu; ikisi de yoksa null. */
const bitis = (durum: string | null, donem: string | null, deneme: string | null) =>
  (durum === "trialing" ? deneme ?? donem : donem ?? deneme);

export type AylikRapor = {
  yeniKurumlar: RaporKurumu[];
  yeniAboneler: RaporAbonesi[];
  /** neden/not: SON kapanan lisanstan (müşteriyi kaybettiren kapanış). */
  kaybedilenKurumlar: (RaporKurumu & { bitis: string; neden: string | null; not: string | null })[];
  kaybedilenAboneler: (RaporAbonesi & { bitis: string })[];
  /** Mevcut müşterinin bu ay açtığı EK ürün (ilk ürünü değil): büyüme. */
  ekUrunler: (RaporLisansi & { kurumAdi: string })[];
};

export function aylikRapor(ay: string, kurumlar: RaporKurumu[], lisanslar: RaporLisansi[], aboneler: RaporAbonesi[]): AylikRapor {
  const aralik = ayAraligi(ay);
  const musteriler = kurumlar.filter((k) => kurumTuru(k) === "musteri");
  const musteriAdi = new Map(musteriler.map((k) => [k.id, k.ad]));
  const kurumLisanslari = new Map<string, RaporLisansi[]>();
  for (const l of lisanslar) kurumLisanslari.set(l.organization_id, [...(kurumLisanslari.get(l.organization_id) ?? []), l]);

  const yeniKurumlar = musteriler.filter((k) => icinde(k.created_at, aralik));
  const yeniIdler = new Set(yeniKurumlar.map((k) => k.id));

  const kaybedilenKurumlar = musteriler.flatMap((k) => {
    const ekler = kurumLisanslari.get(k.id) ?? [];
    const acikVar = ACIK.has(k.license_status ?? "") || ekler.some((l) => ACIK.has(l.status));
    if (acikVar) return [];
    /* Hiç açılmamış (inactive, kapanışı yok) ürün bitiş saymıyor: "kullanmıyor" bir kayıp değil.
       Eskiden bütün inactive satırlar düşüyordu; oysa konsolun ürün formu ürünü
       "Kapalı" (inactive) yaparak kapatıyor ve o kapanış kaybın tarihi. */
    /* Kapanış anı biliniyorsa o, bilinmiyorsa dönem sonu. */
    /* Kayıp nedeni SON kapanan lisanstan: müşteriyi kaybettiren o kapanış;
       aynı gün kapananlarda nedeni yazılmış olan öne alınır. */
    const kapanislar = [
      k.license_status ? { tarih: k.closed_at ?? bitis(k.license_status, k.current_period_end, k.trial_ends_at), neden: k.kapanis_nedeni ?? null, not: k.kapanis_notu ?? null } : null,
      ...ekler.filter((l) => l.status !== "inactive" || l.closed_at)
        .map((l) => ({ tarih: l.closed_at ?? bitis(l.status, l.current_period_end, l.trial_ends_at), neden: l.kapanis_nedeni ?? null, not: l.kapanis_notu ?? null })),
    ].flatMap((x) => (x?.tarih ? [{ ...x, gun: turkiyeGunu(x.tarih) }] : []))
      .sort((a, b) => a.gun.localeCompare(b.gun) || Number(Boolean(a.neden)) - Number(Boolean(b.neden)));
    const son = kapanislar.at(-1);
    return son && icinde(son.gun, aralik) ? [{ ...k, bitis: son.gun, neden: son.neden, not: son.not }] : [];
  });

  const yeniAboneler = aboneler.filter((a) => icinde(a.created_at, aralik));
  const kaybedilenAboneler = aboneler.flatMap((a) => {
    if (ACIK.has(a.status)) return [];
    const son = a.closed_at ?? bitis(a.status, a.current_period_end, a.trial_ends_at);
    return son && icinde(son, aralik) ? [{ ...a, bitis: turkiyeGunu(son) }] : [];
  });

  /* Ek ürün: bu ay açılmış ürün lisansı, kurum bu ay YENİ değilse (yeni
     kurumun ilk ürünleri zaten "yeni müşteri"de sayılıyor). */
  const ekUrunler = lisanslar
    .filter((l) => musteriAdi.has(l.organization_id) && !yeniIdler.has(l.organization_id) && l.status !== "inactive" && icinde(l.created_at, aralik))
    .map((l) => ({ ...l, kurumAdi: musteriAdi.get(l.organization_id)! }));

  return { yeniKurumlar, yeniAboneler, kaybedilenKurumlar, kaybedilenAboneler, ekUrunler };
}

/** Önceki aya göre değişim yüzdesi; önceki ay sıfırsa null ("—"). */
export function degisimYuzdesi(bu: number, onceki: number): number | null {
  if (!onceki) return null;
  return Math.round(((bu - onceki) / onceki) * 100);
}
