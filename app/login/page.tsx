import type { Metadata } from "next";
import Link from "next/link";
import { login } from "./actions";
import { getLoginBrand, loginAccentStyle } from "@/lib/login-branding";
import "./login.css";

export const metadata: Metadata = {
  title: "Giriş",
  description: "ArvoOS güvenli kurum paneli girişi.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const orgBrand = await getLoginBrand();

  return (
    <main className="login-shell" style={loginAccentStyle(orgBrand?.primary_color)}>
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
          <div className="login-card-brand">
            {orgBrand?.logo_url ? <img src={orgBrand.logo_url} alt={orgBrand.name} className="login-card-logo" /> : <small>{orgBrand ? orgBrand.name : "ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ."}</small>}
          </div>
          <span>GÜVENLİ PANEL GİRİŞİ</span>
          <h2>Panele hoş geldiniz</h2>
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
