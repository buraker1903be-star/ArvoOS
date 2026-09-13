"use client";

// arvo-os.com demo / iletişim formu. Gönderim platform sahibinin
// panelinde yeni talep olur (app/_site/lead-actions.ts → submit_site_lead).
// Tema: .lead-form üzerindeki --site-* değişkenleri; koyu zemin için
// theme="dark" veya üst öğede data-theme="dark".

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { ROUTES, COMPANY, type Locale } from "@/lib/site/routes";
import { issueLeadToken, submitLead } from "./lead-actions";
import {
  LEAD_EMAIL_PATTERN,
  LEAD_LIMITS,
  LEAD_PHONE_PATTERN,
  countUrls,
  type LeadField,
  type LeadInterest,
} from "./lead-types";
import "./lead-form.css";

type Errors = Partial<Record<LeadField, string>>;

const copy = {
  tr: {
    interestLegend: "Konu",
    interests: { arvoos: "ArvoOS", arvolab: "ArvoLab", arc: "Arc", services: "Hizmetler", other: "Diğer" } as Record<LeadInterest, string>,
    name: "Ad soyad",
    email: "E-posta",
    phone: "Telefon",
    company: "Şirket",
    message: "Mesajınız",
    optional: "isteğe bağlı",
    messagePlaceholder: {
      arvoos: "Ekibiniz, sektörünüz ve ArvoOS'ta görmek istediğiniz modüller…",
      arvolab: "ArvoLab'ı hangi amaçla kullanmak istiyorsunuz?",
      arc: "Arc hakkında merak ettikleriniz…",
      services: "Projenizi kısaca anlatın: web sitesi, özel yazılım, süreç tasarımı…",
      other: "Size nasıl yardımcı olabiliriz?",
    } as Record<LeadInterest, string>,
    consentBefore: "Kişisel verilerimin talebimin yanıtlanması amacıyla işlenmesine ilişkin ",
    consentLink: "Aydınlatma Metni",
    consentAfter: "'ni okudum.",
    submit: { arvoos: "Demo talep et", arvolab: "Talep gönder", arc: "Talep gönder", services: "Projeyi gönder", other: "Mesaj gönder" } as Record<LeadInterest, string>,
    sending: "Gönderiliyor…",
    note: "Bilgileriniz yalnızca talebinizi yanıtlamak için kullanılır.",
    successTitle: "Talebinizi aldık",
    successBody: "Ekibimiz en kısa sürede sizinle iletişime geçecek.",
    reference: "Referans kodu",
    again: "Yeni bir talep gönder",
    errors: {
      name: "Lütfen adınızı ve soyadınızı yazın.",
      email: "Geçerli bir e-posta adresi yazın.",
      phone: "Geçerli bir telefon numarası yazın.",
      contact: "E-posta veya telefon bilgilerinden en az birini yazın.",
      company: "Şirket adı en fazla 160 karakter olabilir.",
      message: "Mesajınız en fazla 2000 karakter olabilir.",
      urls: "Mesajınızda en fazla 3 bağlantı olabilir.",
      consent: "Devam etmek için Aydınlatma Metni'ni onaylayın.",
      summary: "Lütfen işaretli alanları kontrol edin.",
      network: `Bağlantı kurulamadı. Lütfen tekrar deneyin ya da ${COMPANY.email} adresine yazın.`,
    },
  },
  en: {
    interestLegend: "Topic",
    interests: { arvoos: "ArvoOS", arvolab: "ArvoLab", arc: "Arc", services: "Services", other: "Other" } as Record<LeadInterest, string>,
    name: "Full name",
    email: "Email",
    phone: "Phone",
    company: "Company",
    message: "Your message",
    optional: "optional",
    messagePlaceholder: {
      arvoos: "Your team, industry and the ArvoOS modules you'd like to see…",
      arvolab: "What would you like to use ArvoLab for?",
      arc: "What would you like to know about Arc?",
      services: "Tell us about your project: website, custom software, process design…",
      other: "How can we help?",
    } as Record<LeadInterest, string>,
    consentBefore: "I have read the ",
    consentLink: "Privacy Notice",
    consentAfter: " on the processing of my personal data to respond to my request.",
    submit: { arvoos: "Request a demo", arvolab: "Send request", arc: "Send request", services: "Send project", other: "Send message" } as Record<LeadInterest, string>,
    sending: "Sending…",
    note: "Your details are used only to respond to your request.",
    successTitle: "We've received your request",
    successBody: "Our team will get back to you as soon as possible.",
    reference: "Reference code",
    again: "Send another request",
    errors: {
      name: "Please enter your full name.",
      email: "Please enter a valid email address.",
      phone: "Please enter a valid phone number.",
      contact: "Please enter an email address or a phone number.",
      company: "Company name can be at most 160 characters.",
      message: "Your message can be at most 2000 characters.",
      urls: "Your message can contain at most 3 links.",
      consent: "Please confirm that you have read the Privacy Notice.",
      summary: "Please check the highlighted fields.",
      network: `We couldn't connect. Please try again or email ${COMPANY.email}.`,
    },
  },
} as const;

