import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  /*
    Şifre YENİLEME mi, ilk şifre mi (16.10.2026)? Şifre ekranı ikisini de
    "ekibine hoş geldiniz … bu adım yalnızca bir kez yapılır" diye
    karşılıyordu; şifresini unutan eski kullanıcı için ikisi de yanlış.
    Jetonlu bağlantı türünü kendisi söylüyor (type=recovery); kodlu
    bağlantıyı "Şifremi unuttum" tur=yenile ile işaretliyor.
  */
  const yenileme = type === "recovery" || url.searchParams.get("tur") === "yenile";

  /*
    JETONLU BAĞLANTI BURADA HARCANMAZ (16.10.2026). Eskiden verifyOtp GET'te
    çağrılıyordu: kurumsal posta tarayıcıları e-postadaki bağlantıyı
    kullanıcıdan önce açıyor ve tek kullanımlık jetonu harcıyordu. Artık
    onay ekranına geçiliyor; jeton orada "Devam et"le harcanıyor
    (app/auth/dogrula). Konsolun "sahibe giriş bağlantısı", ekip daveti ve
    kimlik e-postası kancası bu yoldan geliyor.
  */
  if (tokenHash && type) {
    const onay = new URL("/auth/dogrula", url.origin);
    onay.searchParams.set("token_hash", tokenHash);
    onay.searchParams.set("type", type);
    onay.searchParams.set("next", next);
    if (yenileme) onay.searchParams.set("tur", "yenile");
    return NextResponse.redirect(onay);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = new URL("/auth/set-password", url.origin);
      destination.searchParams.set("next", next);
      if (yenileme) destination.searchParams.set("tur", "yenile");
      return NextResponse.redirect(destination);
    }
  }

  /*
    Ne kod ne jeton: Supabase oturumu adresin #… kısmına koymuş olabilir
    (eski biçimli davet e-postası). Sunucu o kısmı göremez; tarayıcı onu
    bu yönlendirmede KORUR ve hedef sayfadaki yakalayıcı oturumu kurar
    (app/auth/forgot-password → hash-oturumu.tsx).
  */
  const failure = new URL("/auth/forgot-password", url.origin);
  failure.searchParams.set("error", "expired");
  return NextResponse.redirect(failure);
}
