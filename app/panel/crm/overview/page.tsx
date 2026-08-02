import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import "../crm.css";

type Opportunity = {
  id: string;
  stage: string;
  estimated_value: number;
  probability: number;
  updated_at: string;
};

const proposalStages = new Set(["proposal", "proposal_ready", "proposal_approved"]);
const contractStages = new Set(["contract", "contract_ready", "payment", "payment_pending", "payment_approved"]);
const completedStages = new Set(["won", "completed", "work_opened", "expert_assigned", "delivery"]);
const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value / 100);

export default async function CrmOverviewPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");

  const { data, error } = await supabase
    .from("crm_opportunities")
    .select("id,stage,estimated_value,probability,updated_at")
    .eq("organization_id", membership.organization_id)
    .order("updated_at", { ascending: false });

  if (error) throw new Error("CRM özeti okunamadı: " + error.message);

  const rows = (data ?? []) as Opportunity[];
  const requests = rows.filter((row) => !proposalStages.has(row.stage) && !contractStages.has(row.stage) && !completedStages.has(row.stage) && row.stage !== "lost");
  const proposals = rows.filter((row) => proposalStages.has(row.stage));
  const contracts = rows.filter((row) => contractStages.has(row.stage));
  const completed = rows.filter((row) => completedStages.has(row.stage));
  const lost = rows.filter((row) => row.stage === "lost");
  const active = rows.filter((row) => row.stage !== "lost" && !completedStages.has(row.stage));
  const activeValue = active.reduce((sum, row) => sum + Number(row.estimated_value ?? 0), 0);
  const weightedValue = active.reduce((sum, row) => sum + Math.round(Number(row.estimated_value ?? 0) * Number(row.probability ?? 0) / 100), 0);
  const conversion = completed.length + lost.length ? Math.round(completed.length / (completed.length + lost.length) * 100) : 0;

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">CRM / GENEL BAKIŞ</small><h1>CRM özeti</h1><p>Talep, teklif ve sözleşme süreçlerinin genel durumunu tek ekranda izleyin.</p></div>
      <div className="panel-page-actions"><Link className="panel-primary" href="/panel/crm">Taleplere git</Link></div>
    </div>

    <section className="crm-metrics">
      <article><small>AKTİF TALEP</small><strong>{requests.length}</strong><span>Değerlendirme sürecindeki kayıtlar</span></article>
      <article><small>AKTİF TEKLİF</small><strong>{proposals.length}</strong><span>Hazırlanan ve onay bekleyen</span></article>
      <article><small>AKTİF SÖZLEŞME</small><strong>{contracts.length}</strong><span>İmza ve ödeme sürecindeki</span></article>
      <article><small>DÖNÜŞÜM</small><strong>%{conversion}</strong><span>Sonuçlanan CRM kayıtları</span></article>
    </section>

    <section className="crm-metrics">
      <article><small>AKTİF PORTFÖY</small><strong>{money(activeValue)}</strong><span>Devam eden kayıtların toplamı</span></article>
      <article><small>AĞIRLIKLI GELİR</small><strong>{money(weightedValue)}</strong><span>Olasılığa göre tahmini değer</span></article>
      <article><small>TAMAMLANAN</small><strong>{completed.length}</strong><span>Kazanılan veya operasyona geçen</span></article>
      <article><small>KAYBEDİLEN</small><strong>{lost.length}</strong><span>Olumsuz sonuçlanan kayıtlar</span></article>
    </section>

    <section className="panel-card">
      <div className="section-heading compact"><div><small className="panel-kicker">HIZLI ERİŞİM</small><h2>CRM bölümleri</h2></div></div>
      <div className="dashboard-actions">
        <Link href="/panel/crm"><span><b>Talepler</b><small>Yeni ve değerlendirmedeki müşteri talepleri</small></span><b>{requests.length} →</b></Link>
        <Link href="/panel/crm/proposals"><span><b>Teklifler</b><small>Hazırlanan, bekleyen ve onaylanan teklifler</small></span><b>{proposals.length} →</b></Link>
        <Link href="/panel/crm/contracts"><span><b>Sözleşmeler</b><small>İmza, ödeme ve iş açılışı sürecindeki kayıtlar</small></span><b>{contracts.length} →</b></Link>
      </div>
    </section>
  </div>;
}
