"use client";

import { useMemo, useRef, useState } from "react";

type Plan = { code: string; name: string };
type Props = {
  action: (formData: FormData) => void | Promise<void>;
  plans: Plan[];
  /** Kullanılan kısa adlar: çakışma daha formu göndermeden gösterilir. */
  existingSlugs: string[];
};

const steps = [
  { label: "Firma", hint: "Kurumun adı ve sektörü" },
  { label: "Paket", hint: "Paket, demo veri, alan adı" },
  { label: "Yönetici", hint: "Panele ilk girecek kişi" },
  { label: "Onay", hint: "Özet ve kurulum" },
];

const sectors = [
  { value: "general", label: "Genel" },
  { value: "akademik-danismanlik", label: "Akademik danışmanlık" },
  { value: "egitim", label: "Eğitim" },
  { value: "saglik", label: "Sağlık" },
  { value: "hukuk-danismanlik", label: "Hukuk ve danışmanlık" },
  { value: "ajans-yazilim", label: "Ajans ve yazılım" },
  { value: "perakende", label: "Perakende ve e-ticaret" },
];

const planNotes: Record<string, string> = {
  starter: "Temel modüllerle hızlı başlangıç",
  professional: "Büyüyen ekipler için geniş kapsam",
  enterprise: "Tüm modüller ve kurumsal ihtiyaçlar",
};

