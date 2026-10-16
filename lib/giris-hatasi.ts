/*
  GİRİŞ VE ŞİFRE HATALARININ KODU (16.10.2026) — saf modül.

  Supabase'in hata kodu ekrandaki açıklamanın anahtarına çevriliyor.
  Eskiden giriş her hatada "E-posta adresi veya parola hatalı" diyordu:
  çok fazla denemeden sonra Supabase geçici olarak reddettiğinde de aynı
  metin çıkıyor, kullanıcı parolasını yanlış sanıp yeniden deniyor ve
  engeli uzatıyordu. Şifre belirleme ekranı da her reddi "Şifre
  kaydedilemedi, lütfen tekrar deneyin" diye yazıyordu; en sık iki sebep
  (yeni şifre eskisiyle aynı, şifre zayıf / sızıntı listesinde) hiç
  söylenmiyordu ve kullanıcı aynı şifreyi denemeye devam ediyordu.

  Bilinmeyen kod genel anahtara düşer — hesabın var olup olmadığını ele
  veren bir ayrım (ör. "böyle bir kullanıcı yok") BİLEREK yapılmıyor.
  Birim testi tests/unit/giris-hatasi.test.ts.
*/

type SupabaseHatasi = { code?: string | null; status?: number | null; message?: string | null } | null | undefined;

/** Giriş hatası → /login?error= anahtarı. */
export function girisHataAnahtari(hata: SupabaseHatasi): "invalid" | "cok_deneme" | "dogrulanmamis" {
  const kod = hata?.code ?? "";
  if (kod === "over_request_rate_limit" || kod === "over_email_send_rate_limit" || hata?.status === 429) return "cok_deneme";
  if (kod === "email_not_confirmed") return "dogrulanmamis";
  return "invalid";
}

/** Şifre güncelleme hatası → /auth/set-password?error= anahtarı. */
export function sifreHataAnahtari(hata: SupabaseHatasi): "ayni" | "zayif" | "cok_deneme" | "oturum" | "failed" {
  const kod = hata?.code ?? "";
  if (kod === "same_password") return "ayni";
  if (kod === "weak_password") return "zayif";
  if (kod === "over_request_rate_limit" || hata?.status === 429) return "cok_deneme";
  if (kod === "session_not_found" || kod === "session_expired" || kod === "reauthentication_needed") return "oturum";
  return "failed";
}
