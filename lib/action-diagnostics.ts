/**
 * Sunucu işlemlerinde hata teşhisi.
 *
 * Bir yazma işlemi RLS ya da doğrulama yüzünden reddedildiğinde, hata
 * mesajı tek başına yeterli olmuyor: "new row violates row-level
 * security policy" hangi değerin sorun çıkardığını söylemiyor. Bu
 * yüzden gönderilen değerleri yapılandırılmış biçimde loga yazıyoruz.
 *
 * Neden hata mesajına eklemiyoruz: mesaj kullanıcıya giden metin.
 * Kurum ve kullanıcı kimliklerini oraya koymak hem gereksiz hem de
 * ileride bir hata sınırı bunu ekranda gösterirse sızıntı olur.
 * Log tarafı sadece Vercel üzerinden görülebiliyor.
 *
 * Kullanım:
 *   if (error) {
 *     reportActionFailure("createOpportunity", error, { organizationId, ... });
 *     throw new Error("Talep oluşturulamadı: " + error.message);
 *   }
 */

type ActionError = { message?: string; code?: string; details?: string | null };

export function reportActionFailure(
  action: string,
  error: ActionError | null | undefined,
  context: Record<string, unknown> = {},
): void {
  console.error(
    "[ARVO-HATA]",
    JSON.stringify({
      action,
      message: error?.message ?? null,
      code: error?.code ?? null,
      details: error?.details ?? null,
      ...context,
    }),
  );
}
