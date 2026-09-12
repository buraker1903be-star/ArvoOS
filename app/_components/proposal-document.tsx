import type { CSSProperties, ReactNode } from "react";
import { PrintDocumentButton } from "@/app/_components/print-document-button";
import { PrintAutorun } from "@/app/_components/print-autorun";
import { DocFooter, DocHeader, PartyCard, PaymentPlanTable, SectionHeading, TaxTotals, customerRows, providerRows, type Customer, type Provider } from "@/app/_components/legal/blocks";
import { documentCss } from "@/app/_components/legal/document-styles";
import { amountInWords, computeTaxBreakdown, formatDate, formatDateTime, formatMoney, pdfFileName, safeBrandColor, splitScope, summarizeUserAgent, type DocumentRow } from "@/app/_components/legal/format";
import { buildSchedule } from "@/app/_components/legal/schedule";

const statuses: Record<string, string> = { draft: "Taslak", sent: "Onay bekliyor", accepted: "Kabul edildi", rejected: "Reddedildi", expired: "Süresi doldu", archived: "Karar tamamlandı" };

export type ProposalDecision = {
  status: string;
  responded_at: string | null;
  response_ip: string | null;
  response_user_agent?: string | null;
  contract_share_token: string | null;
  contract_no: string | null;
};

type Props = {
  row: DocumentRow;
  decision?: ProposalDecision | null;
  verificationUrl?: string | null;
  mode?: "screen" | "print";
  overlay?: boolean;
  toolbarLeft?: ReactNode;
  pdfHref?: string | null;
  backHref?: string | null;
  logDocumentId?: string | null;
  actions?: ReactNode;
  notice?: string | null;
};

