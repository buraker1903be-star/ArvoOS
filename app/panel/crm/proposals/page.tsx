import Link from "next/link";
import { statusTone } from "@/lib/status-tone";
import { belgeGonderimYolu } from "@/lib/belge-gonderim-yolu";
import { arvoKurumuMu } from "@/lib/arvo-kurumu";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { WhatsappGonderDugmesi } from "../whatsapp-gonder-dugmesi";
import { ShareSendLink } from "../share-send-link";
import { phoneSearchTerms } from "@/lib/format-phone";
import { daysSince, fetchLastContacts, waitingLabel } from "../last-contact";
import {
  CustomerCell,
  DateCell,
  LastContactCell,
  RepresentativeCell,
  SubjectCell,
} from "../table-cells";
import { PROPOSAL_STATUS_LABELS as labels } from "../status-labels";
import { resolvePublicHost } from "@/lib/public-host";
import { formatPersonName } from "@/lib/format-name";
import { getPanelContext } from "@/lib/panel-context";
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
  /*
    "Kabul edildi" / "Reddedildi" filtresi her zaman boş liste veriyordu:
    tetikleyici bu teklifleri status='archived' + archive_reason=<durum>
    olarak saklıyor, aktif liste ise arşivlileri dışarıda bırakıyor. Bu iki
    seçim artık arşiv listesinde filtre uygular (aşağıda).
  */
  const arsivNedeni = status === "accepted" || status === "rejected" ? status : "";
  if (status && !arsivNedeni) q = q.eq("status", status);
  if (search) q = q.or(`proposal_no.ilike.%${search}%,title.ilike.%${search}%`);
  // Kabul/ret seçildiyse aktif liste boş kalır; bu teklifler arşivdedir.
  const { data, error } = arsivNedeni
    ? { data: [], error: null }
    : await q.order("created_at", { ascending: false });
  if (error) throw new Error("Teklifler okunamadı: " + error.message);
  const fetchedRows = (data ?? []) as unknown as Proposal[];
  const searchKey = search.toLocaleLowerCase("tr-TR");
  const matchesSearch = (row: Proposal) => {
    if (!searchKey) return true;
    const customer = row.crm_opportunities;
    return [
      row.proposal_no,
      row.title,
      customer?.customer_name,
      customer?.contact_email,
      phoneSearchTerms(customer?.contact_phone),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("tr-TR")
      .includes(searchKey);
  };
  const rows = fetchedRows.filter(matchesSearch);
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
  const archivedRows = ((archivedData ?? []) as unknown as Proposal[])
    .filter((row) => (arsivNedeni ? row.archive_reason === arsivNedeni : true))
    .filter(matchesSearch);
  const visibleOpportunityIds = [
    ...new Set(
      [...rows, ...archivedRows]
        .map((row) => row.opportunity_id)
        .filter(Boolean),
    ),
  ];
  const lastContacts = await fetchLastContacts(
    supabase,
    membership.organization_id,
    visibleOpportunityIds,
  );
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
  /* Kendi numarasını bağlamamış kurumda eski usul sürüyor (lib/belge-gonderim-yolu.ts). */
  const waDurum = await getWhatsappStatus(membership.organization_id);
  const gonderimYolu = belgeGonderimYolu({
    kendiNumarasiBagli: waDurum.connected && waDurum.status !== "disabled",
    arvoKurumu: await arvoKurumuMu(supabase, membership.organization_id),
  });

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
                <ShareSendLink
                  kind="proposal"
                  token={share}
                  className="panel-primary"
                  href={`mailto:${encodeURIComponent(customerEmail)}?subject=${encodeURIComponent(messages.subject)}&body=${encodeURIComponent(messages.email)}`}
                >
                  ✉ E-posta ile gönder
                </ShareSendLink>
                {gonderimYolu === "panel" ? (
                  <WhatsappGonderDugmesi kind="proposal" token={share} musteriAdi={customerName} />
                ) : (
                  <ShareSendLink kind="proposal" token={share} className="panel-secondary" newTab href={`https://wa.me/?text=${encodeURIComponent(messages.whatsapp)}`}>
                    💬 WhatsApp ile gönder
                  </ShareSendLink>
                )}
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
            <table className="crm-data-table" data-cols="proposals">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Müşteri</th>
                  <th>Konu</th>
                  <th className="crm-col-rep">Temsilci</th>
                  <th className="crm-col-amount">Tutar</th>
                  <th>Durum</th>
                  <th className="crm-col-date">Geçerlilik</th>
                  <th className="crm-col-contact">Son temas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const customer = row.crm_opportunities;
                  const representativeName = customer?.assigned_employee_id
                    ? (representativeMap.get(customer.assigned_employee_id) ??
                      "Pasif personel")
                    : null;
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
                            data-tone="gold"
                            style={{ marginLeft: 6 }}
                          >
                            R{row.revision_no}
                          </span>
                        ) : null}
                      </td>
                      <CustomerCell
                        name={customer?.customer_name}
                        phone={customer?.contact_phone}
                        email={customer?.contact_email}
                      />
                      <SubjectCell
                        title={row.title}
                        service={String(customer?.request_details?.service_type ?? "")}
                      />
                      <RepresentativeCell name={representativeName} />
                      <td data-label="Tutar" className="crm-col-amount">
                        {money(row.amount, row.currency)}
                      </td>
                      <td data-label="Durum">
                        <span
                          className="status-pill"
                          data-tone={
                            superseded
                              ? "neutral"
                              : row.status === "archived" && row.archive_reason === "expired"
                                ? "warning"
                                : statusTone(row.status)
                          }
                        >
                          {displayStatus}
                        </span>
                        {row.status === "sent" && row.sent_at ? (
                          <small
                            className={
                              (daysSince(row.sent_at) ?? 0) >= 7
                                ? "crm-waiting is-late"
                                : "crm-waiting"
                            }
                          >
                            {waitingLabel(row.sent_at)}
                          </small>
                        ) : null}
                      </td>
                      <DateCell label="Geçerlilik" value={row.valid_until} />
                      <LastContactCell contact={lastContacts.get(row.opportunity_id)} />
                      <td className="crm-table-actions">
                        <span className="crm-row-chevron" aria-hidden="true">›</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : search ? (
          <section className="panel-card crm-empty-state">
            <h2>Aramaya uygun teklif yok</h2>
            <p>“{search}” için aktif teklif bulunamadı. Farklı bir müşteri adı, teklif numarası veya konu deneyin.</p>
            <div className="crm-empty-actions">
              <Link className="panel-secondary" href="/panel/crm/proposals">Aramayı temizle</Link>
            </div>
          </section>
        ) : (
          // Yeni kurum teklifin nereden oluşturulduğunu bilmiyor; yol gösterilir.
          <section className="panel-card crm-empty-state">
            <h2>{archivedRows.length ? "Aktif teklif yok" : "Henüz teklif yok"}</h2>
            <p>
              {archivedRows.length
                ? "Kabul edilen, reddedilen ve süresi dolan teklifler aşağıdaki arşivde."
                : "Teklifler bir talepten hazırlanır: talebi açın ve “Teklif Oluştur” düğmesini kullanın. Hazırladığınız teklifler burada listelenir."}
            </p>
            <div className="crm-empty-actions">
              <Link className="panel-primary" href="/panel/crm">Taleplere git</Link>
            </div>
          </section>
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
