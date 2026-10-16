/*
  KİMLİK E-POSTASI BAĞLANTISI (16.10.2026) — saf modül.

  Davet ve şifre yenileme e-postalarındaki bağlantı. Eskiden düğme önce
  Supabase'in /auth/v1/verify adresine gidiyordu; davet (implicit akış)
  oturumu adresin #… kısmına koyup dönüyor, sunucuda çalışan
  /auth/callback o kısmı göremiyor ve davetli "bağlantı süresi dolmuş"
  ekranına düşüyordu. Şifre yenilemede (PKCE) ise bağlantı yalnızca
  isteği yapan tarayıcıda açılabiliyordu: bilgisayarda istenip telefonda
  açılan e-posta çalışmıyordu.

  Supabase'in sunucu taraflı uygulamalar için önerdiği yol: e-posta
  doğrudan uygulamanın /auth/callback adresine token_hash ve type ile
  gelir, doğrulamayı sunucu yapar (verifyOtp) — cihaz ve akış türünden
  bağımsız. Kanca (supabase/functions/send-auth-email) bu modülün
  kuralıyla bağlantı kurar; Deno ile Node arasında kod paylaşılmadığı
  için orada bir kopyası var ve birim testi ikisini aynı örneklerle
  sınıyor (tests/unit/kimlik-baglantisi.test.ts).
*/

/** verifyOtp'nin token_hash ile kabul ettiği türler. */
export const BAGLANTI_TURLERI = ["invite", "recovery", "magiclink", "signup", "email"] as const;
export type BaglantiTuru = (typeof BAGLANTI_TURLERI)[number];

/**
 * E-postadaki bağlantı. redirect_to uygulamanın /auth/callback adresi
 * değilse (ya da çözülemiyorsa) null döner: çağıran Supabase'in kendi
 * doğrulama adresine geri düşer. redirect_to'nun izinli adres olduğunu
 * Supabase kancayı çağırmadan önce denetliyor.
 */
export function dogrudanBaglanti(redirectTo: string | undefined | null, tokenHash: string | undefined | null, tur: string): string | null {
  if (!redirectTo || !tokenHash || !(BAGLANTI_TURLERI as readonly string[]).includes(tur)) return null;
  let hedef: URL;
  try { hedef = new URL(redirectTo); } catch { return null; }
  if (hedef.protocol !== "https:" || hedef.pathname !== "/auth/callback") return null;
  hedef.searchParams.set("token_hash", tokenHash);
  hedef.searchParams.set("type", tur);
  return hedef.toString();
}
