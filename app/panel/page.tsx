import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
}).format(amount / 100);

export default async function PanelPage() {
  const { supabase, membership, organization, modules, isPlatformOwner } = await getPanelContext();
  const isOwner = membership.role === "owner";
  const organizationId = organization.id;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    { count: requestCount },
    { count: wonCount },
    { count: openWorkflowCount },
    { count: pendingPaymentCount },
    { count: unreadNotificationCount },
    { data: license },
    { data: paidInvoices },
  ] = await Promise.all([
    supabase.from("crm_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("crm_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "won"),
    supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["planned", "in_progress"]),
    isPlatformOwner
      ? supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
      : supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
    isPlatformOwner
      ? supabase.from("notifications").select("id", { count: "exact", head: true }).eq("audience", "founder").is("read_at", null)
      : supabase.from("notifications").select("id", { count: "exact", head: true }).eq("audience", "organization").eq("organization_id", organizationId).is("read_at", null),
    supabase.from("organization_licenses").select("license_status,current_period_end,user_limit,ai_credit_limit,ai_credits_used").eq("organization_id", organizationId).maybeSingle(),
    isPlatformOwner
      ? supabase.from("billing_invoices").select("total").eq("status", "paid").gte("paid_at", monthStart.toISOString())
      : supabase.from("billing_invoices").select("total").eq("organization_id", organizationId).eq("status", "paid").gte("paid_at", monthStart.toISOString()),
  ]);

  const monthlyRevenue = (paidInvoices ?? []).reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const conversionRate = requestCount ? Math.round(((wonCount ?? 0) / requestCount) * 100) : 0;
  const aiUsageRate = license?.ai_credit_limit
    ? Math.min(100, Math.round((Number(license.ai_credits_used ?? 0) / Number(license.ai_credit_limit)) * 100))
    : 0;
  const licenseEnd = license?.current_period_end
    ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(license.current_period_end))
    : "Tanımlı değil";

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">{isPlatformOwner ? "KURUCU ÇALIŞMA ALANI" : "KURUM ÇALIŞMA ALANI"}</small><h1>{isPlatformOwner ? "Yönetim Merkezi" : "Genel Bakış"}</h1><p>{isPlatformOwner ? "ArvoOS platformunu ve kurum operasyonlarını tek merkezden yönetin." : "Satıştan operasyona tüm ekibiniz için tek çalışma merkezi."}</p></div><div className="panel-page-actions"><span className="live-badge"><i /> Sistem aktif</span>{isPlatformOwner ? <Link className="panel-primary" href="/panel/platform">Platformu yönet</Link> : null}</div></div>

    <section className="executive-hero">
      <div className="executive-hero-copy"><small>ARVOOS EXECUTIVE LIGHT</small><h2>{isPlatformOwner ? "İşletmenizin tamamı, tek bir yönetim ritminde." : "Ekibinizin tamamı, tek bir çalışma ritminde."}</h2><p>Satış, operasyon, finans ve ekip verilerini birbirine bağlı süreçlerle yönetin. Her karar güncel kurum verisine dayanır.</p><div className="hero-actions"><Link href="/panel/crm">Yeni talep oluştur</Link><Link href="/panel/reporting">Raporları incele →</Link></div></div>
      <div className="executive-status"><small>LİSANS DURUMU</small><strong>{license?.license_status === "active" ? "Aktif" : license?.license_status ?? "Kurulumda"}</strong><span><i /> {organization.plan_code.toUpperCase()} paket</span><div><b>{licenseEnd}</b><small>dönem bitişi</small></div></div>
    </section>

    <section className="metric-strip">
      <article><span className="metric-icon">◎</span><div><small>TOPLAM TALEP</small><strong>{requestCount ?? 0}</strong><p>%{conversionRate} satış dönüşümü</p></div></article>
      <article><span className="metric-icon">↗</span><div><small>BU AY TAHSİLAT</small><strong>{money(monthlyRevenue)}</strong><p>Onaylanmış ödemeler</p></div></article>
      <article><span className="metric-icon">◇</span><div><small>AÇIK İŞ AKIŞI</small><strong>{openWorkflowCount ?? 0}</strong><p>Planlanan veya devam eden</p></div></article>
      <article><span className="metric-icon">▦</span><div><small>BEKLEYEN ÖDEME</small><strong>{pendingPaymentCount ?? 0}</strong><p>İnceleme bekleyen dekont</p></div></article>
    </section>

    <section className="platform-overview">
      <div><small>GÜNLÜK OPERASYON NABZI</small><h2>Karar bekleyen başlıklar</h2><p>Satış, operasyon, ödeme ve bildirim verileri canlı olarak hesaplanır.</p></div>
      <dl>
        <div><dt>KAZANILAN İŞ</dt><dd>{wonCount ?? 0}</dd></div>
        <div><dt>OKUNMAMIŞ BİLDİRİM</dt><dd>{unreadNotificationCount ?? 0}</dd></div>
        <div><dt>AI KULLANIMI</dt><dd>%{aiUsageRate}</dd></div>
        <div><dt>ETKİN MODÜL</dt><dd>{modules.length}</dd></div>
      </dl>
    </section>

    <div className="section-heading"><div><small className="panel-kicker">OPERASYON MERKEZİ</small><h2>Çalışma alanları</h2></div><span>{modules.length} modül etkin</span></div>
    <section className="panel-modules">{modules.map((module, index) => <article className="panel-card panel-module" key={module.code}><div className="module-top"><i>{module.icon}</i><span>0{index + 1}</span></div><small>ETKİN MODÜL</small><h3>{module.name}</h3><p>{module.description}</p><Link href={"/panel/" + module.code}>Çalışma alanını aç <b>→</b></Link></article>)}</section>
  </>;
}
