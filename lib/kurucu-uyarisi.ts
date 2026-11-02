import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { epostaGonder } from "@/lib/eposta-gonder";
import { alicilariTopla } from "@/lib/otomatik-proforma";
import { MANAGEMENT_HOST } from "@/lib/site/host-rules";
import { kurucuUyariPostasi, type UyariSatiri } from "@/lib/kurucu-uyarisi-metni";

/*
  KURUCUYA ANINDA UYARI (02.11.2026) — gönderim. Metin ve gerekçe
  lib/kurucu-uyarisi-metni.ts.

  Alıcı: ArvoOS kurumunun (slug arvo-os) etkin Kurum Sahipleri; adresleri
  okunamazsa kurumun iletişim adresi. Kurucunun hesabı değişince kod
  değişmesin diye adres yazılmıyor, üyelikten okunuyor.

  AKIŞI DÜŞÜRMEZ (AGENTS.md "E-posta gönderimi akışı düşürmez"): dekont
  ve talep zaten kaydedildi; uyarı gidemezse yalnızca günlüğe yazılıyor,
  çağırana hata dönmüyor. Bekleyen iş konsolda rozetle yine görünüyor.
*/
export async function kurucuyaUyar(g: { baslik: string; satirlar: UyariSatiri[]; not?: string | null; yol: string; dugme: string }): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: arvo, error } = await admin.from("organizations").select("id,contact_email").eq("slug", "arvo-os").maybeSingle();
    if (error || !arvo) { console.error("[kurucu-uyarısı] ArvoOS kurumu okunamadı", error?.message); return; }
    const { data: sahipler } = await admin.from("organization_memberships").select("user_id").eq("organization_id", arvo.id).eq("role", "owner").eq("is_active", true);
    const adresler = await Promise.all(((sahipler ?? []) as { user_id: string }[]).map(async (s) => (await admin.auth.admin.getUserById(s.user_id)).data.user?.email ?? null));
    let alicilar = alicilariTopla(adresler);
    if (!alicilar.length) alicilar = alicilariTopla([(arvo as { contact_email: string | null }).contact_email]);
    if (!alicilar.length) { console.error("[kurucu-uyarısı] alıcı yok"); return; }
    const posta = kurucuUyariPostasi({ baslik: g.baslik, satirlar: g.satirlar, not: g.not, adres: `https://${MANAGEMENT_HOST}${g.yol}`, dugme: g.dugme });
    const sonuc = await epostaGonder({ kime: alicilar, ...posta });
    if (!sonuc.ok) console.error("[kurucu-uyarısı] gönderilemedi", sonuc.hata);
  } catch (hata) {
    console.error("[kurucu-uyarısı] düştü", hata instanceof Error ? hata.message : hata);
  }
}
