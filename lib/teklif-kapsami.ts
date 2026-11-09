/*
  TEKLİF / SÖZLEŞME KAPSAMI ve TALEBİN İÇ NOTU (OS-01, 09.11.2026).

  Talepte iki ayrı metin var ve anlamları farklı:
    - request_details.scope — "Beklenen kapsam ve teslimler": müşterinin
      istediği iş. Teklifin "Hizmet kapsamı"na aktarılabilir; teklif ve
      sözleşmede müşteriye gider.
    - crm_opportunities.notes — "Ek not": personelin görüşme notu,
      hatırlatma, iç bilgi. Müşteriye gitmez.

  Eskiden teklif formunun kapsam varsayılanı `scope || notes || title`
  idi (crm/requests/[id]/page.tsx, iki yerde): kapsamı boş bir talepte
  iç not müşteriye gidecek "Hizmet kapsamı" kutusunda hazır geliyordu ve
  personel fark etmeden teklifi gönderirse not belgeye, PDF'e ve müşteri
  sayfasına basılırdı. Konu (title) da kapsam yerine geçiyordu. Artık
  varsayılan yalnızca müşteri kapsamı; o boşsa kutu boş açılır ve kapsam
  zorunlu olduğu için personel açıkça yazar.

  Saf modül: test edilebilsin diye Next/Supabase'e dokunmuyor
  (tests/unit/teklif-kapsami.test.ts).
*/

/** Kapsamın en kısa uzunluğu; veritabanı işlevi ve sunucu işlemi de bunu bekliyor. */
export const KAPSAM_EN_KISA = 2;

/**
 * Teklif ya da direkt sözleşme formunun "Hizmet kapsamı" varsayılanı:
 * yalnızca talepteki müşteri kapsamı. İç not, konu ya da başka bir alan
 * yerine GEÇMEZ; kapsam boşsa boş metin döner.
 */
export function teklifKapsamiVarsayilani(talepDetayi: unknown): string {
  if (!talepDetayi || typeof talepDetayi !== "object" || Array.isArray(talepDetayi)) return "";
  const kapsam = (talepDetayi as Record<string, unknown>).scope;
  return typeof kapsam === "string" ? kapsam.trim() : "";
}

/**
 * Sunucu tarafı kapsam denetimi. Kapsam formdan olduğu gibi alınır; boşsa
 * hiçbir alandan doldurulmaz, kullanıcıya ne yazması gerektiği söylenir.
 */
export function kapsamHatasi(kapsam: string, belge: "Teklif" | "Sözleşme" = "Teklif"): string | null {
  if (kapsam.trim().length >= KAPSAM_EN_KISA) return null;
  return `Hizmet kapsamını yazın. Bu metin ${belge.toLocaleLowerCase("tr")} belgesinde müşteriye gösterilir; talepteki iç notlar buraya aktarılmaz.`;
}
