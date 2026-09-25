// Ödeme sağlayıcıları: hangi sağlayıcı hangi kimlik alanlarını istiyor.
//
// Saf modül (Next/Supabase yok); testi tests/unit/odeme-saglayicilari.test.ts.
// Veritabanı tarafı:
// supabase/migrations/20260925130801_odeme_saglayici_katmani_garanti.sql
//
// Kimlik bilgileri organization_payment_providers.credentials_enc içinde bir
// HARİTA olarak duruyor (alan adı → şifreli değer), sütun olarak değil.
// Gerekçe: her banka kendi alan adlarını getiriyor ve bankanın bir alan
// değiştirmesi, canlıya elle uygulanan bir migration demek olmasın.

export type ProviderCode = "paytr" | "garanti";
export type ProviderMode = "test" | "production";

export interface CredentialField {
  /** credentials_enc haritasındaki anahtar */
  key: string;
  label: string;
  /** Kurulumdan sonra da zorunlu mu (boş bırakılırsa mevcut değer korunur) */
  required: boolean;
  hint?: string;
}

export interface ProviderSpec {
  code: ProviderCode;
  name: string;
  /** Ayarlar kartındaki bir satırlık açıklama */
  description: string;
  /** Bilgilerin nereden alınacağı; kurulum sırasında en çok sorulan şey */
  setupNote: string;
  /** "… açık olsun" onay kutusunun metni */
  enableLabel: string;
  /** Ekranda görünen, sır OLMAYAN kimlik (merchant_id sütunu) */
  merchantLabel: string;
  merchantPattern: RegExp;
  merchantHint: string;
  /** Sırlar; hepsi şifrelenip haritaya yazılır, ekranda bir daha gösterilmez */
  secrets: CredentialField[];
  /** Test ve canlı ayrı sunucularda mı (kip seçimi gösterilsin mi) */
  hasModes: boolean;
  /** Tahsilat bu sağlayıcıyla yapılabiliyor mu; bilgiler girilebilse de akış hazır olmayabilir */
  checkoutReady: boolean;
}

export const PROVIDERS: ProviderSpec[] = [
  {
    code: "paytr",
    name: "PayTR",
    description: "Tek kullanımlık ödeme bağlantısı; ödeme gelince tahsilat cariye kendiliğinden işlenir.",
    setupNote: "Bu bilgiler PayTR Mağaza Paneli → Destek & Kurulum → Entegrasyon Bilgileri'nde yer alır. Mağazanızda “Link ile Ödeme” özelliğinin açık olması gerekir.",
    enableLabel: "Taksitler ve abonelikler için PayTR ödeme bağlantısı oluşturulabilsin",
    merchantLabel: "Mağaza numarası (merchant_id)",
    merchantPattern: /^[0-9]{3,20}$/,
    merchantHint: "Yalnızca rakam.",
    secrets: [
      { key: "merchant_key", label: "Mağaza parolası (merchant_key)", required: true },
      { key: "merchant_salt", label: "Gizli anahtar (merchant_salt)", required: true },
    ],
    hasModes: false,
    checkoutReady: true,
  },
  {
    code: "garanti",
    name: "Garanti BBVA Sanal POS",
    description: "Bankanın ortak ödeme sayfası ve tekrarlı abonelik tahsilatı. Kart bilgisi bize hiç gelmez.",
    setupNote: "Bilgiler Garanti BBVA Sanal POS Yönetim Ekranı'nda yer alır. PROVAUT ve 3D (StoreKey) şifreleri panelden ayrıca tanımlanır; tekrarlı ödeme için bankadan ayrıca talep edilmesi gerekir.",
    enableLabel: "Bu kurumun tahsilatı Garanti BBVA üzerinden yapılsın",
    merchantLabel: "Üye İşyeri Numarası",
    merchantPattern: /^[0-9]{5,20}$/,
    merchantHint: "Sanal POS yönetim panelinde yazan üye işyeri numarası.",
    secrets: [
      { key: "terminal_id", label: "Terminal Numarası", required: true, hint: "Sanal POS panelinde tanımlı terminal." },
      { key: "prov_user", label: "Provizyon kullanıcısı (PROVAUT)", required: true },
      { key: "prov_password", label: "Provizyon şifresi", required: true },
      { key: "store_key", label: "3D Secure anahtarı (StoreKey)", required: true, hint: "Panelde “3D” şifresi olarak tanımlanır." },
    ],
    hasModes: true,
    /*
      Bilgiler girilip saklanabiliyor ama tahsilat AKIŞI henüz yok: 3D
      motoru, provizyon XML'i ve tekrarlı ödeme ayrı bir işte. Bayrak
      burada duruyor ki "bağlı" görünen bir sağlayıcı sessizce hiçbir
      ödeme almasın — seçici (secim.ts) buna bakıyor.
    */
    checkoutReady: false,
  },
];

