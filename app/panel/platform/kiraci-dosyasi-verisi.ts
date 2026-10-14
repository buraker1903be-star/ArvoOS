import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { kotaDurumu, type KotaDurumu } from "@/lib/kota-durumu";
import type { DosyaDaveti, DosyaKurumu, DosyaUyeligi } from "./kiraci-dosyasi";

/*
  Tek kiracının dosya verisi (14.10.2026).

  Kiracı dosyası eskiden /panel/platform?organization= sayfasıydı ve bu
  veriyi BÜTÜN kiracı listesiyle birlikte hazırlıyordu. Sayfa kaldırıldı,
  dosya müşteri detayının "Kurum Ayarları" penceresine taşındı; artık
  yalnızca o kiracı okunuyor.

  Sütunlar sayılı: `*` görünümün yan sorgularını boşuna işletir (AGENTS.md).
*/
const KIRACI_SUTUNLARI = [
  "id", "name", "display_name", "slug", "status", "plan_code", "sector", "kind",
  "custom_domain", "custom_domain_status", "provisioning_state", "logo_url", "contact_phone", "grup_markasi",
  "user_limit", "storage_limit_mb", "monthly_fee", "current_period_end", "license_status", "trial_ends_at",
  "aktif_uye", "davet_eposta", "davet_durumu", "davet_gonderildi", "davet_kabul", "davet_hatasi",
].join(",");

type KiraciSatiri = DosyaKurumu & {
  user_limit: number | null; storage_limit_mb: number | null; monthly_fee: number | null;
  current_period_end: string | null; license_status: string | null; trial_ends_at: string | null;
  aktif_uye: number; davet_eposta: string | null; davet_durumu: string | null;
  davet_gonderildi: string | null; davet_kabul: string | null; davet_hatasi: string | null;
};

export type KiraciDosyasiVerisi = {
  selected: DosyaKurumu;
  invitation: DosyaDaveti | null;
  planList: { code: string; name: string }[];
  tumUyelikler: DosyaUyeligi[];
  seciliKota: KotaDurumu | null;
  seciliLisans: { license_status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null } | null;
};

export async function kiraciDosyasiVerisi(supabase: SupabaseClient, id: string): Promise<KiraciDosyasiVerisi | null> {
  const admin = createAdminClient();
  const [{ data: satir, error }, { data: plans }, { data: uyelikler }, { data: depolamalar }] = await Promise.all([
    supabase.from("platform_kiraci_liste").select(KIRACI_SUTUNLARI).eq("id", id).maybeSingle(),
    supabase.from("plans").select("code,name").eq("is_active", true).order("created_at"),
    supabase.from("organization_memberships").select("organization_id,user_id,role,is_active").eq("organization_id", id),
    /* Depolama storage.objects'ten; o tablo PostgREST'e kapalı, işlev
       yalnızca kurum başına TOPLAM döndürüyor ve yalnızca service_role
       çağırabiliyor. */
    admin ? admin.rpc("arvo_storage_usage") : Promise.resolve({ data: [] }),
  ]);
  if (error) throw new Error(`Kiracı okunamadı: ${error.message}`);
  if (!satir) return null;
  const kiraci = satir as unknown as KiraciSatiri;

  const invitation: DosyaDaveti | null = kiraci.davet_eposta
    ? {
        organization_id: kiraci.id,
        email: kiraci.davet_eposta,
        status: kiraci.davet_durumu ?? "pending",
        sent_at: kiraci.davet_gonderildi,
        accepted_at: kiraci.davet_kabul,
        error_message: kiraci.davet_hatasi,
      }
    : null;

  /* Lisansı olmayan kiracı için kota da lisans da yok (eski sayfadaki kural). */
  const lisansVar = kiraci.user_limit !== null && kiraci.storage_limit_mb !== null;
  const depolamaBayt = Number(((depolamalar ?? []) as { organization_id: string; bytes: number }[])
    .find((row) => row.organization_id === id)?.bytes ?? 0);
  const seciliKota = lisansVar
    ? kotaDurumu({
        organizationId: id,
        kullaniciSayisi: Number(kiraci.aktif_uye),
        kullaniciLimiti: Number(kiraci.user_limit),
        depolamaBayt,
        depolamaLimitiMb: Number(kiraci.storage_limit_mb),
      })
    : null;
  const seciliLisans = lisansVar
    ? {
        license_status: kiraci.license_status ?? "trial",
        monthly_fee: kiraci.monthly_fee,
        current_period_end: kiraci.current_period_end,
        trial_ends_at: kiraci.trial_ends_at,
      }
    : null;

  return {
    selected: kiraci,
    invitation,
    planList: (plans ?? []).map((plan) => ({ code: String(plan.code), name: String(plan.name) })),
    tumUyelikler: (uyelikler ?? []) as DosyaUyeligi[],
    seciliKota,
    seciliLisans,
  };
}