const INTEREST_ORDER: LeadInterest[] = ["arvoos", "arvolab", "arc", "services", "other"];
const FIELD_ORDER: LeadField[] = ["interest", "name", "email", "phone", "company", "message", "consent"];

type Values = { name: string; email: string; phone: string; company: string; message: string; consent: boolean };
const EMPTY: Values = { name: "", email: "", phone: "", company: "", message: "", consent: false };

function validate(values: Values, t: (typeof copy)[Locale]): Errors {
  const errors: Errors = {};
  const name = values.name.trim().replace(/\s+/g, " ");
  const email = values.email.trim();
  const phone = values.phone.trim();
  if (name.length < LEAD_LIMITS.nameMin || name.length > LEAD_LIMITS.nameMax) errors.name = t.errors.name;
  if (!email && !phone) errors.email = t.errors.contact;
  else if (email && (email.length > LEAD_LIMITS.emailMax || !LEAD_EMAIL_PATTERN.test(email))) errors.email = t.errors.email;
  const digits = phone.replace(/\D/g, "").length;
  if (phone && (!LEAD_PHONE_PATTERN.test(phone) || digits < LEAD_LIMITS.phoneDigitsMin || digits > LEAD_LIMITS.phoneDigitsMax))
    errors.phone = t.errors.phone;
  if (values.company.trim().length > LEAD_LIMITS.companyMax) errors.company = t.errors.company;
  if (values.message.trim().length > LEAD_LIMITS.messageMax) errors.message = t.errors.message;
  else if (countUrls(values.message) > LEAD_LIMITS.maxUrls) errors.message = t.errors.urls;
  if (!values.consent) errors.consent = t.errors.consent;
  return errors;
}

