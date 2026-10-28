"use server";

// Site demo / iletişim formu. Yalnızca async fonksiyon dışa aktarılır
// (tip yeniden dışa aktarımı bu dosyada modülü çökertir; tipler
// lead-types.ts'de).
//
// Katmanlar (RPC'den önce): bal küpü alanı, imzalı form süresi
// (3 sn – 2 saat), mesajda en fazla 3 bağlantı, alan doğrulaması.
// Veritabanı tarafı (submit_site_lead): IP özeti başına / site geneli hız
// sınırı, 10 dk tekrar engeli, KVKK onayı ve biçim doğrulaması.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { COMPANY, LOCALES, type Locale } from "@/lib/site/routes";
import {
  LEAD_EMAIL_PATTERN,
  LEAD_INTERESTS,
  LEAD_LIMITS,
  LEAD_PHONE_PATTERN,
  countUrls,
  type LeadField,
  type LeadInterest,
  type LeadResult,
} from "./lead-types";

const MIN_AGE_MS = 3_000;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

// Form imzasının ve günlük IP özetinin tuzu.
//
// SITE_LEAD_SALT canlıda tanımlanmalı. Tanımlı değilse eskiden kod içindeki
// sabit bir değere düşülüyordu: imza herkesçe üretilebildiği için bot 3
// saniyelik bekleme ve tekrar oynatma engelini atlayabiliyor, dahası aynı
// sabit clientIpHash'in tuzu olduğu için IP özetleri kaba kuvvetle geri
// çözülebiliyordu (adres alanı küçük, tuz bilinince özet anonim değildir).
//
// Bunun yerine sunucuya özel, üretimde zaten zorunlu olan Supabase gizli
// anahtarından türetilir: tahmin edilemez, süreçler ve dağıtımlar arasında
// aynı kalır (imza bir örnekte üretilip başka örnekte doğrulanabilir) ve
// eksik yapılandırma formu düşürmez. Anahtar döndürülürse açıktaki imzalar
// geçersizleşir; submitLead bu durumda yeni jeton verip kullanıcıdan tekrar
// göndermesini ister. İkisi de yoksa (yerel geliştirme) sabit değere düşer.
const FALLBACK_SALT = "arvo-site-lead-v1";
const derivedSecret = (() => {
  const serverKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serverKey) return FALLBACK_SALT;
  return createHash("sha256").update(`lead-form-salt|${serverKey}`).digest("base64url");
})();

const secret = () => process.env.SITE_LEAD_SALT || derivedSecret;

const sign = (value: string) => createHmac("sha256", secret()).update(`lead-form|${value}`).digest("base64url");

