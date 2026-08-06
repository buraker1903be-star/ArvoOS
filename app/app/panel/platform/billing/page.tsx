import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

type Subscription = { id: string; organization_id: string; provider: string; plan_code: string; status: string; currency: string; unit_amount: number; interval: string; current_period_end: string | null; organizations: { name?: string } | { name?: string }[] | null };
type Invoice = { id: string; organization_id: string; status: string; currency: string; total: number; paid_at: string | null; created_at: string };

const money = (amount: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount / 100);

export default async function BillingPage() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const [{ data: subscriptions }, { data: invoices }] = await Promise.all([
    supabase.from("billing_subscriptions").select("id,organization_id,provider,plan_code,status,currency,unit_amount,interval,current_period_end,organizations(name)").order("created_at", { ascending: false }),
    supabase.from("billing_invoices").select("id,organization_id,status,currency,total,paid_at,created_at").order("created_at", { ascending: false }).limit(50),
  ]);

  const subscriptionRows = (subscriptions ?? []) as Subscription[];
  const invoiceRows = (invoices ?? []) as Invoice[];
  const active = subscriptionRows.filter((item) => item.status === "active" || item.status === "trialing");
  const mrr = active.filter((item) => item.interval === "month").reduce((sum, item) => sum + Number(item.unit_amount), 0)
    + Math.round(active.filter((item) => item.interval === "year").reduce((sum, item) => sum + Number(item.unit_amount), 0) / 12);
  const pastDue = subscriptionRows.filter((item) => item.status === "past_due").length;
  const paidTotal = invoiceRows.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.total), 0);

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">KURUCU FİNANS OPERASYONU</small><h1>Abonelik ve Faturalandırma</h1><p>Tenant aboneliklerini, ödeme durumlarını ve sağlayıcı eşleşmelerini tek merkezden izleyin.</p></div><span className="owner-badge">◇ KURUCU YETKİSİ</span></div>

    <section className="platform-overview"><div><small>FİNANSAL ÖZET</small><h2>Platform geliri</h2><p>Değerler kayıtlı abonelik ve fatura satırlarından hesaplanır.</p></div><dl><div><dt>AKTİF ABONELİK</dt><dd>{active.length}</dd></div><div><dt>TAHMİNİ MRR</dt><dd>{money(mrr, active[0]?.currency ?? "TRY")}</dd></div><div><dt>GECİKMİŞ</dt><dd>{pastDue}</dd></div><div><dt>TAHSİL EDİLEN</dt><dd>{money(paidTotal, invoiceRows[0]?.currency ?? "TRY")}</dd></div></dl></section>

    <section className="panel-card management-card"><div className="management-heading"><div><small>ABONELİKLER</small><h2>Tenant abonelikleri</h2></div><span className="status-pill">{subscriptionRows.length} kayıt</span></div><div className="module-control-list">{subscriptionRows.length ? subscriptionRows.map((row) => { const relation = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations; return <div className="module-control" key={row.id}><div><b>{relation?.name ?? row.organization_id}</b><small>{row.provider} · {row.plan_code} · {money(Number(row.unit_amount), row.currency)}/{row.interval === "year" ? "yıl" : "ay"}</small></div><span className="status-pill">{row.status}</span></div>; }) : <div className="platform-note"><span>i</span><p>Henüz abonelik kaydı yok. Ödeme sağlayıcısı bağlandığında webhook olayları bu tabloyu güncelleyecek.</p></div>}</div></section>
  </>;
}
