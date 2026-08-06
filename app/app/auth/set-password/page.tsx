import type { Metadata } from "next";
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

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-brand">
        <div>
          <span>ARVOOS KURUM PANELİ</span>
          <h1>Hesabınıza hoş geldiniz.</h1>
          <p>Panelinize girmeden önce kendi şifrenizi belirlemeniz gerekiyor. Bu, sadece size ait, tek seferlik bir adım.</p>
        </div>
      </section>
      <section className="login-form-wrap">
        <form action={setInitialPassword} className="login-card">
          <div className="mark">A</div>
          <span>ŞİFRE OLUŞTUR</span>
          <h2>Kendi şifrenizi belirleyin</h2>
          <p>En az 8 karakterli bir şifre girin, panelinize hemen geçeceksiniz.</p>
          {error && <div className="login-error" role="alert">{errorMessages[error] ?? "Bir hata oluştu, lütfen tekrar deneyin."}</div>}
          <input type="hidden" name="next" value={next ?? "/panel"} />
          <label>Yeni şifre<input name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="En az 8 karakter" /></label>
          <label>Şifreyi doğrula<input name="confirm_password" type="password" autoComplete="new-password" required minLength={8} placeholder="Şifreyi tekrar girin" /></label>
          <button type="submit">Şifreyi Kaydet ve Panele Gir <b>→</b></button>
        </form>
      </section>
    </main>
  );
}
