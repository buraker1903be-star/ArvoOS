/*
  WhatsApp şablon gönderimi (Meta Cloud API).

  İki tür mesaj var, ayrımı Meta'nın kuralı koyuyor: iş tarafının BAŞLATTIĞI
  mesaj, müşterinin son yazışmasından 24 saat sonra yalnızca Meta'nın
  ONAYLADIĞI şablonla gönderilebilir. Ürünler bu yüzden kapıya şablon adı +
  parametre yollar, hazır cümle değil. Serbest metin yalnızca müşteri yazdıktan
  sonraki 24 saat içinde geçerlidir (gelen kutusundan verilen yanıt); pencere
  kapalıyken Meta 131047 ile reddeder ve mesaj "gitmedi" olarak kaydedilir.

  Saf: ağ çağrısı dışarıdan verilebilir. Kimin adına gönderildiği (kurumun
  kendi numarası mı Arvo'nunki mi) bu dosyanın bilmesi gereken bir şey değil;
  onu whatsapp-gateway.ts çözer. Testi tests/unit/whatsapp-send.test.ts.
*/
import { GRAPH_VERSION, whatsappErrorMessage } from "./whatsapp-cloud";

export type WhatsappSendItem = {
  /** Ürünün kendi kaydı (randevu kimliği, teklif kimliği…); yanıtta geri döner. */
  ref?: string | null;
  /** Ülke koduyla, artısız: 905XXXXXXXXX. */
  to: string;
  /** Onaylı şablon adı; serbest metin gönderiliyorsa boş. */
  template?: string;
  params?: string[];
  language?: string;
  /**
   * Serbest metin. Yalnızca müşterinin son mesajından sonraki 24 saat
   * içinde geçerli; pencere kapalıyken Meta 131047 ile reddeder. Gelen
   * kutusundan verilen yanıtlar bu yolla gider.
   */
  text?: string;
};

export type WhatsappSendResult = {
  ref: string | null;
  to: string;
  sent: boolean;
  waMessageId?: string;
  error?: string;
};

export type SenderCredentials = { phoneNumberId: string; token: string };

/**
 * Şablon parametresi tek satır olmalı: Meta yeni satır, sekme ve arka arkaya
 * 4+ boşluk içeren parametreyi reddeder (132000). Kurum adı elle yazıldığı
 * için burada sadeleştiriyoruz.
 */
export const templateParam = (value: string) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

/** Meta'nın müşteri hizmeti penceresi: müşterinin son mesajından sonraki 24 saat. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Serbest metin gönderilebilir mi; müşteri hiç yazmadıysa hayır. */
export const windowOpen = (lastInboundAt: string | null, now = Date.now()) =>
  Boolean(lastInboundAt) && now - Date.parse(lastInboundAt as string) < WINDOW_MS;

/** 905XXXXXXXXX biçimine getirir; getiremezse null (mesaj hiç denenmez). */
export function normalizePhone(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("90") ? digits.slice(2)
    : digits.length === 11 && digits.startsWith("0") ? digits.slice(1)
    : digits;
  return /^5\d{9}$/.test(local) ? `90${local}` : null;
}

export function templateBody(item: WhatsappSendItem) {
  return {
    messaging_product: "whatsapp",
    to: item.to,
    type: "template",
    template: {
      name: item.template,
      language: { code: item.language || "tr" },
      components: [{ type: "body", parameters: (item.params ?? []).map((p) => ({ type: "text", text: templateParam(p) })) }],
    },
  };
}

/** 24 saatlik pencere içinde serbest metin; şablon gerekmez. */
export function textMessageBody(item: WhatsappSendItem) {
  return {
    messaging_product: "whatsapp",
    to: item.to,
    type: "text",
    // Önizleme kapalı: yanıtta paylaşılan bağlantı sohbeti kart dolduruyordu.
    text: { preview_url: false, body: String(item.text ?? "").slice(0, 4096) },
  };
}

/** Şablon mu serbest metin mi: gövdeyi mesajın kendisi belirler. */
export const messageBody = (item: WhatsappSendItem) => (item.template ? templateBody(item) : textMessageBody(item));

/** Mesajları tek tek gönderir; biri düşerse diğerleri devam eder. */
export async function sendWhatsappTemplates(
  items: WhatsappSendItem[],
  sender: SenderCredentials,
  getir: typeof fetch = fetch,
): Promise<WhatsappSendResult[]> {
  const adres = `https://graph.facebook.com/${GRAPH_VERSION}/${sender.phoneNumberId}/messages`;
  const results: WhatsappSendResult[] = [];
  for (const item of items) {
    const ref = item.ref ?? null;
    try {
      const yanit = await getir(adres, {
        method: "POST",
        headers: { Authorization: `Bearer ${sender.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(messageBody(item)),
        signal: AbortSignal.timeout(15_000),
      });
      const cevap = (await yanit.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { message?: string; code?: number };
      };
      if (!yanit.ok || cevap.error) {
        results.push({ ref, to: item.to, sent: false, error: whatsappErrorMessage(cevap.error, yanit.status) });
        continue;
      }
      const id = cevap.messages?.[0]?.id;
      // Kimliksiz 200: Meta kabul etmiş sayılmaz, gönderilmedi say.
      results.push(id ? { ref, to: item.to, sent: true, waMessageId: id } : { ref, to: item.to, sent: false, error: "Meta mesaj kimliği döndürmedi." });
    } catch (hata) {
      results.push({ ref, to: item.to, sent: false, error: `Meta'ya ulaşılamadı: ${hata instanceof Error ? hata.message : String(hata)}` });
    }
  }
  return results;
}
