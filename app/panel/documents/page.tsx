import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import "../crm/crm.css";

type ProposalRow = {
  id: string;
  proposal_no: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  revision_no: number;
  superseded_by: string | null;
  created_at: string;
  crm_opportunities: { customer_name: string } | { customer_name: string }[] | null;
};

type ContractRow = {
  id: string;
  contract_no: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  signed_at: string | null;
  workflow_id: string | null;
  created_at: string;
  crm_opportunities: { customer_name: string } | { customer_name: string }[] | null;
};

type DocumentItem = {
  id: string;
  type: "proposal" | "contract";
  number: string;
  title: string;
  customer: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  revision_no?: number;
  superseded?: boolean;
  signed_at?: string | null;
  workflow_id?: string | null;
};

const money = (value: number, currency: string) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency,
}).format(Number(value || 0) / 100);

const dateTime = (value: string) => new Date(value).toLocaleString("tr-TR");
const proposalLabels: Record<string, string> = { draft: "Taslak", sent: "Gönderildi", accepted: "Kabul edildi", rejected: "Reddedildi", expired: "Süresi doldu", archived: "Arşiv" };
const contractLabels: Record<string, string> = { draft: "Taslak", sent: "İmza bekliyor", signed: "İmzalandı", rejected: "Reddedildi", cancelled: "İptal", completed: "Tamamlandı" };
const customerName = (value: ProposalRow["crm_opportunities"] | ContractRow["crm_opportunities"]) => Array.isArray(value) ? value[0]?.customer_name || "Müşteri" : value?.customer_name || "Müşteri";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; search?: string }> }) {
  const params = await searchParams;
  const typeFilter = ["proposal", "contract"].includes(params.type || "") ? params.type || "" : "";
  const statusFilter = (params.status || "").trim();
  const search = (params.search || "").trim().toLocaleLowerCase("tr-TR");
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => ["documents", "crm"].includes(module.code))) {
    throw new Error("Belge Merkezi'ne erişiminiz yok.");
  }

  const [proposalResult, contractResult] = await Promise.all([
    supabase.from("crm_proposals").select("id,proposal_no,title,amount,currency,status,revision_no,superseded_by,created_at,crm_opportunities(customer_name)").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }),
    supabase.from("crm_contracts").select("id,contract_no,title,amount,currency,status,signed_at,workflow_id,created_at,crm_opportunities(customer_name)").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }),
  ]);

  if (proposalResult.error) throw new Error(`Teklif belgeleri okunamadı: ${proposalResult.error.message}`);
  if (contractResult.error) throw new Error(`Sözleşme belgeleri okunamadı: ${contractResult.error.message}`);

  const proposals = (proposalResult.data ?? []) as unknown as ProposalRow[];
  const contracts = (contractResult.data ?? []) as unknown as ContractRow[];
  const documents: DocumentItem[] = [
    ...proposals.map((row) => ({ id: row.id, type: "proposal" as const, number: row.proposal_no, title: row.title, customer: customerName(row.crm_opportunities), amount: row.amount, currency: row.currency, status: row.status, created_at: row.created_at, revision_no: row.revision_no, superseded: Boolean(row.superseded_by) })),
    ...contracts.map((row) => ({ id: row.id, type: "contract" as const, number: row.contract_no, title: row.title, customer: customerName(row.crm_opportunities), amount: row.amount, currency: row.currency, status: row.status, created_at: row.created_at, signed_at: row.signed_at, workflow_id: row.workflow_id })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filtered = documents.filter((document) => {
    if (typeFilter && document.type !== typeFilter) return false;
    if (statusFilter && document.status !== statusFilter) return false;
    if (search && !`${document.number} ${document.title} ${document.customer}`.toLocaleLowerCase("tr-TR").includes(search)) return false;
    return true;
  });

  const signedContracts = contracts.filter((row) => row.status === "signed").length;
  const acceptedProposals = proposals.filter((row) => row.status === "accepted").length;
  const totalValue = filtered.reduce((sum, row) => sum + Number(row.amount), 0);

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">DOKÜMANLAR / BELGE MERKEZİ</small>
        <h1>Belge Merkezi</h1>
        <p>Teklif ve sözleşmeleri tek ekrandan izleyin; revizyon, imza, iş akışı ve finans bağlantılarına ulaşın.</p>
      </div>
      <div className="panel-page-actions">
        <span className="status-pill">{filtered.length} belge</span>
        <Link className="panel-primary" href="/panel/crm/proposals">Yeni teklif akışı</Link>
      </div>
    </div>

    <section className="crm-metrics">
      <article><small>TOPLAM BELGE</small><strong>{documents.length}</strong><span>Teklif ve sözleşme</span></article>
      <article><small>KABUL EDİLEN</small><strong>{acceptedProposals}</strong><span>Sözleşmeye dönüşen teklif</span></article>
      <article><small>İMZALI</small><strong>{signedContracts}</strong><span>Elektronik onayı tamamlanan</span></article>
      <article><small>FİLTRELENEN DEĞER</small><strong>{money(totalValue, "TRY")}</strong><span>Görüntülenen belgelerin toplamı</span></article>
    </section>

    <section className="panel-card">
      <form method="get" className="crm-filter-form">
        <label><span>Belge / müşteri ara</span><input name="search" defaultValue={params.search || ""} placeholder="TKF, SOZ, müşteri veya başlık" /></label>
        <label><span>Belge türü</span><select name="type" defaultValue={typeFilter}><option value="">Tümü</option><option value="proposal">Teklif</option><option value="contract">Sözleşme</option></select></label>
        <label><span>Durum</span><select name="status" defaultValue={statusFilter}><option value="">Tümü</option><option value="draft">Taslak</option><option value="sent">Gönderildi / İmza bekliyor</option><option value="accepted">Kabul edildi</option><option value="signed">İmzalandı</option><option value="archived">Arşiv</option><option value="completed">Tamamlandı</option></select></label>
        <div><button className="panel-primary">Filtrele</button><Link className="panel-secondary" href="/panel/documents">Temizle</Link></div>
      </form>
    </section>

    <section className="crm-record-list">
      {filtered.map((document) => {
        const label = document.type === "proposal" ? proposalLabels[document.status] || document.status : contractLabels[document.status] || document.status;
        const primaryHref = document.type === "proposal" ? `/panel/crm/proposals/${document.id}/revisions` : "/panel/crm/contracts";
        return <article className="panel-card crm-record" key={`${document.type}-${document.id}`}>
          <div className="crm-record-main">
            <div className="crm-record-heading"><span className="crm-record-number">{document.number}</span><span className="status-pill">{document.type === "proposal" ? "Teklif" : "Sözleşme"}</span><span className="status-pill">{label}</span></div>
            <h2>{document.customer}</h2>
            <h3>{document.title}</h3>
            <div className="crm-record-meta"><span>Oluşturuldu: {dateTime(document.created_at)}</span>{document.type === "proposal" ? <span>{document.revision_no ? `Revizyon R${document.revision_no}` : "İlk sürüm"}</span> : <span>{document.signed_at ? `İmzalandı: ${dateTime(document.signed_at)}` : "İmza bekliyor"}</span>}<span>{document.superseded ? "Eski sürüm" : "Güncel belge"}</span></div>
            <div className="panel-page-actions"><Link className="panel-secondary" href={primaryHref}>{document.type === "proposal" ? "Revizyon geçmişi" : "Sözleşmeyi aç"}</Link>{document.workflow_id ? <Link className="panel-primary" href="/panel/operations">İş akışını aç</Link> : null}</div>
          </div>
          <aside className="crm-record-side"><small>BELGE DEĞERİ</small><strong>{money(document.amount, document.currency)}</strong><span>{document.type === "proposal" ? "Teklif bedeli" : "Sözleşme bedeli"}</span></aside>
        </article>;
      })}
      {!filtered.length ? <div className="panel-card crm-empty">Filtrelere uygun belge bulunamadı.</div> : null}
    </section>
  </div>;
}
