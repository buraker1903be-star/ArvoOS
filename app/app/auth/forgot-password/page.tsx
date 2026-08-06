import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "./actions";
import "../../login/login.css";

export const metadata: Metadata = {
  title: "Şifremi Unuttum",
  description: "ArvoOS hesabınız için güvenli şifre yenileme bağlantısı alın.",
};

const errorMessages: Record<string, string> = {
  invalid: "Geçerli bir e-posta adresi girin.",
  failed: "Şifre yenileme e-postası gönderilemedi. Lütfen tekrar deneyin.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; email?: string }>;
}) {
  const { error, sent, email } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-brand">
        <Link href="https://arvo-os.com" aria-label="ArvoOS ana sayfa">
          <img src="/arvoos-logo.png" alt="ArvoOS" />
        </Link>
        <div>
          <span>GÜVENLİ HESAP ERİŞİMİ</span>
          <h1>Şifrenizi birkaç adımda güvenle yenileyin.</h1>
          <p>Kurumsal e-posta adresinize tek kullanımlık bir yenileme bağlantısı gönderilecektir.</p>
        </div>
        <small>ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ.</small>
      </section>
      <section className="login-form-wrap">
        <form action={requestPasswordReset} className="login-card">
          <div className="mark">A</div>
          <span>ŞİFRE YENİLEME</span>
          <h2>E-posta adresinizi girin</h2>
          <p>Hesabınız sistemde kayıtlıysa şifre oluşturma bağlantısı e-posta adresinize gönderilecektir.</p>
          {error && <div className="login-error" role="alert">{errorMessages[error] ?? "Bir hata oluştu."}</div>}
          {sent === "1" && <div className="login-error" role="status">Şifre yenileme bağlantısı {email ? `${email} adresine ` : ""}gönderildi. Gelen kutunuzu ve spam klasörünüzü kontrol edin.</div>}
          <label>E-posta adresi<input name="email" type="email" autoComplete="email" required placeholder="adiniz@kurum.com" defaultValue={email ?? ""} /></label>
          <button type="submit">Yenileme Bağlantısı Gönder <b>→</b></button>
          <Link href="/login">← Giriş ekranına dön</Link>
          <small>Bağlantı yalnızca kısa bir süre geçerlidir ve tek kullanımlıktır.</small>
        </form>
      </section>
    </main>
  );
}
