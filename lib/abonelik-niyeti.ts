import { PRODUCTS, type ProductCode } from "@/lib/products";

/*
  Sözleşmenin talep ettiği modüller: formdan okunması ve saklanan biçime
  çevrilmesi.

  Neden ayrı bir dosya: bu yapı üç yerde okunuyor — sözleşme formu,
  imza tetikleyicisinin kopyaladığı jsonb, konsoldaki onay kartı. Üçünün
  aynı biçimi varsaydığından emin olmanın tek yolu tek bir çözümleyici.

  ÜCRET KURUŞ. Form TL alıyor (satışçı "4500" yazıyor), sakladığımız değer
  450000. AGENTS.md: "Para kuruş cinsinden tamsayıdır."
*/

export type NiyetModulu = {
  product: ProductCode;
  plan_code: string | null;
  /** Kuruş. Girilmediyse null: onay sırasında kurucu belirler. */
  monthly_fee: number | null;
  /** ArvoOS ile otomatik veri akışı; çekirdekte anlamsız ama biçim tek. */
  integrated: boolean;
};

export type AbonelikNiyeti = { modules: NiyetModulu[] };

/** Boş niyet ile "modül yok" aynı şey; ikisi de onaylanamaz. */
export const NIYET_BOS: AbonelikNiyeti = { modules: [] };

const PAKETLER = new Set(["starter", "professional", "enterprise"]);

/**
 * "4.500" ya da "4500,50" → kuruş. Boşsa null.
 *
 * Bin ayırıcı nokta: "1.500" bin beş yüzdür, bir buçuk değil. Bunu yanlış
 * okumak müşteriye bin kat yanlış fiyat yazmak demek.
 */
export function ucretiKurusaCevir(ham: string): number | null {
  const metin = String(ham ?? "").trim();
  if (!metin) return null;
  const sade = metin.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const sayi = Number(sade);
  if (!Number.isFinite(sayi) || sayi < 0) return null;
  return Math.round(sayi * 100);
}

/** Kuruş → form alanına yazılacak TL metni. */
export const kurusuTlYaz = (kurus: number | null | undefined) =>
  kurus === null || kurus === undefined ? "" : String(kurus / 100);

/**
 * Form alanlarından niyeti kurar.
 *
 * Alan adları ürün koduyla eşleşiyor: modul_arvolab, paket_arvolab,
 * ucret_arvolab, bagimsiz_arvolab. İşaretlenmemiş ürün hiç yazılmıyor —
 * ücreti girilmiş ama seçilmemiş bir modül, kazayla açılacak bir modül
 * demekti.
 */
export function niyetiFormdanOku(al: (ad: string) => string): AbonelikNiyeti {
  const modules: NiyetModulu[] = [];
  for (const urun of PRODUCTS) {
    if (!al(`modul_${urun.code}`)) continue;
    const paket = al(`paket_${urun.code}`).trim();
    modules.push({
      product: urun.code,
      plan_code: PAKETLER.has(paket) ? paket : null,
      monthly_fee: ucretiKurusaCevir(al(`ucret_${urun.code}`)),
      // Kutu "bağımsız" diye işaretleniyor; sakladığımız değer tersi.
      integrated: !al(`bagimsiz_${urun.code}`),
    });
  }
  return { modules };
}

/**
 * Saklanan jsonb'yi güvenle okur.
 *
 * Tanınmayan ürün atılıyor: ürün listesinden çıkarılmış bir kod yüzünden
 * onay ekranının patlaması, o satırı görmezden gelmekten kötü.
 */
export function niyetiCoz(ham: unknown): AbonelikNiyeti {
  const govde = (ham ?? {}) as { modules?: unknown };
  if (!Array.isArray(govde.modules)) return NIYET_BOS;
  const kodlar = new Set(PRODUCTS.map((urun) => urun.code as string));

  const modules = govde.modules
    .filter((satir): satir is Record<string, unknown> => Boolean(satir) && typeof satir === "object")
    .filter((satir) => kodlar.has(String(satir.product)))
    .map((satir) => ({
      product: String(satir.product) as ProductCode,
      plan_code: PAKETLER.has(String(satir.plan_code)) ? String(satir.plan_code) : null,
      monthly_fee: Number.isFinite(Number(satir.monthly_fee)) && satir.monthly_fee !== null
        ? Math.round(Number(satir.monthly_fee))
        : null,
      integrated: satir.integrated !== false,
    }));

  // Aynı ürün iki kez yazılmışsa sonuncusu geçerli; iki lisans satırı
  // yazmaya çalışmak onayda çakışma hatası verirdi.
  const tekil = new Map(modules.map((modul) => [modul.product, modul]));
  return { modules: [...tekil.values()] };
}
