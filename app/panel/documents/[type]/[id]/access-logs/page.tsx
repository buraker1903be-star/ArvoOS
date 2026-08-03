import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import "../../../../crm/crm.css";

type AccessLog = {
  id: string;
  access_type: string;
  actor_user_id: string | null;
  access_ip: string | null;
  user_agent: string | null;
  referrer: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const accessLabels: Record<string, string> = {
  panel_preview: "Panel önizleme",
  public_view: "Public görüntüleme",
  pdf_print: "PDF / yazdırma",
  share_link: "Paylaşım bağlantısı",
};

const dateTime = (value: string) => new Date(value).toLocaleString("tr-TR");
const browserLabel = (ua: string | null) => {
  if (!ua) return "Bilinmiyor";
  if (ua.includes("Edg/")) return "Microsoft Edge";
  if (ua.includes("Chrome/")) return "Google Chrome";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  if (ua.includes("Firefox/")) return "Firefox";
  return ua.slice(0, 90);
};

export default async function DocumentAccessLogsPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!["proposal", "contract"].includes(type)) notFound();

  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => ["documents", "crm"].includes(module.code))) {
    throw new Error("Belge erişim geçmişine erişiminiz yok.");
  }

  const table = type === "proposal" ? "crm_proposals" : "crm_contracts";
  const numberColumn = type === "proposal" ? "proposal_no" : "contract_no";
  const { data: document, error: documentError } = await supabase
    .from(table)
    .select(`id,${numberColumn},title`)
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (documentError) throw new Error(`Belge okunamadı: ${documentError.message}`);
  if (!document) notFound();

  const { data, error } = await supabase
    .from("document_access_logs")
    .select("id,access_type,actor_user_id,access_ip,user_agent,referrer,metadata,created_at")
    .eq("organization_id", membership.organization_id)
    .eq("document_type", type)
    .eq("document_id", id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Erişim kayıtları okunamadı: ${error.message}`);
  const rows = (data ?? []) as AccessLog[];
  const documentNumber = String(document[numberColumn] ?? "Belge");
  const uniqueIps = new Set(rows.map((row) => row.access_ip).filter(Boolean)).size;
  const publicViews = rows.filter((row) => row.access_type === "public_view").length;
  const pdfActions = rows.filter((row) => row.access_type === "pdf_print").length;

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">DOKÜMANLAR / ERİŞİM GEÇMİŞİ</small>
        <h1>{documentNumber}</h1>
        <p>{document.title} belgesinin görüntüleme, paylaşım ve PDF işlem kayıtlarını inceleyin.</p>
      </div>
      <div className="panel-page-actions">
        <span className="status-pill">{rows.length} erişim</span>
        <Link className="panel-secondary" href={`/panel/documents/${type}/${id}`}>Yaşam döngüsüne dön</Link>
      </div>
    </div>

    <section className="crm-metrics">
      <article><small>TOPLAM ERİŞİM</small><strong>{rows.length}</strong><span>Tüm işlem kayıtları</span></article>
      <article><small>PUBLIC GÖRÜNTÜLEME</small><strong>{publicViews}</strong><span>Müşteri bağlantısı erişimi</span></article>
      <article><small>PDF İŞLEMİ</small><strong>{pdfActions}</strong><span>Yazdırma veya PDF alma</span></article>
      <article><small>TEKİL IP</small><strong>{uniqueIps}</strong><span>Farklı erişim adresi</span></article>
    </section>

    <section className="crm-record-list">
      {rows.map((row) => <article className="panel-card crm-record" key={row.id}>
        <div className="crm-record-main">
          <div className="crm-record-heading">
            <span className="crm-record-number">{accessLabels[row.access_type] || row.access_type}</span>
            <span className="status-pill">{dateTime(row.created_at)}</span>
          </div>
          <h2>{browserLabel(row.user_agent)}</h2>
          <div className="crm-record-meta">
            <span>IP: {row.access_ip || "Kayıt yok"}</span>
            <span>Kullanıcı: {row.actor_user_id ? "Oturum açmış kullanıcı" : "Anonim / public"}</span>
            <span>Kaynak: {String(row.metadata?.source || "—")}</span>
          </div>
          {row.referrer ? <p><b>Yönlendiren:</b> {row.referrer}</p> : null}
          {row.user_agent ? <p style={{ wordBreak: "break-word" }}><b>User-Agent:</b> {row.user_agent}</p> : null}
        </div>
        <aside className="crm-record-side">
          <small>ERİŞİM TÜRÜ</small>
          <strong>{type === "proposal" ? "Teklif" : "Sözleşme"}</strong>
          <span>{accessLabels[row.access_type] || row.access_type}</span>
        </aside>
      </article>)}
      {!rows.length ? <div className="panel-card crm-empty">Bu belge için henüz erişim kaydı bulunmuyor.</div> : null}
    </section>
  </div>;
}
