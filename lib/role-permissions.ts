// Rol bazlı modül yetkilendirmesi artık veritabanından (role_module_permissions)
// besleniyor ve Ayarlar > Yetkilendirme sayfasından değiştirilebiliyor. Bu dosya
// sadece: (1) URL yolunu modül anahtarına çevirir, (2) hesaplanmış "gizli modül"
// kümesine göre erişim/görünürlük kararı verir. Kurum Sahibi (owner) hiçbir
// zaman kısıtlanamaz — kilitlenip dışarıda kalmayı önlemek için.

export const OPERASYONCU_ROLE = "operasyoncu";

export const PERMISSION_MODULES = [
  { key: "crm", label: "CRM" },
  { key: "operations", label: "Operasyon" },
  { key: "finance", label: "Finans" },
  { key: "hr", label: "İnsan Kaynakları" },
  { key: "documents", label: "Dokümanlar" },
  { key: "reports", label: "Raporlar" },
] as const;

export const PERMISSION_ROLES = [
  { key: "admin", label: "Yönetici" },
  // manager gerçek bir rol (CRM işlemleri ve RLS'te kullanılıyor) ama bu
  // listede olmadığı için hiç kısıtlanamıyordu; "Yönetici" sütunundaki
  // değişiklikler onu kapsamıyordu.
  { key: "manager", label: "Yönetici (sınırlı)" },
  { key: "member", label: "Satış Personeli" },
  { key: OPERASYONCU_ROLE, label: "Operasyon Personeli" },
] as const;

const PATH_PREFIX_TO_MODULE_KEY: Record<string, string> = {
  "/panel/crm": "crm",
  "/panel/operations": "operations",
  // Raporlar sayfası finans modülünün altında duruyor ama kendi yetki
  // kutucuğu var. Daha uzun ön ek kazandığı için (aşağıya bakın) burası
  // "/panel/finance"i eziyor: Raporlar'ı kapatılmış bir rol, finansa
  // erişebilse bile bu sayfayı açamaz.
  "/panel/finance/raporlar": "reports",
  "/panel/finance": "finance",
  "/panel/accounts": "finance",
  "/panel/banking": "finance",
  "/panel/billing": "finance",
  "/panel/hr": "hr",
  "/panel/ekip": "hr",
  "/panel/reporting": "reports",
  "/panel/documents": "documents",
};

export function modulesKeyForPath(pathname: string): string | null {
  // En UZUN eşleşen ön ek kazanır. Eskiden tanım sırasındaki ilk eşleşme
  // alınıyordu; "/panel/finance" daha önce geldiği için
  // "/panel/finance/raporlar" hep "finance" olarak çözülüyordu ve
  // Yetkilendirme'deki "Raporlar" kutucuğu hiçbir şeyi kapatmıyordu —
  // sayfayı adresi yazarak açmak mümkündü. Kutucuğun kapattığı tek şey
  // paneldeki kısayoldu.
  const match = Object.keys(PATH_PREFIX_TO_MODULE_KEY)
    .filter((prefix) => pathname.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PATH_PREFIX_TO_MODULE_KEY[match] : null;
}

/**
 * Yolun dokunduğu BÜTÜN modül anahtarları. "/panel/finance/raporlar" hem
 * finansın hem raporların altında: rapor sayfası finans verisini okuduğu
 * için ikisinin de açık olması gerekir. Paneldeki kısayol da zaten
 * "canSeeReports && canSeeFinance" istiyor.
 */
export function moduleKeysForPath(pathname: string): string[] {
  return [...new Set(
    Object.keys(PATH_PREFIX_TO_MODULE_KEY)
      .filter((prefix) => pathname.startsWith(prefix))
      .map((prefix) => PATH_PREFIX_TO_MODULE_KEY[prefix]),
  )];
}

export function isNavigationGroupHiddenForRole(role: string, groupKey: string, hiddenModuleKeys: ReadonlySet<string>): boolean {
  if (role === "owner") return false;
  return hiddenModuleKeys.has(groupKey);
}

// Sunucu işlemleri (server action) için. assertModuleAccess yalnızca sayfa
// düzeninde çalışıyordu; kapatılmış bir modülün işlemleri arka planda yine
// çağrılabiliyordu. Her modülün işlem giriş noktası bunu çağırır.
export function assertModuleKeyAccess(role: string, moduleKey: string, hiddenModuleKeys: ReadonlySet<string>) {
  if (role === "owner") return;
  if (hiddenModuleKeys.has(moduleKey)) {
    throw new Error("Bu modüle erişim yetkiniz yok.");
  }
}

export function assertModuleAccess(role: string, pathname: string, hiddenModuleKeys: ReadonlySet<string>) {
  if (role === "owner") return;
  if (moduleKeysForPath(pathname).some((key) => hiddenModuleKeys.has(key))) {
    throw new Error("Bu modüle erişim yetkiniz yok.");
  }
}
