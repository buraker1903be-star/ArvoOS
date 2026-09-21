/*
  Sohbet arşivi kuralı.

  Arşiv sohbet düzeyinde bir damga (whatsapp_conversation_state.archived_at),
  mesaj satırlarına dokunmaz. Buradaki tek karar şu: damga ne zamana kadar
  geçerli sayılır.

  Kural: arşivden SONRA gelen ya da giden ilk mesaj arşivi düşürür. Yazışma
  yeniden canlanmışsa sohbetin arşivde kalması, müşterinin yazdığını
  kimsenin görmemesi demek olurdu — WhatsApp'ın kendi davranışı da budur.

  Kararı veriye değil koda koymak bilinçli: "arşivde kalsın" gibi bir
  tercih eklemek istediğimizde eski damgaları bozmadan fikir
  değiştirebilelim diye.
*/

/**
 * Sohbet şu anda arşivde mi?
 *
 * @param arsivZamani `archived_at`; arşivlenmemişse null.
 * @param sonMesajZamani Sohbetteki en yeni mesajın zamanı.
 */
export function arsivdeMi(arsivZamani: string | null | undefined, sonMesajZamani: string | null | undefined): boolean {
  if (!arsivZamani) return false;
  if (!sonMesajZamani) return true;

  const arsiv = Date.parse(arsivZamani);
  const son = Date.parse(sonMesajZamani);
  /*
    Zaman okunamazsa arşivde SAYILMAZ. Yanlış tarafa düşmenin iki sonucu
    var: arşivde görünmeyen sohbet (kullanıcı listede görür, gereksiz
    gürültü) ya da kaybolan sohbet (kullanıcı mesajı hiç görmez).
    İkincisi çok daha kötü.
  */
  if (Number.isNaN(arsiv) || Number.isNaN(son)) return false;

  return son <= arsiv;
}
