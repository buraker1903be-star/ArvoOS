import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { login } from "./actions";
import { createClient } from "@/lib/supabase/server";
import "./login.css";

export const metadata: Metadata = {
  title: "Giriş",
  description: "ArvoOS güvenli kurum paneli girişi.",
};

const DEFAULT_APP_HOST = "app.arvo-os.com";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const requestHeaders = await headers();
  const host = requestHeaders.get("host")?.split(":")[0] ?? "";
  let orgBrand: { name: string; logo_url: string | null; primary_color: string | null; website_url: string | null } | null = null;
  if (host && host !== DEFAULT_APP_HOST) {
    const supabase = await createClient();
    const { data: organizationId } = await supabase.rpc("resolve_organization_by_domain", { p_domain: host });
    if (organizationId) {
      const { data } = await supabase.rpc("get_public_organization_branding_by_id", { p_org_id: organizationId });
      const org = Array.isArray(data) ? data[0] : data;
      if (org) orgBrand = { name: org.name, logo_url: org.logo_url, primary_color: org.primary_color, website_url: org.website_url ?? null };
    }
  }

  const accentColor = orgBrand?.primary_color || undefined;

  return (
    <main className="login-shell" style={accentColor ? ({ "--login-accent": accentColor } as React.CSSProperties) : undefined}>
      <section className="login-brand">
        {orgBrand ? (
          orgBrand.website_url ? (
            <Link href={orgBrand.website_url} aria-label={orgBrand.name}>
              {orgBrand.logo_url ? <img src={orgBrand.logo_url} alt={orgBrand.name} /> : <span className="login-brand-name">{orgBrand.name}</span>}
            </Link>
          ) : orgBrand.logo_url ? (
            <img src={orgBrand.logo_url} alt={orgBrand.name} />
          ) : (
            <span className="login-brand-name">{orgBrand.name}</span>
          )
        ) : (
          <Link href="https://arvo-os.com" aria-label="ArvoOS ana sayfa">
            <img src="/arvoos-logo.png" alt="ArvoOS" />
          </Link>
        )}
        <div>
          <span>{orgBrand ? "KURUM PANELİ" : "KURUMSAL İŞLETİM SİSTEMİ"}</span>
          <h1>{orgBrand ? `${orgBrand.name} panelinize hoş geldiniz.` : "Ekibinizin tüm süreçleri, tek ve güvenli çalışma alanında."}</h1>
          <p>{orgBrand ? "Size tanımlanan kurumsal e-posta adresiyle panelinize erişin." : "Kurumunuza tanımlanan modüllere ve yetkilerinize göre kişiselleştirilmiş ArvoOS paneline erişin."}</p>
        </div>
        {!orgBrand ? <small>ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ.</small> : null}
      </section>
      <section className="login-form-wrap">
        <form action={login} className="login-card">
          <div className="mark">{orgBrand ? orgBrand.name.slice(0, 1).toUpperCase() : "A"}</div>
          <span>GÜVENLİ PANEL GİRİŞİ</span>
          <h2>{orgBrand ? `${orgBrand.name}’a hoş geldiniz` : "ArvoOS’a hoş geldiniz"}</h2>
          <p>Size tanımlanan kurumsal e-posta adresiyle giriş yapın.</p>
          {error && <div className="login-error" role="alert">E-posta adresi veya parola hatalı.</div>}
          <label>E-posta adresi<input name="email" type="email" autoComplete="email" required placeholder="adiniz@kurum.com" /></label>
          <label>Parola<input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" /></label>
          <button type="submit">Giriş Yap <b>→</b></button>
          <Link href="/auth/forgot-password">Şifremi unuttum</Link>
          <a href="mailto:info@arvo-os.com?subject=ArvoOS%20erişim%20desteği">Erişim desteği alın</a>
          <small>Hesaplar kurum yöneticisi tarafından oluşturulur. Açık üyelik bulunmaz.</small>
        </form>
      </section>
    </main>
  );
}
