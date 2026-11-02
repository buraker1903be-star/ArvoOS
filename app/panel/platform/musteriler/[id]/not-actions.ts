"use server";

import { konsolAlaniniDogrula } from "../../konsol-alani";
import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { runPanelAction } from "@/lib/panel-action";

/*
  MÜŞTERİ NOTLARI (02.11.2026). Tablo ve kurallar migration
  20261102131114: yalnızca kurucu; metin sonradan değişmez. Burada
  kurucu denetimi (yetkinin sunucu katmanı) ve girdi denetimi; okuma ve
  yazma kurucunun oturumuyla, RLS ikinci kez denetliyor.
*/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUN = /^\d{4}-\d{2}-\d{2}$/;

async function baglam() {
  const c = await getPanelContext();
  if (!c.isPlatformOwner) throw new Error("Müşteri notlarını yalnızca kurucu yazabilir.");
  konsolAlaniniDogrula(c.konsolKapsami, "musteriler");
  return c;
}

const yenile = (kurum?: string) => {
  if (kurum) revalidatePath(`/panel/platform/musteriler/${kurum}`);
  revalidatePath("/panel");
};

async function notEkle__impl(f: FormData) {
  const { supabase, userId } = await baglam();
  const kurum = String(f.get("organization_id") ?? "");
  const metin = String(f.get("metin") ?? "").trim().slice(0, 2000);
  const takip = String(f.get("takip_tarihi") ?? "").trim();
  if (!UUID.test(kurum)) throw new Error("Müşteri bulunamadı.");
  if (metin.length < 2) throw new Error("Notu yazın.");
  if (takip && !GUN.test(takip)) throw new Error("Takip tarihi geçersiz.");
  const { error } = await supabase.from("platform_musteri_notlari").insert({ organization_id: kurum, metin, takip_tarihi: takip || null, yazan: userId });
  if (error) throw new Error("Not kaydedilemedi: " + error.message);
  yenile(kurum);
}

async function notTamamla__impl(f: FormData) {
  const { supabase } = await baglam();
  const id = String(f.get("id") ?? "");
  if (!UUID.test(id)) throw new Error("Not bulunamadı.");
  /* Satır sayısı okunuyor: RLS'in sessizce elediği güncelleme "tamamlandı" diye bildirilmesin. */
  const { data, error } = await supabase.from("platform_musteri_notlari").update({ tamamlandi_at: new Date().toISOString() })
    .eq("id", id).is("tamamlandi_at", null).select("organization_id");
  if (error) throw new Error("Takip kapatılamadı: " + error.message);
  if (!data?.length) throw new Error("Takip zaten kapanmış ya da not bulunamadı.");
  yenile(data[0].organization_id as string);
}

async function notSil__impl(f: FormData) {
  const { supabase } = await baglam();
  const id = String(f.get("id") ?? "");
  if (!UUID.test(id)) throw new Error("Not bulunamadı.");
  const { data, error } = await supabase.from("platform_musteri_notlari").delete().eq("id", id).select("organization_id");
  if (error) throw new Error("Not silinemedi: " + error.message);
  if (!data?.length) throw new Error("Not bulunamadı.");
  yenile(data[0].organization_id as string);
}

export async function notEkle(f: FormData) { await runPanelAction(() => notEkle__impl(f), "Not kaydedildi"); }
export async function notTamamla(f: FormData) { await runPanelAction(() => notTamamla__impl(f), "Takip tamamlandı"); }
export async function notSil(f: FormData) { await runPanelAction(() => notSil__impl(f), "Not silindi"); }
