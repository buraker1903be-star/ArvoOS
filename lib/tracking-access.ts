import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { firstForwardedIp } from "@/app/_components/request-origin";

/**
 * Takip kodu ile çalışan müşteri akışlarının tek giriş kapısı.
 *
 * Takip kodu 6 karakter (32^6 ≈ 1,07 milyar). Tek bir kodu tahmin etmek zor
 * ama saldırgan HERHANGİ bir geçerli kodu arıyor; arama uzayı açık sözleşme
 * sayısına bölünüyor ve deneme sayısı sınırsızken geçerli bir koda saatler
 * içinde düşülebiliyordu. Geçerli kod finansal bilgiyi, paylaşım
 * belirteçlerini ve teklifi reddetme yetkisini açıyor.
 *
 * Fonksiyonlar eskiden anon'a açıktı; anon anahtarı tarayıcı paketinde
 * herkese açık olduğu için saldırgan sunucuyu atlayıp doğrudan PostgREST'e
 * gidebiliyor, IP'yi de kendi yazdığı için IP sınırı anlamsız kalıyordu.
 * 20260917100000 ile anon izni kaldırıldı: tek kapı burası, IP'yi istekten
 * biz okuyoruz ve uydurulamıyor.
 *
 * Sayaç yalnızca SONUÇSUZ denemeleri sayar; geçerli koduyla dönen müşteri
 * (takip sayfası mesajları 20 sn'de bir yeniliyor) sınıra takılmaz. Kodun
 * geçerli olup olmadığına kapının kendisi karar verir, çağıran taraf değil:
 * bazı uçlar geçersiz kodda da hatasız boş sonuç dönüyor, sonuç çağırana
 * bırakılsaydı saldırgan o uçtan sayacı atlatırdı.
 */
export const TRACKING_RATE_LIMIT_MESSAGE =
  "Çok fazla sorgulama yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.";

export const TRACKING_UNAVAILABLE_MESSAGE =
  "Takip sorgulaması şu anda kullanılamıyor, lütfen daha sonra tekrar deneyin.";

export type TrackingAccess =
  | { ok: true; supabase: SupabaseClient; codeExists: boolean }
  | { ok: false; reason: "rate_limited" | "unavailable" };

async function clientIp() {
  const requestHeaders = await headers();
  return (
    firstForwardedIp(requestHeaders.get("x-forwarded-for")) ||
    requestHeaders.get("x-real-ip") ||
    requestHeaders.get("cf-connecting-ip") ||
    null
  );
}

/**
 * Takip koduyla veri okuyan HER işlemin başında çağrılır: denemeyi kaydeder
 * ve sınır aşıldıysa erişimi reddeder.
 */
export async function openTrackingAccess(code: string): Promise<TrackingAccess> {
  const supabase = createAdminClient();
  if (!supabase) {
    // Sessizce boş sonuç döndürmek müşteriye "sözleşme bulunamadı" dedirtir
    // ve kimse fark etmez. Gürültülü başarısız oluyoruz.
    console.error("[takip] SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY tanımlı değil; takip sorgulaması kapalı.");
    return { ok: false, reason: "unavailable" };
  }
  const { data, error } = await supabase.rpc("arvo_tracking_guard", {
    p_client_ip: await clientIp(),
    p_code: code,
  });
  if (error) {
    console.error("[takip] sorgulama sınırı denetlenemedi", { code: error.code, message: error.message });
    return { ok: false, reason: "unavailable" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; code_exists?: boolean } | null;
  if (!row?.allowed) return { ok: false, reason: "rate_limited" };
  return { ok: true, supabase, codeExists: row.code_exists === true };
}

export function trackingAccessMessage(reason: "rate_limited" | "unavailable") {
  return reason === "rate_limited" ? TRACKING_RATE_LIMIT_MESSAGE : TRACKING_UNAVAILABLE_MESSAGE;
}
