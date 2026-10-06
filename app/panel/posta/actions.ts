"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { runPanelAction } from "@/lib/panel-action";
import { assertYetki } from "@/lib/yetkiler";

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