export const providerSpec = (code: string): ProviderSpec | null =>
  PROVIDERS.find((provider) => provider.code === code) ?? null;

export const providerName = (code: string) => providerSpec(code)?.name ?? code;

export const isProviderCode = (value: unknown): value is ProviderCode =>
  typeof value === "string" && PROVIDERS.some((provider) => provider.code === value);

export const isProviderMode = (value: unknown): value is ProviderMode =>
  value === "test" || value === "production";

/** Sır alanlarının anahtar kümesi; harita denetiminde kullanılır. */
export const secretKeys = (code: ProviderCode) => providerSpec(code)!.secrets.map((secret) => secret.key);

/**
 * Formdan gelen değerleri denetler.
 *
 * `mevcut`: hâlihazırda kayıtlı alanların anahtarları. Boş bırakılan bir alan
 * SİLME değil "değiştirme" anlamına geliyor — sırlar ekranda hiç
 * gösterilmediği için kullanıcı yalnızca değiştirmek istediğini yazıyor.
 * İlk kurulumda (mevcut boş) zorunlu alanların hepsi istenir.
 *
 * Hata metni ya da null döner.
 */
export function kimlikSorunu(
  code: ProviderCode,
  merchantId: string,
  girilen: Record<string, string>,
  mevcut: readonly string[] = [],
): string | null {
  const spec = providerSpec(code);
  if (!spec) return "Tanınmayan ödeme sağlayıcısı.";
  if (!spec.merchantPattern.test(merchantId.trim())) {
    return `${spec.merchantLabel} geçersiz. ${spec.merchantHint}`;
  }
  for (const secret of spec.secrets) {
    const value = (girilen[secret.key] ?? "").trim();
    const kayitli = mevcut.includes(secret.key);
    if (!value && !kayitli && secret.required) return `${secret.label} zorunlu.`;
    // Banka anahtarları uzun olabiliyor; üst sınır yalnızca saçma girdiye karşı.
    if (value && value.length > 500) return `${secret.label} beklenenden uzun; yanlış değer yapıştırılmış olabilir.`;
  }
  const taninmayan = Object.keys(girilen).filter((key) => !secretKeys(code).includes(key) && girilen[key]?.trim());
  if (taninmayan.length) return `${spec.name} için tanınmayan alan: ${taninmayan.join(", ")}`;
  return null;
}

/** Kayıtlı bir haritada sağlayıcının istediği bütün zorunlu alanlar var mı. */
export function kimlikTam(code: ProviderCode, mevcut: readonly string[]): boolean {
  const spec = providerSpec(code);
  if (!spec) return false;
  return spec.secrets.every((secret) => !secret.required || mevcut.includes(secret.key));
}

/**
 * Bir kurumun tahsilatını hangi sağlayıcı yapacak.
 *
 * Garanti varsayılan, PayTR yedek: geçiş kademeli olsun ve Garanti'de bir
 * sorun çıktığında tahsilat tamamen durmasın diye. Açık ama AKIŞI hazır
 * olmayan bir sağlayıcı seçilmiyor (checkoutReady) — "bağlı" görünüp
 * sessizce hiçbir ödeme almamak, en kötü başarısızlık biçimi.
 */
export function tahsilatSaglayicisi(
  kayitlilar: { provider: string; enabled: boolean; complete: boolean }[],
): ProviderCode | null {
  const uygun = (code: ProviderCode) =>
    kayitlilar.some((row) => row.provider === code && row.enabled && row.complete) &&
    providerSpec(code)?.checkoutReady === true;
  if (uygun("garanti")) return "garanti";
  if (uygun("paytr")) return "paytr";
  return null;
}
