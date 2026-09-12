import { cookies } from "next/headers";

// Panel işlemlerinin hata mesajını kullanıcıya ulaştırır.
//
// Üretimde Next.js, sunucu işleminde fırlatılan hatanın mesajını güvenlik
// gereği gizler; kullanıcı yalnızca genel hata ekranını görüyordu ve
// "Tahsilat açık cari bakiyesini aşamaz" gibi Türkçe açıklamalar hiç
// ulaşmıyordu. Bu yardımcı hatayı yakalar, mesajı kısa ömürlü bir çereze
// yazar ve kullanıcıyı bulunduğu sayfada bırakır; panel bu mesajı bildirim
// olarak gösterir (app/panel/flash-toast.tsx). Mesaj URL'ye yazılmadığı için
// dışarıdan sahte mesaj enjekte edilemez.
//
// Next'in kontrol akışı sinyalleri (redirect, notFound…) "digest" taşır;
// onlara dokunulmaz, aynen yeniden fırlatılır.

export const FLASH_COOKIE = "arvo_flash";

function isControlFlowSignal(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string",
  );
}

export async function runPanelAction<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action();
  } catch (error) {
    if (isControlFlowSignal(error)) throw error;
    console.error("[panel-action]", error);
    const message = error instanceof Error && error.message
      ? error.message
      : "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
    (await cookies()).set(FLASH_COOKIE, encodeURIComponent(message.slice(0, 400)), {
      path: "/",
      maxAge: 60,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return undefined;
  }
}
