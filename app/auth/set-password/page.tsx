import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLoginBrand, loginAccentStyle } from "@/lib/login-branding";
import { setInitialPassword } from "./actions";
import "../../login/login.css";

export const metadata: Metadata = {
  title: "Şifre Oluştur",
  description: "ArvoOS hesabınız için bir şifre belirleyin.",
};

const errorMessages: Record<string, string> = {
  short: "Şifre en az 8 karakter olmalı.",
  mismatch: "Girdiğiniz şifreler birbiriyle uyuşmuyor.",
  failed: "Şifre kaydedilemedi, lütfen tekrar deneyin.",
};

type WorkspaceRow = { name: string; display_name: string | null; logo_url: string | null; brand_color?: string | null };

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  // Davet ya da şifre bağlantısı açıldıysa oturum vardır. Yoksa bağlantının
  // süresi dolmuş veya kullanılmıştır; form doldurtmadan baştan söylenir.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const signedIn = Boolean(auth?.claims?.sub);
  const email = typeof auth?.claims?.email === "string" ? auth.claims.email : null;

  // Katılınan kurum: davet edilen kişi hangi ekibe girdiğini görsün.
  let organization: { name: string; logo_url: string | null; color: string | null } | null = null;
  if (signedIn) {
    const { data: rows } = await supabase.rpc("get_my_workspaces");
    const row = Array.isArray(rows) ? (rows[0] as WorkspaceRow | undefined) : undefined;
    if (row) organization = { name: row.display_name || row.name, logo_url: row.logo_url ?? null, color: row.brand_color ?? null };
  }
  // Oturum yoksa (geçersiz bağlantı) kurumun alan adındaki marka kullanılır.
  if (!organization) {
    const hostBrand = await getLoginBrand();
    if (hostBrand) organization = { name: hostBrand.name, logo_url: hostBrand.logo_url, color: hostBrand.primary_color };
  }

  return (
    <main className="login-shell" style={loginAccentStyle(organization?.color)}>
      <section className="login-brand">
        {organization ? (
          organization.logo_url ? <img src={organization.logo_url} alt={organization.name} /> : <span className="login-brand-name">{organization.name}</span>
        ) : (
          <img src="/arvoos-logo.png" alt="ArvoOS" />
        )}
        <div>
          <span>{organization ? "KURUM PANELİ" : "ARVOOS KURUM PANELİ"}</span>
          <h1>{!signedIn ? "Bağlantınızı yenileyelim." : organization ? `${organization.name} ekibine hoş geldiniz.` : "Hesabınıza hoş geldiniz."}</h1>
          <p>{signedIn
            ? "Panelinize girmeden önce kendi şifrenizi belirleyin. Bu adım yalnızca bir kez yapılır; sonraki girişlerinizde e-posta adresiniz ve bu şifreyi kullanırsınız."
            : "Güvenliğiniz için davet ve şifre bağlantıları tek kullanımlıktır ve kısa süre içinde geçerliliğini yitirir."}</p>
        </div>
      </section>
      <section className="login-form-wrap">
        {signedIn ? (
          <form action={setInitialPassword} className="login-card">
            <div className="login-card-brand">
              {organization?.logo_url ? <img src={organization.logo_url} alt={organization.name} className="login-card-logo" /> : <small>{organization ? organization.name : "ARVOOS"}</small>}
            </div>
            <span>ŞİFRE OLUŞTUR</span>
            <h2>Kendi şifrenizi belirleyin</h2>
            <p>En az 8 karakterli bir şifre girin, panelinize hemen geçeceksiniz.</p>
            {email ? (
              <div className="login-account">
                <small>Giriş e-postanız</small>
                <b>{email}</b>
              </div>
            ) : null}
            {error && <div className="login-error" role="alert">{errorMessages[error] ?? "Bir hata oluştu, lütfen tekrar deneyin."}</div>}
            <input type="hidden" name="next" value={next ?? "/panel"} />
            {/* Parola yöneticileri şifreyi doğru hesapla eşleştirsin diye */}
            {email ? <input type="hidden" name="username" autoComplete="username" value={email} /> : null}
            <label>Yeni şifre<input name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="En az 8 karakter" /></label>
            <label>Şifreyi doğrula<input name="confirm_password" type="password" autoComplete="new-password" required minLength={8} placeholder="Şifreyi tekrar girin" /></label>
            <button type="submit">Şifreyi Kaydet ve Panele Gir <b>→</b></button>
          </form>
        ) : (
          <div className="login-card">
            <div className="login-card-brand">
              {organization?.logo_url ? <img src={organization.logo_url} alt={organization.name} className="login-card-logo" /> : <small>{organization ? organization.name : "ARVOOS"}</small>}
            </div>
            <span>BAĞLANTI GEÇERSİZ</span>
            <h2>Bu bağlantı artık kullanılamıyor</h2>
            <p>Davet veya şifre bağlantınızın süresi dolmuş ya da daha önce kullanılmış olabilir. E-posta adresinizle yeni bir bağlantı isteyebilir veya sizi davet eden yöneticiden yeni bir giriş bağlantısı gönderilmesini isteyebilirsiniz.</p>
            <Link href="/auth/forgot-password">Yeni bağlantı iste</Link>
            <Link href="/login">Giriş ekranına dön</Link>
          </div>
        )}
      </section>
    </main>
  );
}
