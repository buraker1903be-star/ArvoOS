"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { runPanelAction } from "@/lib/panel-action";
import { assertYetki } from "@/lib/yetkiler";
import { sablonAdiEngeli, sablonGovdesiEngeli } from "@/lib/posta-sablon";

/*
  HAZIR CEVAPLAR.

  Metin kurumun, kişinin değil: ortak kutunun amacı tek ağızdan
  konuşmak. Kullanmak için posta.yanitla yetiyor (sayfa onu istiyor),
  DÜZENLEMEK posta.yonet istiyor — yanlış yazılmış bir hazır cevap
  herkesin ağzından gider.

  RLS kapıyı modül düzeyinde tutuyor; yetki kararı burada, çünkü RLS
  "kim yazabilir"i söyler, "hangi yetkiyle"yi söylemez.
*/

async function sablonContext() {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.yonet");
  return context;
}

function alanlar(formData: FormData) {
  const ad = String(formData.get("ad") ?? "").trim();
  const govde = String(formData.get("govde") ?? "").trim();
  const adEngeli = sablonAdiEngeli(ad);
  if (adEngeli) throw new Error(adEngeli);
  const govdeEngeli = sablonGovdesiEngeli(govde);
  if (govdeEngeli) throw new Error(govdeEngeli);
  return { ad, govde };
}

/* Benzersiz indeks (kurum + küçük harfli ad) aynı adı engelliyor;
   Postgres hatası kullanıcıya "duplicate key" diye çıkmasın. */
function kayitHatasi(mesaj: string): string {
  return /mail_templates_ad_uidx|duplicate key/.test(mesaj)
    ? "Bu adla bir hazır cevap zaten var."
    : mesaj;
}

async function sablonEkle__impl(formData: FormData) {
  const { supabase, membership, userId } = await sablonContext();
  const { ad, govde } = alanlar(formData);
  const { error } = await supabase.from("mail_templates").insert({
    organization_id: membership.organization_id,
    ad,
    govde,
    olusturan: userId,
  });
  if (error) throw new Error("Hazır cevap eklenemedi: " + kayitHatasi(error.message));
  revalidatePath("/panel/posta/hazir-cevaplar");
  revalidatePath("/panel/posta");
}

export async function sablonEkle(formData: FormData) {
  await runPanelAction(() => sablonEkle__impl(formData), "Hazır cevap eklendi");
}

async function sablonGuncelle__impl(formData: FormData) {
  const { supabase, membership } = await sablonContext();
  const id = String(formData.get("sablon_id") ?? "").trim();
  if (!id) throw new Error("Hazır cevap seçilmedi.");
  const { ad, govde } = alanlar(formData);
  const { data, error } = await supabase.from("mail_templates")
    .update({ ad, govde, updated_at: new Date().toISOString() })
    .eq("organization_id", membership.organization_id).eq("id", id)
    .select("id");
  if (error) throw new Error("Hazır cevap güncellenemedi: " + kayitHatasi(error.message));
  if (!data?.length) throw new Error("Hazır cevap bulunamadı veya bu kayda erişiminiz yok.");
  revalidatePath("/panel/posta/hazir-cevaplar");
  revalidatePath("/panel/posta");
}

export async function sablonGuncelle(formData: FormData) {
  await runPanelAction(() => sablonGuncelle__impl(formData), "Hazır cevap güncellendi");
}

async function sablonSil__impl(formData: FormData) {
  const { supabase, membership } = await sablonContext();
  const id = String(formData.get("sablon_id") ?? "").trim();
  if (!id) throw new Error("Hazır cevap seçilmedi.");
  const { data, error } = await supabase.from("mail_templates").delete()
    .eq("organization_id", membership.organization_id).eq("id", id)
    .select("id");
  if (error) throw new Error("Hazır cevap silinemedi: " + error.message);
  if (!data?.length) throw new Error("Hazır cevap bulunamadı veya bu kayda erişiminiz yok.");
  revalidatePath("/panel/posta/hazir-cevaplar");
  revalidatePath("/panel/posta");
}

export async function sablonSil(formData: FormData) {
  await runPanelAction(() => sablonSil__impl(formData), "Hazır cevap silindi");
}
