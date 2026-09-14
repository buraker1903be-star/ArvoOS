import type { Metadata } from "next";
import Link from "next/link";
import { getLoginBrand, loginAccentStyle } from "@/lib/login-branding";
import { requestPasswordReset } from "./actions";
import "../../login/login.css";

export const metadata: Metadata = {
  title: "Şifremi Unuttum",
  description: "ArvoOS hesabınız için güvenli şifre yenileme bağlantısı alın.",
};

const errorMessages: Record<string, string> = {
  invalid: "Geçerli bir e-posta adresi girin.",
  failed: "Şifre yenileme e-postası gönderilemedi. Lütfen tekrar deneyin.",
  rate_limit: "Çok kısa sürede birden fazla bağlantı istendi. Birkaç dakika bekleyip yalnızca bir kez yeniden deneyin.",
  service: "E-posta servisi şu anda yanıt vermedi. Birkaç dakika sonra yeniden deneyin.",
  expired: "Bu bağlantı kullanılmış, süresi dolmuş veya daha yeni bir bağlantı tarafından geçersiz kılınmış. Lütfen yeni bağlantı isteyin.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; email?: string }>;
}) {
  const { error, sent, email } = await searchParams;
  // Kurumun kendi alan adında giriş ekranıyla aynı marka görünür.
  const orgBrand = await getLoginBrand();

  return (
    <main className="login-shell" style={loginAccentStyle(orgBrand?.primary_color)}>
      <section className="login-brand">
        {orgBrand ? (
          orgBrand.logo_url ? <img src={orgBrand.logo_url} alt={orgBrand.name} /> : <span className="login-brand-name">{orgBrand.name}</span>
        ) : (
          <Link href="https://arvo-os.com" aria-label="ArvoOS ana sayfa">
            <img src="/arvoos-logo.png" alt="ArvoOS" />
          </Link>
        )}
        <div>
          <span>GÜVENLİ HESAP ERİŞİMİ</span>
          <h1>Şifrenizi birkaç adımda güvenle yenileyin.</h1>
          <p>{orgBrand ? `${orgBrand.name} panelinde kullandığınız e-posta adresine tek kullanımlık bir yenileme bağlantısı gönderilecektir.` : "Kurumsal e-posta adresinize tek kullanımlık bir yenileme bağlantısı gönderilecektir."}</p>
        </div>
        {!orgBrand ? <small>ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ.</small> : null}
      </section>
      <section className="login-form-wrap">
        <form action={requestPasswordReset} className="login-card">
          <div className="login-card-brand">
            {orgBrand?.logo_url ? <img src={orgBrand.logo_url} alt={orgBrand.name} className="login-card-logo" /> : <small>{orgBrand ? orgBrand.name : "ARVOOS"}</small>}
          </div>
          <span>ŞİFRE YENİLEME</span>
          <h2>E-posta adresinizi girin</h2>
          <p>Hesabınız sistemde kayıtlıysa şifre oluşturma bağlantısı e-posta adresinize gönderilecektir.</p>
          {error && <div className="login-error" role="alert">{errorMessages[error] ?? "Bir hata oluştu."}</div>}
          {sent === "1" && <div className="login-success" role="status">Şifre yenileme bağlantısı {email ? `${email} adresine ` : ""}gönderildi. Gelen kutunuzu ve spam klasörünüzü kontrol edin.</div>}
          <label>E-posta adresi<input name="email" type="email" autoComplete="email" required placeholder="adiniz@kurum.com" defaultValue={email ?? ""} /></label>
          <button type="submit">Yenileme Bağlantısı Gönder <b>→</b></button>
          <Link href="/login">← Giriş ekranına dön</Link>
          <small>Bağlantı tek kullanımlıktır. Birden fazla e-posta aldıysanız yalnızca en son gelen bağlantıyı açın.</small>
        </form>
      </section>
    </main>
  );
}
