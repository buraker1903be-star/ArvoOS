/*
  AYLIK MÜŞTERİ RAPORU (02.11.2026) — saf kural. Ekran
  app/panel/platform/rapor, testi tests/unit/aylik-musteri-raporu.test.ts.

  Ay sonunda kurucunun sorduğu üç soru tek sayfada: kaç yeni müşteri
  geldi, kaçı gitti, gelir ne oldu. Gelir tahsilat işlevinden
  (platform_tahsilat_aylik), müşteri hareketleri buradan.

  "KAYBEDİLDİ" NASIL ÖLÇÜLÜYOR: lisans tablolarında iptal TARİHİ yok
  (yalnızca durum ve dönem sonu var; updated_at her düzenlemede
  değişiyor, o yüzden kullanılmıyor). Kayıp = bugün AÇIK HİÇBİR lisansı
  olmayan ve son lisans döneminin (ya da denemesinin) bittiği gün o ay
  içinde olan müşteri — "dönemi bu ay bitti ve yenilenmedi". Bireysel
  abonede kapanış anı (closed_at) varsa o esas.

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
};
export type RaporLisansi = { organization_id: string; product: string; status: string; current_period_end: string | null; trial_ends_at: string | null; created_at: string };
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
  kaybedilenKurumlar: (RaporKurumu & { bitis: string })[];
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
    /* Hiç lisansı olmamış (inactive) ürünler bitiş saymıyor: "kullanmıyor" bir kayıp değil. */
    const bitisler = [
      k.license_status ? bitis(k.license_status, k.current_period_end, k.trial_ends_at) : null,
      ...ekler.filter((l) => l.status !== "inactive").map((l) => bitis(l.status, l.current_period_end, l.trial_ends_at)),
    ].filter((d): d is string => Boolean(d)).map(turkiyeGunu).sort();
    const son = bitisler.at(-1);
    return son && icinde(son, aralik) ? [{ ...k, bitis: son }] : [];
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
