"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { runPanelAction } from "@/lib/panel-action";
import { assertYetki } from "@/lib/yetkiler";
import { postaDurumu } from "@/lib/posta-hesabi";
import { postaYanitiGonder } from "@/lib/posta-esitleme";
import { yanitAlicisi } from "@/lib/posta-gonderim";

/*
  ORTAK KUTUNUN ORTAK DURUMU.

  Gmail'in etiketleri "bu konuşmayla kim ilgileniyor" sorusunu
  modellemiyor; ortak kutuda ekibin asıl ihtiyacı bu. İki alan var:
  ilgilenen kişi ve durum (açık / yanıtlandı / kapalı).

  Yazma kullanıcının KENDİ oturumuyla yapılıyor (service_role değil):
  RLS konuşmanın kurumunu, tetikleyici de hangi sütunlara
  dokunulabileceğini denetlesin diye. Posta alanları (konu, gönderen,
  tarih) Gmail'den geliyor ve panelden değiştirilemiyor.
*/

const DURUMLAR = new Set(["acik", "yanitlandi", "kapali"]);

async function postaContext() {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.yonet");
  return context;
}

async function konusmayiUstlen__impl(formData: FormData) {
  const { supabase, membership, userId } = await postaContext();
  const threadId = String(formData.get("thread_id") ?? "").trim();
  if (!threadId) throw new Error("Konuşma seçilmedi.");
  // "bosalt" = kimse ilgilenmiyor; konuşmayı havuza geri bırakmanın yolu.
  const hedef = String(formData.get("kime") ?? "") === "bosalt" ? null : userId;

  const { data, error } = await supabase.from("mail_threads")
    .update({ ilgilenen_user_id: hedef })
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId)
    .select("thread_id");
  if (error) throw new Error("Konuşma güncellenemedi: " + error.message);
  if (!data?.length) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");

  revalidatePath("/panel/posta");
  revalidatePath(`/panel/posta/${threadId}`);
}

async function konusmaDurumu__impl(formData: FormData) {
  const { supabase, membership } = await postaContext();
  const threadId = String(formData.get("thread_id") ?? "").trim();
  const durum = String(formData.get("durum") ?? "");
  if (!threadId) throw new Error("Konuşma seçilmedi.");
  if (!DURUMLAR.has(durum)) throw new Error("Geçersiz durum.");

  const { data, error } = await supabase.from("mail_threads")
    .update({ durum })
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId)
    .select("thread_id");
  if (error) throw new Error("Durum güncellenemedi: " + error.message);
  if (!data?.length) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");

  revalidatePath("/panel/posta");
  revalidatePath(`/panel/posta/${threadId}`);
}

export async function konusmayiUstlen(...args: Parameters<typeof konusmayiUstlen__impl>) {
  return runPanelAction(() => konusmayiUstlen__impl(...args), "Konuşma güncellendi");
}

export async function konusmaDurumu(...args: Parameters<typeof konusmaDurumu__impl>) {
  return runPanelAction(() => konusmaDurumu__impl(...args), "Durum güncellendi");
}

/*
  YANIT.

  Kutudan çıkan mesaj kurumun kimliğiyle gidiyor; bu yüzden gönderme
  yetkisi ayrı bir anahtar (posta.yanitla). Varsayılanı herkes: ortak
  kutunun amacı zaten ekibin cevap vermesi, dar varsayılan özelliği
  kullanılamaz yapardı. Kısıtlamak isteyen kurum rol ya da kişi düzeyinde
  kapatır.
*/
async function konusmayaYanitla__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.yanitla");
  const { supabase, membership, organization } = context;

  const threadId = String(formData.get("thread_id") ?? "").trim();
  const govde = String(formData.get("govde") ?? "").trim();
  if (!threadId) throw new Error("Konuşma seçilmedi.");
  if (govde.length < 2) throw new Error("Yanıt metni boş olamaz.");
  if (govde.length > 20000) throw new Error("Yanıt metni çok uzun (en fazla 20.000 karakter).");

  const { data: mesajVerisi, error } = await supabase
    .from("mail_messages")
    .select("message_id,gonderen_adres,konu,tarih,yon")
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId)
    .order("tarih", { ascending: true });
  if (error) throw new Error("Konuşma okunamadı: " + error.message);
  const mesajlar = (mesajVerisi ?? []) as { message_id: string; gonderen_adres: string | null; konu: string | null; tarih: string | null; yon: string }[];
  if (!mesajlar.length) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");

  const alici = yanitAlicisi(mesajlar.map((mesaj) => ({
    gonderenAdres: mesaj.gonderen_adres,
    yon: mesaj.yon,
    tarih: mesaj.tarih ? new Date(mesaj.tarih) : null,
  })));
  if (!alici) throw new Error("Bu konuşmada yanıtlanacak bir gönderen yok.");

  const hesap = await postaDurumu(membership.organization_id);
  if (hesap.durum !== "bagli" || !hesap.adres) throw new Error("Ortak posta kutusu bağlı değil.");

  const sonuc = await postaYanitiGonder({
    organizationId: membership.organization_id,
    kutuAdresi: hesap.adres,
    // Alıcının gördüğü ad kurumun adı: ortak kutudan çıkan mesaj kurumun adına gidiyor.
    gonderenAd: organization.display_name || organization.name,
    threadId,
    sonMesajId: mesajlar[mesajlar.length - 1].message_id,
    alici,
    konu: mesajlar.find((mesaj) => mesaj.konu)?.konu ?? "",
    govde,
  });
  if ("hata" in sonuc) throw new Error(sonuc.hata);

  /*
    Yanıt gidince konuşma "yanıtlandı" oluyor. Elle işaretlemeyi beklemek,
    ortak kutuda aynı müşteriye iki kişinin cevap yazmasına yol açıyor —
    listede hâlâ "Açık" görünüyor.
  */
  await supabase.from("mail_threads")
    .update({ durum: "yanitlandi" })
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId);

  revalidatePath("/panel/posta");
  revalidatePath(`/panel/posta/${threadId}`);
}

export async function konusmayaYanitla(...args: Parameters<typeof konusmayaYanitla__impl>) {
  return runPanelAction(() => konusmayaYanitla__impl(...args), "Yanıt gönderildi");
}

/*
  CRM BAĞI.

  Ortak kutuya gelen posta çoğu zaman var olan bir müşteriye ait ama
  panelde iki ayrı yerde duruyordu: yazışma postada, kayıt CRM'de.
  Eşitleme gönderen adresi fırsatın iletişim adresiyle eşleşirse bağı
  kendiliğinden kuruyor; burası elle düzeltme yolu — eşleşmeyen ya da
  yanlış eşleşen konuşmalar için.
*/
async function konusmayiKayitBagla__impl(formData: FormData) {
  const { supabase, membership } = await postaContext();
  const threadId = String(formData.get("thread_id") ?? "").trim();
  const firsat = String(formData.get("opportunity_id") ?? "").trim();
  if (!threadId) throw new Error("Konuşma seçilmedi.");

  const { data, error } = await supabase.from("mail_threads")
    .update({ opportunity_id: firsat || null })
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId)
    .select("thread_id");
  if (error) throw new Error("Müşteri bağı güncellenemedi: " + error.message);
  if (!data?.length) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");

  revalidatePath("/panel/posta");
  revalidatePath(`/panel/posta/${threadId}`);
}

export async function konusmayiKayitBagla(...args: Parameters<typeof konusmayiKayitBagla__impl>) {
  return runPanelAction(() => konusmayiKayitBagla__impl(...args), "Müşteri bağı güncellendi");
}