export function LeadForm({
  locale,
  defaultInterest = "arvoos",
  compact = false,
  theme,
}: {
  locale: Locale;
  defaultInterest?: LeadInterest;
  compact?: boolean;
  /** Koyu zemin için "dark". Verilmezse üst öğedeki data-theme kullanılır. */
  theme?: "light" | "dark";
}) {
  const t = copy[locale];
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);

  const [interest, setInterest] = useState<LeadInterest>(defaultInterest);
  const [values, setValues] = useState<Values>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<LeadField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverField, setServerField] = useState<{ field: LeadField; message: string } | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [pending, startTransition] = useTransition();
  // Odak, ilgili öğe DOM'a işlendikten sonra taşınır (geçiş içindeki
  // requestAnimationFrame bazen uyarı henüz çizilmeden çalışıyordu).
  const [focusRequest, setFocusRequest] = useState<{ target: "alert" | "success" | LeadField; seq: number } | null>(null);
  const requestFocus = (target: "alert" | "success" | LeadField) => setFocusRequest((current) => ({ target, seq: (current?.seq ?? 0) + 1 }));

  useEffect(() => {
    if (!focusRequest) return;
    const { target } = focusRequest;
    if (target === "alert") alertRef.current?.focus();
    else if (target === "success") successRef.current?.focus();
    else {
      const form = formRef.current;
      const element =
        target === "interest"
          ? form?.querySelector<HTMLInputElement>('input[name="interest"]:checked')
          : form?.querySelector<HTMLElement>(`[name="${target}"]`);
      element?.focus();
    }
  }, [focusRequest]);

  // Form açıldığında imzalı zaman damgası alınır (bot / hızlı gönderim engeli).
  useEffect(() => {
    let alive = true;
    issueLeadToken()
      .then((value) => alive && setToken(value))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const clientErrors = validate(values, t);
  const visibleError = (field: LeadField) => {
    if (serverField?.field === field) return serverField.message;
    return submitted || touched[field] ? clientErrors[field] : undefined;
  };

  const update = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (serverField && (serverField.field === key || (key === "phone" && serverField.field === "email"))) setServerField(null);
  };
  const blur = (field: LeadField) => setTouched((current) => ({ ...current, [field]: true }));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setSubmitted(true);
    setServerError(null);
    setServerField(null);
    const errors = validate(values, t);
    const firstInvalid = FIELD_ORDER.find((field) => errors[field]);
    if (firstInvalid) {
      requestFocus(firstInvalid);
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("interest", interest);
    formData.set("locale", locale);
    formData.set("page", typeof window === "undefined" ? "" : window.location.pathname);
    formData.set("form_token", token);
    formData.set("consent", values.consent ? "on" : "");
    startTransition(async () => {
      try {
        const result = await submitLead(formData);
        if (result.ok) {
          setReference(result.reference);
          requestFocus("success");
          return;
        }
        if (result.token) setToken(result.token);
        if (result.field) {
          setServerField({ field: result.field, message: result.error });
          requestFocus(result.field);
        } else {
          setServerError(result.error);
          requestFocus("alert");
        }
      } catch {
        setServerError(t.errors.network);
        requestFocus("alert");
      }
    });
  };

  const reset = () => {
    setValues(EMPTY);
    setTouched({});
    setSubmitted(false);
    setServerError(null);
    setServerField(null);
    setReference(null);
    issueLeadToken().then(setToken).catch(() => undefined);
    requestFocus("name");
  };

  const className = `lead-form${compact ? " lead-form--compact" : ""}`;

  if (reference) {
    return (
      <div className={className} data-theme={theme}>
        <div className="lead-form__success" role="status" aria-live="polite">
          <svg className="lead-form__check" viewBox="0 0 52 52" aria-hidden="true">
            <circle className="lead-form__check-circle" cx="26" cy="26" r="24" fill="none" />
            <path className="lead-form__check-mark" fill="none" d="M15 27.5l7.2 7.2L37.5 19" />
          </svg>
          <h3 ref={successRef} tabIndex={-1} className="lead-form__success-title">
            {t.successTitle}
          </h3>
          <p className="lead-form__success-body">{t.successBody}</p>
          <p className="lead-form__reference">
            <span>{t.reference}</span>
            <strong>{reference}</strong>
          </p>
          <button type="button" className="lead-form__link-button" onClick={reset}>
            {t.again}
          </button>
        </div>
      </div>
    );
  }

  const fieldProps = (field: Exclude<LeadField, "interest" | "consent">) => {
    const error = visibleError(field);
    return {
      id: id(field),
      name: field,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? id(`${field}-error`) : undefined,
      onBlur: () => blur(field),
    } as const;
  };
  const errorText = (field: LeadField) => {
    const error = visibleError(field);
    return error ? (
      <p className="lead-form__error" id={id(`${field}-error`)}>
        {error}
      </p>
    ) : null;
  };
  const hasErrors = submitted && FIELD_ORDER.some((field) => visibleError(field));

  return (
    <div className={className} data-theme={theme}>
      <form ref={formRef} className="lead-form__form" onSubmit={onSubmit} noValidate aria-busy={pending || undefined}>
        <fieldset className="lead-form__interest">
          <legend className="lead-form__label">{t.interestLegend}</legend>
          <div className="lead-form__segments">
            {INTEREST_ORDER.map((option) => (
              <label key={option} className="lead-form__segment">
                <input
                  type="radio"
                  name="interest"
                  value={option}
                  checked={interest === option}
                  onChange={() => setInterest(option)}
                />
                <span>{t.interests[option]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="lead-form__grid">
          <div className="lead-form__field">
            <label className="lead-form__label" htmlFor={id("name")}>
              {t.name}
            </label>
            <input
              {...fieldProps("name")}
              className="lead-form__input"
              type="text"
              autoComplete="name"
              required
              maxLength={LEAD_LIMITS.nameMax}
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
            />
            {errorText("name")}
          </div>
          <div className="lead-form__field">
            <label className="lead-form__label" htmlFor={id("email")}>
              {t.email}
            </label>
            <input
              {...fieldProps("email")}
              className="lead-form__input"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              maxLength={LEAD_LIMITS.emailMax}
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
            />
            {errorText("email")}
          </div>
          <div className="lead-form__field">
            <label className="lead-form__label" htmlFor={id("phone")}>
              {t.phone} <span className="lead-form__optional">{t.optional}</span>
            </label>
            <input
              {...fieldProps("phone")}
              className="lead-form__input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={40}
              value={values.phone}
              onChange={(event) => update("phone", event.target.value)}
            />
            {errorText("phone")}
          </div>
          <div className="lead-form__field">
            <label className="lead-form__label" htmlFor={id("company")}>
              {t.company} <span className="lead-form__optional">{t.optional}</span>
            </label>
            <input
              {...fieldProps("company")}
              className="lead-form__input"
              type="text"
              autoComplete="organization"
              maxLength={LEAD_LIMITS.companyMax}
              value={values.company}
              onChange={(event) => update("company", event.target.value)}
            />
            {errorText("company")}
          </div>
          <div className="lead-form__field lead-form__field--wide">
            <label className="lead-form__label" htmlFor={id("message")}>
              {t.message} <span className="lead-form__optional">{t.optional}</span>
            </label>
            <textarea
              {...fieldProps("message")}
              className="lead-form__input lead-form__textarea"
              rows={compact ? 3 : 5}
              maxLength={LEAD_LIMITS.messageMax}
              placeholder={t.messagePlaceholder[interest]}
              value={values.message}
              onChange={(event) => update("message", event.target.value)}
            />
            {values.message.length > LEAD_LIMITS.messageMax * 0.8 ? (
              <p className="lead-form__counter" aria-live="polite">
                {values.message.length} / {LEAD_LIMITS.messageMax}
              </p>
            ) : null}
            {errorText("message")}
          </div>
        </div>

        {/* Bal küpü: ekran okuyucudan ve klavyeden gizli */}
        <div className="lead-form__hp" aria-hidden="true">
          <label>
            Leave empty
            <input type="text" name="arvo_hp" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        <div className="lead-form__consent-wrap">
          <label className="lead-form__consent">
            <input
              type="checkbox"
              name="consent"
              checked={values.consent}
              aria-invalid={visibleError("consent") ? true : undefined}
              aria-describedby={visibleError("consent") ? id("consent-error") : undefined}
              onChange={(event) => update("consent", event.target.checked)}
            />
            <span className="lead-form__box" aria-hidden="true">
              <svg viewBox="0 0 16 16">
                <path d="M3.5 8.4l2.9 2.9 6.1-6.6" fill="none" />
              </svg>
            </span>
            <span className="lead-form__consent-text">
              {t.consentBefore}
              <a href={ROUTES.privacy[locale]} target="_blank" rel="noopener">
                {t.consentLink}
              </a>
              {t.consentAfter}
            </span>
          </label>
          {errorText("consent")}
        </div>

        {serverError || hasErrors ? (
          <div ref={alertRef} tabIndex={-1} className="lead-form__alert" role="alert">
            {serverError ?? t.errors.summary}
          </div>
        ) : null}

        <div className="lead-form__actions">
          <button type="submit" className="lead-form__submit" disabled={pending}>
            {pending ? <span className="lead-form__spinner" aria-hidden="true" /> : null}
            <span>{pending ? t.sending : t.submit[interest]}</span>
          </button>
          <p className="lead-form__note">{t.note}</p>
        </div>
      </form>
    </div>
  );
}
