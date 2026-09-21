import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { normalizePhone, sendWhatsappTemplates, type WhatsappSendItem, type WhatsappSendResult } from "@/lib/whatsapp-send";

/*
  Dört ürünün WhatsApp kapısı. Ürünler Meta'ya değil buraya çağırır:
  tek yerde anahtar, tek yerde kayıt, tek yerde hata haritası.

  Gönderen iki türlü olabilir:
    organization — kurumun kendi bağladığı numara (Ayarlar → Entegrasyonlar).
                   Müşteri "Arvo"dan değil çalıştığı işletmeden mesaj alır.
    arvo         — Arvo'nun ortak numarası (ödeme hatırlatma, lisans
                   bildirimi) ve numarasını bağlamamış kurumlar için yedek.

  Her mesaj whatsapp_messages'a yazılır: "gitti mi" sorusunun ve gelen kutusu
  ekranının tek kaynağı burası. Kullanıcı bu tabloya yazamaz (RLS); damga
  yalnızca buradan, service_role ile düşer.
*/

export type GatewayProduct = "arvoos" | "arvolab" | "arc" | "randevu";
export type GatewaySender = "organization" | "arvo";

export type GatewayRequest = {
  product: GatewayProduct;
  organizationId: string;
  /** İstenen gönderen; kurum numarası yoksa "arvo"ya düşer. */
  sender?: GatewaySender;
  messages: {
    ref?: string | null;
    to: string;
    /** Onaylı şablon; serbest metin yollanıyorsa boş. */
    template?: string;
    params?: string[] | Record<string, string>;
    /** Şablonun dinamik URL düğmesine eklenecek son parça (paylaşım anahtarı). */
    urlButtonParam?: string;
    language?: string;
    /** 24 saatlik pencere içinde serbest metin (gelen kutusu yanıtı). */
    text?: string;
    /** 24 saatlik pencere içinde görsel/dosya; kimlik Meta'ya yüklenerek alınır. */
    media?: { kind: "image" | "document" | "video" | "audio"; id: string; caption?: string; filename?: string };
    /**
     * Gönderilen dosyanın BİZDEKİ kopyasının kova yolu.
     *
     * Meta'ya yüklenen medyanın kimliği 30 gün sonra ölüyor; gelen kutusu
     * ekranı giden dosyayı da gösterebilsin diye kopyayı biz saklıyoruz.
     * Yükleme çağıranın işi (kova erişimi orada), kapı yalnızca kaydediyor.
     */
    mediaPath?: string;
    /** Kopyanın MIME türü ve boyutu; ekran görseli dosyadan ayırsın. */
    mediaMime?: string;
    mediaSize?: number;
    /** Kayda düşecek metin; şablonlu mesajda ürünün kendi cümlesi. */
    body?: string | null;
  }[];
};

export type GatewayResponse = {
  sender: GatewaySender;
  /** Kurum numarası istendi ama yoktu: ürün bunu günlüğünde görsün. */
  fellBackToArvo: boolean;
  results: WhatsappSendResult[];
};

export class GatewayError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type Sender = { credentials: { phoneNumberId: string; token: string }; kind: GatewaySender };

/** Arvo'nun ortak numarası; ortam değişkeninde, veritabanında değil. */
function arvoSender(): Sender | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
  return token && phoneNumberId ? { credentials: { phoneNumberId, token }, kind: "arvo" } : null;
}

