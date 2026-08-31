import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../components/panel-drawer";
import { PanelBottomSheet } from "../../components/panel-bottom-sheet";
import {
  issueContractLink,
  updateContract,
  markContractStatus,
  deleteContract,
} from "../sales-actions";
import { ContractPaymentPlanForm } from "../contract-payment-plan-form";
import { ConfirmDeleteButton } from "../../accounts/confirm-delete-button";
import { CrmTabs } from "../crm-tabs";
import {
  contractMessages,
  organizationBrandName,
} from "@/lib/customer-message-templates";
import "../crm.css";

type Props = {
  searchParams: Promise<{
    search?: string;
    status?: string;
    share?: string;
    doc_no?: string;
    customer_name?: string;
    customer_email?: string;
    title?: string;
    amount?: string;
    currency?: string;
  }>;
};
type Contract = {
  id: string;
  contract_no: string;
  title: string;
  scope: string | null;
  amount: number;
  currency: string;
  payment_plan: string | null;
  payment_plan_type: string | null;
  start_date: string | null;
  due_date: string | null;
  status: string;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  signed_name: string | null;
  signed_at: string | null;
  workflow_id: string | null;
  created_at: string;
  customer_address: string | null;
  customer_tax_number: string | null;
  customer_tax_office: string | null;
  tracking_code: string;
  opportunity_id: string;
  crm_opportunities: {
    id: string;
    customer_name: string;
    contact_email: string | null;
    contact_phone: string | null;
    title: string;
    assigned_employee_id: string | null;
    request_details: Record<string, unknown> | null;
  } | null;
};
const statuses = ["draft", "sent", "signed", "rejected", "cancelled"];
const labels: Record<string, string> = {
  draft: "Taslak",
  sent: "İmza bekliyor",
  signed: "İmzalandı",
  rejected: "Reddedildi",
  cancelled: "İptal",
  completed: "Tamamlandı",
};
const money = (v: number, c: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: c }).format(
    v / 100,
  );
const dateTime = (v: string | null) =>
  v ? new Date(v).toLocaleString("tr-TR") : "—";
