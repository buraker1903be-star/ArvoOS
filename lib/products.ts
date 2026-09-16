// ArvoOS üzerinden faturalanan ürünler.
//
// ArvoOS'un kendi aboneliği organization_licenses'ta (limitler de orada),
// diğer ürünler organization_product_licenses'ta tutulur. Ekranlarda ve
// ödeme akışında aynı adları kullanmak için tek kaynak burası.

export const PRODUCTS = [
  { code: "arvoos", name: "ArvoOS", description: "Yönetim paneli" },
  { code: "arvolab", name: "ArvoLab", description: "Akademik yazım ve editöryal kontrol" },
  { code: "arc", name: "Arc", description: "E-ticaret ve mağaza yönetimi" },
] as const;

export type ProductCode = (typeof PRODUCTS)[number]["code"];

/** organization_product_licenses tablosundaki ürünler (ArvoOS hariç). */
export const ADDON_PRODUCTS = PRODUCTS.filter((product) => product.code !== "arvoos");

export const isAddonProduct = (value: string): value is Exclude<ProductCode, "arvoos"> =>
  ADDON_PRODUCTS.some((product) => product.code === value);

export const productName = (code: string) => PRODUCTS.find((product) => product.code === code)?.name ?? code;

export const productLicenseLabels: Record<string, string> = {
  inactive: "Kapalı",
  trialing: "Deneme",
  active: "Aktif",
  past_due: "Ödeme gecikmiş",
  suspended: "Askıda",
  canceled: "İptal",
};