export function ProposalDocument({ row, decision, verificationUrl, mode = "screen", overlay, toolbarLeft, pdfHref, backHref, logDocumentId, actions, notice }: Props) {
  const provider: Provider = {
    name: String(row.organization_name || "Teklif Veren"),
    info: row.organization_document_footer || null,
    email: row.organization_contact_email || null,
    phone: row.organization_contact_phone || null,
    website: row.organization_website_url || null,
    logoUrl: row.organization_logo_url || null,
    stampUrl: row.organization_signature_stamp_url || null,
  };
  const customer: Customer = { name: String(row.customer_name || "Müşteri"), email: row.contact_email || null, phone: row.contact_phone || null, address: row.customer_address || null };
  const currency = String(row.currency || "TRY");
  const tax = computeTaxBreakdown(row);
  const schedule = buildSchedule({ schedule: row.payment_schedule, total: tax.gross, planType: row.payment_plan_type, planLabel: row.payment_plan, frozen: row.status === "accepted" });
  const scopeItems = splitScope(row.scope, row.title);
  const title = String(row.title || scopeItems[0] || "Profesyonel Hizmet Teklifi");
  const decided = decision && ["accepted", "rejected"].includes(decision.status) ? decision : null;
  const print = mode === "print";
  const fileName = pdfFileName("Teklif", row.proposal_no);
  const css = documentCss({ footerLeft: `${row.proposal_no || ""} · Hizmet Teklifi · ${provider.name}` });
  const rootClass = ["ad-root", print ? "ad-print" : "", print && overlay ? "ad-print-overlay" : ""].filter(Boolean).join(" ");
  const taxCell = tax.status === "included" || tax.status === "excluded" ? `%${tax.rate.toLocaleString("tr-TR")}` : tax.status === "exempt" ? "İstisna" : "—";

  return <main className={rootClass} style={{ "--ad-brand": safeBrandColor(row.organization_primary_color) } as CSSProperties}>
    <style>{css}</style>
    {print
      ? <PrintAutorun fileName={fileName} backHref={backHref} />
      : <div className="ad-toolbar print-hide"><div>{toolbarLeft}</div><div className="ad-toolbar-actions">{pdfHref ? <PrintDocumentButton href={pdfHref} documentType="proposal" documentId={logDocumentId ?? undefined} documentNumber={row.proposal_no} /> : null}</div></div>}
    <article className="ad-sheet">
      <div className="ad-band" />
      <DocHeader provider={provider} kicker="Hizmet Teklifi" number={String(row.proposal_no || "")} meta={[
        ["Düzenleme", formatDate(row.created_at)],
        ["Geçerlilik", formatDate(row.valid_until)],
        ["Durum", statuses[row.status] || row.status || "—"],
      ]} />
      <section className="ad-title">
        <div className="ad-kicker">Teklif Konusu</div>
        <h1>{title}</h1>
        <p>Sayın {customer.name}, talebiniz doğrultusunda hazırlanan hizmet kapsamı, fiyatlandırma ve ticari koşullar aşağıda bilgilerinize sunulmuştur.</p>
      </section>
      {notice && !print ? <div className="ad-notice print-hide">{notice}</div> : null}

      <section className="ad-sec"><div className="ad-grid-2">
        <PartyCard role="Teklif Veren" name={provider.name} rows={providerRows(provider)} />
        <PartyCard role="Teklif Sunulan" name={customer.name} rows={customerRows(customer).filter(([label]) => label !== "Adres" || customer.address)} />
      </div></section>

      <section className="ad-sec"><div className="ad-facts">
        <div className="ad-fact ad-fact-dark"><small>Teklif tutarı</small><strong>{formatMoney(tax.gross, currency)}</strong></div>
        <div className="ad-fact"><small>Geçerlilik tarihi</small><strong>{formatDate(row.valid_until)}</strong></div>
        <div className="ad-fact"><small>Tahmini teslim</small><strong>{formatDate(row.estimated_delivery_date, "Sözleşmede belirlenir")}</strong></div>
        <div className="ad-fact"><small>Ödeme modeli</small><strong>{schedule.length === 1 ? "Tek ödeme" : `${schedule.length} taksit`}</strong></div>
      </div></section>

      <section className="ad-sec">
        <SectionHeading index="01">Hizmet Kapsamı</SectionHeading>
        <div className="ad-box"><ul className="ad-list">{scopeItems.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
      </section>

      <section className="ad-sec">
        <SectionHeading index="02">Fiyatlandırma</SectionHeading>
        <div className="ad-table-wrap"><table className="ad-table">
          <thead><tr><th style={{ width: "6%" }}>#</th><th>Hizmet / Açıklama</th><th className="ad-center" style={{ width: "9%" }}>Miktar</th><th className="ad-num" style={{ width: "17%" }}>Birim fiyat</th><th className="ad-center" style={{ width: "9%" }}>KDV</th><th className="ad-num" style={{ width: "18%" }}>Toplam</th></tr></thead>
          <tbody><tr>
            <td>1</td>
            <td><strong>{title}</strong>{scopeItems.length > 1 || scopeItems[0] !== title ? <ul>{scopeItems.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}</td>
            <td className="ad-center">1 hizmet</td>
            <td className="ad-num">{formatMoney(tax.net, currency)}</td>
            <td className="ad-center">{taxCell}</td>
            <td className="ad-num"><strong>{formatMoney(tax.gross, currency)}</strong></td>
          </tr></tbody>
        </table></div>
        <TaxTotals tax={tax} currency={currency} words={amountInWords(tax.gross, currency)} />
      </section>

      <section className="ad-sec">
        <SectionHeading index="03">Ödeme Koşulları</SectionHeading>
        <PaymentPlanTable rows={schedule} currency={currency} />
        <div className="ad-box" style={{ marginTop: "3mm" }}><ul className="ad-list">
          <li>Ödemeler, teklifin kabulüyle oluşturulan Hizmet Sözleşmesi’ndeki ödeme planına göre, aynı tutarlarla yapılır.</li>
          <li><b>Havale / EFT:</b> yalnızca {provider.name} unvanına kayıtlı banka hesabına; hesap bilgileri fatura ve yazılı bildirimle iletilir. Hesap değişikliği bildirimleri kayıtlı iletişim kanallarımızdan teyit edilmeden dikkate alınmamalıdır.</li>
          <li><b>Kredi / banka kartı:</b> güvenli ödeme bağlantısı üzerinden; kart bilgileri tarafımızca görülmez ve saklanmaz.</li>
          <li>Her ödeme için 213 sayılı Vergi Usul Kanunu uyarınca e-Fatura / e-Arşiv Fatura düzenlenir.</li>
        </ul></div>
      </section>

      <section className="ad-sec">
        <SectionHeading index="04">Geçerlilik ve Kabul</SectionHeading>
        <div className="ad-box"><ul className="ad-list">
          <li>Bu teklif {formatDate(row.valid_until)} tarihine kadar geçerlidir. Bu tarihten sonra fiyat ve koşullar yeniden değerlendirilir.</li>
          <li>Teklifin elektronik olarak kabulüyle aynı kapsam, bedel ve ödeme planını içeren Hizmet Sözleşmesi oluşturulur ve onayınıza sunulur; hizmet ilişkisi sözleşmenin onaylanmasıyla kurulur.</li>
          <li>Tahmini teslim tarihi {formatDate(row.estimated_delivery_date, "sözleşmede belirlenecektir")}; kesin iş takvimi sözleşmede yer alır.</li>
          <li>Kapsamda yer almayan talepler ayrıca fiyatlandırılır.</li>
          <li>Tüketici sıfatıyla hareket eden müşterilerin 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği’nden doğan hakları (cayma hakkı dahil) saklıdır.</li>
        </ul></div>
      </section>

      <section className="ad-sec">
        <SectionHeading index="05">Gizlilik</SectionHeading>
        <div className="ad-box">
          <p>Bu teklif ve ekleri yalnızca muhatabı için hazırlanmıştır. İçerdiği fiyat, kapsam ve yöntem bilgileri ticari sır niteliğinde olup {provider.name}’in yazılı onayı olmaksızın üçüncü kişilerle paylaşılamaz, çoğaltılamaz veya teklifin değerlendirilmesi dışında bir amaçla kullanılamaz.</p>
          <p>Teklif sürecinde paylaşılan kişisel veriler 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında yalnızca teklifin hazırlanması, değerlendirilmesi ve sözleşme süreci amacıyla işlenir.</p>
        </div>
      </section>

      <section className="ad-sec ad-sign-block">
        <SectionHeading index="06">Onay</SectionHeading>
        <div className="ad-sign">
          <div className="ad-sign-card">
            <h3>Teklif Veren</h3>
            <div className="ad-sign-name">{provider.name}</div>
            <div className="ad-sign-sub">Yetkili imza ve kaşe</div>
            <div className="ad-sign-art">{provider.stampUrl ? <img src={provider.stampUrl} alt="Firma kaşe ve imzası" /> : <span className="ad-sign-empty">Kaşe / İmza</span>}</div>
            <dl className="ad-audit"><dt>Düzenleme</dt><dd>{formatDate(row.created_at)}</dd><dt>Belge no</dt><dd>{row.proposal_no}</dd></dl>
          </div>
          {decided ? <div className={decided.status === "accepted" ? "ad-decision" : "ad-decision is-rejected"}>
            <div className="ad-decision-badge"><i>{decided.status === "accepted" ? "✓" : "✕"}</i>{decided.status === "accepted" ? "Teklif elektronik olarak kabul edildi" : "Teklif reddedildi"}</div>
            <dl className="ad-audit">
              <dt>Müşteri</dt><dd>{customer.name}</dd>
              <dt>Karar tarihi ve saati</dt><dd>{formatDateTime(decided.responded_at)}</dd>
              <dt>IP adresi</dt><dd>{decided.response_ip || "Kayıt bulunamadı"}</dd>
              <dt>Cihaz / tarayıcı</dt><dd>{summarizeUserAgent(decided.response_user_agent) || "Kayıt bulunamadı"}</dd>
              <dt>Belge referansı</dt><dd>{row.proposal_no}</dd>
            </dl>
            {decided.status === "accepted" && decided.contract_share_token && !print ? <a className="ad-decision-link print-hide" href={`/sozlesme/${decided.contract_share_token}`}>Bu tekliften oluşan sözleşmeyi görüntüle{decided.contract_no ? ` · ${decided.contract_no}` : ""}</a> : null}
          </div> : <div className="ad-sign-card">
            <h3>Müşteri Onayı</h3>
            <div className="ad-sign-name">{customer.name}</div>
            <div className="ad-sign-sub">Teklifi kabul ediyorum</div>
            <div className="ad-sign-art"><span className="ad-sign-empty">İmza</span></div>
            <div className="ad-blank"><span>Ad Soyad</span><span>Tarih</span></div>
          </div>}
        </div>
        <p className="ad-legal-note">Teklifin bu sayfa üzerinden elektronik olarak kabulü; karar tarihi-saati, IP adresi ve cihaz bilgisiyle birlikte kayıt altına alınır. Bu elektronik onay, 5070 sayılı Elektronik İmza Kanunu kapsamında güvenli elektronik imza niteliğinde değildir; taraf iradesini gösteren elektronik kayıt olarak saklanır.</p>
      </section>

      {!print ? actions : null}

      <DocFooter provider={provider} reference={<>{row.proposal_no}{row.revision_no ? ` · R${row.revision_no}` : ""}</>} verificationUrl={verificationUrl} />
      <div className="ad-confidential">Gizlidir · Yalnızca teklif muhatabı içindir</div>
    </article>
  </main>;
}
