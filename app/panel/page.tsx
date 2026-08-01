import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";

export default async function PanelPage() {
  const { supabase, membership, organization, modules } = await getPanelContext();
  const [{ count: requestCount }, { count: wonCount }] = await Promise.all([
    supabase.from("crm_requests").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id),
    supabase.from("crm_requests").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("status", "won"),
  ]);
  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">KURUM ÇALIŞMA ALANI</small><h1>Genel Bakış</h1><p>Satıştan operasyona tüm ekibiniz için tek çalışma merkezi.</p></div></div>
    <section className="panel-welcome"><div><small>ARVOOS KURUM PANELİ</small><h2>Hoş geldiniz.</h2><p>Kurum ve paket çekirdeğiniz aktif. Modüller artık doğrudan çalışma alanlarına bağlıdır; ekip verileri kurum sınırları içinde korunur.</p></div><div><span>Paket</span><b>{organization.plan_code}</b><small>{organization.status === "active" ? "Aktif kullanım" : "Kurulum sürecinde"}</small></div></section>
    <section className="panel-grid">
      <article className="panel-card"><small>ETKİN MODÜL</small><h2>{modules.length}</h2><p>Kurum paketine tanımlı çalışma alanı</p></article>
      <article className="panel-card"><small>TOPLAM TALEP</small><h2>{requestCount ?? 0}</h2><p>CRM talep havuzundaki kayıt</p></article>
      <article className="panel-card"><small>KAZANILAN İŞ</small><h2>{wonCount ?? 0}</h2><p>Satışa dönüşen kurum talebi</p></article>
    </section>
    <section className="panel-modules">{modules.map((module) => <article className="panel-card panel-module" key={module.code}><i>{module.icon}</i><small>ETKİN MODÜL</small><h3>{module.name}</h3><p>{module.description}</p><Link href={"/panel/" + module.code}>Çalışma alanını aç →</Link></article>)}</section>
  </>;
}