import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import "../crm.css";

type Opportunity = { id: string; title: string; customer_name: string; stage: string; estimated_value: number; probability: number; expected_close_date: string | null; updated_at: string };
const proposalStages = ["proposal", "proposal_ready", "proposal_approved"];
const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value / 100);

export default async function ProposalsPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const { data, error } = await supabase.from("crm_opportunities")
    .select("id,title,customer_name,stage,estimated_value,probability,expected_close_date,updated_at")
    .eq("organization_id", membership.organization_id)
    .in("stage", proposalStages)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Teklif kayıtları okunamadı: " + error.message);
  const rows = (data ?? []) as Opportunity[];
  const total = rows.reduce((sum, row) => sum + Number(row.estimated_value ?? 0), 0);

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">CRM / TEKLİFLER</small><h1>Teklifler</h1><p>Hazırlanan, müşteri onayı bekleyen ve onaylanan teklifleri ayrı alanda yönetin.</p></div>
      <div className="panel-page-actions"><span className="status-pill">{rows.length} teklif</span><Link className="panel-primary" href="/panel/crm">Talebe git</Link></div>
    </div>
    <section className="crm-metrics">
      <article><small>TOPLAM TEKLİF</small><strong>{rows.length}</strong><span>Aktif teklif kayıtları</span></article>
      <article><small>TEKLİF DEĞERİ</small><strong>{money(total)}</strong><span>Toplam tahmini bedel</span></article>
      <article><small>ONAY BEKLEYEN</small><strong>{rows.filter((row) => row.stage !== "proposal_approved").length}</strong><span>Müşteri dönüşü bekleniyor</span></article>
      <article><small>ONAYLANAN</small><strong>{rows.filter((row) => row.stage === "proposal_approved").length}</strong><span>Sözleşmeye hazır</span></article>
    </section>
    <section className="panel-card">
      <div className="section-heading compact"><div><small className="panel-kicker">TEKLİF LİSTESİ</small><h2>Teklif kayıtları</h2></div></div>
      <div className="dashboard-actions">
        {rows.map((row) => <Link href="/panel/crm" key={row.id}><span><b>{row.customer_name}</b><small>{row.title} · {row.stage.replaceAll("_", " ")}</small></span><b>{money(row.estimated_value)}</b></Link>)}
        {!rows.length ? <p>Henüz teklif aşamasında kayıt bulunmuyor.</p> : null}
      </div>
    </section>
  </div>;
}
