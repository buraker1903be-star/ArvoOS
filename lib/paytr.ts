import { createHmac, timingSafeEqual } from "node:crypto";

// PayTR "Link ile Ödeme" API istemcisi.
// Kaynak: dev.paytr.com/link-api (create, delete, callback) ve resmi
// PayTR_Link_API örnekleri (PHP/Python/.NET/Node). Token ve hash formülleri
// oradaki sırayla birebir uygulanır; sıra değişirse PayTR isteği reddeder.
//
// Taksit bağlantısı kararları (kurum sahibiyle netleştirildi):
//  - tek çekim: max_installment=1 (tutar taksit tutarıyla birebir)
//  - tek kullanımlık: link_type=product, min_count=1, max_count=1
//  - geçerlilik: vadeden 30 gün sonra (vade geçmişse bugünden 30 gün)

export type PaytrCredentials = { merchantId: string; merchantKey: string; merchantSalt: string };

const CREATE_URL = "https://www.paytr.com/odeme/api/link/create";
const DELETE_URL = "https://www.paytr.com/odeme/api/link/delete";
const TIMEOUT_MS = 15000;

/** base64(HMAC_SHA256(key = merchant_key, message)) — PayTR'nin tüm token/hash'leri. */
function sign(merchantKey: string, message: string) {
  return createHmac("sha256", merchantKey).update(message, "utf8").digest("base64");
}

async function post(url: string, fields: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`PayTR beklenmeyen yanıt verdi (HTTP ${response.status}).`);
  }
}

const reasonOf = (body: Record<string, unknown>) => String(body.reason ?? body.err_msg ?? "bilinmeyen hata");

/** "YYYY-MM-DD HH:MM:SS" (Türkiye saati) — PayTR expiry_date biçimi. */
export function paytrExpiry(dueDate: string | null, now = new Date()): string {
  const day = 86400000;
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(now);
  const base = dueDate && dueDate > todayKey ? Date.parse(`${dueDate}T12:00:00Z`) : Date.parse(`${todayKey}T12:00:00Z`);
  const expiryKey = new Date(base + 30 * day).toISOString().slice(0, 10);
  return `${expiryKey} 23:59:00`;
}

/** Tek taksit için tek kullanımlık, tek çekim ödeme bağlantısı oluşturur. */
export async function createPaytrInstallmentLink(credentials: PaytrCredentials, input: {
  name: string;          // 4–200 karakter
  amountKurus: number;   // tutar × 100 (PayTR "price")
  expiry: string;        // paytrExpiry() biçimi
  callbackUrl: string;   // https://…/api/paytr/callback
  callbackId: string;    // alfanümerik, en fazla 64
}): Promise<{ id: string; url: string }> {
  const name = input.name.trim().slice(0, 200).padEnd(4, ".");
  const price = String(Math.round(input.amountKurus));
  const fields = {
    merchant_id: credentials.merchantId,
    name,
    price,
    currency: "TL",
    max_installment: "1",
    link_type: "product",
    lang: "tr",
    min_count: "1",
    max_count: "1",
    expiry_date: input.expiry,
    callback_link: input.callbackUrl,
    callback_id: input.callbackId,
    debug_on: "1",
  };
  // Token: name + price + currency + max_installment + link_type + lang + min_count (product) + salt
  const required = fields.name + fields.price + fields.currency + fields.max_installment + fields.link_type + fields.lang + fields.min_count;
  const body = await post(CREATE_URL, { ...fields, paytr_token: sign(credentials.merchantKey, required + credentials.merchantSalt) });
  if (body.status !== "success" || typeof body.link !== "string" || typeof body.id !== "string") {
    throw new Error(`PayTR bağlantı oluşturamadı: ${reasonOf(body)}`);
  }
  return { id: body.id, url: body.link };
}

/** Bağlantıyı PayTR'de kapatır (ödendi / iptal). Token: id + merchant_id + salt. */
export async function deletePaytrLink(credentials: PaytrCredentials, linkId: string): Promise<void> {
  const body = await post(DELETE_URL, {
    merchant_id: credentials.merchantId,
    id: linkId,
    debug_on: "1",
    paytr_token: sign(credentials.merchantKey, linkId + credentials.merchantId + credentials.merchantSalt),
  });
  if (body.status !== "success") throw new Error(`PayTR bağlantıyı kapatamadı: ${reasonOf(body)}`);
}

/**
 * Bildirim (callback) doğrulaması.
 * hash = base64(HMAC_SHA256(merchant_key, callback_id + merchant_oid + merchant_salt + status + total_amount))
 */
export function verifyPaytrCallback(credentials: PaytrCredentials, fields: {
  callback_id: string; merchant_oid: string; status: string; total_amount: string; hash: string;
}): boolean {
  const expected = Buffer.from(sign(credentials.merchantKey, fields.callback_id + fields.merchant_oid + credentials.merchantSalt + fields.status + fields.total_amount));
  const received = Buffer.from(fields.hash);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** UUID ↔ PayTR callback_id (yalnızca harf/rakam kabul ediyor: tireler atılır). */
export const toCallbackId = (uuid: string) => uuid.replaceAll("-", "");
export const fromCallbackId = (value: string) =>
  /^[0-9a-f]{32}$/i.test(value) ? `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`.toLowerCase() : null;
