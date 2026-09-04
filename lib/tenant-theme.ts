/**
 * Çok kiracılı marka teması.
 *
 * Kurum tek bir marka rengi seçer (organizations.brand_color, "#RRGGBB").
 * Buradan panelin ihtiyaç duyduğu üç tonu türetiyoruz:
 *   --tenant-accent          -> vurgu (buton, aktif menü, rozet)
 *   --tenant-accent-strong   -> koyu ton (metin, hover, kenarlık)
 *   --tenant-accent-soft     -> açık zemin (etiket arka planı)
 *
 * Renk seçilmemişse hiçbir değişken basılmaz; panel-tokens.css içindeki
 * var() fallback'i devreye girip ArvoOS yeşiline döner.
 */

type Rgb = { r: number; g: number; b: number };

function parseHex(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

const toHex = ({ r, g, b }: Rgb) =>
  "#" + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("");

/** Beyaza doğru karıştır (amount 0..1) */
const lighten = ({ r, g, b }: Rgb, amount: number): Rgb => ({
  r: r + (255 - r) * amount,
  g: g + (255 - g) * amount,
  b: b + (255 - b) * amount,
});

/** Siyaha doğru karıştır (amount 0..1) */
const darken = ({ r, g, b }: Rgb, amount: number): Rgb => ({
  r: r * (1 - amount),
  g: g * (1 - amount),
  b: b * (1 - amount),
});

/** WCAG bağıl parlaklık — kontrast kontrolü için */
function luminance({ r, g, b }: Rgb): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Vurgu renginin üstüne beyaz mı siyah mı yazılmalı */
export function readableOn(color: string): "#ffffff" | "#0d2138" {
  const rgb = parseHex(color);
  if (!rgb) return "#ffffff";
  return luminance(rgb) > 0.45 ? "#0d2138" : "#ffffff";
}

export type TenantTheme = Record<string, string>;

/**
 * Panel kabuğunda `<div className="panel-root" style={tenantTheme(brandColor)}>`
 * şeklinde kullanılır. Geçersiz veya boş renk güvenle yok sayılır.
 */
export function tenantTheme(brandColor?: string | null): TenantTheme {
  if (!brandColor) return {};
  const base = parseHex(brandColor);
  if (!base) return {};

  // Çok açık bir marka rengi seçilirse vurgu okunmaz hale gelir;
  // bu durumda tabanı bir miktar koyultuyoruz.
  const accent = luminance(base) > 0.6 ? darken(base, 0.25) : base;

  return {
    "--tenant-accent": toHex(accent),
    "--tenant-accent-strong": toHex(darken(accent, 0.28)),
    "--tenant-accent-soft": toHex(lighten(accent, 0.86)),
    "--tenant-accent-on": readableOn(toHex(accent)),
  } as TenantTheme;
}