export function slugify(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Yeni müşteri kurulumu: 4 adım. Alan adları sunucu işlemiyle aynı
 * (name, slug, sector, plan_code, custom_domain, seed_*, owner_*).
 * Kısa ad çakışması ve eksik alanlar adım geçilmeden gösterilir.
 */
export function NewOrganizationWizard({ action, plans, existingSlugs }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [sectorChoice, setSectorChoice] = useState("general");
  const [customSector, setCustomSector] = useState("");
  const [planCode, setPlanCode] = useState(plans[0]?.code ?? "starter");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [seedCrm, setSeedCrm] = useState(false);
  const [seedOperations, setSeedOperations] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const taken = useMemo(() => new Set(existingSlugs.map((item) => item.toLowerCase())), [existingSlugs]);
  const cleanSlug = slugify(slug);
  const slugTaken = cleanSlug.length >= 2 && taken.has(cleanSlug);
  const sector = sectorChoice === "other" ? customSector.trim() : sectorChoice;
  const sectorLabel = sectorChoice === "other" ? customSector.trim() : sectors.find((item) => item.value === sectorChoice)?.label ?? sectorChoice;
  const planName = plans.find((plan) => plan.code === planCode)?.name ?? planCode;

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function validateStep(index: number) {
    const container = formRef.current?.querySelector<HTMLDivElement>(`[data-step="${index}"]`);
    if (!container) return true;
    if (index === 0 && slugTaken) {
      container.querySelector<HTMLInputElement>("input[name=slug]")?.focus();
      return false;
    }
    for (const field of Array.from(container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select"))) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    return true;
  }

  const goNext = () => {
    if (validateStep(step)) setStep((current) => Math.min(current + 1, steps.length - 1));
  };
  const goBack = () => setStep((current) => Math.max(current - 1, 0));

  return (
    <div className="plw">
      <ol className="plw-steps" aria-label="Kurulum adımları">
        {steps.map((item, index) => (
          <li key={item.label} className={index === step ? "is-active" : index < step ? "is-done" : undefined} aria-current={index === step ? "step" : undefined}>
            <span className="plw-step-dot">{index < step ? "✓" : index + 1}</span>
            <span className="plw-step-text"><b>{item.label}</b><small>{item.hint}</small></span>
          </li>
        ))}
      </ol>

      <form className="plw-form" ref={formRef} action={action} onSubmit={() => setSubmitting(true)}>
        {/* Sektör seçimi "Diğer" iken serbest metin gönderilir */}
        <input type="hidden" name="sector" value={sector || "general"} />

        <div className="plw-step" hidden={step !== 0} data-step="0">
          <p className="plw-intro">Kurumun adını yazın; panel adresindeki kısa ad kendiliğinden oluşur.</p>
          <label className="plw-field">Kurum adı
            <input name="name" value={name} onChange={(event) => handleNameChange(event.target.value)} minLength={2} maxLength={160} required placeholder="Örn. Burak Akademi" autoComplete="organization" />
          </label>
          <label className="plw-field">Kısa ad
            <input
              name="slug"
              value={slug}
              onChange={(event) => { setSlug(event.target.value); setSlugTouched(true); }}
              minLength={2}
              maxLength={80}
              required
              placeholder="burak-akademi"
              aria-invalid={slugTaken || undefined}
              aria-describedby="plw-slug-note"
            />
            <small id="plw-slug-note" className={slugTaken ? "plw-note is-bad" : cleanSlug.length >= 2 ? "plw-note is-ok" : "plw-note"}>
              {slugTaken ? "Bu kısa ad başka bir kurumda kullanılıyor; farklı bir kısa ad yazın." : cleanSlug.length >= 2 ? `Kullanılabilir · ${cleanSlug}` : "Harf, rakam ve tire; kurum adından otomatik oluşur."}
            </small>
          </label>
          <fieldset className="plw-field">
            <legend>Sektör</legend>
            <div className="plw-chips">
              {[...sectors, { value: "other", label: "Diğer" }].map((item) => (
                <label key={item.value} className={sectorChoice === item.value ? "plw-chip is-on" : "plw-chip"}>
                  <input type="radio" name="sector_choice" value={item.value} checked={sectorChoice === item.value} onChange={() => setSectorChoice(item.value)} />
                  {item.label}
                </label>
              ))}
            </div>
            {sectorChoice === "other" ? (
              <input className="plw-other" value={customSector} onChange={(event) => setCustomSector(event.target.value)} minLength={2} maxLength={80} required placeholder="Sektörü yazın" aria-label="Sektör" />
            ) : null}
          </fieldset>
        </div>

        <div className="plw-step" hidden={step !== 1} data-step="1">
          <p className="plw-intro">Satışını yaptığınız paketi seçin. Modüller kurulumdan sonra tek tek açılıp kapatılabilir.</p>
          <div className="plw-plans" role="radiogroup" aria-label="Paket">
            {plans.map((plan) => (
              <label key={plan.code} className={planCode === plan.code ? "plw-plan is-on" : "plw-plan"}>
                <input type="radio" name="plan_code" value={plan.code} checked={planCode === plan.code} onChange={() => setPlanCode(plan.code)} />
                <b>{plan.name}</b>
                <small>{planNotes[plan.code] ?? "Kurum paketi"}</small>
              </label>
            ))}
          </div>
          <div className="plw-toggles">
            <label className="plw-toggle">
              <span><b>CRM demo verisi</b><small>Örnek talep ve müşterilerle başlar; ekip paneli tanır.</small></span>
              <span className="plw-switch"><input name="seed_crm" type="checkbox" checked={seedCrm} onChange={(event) => setSeedCrm(event.target.checked)} /><i /></span>
            </label>
            <label className="plw-toggle">
              <span><b>Operasyon demo verisi</b><small>Örnek iş akışları ve adımlarla başlar.</small></span>
              <span className="plw-switch"><input name="seed_operations" type="checkbox" checked={seedOperations} onChange={(event) => setSeedOperations(event.target.checked)} /><i /></span>
            </label>
          </div>
          <label className="plw-field">Özel alan adı <small className="plw-optional">isteğe bağlı</small>
            <input name="custom_domain" value={customDomain} onChange={(event) => setCustomDomain(event.target.value.trim())} placeholder="panel.burakakademi.com" inputMode="url" />
            <small className="plw-note">Boş bırakabilirsiniz; müşteri sonradan Ayarlar’dan kendisi de bağlayabilir.</small>
          </label>
        </div>

        <div className="plw-step" hidden={step !== 2} data-step="2">
          <p className="plw-intro">Panele ilk girecek kişi kurumun sahibi olur; ekibini sonradan kendisi davet eder.</p>
          <label className="plw-field">Ad soyad
            <input name="owner_name" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} minLength={2} maxLength={120} required placeholder="Ad Soyad" autoComplete="name" />
          </label>
          <label className="plw-field">E-posta
            <input name="owner_email" type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value.trim())} required placeholder="ad@firma.com" autoComplete="email" />
            <small className="plw-note">Davet bu adrese gider. E-posta ulaşmazsa kurum sayfasından giriş bağlantısı oluşturup WhatsApp’tan gönderebilirsiniz.</small>
          </label>
        </div>

        <div className="plw-step" hidden={step !== 3} data-step="3">
          <dl className="plw-summary">
            <div><dt>Kurum</dt><dd>{name || "—"}</dd></div>
            <div><dt>Kısa ad</dt><dd className="is-mono">{cleanSlug || "—"}</dd></div>
            <div><dt>Sektör</dt><dd>{sectorLabel || "—"}</dd></div>
            <div><dt>Paket</dt><dd>{planName}</dd></div>
            <div><dt>Demo veri</dt><dd>{[seedCrm && "CRM", seedOperations && "Operasyon"].filter(Boolean).join(", ") || "Yok"}</dd></div>
            <div><dt>Alan adı</dt><dd>{customDomain || "Sonra"}</dd></div>
            <div><dt>Sahip</dt><dd>{ownerName || "—"}</dd></div>
            <div><dt>E-posta</dt><dd>{ownerEmail || "—"}</dd></div>
          </dl>
          <div className="plw-next">
            <b>Kurulumdan sonra ne olacak?</b>
            <ol>
              <li>Kurum, paket modülleri{seedCrm || seedOperations ? " ve demo veriler" : ""} hazırlanır.</li>
              <li>{ownerEmail || "Sahibin e-postası"} adresine davet gönderilir.</li>
              <li>Sahip bağlantıyı açar, şifresini belirler ve ilk kurulum ekranında logo ve iletişim bilgilerini girer.</li>
            </ol>
          </div>
        </div>

        <div className="plw-nav">
          {step > 0 ? <button type="button" className="panel-secondary" onClick={goBack}>Geri</button> : <span />}
          {step < steps.length - 1
            ? <button type="button" className="panel-primary" onClick={goNext}>Devam</button>
            : <button type="submit" className="panel-primary" disabled={submitting}>{submitting ? "Kurum hazırlanıyor…" : "Kurulumu başlat"}</button>}
        </div>
      </form>
    </div>
  );
}
