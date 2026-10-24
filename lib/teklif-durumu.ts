/*
  TEKLİFİN ETKİN DURUMU (24.10.2026).

  `crm_proposals.status` kabul/ret/süresi geçmiş durumlarını TUTMUYOR.
  Canlıdaki `archive_inactive_crm_proposal` tetikleyicisi (BEFORE
  INSERT OR UPDATE OF status, valid_until) bu üç durumu görünce
  satırı şöyle değiştiriyor:

      archive_reason := status;
      status         := 'archived';

  Yani veritabanında `status = 'accepted'` olan bir teklif HİÇ YOK.
  `status = 'accepted'` arayan bir sorgu sıfır satır döndürür ve hata
  vermez — dönüşüm oranı her zaman %0 çıkar. Bu rapor altyapısında
  tam bu oldu: Satış Analitiği'nin kabul sayımı
  `teklif.status === "accepted"` yazıyordu ve hiçbir koşulda
  dolamazdı (24.10.2026, canlı şema dökümünden yakalandı).

  Tetikleyici ayrıca `valid_until` geçmiş bir `sent` teklifi
  kendiliğinden `expired` yapıyor; yani "süresi geçti" de burada.

  Kural veritabanında `private.arvo_proposal_effective_status` olarak
  da var (20260914150000). İKİZİ BURADA ve ikisi aynı kalmak zorunda:
  biri değişirse diğeri aynı gün değişir.
*/
export const TEKLIF_DURUMLARI = ["draft", "sent", "accepted", "rejected", "expired", "archived"] as const;
export type TeklifDurumu = (typeof TEKLIF_DURUMLARI)[number];

/** Arşiv sebebinde taşınan gerçek durumlar. */
const SEBEPTE_TASINAN = new Set(["accepted", "rejected", "expired"]);

export function etkinTeklifDurumu(status: string, archiveReason: string | null | undefined): TeklifDurumu {
  if (status === "archived" && archiveReason && SEBEPTE_TASINAN.has(archiveReason)) {
    return archiveReason as TeklifDurumu;
  }
  return (TEKLIF_DURUMLARI as readonly string[]).includes(status) ? (status as TeklifDurumu) : "archived";
}

/** Ekranda görünen Türkçe ad. */
export const TEKLIF_DURUM_ADI: Record<TeklifDurumu, string> = {
  draft: "Taslak",
  sent: "Yanıt bekliyor",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
  expired: "Süresi geçti",
  archived: "Arşivlendi",
};
