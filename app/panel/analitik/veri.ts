import "server-only";
import { getPanelContext } from "@/lib/panel-context";

export type Site = { id: string; ad: string; alan_adi: string; anahtar: string; ilk_olay_at: string | null; son_olay_at: string | null; created_at: string };

/*
  Kurumun siteleri ve ?site= ile seçili olanı. Okunamazsa FIRLATIR:
  "site yok" demek kullanıcıyı Kurulum'a gönderip ikinci kez site
  eklemeye iterdi (AGENTS.md: okunamayan sorgu "kayıt yok" değildir).
*/
export async function siteleriOku(siteParam?: string) {
  const { supabase, membership } = await getPanelContext();
  const { data, error } = await supabase.from("analitik_siteler")
    .select("id,ad,alan_adi,anahtar,ilk_olay_at,son_olay_at,created_at")
    .eq("organization_id", membership.organization_id)
    .order("created_at");
  if (error) throw new Error("Analitik siteleri okunamadı: " + error.message);
  const siteler = (data ?? []) as Site[];
  const secili = siteler.find((site) => site.id === siteParam) ?? siteler[0] ?? null;
  return { supabase, siteler, secili };
}

/*
  Ülke kodundan Türkçe ad ("DE" → "Almanya"). Vercel ISO kodu yolluyor;
  tanınmayan kod olduğu gibi kalır.
*/
const ULKE = new Intl.DisplayNames(["tr"], { type: "region" });
export function ulkeAdi(kod: string | null | undefined) {
  if (!kod) return "Bilinmiyor";
  try {
    return ULKE.of(kod) ?? kod;
  } catch {
    return kod;
  }
}

export const CIHAZ_ADI: Record<string, string> = { mobil: "Mobil", tablet: "Tablet", masaustu: "Masaüstü" };

export const sayiYaz = (n: number) => new Intl.NumberFormat("tr-TR").format(n);
export const yuzde = (pay: number, payda: number) => (payda ? `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format((pay / payda) * 100)}` : "—");