const copy = {
  tr: {
    generic: `Talebiniz şu anda gönderilemedi. Lütfen tekrar deneyin ya da ${COMPANY.email} adresine yazın.`,
    tooFast: "Lütfen formu kontrol edip birkaç saniye sonra tekrar gönderin.",
    expired: "Güvenlik süresi doldu. Lütfen formu yeniden gönderin.",
    tooManyUrls: "Mesajınızda çok fazla bağlantı var. Lütfen en fazla 3 bağlantı kullanın.",
    rateLimited: `Kısa sürede çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin ya da ${COMPANY.email} adresine yazın.`,
    notConfigured: `Form şu anda talep kabul etmiyor. Lütfen ${COMPANY.email} adresine yazın.`,
    consent: "Devam etmek için Aydınlatma Metni'ni onaylayın.",
    name: "Lütfen adınızı ve soyadınızı yazın.",
    email: "Geçerli bir e-posta adresi yazın.",
    phone: "Geçerli bir telefon numarası yazın.",
    contact: "E-posta veya telefon bilgilerinden en az birini yazın.",
    company: "Şirket adı en fazla 160 karakter olabilir.",
    message: "Mesajınız en fazla 2000 karakter olabilir.",
    interest: "Lütfen bir konu seçin.",
  },
  en: {
    generic: `We couldn't send your request right now. Please try again or email ${COMPANY.email}.`,
    tooFast: "Please review the form and submit again in a few seconds.",
    expired: "The security window has expired. Please submit the form again.",
    tooManyUrls: "Your message contains too many links. Please use at most 3.",
    rateLimited: `Too many attempts in a short time. Please try again later or email ${COMPANY.email}.`,
    notConfigured: `The form isn't accepting requests right now. Please email ${COMPANY.email}.`,
    consent: "Please confirm that you have read the Privacy Notice.",
    name: "Please enter your full name.",
    email: "Please enter a valid email address.",
    phone: "Please enter a valid phone number.",
    contact: "Please enter an email address or a phone number.",
    company: "Company name can be at most 160 characters.",
    message: "Your message can be at most 2000 characters.",
    interest: "Please choose a topic.",
  },
  de: {
    generic: `Ihre Anfrage konnte gerade nicht gesendet werden. Bitte versuchen Sie es erneut oder schreiben Sie an ${COMPANY.email}.`,
    tooFast: "Bitte prüfen Sie das Formular und senden Sie es in einigen Sekunden erneut.",
    expired: "Das Sicherheitszeitfenster ist abgelaufen. Bitte senden Sie das Formular erneut.",
    tooManyUrls: "Ihre Nachricht enthält zu viele Links. Bitte verwenden Sie höchstens 3.",
    rateLimited: `Zu viele Versuche in kurzer Zeit. Bitte versuchen Sie es später erneut oder schreiben Sie an ${COMPANY.email}.`,
    notConfigured: `Das Formular nimmt derzeit keine Anfragen an. Bitte schreiben Sie an ${COMPANY.email}.`,
    consent: "Bitte bestätigen Sie, dass Sie die Datenschutzhinweise gelesen haben.",
    name: "Bitte geben Sie Ihren vollständigen Namen ein.",
    email: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
    phone: "Bitte geben Sie eine gültige Telefonnummer ein.",
    contact: "Bitte geben Sie eine E-Mail-Adresse oder eine Telefonnummer ein.",
    company: "Der Firmenname darf höchstens 160 Zeichen lang sein.",
    message: "Ihre Nachricht darf höchstens 2000 Zeichen lang sein.",
    interest: "Bitte wählen Sie ein Thema.",
  },
  es: {
    generic: `No hemos podido enviar su solicitud en este momento. Inténtelo de nuevo o escriba a ${COMPANY.email}.`,
    tooFast: "Revise el formulario y vuelva a enviarlo en unos segundos.",
    expired: "El plazo de seguridad ha caducado. Vuelva a enviar el formulario.",
    tooManyUrls: "Su mensaje contiene demasiados enlaces. Use como máximo 3.",
    rateLimited: `Demasiados intentos en poco tiempo. Inténtelo más tarde o escriba a ${COMPANY.email}.`,
    notConfigured: `El formulario no acepta solicitudes en este momento. Escriba a ${COMPANY.email}.`,
    consent: "Confirme que ha leído el Aviso de privacidad.",
    name: "Introduzca su nombre completo.",
    email: "Introduzca una dirección de correo electrónico válida.",
    phone: "Introduzca un número de teléfono válido.",
    contact: "Introduzca un correo electrónico o un número de teléfono.",
    company: "El nombre de la empresa puede tener como máximo 160 caracteres.",
    message: "Su mensaje puede tener como máximo 2000 caracteres.",
    interest: "Elija un tema.",
  },
  fr: {
    generic: `Votre demande n’a pas pu être envoyée pour le moment. Veuillez réessayer ou écrire à ${COMPANY.email}.`,
    tooFast: "Veuillez vérifier le formulaire et le renvoyer dans quelques secondes.",
    expired: "Le délai de sécurité a expiré. Veuillez renvoyer le formulaire.",
    tooManyUrls: "Votre message contient trop de liens. Veuillez en utiliser 3 au maximum.",
    rateLimited: `Trop de tentatives en peu de temps. Veuillez réessayer plus tard ou écrire à ${COMPANY.email}.`,
    notConfigured: `Le formulaire n’accepte pas de demandes pour le moment. Veuillez écrire à ${COMPANY.email}.`,
    consent: "Veuillez confirmer que vous avez lu la Politique de confidentialité.",
    name: "Veuillez saisir votre nom complet.",
    email: "Veuillez saisir une adresse e-mail valide.",
    phone: "Veuillez saisir un numéro de téléphone valide.",
    contact: "Veuillez saisir une adresse e-mail ou un numéro de téléphone.",
    company: "Le nom de l’entreprise ne peut pas dépasser 160 caractères.",
    message: "Votre message ne peut pas dépasser 2000 caractères.",
    interest: "Veuillez choisir un sujet.",
  },
} as const;

type Copy = (typeof copy)[Locale];

const fieldForCode: Record<string, { field?: LeadField; key: keyof Copy }> = {
  consent_required: { field: "consent", key: "consent" },
  invalid_name: { field: "name", key: "name" },
  invalid_email: { field: "email", key: "email" },
  invalid_phone: { field: "phone", key: "phone" },
  contact_required: { field: "email", key: "contact" },
  invalid_company: { field: "company", key: "company" },
  invalid_message: { field: "message", key: "message" },
  invalid_interest: { field: "interest", key: "interest" },
  rate_limited: { key: "rateLimited" },
  not_configured: { key: "notConfigured" },
};

