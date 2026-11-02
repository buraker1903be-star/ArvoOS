"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { PAKET_VARSAYILANI } from "@/lib/paket-limitleri";
import { alanFarki, konsolKaydiYaz, LISANS_ALANLARI } from "../konsol-kaydi";
import { konsolAlaniniDogrula } from "../konsol-alani";

/*
  PAKET LİMİTİNİ KONSOLDAN DEĞİŞTİRMEK (02.11.2026).

  Eskiden bunun için bir migration gerekiyordu: değer
  private.default_license_limits'in içine yazılıydı. Artık işlev
  platform_paket_limitleri'ni okuyor (migration 20261102181453).

  Yalnızca YENİ kiracının lisansını etkiler; mevcut kiracıların limiti
  kendi lisans satırlarında ve değişmiyor. Ekran bunu kaydetmeden önce
  yazıyor.

  Sayılar düz tamsayı: "1.500" bin ayırıcılı yazılırsa noktalar atılıyor
  (Türkçe yazım; para değil, kuruş çevrimi yok).
*/
function tamsayi(formData: FormData, alan: string, ad: string, enAz: number) {
  const ham = String(formData.get(alan) ?? "").trim().replace(/\./g, "");
  const deger = Number(ham);
  if (!ham || !Number.isSafeInteger(deger) || deger < enAz) throw new Error(`${ad} ${enAz} ya da daha büyük bir tam sayı olmalı.`);
  return deger;
}

async function paketLimitiniKaydet__impl(formData: FormData) {
  const { supabase, userId, isPlatformOwner, konsolKapsami, organization } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");
  konsolAlaniniDogrula(konsolKapsami, "urunler");

  const paket = String(formData.get("plan_code") ?? "").trim();
  if (!(paket in PAKET_VARSAYILANI)) throw new Error("Geçerli bir paket seçin.");
  const yeni = {
    user_limit: tamsayi(formData, "user_limit", "Dahil kullanıcı", 1),
    /* Kutu GB yazıyor (kurucunun kafasındaki birim); veritabanı MB tutuyor. */
    storage_limit_mb: tamsayi(formData, "storage_gb", "Depolama", 1) * 1024,
    ai_credit_limit: tamsayi(formData, "ai_credit_limit", "Yapay zekâ kredisi", 0),
  };

  const { data: onceki, error: oncekiHatasi } = await supabase.from("platform_paket_limitleri")
    .select("user_limit,storage_limit_mb,ai_credit_limit").eq("plan_code", paket).maybeSingle();
  if (oncekiHatasi) throw new Error("Paket limiti okunamadı: " + oncekiHatasi.message);
  if (!onceki) throw new Error("Bu paketin limit satırı yok; migration 20261102181453 uygulanmış mı?");

  /* Satır sayısı doğrulanıyor: RLS'in elediği güncelleme hata vermez, sıfır satır eder. */
  /* sınırsız-tamam: tek paketin satırı (plan_code birincil anahtar). */
  const { data: yazilan, error } = await supabase.from("platform_paket_limitleri")
    .update({ ...yeni, guncelleyen: userId, guncellendi: new Date().toISOString() })
    .eq("plan_code", paket).select("plan_code");
  if (error) throw new Error("Paket limiti kaydedilemedi: " + error.message);
  if (!yazilan?.length) throw new Error("Paket limiti kaydedilemedi: veritabanı güncellemeyi kabul etmedi.");

  await konsolKaydiYaz({
    organizationId: organization.id, userId, entityType: "package_limits", entityId: paket,
    baslik: `Paket limiti değişti (${paket})`,
    degisiklikler: alanFarki(onceki as Record<string, unknown>, yeni, {
      user_limit: LISANS_ALANLARI.user_limit,
      storage_limit_mb: LISANS_ALANLARI.storage_limit_mb,
      ai_credit_limit: LISANS_ALANLARI.ai_credit_limit,
    }),
  });
  revalidatePath("/panel/platform/fiyatlar");
  revalidatePath("/panel/platform/saglik");
}

export async function paketLimitiniKaydet(formData: FormData): Promise<void> {
  await runPanelAction(() => paketLimitiniKaydet__impl(formData), "Paket limiti kaydedildi; yeni kiracılar bu değerle açılacak");
}
