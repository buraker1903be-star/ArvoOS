"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { parseTurkishAmount } from "@/lib/turkish-amount";
import { ADD_ONS, PLANS } from "@/lib/site/pricing";

/*
  Fiyat taslağı ve yayımlama.

  İki adım bilerek ayrı: tek adım olsaydı yanlış yazılan bir rakam
  yazıldığı anda sitede görünürdü. Bugün fiyat değişikliği bir
  commit'ten ve gözden geçirmeden geçiyor; o emniyeti büsbütün
  bırakmıyoruz, kurucunun kendi onayına çeviriyoruz.
*/

const BILINEN = new Set<string>([...PLANS.map((p) => p.code), ...ADD_ONS.map((a) => a.code)]);
const TUR = new Map<string, "plan" | "ek">([
  ...PLANS.map((p) => [p.code, "plan"] as const),
  ...ADD_ONS.map((a) => [a.code, "ek"] as const),
]);

function kodOku(formData: FormData) {
  const kod = String(formData.get("kod") ?? "").trim();
  /* Kod kodda tanımlı olmalı: basamağın adı, birimi ve hangi üründe
     olduğu lib/site/pricing'te duruyor. Orada yoksa yayımlanacak bir
     şey de yok. */
  if (!BILINEN.has(kod)) throw new Error("Tanınmayan basamak kodu.");
  return kod;
}

async function taslagiKaydet__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");
  const kod = kodOku(formData);

  const ham = String(formData.get("tutar") ?? "").trim();
  /*
    Boş = "teklif usulü yap". Sıfır ile boş aynı şey değil: sıfır
    "ücretsiz", boş "fiyatı yayımlanmıyor" demek.

    parseTurkishAmount LİRA döndürüyor ("1.500" → 1500); para kuruş
    cinsinden tamsayı (AGENTS.md), çevirme burada.
  */
  let kurus: number | null = null;
  if (ham) {
    const lira = parseTurkishAmount(ham);
    if (!Number.isFinite(lira) || lira < 0) throw new Error("Tutar geçerli bir rakam olmalı.");
    kurus = Math.round(lira * 100);
    if (!Number.isSafeInteger(kurus)) throw new Error("Tutar çok büyük.");
  }

  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("platform_fiyat_listesi").upsert({
    kod,
    tur: TUR.get(kod) ?? "plan",
    taslak_kurus: kurus,
    updated_by: userData.user?.id ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "kod" });
  if (error) throw new Error("Taslak kaydedilemedi: " + error.message);

  revalidatePath("/panel/platform/urunler");
}

async function taslagiYayimla__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");
  const kod = kodOku(formData);

  const { data: satir } = await supabase.from("platform_fiyat_listesi")
    .select("taslak_kurus").eq("kod", kod).maybeSingle();
  if (!satir) throw new Error("Önce bir taslak tutar kaydedin.");

  const { data: userData } = await supabase.auth.getUser();
  const simdi = new Date().toISOString();
  const { error } = await supabase.from("platform_fiyat_listesi")
    .update({ aylik_kurus: satir.taslak_kurus, yayimlandi_at: simdi, updated_by: userData.user?.id ?? null, updated_at: simdi })
    .eq("kod", kod);
  if (error) throw new Error("Yayımlanamadı: " + error.message);

  revalidatePath("/panel/platform/urunler");
  /* Ücretler sayfası ve llms.txt aynı rakamları kullanıyor; yayımlanan
     fiyat oralarda da hemen görünmeli. */
  revalidatePath("/ucretler");
  revalidatePath("/en/pricing");
}

async function yayindanKaldir__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");
  const kod = kodOku(formData);

  const { data: userData } = await supabase.auth.getUser();
  /*
    Satır SİLİNMİYOR, yayından kaldırılıyor: basamak koddaki değerine
    dönüyor. Silmek, bir sonraki okumada "bu kodu hiç fiyatlamadık"
    demek olurdu ve taslak da birlikte giderdi.
  */
  const { error } = await supabase.from("platform_fiyat_listesi")
    .update({ aylik_kurus: null, yayimlandi_at: null, updated_by: userData.user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("kod", kod);
  if (error) throw new Error("Yayından kaldırılamadı: " + error.message);

  revalidatePath("/panel/platform/urunler");
  revalidatePath("/ucretler");
  revalidatePath("/en/pricing");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function taslagiKaydet(...args: Parameters<typeof taslagiKaydet__impl>) {
  return runPanelAction(() => taslagiKaydet__impl(...args), "Taslak kaydedildi");
}
export async function taslagiYayimla(...args: Parameters<typeof taslagiYayimla__impl>) {
  return runPanelAction(() => taslagiYayimla__impl(...args), "Fiyat yayımlandı");
}
export async function yayindanKaldir(...args: Parameters<typeof yayindanKaldir__impl>) {
  return runPanelAction(() => yayindanKaldir__impl(...args), "Fiyat yayından kaldırıldı; koddaki değer geçerli");
}
