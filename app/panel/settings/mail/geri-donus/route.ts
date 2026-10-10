import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getPanelContext } from "@/lib/panel-context";
import { flashError, flashSuccess } from "@/lib/panel-action";
import { postaBaglantisiniTamamla } from "@/lib/posta-hesabi";
import { durumuDogrula } from "@/lib/posta-oauth";
import { postaDurumCerezi, postaGeriDonusAdresi } from "../ortak";

/*
  ORTAK POSTA KUTUSU — Google izin akışının dönüşü.

  Google buraya ya `code` ile ya `error` ile döner. Her iki durumda da
  tek seferlik çerez tüketiliyor: başarısız bir denemenin çerezi
  kalırsa, sonraki istek o eski değerle de geçebilirdi.
*/

export const dynamic = "force-dynamic";

const AYARLAR = "/panel/settings?bolum=entegrasyonlar#posta";

export async function GET(request: Request) {
  const { membership, userId, izin } = await getPanelContext();
  const cerezler = await cookies();
  const cerezdeki = cerezler.get(postaDurumCerezi)?.value ?? null;
  cerezler.delete(postaDurumCerezi);

  const geriDon = () => NextResponse.redirect(new URL(AYARLAR, request.url), { headers: { "Cache-Control": "no-store" } });

  if (!izin("settings.entegrasyon.yonet")) {
    await flashError("Posta bağlantısını yönetme yetkiniz yok.");
    return geriDon();
  }

  const adres = new URL(request.url);
  const googleHatasi = adres.searchParams.get("error");
  if (googleHatasi) {
    await flashError(googleHatasi === "access_denied"
      ? "Google izni verilmedi; posta kutusu bağlanmadı."
      : `Google izin akışı tamamlanmadı (${googleHatasi}).`);
    return geriDon();
  }

  const durum = durumuDogrula(adres.searchParams.get("state"), cerezdeki, membership.organization_id);
  if (!durum.gecerli) {
    await flashError(durum.sebep);
    return geriDon();
  }

  const kod = adres.searchParams.get("code");
  if (!kod) {
    await flashError("Google'dan yetkilendirme kodu gelmedi.");
    return geriDon();
  }

  const sonuc = await postaBaglantisiniTamamla({
    organizationId: membership.organization_id,
    kod,
    // Başlangıçtakiyle BİREBİR aynı olmalı; Google aksi hâlde kodu kabul etmiyor.
    // İkisi de aynı fonksiyondan geçiyor ki ayrışamasınlar.
    redirectUri: postaGeriDonusAdresi(await headers()),
    userId,
  });

  if ("hata" in sonuc) await flashError(sonuc.hata);
  else await flashSuccess(`${sonuc.adres} ortak posta kutusu olarak bağlandı.`);
  return geriDon();
}
