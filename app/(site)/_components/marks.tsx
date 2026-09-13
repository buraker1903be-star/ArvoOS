// Marka logoları (public/brand/, kırpılmış şeffaf PNG) ve küçük ikonlar.
// Logolar ASLA yeniden renklendirilmez / süzgeçlenmez; açık zeminde özgün,
// koyu zeminde "-on-dark" sürümü kullanılır.
import Image from "next/image";

type Brand = "arvoos" | "arvolab" | "arc" | "arvoculture";
const SIZE: Record<Brand, { w: number; h: number }> = {
  arvoos: { w: 1901, h: 395 },
  arvolab: { w: 1920, h: 468 },
  arc: { w: 1909, h: 373 },
  arvoculture: { w: 1920, h: 259 },
};
const ALT: Record<"ArvoOS" | "ArvoLab" | "Arc", string> = { ArvoOS: "ArvoOS", ArvoLab: "ArvoLab", Arc: "Arvo Arc" };

export function BrandLogo({ brand, tone = "light", height, alt = "", className = "", priority = false }: {
  brand: Brand; tone?: "light" | "dark"; height?: number; alt?: string; className?: string; priority?: boolean;
}) {
  const { w, h } = SIZE[brand];
  const shown = Math.ceil((height ?? 28) * (w / h));
  return (
    <Image
      src={`/brand/${brand}${tone === "dark" ? "-on-dark" : ""}.png`}
      width={w}
      height={h}
      alt={alt}
      sizes={`${shown}px`}
      priority={priority}
      className={`brand-logo ${className}`.trim()}
      style={height ? ({ ["--h" as string]: `${height}px` } as React.CSSProperties) : undefined}
    />
  );
}

export type ProductName = "ArvoOS" | "ArvoLab" | "Arc";

const BRAND_OF: Record<ProductName, Brand> = { ArvoOS: "arvoos", ArvoLab: "arvolab", Arc: "arc" };

/** Ürün kimliği: ürünün gerçek logosu, zemine göre sürümüyle. */
export function ProductLogo({ name, tone = "light", height = 28, withAlt = true, className = "" }: {
  name: ProductName; tone?: "light" | "dark"; height?: number; withAlt?: boolean; className?: string;
}) {
  return <BrandLogo brand={BRAND_OF[name]} tone={tone} height={height} alt={withAlt ? ALT[name] : ""} className={className} />;
}

export function Chevron({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Check({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
