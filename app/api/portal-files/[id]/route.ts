import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Müşteri portalı dosyası indirme (herkese açık, giriş yok).
//
// Kapı veritabanındadır: authorize_customer_portal_file_download yalnızca
// service_role'e açıktır ve takip kodu ↔ dosya eşleşmesini, silinmemiş
// olmayı, "ödeme tamamlanınca açılır" kilidini ve hız sınırını denetleyip
// her denemeyi günlüğe yazar. Depolama yolu yalnızca "ok" sonucunda döner;
// burada 60 saniyelik, "attachment" olarak inen imzalı URL'ye çevrilir.
// Kova herkese kapalıdır (anon politikası yok), kalıcı/tahmin edilebilir
// bir bağlantı yoktur.
//
// Takip kodu adres çubuğuna yazılmasın diye yalnızca POST kabul edilir:
//  - fetch + JSON { code }  → { url } | { error } (takip ekranı)
//  - form gönderimi (JS'siz) → 303 imzalı URL'ye / sade hata sayfası

const BUCKET = "customer-portal-files";
const SIGNED_URL_TTL_SECONDS = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES = {
  invalid: "Geçersiz istek.",
  not_found: "Dosya bulunamadı ya da artık paylaşılmıyor. Takip kodunuzu kontrol edin.",
  locked: "Dosyanız hazır. Kalan ödemeniz tamamlandığında indirilebilir olacak.",
  rate_limited: "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.",
  unavailable: "Dosya indirme şu an kullanılamıyor. Lütfen operasyon ekibine mesaj yazın.",
  failed: "Dosya bağlantısı oluşturulamadı. Lütfen tekrar deneyin.",
} as const;

type Outcome = "ok" | "locked" | "not_found" | "rate_limited";
type AuthorizeRow = { outcome: Outcome; storage_path: string | null; file_name: string | null; mime_type: string | null };

const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Sunucuya özel anahtar: yeni biçim (sb_secret_…) ya da eski service_role.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const firstIp = (value: string | null) => value?.split(",")[0]?.trim() || null;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function htmlError(message: string, status: number) {
  const body = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dosya</title></head><body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#f2f2f7;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif;color:#0b1b2e"><main style="max-width:420px;margin:24px;padding:28px;border-radius:20px;background:#fff;box-shadow:0 10px 28px rgba(11,27,46,.08)"><h1 style="margin:0 0 8px;font-size:20px">Dosya açılamadı</h1><p style="margin:0 0 18px;color:#6e6e73">${escapeHtml(message)}</p><a href="/takip" style="color:#2c4368;font-weight:600">Takip ekranına dön</a></main></body></html>`;
  return new NextResponse(body, { status, headers: { ...noStore, "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isForm = (request.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded");
  const fail = (key: keyof typeof MESSAGES, status: number) =>
    isForm ? htmlError(MESSAGES[key], status) : NextResponse.json({ error: MESSAGES[key], reason: key }, { status, headers: noStore });

  let rawCode = "";
  try {
    if (isForm) rawCode = String((await request.formData()).get("tracking_code") ?? "");
    else rawCode = String(((await request.json()) as { code?: unknown }).code ?? "");
  } catch {
    return fail("invalid", 400);
  }
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
  if (!UUID.test(id) || code.length < 6) return fail("invalid", 400);

  const supabase = serviceClient();
  if (!supabase) {
    console.error("[portal-files] SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY tanımlı değil; müşteri indirmesi kapalı.");
    return fail("unavailable", 503);
  }

  const headers = request.headers;
  const clientIp = firstIp(headers.get("x-forwarded-for")) || headers.get("x-real-ip") || headers.get("cf-connecting-ip") || null;
  const { data, error } = await supabase.rpc("authorize_customer_portal_file_download", {
    p_tracking_code: code,
    p_file_id: id,
    p_client_ip: clientIp,
    p_user_agent: headers.get("user-agent")?.slice(0, 500) ?? null,
  });
  if (error) {
    console.error("[portal-files] authorize failed", error.message);
    return fail("failed", 500);
  }
  const row = (Array.isArray(data) ? data[0] : data) as AuthorizeRow | undefined;
  if (!row || row.outcome === "not_found") return fail("not_found", 404);
  if (row.outcome === "locked") return fail("locked", 403);
  if (row.outcome === "rate_limited") return fail("rate_limited", 429);
  if (row.outcome !== "ok" || !row.storage_path) return fail("failed", 500);

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, { download: row.file_name || true });
  if (signError || !signed?.signedUrl) {
    console.error("[portal-files] sign failed", signError?.message);
    return fail("failed", 500);
  }

  if (isForm) return NextResponse.redirect(signed.signedUrl, { status: 303, headers: noStore });
  return NextResponse.json({ url: signed.signedUrl }, { headers: noStore });
}
