import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";

export default async function PanelPage() {
  const { supabase, membership, organization, modules } = await getPanelContext();
  const isOwner = membership.role === "owner";
  const [{ count: requestCount }, { count: wonCount }] = await Promise.all([
    supabase.from("crm_requests").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id),
    supabase.from("crm_requests").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("status", "won"),
  ]);

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">{isOwner ? "KURUCU ÇALIŞMA ALANI" : "KURUM ÇALIŞMA ALANI"}</small><h1>{isOwner ? "Yönetim Merkezi" : "Genel Bakış"}</h1><p>{isOwner ? "ArvoOS platformunu ve kurum operasyonlarını tek merkezden yönetin." : "Satıştan operasyona tüm ekibiniz için tek çalışma merkezi."}</p></div><div className="panel-page-actions"><span className="live-badge"><i /> Sistem aktif</span>{isOwner ? <Link className="panel-primary" href="/panel/platform">Platformu yönet</Link> : null}</div></div>

    <section className="executive-hero">
      <div className="executive-hero-copy"><small>ARVOOS EXECUTIVE LIGHT</small><h2>{isOwner ? "İşletmenizin tamamı, tek bir yönetim ritminde." : "Ekibinizin tamamı, tek bir çalışma ritminde."}</h2><p>Satış, operasyon, finans ve ekip verilerini birbirine bağlı süreçlerle yönetin. Her karar güncel kurum verisine dayanır.</p><div className="hero-actions"><Link href="/panel/crm">Yeni talep oluştur</Link><Link href="/panel/reporting">Raporları incele →</Link></div></div>
      <div className="executive-status"><small>KURUM DURUMU</small><strong>{organization.status === "active" ? "Aktif" : "Kurulumda"}</strong><span><i /> {organization.plan_code.toUpperCase()} paket</span><div><b>{modules.length}</b><small>etkin modül</small></div></div>
    </section>

    <section className="metric-strip">
      <article><span className="metric-icon">◎</span><div><small>TOPLAM TALEP</small><strong>{requestCount ?? 0}</strong><p>CRM havuzundaki kayıt</p></div></article>
      <article><span className="metric-icon">↗</span><div><small>KAZANILAN İŞ</small><strong>{wonCount ?? 0}</strong><p>Satışa dönüşen talep</p></div></article>
      <article><span className="metric-icon">◇</span><div><small>ERİŞİM SEVİYESİ</small><strong>{isOwner ? "Owner" : membership.role}</strong><p>{isOwner ? "Tam platform yetkisi" : "Rol bazlı kurum erişimi"}</p></div></article>
      <article><span className="metric-icon">▦</span><div><small>ETKİN MODÜL</small><strong>{modules.length}</strong><p>Birbirine bağlı çalışma alanı</p></div></article>
    </section>

    <div className="section-heading"><div><small className="panel-kicker">OPERASYON MERKEZİ</small><h2>Çalışma alanları</h2></div><span>{modules.length} modül etkin</span></div>
    <section className="panel-modules">{modules.map((module, index) => <article className="panel-card panel-module" key={module.code}><div className="module-top"><i>{module.icon}</i><span>0{index + 1}</span></div><small>ETKİN MODÜL</small><h3>{module.name}</h3><p>{module.description}</p><Link href={"/panel/" + module.code}>Çalışma alanını aç <b>→</b></Link></article>)}</section>
  </>;
}