export async function sendThroughGateway(request: GatewayRequest): Promise<GatewayResponse> {
  const admin = createAdminClient();
  if (!admin) throw new GatewayError(503, "Sunucu anahtarı tanımlı değil; WhatsApp kapısı kapalı.");

  if (!request.organizationId) throw new GatewayError(400, "organizationId zorunlu.");
  const items: WhatsappSendItem[] = [];
  const rejected: WhatsappSendResult[] = [];
  for (const message of request.messages ?? []) {
    const to = normalizePhone(message.to);
    if (!to) {
      // Geçersiz numarayı Meta'ya hiç sormuyoruz; ürün sebebini görsün.
      rejected.push({ ref: message.ref ?? null, to: message.to, sent: false, error: "Cep telefonu numarası geçersiz (5XXXXXXXXX bekleniyor)." });
      continue;
    }
    // Şablon ya da serbest metin: biri olmalı. Serbest metin yalnızca
    // müşterinin son mesajından sonraki 24 saat içinde geçerli.
    if (!message.template && !message.media?.id && !String(message.text ?? "").trim()) {
      throw new GatewayError(400, "Her mesajda onaylı şablon adı (template), medya (media) ya da serbest metin (text) olmalı.");
    }
    items.push({
      ref: message.ref ?? null,
      to,
      template: message.template,
      params: message.params ?? [],
      urlButtonParam: message.urlButtonParam,
      language: message.language,
      text: message.text,
      media: message.media,
    });
  }

  // Gönderen: kurumun kendi numarası mı, Arvo'nunki mi.
  let sender: Sender | null = null;
  let fellBackToArvo = false;
  if ((request.sender ?? "organization") === "organization") {
    if (!paymentCredentialsConfigured()) throw new GatewayError(503, "PAYMENT_CREDENTIALS_KEY tanımlı değil; kurumun anahtarı çözülemiyor.");
    const { data } = await admin
      .from("whatsapp_accounts")
      .select("phone_number_id,access_token_enc,status")
      .eq("organization_id", request.organizationId)
      .maybeSingle();
    if (data && data.status !== "disabled") {
      sender = { credentials: { phoneNumberId: data.phone_number_id, token: decryptSecret(data.access_token_enc) }, kind: "organization" };
    } else {
      fellBackToArvo = true;
    }
  }
  sender ??= arvoSender();
  if (!sender) {
    throw new GatewayError(503, fellBackToArvo
      ? "Kurumun bağlı numarası yok ve Arvo'nun ortak numarası tanımlı değil (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID)."
      : "Arvo'nun WhatsApp numarası tanımlı değil (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID).");
  }

  const results = items.length ? await sendWhatsappTemplates(items, sender.credentials) : [];
  const all = [...results, ...rejected];

  if (all.length) {
    const now = new Date().toISOString();
    const rows = all.map((result) => {
      const kaynak = request.messages.find((m) => (m.ref ?? null) === result.ref);
      return {
        organization_id: request.organizationId,
        product: request.product,
        sender: sender.kind,
        direction: "outbound",
        phone_number_id: sender.credentials.phoneNumberId,
        wa_message_id: result.waMessageId ?? null,
        counterpart_phone: result.to,
        template: kaynak?.template ?? null,
        params: kaynak?.params ?? null,
        // Kayda düşen metin: ürünün kendi cümlesi ya da serbest metnin
        // kendisi. Gelen kutusu müşterinin gördüğü mesajı göstersin.
        body: kaynak?.body ?? kaynak?.text ?? null,
        message_type: kaynak?.media?.kind ?? "text",
        media_mime: kaynak?.mediaMime ?? null,
        media_size: kaynak?.mediaSize ?? null,
        media_filename: kaynak?.media?.filename ?? null,
        media_path: kaynak?.mediaPath ?? null,
        // Kopya zaten kovada (çağıran yükledi); indirilecek bir şey yok.
        media_status: kaynak?.mediaPath ? "stored" : "none",
        status: result.sent ? "sent" : "failed",
        error: result.error ?? null,
        ref: result.ref,
        updated_at: now,
      };
    });
    // Kayıt yazılamazsa gönderim yine de olmuştur: ürünü yanıltmayalım,
    // sonucu döndürüp hatayı günlüğe yazıyoruz.
    const { error } = await admin.from("whatsapp_messages").insert(rows);
    if (error) console.error("[whatsapp] mesaj kaydı yazılamadı", error.message);
  }

  return { sender: sender.kind, fellBackToArvo, results: all };
}
