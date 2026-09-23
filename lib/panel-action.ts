import { cookies } from "next/headers";

// Panel işlemlerinin sonucunu kullanıcıya ulaştırır.
//
// Hata: Üretimde Next.js, sunucu işleminde fırlatılan hatanın mesajını
// güvenlik gereği gizler; kullanıcı yalnızca genel hata ekranını görüyordu ve
// "Tahsilat açık cari bakiyesini aşamaz" gibi Türkçe açıklamalar hiç
// ulaşmıyordu. Bu yardımcı hatayı yakalar, mesajı kısa ömürlü bir çereze
// yazar ve kullanıcıyı bulunduğu sayfada bırakır.
//
// Başarı: successMessage verilirse işlem bitince (ya da başarılı bir
// yönlendirmeyle) "Talep sisteme girildi" gibi mesaj ayrı bir çereze yazılır.
// Panel iki mesajı da bildirim olarak gösterir (app/panel/flash-toast.tsx);
// başarıda açık giriş penceresi kendiliğinden kapanır. Mesajlar URL'ye
// yazılmadığı için dışarıdan sahte mesaj enjekte edilemez.
//
// Next'in kontrol akışı sinyalleri (redirect, notFound…) "digest" taşır;
// onlara dokunulmaz, aynen yeniden fırlatılır.

export const FLASH_COOKIE = "arvo_flash";
export const FLASH_OK_COOKIE = "arvo_flash_ok";

const cookieOptions = () => ({
  path: "/",
  maxAge: 60,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
});

function isControlFlowSignal(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string",
  );
}

function isRedirectSignal(error: unknown) {
  return isControlFlowSignal(error) && String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT");
}

/**
 * Hata bildirimi bırakır (runPanelAction dışındaki işlemler için: route
 * handler'lar kendi yönlendirmesini yapıyor ve sarmalayıcıdan geçmiyor).
 */
export async function flashError(message: string) {
  (await cookies()).set(FLASH_COOKIE, encodeURIComponent(message.slice(0, 200)), cookieOptions());
}

/** Başarı bildirimi bırakır (runPanelAction dışındaki işlemler için). */
export async function flashSuccess(message: string) {
  (await cookies()).set(FLASH_OK_COOKIE, encodeURIComponent(message.slice(0, 200)), cookieOptions());
}

export async function runPanelAction<T>(action: () => Promise<T>, successMessage?: string): Promise<T | undefined> {
  try {
    const result = await action();
    if (successMessage) await flashSuccess(successMessage);
    return result;
  } catch (error) {
    if (isControlFlowSignal(error)) {
      // İşlem başarıyla bitip başka sayfaya yönlendiriyorsa da başarıdır
      if (successMessage && isRedirectSignal(error)) await flashSuccess(successMessage);
      throw error;
    }
    console.error("[panel-action]", error);
    const message = error instanceof Error && error.message
      ? error.message
      : "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
    const store = await cookies();
    store.delete(FLASH_OK_COOKIE);
    store.set(FLASH_COOKIE, encodeURIComponent(message.slice(0, 400)), cookieOptions());
    return undefined;
  }
}
