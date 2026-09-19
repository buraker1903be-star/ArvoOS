// ArvoOS üzerinden faturalanan ürünler.
//
// ArvoOS'un kendi aboneliği organization_licenses'ta (limitler de orada),
// diğer ürünler organization_product_licenses'ta tutulur. Ekranlarda ve
// ödeme akışında aynı adları kullanmak için tek kaynak burası.

export const PRODUCTS = [
  { code: "arvoos", name: "ArvoOS", description: "Yönetim paneli" },
  { code: "arvolab", name: "ArvoLab", description: "Akademik yazım ve editöryal kontrol" },
  { code: "arc", name: "Arc", description: "E-ticaret ve mağaza yönetimi" },
  { code: "randevu", name: "Arvo Randevu", description: "Kuaför ve güzellik salonu randevu yönetimi" },
] as const;

export type ProductCode = (typeof PRODUCTS)[number]["code"];

/** organization_product_licenses tablosundaki ürünler (ArvoOS hariç). */
export const ADDON_PRODUCTS = PRODUCTS.filter((product) => product.code !== "arvoos");

export const isAddonProduct = (value: string): value is Exclude<ProductCode, "arvoos"> =>
  ADDON_PRODUCTS.some((product) => product.code === value);

/**
 * Bireysel (kurumsuz) abonelik alabilen ürünler: product_plans ve
 * product_subscribers bunlarla sınırlı. Randevu salona (kuruma) satılır;
 * bireysel abonelik ekranında ve köprü ucunda görünmez.
 */
export const SUBSCRIBER_PRODUCTS = ADDON_PRODUCTS.filter((product) => product.code !== "randevu");

export const isSubscriberProduct = (value: string): value is (typeof SUBSCRIBER_PRODUCTS)[number]["code"] =>
  SUBSCRIBER_PRODUCTS.some((product) => product.code === value);

export const productName = (code: string) => PRODUCTS.find((product) => product.code === code)?.name ?? code;

export const productLicenseLabels: Record<string, string> = {
  inactive: "Kapalı",
  trialing: "Deneme",
  active: "Aktif",
  past_due: "Ödeme gecikmiş",
  suspended: "Askıda",
  canceled: "İptal",
};
