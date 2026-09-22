import type { CSSProperties, ReactNode } from "react";
import { PrintDocumentButton } from "@/app/_components/print-document-button";
import { PrintAutorun } from "@/app/_components/print-autorun";
import { getContractTemplate } from "@/lib/contract-templates";
import { DocFooter, DocHeader, PartyCard, PaymentPlanTable, SectionHeading, TaxTotals, customerRows, providerFromRow, providerRows, type Customer } from "@/app/_components/legal/blocks";
import { ContractArticles, LegacyArticles, PreInformationAnnex, specialClausesFor, type ContractContext } from "@/app/_components/legal/contract-clauses";
import { documentCss } from "@/app/_components/legal/document-styles";
import {
  LEGAL_TEXT_VERSION, LEGAL_V3_FALLBACK_CUTOFF, amountInWords, computeTaxBreakdown, detectCustomerKind, formatDate, formatDateTime,
  formatMoney, groupHash, isBefore, pdfFileName, resolveLegalTextVersion, safeBrandColor, splitScope, summarizeUserAgent, taxIdLabel, type DocumentRow,
} from "@/app/_components/legal/format";
import { buildSchedule, type InstallmentRecord } from "@/app/_components/legal/schedule";
import { ContractAddenda } from "@/app/_components/legal/addenda";
import { normalizeWorkPlan, type ContractAddendum } from "@/lib/work-plan";

export type ContractAudit = {
  signed_user_agent?: string | null;
  legal_text_version?: string | null;
  signed_consents?: Record<string, unknown> | null;
  proposal_no?: string | null;
  tax_status?: string | null;
  tax_rate?: number | null;
  net_amount?: number | null;
  tax_amount?: number | null;
  gross_amount?: number | null;
  estimated_delivery_date?: string | null;
  installments?: InstallmentRecord[] | null;
};

type Props = {
  row: DocumentRow;
  audit?: ContractAudit | null;
  /** arvo_public_contract_audit / ek sütunlar okunabildi mi (migration uygulandı mı) */
  auditAvailable?: boolean;
  verificationUrl?: string | null;
  verificationHash?: string | null;
  mode?: "screen" | "print";
  overlay?: boolean;
  toolbarLeft?: ReactNode;
  pdfHref?: string | null;
  backHref?: string | null;
  logDocumentId?: string | null;
  signatureForm?: ReactNode;
  notice?: string | null;
  errorMessage?: string | null;
  proposalLink?: { token: string; no: string | null } | null;
  /** crm_contracts.work_plan — doğrulama özeti etkilenmesin diye row'dan ayrı taşınır. */
  workPlan?: unknown;
  /** Gönderilmiş/sonuçlanmış ek protokoller */
  addenda?: ContractAddendum[] | null;
  /** Onay bekleyen ek protokolün altında gösterilecek müşteri formu (herkese açık sayfa) */
  addendumActions?: (addendum: ContractAddendum) => ReactNode;
  /** Müşterinin takip kodu (yalnızca herkese açık sayfada; takip ekranına kısayol) */
  trackingCode?: string | null;
};

const consentLabels: [string, string][] = [
  ["contract", "Sözleşmeyi okudum ve kabul ediyorum"],
  ["preinfo", "Ön Bilgilendirme Formu’nu okudum"],
  ["commercial", "Ticari / mesleki amaçla akdettiğimi beyan ederim"],
  ["kvkk", "KVKK Aydınlatma Metni’ni okudum"],
  ["early_start", "Hizmete cayma süresi dolmadan başlanmasını talep ediyorum"],
];

export function isContractSigned(row: DocumentRow) {
  return Boolean(row?.signed_at) || ["signed", "completed"].includes(row?.status);
}

export function contractCustomerKind(row: DocumentRow) {
  return detectCustomerKind({ name: row?.customer_name, taxNumber: row?.customer_tax_number, taxOffice: row?.customer_tax_office });
}

