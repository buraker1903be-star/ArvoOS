"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { assertYetki } from "@/lib/yetkiler";
import {
  BASLIK_SINIRI, METIN_SINIRI, kurumMetniCoz, maddeEkle, maddeyiGeriEkle, maddeyiKaldir, maddeyiKaydet, maddeyiSifirla, maddeyiTasi, metniDenetle, etkinSira,
  type BelgeTuru, type KurumMetni, type SiraKurali,
} from "@/lib/belge-metni";
import { belgeVarsayilanlari } from "./belge-metni-varsayilan";

/*
  BELGE METİNLERİ İŞLEMLERİ. Kural saf modülde (lib/belge-metni); burada
  yalnızca yetki, okuma ve yazma. Yetki üç yerde: RLS (owner/admin),
  burada settings.belge_metni.yonet ve ekranda düğmeleri gizleme.
*/

const metin = (formData: FormData, ad: string, sinir: number) => String(formData.get(ad) ?? "").slice(0, sinir);

function turOku(formData: FormData): BelgeTuru {
  const tur = String(formData.get("tur") ?? "");
  if (tur !== "contract" && tur !== "proposal") throw new Error("Belge türü geçersiz.");
  return tur;
}

async function baglam(formData: FormData) {
  const { supabase, membership, organization, userId, yetkiler } = await getPanelContext();
  assertYetki(yetkiler, "settings.belge_metni.yonet");
  const tur = turOku(formData);
  const { data, error } = await supabase
    .from("organization_document_texts").select("content")
    .eq("organization_id", membership.organization_id).eq("document_type", tur).maybeSingle();
  // Okunamayan kayıt "boş" sayılmaz: üzerine yazmak kurumun metnini silerdi.
  if (error) throw new Error("Kurumun belge metni okunamadı: " + error.message);
  const varsayilan = belgeVarsayilanlari(tur, organization.slug);
  const kural: SiraKurali = { varsayilan: varsayilan.sira, zorunlu: varsayilan.zorunlu, son: varsayilan.son };
  return { supabase, membership, userId, tur, kurum: kurumMetniCoz(data?.content), varsayilan, kural };
}

async function kaydet(b: Awaited<ReturnType<typeof baglam>>, kurum: KurumMetni) {
  const { error } = await b.supabase.from("organization_document_texts").upsert({
    organization_id: b.membership.organization_id,
    document_type: b.tur,
    content: kurum,
    updated_at: new Date().toISOString(),
    updated_by: b.userId,
  }, { onConflict: "organization_id,document_type" });
  if (error) throw new Error("Belge metni kaydedilemedi: " + error.message);
  revalidatePath("/panel/settings");
}

function denetle(b: Awaited<ReturnType<typeof baglam>>, kurum: KurumMetni, baslik: string, govde: string) {
  const sira = etkinSira(b.kural.varsayilan, kurum, b.kural.zorunlu, b.kural.son);
  const hatalar = metniDenetle(baslik, govde, { yerTutucular: b.varsayilan.yerTutucular, bloklar: b.varsayilan.bloklar, maddeler: b.tur === "contract" ? sira : [] });
  if (hatalar.length) throw new Error(hatalar.join(" "));
}

async function belgeMaddesiKaydet__impl(formData: FormData) {
  const b = await baglam(formData);
  const anahtar = String(formData.get("anahtar") ?? "");
  const varsayilan = b.varsayilan.maddeler.find((madde) => madde.anahtar === anahtar);
  if (!varsayilan && !b.kurum.maddeler?.[anahtar]) throw new Error("Madde bulunamadı.");
  const baslik = metin(formData, "baslik", BASLIK_SINIRI + 1).trim();
  const govde = metin(formData, "metin", METIN_SINIRI + 1);
  denetle(b, b.kurum, baslik, govde);
  await kaydet(b, maddeyiKaydet(b.kurum, anahtar, { baslik, metin: govde }, varsayilan));
}

async function belgeMaddesiEkle__impl(formData: FormData) {
  const b = await baglam(formData);
  const baslik = metin(formData, "baslik", BASLIK_SINIRI + 1).trim();
  const govde = metin(formData, "metin", METIN_SINIRI + 1);
  denetle(b, b.kurum, baslik, govde);
  await kaydet(b, maddeEkle(b.kurum, { baslik, metin: govde }, b.kural).kurum);
}

async function belgeMaddesiSifirla__impl(formData: FormData) {
  const b = await baglam(formData);
  await kaydet(b, maddeyiSifirla(b.kurum, String(formData.get("anahtar") ?? "")));
}

async function belgeMaddesiKaldir__impl(formData: FormData) {
  const b = await baglam(formData);
  await kaydet(b, maddeyiKaldir(b.kurum, String(formData.get("anahtar") ?? ""), b.kural));
}

async function belgeMaddesiGeriEkle__impl(formData: FormData) {
  const b = await baglam(formData);
  await kaydet(b, maddeyiGeriEkle(b.kurum, String(formData.get("anahtar") ?? ""), b.kural));
}

async function belgeMaddesiTasi__impl(formData: FormData) {
  const b = await baglam(formData);
  const yon = formData.get("yon") === "asagi" ? "asagi" : "yukari";
  await kaydet(b, maddeyiTasi(b.kurum, String(formData.get("anahtar") ?? ""), yon, b.kural));
}

async function belgeMetniniSifirla__impl(formData: FormData) {
  const b = await baglam(formData);
  const { error } = await b.supabase.from("organization_document_texts").delete()
    .eq("organization_id", b.membership.organization_id).eq("document_type", b.tur);
  if (error) throw new Error("Belge metni sıfırlanamadı: " + error.message);
  revalidatePath("/panel/settings");
}

export async function belgeMaddesiKaydet(...args: Parameters<typeof belgeMaddesiKaydet__impl>) {
  return runPanelAction(() => belgeMaddesiKaydet__impl(...args), "Madde kaydedildi");
}
export async function belgeMaddesiEkle(...args: Parameters<typeof belgeMaddesiEkle__impl>) {
  return runPanelAction(() => belgeMaddesiEkle__impl(...args), "Madde eklendi");
}
export async function belgeMaddesiSifirla(...args: Parameters<typeof belgeMaddesiSifirla__impl>) {
  return runPanelAction(() => belgeMaddesiSifirla__impl(...args), "Madde Arvo metnine döndü");
}
export async function belgeMaddesiKaldir(...args: Parameters<typeof belgeMaddesiKaldir__impl>) {
  return runPanelAction(() => belgeMaddesiKaldir__impl(...args), "Madde belgeden çıkarıldı");
}
export async function belgeMaddesiGeriEkle(...args: Parameters<typeof belgeMaddesiGeriEkle__impl>) {
  return runPanelAction(() => belgeMaddesiGeriEkle__impl(...args), "Madde geri eklendi");
}
export async function belgeMaddesiTasi(...args: Parameters<typeof belgeMaddesiTasi__impl>) {
  return runPanelAction(() => belgeMaddesiTasi__impl(...args));
}
export async function belgeMetniniSifirla(...args: Parameters<typeof belgeMetniniSifirla__impl>) {
  return runPanelAction(() => belgeMetniniSifirla__impl(...args), "Belge Arvo metnine döndü");
}
