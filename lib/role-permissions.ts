// Operasyoncu rolü: sadece Operasyon modülüne erişebilir, tutar/fiyat
// bilgisi içeren hiçbir modülü (CRM, Finans, İK, Raporlar) göremez.
// Bu dosya hem navigasyon gizlemede hem de sayfa seviyesinde sunucu
// tarafı erişim kontrolünde (URL'den doğrudan girişe karşı) kullanılır.

export const OPERASYONCU_ROLE = "operasyoncu";

// panel-navigation-config.ts'deki NavigationGroup.key değerleriyle eşleşir.
const HIDDEN_GROUP_KEYS_BY_ROLE: Record<string, string[]> = {
  [OPERASYONCU_ROLE]: ["crm", "finance", "hr", "reports"],
};

export function isNavigationGroupHiddenForRole(role: string, groupKey: string): boolean {
  return (HIDDEN_GROUP_KEYS_BY_ROLE[role] ?? []).includes(groupKey);
}

// Sayfa seviyesinde erişim engeli — URL'yi doğrudan yazarak gizli
// modüllere girmeye çalışan bir operasyoncu için de aynı kural geçerli.
const BLOCKED_PATH_PREFIXES_BY_ROLE: Record<string, string[]> = {
  [OPERASYONCU_ROLE]: [
    "/panel/crm",
    "/panel/finance",
    "/panel/finans",
    "/panel/hr",
    "/panel/ekip",
    "/panel/reporting",
    "/panel/platform",
    "/panel/accounts",
    "/panel/banking",
    "/panel/billing",
  ],
};

export function assertModuleAccess(role: string, pathname: string) {
  const blocked = BLOCKED_PATH_PREFIXES_BY_ROLE[role] ?? [];
  if (blocked.some((prefix) => pathname.startsWith(prefix))) {
    throw new Error("Bu modüle erişim yetkiniz yok.");
  }
}
