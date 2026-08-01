import type { Metadata } from "next";
import Link from "next/link";
import { login } from "./actions";
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

  return (
    <main className="login-shell">
      <section className="login-brand">
        <Link href="https://arvo-os.com" aria-label="ArvoOS ana sayfa">
          <img src="/arvoos-logo.png" alt="ArvoOS" />
        </Link>
        <div>
          <span>KURUMSAL İŞLETİM SİSTEMİ</span>
          <h1>Ekibinizin tüm süreçleri, tek ve güvenli çalışma alanında.</h1>
          <p>Kurumunuza tanımlanan modüllere ve yetkilerinize göre kişiselleştirilmiş ArvoOS paneline erişin.</p>
        </div>
        <small>ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ.</small>
      </section>
      <section className="login-form-wrap">
        <form action={login} className="login-card">
          <div className="mark">A</div>
          <span>GÜVENLİ PANEL GİRİŞİ</span>
          <h2>ArvoOS’a hoş geldiniz</h2>
          <p>Size tanımlanan kurumsal e-posta adresiyle giriş yapın.</p>
          {error && <div className="login-error" role="alert">E-posta adresi veya parola hatalı.</div>}
          <label>E-posta adresi<input name="email" type="email" autoComplete="email" required placeholder="adiniz@kurum.com" /></label>
          <label>Parola<input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" /></label>
          <button type="submit">Giriş Yap <b>→</b></button>
          <a href="mailto:info@arvo-os.com?subject=ArvoOS%20erişim%20desteği">Erişim desteği alın</a>
          <small>Hesaplar kurum yöneticisi tarafından oluşturulur. Açık üyelik bulunmaz.</small>
        </form>
      </section>
    </main>
  );
}
