import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
}).format(amount / 100);

export default async function ReportingPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "reporting")) throw new Error("Raporlar modülüne erişiminiz yok.");

  const organizationId = membership.organization_id;
  const [
    { data: opportunities },
    { data: workflows },
    { data: transactions },
    { data: invoices },
  ] = await Promise.all([
    supabase.from("crm_opportunities").select("stage,estimated_value").eq("organization_id", organizationId),
    supabase.from("operation_workflows").select("status").eq("organization_id", organizationId),
    supabase.from("finance_transactions").select("transaction_type,status,amount").eq("organization_id", organizationId),
    supabase.from("billing_invoices").select("status,total").eq("organization_id", organizationId),
  ]);

  const won = (opportunities ?? []).filter((item) => item.stage === "won");
  const openPipeline = (opportunities ?? []).filter((item) => !["won", "lost"].includes(item.stage));
  const pipelineValue = openPipeline.reduce((sum, item) => sum + Number(item.estimated_value ?? 0), 0);
  const activeWork = (workflows ?? []).filter((item) => ["planned", "in_progress", "blocked"].includes(item.status)).length;
  const completedWork = (workflows ?? []).filter((item) => item.status === "completed").length;
  const paidIncome = (transactions ?? []).filter((item) => item.transaction_type === "income" && item.status === "paid").reduce((sum, item) => sum + Number(item.amount), 0)
    + (invoices ?? []).filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.total ?? 0), 0);
  const openReceivables = (transactions ?? []).filter((item) => item.transaction_type === "income" && item.status === "planned").reduce((sum, item) => sum + Number(item.amount), 0)
    + (invoices ?? []).filter((item) => item.status === "open").reduce((sum, item) => sum + Number(item.total ?? 0), 0);

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">YÖNETİM</small><h1>Raporlar</h1><p>Satış, operasyon ve finans performansını tek bakışta inceleyin.</p></div>
      <div className="panel-page-actions"><span className="status-pill">Canlı veriler</span></div>
    </div>

    <section className="metric-strip">
      <article><div><small>AKTİF PIPELINE</small><strong>{money(pipelineValue)}</strong><p>{openPipeline.length} açık fırsat</p></div></article>
      <article><div><small>KAZANILAN SATIŞ</small><strong>{won.length}</strong><p>Toplam kazanılan fırsat</p></div></article>
      <article><div><small>AKTİF İŞ</small><strong>{activeWork}</strong><p>{completedWork} iş tamamlandı</p></div></article>
      <article><div><small>TAHSİL EDİLEN</small><strong>{money(paidIncome)}</strong><p>{money(openReceivables)} bekliyor</p></div></article>
    </section>

    <section className="panel-grid report-center-grid">
      <article className="panel-card"><small>SATIŞ</small><h3>CRM raporu</h3><p>Fırsat sayısı, pipeline değeri ve kazanılan satışları inceleyin.</p><Link href="/panel/crm">CRM'i aç →</Link></article>
      <article className="panel-card"><small>OPERASYON</small><h3>İş raporu</h3><p>Aktif, bekleyen ve tamamlanan iş akışlarını takip edin.</p><Link href="/panel/operations">İşleri aç →</Link></article>
      <article className="panel-card"><small>FİNANS</small><h3>Finans raporu</h3><p>Tahsilat, açık alacak ve nakit görünümünü inceleyin.</p><Link href="/panel/finance">Finansı aç →</Link></article>
    </section>
  </>;
}
