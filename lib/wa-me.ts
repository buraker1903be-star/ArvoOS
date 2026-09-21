import { normalizePhone } from "@/lib/whatsapp-send";

/*
  WhatsApp Web bağlantısı (eski usul gönderim).

  Kendi numarasını bağlamamış kurumda personel mesajı hâlâ kendi WhatsApp
  hesabından gönderiyor. Eskiden bağlantı `wa.me/?text=...` biçimindeydi:
  numara YOKTU, WhatsApp "kime göndereceksiniz" diye soruyordu ve personel
  rehberden elle seçiyordu. Eski usulün asıl riski buydu — teklif yanlış
  kişiye üç tıkla gidebiliyordu.

  Numarayı bağlantıya koyunca sohbet doğrudan sözleşmedeki kişiyle
  açılıyor. Numara tanınmazsa yine numarasız bağlantı dönüyor: gönderimi
  büsbütün engellemek yerine personelin elle seçmesine izin veriyoruz.
*/
export function waMeAdresi(telefon: string | null | undefined, metin: string): string {
  const numara = normalizePhone(String(telefon ?? ""));
  const govde = encodeURIComponent(metin);
  return numara ? `https://wa.me/${numara}?text=${govde}` : `https://wa.me/?text=${govde}`;
}
