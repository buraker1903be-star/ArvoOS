import { createAdminClient } from "@/lib/supabase/admin";
import { windowOpen } from "@/lib/whatsapp-send";
import type { InboundMessage, StatusUpdate, WebhookPayload } from "@/lib/whatsapp-webhook";
import { gelenMesajinKurumu, type KurumEslemesi } from "@/lib/whatsapp-kurum-eslemesi";
import { arsivdeMi } from "@/lib/whatsapp-arsiv";
import { decryptSecret, paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { gorunenDosyaAdi, medyayiIndir, uzanti } from "@/lib/whatsapp-medya";
import type { HazirMesaj } from "@/lib/whatsapp-hazir-mesaj";

/*
  Meta bildirimlerinin veritabanı tarafı ve gelen kutusu okumaları.

  Yazma yalnızca buradan, service_role ile olur: whatsapp_messages'ta
  politika yalnızca SELECT için var, kullanıcı "gönderildi" ya da "müşteri
  şunu yazdı" diye satır yazamaz.

  Gelen mesajı kuruma eşleme kuralı ve gerekçesi:
  lib/whatsapp-kurum-eslemesi.ts. Burada yalnızca ipuçları toplanır.
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
  /** Mesajın türü (text, image, document…); ekran görseli metinden ayırsın. */
  messageType: string;
  media: {
    /** none: medya yok · pending: inmedi · stored: kovada · failed: inemedi */
    status: "none" | "pending" | "stored" | "failed";
    mime: string | null;
    filename: string | null;
    size: number | null;
    error: string | null;
  } | null;
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
  archived: boolean;
  /**
   * Okunmamış gelen mesaj sayısı.
   *
   * Eskiden yalnızca "son mesaj müşteriden mi" bilgisi vardı ve bu
   * okunmamışlık değildi: sohbet okunduktan sonra da işaret duruyordu,
   * yani "bakılacak" ile "bakılmış" hiç ayrılmıyordu.
   */
  unread: number;
};

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/*
  Arvo'nun kendi kurumu (organizations.kind = 'internal') süreç boyunca
  değişmez; her mesaj için sorgulanmaz. Hata önbelleğe alınmaz, yoksa tek
  bir geçici arıza süreç boyunca eşlemeyi bozardı.
*/
let arvoKurumId: string | null = null;

async function arvoKurumunuBul(admin: Admin): Promise<string | null> {
  if (arvoKurumId) return arvoKurumId;
  const { data } = await admin
    .from("organizations")
    .select("id")
    .eq("kind", "internal")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  arvoKurumId = data?.id ?? null;
  return arvoKurumId;
}

/** Eşleme ipuçlarını toplar; kararı lib/whatsapp-kurum-eslemesi.ts verir. */
async function kurumuBul(admin: Admin, message: InboundMessage): Promise<KurumEslemesi | null> {
  const { data: hesap } = await admin
    .from("whatsapp_accounts")
    .select("organization_id")
    .eq("phone_number_id", message.phoneNumberId)
    .maybeSingle();

  const arvoNumarasi = message.phoneNumberId === process.env.WHATSAPP_PHONE_ID;
  // Bağlı numara bulunduysa ya da Arvo'nun numarası değilse başka ipucu aranmaz.
  if (hesap?.organization_id || !arvoNumarasi) {
    return gelenMesajinKurumu({ bagliKurumId: hesap?.organization_id, arvoNumarasi });
  }

  const { data: sonMesaj } = await admin
    .from("whatsapp_messages")
    .select("organization_id")
    .eq("sender", "arvo")
    .eq("counterpart_phone", message.from)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return gelenMesajinKurumu({
    arvoNumarasi,
    sonYazismaKurumId: sonMesaj?.organization_id,
    // Hiç yazışma yoksa mesaj Arvo'ya yazılmıştır; sessizce atılmaz.
    arvoKurumId: sonMesaj?.organization_id ? null : await arvoKurumunuBul(admin),
  });
}

