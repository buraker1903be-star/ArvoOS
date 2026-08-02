import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext, panelModules } from "@/lib/panel-context";
import { toggleOrganizationModule, updateOrganizationSettings } from "./actions";

type ModuleRow = {
  module_code: string;
  is_enabled: boolean;
  arvo_modules:
    | { name?: string; description?: string; sort_order?: number }
    | { name?: string; description?: string; sort_order?: number }[]
    | null;
};

type ManagedOrganization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_code: string;
  sector: string;
  custom_domain: string | null;
};

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ organization?: string }> }) {
  const { supabase, organization: founderOrganization, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const params = await searchParams;
  const { data: organizationData, error: organizationError } = await supabase.from("organizations")
    .select("id,name,slug,status,plan_code,sector,custom_domain")
    .order("name");
  if (organizationError) throw new Error("Kurum listesi okunamadı.");

  const organizations = (organizationData ?? []) as ManagedOrganization[];
  const selectedOrganization = organizations.find((item) => item.id === params.organization)
    ?? organizations.find((item) => item.id === founderOrganization.id)
    ?? organizations[0];
  if (!selectedOrganization) throw new Error("Yönetilecek kurum bulunamadı.");

  const targetId = selectedOrganization.id;
  const [
    { count: memberCount },
    { count: requestCount },
    { data: plans },
    { data: moduleData },
  ] = await Promise.all([
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true })
      .eq("organization_id", targetId).eq("is_active", true),
    supabase.from("crm_requests").select("id", { count: "exact", head: true })
      .eq("organization_id", targetId),
    supabase.from("plans").select("code,name").eq("is_active", true).order("created_at"),
    supabase.from("organization_modules")
      .select("module_code,is_enabled,arvo_modules(name,description,sort_order)")
      .eq("organization_id", targetId),
  ]);

  const moduleRows = ((moduleData ?? []) as ModuleRow[]).map((row) => {
    const relation = Array.isArray(row.arvo_modules) ? row.arvo_modules[0] : row.arvo_modules;
    const fallback = panelModules[row.module_code];
    return {
      code: row.module_code,
      name: fallback?.name ?? relation?.name ?? row.module_code,
      description: fallback?.description ?? relation?.description ?? "",
      enabled: row.is_enabled,
      order: relation?.sort_order ?? 0,
    };
  }).sort((a, b) => a.order - b.order);
  const enabledCount = moduleRows.filter((module) => module.enabled).length;

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">YALNIZCA ARVOOS KURUCU ERİŞİMİ</small><h1>Platform Yönetimi</h1><p>Müşteri kurumlarını, paketlerini ve modül erişimlerini canlı sistem üzerinde yönetin.</p></div>
      <span className="owner-badge">◇ KURUCU YETKİSİ</span>
    </div>

    <section className="panel-card management-card">
      <div className="management-heading"><div><small>YÖNETİLECEK KURUM</small><h2>Kurum seçimi</h2></div><span className="status-pill">{organizations.length} kurum</span></div>
      <form className="panel-form" method="get">
        <label className="wide">Aktif hedef kurum<select name="organization" defaultValue={targetId}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.plan_code}</option>)}</select></label>
        <div className="wide management-submit"><small>Seçim yalnızca kurucu yönetim görünümünü değiştirir.</small><button className="panel-primary" type="submit">Kurumu aç</button></div>
      </form>
    </section>

    <section className="platform-overview">
      <div><small>CANLI KURUM ÖZETİ</small><h2>{selectedOrganization.name}</h2><p>Seçilen kurumun paketi, modülleri ve kullanım özeti güvenli kurucu politikaları üzerinden yönetilir.</p></div>
      <dl><div><dt>KURUM</dt><dd>{selectedOrganization.name}</dd></div><div><dt>PAKET</dt><dd>{selectedOrganization.plan_code}</dd></div><div><dt>AKTİF MODÜL</dt><dd>{enabledCount}</dd></div><div><dt>KULLANICI</dt><dd>{memberCount ?? 0}</dd></div></dl>
    </section>

    <section className="management-grid">
      <article className="panel-card management-card">
        <div className="management-heading"><div><small>KURUM ÇEKİRDEĞİ</small><h2>Kurum ayarları</h2></div><span className="status-pill">{selectedOrganization.status}</span></div>
        <form className="panel-form" action={updateOrganizationSettings}>
          <input type="hidden" name="organization_id" value={targetId} />
          <label>Kurum adı<input name="name" defaultValue={selectedOrganization.name} minLength={2} maxLength={160} required /></label>
          <label>Sektör<input name="sector" defaultValue={selectedOrganization.sector ?? "general"} minLength={2} maxLength={80} required /></label>
          <label>Paket<select name="plan_code" defaultValue={selectedOrganization.plan_code}>{(plans ?? []).map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
          <label>Özel alan adı<input name="custom_domain" defaultValue={selectedOrganization.custom_domain ?? ""} placeholder="panel.firma.com" /></label>
          <div className="wide management-submit"><small>Değişiklikler seçilen kurum paneline uygulanır.</small><button className="panel-primary" type="submit">Ayarları kaydet</button></div>
        </form>
      </article>

      <article className="panel-card management-card">
        <div className="management-heading"><div><small>PAKET VE ERİŞİM</small><h2>Modül yönetimi</h2></div><span className="status-pill">{enabledCount}/{moduleRows.length} etkin</span></div>
        <div className="module-control-list">
          {moduleRows.map((module) => <div className="module-control" key={module.code}>
            <div><b>{module.name}</b><small>{module.description}</small></div>
            <form action={toggleOrganizationModule}>
              <input type="hidden" name="organization_id" value={targetId} />
              <input type="hidden" name="module_code" value={module.code} />
              <input type="hidden" name="is_enabled" value={String(!module.enabled)} />
              <button className={module.enabled ? "module-toggle enabled" : "module-toggle"} type="submit" aria-label={module.name + (module.enabled ? " modülünü kapat" : " modülünü aç")}>
                <i /><span>{module.enabled ? "Etkin" : "Kapalı"}</span>
              </button>
            </form>
          </div>)}
        </div>
      </article>
    </section>

    <section className="platform-grid compact-platform-grid">
      <article className="panel-card platform-card"><i>KY</i><span>{memberCount ?? 0} aktif</span><h3>Kullanıcılar ve Roller</h3><p>Seçilen kurumun aktif üyelik sayısı canlı veriden okunur.</p><small className="platform-coming">KURUM BAZLI</small></article>
      <article className="panel-card platform-card"><i>CRM</i><span>{requestCount ?? 0} kayıt</span><h3>CRM Verileri</h3><p>Seçilen kuruma ait talep hacmi ve satış süreci canlı kayıtlardan okunur.</p><small className="platform-coming">CANLI VERİ</small></article>
      <article className="panel-card platform-card"><i>DN</i><span>RLS aktif</span><h3>Denetim ve Güvenlik</h3><p>Yönetim işlemleri ArvoOS ana kurumundaki doğrulanmış kurucu hesabıyla sınırlandırılır.</p><small className="platform-coming">KURUCU SINIRI</small></article>
    </section>

    <div className="platform-note"><span>i</span><p><b>Kurucu erişimi müşteri kurum rollerinden bağımsızdır.</b> Hedef kurum üzerinde yapılan işlemler ArvoOS kurucu kimliğiyle doğrulanır.</p><Link href="/panel">Genel bakışa dön →</Link></div>
  </>;
}
