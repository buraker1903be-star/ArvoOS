import type { SupabaseClient } from "@supabase/supabase-js";
import { PAKET_VARSAYILANI, paketLimitleriniKur, type PaketLimiti } from "@/lib/paket-limitleri";

/*
  Konsoldan düzenlenen paket limitleri (lib/paket-limitleri'nin başı).

  Okunamazsa KOD YEDEĞİ dönüyor ve `hata` dolu: sapma uyarıları ve "uygula"
  kısayolu yine çalışsın, ama ekran değerlerin veritabanındakiyle aynı
  olmayabileceğini yazsın. Tablonun henüz olmaması (migration öncesi) hata
  değil — o zaman geçerli olan zaten kod yedeği.
*/
export async function paketLimitleriOku(supabase: SupabaseClient): Promise<{
  limitler: Record<string, PaketLimiti>;
  hata: string | null;
  tabloVar: boolean;
  guncellenme: Record<string, string | null>;
}> {
  /* sınırsız-tamam: üç paketin sabit satırları (ekleme yok, yalnızca güncelleme). */
  const { data, error } = await supabase.from("platform_paket_limitleri")
    .select("plan_code,user_limit,storage_limit_mb,ai_credit_limit,guncellendi");
  if (error) {
    const tabloYok = error.code === "42P01" || error.code === "PGRST205";
    if (!tabloYok) console.error("[konsol] paket limitleri okunamadı; koddaki değerler kullanıldı", error.message);
    return { limitler: { ...PAKET_VARSAYILANI }, hata: tabloYok ? null : error.message, tabloVar: !tabloYok, guncellenme: {} };
  }
  const satirlar = (data ?? []) as { plan_code: string; user_limit: number; storage_limit_mb: number; ai_credit_limit: number; guncellendi: string | null }[];
  return {
    limitler: paketLimitleriniKur(satirlar),
    hata: null,
    tabloVar: true,
    guncellenme: Object.fromEntries(satirlar.map((s) => [s.plan_code, s.guncellendi])),
  };
}
