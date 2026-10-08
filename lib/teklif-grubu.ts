/*
  Teklifler listesindeki grup: bir teklif hangi süzgeçte görünür.

  Durum tek başına yetmiyor: arşiv tetikleyicisi kabul ve reddi
  status='archived' + archive_reason=<sebep> olarak saklıyor, bazı eski
  kayıtlar ise status='expired' taşıyor. Liste eskiden yalnızca status'a
  bakıyordu; "expired" teklifler hiçbir listede görünmüyor, yeni
  revizyonla değişen eski teklifler aktif listede kalıyordu.

  Saf modül: birim testi teklif-grubu.test.ts.
*/

export type TeklifGrubu = "draft" | "sent" | "accepted" | "rejected" | "expired" | "eski" | "arsiv";

export const TEKLIF_GRUP_ADLARI: Record<TeklifGrubu, string> = {
  draft: "Taslak",
  sent: "Gönderildi",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
  expired: "Süresi doldu",
  eski: "Eski revizyon",
  arsiv: "Arşivlendi",
};

export function teklifGrubu(t: { status: string; archive_reason: string | null; superseded_by: string | null }): TeklifGrubu {
  if (t.superseded_by) return "eski";
  const sebep = t.status === "archived" ? t.archive_reason : t.status;
  if (sebep === "accepted") return "accepted";
  if (sebep === "rejected") return "rejected";
  if (sebep === "expired") return "expired";
  if (t.status === "draft") return "draft";
  if (t.status === "sent") return "sent";
  return "arsiv";
}
