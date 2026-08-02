import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
}).format(amount / 100);

export default async function PanelPage() {
  const { supabase, organization, isPlatformOwner } = await getPanelContext();
  const organizationId = organization.id;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    { count: requestCount },
    { count: wonCount },
    { data: opportunities },
    { count: openWorkflowCount },
    { count: pendingPaymentCount },
    { count: unreadNotificationCount },
    { data: paidInvoices },
  ] = await Promise.all([
    supabase.from("crm_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("crm_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "won"),
    supabase.from("crm_opportunities").select("stage,estimated_value,probability").eq("organization_id", organizationId),
    supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["planned", "in_progress"]),
    isPlatformOwner
      ? supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
      : supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
    isPlatformOwner
      ? supabase.from("notifications").select("id", { count: "exact", head: true }).eq("audience", "founder").is("read_at", null)
      : supabase.from("notifications").select("id", { count: "exact", head: true }).eq("audience", "organization").eq("organization_id", organizationId).is("read_at", null),
    isPlatformOwner
      ? supabase.from("billing_invoices").select("total").eq("status", "paid").gte("paid_at", monthStart.toISOString())
      : supabase.from("billing_invoices").select("total").eq("organization_id", organizationId).eq("status", "paid").gte("paid_at", monthStart.toISOString()),
  ]);

  const monthlyRevenue = (paidInvoices ?? []).reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const requestConversionRate = requestCount ? Math.round(((wonCount ?? 0) / requestCount) * 100) : 0;
  const activeOpportunities = (opportunities ?? []).filter((item) => !["won", "lost"].includes(item.stage));
  const pipelineValue = activeOpportunities.reduce((sum, item) => sum + Number(item.estimated_value ?? 0), 0);
  const weightedForecast = activeOpportunities.reduce((sum, item) => sum + Math.round(Number(item.estimated_value ?? 0) * Number(item.probability ?? 0) / 100), 0);

  return <>
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">BUGÜN</small>
        <h1>{isPlatformOwner ? "Yönetim özeti" : "Ana Sayfa"}</h1>
        <p>Bekleyen işler, satışlar ve tahsilatlar tek bakışta.</p>
      </div>
      <div className="panel-page-actions">
        <Link className="panel-secondary" href="/panel/reporting">Raporlar</Link>
        <Link className="panel-primary" href="/panel/crm">Yeni fırsat</Link>
      </div>
    </div>

    <section className="metric-strip metric-strip-five">
      <article><span className="metric-icon">◎</span><div><small>AKTİF FIRSAT</small><strong>{activeOpportunities.length}</strong><p>{money(pipelineValue)} toplam değer</p></div></article>
      <article><span className="metric-icon">↗</span><div><small>TAHMİNİ GELİR</small><strong>{money(weightedForecast)}</strong><p>Olasılığa göre</p></div></article>
      <article><span className="metric-icon">◇</span><div><small>AKTİF İŞ</small><strong>{openWorkflowCount ?? 0}</strong><p>Planlanan ve devam eden</p></div></article>
      <article><span className="metric-icon">▦</span><div><small>BU AY TAHSİLAT</small><strong>{money(monthlyRevenue)}</strong><p>{pendingPaymentCount ?? 0} ödeme bekliyor</p></div></article>
      <article><span className="metric-icon">◌</span><div><small>BİLDİRİM</small><strong>{unreadNotificationCount ?? 0}</strong><p>Okunmamış kayıt</p></div></article>
    </section>

    <section className="panel-grid dashboard-grid">
      <article className="panel-card panel-span-2">
        <div className="section-heading compact"><div><small className="panel-kicker">ÖNCELİKLİ İŞLER</small><h2>Bugün neye odaklanmalı?</h2></div></div>
        <div className="dashboard-actions">
          <Link href="/panel/crm"><span>Satış fırsatlarını incele</span><b>{activeOpportunities.length}</b></Link>
          <Link href="/panel/operations"><span>Aktif işleri takip et</span><b>{openWorkflowCount ?? 0}</b></Link>
          <Link href="/panel/finance"><span>Bekleyen tahsilatları kontrol et</span><b>{pendingPaymentCount ?? 0}</b></Link>
          <Link href="/panel/notifications"><span>Bildirimleri gözden geçir</span><b>{unreadNotificationCount ?? 0}</b></Link>
        </div>
      </article>

      <article className="panel-card">
        <div className="section-heading compact"><div><small className="panel-kicker">SATIŞ ÖZETİ</small><h2>Dönüşüm</h2></div></div>
        <div className="dashboard-summary-number">%{requestConversionRate}</div>
        <p>{requestCount ?? 0} talepten {wonCount ?? 0} tanesi satışa dönüştü.</p>
        <Link className="panel-text-link" href="/panel/crm">CRM'i aç →</Link>
      </article>
    </section>
  </>;
}
