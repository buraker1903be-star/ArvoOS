import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getPanelContext } from "@/lib/panel-context";
import { flashError } from "@/lib/panel-action";
import { postaIstemcisi } from "@/lib/posta-hesabi";
import { durumuKur, yetkilendirmeUrl } from "@/lib/posta-oauth";
import { postaDurumCerezi, postaGeriDonusAdresi } from "../ortak";

/*
  ORTAK POSTA KUTUSU — Google izin akışının başlangıcı.

  Sunucu işlemi (server action) değil, GET yolu: Google'a yönlendirme
  tarayıcının adres çubuğunda olmalı. Bir server action'dan 302 dönmek
  fetch'in içinde kalır, kullanıcı izin ekranını hiç görmez.
*/

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { membership, izin } = await getPanelContext();

  if (!izin("settings.entegrasyon.yonet")) {
    await flashError("Posta bağlantısını yönetme yetkiniz yok.");
    return NextResponse.redirect(new URL("/panel/settings", request.url));
  }

  const istemci = await postaIstemcisi(membership.organization_id);
  if (!istemci) {
    await flashError("Önce ortak posta adresini ve Google anahtarlarını kaydedin.");
    return NextResponse.redirect(new URL("/panel/settings", request.url));
  }

  /*
    Tek seferlik değer çerezde; geri dönüşte state'teki kopyasıyla
    karşılaştırılıyor (CSRF). httpOnly: sayfadaki hiçbir betiğin okumasına
    gerek yok. sameSite=lax: Google'dan GET ile dönülüyor, strict olsaydı
    çerez o istekte gönderilmez ve her bağlantı denemesi "zaman aşımı"
    derdi.
  */
  const tekSeferlik = randomBytes(24).toString("base64url");
  (await cookies()).set(postaDurumCerezi, tekSeferlik, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/panel/settings", maxAge: 600,
  });

  const adres = yetkilendirmeUrl({
    clientId: istemci.clientId,
    redirectUri: postaGeriDonusAdresi(await headers()),
    state: durumuKur(tekSeferlik, membership.organization_id),
    loginHint: istemci.adres,
  });

  return NextResponse.redirect(adres, { headers: { "Cache-Control": "no-store" } });
}
