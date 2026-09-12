// Yönetici departmanındaki çalışanlar otomatik olarak Kurum Sahibi (owner)
// yetkisi alır. Asıl kural veritabanında (private.arvo_is_management_name ve
// arvo_sync_management_owner); bu dosya panelde aynı kararı göstermek ve
// sunucu tarafında erken, anlaşılır hata vermek için aynı kuralı taşır.

// İzinli çalışan yetkisini korur; pasif veya işten ayrılan kaybeder.
export const MANAGEMENT_EMPLOYMENT_STATUSES = ["active", "on_leave"];

// "Yönetim Departmanı", "Yönetici", "Yöneticiler", "YÖNETİM", "Yonetici" gibi
// adları yakalar; "Operasyon Yöneticisi" gibi başka birimleri yakalamaz.
export function isManagementDepartmentName(name: string | null | undefined) {
  return /^y[oö]net[iı](c[iı]|m)/.test((name ?? "").trim().toLocaleLowerCase("tr-TR"));
}
