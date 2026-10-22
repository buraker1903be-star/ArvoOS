// Bildirim filtreleri: sayfa (page.tsx) ve çekmece (notifications-drawer.tsx)
// aynı listeyi kullanır. Anahtarlar eski bağlantılarla uyumlu (?kategori=duyurular).
// Her kategori bir başlığa düşer: ödeme ve destek bildirimleri eskiden hiçbir
// başlıkta yoktu (yalnızca "Tümü"nde görünüyordu). Listede olmayan yeni bir
// kategori de "Diğer" altında görünür. Boş başlıklar arayüzde gösterilmez.
export const notificationFilters = [
  { key: "sales", label: "Talepler", categories: ["sales_assignment", "site_lead", "talep_birakildi"] },
  { key: "operations", label: "Operasyon", categories: ["operation_assignment", "operation_step_due", "operation_waiting_party", "operation_revision_window", "crm_won_automation"] },
  { key: "musteri", label: "Müşteri", categories: ["customer_message", "contract_addendum_accepted", "contract_addendum_rejected", "proposal_customer_decision", "contract_signed"] },
  { key: "yorumlar", label: "Yorumlar", categories: ["internal_comment"] },
  { key: "posta", label: "Posta", categories: ["posta_gelen", "posta_esitleme"] },
  { key: "duyurular", label: "Duyurular", categories: ["management_announcement"] },
  { key: "odemeler", label: "Ödemeler", categories: ["payment_submitted", "payment_approved", "payment_rejected", "subscription_reminder"] },
  { key: "destek", label: "Destek", categories: ["support_message"] },
  { key: "diger", label: "Diğer", categories: [] },
] as const;

export type NotificationFilter = (typeof notificationFilters)[number];

/** Bir başlığa düşen bütün kategoriler ("Diğer" bunların dışındakiler). */
export const bilinenKategoriler: readonly string[] = notificationFilters.flatMap((filter) => [...filter.categories]);
const knownCategories = new Set<string>(bilinenKategoriler);

export const inNotificationFilter = (category: string, filter: NotificationFilter) =>
  filter.key === "diger" ? !knownCategories.has(category) : (filter.categories as readonly string[]).includes(category);

/*
  SUNUCU SÜZGECİ VE ÖZET (20261013145720). Başlık süzgeci veritabanına
  kategori LİSTESİ olarak gidiyor (arvo_bildirimler): liste SQL'e
  kopyalanmıyor, tek kaynağı bu dosya. "Diğer" = bilinen kategorilerin
  dışındakiler.
*/
export function kategoriParametresi(filtre: NotificationFilter | null): { p_kategoriler: string[] | null; p_diger: boolean } {
  if (!filtre) return { p_kategoriler: null, p_diger: false };
  if (filtre.key === "diger") return { p_kategoriler: [...bilinenKategoriler], p_diger: true };
  return { p_kategoriler: [...filtre.categories], p_diger: false };
}

export type BildirimOzetSatiri = { kategori: string; adet: number | string; okunmamis: number | string; bugun: number | string };
export type BaslikSayisi = { adet: number; okunmamis: number };
export type BildirimOzeti = { toplam: number; okunmamis: number; bugun: number; basliklar: Record<string, BaslikSayisi> };

/**
 * Kategori başına özet satırlarını (arvo_bildirim_ozeti) başlıklara
 * dağıtır. Bilinmeyen kategori "Diğer"e düşer; her satır TEK başlığa
 * sayılır, başlıkların toplamı her zaman genel toplama eşit.
 */
export function basliklaraDagit(satirlar: readonly BildirimOzetSatiri[]): BildirimOzeti {
  const basliklar: Record<string, BaslikSayisi> = Object.fromEntries(notificationFilters.map((filtre) => [filtre.key, { adet: 0, okunmamis: 0 }]));
  let toplam = 0, okunmamis = 0, bugun = 0;
  for (const satir of satirlar) {
    const adet = Number(satir.adet) || 0;
    const ok = Number(satir.okunmamis) || 0;
    toplam += adet; okunmamis += ok; bugun += Number(satir.bugun) || 0;
    const filtre = notificationFilters.find((aday) => aday.key !== "diger" && (aday.categories as readonly string[]).includes(satir.kategori));
    const hedef = basliklar[filtre?.key ?? "diger"];
    hedef.adet += adet; hedef.okunmamis += ok;
  }
  return { toplam, okunmamis, bugun, basliklar };
}
