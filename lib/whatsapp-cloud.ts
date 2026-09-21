// Meta WhatsApp Cloud API ile konuşan saf katman.
//
// Kurum kendi WhatsApp Business hesabını (WABA) bağlarken girdiği numara
// kimliği ve erişim anahtarı burada doğrulanır: Meta'dan numaranın görünen
// hâli ve işletme adı okunur. Anahtar yanlışsa ya da numara başka bir
// hesaba aitse bağlantı hiç kurulmaz — yoksa hata ancak ilk mesaj
// gönderilirken, müşteriye mesaj gitmeyince anlaşılırdı.
//
// Ağ çağrısı dışarıdan verilebilir (testler için); testi
// tests/unit/whatsapp-cloud.test.ts.

/**
 * Meta Graph API sürümü; numara doğrulama, gönderim ve webhook aynı sürümde.
 *
 * Meta her sürümü yaklaşık iki yıl destekliyor, sonra kapatıyor: sürüm
 * emekli olduğunda gönderim de webhook da tek seferde durur, üstelik bizim
 * hiçbir şey değiştirmediğimiz bir günde. Yılda bir bakıp güncelleyin;
 * güncel sürüm Meta uygulama panelindeki hazır curl örneğinde yazıyor
 * (developers.facebook.com → uygulama → WhatsApp → API Setup).
 *
 * Tek yerde durmasının sebebi kapı: dört ürün de buradan geçtiği için
 * sürüm yükseltmek tek satır. Ürünler Meta'ya doğrudan çağırsaydı dört
 * depoda ayrı ayrı aranacaktı.
 */
export const GRAPH_VERSION = "v25.0";

export type WhatsappNumber = {
  phoneNumberId: string;
  displayPhone: string | null;
  verifiedName: string | null;
};

export type WhatsappCheck =
  | { ok: true; number: WhatsappNumber }
  | { ok: false; error: string };

type MetaError = { message?: string; code?: number; error_subcode?: number; type?: string };

/**
 * Meta hata kodunu salonun/kurumun anlayacağı Türkçe cümleye çevirir.
 * Kodları ekranda ham göstermek "OAuthException 190" gibi bir şey bırakıyordu.
 */
export function whatsappErrorMessage(error: MetaError | undefined, status: number): string {
  const code = error?.code;
  if (code === 190) return "Erişim anahtarı geçersiz ya da süresi dolmuş. Meta Business'ta yeni bir kalıcı anahtar oluşturup tekrar deneyin.";
  if (code === 200 || code === 10) return "Bu anahtarın numara üzerinde yetkisi yok. Sistem kullanıcısına WhatsApp hesabı için yetki verin.";
  if (code === 100) return "Numara kimliği (phone number ID) bulunamadı. WhatsApp Manager'daki değerle aynı olduğundan emin olun.";
  if (code === 4 || code === 80007) return "Meta şu an istekleri sınırlıyor (rate limit). Birkaç dakika sonra tekrar deneyin.";
  // Serbest metin yalnızca müşterinin son mesajından sonraki 24 saat içinde.
  if (code === 131047) return "24 saatlik yanıt penceresi kapandı: serbest metin gönderilemez, onaylı şablon gerekir.";
  if (code === 131026) return "Numara WhatsApp'ta kayıtlı değil ya da mesaj alamıyor.";
  if (code === 132000 || code === 132001) return "Şablon Meta'da onaylı değil ya da parametre sayısı tutmuyor.";
  if (status === 408 || status === 504) return "Meta'ya ulaşılamadı (zaman aşımı). Tekrar deneyin.";
  return error?.message?.trim() || `Meta doğrulamayı reddetti (HTTP ${status}).`;
}

/** Girilen değerler biçim olarak makul mü; ağa çıkmadan önce. */
export function whatsappInputError(phoneNumberId: string, wabaId: string, token: string): string | null {
  if (!/^\d{6,25}$/.test(phoneNumberId)) return "Numara kimliği (phone number ID) yalnızca rakamlardan oluşur; WhatsApp Manager'dan kopyalayın.";
  if (!/^\d{6,25}$/.test(wabaId)) return "WhatsApp Business hesap kimliği (WABA ID) yalnızca rakamlardan oluşur.";
  if (token.length < 40) return "Erişim anahtarı eksik görünüyor. Meta Business'taki kalıcı anahtarın tamamını yapıştırın.";
  return null;
}

/** Numarayı Meta'ya sorar: anahtar doğru mu, numara bu anahtarla gönderim yapabiliyor mu. */
export async function verifyWhatsappNumber(
  phoneNumberId: string,
  token: string,
  getir: typeof fetch = fetch,
): Promise<WhatsappCheck> {
  const adres = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name`;
  try {
    const yanit = await getir(adres, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const cevap = (await yanit.json().catch(() => ({}))) as {
      id?: string; display_phone_number?: string; verified_name?: string; error?: MetaError;
    };
    if (!yanit.ok || cevap.error) return { ok: false, error: whatsappErrorMessage(cevap.error, yanit.status) };
    return {
      ok: true,
      number: {
        phoneNumberId: cevap.id ?? phoneNumberId,
        displayPhone: cevap.display_phone_number ?? null,
        verifiedName: cevap.verified_name ?? null,
      },
    };
  } catch (hata) {
    return { ok: false, error: `Meta'ya ulaşılamadı: ${hata instanceof Error ? hata.message : String(hata)}` };
  }
}
