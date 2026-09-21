import { createHmac, timingSafeEqual } from "node:crypto";

/*
  Meta'dan gelen WhatsApp bildirimlerinin saf katmanı: imza doğrulama ve
  gövde çözümleme. Ağ, veritabanı ve ortam değişkeni yok; testi
  tests/unit/whatsapp-webhook.test.ts.

  İki tür bildirim gelir:
    messages — müşterinin yazdığı mesaj (gelen kutusu).
    statuses — gönderdiğimiz mesajın akıbeti (iletildi, okundu, düştü).

  Neden imza şart: uç herkese açık (Meta giriş yapmaz). İmzasız bırakmak,
  "müşteriniz şunu yazdı" diyen sahte kaydı herkese açık bırakırdı.

  Neden 200: Meta 200 dönmeyen bildirimi saatlerce yeniden dener ve sonunda
  aboneliği askıya alır. Bu yüzden çözümleyemediğimiz parçayı atlıyoruz,
  isteği reddetmiyoruz.
*/

export type InboundMessage = {
  /** Bildirimi alan numaranın Meta kimliği; kurumu bununla buluyoruz. */
  phoneNumberId: string;
  waMessageId: string;
  /** Yazan kişi, 905XXXXXXXXX. */
  from: string;
  /** Meta'daki profil adı; kurum rehberinde olmayan numarada tek ipucu. */
  profileName: string | null;
  type: string;
  /** Metin; metin dışı türlerde "[görsel]" gibi yer tutucu. */
  body: string;
  /**
   * Görsel/dosya bilgisi. Eskiden okunmadan düşüyordu: müşteri dekont ya da
   * imzalı belge gönderdiğinde panelde yalnızca "[görsel]" yazıyor, dosyaya
   * sonradan da ulaşılamıyordu. Meta dosyanın kendisini değil kimliğini
   * yolluyor; indirmek ayrı bir istek ve erişim anahtarı istiyor.
   */
  media: InboundMedia | null;
  sentAt: string;
};

export type InboundMedia = {
  /** Meta'nın medya kimliği; indirme bununla yapılır (yaklaşık 30 gün geçerli). */
  id: string;
  mime: string | null;
  /** Yalnızca belge türünde gelir; görselde Meta ad vermiyor. */
  filename: string | null;
  sha256: string | null;
};

export type StatusUpdate = {
  waMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  error: string | null;
  at: string;
};

export type WebhookPayload = { inbound: InboundMessage[]; statuses: StatusUpdate[] };

/**
 * X-Hub-Signature-256 doğrulaması. Gövdenin HAM hâliyle hesaplanır:
 * JSON'u çözüp yeniden dizmek boşlukları değiştirir ve imza tutmaz.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const received = header.slice("sha256=".length).trim();
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
}

/** Meta saniye cinsinden damga yollar; veritabanı timestamptz bekliyor. */
function zaman(timestamp: unknown): string {
  const saniye = Number(timestamp);
  return Number.isFinite(saniye) && saniye > 0 ? new Date(saniye * 1000).toISOString() : new Date().toISOString();
}

/** Metin dışı türler için okunur yer tutucu; gelen kutusu boş satır göstermesin. */
const YER_TUTUCU: Record<string, string> = {
  image: "[görsel]", video: "[video]", audio: "[ses kaydı]", voice: "[sesli mesaj]",
  document: "[belge]", sticker: "[çıkartma]", location: "[konum]", contacts: "[kişi kartı]",
  order: "[sipariş]", system: "[sistem bildirimi]", unsupported: "[desteklenmeyen mesaj]",
};

/** Meta gövdesi serbest biçimli; alanları okurken tür değil varlık kontrolü yapıyoruz. */
interface MetaNesne { [anahtar: string]: MetaDeger }
type MetaDeger = string | number | boolean | null | undefined | MetaNesne | MetaDeger[];

const nesne = (deger: MetaDeger): MetaNesne => (deger && typeof deger === "object" && !Array.isArray(deger) ? deger : {});
const dizi = (deger: MetaDeger): MetaDeger[] => (Array.isArray(deger) ? deger : []);
const yazi = (deger: MetaDeger): string => (typeof deger === "string" ? deger : "");

function govdeMetni(message: MetaNesne): string {
  const type = yazi(message.type);
  if (type === "text") return yazi(nesne(message.text).body).trim();
  // Düğme ve liste yanıtları metin gibi davranır: müşteri bir seçenek seçti.
  if (type === "button") return yazi(nesne(message.button).text).trim() || "[düğme]";
  if (type === "interactive") {
    const i = nesne(message.interactive);
    return (yazi(nesne(i.button_reply).title) || yazi(nesne(i.list_reply).title)).trim() || "[seçim]";
  }
  if (type === "reaction") return `[tepki ${yazi(nesne(message.reaction).emoji)}]`.trim();
  const altYazi = (yazi(nesne(message.image).caption) || yazi(nesne(message.video).caption) || yazi(nesne(message.document).caption)).trim();
  const tutucu = YER_TUTUCU[type] ?? `[${type || "bilinmeyen"}]`;
  return altYazi ? `${tutucu} ${altYazi}` : tutucu;
}

