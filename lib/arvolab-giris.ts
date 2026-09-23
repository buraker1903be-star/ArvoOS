/*
  ArvoLab'a tek tıkla geçiş bağlantısının kurulması. Saf modül; testi
  tests/unit/arvolab-giris.test.ts.

  Eskiden admin.generateLink'in action_link'ine yönlendiriliyordu. O
  bağlantı Supabase'in /auth/v1/verify adresine gider ve doğrulanan oturumu
  adresin #access_token=… KISMIYLA döndürür; adres kısmını sunucu hiç
  görmez. Sonuç: kişi ArvoLab'a varıyor, sunucu oturumu bulamıyor ve giriş
  ekranı çıkıyordu.

  ArvoLab bu dersi kendi e-postalarında almıştı (16.09–20.09.2026 arası her
  şifre sıfırlama "bağlantı geçersiz"e düşüyordu) ve bunun için /auth/confirm
  yolu var: token_hash'i verifyOtp ile doğrulayıp oturum çerezini sunucuda
  yazıyor.
*/

/** ArvoLab'ın safeConfirmNext'inin kabul ettiği yollar; başkası sessizce
 *  /dashboard'a düşer, o yüzden buradan da göndermiyoruz. */
const IZINLI_HEDEFLER = new Set(["/dashboard", "/reset-password"]);

export function arvolabGirisAdresi(koken: string, hashedToken: string, hedef = "/dashboard") {
  const url = new URL("/auth/confirm", koken);
  url.searchParams.set("token_hash", hashedToken);
  // Magic link'in doğrulama türü; ArvoLab tarafında verifyOtp'a geçiyor.
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", IZINLI_HEDEFLER.has(hedef) ? hedef : "/dashboard");
  return url.toString();
}
