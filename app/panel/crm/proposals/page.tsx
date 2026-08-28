import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../components/panel-drawer";
import { PanelBottomSheet } from "../../components/panel-bottom-sheet";
import {
  createProposalRevision,
  issueProposalLink,
  updateProposal,
  fastTrackProposalToContract,
  markProposalStatus,
  deleteProposal,
} from "../sales-actions";
import { ConfirmDeleteButton } from "../../accounts/confirm-delete-button";
import { CrmTabs } from "../crm-tabs";
import {
  organizationBrandName,
  proposalMessages,
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
type Proposal = {
  id: string;
  proposal_no: string;
  title: string;
  scope: string | null;
  amount: number;
  currency: string;
  payment_plan: string | null;
  valid_until: string | null;
  status: string;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  responded_at: string | null;
  created_at: string;
  root_proposal_id: string | null;
  previous_revision_id: string | null;
  revision_no: number;
  revision_note: string | null;
  superseded_at: string | null;
  superseded_by: string | null;
  archived_at: string | null;
  archive_reason: string | null;
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
const statuses = ["draft", "sent", "accepted", "rejected"];
const labels: Record<string, string> = {
  draft: "Taslak",
  sent: "Gönderildi",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
  expired: "Süresi doldu",
  archived: "Arşiv",
};
const money = (v: number, c: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: c }).format(
    v / 100,
  );
const dateTime = (v: string | null) =>
  v ? new Date(v).toLocaleString("tr-TR") : "—";
export default async function ProposalsPage({ searchParams }: Props) {
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
    .from("crm_proposals")
    .select(
      "id,proposal_no,title,scope,amount,currency,payment_plan,valid_until,status,sent_at,first_viewed_at,last_viewed_at,view_count,responded_at,created_at,root_proposal_id,previous_revision_id,revision_no,revision_note,superseded_at,superseded_by,archived_at,archive_reason,opportunity_id,crm_opportunities!inner(id,customer_name,contact_email,contact_phone,title,assigned_employee_id,request_details)",
    )
    .eq("organization_id", membership.organization_id)
    .neq("status", "archived")
    .neq("status", "expired");
  if (status) q = q.eq("status", status);
  if (search) q = q.or(`proposal_no.ilike.%${search}%,title.ilike.%${search}%`);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error("Teklifler okunamadı: " + error.message);
  const rows = (data ?? []) as unknown as Proposal[];
  const { data: archivedData, error: archivedError } = await supabase
    .from("crm_proposals")
    .select(
      "id,proposal_no,title,scope,amount,currency,payment_plan,valid_until,status,sent_at,first_viewed_at,last_viewed_at,view_count,responded_at,created_at,root_proposal_id,previous_revision_id,revision_no,revision_note,superseded_at,superseded_by,archived_at,archive_reason,opportunity_id,crm_opportunities!inner(id,customer_name,contact_email,contact_phone,title,assigned_employee_id,request_details)",
    )
    .eq("organization_id", membership.organization_id)
    .eq("status", "archived")
    .order("archived_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (archivedError)
    throw new Error("Arşivlenen teklifler okunamadı: " + archivedError.message);
  const archivedRows = (archivedData ?? []) as unknown as Proposal[];
  const { data: employeeData, error: employeeError } = await supabase
    .from("hr_employees")
    .select("id,full_name")
    .eq("organization_id", membership.organization_id)
    .eq("employment_status", "active");
  if (employeeError)
    throw new Error("Satış temsilcileri okunamadı: " + employeeError.message);
  const representativeMap = new Map(
    (employeeData ?? []).map((employee) => [employee.id, employee.full_name]),
  );
  const { data: domainOrg } = await supabase
    .from("organizations")
    .select("custom_domain,custom_domain_status")
    .eq("id", membership.organization_id)
    .maybeSingle();
  const publicHost =
    domainOrg?.custom_domain_status === "verified" && domainOrg.custom_domain
      ? domainOrg.custom_domain
      : "app.arvo-os.com";
  const shareUrl = share ? `https://${publicHost}/teklif/${share}` : "";
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const messages = proposalMessages({
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
  const revisionCount = rows.filter((r) => r.revision_no > 0).length;
  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div>
          <small className="panel-kicker">CRM / TEKLİFLER</small>
          <h1>Teklifler</h1>
          <p>
            Teklifleri düzenleyin, revize edin, müşteriye gönderin ve karar
            durumunu takip edin.
          </p>
        </div>
        <div className="panel-page-actions">
          <span className="status-pill">{rows.length} kayıt</span>
          <Link className="panel-primary" href="/panel/crm">
            Taleplere git
          </Link>
        </div>
      </div>
      <CrmTabs active="teklifler" />
      <div className="module-tab-panel">
        {shareUrl ? (
          <section className="panel-card share-ready-card">
            <div className="share-ready-icon">✓</div>
            <div className="share-ready-body">
              <small className="panel-kicker">PAYLAŞIM BAĞLANTISI HAZIR</small>
              <h2>Teklif bağlantısı</h2>
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
            <span>Teklif kaydı</span>
          </article>
          <article>
            <small>TOPLAM DEĞER</small>
            <strong>{money(total, "TRY")}</strong>
            <span>Teklif bedeli</span>
          </article>
          <article>
            <small>REVİZYON</small>
            <strong>{revisionCount}</strong>
            <span>Oluşturulan yeni sürüm</span>
          </article>
          <article>
            <small>KABUL</small>
            <strong>
              {rows.filter((r) => r.status === "accepted").length}
            </strong>
            <span>Sözleşmeye aktarılan</span>
          </article>
        </section>
        <section className="panel-card">
          <form method="get" className="crm-filter-form">
            <label>
              <span>Teklif / müşteri ara</span>
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
              <Link className="panel-secondary" href="/panel/crm/proposals">
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
                  <th>Teklif No</th>
                  <th>Müşteri</th>
                  <th>Temsilci</th>
                  <th>Konu</th>
                  <th>Tutar</th>
                  <th>Durum</th>
                  <th>Geçerlilik</th>
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
                  const superseded = Boolean(row.superseded_by);
                  const displayStatus = superseded
                    ? "Eski revizyon"
                    : row.status === "archived" &&
                        row.archive_reason === "expired"
                      ? "Teklif Süresi Doldu"
                      : (labels[row.status] ?? row.status);
                  const locked =
                    ["accepted", "rejected", "archived"].includes(row.status) ||
                    superseded;
                  const edit = (
                    <form className="panel-form" action={updateProposal}>
                      <input type="hidden" name="proposal_id" value={row.id} />
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
                      <p className="wide panel-form-note">Teklif Bilgileri</p>
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
                        Geçerlilik
                        <input
                          name="valid_until"
                          type="date"
                          defaultValue={row.valid_until ?? ""}
                        />
                      </label>
                      <div className="wide panel-form-actions">
                        <button className="panel-primary">Kaydet</button>
                      </div>
                    </form>
                  );
                  const revision = (
                    <form
                      className="panel-form"
                      action={createProposalRevision}
                    >
                      <input type="hidden" name="proposal_id" value={row.id} />
                      <label className="wide">
                        Revizyon nedeni
                        <textarea
                          name="revision_reason"
                          required
                          minLength={3}
                          maxLength={1000}
                          placeholder="Müşterinin talebi, kapsam değişikliği, fiyat güncellemesi..."
                        />
                      </label>
                      <div className="wide panel-card" style={{ padding: 14 }}>
                        <strong>
                          Yeni revizyon: {row.proposal_no.replace(/-R\d+$/, "")}
                          -R{row.revision_no + 1}
                        </strong>
                        <p style={{ margin: "8px 0 0" }}>
                          Mevcut sürüm arşivlenecek ve müşterinin yalnızca yeni
                          sürümü onaylamasına izin verilecek.
                        </p>
                      </div>
                      <div className="wide panel-form-actions">
                        <button className="panel-primary">
                          Revizyonu Oluştur
                        </button>
                      </div>
                    </form>
                  );
                  const detail = (
                    <div className="crm-request-preview">
                      <span>{displayStatus}</span>
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
                          <dt>Revizyon</dt>
                          <dd>
                            {row.revision_no
                              ? `R${row.revision_no}`
                              : "İlk sürüm"}
                          </dd>
                        </div>
                      </dl>
                      {row.scope ? <p>{row.scope}</p> : null}
                      {row.revision_note ? (
                        <p>
                          <b>Revizyon nedeni:</b> {row.revision_note}
                        </p>
                      ) : null}
                      <div className="crm-document-timeline">
                        <span>
                          <b>Oluşturuldu</b>
                          {dateTime(row.created_at)}
                        </span>
                        <span>
                          <b>Gönderildi</b>
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
                      </div>
                    </div>
                  );
                  return (
                    <tr key={row.id}>
                      <td className="crm-table-mono" data-label="Teklif No">
                        <Link className="crm-row-link" href={`/panel/crm/proposals/${row.id}`}>
                          {row.proposal_no}
                        </Link>
                        {row.revision_no > 0 ? (
                          <span
                            className="status-pill"
                            style={{ marginLeft: 6 }}
                          >
                            R{row.revision_no}
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Müşteri">
                        <div>
                          <span className="crm-table-title">
                            <Link className="crm-row-link" href={`/panel/crm/proposals/${row.id}`}>
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
                        <span className="status-pill">{displayStatus}</span>
                      </td>
                      <td data-label="Geçerlilik">
                        {row.valid_until
                          ? new Date(
                              row.valid_until + "T00:00:00",
                            ).toLocaleDateString("tr-TR")
                          : "—"}
                      </td>
                      <td className="crm-table-actions">
                        <PanelBottomSheet
                          triggerLabel="Ayarlar"
                          title={`${row.proposal_no} işlemleri`}
                        >
                        <Link className="panel-secondary" href={`/panel/crm/proposals/${row.id}`}>
                          Detayları Aç
                        </Link>
                        <PanelDrawer
                          triggerLabel="Önizle"
                          title={row.proposal_no}
                        >
                          {detail}
                        </PanelDrawer>
                        {!locked ? (
                          <PanelDrawer
                            triggerLabel="Düzenle"
                            title={row.proposal_no}
                            description="Teklif bilgilerini kontrol edin."
                          >
                            {edit}
                          </PanelDrawer>
                        ) : null}
                        {!locked ? (
                          <PanelDrawer
                            triggerLabel="Revizyon"
                            title={`${row.proposal_no} revizyonu`}
                            description="Yeni sürüm oluşturun; mevcut teklif arşivlenecektir."
                          >
                            {revision}
                          </PanelDrawer>
                        ) : null}
                        {!locked ? (
                          <form action={issueProposalLink}>
                            <input
                              type="hidden"
                              name="proposal_id"
                              value={row.id}
                            />
                            <button className="panel-primary">Link</button>
                          </form>
                        ) : null}
                        {!locked ? (
                          <form action={fastTrackProposalToContract}>
                            <input
                              type="hidden"
                              name="proposal_id"
                              value={row.id}
                            />
                            <button
                              className="panel-secondary"
                              title="Müşteri zaten sözlü onay verdiyse, online onay beklemeden doğrudan sözleşmeye geçirin."
                            >
                              Sözleşmeye Dönüştür
                            </button>
                          </form>
                        ) : null}
                        {!locked ? (
                          <form action={markProposalStatus}>
                            <input
                              type="hidden"
                              name="proposal_id"
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
                        {!locked ? (
                          <form action={markProposalStatus}>
                            <input
                              type="hidden"
                              name="proposal_id"
                              value={row.id}
                            />
                            <input
                              type="hidden"
                              name="status"
                              value="expired"
                            />
                            <button className="panel-secondary">
                              Süre Doldu
                            </button>
                          </form>
                        ) : null}
                        {canDelete ? (
                          <form action={deleteProposal}>
                            <input
                              type="hidden"
                              name="proposal_id"
                              value={row.id}
                            />
                            <ConfirmDeleteButton
                              label="Sil"
                              confirmMessage={`${row.proposal_no} teklifini kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
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
          <div className="panel-card crm-empty">Aktif teklif bulunamadı.</div>
        )}
        {archivedRows.length ? (
          <details className="ops-archive">
            <summary>
              <span>Arşivlenen teklifler</span>
              <em>{archivedRows.length}</em>
            </summary>
            <div className="ops-archive-list">
              {archivedRows.map((row) => {
                const customer = row.crm_opportunities;
                const reason =
                  row.archive_reason === "expired"
                    ? "Teklif süresi doldu"
                    : row.superseded_by
                      ? "Eski revizyon"
                      : "Arşivlendi";
                return (
                  <div key={row.id} className="ops-archive-row">
                    <div>
                      <b>
                        {row.proposal_no} · {customer?.customer_name}
                      </b>
                      <small>
                        {row.title}
                        {row.valid_until
                          ? ` · Son geçerlilik: ${new Date(row.valid_until + "T00:00:00").toLocaleDateString("tr-TR")}`
                          : ""}
                      </small>
                    </div>
                    <span className="status-pill">{reason}</span>
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
