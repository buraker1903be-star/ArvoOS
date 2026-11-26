/*
  ÜRÜN PERFORMANSI — ÖLÇÜMÜN SAF ÇEKİRDEĞİ (26.11.2026, onaylı mockup).

  Genel Bakış'taki tablo ve ürün detayının şeridi AYNI hesaptan besleniyor:
  iki ayrı yerde kurulan süzgeç, tabloda bir şey gösterip detayda başka sayı
  yazmanın en kolay yolu (AGENTS.md, liste sayfaları notu).

  ÜÇ DURUM BİRBİRİNİN YERİNE GEÇMEZ:
    var          — kaynak bağlı, okundu; sayı gerçek (0 da gerçek bir sayıdır).
    kaynak_yok   — o ürün için ölçümün kaynağı HİÇ yok (örn. bireysel abonesi
                   olmayan üründe deneme dönüşümü). Ekranda "Veri bağlı değil".
    okunamadi    — kaynak bağlı ama sorgu düştü. Ekranda "Veri okunamadı".
  İkisinde de SIFIR BASILMAZ: okunamayan bir sorgudan gelen 0, "satış yok"
  diye okunur — yani yanlış değil, EMİN EMİN yanlış (AGENTS.md, okunamayan
  sorgu denetimi).
*/
import { PRODUCTS, SUBSCRIBER_PRODUCTS } from "@/lib/products";
import { donemde, type Donem } from "./donem";

export type Olcum<T> =
  | { durum: "var"; deger: T }
  | { durum: "kaynak_yok" }
  | { durum: "okunamadi" };

export const olcum = <T,>(deger: T): Olcum<T> => ({ durum: "var", deger });
export const kaynakYok = <T,>(): Olcum<T> => ({ durum: "kaynak_yok" });
export const okunamadi = <T,>(): Olcum<T> => ({ durum: "okunamadi" });

/** Okunabilmiş veri ya da düşmüş sorgu. */
export type Okuma<T> = { veri: T; hata?: false } | { veri?: undefined; hata: true };

export type AboneSatiri = { id: string; product: string; status: string; trial_ends_at: string | null; created_at: string };
export type AboneOdemesi = { subscriber_id: string; amount: number | null; paid_at: string | null };
export type KurumOdemesi = { organization_id: string; product: string | null; amount: number | null; reviewed_at: string | null };
export type UrunLisansi = { organization_id: string; product: string; status: string };
export type CekirdekLisans = { organization_id: string; license_status: string | null };

/** Lisansı AÇIK sayılan durumlar: ürünü kullanıyor (deneme dahil). */
export const ACIK_LISANS = new Set(["active", "trialing", "past_due"]);
/** Bireysel abonede "açık": ürünü kullanabiliyor. */
export const ACIK_ABONE = new Set(["active", "trialing", "past_due"]);

export type Donusum = { denemeye: number; ucretliye: number; oran: number | null };

export type UrunSatiri = {
  kod: string;
  ad: string;
  aktifMusteri: Olcum<number>;
  donusum: Olcum<Donusum>;
  tahsilat: Olcum<number>;
};

export type Girdi = {
  donem: Donem;
  /** ArvoOS'un kendi kiracıları (çekirdek lisans). */
  cekirdek: Okuma<CekirdekLisans[]>;
  /** Öteki ürünlerin kurum lisansları. */
  urunLisanslari: Okuma<UrunLisansi[]>;
  aboneler: Okuma<AboneSatiri[]>;
  aboneOdemeleri: Okuma<AboneOdemesi[]>;
  kurumOdemeleri: Okuma<KurumOdemesi[]>;
  /** Müşteri sayılan kurumlar: iç ekip ve grup markası tahsilata girmez. */
  musteriKurumlar: Okuma<Set<string>>;
  /** Satırı çizilecek ürünler; beşinci ürün buradan gelir, JSX değişmez. */
  urunler?: readonly { code: string; name: string }[];
  /** Bireysel abonesi olan ürünler; dönüşümün kaynağı yalnızca burada var. */
  aboneliUrunler?: readonly string[];
};

const bos = <T,>(o: Okuma<T>): o is { veri?: undefined; hata: true } => Boolean(o.hata);

/**
 * Ürün başına aktif müşteri, deneme dönüşümü ve seçili dönemde tahsilat.
 * Girdideki satırlar ÇAĞIRAN tarafından, çağıranın yetkisiyle okunur;
 * bu fonksiyon yalnızca sayar.
 */
export function urunPerformansi(girdi: Girdi): UrunSatiri[] {
  const urunler = girdi.urunler ?? PRODUCTS;
  const aboneli = new Set(girdi.aboneliUrunler ?? SUBSCRIBER_PRODUCTS.map((u) => u.code));

  /* Abone → ürün haritası: abone ödemesinin ürünü abonenin kendisinden
     gelir, ödeme satırında ürün sütunu yok. */
  const aboneUrunu = new Map<string, string>();
  if (!bos(girdi.aboneler)) for (const a of girdi.aboneler.veri) aboneUrunu.set(a.id, a.product);

  /* Ödemesi olan aboneler: dönüşümün "ücretliye geçen" ayağı. Tutar değil
     VARLIK aranıyor — bir kuruşluk kredi alımı da ücretliye geçiştir. */
  const odemeliAbone = new Set<string>();
  if (!bos(girdi.aboneOdemeleri)) {
    for (const o of girdi.aboneOdemeleri.veri) if (o.paid_at) odemeliAbone.add(o.subscriber_id);
  }

  return urunler.map((urun) => ({
    kod: urun.code,
    ad: urun.name,
    aktifMusteri: aktifMusteri(urun.code, girdi),
    donusum: aboneli.has(urun.code) ? denemeDonusumu(urun.code, girdi, odemeliAbone) : kaynakYok<Donusum>(),
    tahsilat: donemTahsilati(urun.code, girdi, aboneUrunu),
  }));
}

