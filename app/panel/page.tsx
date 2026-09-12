import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
}).format(amount / 100);

const academicActiveStages = [
  "lead", "pre_review", "academic_review", "proposal_ready", "proposal_approved",
  "contract_ready", "payment_pending", "payment_approved", "work_opened",
  "expert_assigned", "delivery",
];

export default async function PanelPage() {
  const { supabase, organization, isPlatformOwner, membership, hiddenModuleKeys } = await getPanelContext();
  const organizationId = organization.id;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Ana sayfa eskiden her role satış hunisi değerini, tahmini geliri, aylık
  // tahsilatı ve bekleyen ödemeleri gösteriyordu; Yetkilendirme'den kapatılmış
  // modüllerin ve finans ekranını göremeyen rollerin verisi dahil. Artık her
  // kart yalnızca ilgili modül açıksa sorgulanıyor ve gösteriliyor; tahsilat
  // rakamları finans sayfasıyla aynı kurala (Kurum Sahibi / Yönetici) bağlı.
  const isOwner = isPlatformOwner || membership.role === "owner";
  const canSee = (moduleKey: string) => isOwner || !hiddenModuleKeys.has(moduleKey);
  const canSeeCrm = canSee("crm");
  const canSeeOperations = canSee("operations");
  const canSeeReports = canSee("reports");
  const canSeeFinance = isPlatformOwner || (["owner", "admin"].includes(membership.role) && canSee("finance"));
  const none = Promise.resolve({ data: null, count: 0 });

  const { data: verticalProfile } = await supabase
    .from("organization_vertical_profiles")
    .select("relationship_type,vertical_code,display_name,brand_config,feature_flags")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const isAcademicMerkez = verticalProfile?.vertical_code === "academic_services";

  const [
    { data: opportunities },
    { count: openWorkflowCount },
    { count: dueThisWeekCount },
    { count: overdueWorkflowCount },
    { count: pendingPaymentCount },
    { count: unreadNotificationCount },
    { data: paidInvoices },
  ] = await Promise.all([
    canSeeCrm ? supabase.from("crm_opportunities").select("stage,estimated_value,probability").eq("organization_id", organizationId) : none,
    canSeeOperations ? supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["planned", "in_progress", "blocked"]) : none,
    canSeeOperations ? supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["planned", "in_progress"]).gte("due_date", new Date().toISOString().slice(0, 10)).lte("due_date", weekEnd.toISOString().slice(0, 10)) : none,
    canSeeOperations ? supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["planned", "in_progress", "blocked"]).lt("due_date", new Date().toISOString().slice(0, 10)) : none,
    !canSeeFinance
      ? none
      : isPlatformOwner
        ? supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
        : supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
    isPlatformOwner
      ? supabase.from("notifications").select("id", { count: "exact", head: true }).eq("audience", "founder").is("read_at", null)
      : supabase.rpc("arvo_unread_notification_count", { p_organization_id: organizationId })
          .then(({ data }) => ({ count: Number(data ?? 0) })),
    !canSeeFinance
      ? none
      : isPlatformOwner
        ? supabase.from("billing_invoices").select("total").eq("status", "paid").gte("paid_at", monthStart.toISOString())
        : supabase.from("billing_invoices").select("total").eq("organization_id", organizationId).eq("status", "paid").gte("paid_at", monthStart.toISOString()),
  ]);

  const items = (opportunities ?? []) as { stage: string; estimated_value: number | null; probability: number | null }[];
  const monthlyRevenue = ((paidInvoices ?? []) as { total: number | null }[]).reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const stageCount = (stage: string) => items.filter((item) => item.stage === stage).length;
  const activeOpportunities = items.filter((item) => !["won", "lost", "completed"].includes(item.stage));
  const pipelineValue = activeOpportunities.reduce((sum, item) => sum + Number(item.estimated_value ?? 0), 0);
  const weightedForecast = activeOpportunities.reduce((sum, item) => sum + Math.round(Number(item.estimated_value ?? 0) * Number(item.probability ?? 0) / 100), 0);
  const completedCount = items.filter((item) => ["won", "completed"].includes(item.stage)).length;
  const lostCount = stageCount("lost");
  const conversion = completedCount + lostCount ? Math.round(completedCount / (completedCount + lostCount) * 100) : 0;

  const headActions = <div className="panel-page-actions">
    {canSeeReports ? <Link className="panel-secondary" href="/panel/reporting">Raporlar</Link> : null}
    {canSeeCrm ? <Link className="panel-primary" href="/panel/crm">+ Yeni talep</Link> : null}
  </div>;

  if (isAcademicMerkez) {
    const academicActive = items.filter((item) => academicActiveStages.includes(item.stage));
    const proposalWaiting = stageCount("proposal_ready") + stageCount("proposal_approved");
    const contractWaiting = stageCount("contract_ready");
    const paymentWaiting = stageCount("payment_pending");

    return <>
      <div className="panel-pagehead">
        <div>
          <small className="panel-kicker">AKADEMİKMERKEZ · BUGÜN</small>
          <h1>Akademik operasyon özeti</h1>
          <p>Talepleri, değerlendirmeleri, teklifleri, tahsilatları ve teslimleri tek bakışta yönetin.</p>
        </div>
        {headActions}
      </div>

      <section className="metric-strip metric-strip-five">
        {canSeeCrm ? <>
          <article><span className="metric-icon">◎</span><div><small>YENİ TALEP</small><strong>{stageCount("lead")}</strong><p>İlk incelemeyi bekliyor</p></div></article>
          <article><span className="metric-icon">◇</span><div><small>DEĞERLENDİRME</small><strong>{stageCount("pre_review") + stageCount("academic_review")}</strong><p>Ön ve akademik inceleme</p></div></article>
          <article><span className="metric-icon">↗</span><div><small>TEKLİF BEKLEYEN</small><strong>{proposalWaiting}</strong><p>{money(weightedForecast)} tahmini değer</p></div></article>
          <article><span className="metric-icon">▦</span><div><small>TAHSİLAT BEKLEYEN</small><strong>{paymentWaiting}</strong><p>{canSeeFinance ? `${money(monthlyRevenue)} bu ay tahsilat` : "Ödeme bekleyen dosya"}</p></div></article>
        </> : null}
        {canSeeOperations ? <article><span className="metric-icon">◌</span><div><small>AKTİF İŞ</small><strong>{openWorkflowCount ?? 0}</strong><p>{dueThisWeekCount ?? 0} bu hafta teslim</p></div></article> : null}
      </section>

      <section className="panel-grid dashboard-grid">
        <article className="panel-card panel-span-2">
          <div className="section-heading compact"><div><small className="panel-kicker">ÖNCELİKLİ AKSİYONLAR</small><h2>Bugün neye odaklanmalı?</h2></div></div>
          <div className="dashboard-actions">
            {canSeeCrm ? <>
              <Link href="/panel/crm"><span>Yeni talepleri ön incelemeye al</span><b>{stageCount("lead")}</b></Link>
              <Link href="/panel/crm"><span>Akademik değerlendirmeleri sonuçlandır</span><b>{stageCount("academic_review")}</b></Link>
              <Link href="/panel/crm"><span>Teklif ve sözleşmeleri tamamla</span><b>{proposalWaiting + contractWaiting}</b></Link>
            </> : null}
            {canSeeFinance ? <Link href="/panel/finance"><span>Bekleyen tahsilatları kontrol et</span><b>{paymentWaiting}</b></Link> : null}
            {canSeeOperations ? <Link href="/panel/operations"><span>Geciken teslimleri incele</span><b>{overdueWorkflowCount ?? 0}</b></Link> : null}
            <Link href="/panel/notifications"><span>Bildirimleri gözden geçir</span><b>{unreadNotificationCount ?? 0}</b></Link>
          </div>
        </article>

        {canSeeCrm ? <article className="panel-card">
          <div className="section-heading compact"><div><small className="panel-kicker">DOSYA ÖZETİ</small><h2>Aktif akademik süreç</h2></div></div>
          <div className="dashboard-summary-number">{academicActive.length}</div>
          <p>{money(pipelineValue)} toplam aktif dosya değeri. Sonuçlanan dosyalarda dönüşüm oranı %{conversion}.</p>
          <Link className="panel-text-link" href="/panel/crm">Akademik dosyaları aç →</Link>
        </article> : null}
      </section>
    </>;
  }

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">BUGÜN</small><h1>{isPlatformOwner ? "Yönetim özeti" : "Ana Sayfa"}</h1><p>Bekleyen işler, satışlar ve tahsilatlar tek bakışta.</p></div>
      {headActions}
    </div>
    <section className="metric-strip metric-strip-five">
      {canSeeCrm ? <>
        <article><span className="metric-icon">◎</span><div><small>AKTİF TALEP</small><strong>{activeOpportunities.length}</strong><p>{money(pipelineValue)} toplam değer</p></div></article>
        <article><span className="metric-icon">↗</span><div><small>TAHMİNİ GELİR</small><strong>{money(weightedForecast)}</strong><p>Olasılığa göre</p></div></article>
      </> : null}
      {canSeeOperations ? <article><span className="metric-icon">◇</span><div><small>AKTİF İŞ</small><strong>{openWorkflowCount ?? 0}</strong><p>Planlanan ve devam eden</p></div></article> : null}
      {canSeeFinance ? <article><span className="metric-icon">▦</span><div><small>BU AY TAHSİLAT</small><strong>{money(monthlyRevenue)}</strong><p>{pendingPaymentCount ?? 0} ödeme bekliyor</p></div></article> : null}
      <article><span className="metric-icon">◌</span><div><small>BİLDİRİM</small><strong>{unreadNotificationCount ?? 0}</strong><p>Okunmamış kayıt</p></div></article>
    </section>
    <section className="panel-grid dashboard-grid">
      <article className="panel-card panel-span-2"><div className="section-heading compact"><div><small className="panel-kicker">ÖNCELİKLİ İŞLER</small><h2>Bugün neye odaklanmalı?</h2></div></div><div className="dashboard-actions">{canSeeCrm ? <Link href="/panel/crm"><span>Talepleri incele</span><b>{activeOpportunities.length}</b></Link> : null}{canSeeOperations ? <Link href="/panel/operations"><span>Aktif işleri takip et</span><b>{openWorkflowCount ?? 0}</b></Link> : null}{canSeeFinance ? <Link href="/panel/finance"><span>Bekleyen tahsilatları kontrol et</span><b>{pendingPaymentCount ?? 0}</b></Link> : null}<Link href="/panel/notifications"><span>Bildirimleri gözden geçir</span><b>{unreadNotificationCount ?? 0}</b></Link></div></article>
      {canSeeCrm ? <article className="panel-card"><div className="section-heading compact"><div><small className="panel-kicker">SATIŞ ÖZETİ</small><h2>Dönüşüm</h2></div></div><div className="dashboard-summary-number">%{conversion}</div><p>{items.length} talepten {completedCount} tanesi tamamlandı.</p><Link className="panel-text-link" href="/panel/crm">CRM&apos;i aç →</Link></article> : null}
    </section>
  </>;
}
