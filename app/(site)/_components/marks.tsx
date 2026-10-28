// Marka logoları (public/brand/, kırpılmış şeffaf PNG) ve küçük ikonlar.
// Logolar ASLA yeniden renklendirilmez / süzgeçlenmez; açık zeminde özgün,
// koyu zeminde "-on-dark" sürümü kullanılır.
import Image from "next/image";

type Brand = "arvoos" | "arvolab" | "arvobook" | "arvoculture";
const SIZE: Record<Brand, { w: number; h: number }> = {
  arvoos: { w: 1901, h: 395 },
  arvolab: { w: 1920, h: 468 },
  arvobook: { w: 1934, h: 560 },
  arvoculture: { w: 1920, h: 259 },
};


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
      data-brand={brand}
      style={height ? ({ ["--h" as string]: `${height}px` } as React.CSSProperties) : undefined}
    />
  );
}

export type ProductName = "ArvoOS" | "ArvoLab" | "ArvoBook";

/*
  ArvoBook'un logosu 28.10.2026'da geldi; o güne kadar adı kendi
  tipografisiyle yazılıyordu. Logosu olmayan bir ürün eklenirse aynı yol
  çalışır: BRAND_OF'ta satırı yoksa ProductLogo adı wordmark olarak yazar —
  başka ürünün dosyası ya da otomatik üretilmiş bir şekil konmaz.
*/
const BRAND_OF: Partial<Record<ProductName, Brand>> = { ArvoOS: "arvoos", ArvoLab: "arvolab", ArvoBook: "arvobook" };

/** Ürünün kırpılmış logo dosyası var mı? Yoksa çağıran, adı iki kez
 *  yazdırmamak için wordmark'ı hiç basmamayı seçebilir. */
export const urunLogosuVar = (name: ProductName): boolean => Boolean(BRAND_OF[name]);

/** Ürün kimliği: logosu varsa özgün logo, yoksa adının wordmark'ı. */
export function ProductLogo({ name, tone = "light", height = 28, withAlt = true, className = "" }: {
  name: ProductName; tone?: "light" | "dark"; height?: number; withAlt?: boolean; className?: string;
}) {
  const brand = BRAND_OF[name];
  if (!brand) {
    return (
      <span
        className={`brand-word${tone === "dark" ? " on-dark" : ""} ${className}`.trim()}
        style={{ ["--h" as string]: `${height}px` }}
        aria-hidden={withAlt ? undefined : true}
      >
        {name}
      </span>
    );
  }
  return <BrandLogo brand={brand} tone={tone} height={height} alt={withAlt ? name : ""} className={className} />;
}

/** Dil seçicinin küresi: global sitelerde dil menüsünün evrensel işareti. */
export function Globe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="8" cy="8" r="6.4" />
        <path d="M1.6 8h12.8M8 1.6c1.9 1.8 2.9 4 2.9 6.4S9.9 12.6 8 14.4M8 1.6C6.1 3.4 5.1 5.6 5.1 8s1 4.6 2.9 6.4" />
      </g>
    </svg>
  );
}

/* "Her yerde çalışır" şeridinin ikonları (28.10.2026). Tek çizgi
   kalınlığı ve 24'lük ızgara: dört ikon yan yana aynı ağırlıkta dursun. */
type IkonAdi = "globe" | "currency" | "devices" | "shield";
const IKON_YOLLARI: Record<IkonAdi, string> = {
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.6 2.5 4 5.6 4 9s-1.4 6.5-4 9M12 3c-2.6 2.5-4 5.6-4 9s1.4 6.5 4 9",
  currency: "M2.5 6.5h19v11h-19zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM6 10v4M18 10v4",
  devices: "M3.5 5.5h13v9h-13zM1.5 17.5h17M18.5 9.5h3.5v10h-3.5z",
  shield: "M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6L12 3Zm-3.2 9 2.2 2.2 4.2-4.4",
};
export function Ikon({ ad, className }: { ad: IkonAdi; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d={IKON_YOLLARI[ad]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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

export function InstagramMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="3.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="2.9" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.6" cy="4.4" r=".95" fill="currentColor" />
    </svg>
  );
}