export async function applyWebhook(payload: WebhookPayload): Promise<{ inbound: number; statuses: number }> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil; WhatsApp bildirimi işlenemiyor.");

  let inbound = 0;
  for (const message of payload.inbound) {
    const esleme = await kurumuBul(admin, message);
    if (!esleme) {
      /*
        Buraya yalnızca kurulum hatasında düşülür: tanınmayan bir numaraya
        gelen bildirim ya da Arvo'nun kendi kurumunun kayıtlı olmaması.
      */
      console.warn("[whatsapp] gelen mesajın kurumu bulunamadı", message.phoneNumberId);
      continue;
    }
    const organizationId = esleme.organizationId;
    const arvoNumarasi = message.phoneNumberId === process.env.WHATSAPP_PHONE_ID;
    /*
      Satır ÖNCE yazılıyor, dosya sonra indiriliyor. Sıra önemli: indirme
      Meta'ya iki istek demek ve düşebilir. Mesajı indirmeye bağlarsak,
      dosya inmediğinde "müşteri bir şey gönderdi" bilgisi de kaybolur ve
      karşı tarafta kimse bir şey olduğunu bilmez.
    */
    const { data: satir, error } = await admin
      .from("whatsapp_messages")
      .insert({
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
        message_type: message.type || "text",
        media_id: message.media?.id ?? null,
        media_mime: message.media?.mime ?? null,
        media_filename: message.media?.filename ?? null,
        media_status: message.media ? "pending" : "none",
        created_at: message.sentAt,
        updated_at: message.sentAt,
      })
      .select("id")
      .maybeSingle();
    // 23505: Meta aynı bildirimi yeniden yolladı, tekillik indeksi tuttu.
    if (error && error.code !== "23505") console.error("[whatsapp] gelen mesaj yazılamadı", error.message);
    else if (!error) inbound += 1;

    if (!error && satir?.id && message.media) {
      await medyayiSakla(admin, {
        mesajId: satir.id as string,
        organizationId,
        phoneNumberId: message.phoneNumberId,
        tur: message.type,
        mediaId: message.media.id,
        mime: message.media.mime,
        dosyaAdi: message.media.filename,
      });
    }
  }

  let statuses = 0;
  for (const update of payload.statuses) {
    if (await durumYaz(admin, update)) statuses += 1;
  }
  return { inbound, statuses };
}

/**
 * Medyayı indirip kovaya koyar ve satırı günceller.
 *
 * Hata fırlatmıyor: dosya inmese de mesaj duruyor ve satır 'pending'
 * kalıyor, yani panelden açıldığında yeniden denenebiliyor. Meta'daki aslı
 * yaklaşık 30 gün duruyor, o pencerede ikinci şansımız var.
 */
