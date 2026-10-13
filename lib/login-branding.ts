import { cache, type CSSProperties } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { readableOn } from "@/lib/tenant-theme";
import { alanAdiKurumu } from "@/lib/alan-adi-kurumu";
import { kisaOnbellek } from "@/lib/kisa-onbellek";

// Giriş, şifremi unuttum ve şifre oluşturma ekranları kurumun kendi alan
// adında (ör. panel.kurum.com) açıldığında kurumun logosu ve rengiyle
// görünür. Platform alan adında ArvoOS markası kullanılır.

const DEFAULT_APP_HOST = "app.arvo-os.com";

export type LoginBrand = { id: string; name: string; logo_url: string | null; primary_color: string | null; website_url: string | null; favicon_url: string | null };

/*
  İstek başına TEK KEZ okunuyor (React cache). Aynı istek içinde hem
  generateMetadata hem sayfanın gövdesi soruyor; önbelleksiz hâli
  kurumun kendi alan adında her sayfa açılışında iki ek sorgu demekti
  (biri alan adını çözüyor, biri markayı okuyor).
*/
export const getLoginBrand = cache(async function getLoginBrand(): Promise<LoginBrand | null> {
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  if (!host || host === DEFAULT_APP_HOST) return null;
  const supabase = await createClient();
  const organizationId = await alanAdiKurumu(supabase, host);
  if (!organizationId) return null;
  /* Marka kamusal bilgi; 60 sn önbellekli (lib/kisa-onbellek): her sayfa
     açılışında okunuyordu. Ayarlardaki değişiklik en geç bir dakikada yansır. */
  return kisaOnbellek("marka", organizationId, async () => {
    const { data, error } = await supabase.rpc("get_public_organization_branding_by_id", { p_org_id: organizationId });
    const org = Array.isArray(data) ? data[0] : data;
    return { marka: org ? { id: org.id, name: org.name, logo_url: org.logo_url, primary_color: org.primary_color, website_url: org.website_url ?? null, favicon_url: org.favicon_url ?? null } as LoginBrand : null, hata: Boolean(error) };
  }, (sonuc) => !sonuc.hata).then((sonuc) => sonuc.marka);
});

// Kurumun rengi düğmeye geçer; açık bir renkte beyaz yazı kaybolmasın diye
// yazı rengi kontrasta göre seçilir. Geçersiz renk kodu yok sayılır.
export function loginAccentStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return undefined;
  return { "--login-accent": color, "--login-accent-on": readableOn(color) } as CSSProperties;
}
