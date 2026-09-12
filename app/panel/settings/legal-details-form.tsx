"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { TURKISH_CITIES } from "@/app/_components/legal/format";
import { digitsOnly, formatIban, isValidTrIban, normalizeIban, taxNumberKind } from "@/app/_components/legal/identifiers";
import { updateLegalDetails } from "./actions";
import { LEGAL_FIELDS, LEGAL_LIMITS, normalizeLegalDetails, validateLegalDetails, type LegalDetailsValues, type LegalField } from "./legal-details";

type Props = {
  initial: LegalDetailsValues;
  canManage: boolean;
  available: boolean;
  organizationName: string;
  contactEmail: string | null;
  contactPhone: string | null;
};

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="panel-primary" type="submit" disabled={disabled || pending} aria-busy={pending}>{pending ? "Kaydediliyor..." : "Resmi Bilgileri Kaydet"}</button>;
}

/** "TR33 0006 1…" yazarken imleç, gruplama boşluklarına rağmen aynı karakterin yanında kalır. */
function caretAfterFormat(formatted: string, significantBefore: number) {
  if (significantBefore <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (formatted[index] !== " ") seen += 1;
    if (seen === significantBefore) return index + 1;
  }
  return formatted.length;
}

export function LegalDetailsForm({ initial, canManage, available, organizationName, contactEmail, contactPhone }: Props) {
  const [values, setValues] = useState<LegalDetailsValues>(() => ({ ...initial, iban: initial.iban ? formatIban(initial.iban) : "" }));
  const [touched, setTouched] = useState<Partial<Record<LegalField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = useMemo(() => validateLegalDetails(values), [values]);
  const clean = useMemo(() => normalizeLegalDetails(values), [values]);
  const editable = canManage && available;
  const showError = (field: LegalField) => (touched[field] || submitted ? errors[field] : undefined);

  const set = (field: LegalField, value: string) => setValues((current) => ({ ...current, [field]: value }));
  const blur = (field: LegalField) => () => setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
  const onText = (field: LegalField) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(field, event.target.value);
  const onDigits = (field: "tax_number" | "mersis_no") => (event: ChangeEvent<HTMLInputElement>) => set(field, digitsOnly(event.target.value).slice(0, LEGAL_LIMITS[field]));

  function onIban(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const caret = input.selectionStart ?? input.value.length;
    const significantBefore = normalizeIban(input.value.slice(0, caret)).length;
    const formatted = formatIban(normalizeIban(input.value).slice(0, 26));
    set("iban", formatted);
    const position = caretAfterFormat(formatted, significantBefore);
    requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(position, position);
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const firstInvalid = LEGAL_FIELDS.find((field) => errors[field]);
    if (!firstInvalid) return;
    event.preventDefault();
    setSubmitted(true);
    formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
  }

  const field = (name: LegalField) => ({
    name,
    value: values[name],
    onBlur: blur(name),
    disabled: !editable,
    "aria-invalid": showError(name) ? true : undefined,
    "aria-describedby": showError(name) ? `slg-${name}-error` : undefined,
  });
  const errorText = (name: LegalField) => showError(name) ? <span className="slg-error" id={`slg-${name}-error`} role="alert">{showError(name)}</span> : null;

  const ibanComplete = normalizeIban(values.iban).length;
  const ibanValid = isValidTrIban(values.iban);
  const kind = !errors.tax_number ? taxNumberKind(clean.tax_number) : null;

  // Önizleme: belgelerdeki Hizmet Sağlayıcı kartı ve ödeme hesabı.
  const partyName = clean.legal_name || organizationName;
  const locality = [clean.legal_district, clean.legal_city].filter(Boolean).join(" / ");
  const address = clean.legal_address ? [clean.legal_address, locality].filter(Boolean).join("\n") : "";
  const rows: [string, string][] = [
    ["Adres", address || "Belge alt bilgisi metni kullanılır"],
    ["Vergi Dairesi", clean.tax_office],
    [kind === "tckn" ? "T.C. Kimlik No" : "Vergi Kimlik No", clean.tax_number],
    ["MERSİS No", clean.mersis_no],
    ["E-posta", contactEmail ?? ""],
    ["Telefon", contactPhone ?? ""],
  ];
  const court = clean.legal_city ? `${clean.legal_city} Mahkemeleri ve İcra Daireleri` : "Belge alt bilgisindeki şehirden tahmin edilir";

  return <div className="slg-layout">
    <form ref={formRef} className="panel-form slg-form" action={updateLegalDetails} onSubmit={onSubmit} noValidate>
      {!available ? <div className="wide slg-banner" role="status">Bu bölüm veritabanı güncellemesi (20260912202000_org_legal_bank_details) uygulandıktan sonra kullanılabilir. O zamana kadar belgeler “Belge alt bilgisi” metnini kullanır.</div> : null}

      <div className="wide slg-group"><span>01</span><div><strong>Unvan ve adres</strong><small>Sözleşmenin taraflar maddesinde ve tebligat adresinde kullanılır.</small></div></div>
      <label className="wide">Ticari unvan
        <input {...field("legal_name")} onChange={onText("legal_name")} maxLength={LEGAL_LIMITS.legal_name} placeholder={`${organizationName} Danışmanlık Ltd. Şti.`} autoComplete="organization" />
        <small className="slg-hint">Boş bırakılırsa kurum adı ({organizationName}) kullanılır.</small>
        {errorText("legal_name")}
      </label>
      <label className="wide">Adres
        <textarea {...field("legal_address")} onChange={onText("legal_address")} maxLength={LEGAL_LIMITS.legal_address} rows={3} placeholder={"Caferağa Mah. Moda Cad. No: 12 D: 4"} autoComplete="street-address" />
        {errorText("legal_address")}
      </label>
      <label>İl
        <select {...field("legal_city")} onChange={onText("legal_city")}>
          <option value="">İl seçin</option>
          {TURKISH_CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
        </select>
        {errorText("legal_city")}
      </label>
      <label>İlçe <em className="slg-optional">isteğe bağlı</em>
        <input {...field("legal_district")} onChange={onText("legal_district")} maxLength={LEGAL_LIMITS.legal_district} placeholder="Kadıköy" />
        {errorText("legal_district")}
      </label>

      <div className="wide slg-group"><span>02</span><div><strong>Vergi kimliği</strong><small>Tüzel kişiler için 10 haneli VKN, şahıs işletmeleri için 11 haneli T.C. kimlik numarası.</small></div></div>
      <label>Vergi dairesi
        <input {...field("tax_office")} onChange={onText("tax_office")} maxLength={LEGAL_LIMITS.tax_office} placeholder="Kadıköy" />
        {errorText("tax_office")}
      </label>
      <label>Vergi numarası / TCKN
        <input {...field("tax_number")} onChange={onDigits("tax_number")} inputMode="numeric" autoComplete="off" placeholder="10 veya 11 hane" />
        {kind && clean.tax_number ? <small className="slg-ok">{kind === "vkn" ? "Geçerli vergi kimlik numarası" : "Geçerli T.C. kimlik numarası"}</small> : null}
        {errorText("tax_number")}
      </label>
      <label className="wide">MERSİS no <em className="slg-optional">isteğe bağlı</em>
        <input {...field("mersis_no")} onChange={onDigits("mersis_no")} inputMode="numeric" autoComplete="off" placeholder="16 hane" />
        {errorText("mersis_no")}
      </label>

      <div className="wide slg-group"><span>03</span><div><strong>Banka hesabı</strong><small>Teklif ve sözleşmenin havale / EFT ödeme maddesinde gösterilir.</small></div></div>
      <label>Banka adı
        <input {...field("bank_name")} onChange={onText("bank_name")} maxLength={LEGAL_LIMITS.bank_name} placeholder="Örn. Ziraat Bankası" />
        {errorText("bank_name")}
      </label>
      <label>Hesap sahibi
        <input {...field("bank_account_holder")} onChange={onText("bank_account_holder")} maxLength={LEGAL_LIMITS.bank_account_holder} placeholder={partyName} />
        <small className="slg-hint">Boş bırakılırsa ticari unvan kullanılır.</small>
        {errorText("bank_account_holder")}
      </label>
      <label className="wide">IBAN
        <input {...field("iban")} className="slg-iban" onChange={onIban} inputMode="text" autoComplete="off" spellCheck={false} placeholder="TR00 0000 0000 0000 0000 0000 00" maxLength={32} />
        <span className="slg-iban-meta">
          <span className={ibanValid ? "slg-ok" : "slg-hint"}>{ibanValid ? "Geçerli IBAN (mod-97 kontrolü)" : `${ibanComplete}/26 karakter`}</span>
        </span>
        {errorText("iban")}
      </label>

      {editable
        ? <div className="wide panel-form-actions"><SaveButton disabled={false} /></div>
        : canManage ? null : <small className="wide slg-hint">Değişiklikler owner veya admin yetkisi gerektirir.</small>}
    </form>

    <aside className="slg-preview" aria-label="Belgelerdeki görünüm">
      <small className="slg-preview-label">BELGEDE GÖRÜNÜM</small>
      <div className="slg-paper">
        <div className="slg-paper-kicker">Hizmet Sağlayıcı</div>
        <strong className="slg-paper-name">{partyName}</strong>
        <dl className="slg-paper-rows">
          {rows.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <div className="slg-paper-kicker slg-paper-gap">Havale / EFT</div>
        {clean.iban ? <div className="slg-paper-bank">
          {clean.bank_name ? <div><small>Banka</small><b>{clean.bank_name}</b></div> : null}
          <div><small>Hesap sahibi</small><b>{clean.bank_account_holder || partyName}</b></div>
          <div className="slg-paper-iban"><small>IBAN</small><b>{formatIban(clean.iban)}</b></div>
        </div> : <p className="slg-paper-muted">IBAN girilmezse ödeme maddesinde “hesap bilgileri faturada bildirilir” yazar.</p>}
        <div className="slg-paper-foot">
          <span>Yetkili mahkeme (tacir müşteriler)</span>
          <b>{court}</b>
        </div>
      </div>
      <p className="slg-preview-note">Bilgiler yeni ve imza bekleyen belgelerde hemen görünür. Belge metni (KEP içermeyen v3.1) değişmez; imzalanmış sözleşmeler onaylandıkları metin sürümüyle gösterilir.</p>
    </aside>
  </div>;
}
