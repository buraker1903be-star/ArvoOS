import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import "../../../crm.css";

type ProposalRevision = {
  id: string;
  proposal_no: string;
  title: string;
  scope: string | null;
  amount: number;
  currency: string;
  payment_plan: string | null;
  valid_until: string | null;
  status: string;
  revision_no: number;
  revision_note: string | null;
  previous_revision_id: string | null;
  superseded_by: string | null;
  created_at: string;
  created_by: string | null;
};

type SelectedProposal = {
  id: string;
  root_proposal_id: string | null;
  organization_id: string;
  crm_opportunities: { customer_name: string } | { customer_name: string }[] | null;
};

const money = (value: number, currency: string) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency,
}).format(Number(value || 0) / 100);

const dateTime = (value: string) => new Date(value).toLocaleString("tr-TR");

const statusLabels: Record<string, string> = {
  draft: "Taslak",
  sent: "Gönderildi",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
  expired: "Süresi doldu",
  archived: "Arşiv",
};

export default async function ProposalRevisionHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) {
    throw new Error("CRM modülüne erişiminiz yok.");
  }

  const { data: selectedData, error: selectedError } = await supabase
    .from("crm_proposals")
    .select("id,root_proposal_id,organization_id,crm_opportunities(customer_name)")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (selectedError) throw new Error(`Teklif okunamadı: ${selectedError.message}`);
  if (!selectedData) notFound();
  const selected = selectedData as unknown as SelectedProposal;

  const rootId = selected.root_proposal_id || selected.id;
  const { data, error } = await supabase
    .from("crm_proposals")
    .select("id,proposal_no,title,scope,amount,currency,payment_plan,valid_until,status,revision_no,revision_note,previous_revision_id,superseded_by,created_at,created_by")
    .eq("organization_id", membership.organization_id)
    .or(`id.eq.${rootId},root_proposal_id.eq.${rootId}`)
    .order("revision_no", { ascending: true });

  if (error) throw new Error(`Revizyon geçmişi okunamadı: ${error.message}`);
  const rows = (data ?? []) as ProposalRevision[];
  const current = rows.find((row) => !row.superseded_by) || rows.at(-1);
  const customerName = Array.isArray(selected.crm_opportunities)
    ? selected.crm_opportunities[0]?.customer_name
    : selected.crm_opportunities?.customer_name;

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">CRM / TEKLİF REVİZYONLARI</small>
        <h1>{current?.proposal_no || "Teklif"}</h1>
        <p>{customerName || "Müşteri"} için oluşturulan tüm teklif sürümlerini inceleyin.</p>
      </div>
      <div className="panel-page-actions">
        <span className="status-pill">{rows.length} sürüm</span>
        <Link className="panel-secondary" href="/panel/crm/proposals">Tekliflere dön</Link>
      </div>
    </div>

    <section className="crm-metrics">
      <article><small>İLK SÜRÜM</small><strong>R0</strong><span>{rows[0] ? dateTime(rows[0].created_at) : "—"}</span></article>
      <article><small>SON SÜRÜM</small><strong>R{current?.revision_no ?? 0}</strong><span>{current ? dateTime(current.created_at) : "—"}</span></article>
      <article><small>GÜNCEL BEDEL</small><strong>{current ? money(current.amount, current.currency) : "—"}</strong><span>{current?.payment_plan || "Ödeme planı yok"}</span></article>
      <article><small>DURUM</small><strong>{current ? statusLabels[current.status] || current.status : "—"}</strong><span>En güncel teklif sürümü</span></article>
    </section>

    <section className="crm-record-list">
      {rows.map((row, index) => {
        const previous = index > 0 ? rows[index - 1] : null;
        const amountChanged = previous ? previous.amount !== row.amount : false;
        const titleChanged = previous ? previous.title !== row.title : false;
        const scopeChanged = previous ? previous.scope !== row.scope : false;
        const paymentChanged = previous ? previous.payment_plan !== row.payment_plan : false;
        const changes = [
          amountChanged ? "Bedel" : null,
          titleChanged ? "Başlık" : null,
          scopeChanged ? "Kapsam" : null,
          paymentChanged ? "Ödeme planı" : null,
        ].filter(Boolean);

        return <article className="panel-card crm-record" key={row.id}>
          <div className="crm-record-main">
            <div className="crm-record-heading">
              <span className="crm-record-number">{row.proposal_no}</span>
              <span className="status-pill">R{row.revision_no}</span>
              <span className="status-pill">{statusLabels[row.status] || row.status}</span>
            </div>
            <h2>{row.title}</h2>
            <p>{row.scope || "Kapsam belirtilmedi."}</p>
            {row.revision_note ? <p><b>Revizyon nedeni:</b> {row.revision_note}</p> : null}
            <div className="crm-record-meta">
              <span>Oluşturuldu: {dateTime(row.created_at)}</span>
              <span>Geçerlilik: {row.valid_until ? new Date(`${row.valid_until}T00:00:00`).toLocaleDateString("tr-TR") : "—"}</span>
              <span>{row.superseded_by ? "Eski sürüm" : "Güncel sürüm"}</span>
            </div>
            <div className="crm-document-timeline">
              <span><b>Değişen alanlar</b>{changes.length ? changes.join(", ") : "İlk sürüm"}</span>
              <span><b>Ödeme planı</b>{row.payment_plan || "Belirtilmedi"}</span>
              <span><b>Bedel</b>{money(row.amount, row.currency)}</span>
            </div>
          </div>
          <aside className="crm-record-side">
            <small>SÜRÜM</small>
            <strong>R{row.revision_no}</strong>
            <span>{row.superseded_by ? "Salt okunur" : "Aktif sürüm"}</span>
          </aside>
        </article>;
      })}
    </section>
  </div>;
}
