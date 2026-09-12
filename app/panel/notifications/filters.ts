// Bildirim filtreleri: sayfa (page.tsx) ve çekmece (notifications-drawer.tsx)
// aynı listeyi kullanır. Anahtarlar eski bağlantılarla uyumlu (?kategori=duyurular).
export const notificationFilters = [
  { key: "sales", label: "Talepler", categories: ["sales_assignment"] },
  { key: "operations", label: "Operasyon", categories: ["operation_assignment", "crm_won_automation"] },
  { key: "musteri", label: "Müşteri", categories: ["customer_message"] },
  { key: "yorumlar", label: "Yorumlar", categories: ["internal_comment"] },
  { key: "duyurular", label: "Duyurular", categories: ["management_announcement"] },
] as const;

export type NotificationFilter = (typeof notificationFilters)[number];

export const inNotificationFilter = (category: string, filter: NotificationFilter) =>
  (filter.categories as readonly string[]).includes(category);
