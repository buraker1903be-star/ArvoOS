import Link from "next/link";
import { resolvePublicHost } from "@/lib/public-host";
import { formatPersonName } from "@/lib/format-name";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ConfirmDeleteButton } from "../../../accounts/confirm-delete-button";
import { deleteContract, issueContractLink, markContractStatus, updateContract } from "../../sales-actions";
import { PanelDrawer } from "../../../components/panel-drawer";
import { ContractPaymentPlanForm } from "../../contract-payment-plan-form";
import { contractMessages, organizationBrandName } from "@/lib/customer-message-templates";
import { InternalComments } from "../../internal-comments";
import { RecordHistory } from "../../record-history";
import "../../request-page.css";
import "../../crm.css";

type Props = { params: Promise<{ id: string }> };
const labels: Record<string, string> = { draft: "Taslak", sent: "İmza bekliyor", signed: "İmzalandı", rejected: "Reddedildi", cancelled: "İptal", completed: "Tamamlandı" };
const money = (value: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value / 100);
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("tr-TR") : "—";

export default async function ContractDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase, membership, modules, organization } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const { data, error } = await supabase
    .from("crm_contracts")
    .select("id,contract_no,title,scope,amount,currency,payment_plan,payment_plan_type,start_date,due_date,status,created_at,sent_at,first_viewed_at,last_viewed_at,view_count,share_token,signed_name,signed_at,workflow_id,tracking_code,customer_address,customer_tax_number,customer_tax_office,opportunity_id,crm_opportunities!inner(id,customer_name,contact_email,contact_phone,title,assigned_employee_id,request_details)")
    .eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (error) throw new Error("Sözleşme bilgileri okunamadı: " + error.message);
  if (!data) notFound();
  const customer = Array.isArray(data.crm_opportunities) ? data.crm_opportunities[0] : data.crm_opportunities;
  let representative = "Atanmamış";
  if (customer?.assigned_employee_id) {
    const { data: employee } = await supabase.from("hr_employees").select("full_name").eq("id", customer.assigned_employee_id).eq("organization_id", membership.organization_id).maybeSingle();
    representative = employee?.full_name ?? "Pasif personel";
  }
  const locked = ["signed", "completed", "rejected", "cancelled"].includes(data.status);
  const publicHost = await resolvePublicHost(supabase, membership.organization_id);
  // Sözleşme bağlantısı token'ı sabit; bir kez üretildikten sonra
  // sayfanın üstünde kalıcı gösteriliyor (teklif detayıyla aynı davranış).
  const shareUrl = data.share_token
    ? `https://${publicHost}/sozlesme/${data.share_token}`
    : "";
  const brandName = organizationBrandName({
    slug: organization.slug,
    displayName: organization.display_name,
    legalName: organization.name,
  });
  const messages = shareUrl
    ? contractMessages({
        organizationName: brandName,
        customerName: formatPersonName(customer?.customer_name),
        documentNo: data.contract_no,
        title: data.title,
        formattedAmount: money(Number(data.amount), data.currency || "TRY"),
        url: shareUrl,
      })
    : null;
  const canDelete = ["owner", "admin", "manager"].includes(membership.role);
  return (
    <div className="crm-request-detail-page">
      <div className="panel-pagehead">
        <div><small className="panel-kicker">CRM / SÖZLEŞME DETAYI</small><h1>{data.contract_no}</h1><p>{formatPersonName(customer?.customer_name)} · {data.title}</p></div>
        <Link className="panel-secondary" href="/panel/crm/contracts">Sözleşmelere Dön</Link>
      </div>
      {shareUrl ? (
        <section className="panel-card share-ready-card">
          <div className="share-ready-icon">✓</div>
          <div className="share-ready-body">
            <small className="panel-kicker">MÜŞTERİ BAĞLANTISI</small>
            <h2>Sözleşme bağlantısı</h2>
            <div className="share-ready-link">
              <span style={{ wordBreak: "break-all" }}>{shareUrl}</span>
            </div>
            <div className="panel-page-actions">
              {customer?.contact_email && messages ? (
                <a className="panel-primary" href={`mailto:${encodeURIComponent(customer.contact_email)}?subject=${encodeURIComponent(messages.subject)}&body=${encodeURIComponent(messages.email)}`}>
                  ✉ E-posta ile gönder
                </a>
              ) : null}
              {messages ? (
                <a className="panel-secondary" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(messages.whatsapp)}`}>
                  💬 WhatsApp ile gönder
                </a>
              ) : null}
              <a className="panel-secondary" target="_blank" rel="noreferrer" href={shareUrl}>
                👁 Önizle
              </a>
            </div>
          </div>
        </section>
      ) : null}
      <div className="crm-detail-split">
        <div className="crm-detail-main">
      <section className="panel-card crm-request-detail-card">
        <div className="crm-request-detail-heading"><div><span className="status-pill">{labels[data.status] ?? data.status}</span><h2>{data.title}</h2></div><strong>{money(data.amount, data.currency)}</strong></div>
        <dl className="crm-request-detail-grid">
          <div><dt>Müşteri</dt><dd>{customer?.customer_name || "—"}</dd></div>
          <div><dt>Temsilci</dt><dd>{representative}</dd></div>
          <div><dt>Telefon</dt><dd>{customer?.contact_phone || "—"}</dd></div>
          <div><dt>E-posta</dt><dd>{customer?.contact_email || "—"}</dd></div>
          <div><dt>Ödeme planı</dt><dd>{data.payment_plan || "—"}</dd></div>
          <div><dt>Başlangıç</dt><dd>{date(data.start_date)}</dd></div>
          <div><dt>Teslim</dt><dd>{date(data.due_date)}</dd></div>
          <div><dt>İmzalayan</dt><dd>{data.signed_name || "Bekleniyor"}</dd></div>
          <div><dt>Takip kodu</dt><dd>{data.tracking_code || "—"}</dd></div>
          <div><dt>Görüntülenme</dt><dd>{data.view_count || 0} kez</dd></div>
        </dl>
        {data.scope ? <div className="crm-request-detail-note"><small>KAPSAM</small><p>{data.scope}</p></div> : null}
        <div className="crm-request-detail-actions">
          <small className="panel-kicker">İŞLEMLER</small>
          <div>
          {!locked ? <form action={issueContractLink}><input type="hidden" name="contract_id" value={data.id}/><input type="hidden" name="redirect_to" value={`/panel/crm/contracts/${data.id}`}/><button className="panel-primary">İmzaya Gönder</button></form> : null}
          {data.workflow_id ? <Link className="panel-secondary" href={`/panel/operations/${data.workflow_id}`}>İş Akışını Aç</Link> : null}
          {!locked ? (
            <PanelDrawer triggerLabel="Düzenle" title={data.contract_no} description="Sözleşme bilgilerini kontrol edin.">
            <form className="panel-form" action={updateContract}>
              <input type="hidden" name="contract_id" value={data.id} />
              <input
                type="hidden"
                name="opportunity_id"
                value={customer?.id ?? ""}
              />
              <input
                type="hidden"
                name="current_details"
                value={JSON.stringify(customer?.request_details ?? {})}
              />
              <p className="wide panel-form-note">
                Müşteri / Talep Bilgileri
              </p>
              <label>
                Müşteri adı
                <input
                  name="customer_name"
                  defaultValue={customer?.customer_name ?? ""}
                />
              </label>
              <label>
                Telefon
                <input
                  name="contact_phone"
                  defaultValue={customer?.contact_phone ?? ""}
                />
              </label>
              <label>
                E-posta
                <input
                  name="contact_email"
                  defaultValue={customer?.contact_email ?? ""}
                />
              </label>
              <label>
                Hizmet türü
                <input
                  name="service_type"
                  defaultValue={String(
                    customer?.request_details?.service_type ?? "",
                  )}
                />
              </label>
              <label>
                Akademik seviye
                <input
                  name="academic_level"
                  defaultValue={String(
                    customer?.request_details?.academic_level ?? "",
                  )}
                />
              </label>
              <label>
                Üniversite
                <input
                  name="university"
                  defaultValue={String(
                    customer?.request_details?.university ?? "",
                  )}
                />
              </label>
              <label>
                Bölüm
                <input
                  name="department"
                  defaultValue={String(
                    customer?.request_details?.department ?? "",
                  )}
                />
              </label>
              <p className="wide panel-form-note">Sözleşme Bilgileri</p>
              <label>
                Başlık
                <input name="title" defaultValue={data.title} required />
              </label>
              <label>
                Tutar
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={(data.amount / 100).toFixed(2)}
                  required
                />
              </label>
              <label className="wide">
                Kapsam
                <textarea
                  name="scope"
                  defaultValue={data.scope ?? ""}
                  required
                />
              </label>
              <label>
                Ödeme planı
                <input
                  name="payment_plan"
                  defaultValue={data.payment_plan ?? ""}
                />
              </label>
              <label>
                Başlangıç
                <input
                  name="start_date"
                  type="date"
                  defaultValue={data.start_date ?? ""}
                />
              </label>
              <label>
                Teslim
                <input
                  name="due_date"
                  type="date"
                  defaultValue={data.due_date ?? ""}
                />
              </label>
              <label className="wide">
                Adres{" "}
                <small
                  style={{ fontWeight: 400, color: "var(--muted)" }}
                >
                  (kurumsal müşteri için)
                </small>
                <input
                  name="customer_address"
                  defaultValue={data.customer_address ?? ""}
                  placeholder="Fatura/sözleşme adresi"
                />
              </label>
              <label>
                Vergi numarası
                <input
                  name="customer_tax_number"
                  defaultValue={data.customer_tax_number ?? ""}
                  placeholder="VKN / TCKN"
                />
              </label>
              <label>
                Vergi dairesi
                <input
                  name="customer_tax_office"
                  defaultValue={data.customer_tax_office ?? ""}
                />
              </label>
              <div className="wide panel-form-actions">
                <button className="panel-primary">Kaydet</button>
              </div>
            </form>
            </PanelDrawer>
          ) : null}
            <PanelDrawer
                                      triggerLabel="Takip Kodu"
                                      title={data.contract_no}
                                      description="Müşteri bu kodla kendi iş durumunu görebilir."
                                    >
                                      {(() => {
                                        const trackingUrl = `https://${publicHost}/takip`;
                                        const waText = `Merhaba ${customer?.customer_name ?? ""},\n\n${brandName} üzerinden yürütülen dosyanızın güncel durumunu aşağıdaki bağlantıdan takip edebilirsiniz:\n\n${trackingUrl}\n\nTakip Kodunuz: ${data.tracking_code}\n\nBağlantıyı açtıktan sonra 6 haneli takip kodunuzu girerek dosyanızın mevcut durumunu görüntüleyebilirsiniz.\n\n${brandName}`;
                                        return (
                                          <div className="crm-request-preview">
                                            <p>
                                              <b>Takip Kodu</b>
                                            </p>
                                            <p
                                              style={{
                                                fontSize: 20,
                                                fontWeight: 800,
                                                letterSpacing: 3,
                                              }}
                                            >
                                              {data.tracking_code}
                                            </p>
                                            <p style={{ wordBreak: "break-all" }}>
                                              {trackingUrl}
                                            </p>
                                            <div className="panel-page-actions">
                                              <a
                                                className="panel-primary"
                                                target="_blank"
                                                rel="noreferrer"
                                                href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
                                              >
                                                WhatsApp ile gönder
                                              </a>
                                              <a
                                                className="panel-secondary"
                                                target="_blank"
                                                rel="noreferrer"
                                                href={`${trackingUrl}?code=${encodeURIComponent(data.tracking_code)}`}
                                              >
                                                Önizle
                                              </a>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </PanelDrawer>
            <PanelDrawer
                                      triggerLabel="Ödeme Planı"
                                      title={data.contract_no}
                                      description="Müşteri talebiyle ödeme planını revize edin (örn. 3 taksite bölme)."
                                    >
                                      <ContractPaymentPlanForm
                                        contractId={data.id}
                                        amountCents={data.amount}
                                        currentPlanType={data.payment_plan_type}
                                      />
                                    </PanelDrawer>
          {!locked ? <form action={markContractStatus}><input type="hidden" name="contract_id" value={data.id}/><input type="hidden" name="status" value="rejected"/><button className="panel-secondary">Reddedildi</button></form> : null}
          {!locked ? <form action={markContractStatus}><input type="hidden" name="contract_id" value={data.id}/><input type="hidden" name="status" value="cancelled"/><button className="panel-secondary">İptal</button></form> : null}
          {canDelete ? <form action={deleteContract}><input type="hidden" name="contract_id" value={data.id}/><ConfirmDeleteButton label="Sil" confirmMessage={`${data.contract_no} sözleşmesini kalıcı olarak silmek istediğinize emin misiniz?`}/></form> : null}
          </div>
        </div>
      </section>
          <RecordHistory opportunityId={data.opportunity_id} />
        </div>
        <aside className="crm-detail-side">
  <InternalComments opportunityId={data.opportunity_id} contextType="contract" contextId={data.id} />
        </aside>
      </div>
    </div>
  );
}
