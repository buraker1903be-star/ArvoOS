// Demo / iletişim formunun ortak tipleri ve sabitleri. "use server" dosyası
// (lead-actions.ts) yalnızca async fonksiyon dışa aktarabildiği için
// tipler burada durur.

export const LEAD_INTERESTS = ["arvoos", "arvolab", "arc", "services", "other"] as const;
export type LeadInterest = (typeof LEAD_INTERESTS)[number];

export type LeadField = "interest" | "name" | "email" | "phone" | "company" | "message" | "consent";

export type LeadResult =
  | { ok: true; reference: string }
  | { ok: false; error: string; field?: LeadField; token?: string };

export const LEAD_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  emailMax: 200,
  phoneDigitsMin: 7,
  phoneDigitsMax: 20,
  companyMax: 160,
  messageMax: 2000,
  maxUrls: 3,
} as const;

export const LEAD_EMAIL_PATTERN = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
export const LEAD_PHONE_PATTERN = /^[0-9 +().-]+$/;

export const countUrls = (text: string) => (text.match(/(https?:\/\/|www\.)\S+/gi) ?? []).length;
