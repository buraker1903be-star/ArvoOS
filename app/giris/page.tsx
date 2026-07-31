"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPassword } from "@/lib/supabase-auth";

export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    if (!email || !password) {
      setMessage("E-posta adresinizi ve şifrenizi girin.");
      return;
    }

    setLoading(true);
    try {
      await signInWithPassword(email, password);
      setMessage("Giriş başarılı. Panel açılıyor...");
      router.replace("/panel");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Giriş yapılamadı.";
      setMessage(text === "Invalid login credentials" ? "E-posta veya şifre hatalı." : text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <style>{`
        .login-page{min-height:100vh;background:radial-gradient(circle at 10% 18%,#f7faf3 0,transparent 34%),radial-gradient(circle at 88% 14%,#eaf2df 0,transparent 31%),#fff;color:#06264e;position:relative;overflow:hidden;font-family:Manrope,sans-serif}
        .login-page:before{content:"";position:absolute;width:620px;height:620px;border-radius:50%;right:-240px;top:-180px;background:radial-gradient(circle,#8eae6838,transparent 67%);filter:blur(8px)}
        .login-shell{min-height:100vh;max-width:1280px;margin:auto;padding:32px 48px;display:grid;grid-template-rows:auto 1fr auto;position:relative;z-index:1}
        .login-header{height:70px;display:flex;align-items:center;justify-content:space-between}.login-logo{display:flex;width:180px;height:58px;align-items:center;overflow:hidden}.login-logo img{width:180px;height:101px;object-fit:contain}
        .back-link{font-size:13px;font-weight:700;color:#06264e;padding:11px 16px;border:1px solid #dfe6dc;border-radius:10px;background:#ffffffb8;text-decoration:none}
        .login-content{display:grid;grid-template-columns:1.08fr .82fr;gap:90px;align-items:center;padding:48px 0 70px}.login-intro{max-width:650px}.login-kicker{font-size:11px;letter-spacing:.17em;font-weight:800;color:#5f8738;margin-bottom:22px}
        .login-intro h1{font-size:56px;line-height:1.08;letter-spacing:-.045em;margin:0;font-family:Montserrat,sans-serif}.login-intro h1 span{display:block;color:#5f8738}.login-intro>p{max-width:590px;font-size:17px;line-height:1.75;color:#72808d;margin:25px 0 32px}
        .login-features{display:grid;gap:13px}.login-feature{display:flex;align-items:center;gap:12px;font-size:13px;color:#566573;font-weight:600}.login-feature i{width:30px;height:30px;border-radius:8px;background:#edf3e7;color:#5f8738;display:grid;place-items:center;font-style:normal;font-weight:800}
        .login-card{width:100%;max-width:470px;justify-self:end;padding:39px;background:#fffffff0;border:1px solid #dfe6dc;border-radius:20px;box-shadow:0 30px 75px #06264e17}.login-card-head{margin-bottom:27px}.login-card-head small{font-size:10px;letter-spacing:.14em;font-weight:800;color:#5f8738}.login-card-head h2{font-size:30px;letter-spacing:-.03em;margin:9px 0 8px;font-family:Montserrat,sans-serif}.login-card-head p{font-size:13px;line-height:1.65;color:#72808d;margin:0}
        .login-form{display:grid;gap:17px}.login-label{display:grid;gap:8px;font-size:13px;font-weight:700}.login-input{height:52px;border-radius:11px;border:1px solid #d9e1d6;background:#fbfcfa;color:#06264e;padding:0 15px;font-size:15px;outline:none}.login-input:focus{border-color:#86a766;box-shadow:0 0 0 4px #749b4918}.login-row{display:flex;justify-content:space-between;align-items:center;gap:15px;font-size:12px}.remember{display:flex;align-items:center;gap:8px;color:#72808d}.forgot{color:#5f8738;font-weight:700;text-decoration:none}
        .login-submit{min-height:54px;border:0;border-radius:12px;background:linear-gradient(135deg,#7ca64d,#5f8738);color:#fff;font-weight:700;font-size:15px;cursor:pointer}.login-submit:disabled{opacity:.65;cursor:wait}.login-message{margin:0;padding:13px 14px;border-radius:10px;background:#edf3e7;color:#52752f;font-size:12px;line-height:1.55;border:1px solid #dce8d2}.login-note{margin:23px 0 0;text-align:center;color:#7c8993;font-size:12px}.login-footer{height:58px;border-top:1px solid #edf0ec;display:flex;align-items:flex-end;justify-content:space-between;color:#89949d;font-size:11px}.login-footer a{color:#5f8738;font-weight:700;text-decoration:none}
        @media(max-width:900px){.login-shell{padding:24px}.login-content{grid-template-columns:1fr;gap:42px}.login-intro{text-align:center;margin:auto}.login-intro h1{font-size:44px}.login-card{justify-self:center}.login-features{max-width:430px;margin:auto;text-align:left}}
        @media(max-width:560px){.login-shell{padding:18px}.login-logo,.login-logo img{width:145px}.login-intro h1{font-size:36px}.login-card{padding:27px 22px}.login-row{align-items:flex-start;flex-direction:column}.login-footer{height:auto;padding:20px 0;flex-direction:column;align-items:center;gap:12px;text-align:center}}
      `}</style>
      <div className="login-shell">
        <header className="login-header"><a className="login-logo" href="/"><img src="/arvoos-logo.png" alt="ArvoOS" /></a><a className="back-link" href="/">← Ana sayfaya dön</a></header>
        <section className="login-content">
          <div className="login-intro"><div className="login-kicker">ARVOOS KURUMSAL ERİŞİM</div><h1>Tüm işletmeniz.<span>Tek bir çalışma alanında.</span></h1><p>Müşterilerinizden finansa, ekip görevlerinden günlük operasyonlara kadar tüm süreçlerinize güvenli biçimde erişin.</p><div className="login-features"><div className="login-feature"><i>✓</i> Supabase ile güvenli kullanıcı doğrulama</div><div className="login-feature"><i>✓</i> Tüm ekipler için ortak çalışma alanı</div><div className="login-feature"><i>✓</i> İş akışları ve raporlar tek merkezde</div></div></div>
          <section className="login-card"><div className="login-card-head"><small>HOŞ GELDİNİZ</small><h2>Hesabınıza giriş yapın</h2><p>Supabase üzerinde oluşturulan kurumsal hesabınızla ArvoOS paneline erişin.</p></div><form className="login-form" onSubmit={handleSubmit}><label className="login-label">E-posta adresi<input className="login-input" name="email" type="email" autoComplete="email" placeholder="ad@sirketiniz.com" disabled={loading} /></label><label className="login-label">Şifre<input className="login-input" name="password" type="password" autoComplete="current-password" placeholder="Şifrenizi girin" disabled={loading} /></label><div className="login-row"><label className="remember"><input type="checkbox" /> Beni hatırla</label><a className="forgot" href="mailto:destek@arvo-os.com?subject=ArvoOS%20Şifre%20Sıfırlama">Şifremi unuttum</a></div><button className="login-submit" type="submit" disabled={loading}>{loading ? "Kontrol ediliyor..." : "Giriş Yap →"}</button>{message && <p className="login-message" role="status">{message}</p>}</form><p className="login-note">İlk hesabı Supabase Authentication bölümünden oluşturacağız.</p></section>
        </section>
        <footer className="login-footer"><span>© 2026 ArvoOS. Tüm hakları saklıdır.</span><span>Yardıma mı ihtiyacınız var? <a href="mailto:destek@arvo-os.com">Destek ekibine ulaşın</a></span></footer>
      </div>
    </main>
  );
}
