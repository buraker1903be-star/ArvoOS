import Link from "next/link";
import { resolvePublicHost } from "@/lib/public-host";
import { formatPersonName } from "@/lib/format-name";
import { getPanelContext } from "@/lib/panel-context";
import {
} from "../sales-actions";
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
  const visibleOpportunityIds = [
    ...new Set(
      [...rows, ...archivedRows]
        .map((row) => row.opportunity_id)
        .filter(Boolean),
    ),
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
    throw new Error("Satış temsilcileri okunamadı: " + employeeError.message);
  const representativeMap = new Map(
    (employeeData ?? []).map((employee) => [employee.id, employee.full_name]),
  );
  const publicHost = await resolvePublicHost(supabase, membership.organization_id);
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
                  const superseded = Boolean(row.superseded_by);
                  const displayStatus = superseded
                    ? "Eski revizyon"
                    : row.status === "archived" &&
                        row.archive_reason === "expired"
                      ? "Teklif Süresi Doldu"
                      : (labels[row.status] ?? row.status);
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
                              {formatPersonName(customer?.customer_name)}
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
                      <td data-label="Yorumlar">
                        {commentCounts.get(row.opportunity_id) ? (
                          <Link
                            className="crm-comment-count-badge"
                            href={`/panel/crm/proposals/${row.id}`}
                          >
                            {commentCounts.get(row.opportunity_id)} yorum
                          </Link>
                        ) : (
                          <span className="crm-comment-count-empty">—</span>
                        )}
                      </td>
                      <td className="crm-table-actions">
                        <span className="crm-row-chevron" aria-hidden="true">›</span>
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
                        {row.proposal_no} · {formatPersonName(customer?.customer_name)}
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
