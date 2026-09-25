// Bildirim filtreleri: sayfa (page.tsx) ve çekmece (notifications-drawer.tsx)
// aynı listeyi kullanır. Anahtarlar eski bağlantılarla uyumlu (?kategori=duyurular).
// Her kategori bir başlığa düşer: ödeme ve destek bildirimleri eskiden hiçbir
// başlıkta yoktu (yalnızca "Tümü"nde görünüyordu). Listede olmayan yeni bir
// kategori de "Diğer" altında görünür. Boş başlıklar arayüzde gösterilmez.
export const notificationFilters = [
  { key: "sales", label: "Talepler", categories: ["sales_assignment", "site_lead"] },
  { key: "operations", label: "Operasyon", categories: ["operation_assignment", "operation_step_due", "crm_won_automation"] },
  { key: "musteri", label: "Müşteri", categories: ["customer_message", "contract_addendum_accepted", "contract_addendum_rejected", "proposal_customer_decision"] },
  { key: "yorumlar", label: "Yorumlar", categories: ["internal_comment"] },
  { key: "duyurular", label: "Duyurular", categories: ["management_announcement"] },
  { key: "odemeler", label: "Ödemeler", categories: ["payment_submitted", "payment_approved", "payment_rejected"] },
  { key: "destek", label: "Destek", categories: ["support_message"] },
  { key: "diger", label: "Diğer", categories: [] },
] as const;

export type NotificationFilter = (typeof notificationFilters)[number];

const knownCategories = new Set<string>(notificationFilters.flatMap((filter) => [...filter.categories]));

export const inNotificationFilter = (category: string, filter: NotificationFilter) =>
  filter.key === "diger" ? !knownCategories.has(category) : (filter.categories as readonly string[]).includes(category);