export function ContractDocument({ row, audit, auditAvailable = false, verificationUrl, verificationHash, mode = "screen", overlay, toolbarLeft, pdfHref, backHref, logDocumentId, signatureForm, notice, errorMessage, proposalLink, workPlan, addenda, addendumActions, trackingCode }: Props) {
  const signed = isContractSigned(row);
  const template = getContractTemplate(row.organization_slug);
  // İmzalanmış sözleşme, imzalandığı metinle gösterilir: yeni yasal metin
  // yalnızca onu onaylayan (legal_text_version kaydı olan) sözleşmelerde.
  const legacy = signed && !audit?.legal_text_version && (auditAvailable || isBefore(row.signed_at, LEGAL_V3_FALLBACK_CUTOFF));
  // İmzalı sözleşme onaylandığı sürümle (3.0 / 3.1) çizilir; imzasız her
  // zaman güncel sürümdür. Kurum bilgileri (adres, IBAN) veri olduğu için
  // metin sürümünü değiştirmez.
  const textVersion = signed ? resolveLegalTextVersion(audit?.legal_text_version) : LEGAL_TEXT_VERSION;
  const provider = providerFromRow(row, "Hizmet Sağlayıcı");
  const customer: Customer = {
    name: String(row.customer_name || "Müşteri"),
    address: row.customer_address || null,
    taxNumber: row.customer_tax_number || null,
    taxOffice: row.customer_tax_office || null,
    email: row.contact_email || null,
    phone: row.contact_phone || null,
  };
  const kind = contractCustomerKind(row);
  const total = Number(row.amount || 0);
  const currency = String(row.currency || "TRY");
  const tax = computeTaxBreakdown({ amount: total, tax_status: audit?.tax_status, net_amount: audit?.net_amount, tax_amount: audit?.tax_amount, gross_amount: audit?.gross_amount, tax_rate: audit?.tax_rate });
  const schedule = buildSchedule({ schedule: row.payment_schedule, total, planType: row.payment_plan_type, planLabel: row.payment_plan, fallbackDueDate: row.due_date, frozen: signed, installments: audit?.installments });
  const consents = audit?.signed_consents && typeof audit.signed_consents === "object" ? audit.signed_consents : null;
  const ctx: ContractContext = {
    kind,
    contractNo: String(row.contract_no || ""),
    title: String(row.title || "Hizmet"),
    provider,
    customer,
    scopeItems: splitScope(row.scope, row.title),
    proposalNo: audit?.proposal_no || proposalLink?.no || null,
    startDate: row.start_date || null,
    dueDate: row.due_date || audit?.estimated_delivery_date || null,
    createdAt: row.created_at || null,
    signedAt: signed ? row.signed_at || null : null,
    currency,
    tax,
    schedule,
    workPlan: normalizeWorkPlan(workPlan),
    specialClauses: specialClausesFor(template),
    earlyStart: consents ? consents.early_start === true : null,
    city: provider.city ?? null,
    textVersion,
  };
  const userAgent = summarizeUserAgent(row.signed_user_agent || audit?.signed_user_agent);
  const signerName = String(row.signed_name || customer.name);
  const taxId = taxIdLabel(customer.taxNumber);
  const fileName = pdfFileName("Sozlesme", row.contract_no);
  const css = documentCss({ footerLeft: `${row.contract_no || ""} · Hizmet Sözleşmesi · ${provider.name}` });
  const print = mode === "print";
  const rootClass = ["doc-root", print ? "doc-print" : "", print && overlay ? "doc-print-overlay" : ""].filter(Boolean).join(" ");

  return <main className={rootClass} style={{ "--doc-brand": safeBrandColor(row.organization_primary_color) } as CSSProperties}>
    <style>{css}</style>
    {print
      ? <PrintAutorun fileName={fileName} backHref={backHref} />
      : <div className="doc-toolbar print-hide"><div>{toolbarLeft}</div><div className="doc-toolbar-actions">{pdfHref ? <PrintDocumentButton href={pdfHref} documentType="contract" documentId={logDocumentId ?? undefined} documentNumber={row.contract_no} /> : null}</div></div>}
    <article className="doc-sheet">
      <div className="doc-band" />
      <DocHeader provider={provider} kicker="Hizmet Sözleşmesi" number={String(row.contract_no || "")} meta={[
        ["Düzenleme", formatDate(row.created_at)],
        ["Durum", signed ? "İmzalandı" : row.status === "cancelled" ? "İptal edildi" : row.status === "rejected" ? "Reddedildi" : "İmza bekliyor"],
        ["Metin sürümü", legacy ? `Şablon v${row.contract_template_version || template.version}` : `v${textVersion}`],
      ]} />
      <section className="doc-title">
        <div className="doc-kicker">{legacy ? template.name : "Hizmet Sözleşmesi"}</div>
        <h1>{ctx.title}</h1>
        <p>{customer.name} ile {provider.name} arasında, aşağıdaki hüküm ve koşullarla elektronik ortamda düzenlenmiştir.</p>
      </section>
      {notice && !print ? <div className="doc-notice print-hide">{notice}</div> : null}
      {errorMessage && !print ? <div className="doc-error print-hide">{errorMessage}</div> : null}
      {trackingCode && !print ? (
        <div className="doc-track print-hide">
          <div><b>Dosyanızı takip edin</b><span>Takip kodunuz: <code>{trackingCode}</code> · İlerlemeyi görün, sorularınızı iletin.</span></div>
          <a className="doc-btn" href={`/takip?code=${encodeURIComponent(trackingCode)}`}>Takip ekranını aç</a>
        </div>
      ) : null}

      <section className="doc-sec">
        <div className="doc-facts">
          <div className="doc-fact doc-fact-dark"><small>Sözleşme bedeli</small><strong>{formatMoney(tax.gross, currency)}</strong></div>
          <div className="doc-fact"><small>{row.start_date ? "Başlangıç" : "Düzenleme"}</small><strong>{formatDate(row.start_date || row.created_at)}</strong></div>
          <div className="doc-fact"><small>Teslim</small><strong>{formatDate(ctx.dueDate, "Teklif takvimine göre")}</strong></div>
          <div className="doc-fact"><small>Ödeme planı</small><strong>{schedule.length === 1 ? "Tek ödeme" : `${schedule.length} taksit`}</strong></div>
        </div>
      </section>

      {legacy ? <>
        <section className="doc-sec"><SectionHeading>Taraflar</SectionHeading><div className="doc-grid-2">
          <PartyCard role="Hizmet Sağlayıcı" name={provider.name} rows={providerRows(provider)} />
          <PartyCard role="Müşteri" name={customer.name} rows={customerRows(customer)} />
        </div></section>
        <section className="doc-sec"><SectionHeading>Hizmet Kapsamı</SectionHeading><div className="doc-box"><ul className="doc-list">{ctx.scopeItems.map((item, index) => <li key={index}>{item}</li>)}</ul></div></section>
        <section className="doc-sec"><SectionHeading>Ücret ve Ödeme Planı</SectionHeading><PaymentPlanTable rows={schedule} currency={currency} /><TaxTotals tax={tax} currency={currency} words={amountInWords(tax.gross, currency)} /></section>
        <section className="doc-sec"><SectionHeading>Sözleşme Hükümleri</SectionHeading><LegacyArticles clauses={template.clauses} /></section>
      </> : <section className="doc-sec"><ContractArticles ctx={ctx} /></section>}

      <section className="doc-sec doc-sign-block">
        <SectionHeading>İmzalar ve Elektronik Onay Kaydı</SectionHeading>
        <div className="doc-sign">
          <div className="doc-sign-card">
            <h3>Hizmet Sağlayıcı</h3>
            <div className="doc-sign-name">{provider.name}</div>
            <div className="doc-sign-sub">Yetkili imza ve kaşe</div>
            <div className="doc-sign-art">{provider.stampUrl ? <img src={provider.stampUrl} alt="Hizmet Sağlayıcı kaşe ve imzası" /> : <span className="doc-sign-empty">Kaşe / İmza</span>}</div>
            <dl className="doc-audit">
              <dt>Düzenleme tarihi</dt><dd>{formatDateTime(row.created_at)}</dd>
              <dt>Belge referansı</dt><dd>{row.contract_no}</dd>
            </dl>
          </div>
          <div className="doc-sign-card">
            <h3>{kind === "consumer" ? "Müşteri / Tüketici" : "Müşteri / Alıcı"}</h3>
            <div className="doc-sign-name">{signed ? signerName : customer.name}</div>
            <div className="doc-sign-sub">{signed && signerName !== customer.name ? `${customer.name} adına` : null}{signed && signerName !== customer.name && taxId ? " · " : null}{taxId ? `${taxId.label}: ${taxId.value}` : null}</div>
            <div className="doc-sign-art">{signed && row.signed_signature_data ? <img src={row.signed_signature_data} alt="Müşteri imzası" /> : <span className="doc-sign-empty">{signed ? "Elektronik onay" : "İmza bekleniyor"}</span>}</div>
            {signed ? <>
              <div className="doc-esign"><i>✓</i>Elektronik olarak imzalanmıştır</div>
              <dl className="doc-audit">
                <dt>İmza tarihi ve saati</dt><dd>{formatDateTime(row.signed_at)}</dd>
                <dt>IP adresi</dt><dd>{row.signed_ip || "Kayıt bulunamadı"}</dd>
                <dt>Cihaz / tarayıcı</dt><dd>{userAgent || "Kayıt bulunamadı"}</dd>
                <dt>Belge referansı</dt><dd>{row.contract_no}</dd>
                {verificationHash ? <><dt>Doğrulama özeti</dt><dd className="doc-hash">SHA-256 · {groupHash(verificationHash)}</dd></> : null}
              </dl>
            </> : <>
              <div className="doc-esign doc-esign-pending">İmza bekleniyor</div>
              <div className="doc-blank"><span>Ad Soyad</span><span>Tarih / Saat</span></div>
            </>}
          </div>
        </div>
        {consents ? <ul className="doc-consents">{consentLabels.filter(([key]) => consents[key] === true).map(([key, label]) => <li key={key}>{label}</li>)}</ul> : null}
        <p className="doc-legal-note">{signed
          ? "Bu belge elektronik ortamda düzenlenmiş ve Müşteri tarafından elektronik olarak onaylanmıştır. Elektronik onay 5070 sayılı Elektronik İmza Kanunu kapsamında güvenli elektronik imza niteliğinde değildir; onaya ilişkin tarih-saat, IP adresi, cihaz bilgisi ve doğrulama özeti HMK m.193 kapsamında delil olarak saklanır."
          : "Müşteri, belgenin sonundaki elektronik imza alanında ad soyadını yazıp imzasını çizerek ve onay beyanlarını işaretleyerek Sözleşme’yi onaylar. Onay tarihi-saati, IP adresi ve cihaz bilgisi bu bölümde gösterilir."}</p>
      </section>

      {addenda?.length ? <ContractAddenda addenda={addenda} schedule={schedule} currency={currency} contractNo={String(row.contract_no || "")} print={print} renderActions={addendumActions} /> : null}

      {!legacy && kind === "consumer" ? <PreInformationAnnex ctx={ctx} /> : null}

      {!print && !signed && ["draft", "sent"].includes(row.status) ? signatureForm : null}
      {!print && proposalLink ? <p className="doc-related print-hide"><a className="doc-btn" href={`/teklif/${proposalLink.token}`}>Bu sözleşmenin dayandığı teklifi görüntüle{proposalLink.no ? ` · ${proposalLink.no}` : ""}</a></p> : null}

      <DocFooter provider={provider} reference={<>{row.contract_no} · Metin v{legacy ? row.contract_template_version || template.version : textVersion}</>} verificationUrl={signed ? verificationUrl : null} />
      <div className="doc-confidential">Gizlidir · Yalnızca sözleşme tarafları içindir</div>
    </article>
  </main>;
}
