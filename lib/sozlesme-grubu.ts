/*
  Sözleşmeler listesindeki grup: bir sözleşme hangi süzgeçte görünür.

  Liste kuralı (eskiden sayfanın içindeydi, burada aynen): iş bu
  ekrandan çıkmışsa sözleşme aktif listede durmaz.
  - İmzalı ve iş akışı açılmış: iş artık Operasyon'da ("operasyonda").
  - Tamamlanan sözleşme ya da işi tamamlanan/arşivlenen: "tamam".
  - Reddedilen ve iptal edilen: kendi gruplarında, aktif değil.
  İmzalı ama iş akışı AÇILMAMIŞ sözleşme aktif listede kalır ("imzali"):
  orada yapılacak bir iş var, gizlenirse unutulur.

  Saf modül: birim testi sozlesme-grubu.test.ts.
*/

export type SozlesmeGrubu = "draft" | "sent" | "imzali" | "operasyonda" | "tamam" | "rejected" | "cancelled";

export const SOZLESME_GRUP_ADLARI: Record<SozlesmeGrubu, string> = {
  draft: "Taslak",
  sent: "İmza bekliyor",
  imzali: "İmzalı · iş açılmadı",
  operasyonda: "Operasyonda",
  tamam: "Tamamlandı",
  rejected: "Reddedildi",
  cancelled: "İptal edildi",
};

export const AKTIF_SOZLESME_GRUPLARI: SozlesmeGrubu[] = ["draft", "sent", "imzali"];

export function sozlesmeGrubu(
  s: { status: string; workflow_id: string | null },
  isTamamlandi: boolean,
): SozlesmeGrubu {
  if (s.status === "rejected") return "rejected";
  if (s.status === "cancelled") return "cancelled";
  if (s.status === "completed" || (s.workflow_id && isTamamlandi)) return "tamam";
  if (s.status === "signed") return s.workflow_id ? "operasyonda" : "imzali";
  if (s.status === "sent") return "sent";
  return "draft";
}
