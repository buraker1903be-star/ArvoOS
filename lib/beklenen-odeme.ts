/*
  Havale bildirimlerinin BEKLENEN tutarı ve farkları (sunucu yardımcısı).

  Ödeme Onayları ekranı ve onay işlemi aynı hesabı kullanıyor: ekranda
  görünen fark ile işlemin istediği teyit ayrışmasın. Hesabın kuralı saf
  modülde (lib/abonelik-tutari); burada yalnızca lisans satırları okunuyor.

  Okuma kurucunun oturumuyla (RLS: kurucu bütün kiracıların lisansını
  görür). Okunamayan lisans "fark yok" sayılmıyor: tutar doğrulanamıyor
  diye yazılıyor (AGENTS.md: engelin sorgusu hata yutmaz).
*/
import type { SupabaseClient } from "@supabase/supabase-js";
import { donemTutari, havaleFarklari } from "./abonelik-tutari";

export type HavaleBildirimi = { id: string; organization_id: string; product: string | null; plan_code: string | null; amount: number };
export type HavaleDenetimi = { beklenen: number | null; farklar: string[] };

export async function havaleDenetimleri(supabase: SupabaseClient, bildirimler: readonly HavaleBildirimi[]): Promise<Map<string, HavaleDenetimi>> {
  const sonuc = new Map<string, HavaleDenetimi>();
  if (!bildirimler.length) return sonuc;
  const kurumlar = [...new Set(bildirimler.map((b) => b.organization_id))];
  const [cekirdek, urunler, uyeler] = await Promise.all([
    supabase.from("organization_licenses").select("organization_id,plan_code,monthly_fee,user_limit,extra_user_fee").in("organization_id", kurumlar),
    supabase.from("organization_product_licenses").select("organization_id,product,plan_code,monthly_fee").in("organization_id", kurumlar),
    supabase.from("platform_kiraci_liste").select("id,aktif_uye").in("id", kurumlar),
  ]);
  const hata = cekirdek.error ?? urunler.error ?? uyeler.error;
  if (hata) {
    for (const b of bildirimler) sonuc.set(b.id, { beklenen: null, farklar: [`Lisans okunamadı (${hata.message}); tutar doğrulanamıyor.`] });
    return sonuc;
  }
  type Cekirdek = { organization_id: string; plan_code: string | null; monthly_fee: number | null; user_limit: number | null; extra_user_fee: number | null };
  type Urun = { organization_id: string; product: string; plan_code: string | null; monthly_fee: number | null };
  const cekirdekler = new Map(((cekirdek.data ?? []) as Cekirdek[]).map((l) => [l.organization_id, l]));
  const urunLisanslari = new Map(((urunler.data ?? []) as Urun[]).map((l) => [`${l.organization_id}:${l.product}`, l]));
  const aktif = new Map(((uyeler.data ?? []) as { id: string; aktif_uye: number }[]).map((u) => [u.id, Number(u.aktif_uye)]));

  for (const b of bildirimler) {
    const urun = b.product ?? "arvoos";
    const lisans = urun === "arvoos" ? cekirdekler.get(b.organization_id) : urunLisanslari.get(`${b.organization_id}:${urun}`);
    const beklenen = lisans
      ? donemTutari({
          urun, aylikUcret: lisans.monthly_fee, aktifKullanici: aktif.get(b.organization_id) ?? 0,
          kullaniciLimiti: (lisans as Cekirdek).user_limit ?? null, ekKullaniciUcreti: (lisans as Cekirdek).extra_user_fee ?? 0,
        }).tutar
      : null;
    sonuc.set(b.id, {
      beklenen,
      farklar: havaleFarklari({ bildirilenTutar: Number(b.amount), beklenenTutar: beklenen, bildirilenPaket: b.plan_code, mevcutPaket: lisans?.plan_code ?? null }),
    });
  }
  return sonuc;
}