export default async function ContractsPage({ searchParams }: Props) {
  const p = await searchParams;
  const search = (p.search ?? "").trim();
  const status = statuses.includes(p.status ?? "") ? p.status! : "";
  const share = p.share ?? "";
  const docNo = p.doc_no ?? "";
  const customerName = p.customer_name ?? "";
  const customerEmail = p.customer_email ?? "";
  const { supabase, membership, organization, modules } =
    await getPanelContext();
  const canDelete = ["owner", "admin", "manager"].includes(membership.role);
  if (!modules.some((m) => m.code === "crm"))
    throw new Error("CRM modülüne erişiminiz yok.");
  let q = supabase
    .from("crm_contracts")
    .select(
      "id,contract_no,title,scope,amount,currency,payment_plan,payment_plan_type,start_date,due_date,status,sent_at,first_viewed_at,last_viewed_at,view_count,signed_name,signed_at,workflow_id,created_at,customer_address,customer_tax_number,customer_tax_office,tracking_code,opportunity_id,crm_opportunities!inner(id,customer_name,contact_email,contact_phone,title,assigned_employee_id,request_details)",
    )
    .eq("organization_id", membership.organization_id);
  if (status) q = q.eq("status", status);
  if (search) q = q.or(`contract_no.ilike.%${search}%,title.ilike.%${search}%`);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error("Sözleşmeler okunamadı: " + error.message);
  const allRows = (data ?? []) as unknown as Contract[];
  const visibleOpportunityIds = [
    ...new Set(allRows.map((row) => row.opportunity_id).filter(Boolean)),
  ];
  const { data: commentData, error: commentError } = visibleOpportunityIds.length
    ? await supabase
        .from("crm_internal_comments")
        .select("opportunity_id")
        .eq("organization_id", membership.organization_id)
        .in("opportunity_id", visibleOpportunityIds)
    : { data: [], error: null };
  if (commentError)
    throw new Error("Yorum sayıları okunamadı: " + commentError.message);
  const commentCounts = new Map<string, number>();
  for (const comment of commentData ?? []) {
    commentCounts.set(
      comment.opportunity_id,
      (commentCounts.get(comment.opportunity_id) ?? 0) + 1,
    );
  }
  const { data: employeeData, error: employeeError } = await supabase
    .from("hr_employees")
    .select("id,full_name")
    .eq("organization_id", membership.organization_id)
    .eq("employment_status", "active");
  if (employeeError)
    throw new Error("Temsilciler okunamadı: " + employeeError.message);
  const representativeMap = new Map(
    (employeeData ?? []).map((employee) => [employee.id, employee.full_name]),
  );
  const workflowIds = [
    ...new Set(
      allRows.filter((r) => r.workflow_id).map((r) => r.workflow_id as string),
    ),
  ];
  const completedWorkflowIds = new Set<string>();
  if (workflowIds.length) {
    const { data: workflows } = await supabase
      .from("operation_workflows")
      .select("id,status")
      .in("id", workflowIds);
    for (const wf of workflows ?? [])
      if (wf.status === "completed") completedWorkflowIds.add(wf.id);
  }
  const isArchived = (row: Contract) =>
    row.status === "completed" ||
    (Boolean(row.workflow_id) &&
      completedWorkflowIds.has(row.workflow_id as string));
  const rows = allRows.filter((row) => !isArchived(row));
  const archivedRows = allRows.filter(isArchived);
  const { data: domainOrg } = await supabase
    .from("organizations")
    .select("custom_domain,custom_domain_status")
    .eq("id", membership.organization_id)
    .maybeSingle();
  const publicHost =
    domainOrg?.custom_domain_status === "verified" && domainOrg.custom_domain
      ? domainOrg.custom_domain
      : "app.arvo-os.com";
  const shareUrl = share ? `https://${publicHost}/sozlesme/${share}` : "";
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const messages = contractMessages({
    organizationName: organizationBrandName({
      slug: organization.slug,
      displayName: organization.display_name,
      legalName: organization.name,
    }),
    customerName,
    documentNo: docNo,
    title: p.title,
    formattedAmount: p.amount
      ? money(Number(p.amount), p.currency || "TRY")
      : undefined,
    url: shareUrl,
  });
  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div>
          <small className="panel-kicker">CRM / SÖZLEŞMELER</small>
          <h1>Sözleşmeler</h1>
          <p>
            Tekliften oluşan sözleşmeleri kontrol edin, imzaya gönderin ve
            oluşan iş akışını takip edin.
          </p>
        </div>
        <div className="panel-page-actions">
          <span className="status-pill">{rows.length} kayıt</span>
          <Link className="panel-primary" href="/panel/crm/proposals">
            Tekliflere git
          </Link>
        </div>
      </div>
      <CrmTabs active="sozlesmeler" />
      <div className="module-tab-panel">
        {shareUrl ? (
          <section className="panel-card share-ready-card">
            <div className="share-ready-icon">✓</div>
            <div className="share-ready-body">
              <small className="panel-kicker">İMZA BAĞLANTISI HAZIR</small>
              <h2>Sözleşme bağlantısı</h2>
              <div className="share-ready-link">
                <span style={{ wordBreak: "break-all" }}>{shareUrl}</span>
              </div>
              <div className="panel-page-actions">
                <a
                  className="panel-primary"
                  href={`mailto:${encodeURIComponent(customerEmail)}?subject=${encodeURIComponent(messages.subject)}&body=${encodeURIComponent(messages.email)}`}
                >
                  ✉ E-posta ile gönder
                </a>
                <a
                  className="panel-secondary"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://wa.me/?text=${encodeURIComponent(messages.whatsapp)}`}
                >
                  💬 WhatsApp ile gönder
                </a>
                <a
                  className="panel-secondary"
                  target="_blank"
                  rel="noreferrer"
                  href={shareUrl}
                >
                  👁 Önizle
                </a>
              </div>
            </div>
          </section>
        ) : null}
        <section className="crm-metrics">
          <article>
            <small>TOPLAM</small>
            <strong>{rows.length}</strong>
            <span>Sözleşme kaydı</span>
          </article>
          <article>
            <small>TOPLAM DEĞER</small>
            <strong>{money(total, "TRY")}</strong>
            <span>Sözleşme bedeli</span>
          </article>
          <article>
            <small>GÖRÜNTÜLENEN</small>
            <strong>{rows.filter((r) => r.view_count > 0).length}</strong>
            <span>Müşteri tarafından açılan</span>
          </article>
          <article>
            <small>İMZALANAN</small>
            <strong>{rows.filter((r) => r.status === "signed").length}</strong>
            <span>İş akışı oluşturulan</span>
          </article>
        </section>
        <section className="panel-card">
          <form method="get" className="crm-filter-form">
            <label>
              <span>Sözleşme / müşteri ara</span>
              <input name="search" defaultValue={search} />
            </label>
            <label>
              <span>Durum</span>
              <select name="status" defaultValue={status}>
                <option value="">Tümü</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button className="panel-primary">Filtrele</button>
              <Link className="panel-secondary" href="/panel/crm/contracts">
                Temizle
              </Link>
            </div>
          </form>
        </section>
        {rows.length ? (
          <section className="panel-card crm-table-wrap">
            <table className="crm-data-table">
              <thead>
                <tr>
                  <th>Sözleşme No</th>
                  <th>Müşteri</th>
                  <th>Temsilci</th>
                  <th>Konu</th>
                  <th>Tutar</th>
                  <th>Durum</th>
                  <th>Teslim</th>
                  <th>Yorumlar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const customer = row.crm_opportunities;
                  const representativeName = customer?.assigned_employee_id
                    ? (representativeMap.get(customer.assigned_employee_id) ??
                      "Pasif personel")
                    : "Atanmamış";
                  const edit = (
                    <form className="panel-form" action={updateContract}>
                      <input type="hidden" name="contract_id" value={row.id} />
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
                        <input name="title" defaultValue={row.title} required />
                      </label>
                      <label>
                        Tutar
                        <input
                          name="amount"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={(row.amount / 100).toFixed(2)}
                          required
                        />
                      </label>
                      <label className="wide">
                        Kapsam
                        <textarea
                          name="scope"
                          defaultValue={row.scope ?? ""}
                          required
                        />
                      </label>
                      <label>
                        Ödeme planı
                        <input
                          name="payment_plan"
                          defaultValue={row.payment_plan ?? ""}
                        />
                      </label>
                      <label>
                        Başlangıç
                        <input
                          name="start_date"
                          type="date"
                          defaultValue={row.start_date ?? ""}
                        />
                      </label>
                      <label>
                        Teslim
                        <input
                          name="due_date"
                          type="date"
                          defaultValue={row.due_date ?? ""}
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
                          defaultValue={row.customer_address ?? ""}
                          placeholder="Fatura/sözleşme adresi"
                        />
                      </label>
                      <label>
                        Vergi numarası
                        <input
                          name="customer_tax_number"
                          defaultValue={row.customer_tax_number ?? ""}
                          placeholder="VKN / TCKN"
                        />
                      </label>
                      <label>
                        Vergi dairesi
                        <input
                          name="customer_tax_office"
                          defaultValue={row.customer_tax_office ?? ""}
                        />
                      </label>
                      <div className="wide panel-form-actions">
                        <button className="panel-primary">Kaydet</button>
                      </div>
                    </form>
                  );
                  const detail = (
                    <div className="crm-request-preview">
                      <span>{labels[row.status] ?? row.status}</span>
                      <h3>{customer?.customer_name}</h3>
                      <h4>{row.title}</h4>
                      <dl>
                        <div>
                          <dt>Satış temsilcisi</dt>
                          <dd>{representativeName}</dd>
                        </div>
                        <div>
                          <dt>Telefon</dt>
                          <dd>{customer?.contact_phone || "Belirtilmedi"}</dd>
                        </div>
                        <div>
                          <dt>E-posta</dt>
                          <dd>{customer?.contact_email || "Belirtilmedi"}</dd>
                        </div>
                        <div>
                          <dt>Ödeme planı</dt>
                          <dd>{row.payment_plan || "Belirtilmedi"}</dd>
                        </div>
                        <div>
                          <dt>İmzalayan</dt>
                          <dd>{row.signed_name || "Bekleniyor"}</dd>
                        </div>
                      </dl>
                      {row.scope ? <p>{row.scope}</p> : null}
                      <div className="crm-document-timeline">
                        <span>
                          <b>Oluşturuldu</b>
                          {dateTime(row.created_at)}
                        </span>
                        <span>
                          <b>İmzaya gönderildi</b>
                          {dateTime(row.sent_at)}
                        </span>
                        <span>
                          <b>İlk görüntüleme</b>
                          {dateTime(row.first_viewed_at)}
                        </span>
                        <span>
                          <b>Son görüntüleme</b>
                          {dateTime(row.last_viewed_at)}
                        </span>
                        <span>
                          <b>Açılma</b>
                          {row.view_count} kez
                        </span>
                        <span>
                          <b>İmza</b>
                          {row.signed_at
                            ? dateTime(row.signed_at)
                            : "Bekleniyor"}
                        </span>
                      </div>
                    </div>
                  );
                  return (
                    <tr key={row.id}>
                      <td className="crm-table-mono" data-label="Sözleşme No">
                        <Link className="crm-row-link" href={`/panel/crm/contracts/${row.id}`}>
                          {row.contract_no}
                        </Link>
                      </td>
                      <td data-label="Müşteri">
                        <div>
                          <span className="crm-table-title">
                            <Link className="crm-row-link" href={`/panel/crm/contracts/${row.id}`}>
                              {customer?.customer_name}
                            </Link>
                          </span>
                          <span className="crm-table-sub">
                            {customer?.contact_phone ||
                              customer?.contact_email ||
                              "İletişim yok"}
                          </span>
                        </div>
                      </td>
                      <td data-label="Temsilci">{representativeName}</td>
                      <td data-label="Konu">{row.title}</td>
                      <td data-label="Tutar">
                        {money(row.amount, row.currency)}
                      </td>
                      <td data-label="Durum">
                        <span className="status-pill">
                          {labels[row.status] ?? row.status}
                        </span>
                      </td>
                      <td data-label="Teslim">
                        {row.due_date
                          ? new Date(
                              row.due_date + "T00:00:00",
                            ).toLocaleDateString("tr-TR")
                          : "—"}
                      </td>
                      <td data-label="Yorumlar">
                        {commentCounts.get(row.opportunity_id) ? (
                          <Link
                            className="crm-comment-count-badge"
                            href={`/panel/crm/contracts/${row.id}`}
                          >
                            {commentCounts.get(row.opportunity_id)} yorum
                          </Link>
                        ) : (
                          <span className="crm-comment-count-empty">—</span>
                        )}
                      </td>
                      <td className="crm-table-actions">
                        <PanelBottomSheet
                          triggerLabel="Ayarlar"
                          title={`${row.contract_no} işlemleri`}
                        >
                        <Link className="panel-secondary" href={`/panel/crm/contracts/${row.id}`}>
                          Detayları Aç
                        </Link>
                        <PanelDrawer
                          triggerLabel="Önizle"
                          title={row.contract_no}
                        >
                          {detail}
                        </PanelDrawer>
                        <PanelDrawer
                          triggerLabel="Takip Kodu"
                          title={row.contract_no}
                          description="Müşteri bu kodla kendi iş durumunu görebilir."
                        >
                          {(() => {
                            const trackingUrl = `https://${publicHost}/takip`;
                            const waText = `Merhaba ${customer?.customer_name ?? ""},\n\nAkademikMerkez üzerinden yürütülen dosyanızın güncel durumunu aşağıdaki bağlantıdan takip edebilirsiniz:\n\n${trackingUrl}\n\nTakip Kodunuz: ${row.tracking_code}\n\nBağlantıyı açtıktan sonra 6 haneli takip kodunuzu girerek dosyanızın mevcut durumunu görüntüleyebilirsiniz.\n\nAkademikMerkez`;
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
                                  {row.tracking_code}
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
                                    href={`${trackingUrl}?code=${encodeURIComponent(row.tracking_code)}`}
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
                          title={row.contract_no}
                          description="Müşteri talebiyle ödeme planını revize edin (örn. 3 taksite bölme)."
                        >
                          <ContractPaymentPlanForm
                            contractId={row.id}
                            amountCents={row.amount}
                            currentPlanType={row.payment_plan_type}
                          />
                        </PanelDrawer>
                        {!["signed", "completed", "cancelled"].includes(
                          row.status,
                        ) ? (
                          <>
                            <PanelDrawer
                              triggerLabel="Düzenle"
                              title={row.contract_no}
                              description="Sözleşme bilgilerini kontrol edin."
                            >
                              {edit}
                            </PanelDrawer>
                            <form action={issueContractLink}>
                              <input
                                type="hidden"
                                name="contract_id"
                                value={row.id}
                              />
                              <button className="panel-primary">
                                İmzaya gönder
                              </button>
                            </form>
                          </>
                        ) : null}
                        {row.workflow_id ? (
                          <Link
                            className="panel-secondary"
                            href="/panel/operations"
                          >
                            İş akışı
                          </Link>
                        ) : null}
                        {![
                          "signed",
                          "completed",
                          "rejected",
                          "cancelled",
                        ].includes(row.status) ? (
                          <form action={markContractStatus}>
                            <input
                              type="hidden"
                              name="contract_id"
                              value={row.id}
                            />
                            <input
                              type="hidden"
                              name="status"
                              value="rejected"
                            />
                            <button className="panel-secondary">
                              Reddedildi
                            </button>
                          </form>
                        ) : null}
                        {![
                          "signed",
                          "completed",
                          "rejected",
                          "cancelled",
                        ].includes(row.status) ? (
                          <form action={markContractStatus}>
                            <input
                              type="hidden"
                              name="contract_id"
                              value={row.id}
                            />
                            <input
                              type="hidden"
                              name="status"
                              value="cancelled"
                            />
                            <button className="panel-secondary">İptal</button>
                          </form>
                        ) : null}
                        {canDelete ? (
                          <form action={deleteContract}>
                            <input
                              type="hidden"
                              name="contract_id"
                              value={row.id}
                            />
                            <ConfirmDeleteButton
                              label="Sil"
                              confirmMessage={`${row.contract_no} sözleşmesini kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
                            />
                          </form>
                        ) : null}
                        </PanelBottomSheet>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <div className="panel-card crm-empty">Sözleşme bulunamadı.</div>
        )}
        {archivedRows.length ? (
          <details className="ops-archive">
            <summary>
              <span>Arşivlenen sözleşmeler</span>
              <em>{archivedRows.length}</em>
              <small>İşi tamamlanan sözleşmeler, panoyu meşgul etmiyor</small>
            </summary>
            <div className="ops-archive-list">
              {archivedRows.map((row) => (
                <Link
                  key={row.id}
                  href="/panel/operations"
                  className="ops-archive-row"
                >
                  <div>
                    <b>
                      {row.contract_no} · {row.crm_opportunities?.customer_name}
                    </b>
                    <small>{row.title}</small>
                  </div>
                  <span className="status-pill">İş tamamlandı</span>
                </Link>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
