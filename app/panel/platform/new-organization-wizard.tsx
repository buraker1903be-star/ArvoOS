"use client";

import { useMemo, useRef, useState } from "react";

type Plan = { code: string; name: string };
type Props = {
  action: (formData: FormData) => void | Promise<void>;
  plans: Plan[];
};

const steps = ["Firma", "Paket", "Yönetici", "Özet & Onay"];

function slugify(value: string) {
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

export function NewOrganizationWizard({ action, plans }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [sector, setSector] = useState("general");
  const [planCode, setPlanCode] = useState(plans[0]?.code ?? "starter");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [seedCrm, setSeedCrm] = useState(true);
  const [seedOperations, setSeedOperations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const stepRef0 = useRef<HTMLDivElement>(null);
  const stepRef1 = useRef<HTMLDivElement>(null);
  const stepRef2 = useRef<HTMLDivElement>(null);
  const stepRef3 = useRef<HTMLDivElement>(null);
  const stepRefs = [stepRef0, stepRef1, stepRef2, stepRef3];

  const planName = useMemo(() => plans.find((plan) => plan.code === planCode)?.name ?? planCode, [plans, planCode]);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function validateStep(index: number) {
    const container = stepRefs[index].current;
    if (!container) return true;
    const fields = Array.from(container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select"));
    let valid = true;
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        valid = false;
        break;
      }
    }
    return valid;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function goBack() {
    setStep((current) => Math.max(current - 1, 0));
  }

  return (
    <div className="wizard">
      <ol className="wizard-steps">
        {steps.map((label, index) => (
          <li key={label} className={index === step ? "active" : index < step ? "done" : ""}>
            <span>{index < step ? "✓" : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <form
        className="wizard-form"
        action={action}
        onSubmit={() => setSubmitting(true)}
      >
        <div className="wizard-step" hidden={step !== 0} ref={stepRef0}>
          <p className="wizard-step-intro">Firmanın temel bilgilerini girin. Kısa ad (slug) firma adından otomatik oluşturulur, isterseniz değiştirebilirsiniz.</p>
          <div className="panel-form">
            <label className="wide">Kurum adı<input name="name" value={name} onChange={(e) => handleNameChange(e.target.value)} minLength={2} maxLength={160} required placeholder="Örn. Burak Akademi" /></label>
            <label>Kısa ad / slug<input name="slug" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} minLength={2} maxLength={80} placeholder="burak-akademi" /></label>
            <label>Sektör<input name="sector" value={sector} onChange={(e) => setSector(e.target.value)} minLength={2} maxLength={80} required /></label>
          </div>
        </div>

        <div className="wizard-step" hidden={step !== 1} ref={stepRef1}>
          <p className="wizard-step-intro">Satışını yaptığınız paketi ve varsa özel alan adını girin. Özel alan adı boş bırakılabilir, sonra da eklenebilir.</p>
          <div className="panel-form">
            <label>Paket<select name="plan_code" value={planCode} onChange={(e) => setPlanCode(e.target.value)}>{plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
            <label>Özel alan adı (opsiyonel)<input name="custom_domain" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="panel.burakakademi.com" /></label>
            <label className="wide wizard-check"><input name="seed_crm" type="checkbox" checked={seedCrm} onChange={(e) => setSeedCrm(e.target.checked)} /> CRM demo verisiyle başlasın</label>
            <label className="wide wizard-check"><input name="seed_operations" type="checkbox" checked={seedOperations} onChange={(e) => setSeedOperations(e.target.checked)} /> Operasyon demo verisiyle başlasın</label>
          </div>
        </div>

        <div className="wizard-step" hidden={step !== 2} ref={stepRef2}>
          <p className="wizard-step-intro">Panele ilk girecek kişinin adı ve e-postası. Kurulum tamamlanınca bu adrese davet gönderilir.</p>
          <div className="panel-form">
            <label>İlk yönetici adı<input name="owner_name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} minLength={2} maxLength={120} required placeholder="Ad Soyad" /></label>
            <label>İlk yönetici e-posta<input name="owner_email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required placeholder="owner@burakakademi.com" /></label>
          </div>
        </div>

        <div className="wizard-step" hidden={step !== 3} ref={stepRef3}>
          <p className="wizard-step-intro">Her şey doğruysa kurulumu başlatın — kurum, modüller, demo veriler ve davet otomatik hazırlanır.</p>
          <dl className="wizard-summary">
            <div><dt>Kurum</dt><dd>{name || "—"}</dd></div>
            <div><dt>Kısa ad</dt><dd>{slug || "—"}</dd></div>
            <div><dt>Sektör</dt><dd>{sector || "—"}</dd></div>
            <div><dt>Paket</dt><dd>{planName}</dd></div>
            <div><dt>Özel alan adı</dt><dd>{customDomain || "Tanımlı değil"}</dd></div>
            <div><dt>İlk yönetici</dt><dd>{ownerName || "—"}</dd></div>
            <div><dt>Davet adresi</dt><dd>{ownerEmail || "—"}</dd></div>
            <div><dt>Demo veri</dt><dd>{[seedCrm && "CRM", seedOperations && "Operasyon"].filter(Boolean).join(", ") || "Yok"}</dd></div>
          </dl>
        </div>

        <div className="wizard-nav">
          {step > 0 ? <button type="button" className="panel-secondary" onClick={goBack}>← Geri</button> : <span />}
          {step < steps.length - 1
            ? <button type="button" className="panel-primary" onClick={goNext}>İleri →</button>
            : <button type="submit" className="panel-primary" disabled={submitting}>{submitting ? "Kurulum başlatılıyor…" : "Kurulumu Tamamla ve Daveti Gönder"}</button>}
        </div>
      </form>
    </div>
  );
}
