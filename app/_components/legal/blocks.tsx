import type { ReactNode } from "react";
import { formatMoney, formatDate, installmentStatusLabel, taxIdLabel, type ScheduleRow, type TaxBreakdown } from "./format";

export type Provider = {
  name: string;
  info?: string | null;
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

export function providerRows(provider: Provider): Row[] {
  return [
    ["Adres / Bilgi", provider.info || "Ticaret siciline kayıtlı merkez adresi"],
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

export function DocHeader({ provider, kicker, number, meta }: { provider: Provider; kicker: string; number: string; meta: [string, string][] }) {
  return <header className="ad-head">
    <div className="ad-head-brand">
      {provider.logoUrl ? <img src={provider.logoUrl} alt={`${provider.name} logosu`} /> : <div className="ad-wordmark">{provider.name}</div>}
      {provider.info ? <p>{provider.info}</p> : null}
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
  return <footer className="ad-foot">
    <div><strong>{provider.name}</strong>{provider.info || "Profesyonel hizmetler"}</div>
    <div><strong>İletişim</strong>{contact || "Kurum iletişim bilgileri"}</div>
    <div className="ad-right"><strong>Belge</strong>{reference}{verificationUrl ? <><br /><span style={{ wordBreak: "break-all" }}>{verificationUrl}</span></> : null}</div>
  </footer>;
}
