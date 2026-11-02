"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { runPanelAction } from "@/lib/panel-action";

/*
  DESTEK HAZIR YANITLARI (02.11.2026). Tablo migration 20261102134522:
  yalnızca kurucu. Kurucu denetimi burada (yetkinin sunucu katmanı),
  RLS ikinci kez denetliyor; silmede etkilenen satır okunuyor.
*/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function baglam() {
  const c = await getPanelContext();
  if (!c.isPlatformOwner) throw new Error("Hazır yanıtları yalnızca kurucu düzenleyebilir.");
  return c;
}

const yenile = () => {
  revalidatePath("/panel/platform/destek/hazir");
  revalidatePath("/panel/platform/destek", "layout");
};

async function hazirYanitEkle__impl(f: FormData) {
  const { supabase, userId } = await baglam();
  const baslik = String(f.get("baslik") ?? "").trim().slice(0, 80);
  const metin = String(f.get("metin") ?? "").trim().slice(0, 3000);
  if (baslik.length < 2) throw new Error("Kısa bir başlık yazın (seçicide görünecek ad).");
  if (metin.length < 2) throw new Error("Yanıt metnini yazın.");
  const { error } = await supabase.from("platform_hazir_yanitlar").insert({ baslik, metin, olusturan: userId });
  if (error) throw new Error("Hazır yanıt kaydedilemedi: " + error.message);
  yenile();
}

async function hazirYanitSil__impl(f: FormData) {
  const { supabase } = await baglam();
  const id = String(f.get("id") ?? "");
  if (!UUID.test(id)) throw new Error("Hazır yanıt bulunamadı.");
  const { data, error } = await supabase.from("platform_hazir_yanitlar").delete().eq("id", id).select("id");
  if (error) throw new Error("Hazır yanıt silinemedi: " + error.message);
  if (!data?.length) throw new Error("Hazır yanıt bulunamadı.");
  yenile();
}

export async function hazirYanitEkle(f: FormData) { await runPanelAction(() => hazirYanitEkle__impl(f), "Hazır yanıt kaydedildi"); }
export async function hazirYanitSil(f: FormData) { await runPanelAction(() => hazirYanitSil__impl(f), "Hazır yanıt silindi"); }
