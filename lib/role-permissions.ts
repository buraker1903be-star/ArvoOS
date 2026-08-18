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
  { key: "member", label: "Satış Personeli" },
  { key: OPERASYONCU_ROLE, label: "Operasyon Personeli" },
] as const;

const PATH_PREFIX_TO_MODULE_KEY: Record<string, string> = {
  "/panel/crm": "crm",
  "/panel/operations": "operations",
  "/panel/finance": "finance",
  "/panel/finans": "finance",
  "/panel/accounts": "finance",
  "/panel/banking": "finance",
  "/panel/billing": "finance",
  "/panel/hr": "hr",
  "/panel/ekip": "hr",
  "/panel/reporting": "reports",
  "/panel/documents": "documents",
};

export function modulesKeyForPath(pathname: string): string | null {
  const match = Object.keys(PATH_PREFIX_TO_MODULE_KEY).find((prefix) => pathname.startsWith(prefix));
  return match ? PATH_PREFIX_TO_MODULE_KEY[match] : null;
}

export function isNavigationGroupHiddenForRole(role: string, groupKey: string, hiddenModuleKeys: ReadonlySet<string>): boolean {
  if (role === "owner") return false;
  return hiddenModuleKeys.has(groupKey);
}

export function assertModuleAccess(role: string, pathname: string, hiddenModuleKeys: ReadonlySet<string>) {
  if (role === "owner") return;
  const moduleKey = modulesKeyForPath(pathname);
  if (moduleKey && hiddenModuleKeys.has(moduleKey)) {
    throw new Error("Bu modüle erişim yetkiniz yok.");
  }
}
