import { SOZLESME_BLOKLARI, SOZLESME_YER_TUTUCULARI, SON_MADDE, ZORUNLU_MADDELER, sozlesmeVarsayilanMetinleri, specialClausesFor } from "@/app/_components/legal/contract-clauses";
import { TEKLIF_BLOKLARI, TEKLIF_VARSAYILAN, TEKLIF_VARSAYILAN_SIRA, TEKLIF_YER_TUTUCULARI, TEKLIF_ZORUNLU } from "@/app/_components/proposal-document";
import { getContractTemplate } from "@/lib/contract-templates";
import type { BelgeTuru } from "@/lib/belge-metni";

export type VarsayilanMadde = { anahtar: string; baslik: string; metin: string; zorunlu: boolean };

/**
 * Bir belge türünün Arvo metni ve kuralları: ekran ile sunucu işlemi aynı
 * kaynaktan okusun. Sözleşmenin özel hükümleri kurumun şablonundan
 * (akademik, yazılım) gelir — imzalanan belgeyle aynı seçim.
 */
export function belgeVarsayilanlari(tur: BelgeTuru, kurumSlug: string | null | undefined) {
  if (tur === "contract") {
    const maddeler: VarsayilanMadde[] = sozlesmeVarsayilanMetinleri(specialClausesFor(getContractTemplate(kurumSlug)));
    return {
      maddeler,
      sira: maddeler.map((madde) => madde.anahtar),
      zorunlu: [...ZORUNLU_MADDELER] as string[],
      son: SON_MADDE as string | undefined,
      yerTutucular: SOZLESME_YER_TUTUCULARI.map((x) => x.ad),
      bloklar: SOZLESME_BLOKLARI.map((x) => x.ad),
      yardim: { yerTutucular: SOZLESME_YER_TUTUCULARI, bloklar: SOZLESME_BLOKLARI },
    };
  }
  return {
    maddeler: TEKLIF_VARSAYILAN as VarsayilanMadde[],
    sira: [...TEKLIF_VARSAYILAN_SIRA] as string[],
    zorunlu: [...TEKLIF_ZORUNLU] as string[],
    son: undefined as string | undefined,
    yerTutucular: TEKLIF_YER_TUTUCULARI.map((x) => x.ad),
    bloklar: TEKLIF_BLOKLARI.map((x) => x.ad),
    yardim: { yerTutucular: TEKLIF_YER_TUTUCULARI, bloklar: TEKLIF_BLOKLARI },
  };
}
