import { hostFromHeaders } from "@/lib/site/host-rules";

/*
  İzin akışının paylaştığı adres.

  Yönlendirme adresi ÜÇ yerde birebir aynı olmak zorunda: Google'a
  giderken, kodu belirteçle değiştirirken ve kurumun Cloud projesine elle
  yazdığı kayıtta. Üçü ayrı ayrı kurulursa Google redirect_uri_mismatch
  diyor ve hangisinin yanlış olduğunu söylemiyor.

  ADRES SABİT DEĞİL, O ANKİ ALAN ADI. Panel çok kiracılı ve her kurum
  kendi doğrulanmış alan adından girebiliyor (app.akademikmerkez.com
  gibi). İlk sürümde ayarlar ekranı sabit "app.arvo-os.com" yazıyordu;
  kendi alan adından giren kurum o adresi kaydediyor, Google'a ise
  bulunduğu alan adı gidiyor ve bağlantı daha ilk denemede
  redirect_uri_mismatch ile düşüyordu (06.10.2026).

  Sabit alan adına ZORLAMAK da çözüm değil: geri dönüş app.arvo-os.com'a
  düşerse oturum çerezi o alan adında olmadığı için kullanıcı giriş
  ekranına çıkar ve akış ortada kalır. Çerez alan adına bağlı; akış
  başladığı alan adında bitmeli.
*/
export const POSTA_GERI_DONUS = "/panel/settings/mail/geri-donus";
export const postaDurumCerezi = "arvo_posta_durum";

/** İsteğin geldiği alan adına göre tam geri dönüş adresi. */
export function postaGeriDonusAdresi(headers: { get(name: string): string | null }): string {
  return `https://${hostFromHeaders(headers)}${POSTA_GERI_DONUS}`;
}
