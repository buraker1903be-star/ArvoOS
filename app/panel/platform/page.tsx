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

export default async function PlatformPage() {
  const { supabase, membership, organization, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const [
    { count: memberCount },
    { count: requestCount },
    { data: plans },
    { data: moduleData },
  ] = await Promise.all([
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id).eq("is_active", true),
    supabase.from("crm_requests").select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id),
    supabase.from("plans").select("code,name").eq("is_active", true).order("created_at"),
    supabase.from("organization_modules")
      .select("module_code,is_enabled,arvo_modules(name,description,sort_order)")
      .eq("organization_id", membership.organization_id),
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
      <div><small className="panel-kicker">YALNIZCA ARVOOS KURUCU ERİŞİMİ</small><h1>Platform Yönetimi</h1><p>Kurum çekirdeğini, paketi ve modül erişimlerini canlı sistem üzerinde yönetin.</p></div>
      <span className="owner-badge">◇ KURUCU YETKİSİ</span>
    </div>

    <section className="platform-overview">
      <div><small>CANLI PLATFORM ÖZETİ</small><h2>ArvoOS yönetim katmanı çalışıyor.</h2><p>Ayar değişiklikleri sunucu tarafında doğrulanır ve RLS ile yalnızca ArvoOS kurucu hesabına açılır.</p></div>
      <dl><div><dt>AKTİF KURUM</dt><dd>{organization.name}</dd></div><div><dt>PAKET</dt><dd>{organization.plan_code}</dd></div><div><dt>AKTİF MODÜL</dt><dd>{enabledCount}</dd></div><div><dt>KULLANICI</dt><dd>{memberCount ?? 0}</dd></div></dl>
    </section>

    <section className="management-grid">
      <article className="panel-card management-card">
        <div className="management-heading"><div><small>KURUM ÇEKİRDEĞİ</small><h2>Kurum ayarları</h2></div><span className="status-pill">Canlı</span></div>
        <form className="panel-form" action={updateOrganizationSettings}>
          <label>Kurum adı<input name="name" defaultValue={organization.name} minLength={2} maxLength={160} required /></label>
          <label>Sektör<input name="sector" defaultValue={organization.sector ?? "general"} minLength={2} maxLength={80} required /></label>
          <label>Paket<select name="plan_code" defaultValue={organization.plan_code}>{(plans ?? []).map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
          <label>Özel alan adı<input name="custom_domain" defaultValue={organization.custom_domain ?? ""} placeholder="panel.firma.com" /></label>
          <div className="wide management-submit"><small>Değişiklikler kurum paneline anında uygulanır.</small><button className="panel-primary" type="submit">Ayarları kaydet</button></div>
        </form>
      </article>

      <article className="panel-card management-card">
        <div className="management-heading"><div><small>PAKET VE ERİŞİM</small><h2>Modül yönetimi</h2></div><span className="status-pill">{enabledCount}/{moduleRows.length} etkin</span></div>
        <div className="module-control-list">
          {moduleRows.map((module) => <div className="module-control" key={module.code}>
            <div><b>{module.name}</b><small>{module.description}</small></div>
            <form action={toggleOrganizationModule}>
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
      <article className="panel-card platform-card"><i>KY</i><span>{memberCount ?? 0} aktif</span><h3>Kullanıcılar ve Roller</h3><p>Davet, rol değişikliği ve erişim sonlandırma akışı sıradaki güvenli yönetim katmanında açılıyor.</p><small className="platform-coming">AUTH + RLS HAZIRLANIYOR</small></article>
      <article className="panel-card platform-card"><i>CRM</i><span>{requestCount ?? 0} kayıt</span><h3>CRM Verileri</h3><p>Kuruma ait talep hacmi ve satış süreci doğrudan canlı kayıtlardan okunur.</p><small className="platform-coming">CANLI VERİ</small></article>
      <article className="panel-card platform-card"><i>DN</i><span>RLS aktif</span><h3>Denetim ve Güvenlik</h3><p>Kurum ayarı ve modül değişiklikleri kullanıcı oturumu ve kurucu rolüyle doğrulanır.</p><small className="platform-coming">KURUM SINIRI KORUNUYOR</small></article>
    </section>

    <div className="platform-note"><span>i</span><p><b>Kurucu erişimi kurum owner rolünden ayrıdır.</b> Bu işlemler yalnızca ArvoOS ana kurumunun doğrulanmış owner hesabıyla çalışır.</p><Link href="/panel">Genel bakışa dön →</Link></div>
  </>;
}
