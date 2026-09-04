/**
 * CRM durum etiketleri — tek kaynak.
 *
 * Dikkat: 'sent' durumu iki kayıt tipinde farklı anlama geliyor.
 * Teklifte "Gönderildi", sözleşmede "İmza bekliyor". Bu yüzden tek bir
 * ortak harita kullanılamaz; etiketler kayıt tipine göre ayrılmalı.
 *
 * Etiketler daha önce dört sayfada ve bir action dosyasında ayrı ayrı
 * tanımlıydı. Kayıt geçmişini eklerken ortak bir harita kullanmıştım ve
 * sözleşme rozeti "İmza bekliyor" derken geçmiş "Gönderildi" diyordu.
 */

export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  draft: "Taslak",
  sent: "Gönderildi",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
  expired: "Süresi doldu",
  archived: "Arşiv",
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: "Taslak",
  sent: "İmza bekliyor",
  signed: "İmzalandı",
  rejected: "Reddedildi",
  cancelled: "İptal",
  completed: "Tamamlandı",
};

export function proposalStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return PROPOSAL_STATUS_LABELS[status] ?? status;
}

export function contractStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return CONTRACT_STATUS_LABELS[status] ?? status;
}
