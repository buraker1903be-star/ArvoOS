import type { ReactNode } from "react";
import { detectCity, formatMoney, formatDate, installmentStatusLabel, taxIdLabel, type DocumentRow, type ScheduleRow, type TaxBreakdown } from "./format";
import { formatIban } from "./identifiers";
import type { WorkPlanItem } from "@/lib/work-plan";

export type Provider = {
  /** Taraf adı: ticari unvan girilmişse o, yoksa kurum adı. */
  name: string;
  /** Başlıktaki marka/kurum adı (logo yoksa). */
  brandName?: string | null;
  /** "Belge alt bilgisi" serbest metni. Resmi adres yoksa adres yerine kullanılır (eski davranış). */
  info?: string | null;
  /** Resmi adres: sokak/no satırı + "İlçe / İl". */
  address?: string | null;
  /** Yetkili mahkeme için il: il alanı, yoksa adres/alt bilgi metninden. */
  city?: string | null;
  taxOffice?: string | null;
  taxNumber?: string | null;
  mersisNo?: string | null;
  bankName?: string | null;
  accountHolder?: string | null;
  iban?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  stampUrl?: string | null;
};

export type Customer = {
  name: string;
  address?: string | null;
  taxNumber?: string | null;
  taxOffice?: string | null;
  email?: string | null;
  phone?: string | null;
};

type Row = [string, ReactNode | null | undefined];

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Belge satırındaki organization_* alanlarından Hizmet Sağlayıcı / Teklif Veren bilgisi. */
export function providerFromRow(row: DocumentRow, fallbackName: string): Provider {
  const brandName = text(row.organization_name) ?? fallbackName;
  const street = text(row.organization_legal_address);
  const city = text(row.organization_legal_city);
  const locality = [text(row.organization_legal_district), city].filter(Boolean).join(" / ");
  const info = text(row.organization_document_footer);
  return {
    name: text(row.organization_legal_name) ?? brandName,
    brandName,
    info,
    address: street ? [street, locality].filter(Boolean).join("\n") : null,
    city: city ?? detectCity(street ?? info),
    taxOffice: text(row.organization_tax_office),
    taxNumber: text(row.organization_tax_number),
    mersisNo: text(row.organization_mersis_no),
    bankName: text(row.organization_bank_name),
    accountHolder: text(row.organization_bank_account_holder),
    iban: text(row.organization_iban),
    email: text(row.organization_contact_email),
    phone: text(row.organization_contact_phone),
    website: text(row.organization_website_url),
    logoUrl: text(row.organization_logo_url),
    stampUrl: text(row.organization_signature_stamp_url),
  };
}

/** "Kadıköy V.D. · VKN 1234567890" */
export function providerTaxLine(provider: Provider) {
  const digits = String(provider.taxNumber || "").replace(/\D/g, "");
  const id = digits.length === 10 ? `VKN ${digits}` : digits.length === 11 ? `TCKN ${digits}` : provider.taxNumber ? `Vergi No ${provider.taxNumber}` : null;
  return [provider.taxOffice ? `${provider.taxOffice} V.D.` : null, id].filter(Boolean).join(" · ") || null;
}

export function providerRows(provider: Provider): Row[] {
  const taxId = taxIdLabel(provider.taxNumber);
  return [
    [provider.address ? "Adres" : "Adres / Bilgi", provider.address || provider.info || "Ticaret siciline kayıtlı merkez adresi"],
    ["Vergi Dairesi", provider.taxOffice],
    [taxId?.label ?? "Vergi No", taxId?.value ?? null],
    ["MERSİS No", provider.mersisNo],
    ["E-posta", provider.email],
    ["Telefon", provider.phone],
    ["Web", provider.website],
  ];
}

export function customerRows(customer: Customer): Row[] {
  const taxId = taxIdLabel(customer.taxNumber);
  return [
    ["Adres", customer.address || "Müşterinin bildirdiği adres"],
    [taxId?.label ?? "Kimlik / VKN", taxId?.value ?? null],
    ["Vergi Dairesi", customer.taxOffice],
    ["E-posta", customer.email],
    ["Telefon", customer.phone],
  ];
}

