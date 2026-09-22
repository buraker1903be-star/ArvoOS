/*
  Satılan AI kredi paketleri. Saf modül; testi
  tests/unit/ai-kredi-paketleri.test.ts.

  1 kredi = 1.000 karakter (lib/urun-kullanimi.ts ile aynı tanım).
  22.09.2026 fiyatlarıyla kredi maliyeti ≈ $0,0012: Claude Sonnet 5
  ($2/MTok girdi, $10/MTok çıktı), 1 kredi ≈ 400 jeton, girdi/çıktı ≈ 8:1.

  FİYATLAR BURADA, veritabanında değil. Üç sayı ve nadiren değişiyor;
  tabloya taşımak, değiştirmek için ekran yazmayı da gerektirirdi. Fiyat
  değişince eski bağlantılar etkilenmiyor: satılan kredi sipariş kaydında
  saklanıyor (ai_credit_orders.kredi), tutardan geri hesaplanmıyor.
*/

export type KrediPaketi = {
  kod: string;
  ad: string;
  kredi: number;
  /** Kuruş cinsinden tamsayı (AGENTS.md "Para kuruş cinsinden tamsayı"). */
  fiyat: number;
};

export const KREDI_PAKETLERI: KrediPaketi[] = [
  { kod: "k500", ad: "500 kredi", kredi: 500, fiyat: 49_900 },
  { kod: "k2500", ad: "2.500 kredi", kredi: 2500, fiyat: 199_900 },
  { kod: "k10000", ad: "10.000 kredi", kredi: 10_000, fiyat: 699_900 },
];

export const krediPaketi = (kod: string) => KREDI_PAKETLERI.find((paket) => paket.kod === kod) ?? null;

/**
 * 1.000 kredi başına fiyat; paketler arası karşılaştırma için.
 * Büyük paket ucuz olmalı — değilse kimse büyüğünü almaz.
 */
export const binKrediFiyati = (paket: KrediPaketi) => Math.round((paket.fiyat / paket.kredi) * 1000);
