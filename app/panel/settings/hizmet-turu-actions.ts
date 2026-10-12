"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { assertYetki } from "@/lib/yetkiler";
import { hizmetTurleriCoz, turEkle, turuAdlandir, turuSil, turuTasi, type Sonuc } from "@/lib/hizmet-turleri";

/*
  HİZMET TÜRLERİ İŞLEMLERİ. Kural saf modülde (lib/hizmet-turleri);
  burada yalnızca yetki, okuma ve yazma. Yetki üç yerde: RLS
  (owner/admin, 20261012110702), burada settings.hizmet_turu.yonet ve
  ekranda düğmeleri gizleme.
*/

async function baglam() {
  const { supabase, membership, userId, yetkiler } = await getPanelContext();
  assertYetki(yetkiler, "settings.hizmet_turu.yonet");
  const { data, error } = await supabase
    .from("organization_service_types").select("turler")
    .eq("organization_id", membership.organization_id).maybeSingle();
  // Okunamayan liste "yok" sayılmaz: varsayılanın üstüne yazmak kurumun listesini silerdi.
  if (error) throw new Error("Hizmet türleri okunamadı: " + error.message);
  // Satır yoksa varsayılan liste: ilk değişiklik onun üstüne uygulanıp kaydediliyor.
  return { supabase, membership, userId, liste: hizmetTurleriCoz(data ? data.turler : null) };
}

async function kaydet(b: Awaited<ReturnType<typeof baglam>>, sonuc: Sonuc) {
  if ("hata" in sonuc) throw new Error(sonuc.hata);
  const { error } = await b.supabase.from("organization_service_types").upsert({
    organization_id: b.membership.organization_id,
    turler: sonuc,
    updated_at: new Date().toISOString(),
    updated_by: b.userId,
  }, { onConflict: "organization_id" });
  if (error) throw new Error("Hizmet türleri kaydedilemedi: " + error.message);
  revalidatePath("/panel/settings");
  revalidatePath("/panel/crm");
}

const ad = (formData: FormData, alan: string) => String(formData.get(alan) ?? "").slice(0, 200);
const sira = (formData: FormData) => Number(formData.get("sira"));

async function hizmetTuruEkle__impl(formData: FormData) {
  const b = await baglam();
  await kaydet(b, turEkle(b.liste, ad(formData, "ad")));
}

async function hizmetTuruAdlandir__impl(formData: FormData) {
  const b = await baglam();
  await kaydet(b, turuAdlandir(b.liste, sira(formData), ad(formData, "eski"), ad(formData, "ad")));
}

async function hizmetTuruSil__impl(formData: FormData) {
  const b = await baglam();
  await kaydet(b, turuSil(b.liste, sira(formData), ad(formData, "eski")));
}

async function hizmetTuruTasi__impl(formData: FormData) {
  const b = await baglam();
  const yon = formData.get("yon") === "asagi" ? "asagi" : "yukari";
  await kaydet(b, turuTasi(b.liste, sira(formData), ad(formData, "eski"), yon));
}

/** Varsayılan listeye dön: satırı silmek yeterli (satır yoksa varsayılan geçerli). */
async function hizmetTurleriniSifirla__impl() {
  const b = await baglam();
  const { error } = await b.supabase.from("organization_service_types").delete()
    .eq("organization_id", b.membership.organization_id);
  if (error) throw new Error("Hizmet türleri sıfırlanamadı: " + error.message);
  revalidatePath("/panel/settings");
  revalidatePath("/panel/crm");
}

export async function hizmetTuruEkle(...args: Parameters<typeof hizmetTuruEkle__impl>) {
  return runPanelAction(() => hizmetTuruEkle__impl(...args), "Hizmet türü eklendi");
}
export async function hizmetTuruAdlandir(...args: Parameters<typeof hizmetTuruAdlandir__impl>) {
  return runPanelAction(() => hizmetTuruAdlandir__impl(...args), "Hizmet türü kaydedildi");
}
export async function hizmetTuruSil(...args: Parameters<typeof hizmetTuruSil__impl>) {
  return runPanelAction(() => hizmetTuruSil__impl(...args), "Hizmet türü listeden çıkarıldı");
}
export async function hizmetTuruTasi(...args: Parameters<typeof hizmetTuruTasi__impl>) {
  return runPanelAction(() => hizmetTuruTasi__impl(...args));
}
export async function hizmetTurleriniSifirla() {
  return runPanelAction(() => hizmetTurleriniSifirla__impl(), "Varsayılan listeye dönüldü");
}
