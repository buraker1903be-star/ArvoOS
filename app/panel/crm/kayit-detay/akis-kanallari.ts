import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxMessage } from "@/lib/whatsapp-inbox";
import { kisiAdlari } from "@/lib/kisi-adlari";
import { formatPersonName } from "@/lib/format-name";
import type { PostaKonusmasi } from "../musteri-yazismalari";
import type { AkisKanali } from "./akis-cekmecesi";

/*
  Yazışmalar özetinin ortak satırları (akis-cekmecesi). İş, talep, teklif
  ve sözleşme detayı aynı kanalları gösteriyor; önizleme kuralı dört
  sayfada ayrı yazılsaydı biri "yeni" rozetini başka bir koşulla
  gösterirdi. Sunucuda çalışır (Intl, Türkiye saati).
*/

/* Özet satırında yıl yer kaplıyor ve dar sütunda saati alt satıra itiyordu; tam tarih çekmecede. */
const KISA_ZAMAN = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const ozetZamani = (deger?: string | null) => (deger ? KISA_ZAMAN.format(new Date(deger)) : "");

export function kisalt(metin: string) {
  const tek = metin.replace(/\s+/g, " ").trim();
  return tek.length > 180 ? `${tek.slice(0, 180)}…` : tek;
}

/** Müşterinin takip ekranından yazdığı mesajlar (iş ve sözleşme). */
export function mesajKanali(
  mesajlar: { sender_type: string; sender_name: string; body: string; created_at: string; read_at: string | null }[],
  musteri?: string | null,
): AkisKanali {
  const okunmamis = mesajlar.filter((m) => m.sender_type === "customer" && !m.read_at).length;
  const son = [...mesajlar].sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1);
  return {
    ad: "Mesajlar",
    rozet: okunmamis ? `${okunmamis} yeni` : null,
    onizleme: son
      ? {
          kim: son.sender_type === "staff" ? "Ekip" : formatPersonName(musteri || son.sender_name),
          metin: kisalt(son.body),
          zaman: ozetZamani(son.created_at),
        }
      : null,
    bos: "Müşteriyle henüz yazışma yok.",
  };
}

/** WhatsApp: en yeni başta gelir (musteriWhatsapp). Son mesaj müşteridense "yeni". */
export function whatsappKanali(mesajlar: InboxMessage[]): AkisKanali {
  const son = mesajlar[0];
  return {
    ad: "WhatsApp",
    rozet: son?.direction === "inbound" ? "yeni" : null,
    onizleme: son
      ? { kim: son.direction === "inbound" ? "Müşteri" : "Ekip", metin: kisalt(son.body ?? son.template ?? "Ek"), zaman: ozetZamani(son.createdAt) }
      : null,
    bos: "WhatsApp yazışması yok.",
  };
}

export function postaKanali(postalar: PostaKonusmasi[]): AkisKanali {
  const son = [...postalar].sort((a, b) => String(b.son_mesaj_at ?? "").localeCompare(String(a.son_mesaj_at ?? "")))[0];
  return {
    ad: "Postalar",
    rozet: postalar.some((posta) => posta.okunmamis) ? "yeni" : null,
    onizleme: son
      ? {
          kim: (son.son_gonderen_ad ? formatPersonName(son.son_gonderen_ad) : null) || son.son_gonderen_adres || "Posta",
          metin: kisalt(son.konu || son.ozet || "Konusuz"),
          zaman: ozetZamani(son.son_mesaj_at),
        }
      : null,
    bos: "Posta yok.",
  };
}

/*
  Ekip içi yorumların son satırı (talep, teklif, sözleşme). Yorumları
  InternalComments kendisi okuyor ama yalnızca çekmecede açılınca; özet
  için yalnızca son yorumu burada tek satırla alıyoruz. Rozet yok: kırmızı
  rozet "yeni" demek, yorumun okunup okunmadığı tutulmuyor. Okunamazsa
  "yorum yok" YAZILMIYOR — boş görünen bir kanal personeli yanıltır.
*/
export async function yorumKanali(supabase: SupabaseClient, organizationId: string, opportunityId: string): Promise<AkisKanali> {
  const { data, error } = await supabase
    .from("crm_internal_comments")
    .select("body,created_by,created_at")
    .eq("organization_id", organizationId)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("[akis] son yorum okunamadı", opportunityId, error.message);
    return { ad: "Yorumlar", bos: "Son yorum okunamadı; çekmecede açın." };
  }
  const son = (data ?? [])[0] as { body: string; created_by: string | null; created_at: string } | undefined;
  if (!son) return { ad: "Yorumlar", bos: "Ekip içi yorum yok." };
  const adlar = await kisiAdlari(supabase, organizationId, [son.created_by]);
  return {
    ad: "Yorumlar",
    onizleme: { kim: (son.created_by && adlar.get(son.created_by)) || "Ekip", metin: kisalt(son.body), zaman: ozetZamani(son.created_at) },
  };
}
