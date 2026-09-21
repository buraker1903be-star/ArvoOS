import { createAdminClient } from "@/lib/supabase/admin";
import { windowOpen } from "@/lib/whatsapp-send";
import type { InboundMessage, StatusUpdate, WebhookPayload } from "@/lib/whatsapp-webhook";

/*
  Meta bildirimlerinin veritabanı tarafı ve gelen kutusu okumaları.

  Yazma yalnızca buradan, service_role ile olur: whatsapp_messages'ta
  politika yalnızca SELECT için var, kullanıcı "gönderildi" ya da "müşteri
  şunu yazdı" diye satır yazamaz.

  Gelen mesajı kuruma eşleme: bildirimdeki phone_number_id hangi kurumun
  bağlı numarasıysa mesaj o kurumun. Arvo'nun ortak numarasına gelen yanıt
  için bağlı kurum yok; o yüzden aynı numaraya Arvo adına gönderilmiş son
  mesajın kurumu kullanılır — müşteri kime cevap veriyorsa odur. Hiçbiri
  tutmazsa mesaj yazılmaz (kurumsuz satır zaten yazılamaz, organization_id
  not null) ve sebebi günlüğe düşer.
*/

export type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  product: string;
  sender: "organization" | "arvo";
  body: string | null;
  template: string | null;
  status: string;
  error: string | null;
  createdAt: string;
};

export type InboxConversation = {
  phone: string;
  name: string | null;
  lastBody: string | null;
  lastDirection: "inbound" | "outbound";
  lastAt: string;
  /** Okunmamış değil: müşteri son 24 saatte yazdıysa serbest metinle yanıtlanabilir. */
  windowOpen: boolean;
  messageCount: number;
};

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** phone_number_id → kurum; Arvo'nun numarasında son giden mesajdan çıkarılır. */
async function kurumuBul(admin: Admin, message: InboundMessage): Promise<string | null> {
  const { data: hesap } = await admin
    .from("whatsapp_accounts")
    .select("organization_id")
    .eq("phone_number_id", message.phoneNumberId)
    .maybeSingle();
  if (hesap) return hesap.organization_id;

  if (message.phoneNumberId !== process.env.WHATSAPP_PHONE_ID) return null;
  const { data: sonMesaj } = await admin
    .from("whatsapp_messages")
    .select("organization_id")
    .eq("sender", "arvo")
    .eq("counterpart_phone", message.from)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return sonMesaj?.organization_id ?? null;
}

export async function applyWebhook(payload: WebhookPayload): Promise<{ inbound: number; statuses: number }> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil; WhatsApp bildirimi işlenemiyor.");

  let inbound = 0;
  for (const message of payload.inbound) {
    const organizationId = await kurumuBul(admin, message);
    if (!organizationId) {
      console.warn("[whatsapp] gelen mesajın kurumu bulunamadı", message.phoneNumberId);
      continue;
    }
    const arvoNumarasi = message.phoneNumberId === process.env.WHATSAPP_PHONE_ID;
    const { error } = await admin.from("whatsapp_messages").insert({
      organization_id: organizationId,
      // Gelen mesaj hangi üründen sayılır belli değil; kaydı ArvoOS tutar,
      // gelen kutusu ekranı ürün ayırmadan tek sohbet gösterir.
      product: "arvoos",
      sender: arvoNumarasi ? "arvo" : "organization",
      direction: "inbound",
      phone_number_id: message.phoneNumberId,
      wa_message_id: message.waMessageId,
      counterpart_phone: message.from,
      profile_name: message.profileName,
      body: message.body,
      status: "received",
      created_at: message.sentAt,
      updated_at: message.sentAt,
    });
    // 23505: Meta aynı bildirimi yeniden yolladı, tekillik indeksi tuttu.
    if (error && error.code !== "23505") console.error("[whatsapp] gelen mesaj yazılamadı", error.message);
    else if (!error) inbound += 1;
  }

  let statuses = 0;
  for (const update of payload.statuses) {
    if (await durumYaz(admin, update)) statuses += 1;
  }
  return { inbound, statuses };
}

/** İleri durum geri alınmaz: "read" gelmişken geç kalan "delivered" yazılmasın. */
const SIRA: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

async function durumYaz(admin: Admin, update: StatusUpdate): Promise<boolean> {
  const { data: satir } = await admin
    .from("whatsapp_messages")
    .select("id,status")
    .eq("wa_message_id", update.waMessageId)
    .eq("direction", "outbound")
    .maybeSingle();
  // Bizim göndermediğimiz mesajın durumu: kaydı yok, atlıyoruz.
  if (!satir) return false;
  if ((SIRA[update.status] ?? 0) <= (SIRA[satir.status] ?? 0) && update.status !== "failed") return false;

  const { error } = await admin
    .from("whatsapp_messages")
    .update({ status: update.status, error: update.error, updated_at: update.at })
    .eq("id", satir.id);
  if (error) {
    console.error("[whatsapp] durum yazılamadı", error.message);
    return false;
  }
  return true;
}

/** Gelen kutusu: numaraya göre sohbetler, son mesaja göre sıralı. */
export async function listConversations(organizationId: string, limit = 300): Promise<InboxConversation[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data } = await admin
    .from("whatsapp_messages")
    .select("counterpart_phone,profile_name,body,template,direction,created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const sohbetler = new Map<string, InboxConversation & { lastInboundAt: string | null }>();
  for (const satir of data ?? []) {
    const telefon = satir.counterpart_phone as string;
    let sohbet = sohbetler.get(telefon);
    if (!sohbet) {
      sohbet = {
        phone: telefon,
        name: null,
        lastBody: (satir.body as string | null) ?? (satir.template as string | null),
        lastDirection: satir.direction as InboxConversation["lastDirection"],
        lastAt: satir.created_at as string,
        windowOpen: false,
        messageCount: 0,
        lastInboundAt: null,
      };
      sohbetler.set(telefon, sohbet);
    }
    sohbet.messageCount += 1;
    // Satırlar yeniden eskiye geliyor: ilk gördüğümüz gelen mesaj en yenisi.
    if (satir.direction === "inbound") {
      sohbet.lastInboundAt ??= satir.created_at as string;
      sohbet.name ??= (satir.profile_name as string | null) ?? null;
    }
  }
  return [...sohbetler.values()].map(({ lastInboundAt, ...sohbet }) => ({ ...sohbet, windowOpen: windowOpen(lastInboundAt) }));
}

export async function loadConversation(organizationId: string, phone: string): Promise<{ messages: InboxMessage[]; windowOpen: boolean }> {
  const admin = createAdminClient();
  if (!admin) return { messages: [], windowOpen: false };
  const { data } = await admin
    .from("whatsapp_messages")
    .select("id,direction,product,sender,body,template,status,error,created_at")
    .eq("organization_id", organizationId)
    .eq("counterpart_phone", phone)
    .order("created_at", { ascending: true })
    .limit(200);

  const messages = (data ?? []).map((satir) => ({
    id: satir.id as string,
    direction: satir.direction as InboxMessage["direction"],
    product: satir.product as string,
    sender: satir.sender as InboxMessage["sender"],
    body: (satir.body as string | null) ?? null,
    template: (satir.template as string | null) ?? null,
    status: satir.status as string,
    error: (satir.error as string | null) ?? null,
    createdAt: satir.created_at as string,
  }));
  const sonGelen = [...messages].reverse().find((m) => m.direction === "inbound");
  return { messages, windowOpen: windowOpen(sonGelen?.createdAt ?? null) };
}