export async function medyayiSakla(
  admin: Admin,
  girdi: {
    mesajId: string;
    organizationId: string;
    phoneNumberId: string;
    tur: string;
    mediaId: string;
    mime: string | null;
    dosyaAdi: string | null;
  },
): Promise<boolean> {
  const basarisiz = async (hata: string) => {
    await admin
      .from("whatsapp_messages")
      .update({ media_status: "failed", media_error: hata, updated_at: new Date().toISOString() })
      .eq("id", girdi.mesajId);
    return false;
  };

  const anahtar = await indirmeAnahtari(admin, girdi.phoneNumberId);
  if (!anahtar) return basarisiz("Numaranın erişim anahtarı bulunamadı; dosya indirilemedi.");

  const sonuc = await medyayiIndir(girdi.mediaId, anahtar);
  if (!sonuc.ok) return basarisiz(sonuc.hata);

  const yol = `${girdi.organizationId}/${girdi.mesajId}.${uzanti(sonuc.medya.mime, girdi.dosyaAdi)}`;
  const { error: yuklemeHatasi } = await admin.storage
    .from("whatsapp-media")
    .upload(yol, sonuc.medya.govde, { contentType: sonuc.medya.mime, upsert: true });
  if (yuklemeHatasi) return basarisiz(`Dosya saklanamadı: ${yuklemeHatasi.message}`);

  const { error } = await admin
    .from("whatsapp_messages")
    .update({
      media_path: yol,
      media_mime: sonuc.medya.mime,
      media_size: sonuc.medya.boyut,
      media_filename: girdi.dosyaAdi ?? gorunenDosyaAdi(girdi.tur, sonuc.medya.mime, null),
      media_status: "stored",
      media_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", girdi.mesajId);
  if (error) {
    // Dosya kovada ama kayıt güncellenemedi: yolu bilmeden dosya erişilemez.
    console.error("[whatsapp] medya kaydı güncellenemedi", error.message);
    await admin.storage.from("whatsapp-media").remove([yol]);
    return basarisiz("Dosya kaydı güncellenemedi.");
  }
  return true;
}

/**
 * İndirme için kullanılacak erişim anahtarı.
 *
 * Bildirimi hangi numara aldıysa onun anahtarı gerekir: kurumun kendi
 * numarasına gelen dosya, Arvo'nun anahtarıyla indirilemez (Meta 190/200).
 */
async function indirmeAnahtari(admin: Admin, phoneNumberId: string): Promise<string | null> {
  if (phoneNumberId === process.env.WHATSAPP_PHONE_ID) return process.env.WHATSAPP_TOKEN ?? null;
  if (!paymentCredentialsConfigured()) return null;

  const { data } = await admin
    .from("whatsapp_accounts")
    .select("access_token_enc,status")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (!data || data.status === "disabled") return null;
  try {
    return decryptSecret(data.access_token_enc);
  } catch {
    return null;
  }
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

/**
 * Gelen kutusu: numaraya göre sohbetler, son mesaja göre sıralı.
 *
 * Arşivlenmişler ayrı dönüyor (`arsiv` bayrağı): liste ekranı ikisini bir
 * arada göstermiyor, çünkü arşivin amacı kapanmış yazışmaları günlük
 * listeden çıkarmak. Sayım için ikisi de gerekiyor ("Arşiv (3)").
 */
/**
 * Kurumun sohbet listesi.
 *
 * SAYIM VERİTABANINDA (migration 20260926113129). Eskiden kurumun son 300
 * MESAJI çekilip uygulamada sohbetlere bölünüyordu ve üç sonucu vardı:
 * messageCount "son 300'ün kaçı bu sohbette" oluyordu, unread yalnızca o
 * pencerede sayılıyordu ve en ağırı — 300 mesajdan eskiye kalan sohbet
 * listeden TAMAMEN kayboluyordu. Gelen kutusunda bu, müşterinin yazdığını
 * hiç görmemek demek. Sınır artık MESAJ değil SOHBET sayısına uygulanıyor.
 *
 * `okunamadi`: okuma başarısız. Eskiden hata yutulup boş dizi dönüyordu ve
 * ekran "hiç yazışma yok" diyordu — bir gelen kutusunda söylenebilecek en
 * yanlış şey.
 */
export async function listConversations(
  organizationId: string,
  limit = 300,
): Promise<{ sohbetler: InboxConversation[]; okunamadi: boolean }> {
  const admin = createAdminClient();
  if (!admin) return { sohbetler: [], okunamadi: true };

  const { data, error } = await admin.rpc("whatsapp_sohbetler", {
    p_organization_id: organizationId,
    p_limit: limit,
  });
  if (error) {
    console.error("[whatsapp] sohbet listesi okunamadı", error.message);
    return { sohbetler: [], okunamadi: true };
  }

  type Satir = {
    counterpart_phone: string;
    profile_name: string | null;
    last_body: string | null;
    last_template: string | null;
    last_direction: string;
    last_at: string;
    last_inbound_at: string | null;
    message_count: number | string;
    unread: number | string;
    archived_at: string | null;
    last_read_at: string | null;
  };

  /* count(*) bigint döner ve PostgREST bigint'i METİN olarak taşır; Number()
     olmadan sayılar şablonda "12" gibi görünür ama karşılaştırmada bozulur. */
  const sohbetler = ((data ?? []) as Satir[]).map((satir) => ({
    phone: satir.counterpart_phone,
    name: satir.profile_name,
    lastBody: satir.last_body ?? satir.last_template,
    lastDirection: satir.last_direction as InboxConversation["lastDirection"],
    lastAt: satir.last_at,
    windowOpen: windowOpen(satir.last_inbound_at),
    messageCount: Number(satir.message_count),
    archived: arsivdeMi(satir.archived_at, satir.last_at),
    unread: Number(satir.unread),
  }));
  return { sohbetler, okunamadi: false };
}

/**
 * Sohbeti arşivler ya da arşivden çıkarır.
 *
 * Yazma service_role ile: tabloda yalnızca SELECT politikası var, çünkü
 * kullanıcı doğrudan yazabilseydi başka kurumun numarasını kendi kurumuna
 * damgalayabilirdi (anahtarın ilk sütunu kurum).
 */
export async function setConversationArchived(
  organizationId: string,
  phone: string,
  archived: boolean,
  userId: string | null,
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil; sohbet arşivlenemiyor.");

  const { error } = await admin.from("whatsapp_conversation_state").upsert(
    {
      organization_id: organizationId,
      counterpart_phone: phone,
      archived_at: archived ? new Date().toISOString() : null,
      archived_by: archived ? userId : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,counterpart_phone" },
  );
  if (error) throw new Error(`Sohbet arşivlenemedi: ${error.message}`);
}

/**
 * Sohbeti "okundu" diye damgalar.
 *
 * Damga KURUM düzeyinde: aynı müşteriyle aynı ekipten iki kişi
 * ilgileniyor ve biri okuduğunda diğerinin de "bakıldı" görmesi doğru.
 * Kişiye özel okunmamışlık, meslektaşının yanıtladığı sohbeti tekrar
 * açmaya yol açardı.
 */
export async function markConversationRead(
  organizationId: string,
  phone: string,
  userId: string | null,
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  const simdi = new Date().toISOString();
  const { error } = await admin.from("whatsapp_conversation_state").upsert(
    {
      organization_id: organizationId,
      counterpart_phone: phone,
      last_read_at: simdi,
      last_read_by: userId,
      updated_at: simdi,
    },
    { onConflict: "organization_id,counterpart_phone" },
  );
  /*
    Hata fırlatmıyoruz: okundu damgası bir kolaylık. Yazılamazsa sohbet
    okunmamış görünmeye devam eder — sohbetin kendisini açılmaz kılmak
    ya da kullanıcıya hata göstermek bundan çok daha kötü olurdu.
  */
  if (error) console.error("[whatsapp] okundu damgası yazılamadı", error.message);
}

export type KayitliHazirMesaj = HazirMesaj & { id: string };

/** Kurumun kayıtlı hazır mesajları; önerilerle birleştirme ekranda yapılır. */
export async function listQuickReplies(organizationId: string): Promise<KayitliHazirMesaj[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data } = await admin
    .from("whatsapp_quick_replies")
    .select("id,title,body")
    .eq("organization_id", organizationId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(50);

  return (data ?? []).map((satir) => ({
    id: satir.id as string,
    title: satir.title as string,
    body: satir.body as string,
  }));
}

export async function createQuickReply(
  organizationId: string,
  title: string,
  body: string,
  userId: string | null,
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil; hazır mesaj kaydedilemiyor.");

  const { error } = await admin.from("whatsapp_quick_replies").insert({
    organization_id: organizationId,
    title,
    body,
    created_by: userId,
  });
  // 23505: aynı başlık zaten var. Kullanıcıya "kaydedildi" demek yanlış olurdu.
  if (error?.code === "23505") throw new Error(`"${title}" adında bir hazır mesaj zaten var.`);
  if (error) throw new Error(`Hazır mesaj kaydedilemedi: ${error.message}`);
}

/** Silme kurum kimliğiyle sınırlı: başka kurumun kaydı kimliği bilinse de silinemez. */
export async function deleteQuickReply(organizationId: string, id: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil; hazır mesaj silinemiyor.");

  const { error } = await admin
    .from("whatsapp_quick_replies")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id);
  if (error) throw new Error(`Hazır mesaj silinemedi: ${error.message}`);
}

export async function loadConversation(organizationId: string, phone: string): Promise<{ messages: InboxMessage[]; windowOpen: boolean }> {
  const admin = createAdminClient();
  if (!admin) return { messages: [], windowOpen: false };
  const { data } = await admin
    .from("whatsapp_messages")
    .select("id,direction,product,sender,body,template,status,error,created_at,message_type,media_status,media_mime,media_filename,media_size,media_error")
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
    messageType: (satir.message_type as string | null) ?? "text",
    media:
      (satir.media_status as string) && satir.media_status !== "none"
        ? {
            status: satir.media_status as "pending" | "stored" | "failed",
            mime: (satir.media_mime as string | null) ?? null,
            filename: (satir.media_filename as string | null) ?? null,
            size: (satir.media_size as number | null) ?? null,
            error: (satir.media_error as string | null) ?? null,
          }
        : null,
  }));
  const sonGelen = [...messages].reverse().find((m) => m.direction === "inbound");
  return { messages, windowOpen: windowOpen(sonGelen?.createdAt ?? null) };
}
