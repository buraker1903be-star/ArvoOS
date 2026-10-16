import { cookies } from "next/headers";

/*
  GİRİŞ EKRANLARINDA E-POSTAYI ADRESE YAZMADAN HATIRLAMAK (16.10.2026).

  "Şifremi unuttum" her sonuçta e-postayı adrese yazıyordu
  (?sent=1&email=ad@kurum.com): kişisel veri tarayıcı geçmişine, sunucu
  ve CDN günlüklerine ve sonraki sayfanın Referer başlığına düşüyordu.
  Giriş ekranı ise hiç hatırlamıyordu — parola yanlış olunca kullanıcı
  e-postasını da baştan yazıyordu.

  Artık e-posta kısa ömürlü (beş dakika), yalnızca sunucunun okuduğu
  (httpOnly) bir çerezde. Yol "/": giriş /login'de, şifre yenileme /auth
  altında ve ikisi aynı çerezi okuyor. Kişinin kendi tarayıcısında, kendi
  yazdığı adres.
*/
const CEREZ = "arvo_giris_eposta";

export async function epostayiHatirla(eposta: string) {
  if (!eposta) return;
  (await cookies()).set(CEREZ, eposta.slice(0, 254), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 300,
  });
}

export async function hatirlananEposta(): Promise<string> {
  return (await cookies()).get(CEREZ)?.value ?? "";
}
