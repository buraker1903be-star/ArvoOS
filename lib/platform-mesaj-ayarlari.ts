/*
  PLATFORMUN MESAJ VE BİLDİRİM AYARLARI (29.10.2026).

  Üç ortam değişkeni, üç sessiz sonuç. Eksik olduklarında hiçbir şey
  düşmüyor — AGENTS.md'nin kuralı bu ve doğru: eksik bir anahtar
  yüzünden ödeme ya da giriş akışı kapanmamalı. Ama "düşmüyor"
  "görünüyor" demek değildi: anahtarın eksikliği yalnızca Sistem
  ayarları → Entegrasyonlar sekmesinde yazıyordu; kurucunun her gün
  baktığı Sistem sağlığı ekranı bunları hiç saymıyor, "Açık sorun 0"
  diyordu.

  Canlıda bu gün yaşandı: RESEND_API_KEY tanımsızdı, yani otomatik
  proforma kesilip e-postayla GİTMEYECEKTİ; işin ilk koşmasına birkaç
  saat vardı ve ekranda hiçbir uyarı yoktu.

  Modül saf: ortam okuyucusunu DIŞARIDAN alıyor, böylece iki ekran da
  aynı listeyi kullanıyor ve birim testi gerçek ortam değişkenine
  bağlanmıyor (tests/unit/platform-mesaj-ayarlari.test.ts).
*/

export type MesajAyari = {
  ad: string;
  /** Ayarlı mı. */
  bagli: boolean;
  /** Ekranda görünen cümle: bağlıyken ne yaptığı, eksikken NE OLMADIĞI. */
  not: string;
  /** Eksikliğin bedeli; sağlık ekranı bunu yazıyor. */
  bedel: string;
};

/** `var_`: değişken tanımlı mı (değeri değil). */
export function mesajAyarlari(
  var_: (ad: string) => boolean,
  pushYapilandi: boolean,
): MesajAyari[] {
  const whatsapp = var_("WHATSAPP_PHONE_ID") && var_("WHATSAPP_TOKEN");
  const resend = var_("RESEND_API_KEY");
  return [
    {
      ad: "WhatsApp (Meta)",
      bagli: whatsapp,
      not: whatsapp ? "Arvo numarası tanımlı" : "WHATSAPP_PHONE_ID / WHATSAPP_TOKEN eksik",
      bedel: "Dört ürünün WhatsApp mesajları gönderilemez.",
    },
    {
      /*
        AYNI ADI TAŞIYAN İKİ AYRI ANAHTAR VAR ve bu karışıklığa yol
        açtı (29.10.2026): "Resend zaten aktif" denildi, ekran yine
        "eksik" diyordu. İkisi de doğruydu —

          - Supabase kenar fonksiyonu (supabase/functions/send-auth-email,
            `Deno.env.get`): davet, şifre sıfırlama, giriş postaları.
            Supabase'in sır kasasında ve ÇALIŞIYOR.
          - Vercel ortam değişkeni (`process.env`, lib/eposta-gonder):
            otomatik proforma, sözleşme postası, toplu hatırlatma.

        Ekran "RESEND_API_KEY eksik" deyip NEREDE eksik olduğunu
        söylemiyordu; kurucu haklı olarak yanlış yere baktı. Not artık
        yeri de, etkilenmeyeni de yazıyor.
      */
      ad: "E-posta (Resend)",
      bagli: resend,
      not: resend
        ? "Proforma e-postaları noreply@arvo-os.com adresinden gidiyor"
        : "Vercel'de RESEND_API_KEY tanımlı değil: proformalar kesilip bildirilir ama e-postayla gitmez. Supabase'teki anahtar ayrıdır, davet ve şifre postaları ondan gider.",
      bedel: "Otomatik proforma, sözleşme postası ve toplu hatırlatma e-postayla gitmez. Davet ve şifre postaları etkilenmez: onlar Supabase kenar fonksiyonundaki ayrı anahtarla gider.",
    },
    {
      ad: "Anlık bildirim (web push)",
      bagli: pushYapilandi,
      not: pushYapilandi ? "VAPID anahtarları tanımlı" : "VAPID anahtarları eksik",
      bedel: "Panel bildirimleri telefona düşmez; yalnızca panelde görünür.",
    },
  ];
}

/** Eksik olanlar; sağlık ekranı bunları açık sorun sayıyor. */
export const eksikMesajAyarlari = (ayarlar: readonly MesajAyari[]) => ayarlar.filter((a) => !a.bagli);
