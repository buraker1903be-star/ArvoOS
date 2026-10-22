"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { runPanelAction } from "@/lib/panel-action";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { assertYetki } from "@/lib/yetkiler";
import { alanAdiOku } from "@/lib/analitik-olay";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
  Yetki üç yerde (AGENTS.md): RLS (analitik_site_* politikaları,
  private.analitik_erisimi), burası ve menü. Modülün kurumda AÇIK olması
  da burada sorulur: kapalı modülün sitesi eklenmesin.
*/
async function analitikContext() {
  const context = await getPanelContext();
  if (!context.modules.some((m) => m.code === "analitik")) throw new Error("Analitik modülü kurumunuzda açık değil.");
  assertModuleKeyAccess(context.membership.role, "analitik", context.hiddenModuleKeys);
  assertYetki(context.yetkiler, "analitik.yonet");
  return context;
}

async function siteEkle__impl(formData: FormData) {
  const { supabase, membership } = await analitikContext();
  const ad = String(formData.get("ad") ?? "").trim();
  const ham = String(formData.get("alan_adi") ?? "");
  if (ad.length < 2 || ad.length > 80) throw new Error("Site adı 2–80 karakter olmalı.");
  const alanAdi = alanAdiOku(ham);
  if (!alanAdi) throw new Error(`“${ham.trim()}” bir alan adı gibi görünmüyor. Örnek: akademikmerkez.com`);

  const { error } = await supabase.from("analitik_siteler").insert({ organization_id: membership.organization_id, ad, alan_adi: alanAdi });
  if (error) {
    if (error.code === "23505") throw new Error(`${alanAdi} zaten ekli.`);
    throw new Error("Site eklenemedi: " + error.message);
  }
  revalidatePath("/panel/analitik", "layout");
}

/*
  Silmek sitenin BÜTÜN ziyaret kayıtlarını da götürür (kaskat) ve geri
  alınamaz; arayüz bunu onay penceresinde söylüyor. Sitedeki takip kodu
  çalışmaya devam eder ama yazacak site kalmadığı için hiçbir şey
  yazılmaz.
*/
async function siteSil__impl(formData: FormData) {
  const { supabase, membership } = await analitikContext();
  const siteId = String(formData.get("site_id") ?? "");
  if (!UUID.test(siteId)) throw new Error("Site bulunamadı.");
  const { data, error } = await supabase.from("analitik_siteler").delete()
    .eq("id", siteId).eq("organization_id", membership.organization_id).select("id");
  if (error) throw new Error("Site silinemedi: " + error.message);
  if (!data?.length) throw new Error("Site bulunamadı ya da silme yetkiniz yok.");
  revalidatePath("/panel/analitik", "layout");
}

export async function siteEkle(...args: Parameters<typeof siteEkle__impl>) {
  return runPanelAction(() => siteEkle__impl(...args), "Site eklendi; takip kodunu sitenize yapıştırın");
}

export async function siteSil(...args: Parameters<typeof siteSil__impl>) {
  return runPanelAction(() => siteSil__impl(...args), "Site ve ziyaret kayıtları silindi");
}
