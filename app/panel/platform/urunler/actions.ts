"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { parseTurkishAmount } from "@/lib/turkish-amount";
import { ADD_ONS, PLANS } from "@/lib/site/pricing";
import { ROUTES } from "@/lib/site/routes";
import { fiyatlariBirlestir } from "@/lib/site/fiyat-kaynagi";
import { bekleyenDegisiklikler, fiyatDenetimi, fiyatKaydi, yayimSonrasi } from "@/lib/fiyat-dogrulama";

/*
  Fiyat taslağı ve yayımlama.

  İki adım bilerek ayrı: tek adım olsaydı yanlış yazılan bir rakam
  yazıldığı anda sitede görünürdü. Bugün fiyat değişikliği bir
  commit'ten ve gözden geçirmeden geçiyor; o emniyeti büsbütün
  bırakmıyoruz, kurucunun kendi onayına çeviriyoruz.

  TOPLU YAYIM (14.10.2026). Eskiden her basamak ayrı yayımlanıyordu:
  üç basamaklı bir zam üç ayrı yayımdı ve arada site yarı güncel bir
  liste gösteriyordu. Artık bekleyen bütün taslaklar önizlemeden sonra
  tek seferde yayımlanıyor (platform_fiyatlari_yayimla — tek UPDATE).
  Denetim (lib/fiyat-dogrulama) burada da çalışıyor: önizlemeyi atlayan
  bir istek de merdiveni bozan bir listeyi yayımlayamasın. Her değişiklik
  platform_fiyat_gecmisi'ne tetikleyiciyle yazılıyor.
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

  /* Yayındaki tutarın aynısı yazıldıysa bekleyen bir değişiklik yok:
     önizlemede "1.990 → 1.990" satırı çıkmasın. */
  const { data: mevcut } = await supabase.from("platform_fiyat_listesi")
    .select("aylik_kurus,yayimlandi_at").eq("kod", kod).maybeSingle();
  const degismedi = Boolean(mevcut?.yayimlandi_at) && (mevcut?.aylik_kurus === null ? null : Number(mevcut?.aylik_kurus)) === kurus;

  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("platform_fiyat_listesi").upsert({
    kod,
    tur: TUR.get(kod) ?? "plan",
    taslak_kurus: kurus,
    taslak_bekliyor: !degismedi,
    updated_by: userData.user?.id ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "kod" });
  if (error) throw new Error("Taslak kaydedilemedi: " + error.message);

  revalidatePath("/panel/platform/urunler");
  revalidatePath("/panel/platform/fiyatlar");
}

/* Fiyatı okuyan yüzeyler: yayımlanan fiyat oralarda hemen görünmeli.
   llms-full.txt'nin CDN önbelleği on dakika (rotada yazılı). */
function fiyatYuzeyleriniTazele() {
  revalidatePath("/panel/platform/urunler");
  revalidatePath("/panel/platform/fiyatlar");
  revalidatePath("/panel/platform/kurulumlar");
  revalidatePath("/panel/platform/subscribers");
  for (const yol of Object.values(ROUTES.pricing)) revalidatePath(yol);
}

/*
  KODDAKİ DEĞERLERİ TASLAĞA ALIR (14.10.2026).

  Liste ilk kurulduğunda hiçbir tutar yayımlı değil ve site koddaki
  yedek değerlerle çalışıyor. Rakamlar doğru ama liste konsolun
  sahipliğinde DEĞİL: bir fiyatı değiştirmek hâlâ dağıtım gerektiriyor,
  oysa bu ekranın bütün amacı bunu kaldırmak. Sahiplenmek için her
  basamağın bir kez yayımlanması gerekiyor, yayımlamak içinse taslak.

  On altı tutarı ekrana elle girmek, üretim fiyatlarında yazım hatası
  riskini boşuna almak demekti. Bu işlem TUTAR UYDURMUYOR: her kodun
  bugün GEÇERLİ olan değerini (lib/site/pricing) taslağa koyuyor, yani
  yayımlandığında sitedeki hiçbir rakam değişmiyor.

  YAYIMLAMIYOR. Taslak kalıyor; kurucu önizlemede önce→sonra listesini
  görüp kendisi yayımlıyor. Denetim (lib/fiyat-dogrulama) o adımda yine
  çalışıyor.

  DOKUNMADIKLARI: yayımlanmış bir basamak (üstüne yazmak, yayımdaki
  tutarı sessizce değiştirmek olurdu) ve bekleyen bir taslağı olan
  basamak (kurucunun hazırladığı zammı ezerdi).
*/
async function koddakiDegerleriTaslagaAl__impl() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const { data, error } = await supabase.from("platform_fiyat_listesi").select("kod,yayimlandi_at,taslak_bekliyor");
  if (error) throw new Error("Fiyat listesi okunamadı: " + error.message);
  const mevcut = new Map(((data ?? []) as { kod: string; yayimlandi_at: string | null; taslak_bekliyor: boolean | null }[])
    .map((satir) => [satir.kod, satir]));

  const { data: userData } = await supabase.auth.getUser();
  const simdi = new Date().toISOString();
  const alinacaklar = [
    ...PLANS.map((plan) => ({ kod: plan.code, kurus: plan.aylikKurus })),
    ...ADD_ONS.map((kalem) => ({ kod: kalem.code, kurus: kalem.aylikKurus })),
  ].filter(({ kod }) => {
    const satir = mevcut.get(kod);
    return !satir?.yayimlandi_at && !satir?.taslak_bekliyor;
  });

  if (!alinacaklar.length) throw new Error("Taslağa alınacak basamak yok: hepsi ya yayımlı ya da taslağı bekliyor.");

  const { error: yazmaHatasi } = await supabase.from("platform_fiyat_listesi").upsert(
    alinacaklar.map(({ kod, kurus }) => ({
      kod,
      tur: TUR.get(kod) ?? "plan",
      /* null = "Teklif": bu basamağın liste fiyatı yok ve olmayacak. */
      taslak_kurus: kurus,
      taslak_bekliyor: true,
      updated_by: userData.user?.id ?? null,
      updated_at: simdi,
    })),
    { onConflict: "kod" },
  );
  if (yazmaHatasi) throw new Error("Taslaklar kaydedilemedi: " + yazmaHatasi.message);

  revalidatePath("/panel/platform/fiyatlar");
  revalidatePath("/panel/platform/urunler");
}

