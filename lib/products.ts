// ArvoOS üzerinden faturalanan ürünler.
//
// ArvoOS'un kendi aboneliği organization_licenses'ta (limitler de orada),
// diğer ürünler organization_product_licenses'ta tutulur. Ekranlarda ve
// ödeme akışında aynı adları kullanmak için tek kaynak burası.

export const PRODUCTS = [
  { code: "arvoos", name: "ArvoOS", badge: "OS", description: "Yönetim paneli" },
  { code: "arvolab", name: "ArvoLab", badge: "LB", description: "Akademik yazım ve editöryal kontrol" },
  { code: "arc", name: "ArvoARC", badge: "RC", description: "E-ticaret ve mağaza yönetimi" },
  { code: "randevu", name: "ArvoCal", badge: "CL", description: "Kuaför ve güzellik salonu randevu yönetimi" },
] as const;

export type ProductCode = (typeof PRODUCTS)[number]["code"];

/*
  ÇEKİRDEK DIŞI ÜRÜNLER. ArvoOS'un aboneliği organization_licenses'ta,
  ötekiler organization_product_licenses'ta (dosyanın başındaki not).
  O tabloyu okuyan her yer bu listeyi kullanır; elle yazılan liste
  30.10.2026'da ArvoARC'ı atlamıştı ve ArvoARC lisansı olan müşteriye
  ne otomatik ne elle proforma kesilebiliyordu.
*/
/*
  KARTLA ÖDENEBİLEN ÜRÜNLER.

  ArvoARC bugün DIŞARIDA ve sebebi hiçbir yerde yazılı değil
  (30.10.2026'da arandı). Dışlama iki ayrı yerde, gerekçesiz
  duruyordu: abonelik ekranındaki `product.code !== "arc"` koşulu ve
  kart işleminin kendi ürün listesi. İkisi bugün birbirini tutuyor
  ama tesadüfen — biri değişse öteki sessizce sapardı ve müşteri
  "Geçerli bir ürün seçilmedi" hatasına düşerdi.

  Veritabanı buna engel DEĞİL: organization_payment_requests'in
  product kısıtı 'arc'ı kabul ediyor, yani havale/EFT yolu ArvoARC'a
  zaten açık. Kapalı olan yalnızca kart.

  Proforma tarafı aynı gün ArvoARC'a açıldı (kurum sahibinin kararı).
  Kart da açılacaksa değişecek tek yer burası.
*/
export const KARTLA_ODENEBILEN: readonly ProductCode[] = PRODUCTS
  .map((urun) => urun.code)
  .filter((kod) => kod !== "arc");

export const EK_URUN_KODLARI: readonly ProductCode[] = PRODUCTS
  .map((urun) => urun.code)
  .filter((kod): kod is Exclude<ProductCode, "arvoos"> => kod !== "arvoos");

/*
  LİSTE SİMGESİNİN İKİ HARFİ ÜRÜNÜN KENDİ TANIMINDAN (15.10.2026).

  Konsolun liste satırı, simge verilmediğinde adın baş harflerini
  türetiyor (konsol-ui.tsx, basHarf): tek kelimelik adın ilk iki harfi,
  çok kelimelinin ilk ve son kelimesinin baş harfleri. Dört ürün adının
  dördü de "Arvo" ile başlıyor, yani ArvoOS, ArvoLab ve ArvoARC "AR"
  veriyor; "Arvo Randevu" iki kelime olduğu için A+R, o da "AR". Ürünler
  sayfasında ve müşteri detayında dört satır da AYNI simgeyle
  çiziliyordu — simge hiçbir şey ayırt etmiyordu.

  Lisans penceresinde doğrusu vardı ama orada, tek dosyaya kapalı bir
  haritada duruyordu; aynı ürün iki ekranda iki farklı simgeyle
  görünüyordu. Kısaltma artık ürünün tanımında: adı ve kodu nerede tek
  kaynaktan okunuyorsa simgesi de oradan.

  Randevu ürününün adı 28.10.2026'da ArvoCal oldu (arada birkaç saat
  ArvoBook); simgesi de RD'den CL'ye geçti. Kod "randevu" kalıyor:
  lisans, köprü ve fiyat kodları bu adla.

  Birim testi kısaltmaların BENZERSİZ olmasını sabitliyor — iki ürünün
  aynı harfleri alması, düzeltilen hatanın ta kendisi.
*/
export const urunSimgesi = (code: string): string | null =>
  PRODUCTS.find((product) => product.code === code)?.badge ?? null;

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