const value = (formData: FormData, key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max);

/** Form açıldığında istenir: imzalı zaman damgası (bot / tekrar oynatma engeli). */
export async function issueLeadToken(): Promise<string> {
  const issuedAt = String(Date.now());
  return `${issuedAt}.${sign(issuedAt)}`;
}

function checkToken(token: string): "ok" | "fast" | "expired" | "invalid" {
  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature || !/^\d{13}$/.test(issuedAt)) return "invalid";
  const expected = Buffer.from(sign(issuedAt));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  const age = Date.now() - Number(issuedAt);
  if (age < MIN_AGE_MS) return "fast";
  if (age > MAX_AGE_MS) return "expired";
  return "ok";
}

async function clientIpHash() {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown";
  // Günlük tuz: ham IP saklanmaz, özet ertesi gün başka bir değere döner.
  // dilim-tamam: günlük TUZ; hangi saatte döndüğü önemli değil, yalnızca
  // günde bir kez değişmesi gerekiyor. Gösterilen ya da kaydedilen bir gün değil.
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${day}|${secret()}`).digest("hex");
}

export async function submitLead(formData: FormData): Promise<LeadResult> {
  // Bilinmeyen dil Türkçe sayılır (eski davranış); veritabanı da aynı
  // listeyi tanıyor (20261028083410).
  const istenen = String(formData.get("locale") ?? "");
  const locale: Locale = (LOCALES as readonly string[]).includes(istenen) ? (istenen as Locale) : "tr";
  const t = copy[locale];
  const fail = (key: keyof Copy, field?: LeadField, token?: string): LeadResult => ({ ok: false, error: t[key], field, token });

  // 1) Bal küpü: insanlar görmez, botlar doldurur.
  if (value(formData, "arvo_hp", 200) !== "") return fail("generic");

  // 2) İmzalı form süresi
  const tokenState = checkToken(value(formData, "form_token", 200));
  if (tokenState === "invalid") return fail("generic", undefined, await issueLeadToken());
  if (tokenState === "fast") return fail("tooFast");
  if (tokenState === "expired") return fail("expired", undefined, await issueLeadToken());

  const name = value(formData, "name", 400).replace(/\s+/g, " ");
  const email = value(formData, "email", 400);
  const phone = value(formData, "phone", 100);
  const company = value(formData, "company", 400);
  const message = value(formData, "message", 5000);
  const interestRaw = value(formData, "interest", 20);
  const page = value(formData, "page", 300);
  const consent = formData.get("consent") === "on" || formData.get("consent") === "true";

  // 3) Alan doğrulaması (veritabanıyla aynı kurallar; kullanıcıya alan bazında dönüş)
  if (!(LEAD_INTERESTS as readonly string[]).includes(interestRaw)) return fail("interest", "interest");
  const interest = interestRaw as LeadInterest;
  if (name.length < LEAD_LIMITS.nameMin || name.length > LEAD_LIMITS.nameMax) return fail("name", "name");
  if (!email && !phone) return fail("contact", "email");
  if (email && (email.length > LEAD_LIMITS.emailMax || !LEAD_EMAIL_PATTERN.test(email))) return fail("email", "email");
  const phoneDigits = phone.replace(/\D/g, "").length;
  if (phone && (!LEAD_PHONE_PATTERN.test(phone) || phoneDigits < LEAD_LIMITS.phoneDigitsMin || phoneDigits > LEAD_LIMITS.phoneDigitsMax))
    return fail("phone", "phone");
  if (company.length > LEAD_LIMITS.companyMax) return fail("company", "company");
  if (message.length > LEAD_LIMITS.messageMax) return fail("message", "message");
  if (countUrls(message) > LEAD_LIMITS.maxUrls) return fail("tooManyUrls", "message");
  if (!consent) return fail("consent", "consent");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_site_lead", {
    p_name: name,
    p_email: email,
    p_phone: phone,
    p_company: company,
    p_interest: interest,
    p_message: message,
    p_locale: locale,
    p_page: page,
    p_ip_hash: await clientIpHash(),
    p_consent: consent,
  });

  if (error) {
    console.error("submit_site_lead başarısız:", error.message);
    return fail("generic");
  }
  const result = (data ?? {}) as { ok?: boolean; code?: string; reference?: string };
  if (result.ok && result.reference) return { ok: true, reference: result.reference };

  const mapped = fieldForCode[result.code ?? ""];
  if (!mapped) {
    console.error("submit_site_lead beklenmeyen yanıt:", result.code);
    return fail("generic");
  }
  return fail(mapped.key, mapped.field);
}