/** Lisansı açık kurum + açık bireysel abone. */
function aktifMusteri(kod: string, girdi: Girdi): Olcum<number> {
  const cekirdek = kod === "arvoos";
  let kurum: number;
  if (cekirdek) {
    if (bos(girdi.cekirdek)) return okunamadi<number>();
    kurum = girdi.cekirdek.veri.filter((s) => ACIK_LISANS.has(s.license_status ?? "")).length;
  } else {
    if (bos(girdi.urunLisanslari)) return okunamadi<number>();
    kurum = girdi.urunLisanslari.veri.filter((s) => s.product === kod && ACIK_LISANS.has(s.status)).length;
  }

  /* Bireysel abonesi olmayan üründe abone okuması gerekmiyor; olanlarda
     okunamadıysa toplam da güvenilmez — eksik bir sayı yazmaktansa
     okunamadı demek doğrusu. */
  const aboneli = (girdi.aboneliUrunler ?? SUBSCRIBER_PRODUCTS.map((u) => u.code)).includes(kod);
  if (!aboneli) return olcum(kurum);
  if (bos(girdi.aboneler)) return okunamadi<number>();
  const abone = girdi.aboneler.veri.filter((a) => a.product === kod && ACIK_ABONE.has(a.status)).length;
  return olcum(kurum + abone);
}

/*
  DENEME DÖNÜŞÜMÜ YALNIZCA BİREYSEL ABONEDE.

  Kurumda durum geçmişi tutulmuyor: lisans panelden elle 'active'
  yapılabiliyor ve "deneme → ücretli" geçişi kanıtlanamıyor. Kurum için
  oran üretmek, ölçülmemiş bir şeyi ölçülmüş göstermek olurdu.

  Bireyselde başlangıç grubu kanıtlanabiliyor: abone satırı ürünün
  köprüsünde İLK GİRİŞTE yaratılıyor ve deneme süresi tanımlıysa
  status='trialing', trial_ends_at = bugün + süre olarak yazılıyor
  (app/api/bridge/subscription/route.ts). Yani denemesi olan bir
  abonenin created_at'i denemenin başlangıcıdır.

  "İlk çalışmayı oluşturan" ARA ADIMI ÇİZİLMİYOR: ürünün kendi
  veritabanındaki etkinlik köprüden abone kırılımıyla gelmiyor
  (lib/urun-kullanimi.ts yalnızca toplam veriyor). Kaynağı olmayan bir
  adımı huniye koymak, oranı uydurmak demek.
*/
function denemeDonusumu(kod: string, girdi: Girdi, odemeliAbone: Set<string>): Olcum<Donusum> {
  if (bos(girdi.aboneler) || bos(girdi.aboneOdemeleri)) return okunamadi<Donusum>();
  const grup = girdi.aboneler.veri.filter(
    (a) => a.product === kod && a.trial_ends_at && donemde(a.created_at, girdi.donem),
  );
  if (!grup.length) return olcum({ denemeye: 0, ucretliye: 0, oran: null });
  const ucretliye = grup.filter((a) => odemeliAbone.has(a.id)).length;
  return olcum({ denemeye: grup.length, ucretliye, oran: ucretliye / grup.length });
}

/*
  SEÇİLİ DÖNEMDE TAHSİLAT — İKİ KAYNAK, ÜST ÜSTE BİNMEZ.

  platform_tahsilat_ozeti() ile aynı iki kaynak: onaylı kurum ödeme
  istekleri ve bireysel abone ödemeleri. Üçüncü bir kaynak EKLENMEZ:
  billing_subscriptions her kurum ödemesinin aktivasyon ikizi ve onaylı
  istekle birlikte toplanınca her ödeme iki kez sayılıyordu (AGENTS.md).

  Kurum tarafında yalnızca MÜŞTERİ kurumlar: iç ekip ve grup markası
  ödemesi gelir değil.
*/
function donemTahsilati(kod: string, girdi: Girdi, aboneUrunu: Map<string, string>): Olcum<number> {
  if (bos(girdi.kurumOdemeleri) || bos(girdi.musteriKurumlar)) return okunamadi<number>();
  const musteri = girdi.musteriKurumlar.veri;
  let toplam = 0;
  for (const o of girdi.kurumOdemeleri.veri) {
    if (o.product !== kod) continue;
    if (!musteri.has(o.organization_id)) continue;
    if (!donemde(o.reviewed_at, girdi.donem)) continue;
    toplam += o.amount ?? 0;
  }
  /* Bireysel ödemelerin ürünü abone satırından geliyor; abone listesi
     okunamadıysa bu ürünün toplamı eksik kalırdı. */
  const aboneli = (girdi.aboneliUrunler ?? SUBSCRIBER_PRODUCTS.map((u) => u.code)).includes(kod);
  if (aboneli) {
    if (bos(girdi.aboneOdemeleri) || bos(girdi.aboneler)) return okunamadi<number>();
    for (const o of girdi.aboneOdemeleri.veri) {
      if (aboneUrunu.get(o.subscriber_id) !== kod) continue;
      if (!donemde(o.paid_at, girdi.donem)) continue;
      toplam += o.amount ?? 0;
    }
  }
  return olcum(toplam);
}