/** Medya taşıyan türler; konum ve kişi kartı dosya değil, veri taşır. */
const MEDYA_TURLERI = ["image", "video", "audio", "voice", "document", "sticker"] as const;

/**
 * Mesajın medya bilgisi; taşımıyorsa null.
 *
 * Kimlik yoksa null dönüyoruz: kimliksiz bir medya kaydı, ekranda
 * indirilemeyecek bir dosya düğmesi göstermek demek olurdu.
 */
function medyaBilgisi(message: MetaNesne): InboundMedia | null {
  const type = yazi(message.type);
  if (!(MEDYA_TURLERI as readonly string[]).includes(type)) return null;

  const medya = nesne(message[type]);
  const id = yazi(medya.id).trim();
  if (!id) return null;

  return {
    id,
    mime: yazi(medya.mime_type).split(";")[0].trim() || null,
    filename: yazi(medya.filename).trim() || null,
    sha256: yazi(medya.sha256).trim() || null,
  };
}

/** Meta'nın durum hatasını Türkçeleştirir; ham "131047" kimseye bir şey söylemez. */
export function statusErrorMessage(error: { code?: number; title?: string; message?: string } | undefined): string | null {
  if (!error) return null;
  if (error.code === 131047) return "24 saatlik pencere kapalı: serbest metin gönderilemez, onaylı şablon gerekir.";
  if (error.code === 131026) return "Numara WhatsApp'ta kayıtlı değil ya da mesaj alamıyor.";
  if (error.code === 131049 || error.code === 131050) return "Kullanıcı bu tür mesajları almayı kapatmış.";
  if (error.code === 470 || error.code === 131048) return "Meta bu numaraya gönderimi sınırladı (spam koruması).";
  return error.message?.trim() || error.title?.trim() || `Meta mesajı iletemedi (${error.code ?? "bilinmeyen"}).`;
}

const DURUMLAR = new Set(["sent", "delivered", "read", "failed"]);

export function parseWhatsappWebhook(payload: unknown): WebhookPayload {
  const inbound: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  const govde = nesne(payload as MetaDeger);

  for (const girdi of dizi(govde.entry)) {
    const entry = nesne(girdi);
    for (const degisiklik of dizi(entry.changes)) {
      const change = nesne(degisiklik);
      // Şablon onayı, kalite değişikliği gibi diğer alanlar buraya düşer:
      // ilgilenmiyoruz ama isteği de reddetmiyoruz.
      if (change.field !== "messages") continue;
      const value = nesne(change.value);
      const phoneNumberId = yazi(nesne(value.metadata).phone_number_id);

      const adlar = new Map<string, string>();
      for (const kisi of dizi(value.contacts)) {
        const contact = nesne(kisi);
        const ad = yazi(nesne(contact.profile).name).trim();
        const waId = yazi(contact.wa_id);
        if (waId && ad) adlar.set(waId, ad);
      }

      for (const ham of dizi(value.messages)) {
        const message = nesne(ham);
        const waMessageId = yazi(message.id);
        const from = yazi(message.from);
        if (!waMessageId || !from || !phoneNumberId) continue;
        inbound.push({
          phoneNumberId,
          waMessageId,
          from,
          profileName: adlar.get(from) ?? null,
          type: yazi(message.type) || "text",
          body: govdeMetni(message),
          media: medyaBilgisi(message),
          sentAt: zaman(message.timestamp),
        });
      }

      for (const hamDurum of dizi(value.statuses)) {
        const status = nesne(hamDurum);
        const waMessageId = yazi(status.id);
        const durum = yazi(status.status);
        if (!waMessageId || !DURUMLAR.has(durum)) continue;
        // Hata yoksa sebep de yok: boş nesneyi çevirmeye kalkmak her
        // "iletildi" bildirimine uydurma bir hata metni iliştirirdi.
        const hamHata = dizi(status.errors)[0];
        const hata = nesne(hamHata);
        statuses.push({
          waMessageId,
          status: durum as StatusUpdate["status"],
          error: hamHata ? statusErrorMessage({
            code: typeof hata.code === "number" ? hata.code : undefined,
            title: yazi(hata.title) || undefined,
            message: yazi(hata.message) || undefined,
          }) : null,
          at: zaman(status.timestamp),
        });
      }
    }
  }
  return { inbound, statuses };
}