async function fiyatlariYayimla__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const { data, error: okumaHatasi } = await supabase.from("platform_fiyat_listesi").select("*");
  if (okumaHatasi) throw new Error("Fiyat listesi okunamadı: " + okumaHatasi.message);
  const kayitlar = (data ?? []).map(fiyatKaydi);
  const gecerli = fiyatlariBirlestir(kayitlar.filter((k) => k.yayimlandi_at).map((k) => ({ kod: k.kod, aylikKurus: k.aylik_kurus })));
  const degisiklikler = bekleyenDegisiklikler(kayitlar, gecerli);
  if (!degisiklikler.length) throw new Error("Yayımlanacak taslak yok.");

  const { hatalar, uyarilar } = fiyatDenetimi(yayimSonrasi(gecerli, degisiklikler), degisiklikler);
  if (hatalar.length) throw new Error("Yayımlanmadı: " + hatalar.join(" "));
  // Uyarılar önizlemede gösteriliyor; kurucu kutuyu işaretlemeden geçmiyor.
  if (uyarilar.length && formData.get("onay") !== "evet") {
    throw new Error("Önizlemedeki uyarıları okuyup onay kutusunu işaretleyin.");
  }

  const { error } = await supabase.rpc("platform_fiyatlari_yayimla");
  if (error) throw new Error("Yayımlanamadı: " + error.message);
  fiyatYuzeyleriniTazele();
}

/* Bekleyen taslağı yayımlamadan bırakır: taslak yayındaki tutara döner. */
async function taslagiGeriAl__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");
  const kod = kodOku(formData);

  const { data: satir } = await supabase.from("platform_fiyat_listesi")
    .select("aylik_kurus").eq("kod", kod).maybeSingle();
  if (!satir) throw new Error("Bu basamağın taslağı yok.");
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("platform_fiyat_listesi")
    .update({ taslak_kurus: satir.aylik_kurus, taslak_bekliyor: false, updated_by: userData.user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("kod", kod);
  if (error) throw new Error("Taslak geri alınamadı: " + error.message);
  revalidatePath("/panel/platform/urunler");
  revalidatePath("/panel/platform/fiyatlar");
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
    /* Bekleyen taslak da kapanıyor: yoksa bir sonraki toplu yayım, koda
       dönen basamağın eski taslağını istemeden yeniden yayımlardı. */
    .update({ aylik_kurus: null, taslak_kurus: null, taslak_bekliyor: false, yayimlandi_at: null, updated_by: userData.user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("kod", kod);
  if (error) throw new Error("Yayından kaldırılamadı: " + error.message);
  fiyatYuzeyleriniTazele();
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function taslagiKaydet(...args: Parameters<typeof taslagiKaydet__impl>) {
  return runPanelAction(() => taslagiKaydet__impl(...args), "Taslak kaydedildi");
}
export async function koddakiDegerleriTaslagaAl() {
  return runPanelAction(() => koddakiDegerleriTaslagaAl__impl(), "Koddaki değerler taslağa alındı; önizlemeden yayımlayın");
}
export async function fiyatlariYayimla(...args: Parameters<typeof fiyatlariYayimla__impl>) {
  return runPanelAction(() => fiyatlariYayimla__impl(...args), "Fiyatlar yayımlandı");
}
export async function taslagiGeriAl(...args: Parameters<typeof taslagiGeriAl__impl>) {
  return runPanelAction(() => taslagiGeriAl__impl(...args), "Taslak geri alındı");
}
export async function yayindanKaldir(...args: Parameters<typeof yayindanKaldir__impl>) {
  return runPanelAction(() => yayindanKaldir__impl(...args), "Fiyat yayından kaldırıldı; koddaki değer geçerli");
}
