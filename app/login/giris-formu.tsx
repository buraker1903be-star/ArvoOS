"use client";

import { useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { login } from "./actions";
import { ceviriciKur, type Dil } from "@/lib/konsol-giris/dil";
import { GozKapaliSimgesi, GozSimgesi, OkSimgesi } from "./simgeler";

/*
  YÖNETİM GİRİŞ FORMU (26.11.2026).

  İşaretleme ve davranış ArvoLab'ın çalışan giriş formundan alındı
  (app/_components/giris-formu.tsx + ui/sifre-girdisi.tsx +
  kimlik/gonder-dugmesi.tsx, canlı commit b3fab7a4): etiket üstte,
  zorunluluk yıldızı, şifre alanının içinde göster/gizle, "Şifremi
  unuttum" şifrenin ALTINDA sağda, tam genişlikte gönder düğmesi.

  İstemci bileşeni yalnızca iki şey için: şifreyi göster/gizle ve
  gönderim sürerken düğmenin kilitlenmesi. Doğrulama ve yönlendirme
  sunucuda (app/login/actions.ts → login); form JavaScript yüklenmeden
  de çalışır.

  ALAN ADLARI VE autocomplete DEĞİŞMEDİ (email, password): tarayıcının
  kayıtlı şifre doldurması onlara bakıyor ve server action aynı.
  Sekme sırası e-posta → şifre → göster/gizle → şifremi unuttum → giriş.
*/
function GonderDugmesi({ metin, bekleyen }: { metin: string; bekleyen: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="kg-dugme kg-dugme--birincil kg-dugme--tam" disabled={pending} aria-busy={pending || undefined}>
      {pending ? <span className="kg-donen" aria-hidden="true" /> : null}
      {pending ? bekleyen : metin}
      {pending ? null : <OkSimgesi size={18} strokeWidth={2} />}
    </button>
  );
}

/* Dil KODU alınır, çevirici burada kurulur: sunucudan istemciye
   fonksiyon geçirilemez (bkz. tema-secici.tsx). */
export default function GirisFormu({ dil, hataVar, eposta }: { dil: Dil; hataVar: boolean; eposta: string }) {
  const t = ceviriciKur(dil);
  const [goster, setGoster] = useState(false);
  const sifreKimligi = useId();
  return (
    <form className="kg-formu" action={login}>
      <div className="kg-alan">
        <label className="kg-etiket" htmlFor="email">
          {t({ tr: "E-posta adresi", en: "Email address" })}
          <span className="kg-zorunlu" aria-hidden="true">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="kg-girdi"
          autoComplete="email"
          inputMode="email"
          placeholder={t({ tr: "adiniz@arvo-os.com", en: "name@arvo-os.com" })}
          defaultValue={eposta}
          aria-invalid={hataVar ? true : undefined}
          required
        />
      </div>

      <div className="kg-sifre">
        <div className="kg-alan">
          <label className="kg-etiket" htmlFor={sifreKimligi}>
            {t({ tr: "Şifre", en: "Password" })}
            <span className="kg-zorunlu" aria-hidden="true">*</span>
          </label>
          <div className="kg-sifre-kap">
            <input
              id={sifreKimligi}
              name="password"
              type={goster ? "text" : "password"}
              className="kg-girdi"
              autoComplete="current-password"
              placeholder={t({ tr: "Şifrenizi girin", en: "Enter your password" })}
              aria-invalid={hataVar ? true : undefined}
              required
            />
            <button
              type="button"
              className="kg-sifre-dugme"
              aria-pressed={goster}
              aria-controls={sifreKimligi}
              aria-label={goster ? t({ tr: "Şifreyi gizle", en: "Hide password" }) : t({ tr: "Şifreyi göster", en: "Show password" })}
              onClick={() => setGoster((onceki) => !onceki)}
            >
              {goster ? <GozKapaliSimgesi size={18} strokeWidth={1.9} /> : <GozSimgesi size={18} strokeWidth={1.9} />}
            </button>
          </div>
        </div>
        <div className="kg-satir">
          <a className="kg-baglanti" href="/auth/forgot-password">
            {t({ tr: "Şifremi unuttum", en: "Forgot password" })}
          </a>
        </div>
      </div>

      <GonderDugmesi metin={t({ tr: "Giriş yap", en: "Sign in" })} bekleyen={t({ tr: "Giriş yapılıyor…", en: "Signing in…" })} />
    </form>
  );
}
