import type { CSSProperties } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { readableOn } from "@/lib/tenant-theme";

// Giriş, şifremi unuttum ve şifre oluşturma ekranları kurumun kendi alan
// adında (ör. panel.kurum.com) açıldığında kurumun logosu ve rengiyle
// görünür. Platform alan adında ArvoOS markası kullanılır.

const DEFAULT_APP_HOST = "app.arvo-os.com";

export type LoginBrand = { name: string; logo_url: string | null; primary_color: string | null; website_url: string | null };

export async function getLoginBrand(): Promise<LoginBrand | null> {
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  if (!host || host === DEFAULT_APP_HOST) return null;
  const supabase = await createClient();
  const { data: organizationId } = await supabase.rpc("resolve_organization_by_domain", { p_domain: host });
  if (!organizationId) return null;
  const { data } = await supabase.rpc("get_public_organization_branding_by_id", { p_org_id: organizationId });
  const org = Array.isArray(data) ? data[0] : data;
  return org ? { name: org.name, logo_url: org.logo_url, primary_color: org.primary_color, website_url: org.website_url ?? null } : null;
}

// Kurumun rengi düğmeye geçer; açık bir renkte beyaz yazı kaybolmasın diye
// yazı rengi kontrasta göre seçilir. Geçersiz renk kodu yok sayılır.
export function loginAccentStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return undefined;
  return { "--login-accent": color, "--login-accent-on": readableOn(color) } as CSSProperties;
}