export function PartyCard({ role, name, rows }: { role: string; name: string; rows: Row[] }) {
  const visible = rows.filter(([, value]) => value != null && value !== "");
  return <div className="ad-party">
    <h3>{role}</h3>
    <strong>{name}</strong>
    <dl className="ad-dl">{visible.map(([label, value]) => <div key={label} style={{ display: "contents" }}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </div>;
}

/** Havale/EFT için kurumun banka hesabı; IBAN yoksa hiçbir şey çizmez. */
export function BankAccountBox({ provider }: { provider: Provider }) {
  if (!provider.iban) return null;
  return <div className="ad-bank">
    {provider.bankName ? <div><small>Banka</small><strong>{provider.bankName}</strong></div> : null}
    <div><small>Hesap sahibi</small><strong>{provider.accountHolder || provider.name}</strong></div>
    <div className="ad-bank-iban"><small>IBAN</small><strong>{formatIban(provider.iban)}</strong></div>
  </div>;
}

export function DocHeader({ provider, kicker, number, meta }: { provider: Provider; kicker: string; number: string; meta: [string, string][] }) {
  const brand = provider.brandName || provider.name;
  const detail = provider.address || provider.info;
  return <header className="ad-head">
    <div className="ad-head-brand">
      {provider.logoUrl ? <img src={provider.logoUrl} alt={`${brand} logosu`} /> : <div className="ad-wordmark">{brand}</div>}
      {detail ? <p>{detail}</p> : null}
    </div>
    <div className="ad-head-meta">
      <div className="ad-kicker">{kicker}</div>
      <strong>{number}</strong>
      <div className="ad-rule" />
      <dl className="ad-meta">{meta.map(([label, value]) => <div key={label} style={{ display: "contents" }}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </div>
  </header>;
}

export function SectionHeading({ index, children }: { index?: string; children: ReactNode }) {
  return <h2 className="ad-sec-h">{index ? <b>{index}</b> : null}{children}</h2>;
}

export function PaymentPlanTable({ rows, currency }: { rows: ScheduleRow[]; currency: string }) {
  const showStatus = rows.some((row) => row.status);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return <div className="ad-table-wrap"><table className="ad-table">
    <thead><tr>
      <th style={{ width: "8%" }}>No</th>
      <th>Ödeme</th>
      <th style={{ width: showStatus ? "25%" : "30%" }}>Vade / Koşul</th>
      <th className="ad-num" style={{ width: "10%" }}>Oran</th>
      <th className="ad-num" style={{ width: "19%" }}>Tutar</th>
      {showStatus ? <th className="ad-center" style={{ width: "13%" }}>Durum</th> : null}
    </tr></thead>
    <tbody>{rows.map((row) => <tr key={row.sequence}>
      <td>{row.sequence}</td>
      <td><strong>{row.label}</strong></td>
      <td>{row.dueDate ? formatDate(row.dueDate) : row.trigger || "Sözleşmede belirtilen koşulla"}{row.dueDate && row.trigger ? <><br /><span style={{ color: "var(--ad-muted)" }}>{row.trigger}</span></> : null}</td>
      <td className="ad-num">%{row.percentage.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</td>
      <td className="ad-num"><strong>{formatMoney(row.amount, currency)}</strong>{row.paymentUrl && row.status !== "paid" ? <><br /><a className="ad-paylink print-hide" href={row.paymentUrl} target="_blank" rel="noopener noreferrer">Kartla öde →</a></> : null}</td>
      {showStatus ? <td className="ad-center">{row.status ? <span className={row.status === "paid" ? "ad-pill ad-pill-ok" : row.status === "overdue" ? "ad-pill ad-pill-bad" : "ad-pill"}>{installmentStatusLabel(row.status)}</span> : "—"}</td> : null}
    </tr>)}</tbody>
    <tfoot><tr><td colSpan={4}>Plan toplamı</td><td className="ad-num">{formatMoney(total, currency)}</td>{showStatus ? <td /> : null}</tr></tfoot>
  </table></div>;
}

/** Ara teslim takvimi (sözleşme madde 4 ve ek protokoller). */
export function WorkPlanTable({ items }: { items: WorkPlanItem[] }) {
  return <div className="ad-table-wrap"><table className="ad-table ad-table-compact">
    <thead><tr>
      <th style={{ width: "8%" }}>No</th>
      <th>Ara teslim / iş adımı</th>
      <th style={{ width: "24%" }}>Teslim tarihi</th>
    </tr></thead>
    <tbody>{items.map((item) => <tr key={item.sequence}>
      <td>{item.sequence}</td>
      <td><strong>{item.title}</strong></td>
      <td>{formatDate(item.due_date)}</td>
    </tr>)}</tbody>
  </table></div>;
}

export const taxStatusText: Record<TaxBreakdown["status"], string> = {
  included: "Fiyata KDV dahildir",
  excluded: "Fiyata KDV ayrıca eklenmiştir",
  exempt: "KDV istisnası uygulanır",
  unknown: "Vergiler faturada gösterilir",
};

export function TaxTotals({ tax, currency, words }: { tax: TaxBreakdown; currency: string; words?: string }) {
  return <div className="ad-totals">
    <div><span>Hizmet bedeli {tax.status === "unknown" ? "" : "(KDV hariç)"}</span><span>{formatMoney(tax.net, currency)}</span></div>
    {tax.status === "included" || tax.status === "excluded" ? <div><span>KDV (%{tax.rate.toLocaleString("tr-TR")})</span><span>{formatMoney(tax.tax, currency)}</span></div> : null}
    {tax.status === "exempt" ? <div><span>KDV</span><span>İstisna</span></div> : null}
    <div><span>Vergi durumu</span><span>{taxStatusText[tax.status]}</span></div>
    <div className="ad-grand"><span>Genel toplam</span><span>{formatMoney(tax.gross, currency)}</span></div>
    {words ? <p className="ad-words">({words})</p> : null}
  </div>;
}

export function DocFooter({ provider, reference, verificationUrl }: { provider: Provider; reference: ReactNode; verificationUrl?: string | null }) {
  const contact = [provider.phone, provider.email, provider.website].filter(Boolean).join("\n");
  const identity = [provider.address || provider.info || "Profesyonel hizmetler", providerTaxLine(provider), provider.mersisNo ? `MERSİS ${provider.mersisNo}` : null].filter(Boolean).join("\n");
  // <footer> değil <div>: app/globals.css'teki site alt bilgisi kuralları
  // (footer{background:#050505;color:#fff;padding:130px 0 40px}) belgeye
  // sızıyor, alt bilgiyi lacivert zemin üzerinde koyu metne çeviriyordu.
  return <div className="ad-foot" role="contentinfo">
    <div><strong>{provider.name}</strong>{identity}</div>
    <div><strong>İletişim</strong>{contact || "Kurum iletişim bilgileri"}</div>
    <div className="ad-right"><strong>Belge</strong>{reference}{verificationUrl ? <><br /><span style={{ wordBreak: "break-all" }}>{verificationUrl}</span></> : null}</div>
    {provider.address && provider.info ? <p className="ad-foot-note">{provider.info}</p> : null}
  </div>;
}
