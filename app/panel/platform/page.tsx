import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext, panelModules } from "@/lib/panel-context";
import { createCustomerOrganization, toggleOrganizationModule, updateOrganizationSettings } from "./actions";

type ModuleRow = { module_code: string; is_enabled: boolean; arvo_modules: { name?: string; description?: string; sort_order?: number } | { name?: string; description?: string; sort_order?: number }[] | null };
type ManagedOrganization = { id: string; name: string; slug: string; status: string; plan_code: string; sector: string; custom_domain: string | null; provisioning_state: string };
type AuditRow = { id: string; action: string; state: string; result: string; duration_ms: number | null; details: Record<string, unknown>; created_at: string };

const stateLabels: Record<string, string> = {
  creating: "Oluşturuluyor",
  inviting_owner: "Owner davet ediliyor",
  waiting_owner: "Owner bekleniyor",
  active: "Aktif",
  suspended: "Askıda",
  archived: "Arşivlendi",
  failed: "Başarısız",
};

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ organization?: string; provisioned?: string }> }) {
  const { supabase, organization: founderOrganization, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const params = await searchParams;
  const { data: organizationData, error: organizationError } = await supabase.from("organizations").select("id,name,slug,status,plan_code,sector,custom_domain,provisioning_state").order("name");
  if (organizationError) throw new Error("Kurum listesi okunamadı.");
  const organizations = (organizationData ?? []) as ManagedOrganization[];
  const selectedOrganization = organizations.find((item) => item.id === params.organization) ?? organizations.find((item) => item.id === founderOrganization.id) ?? organizations[0];
  if (!selectedOrganization) throw new Error("Yönetilecek kurum bulunamadı.");
  const targetId = selectedOrganization.id;
  const [{ count: memberCount }, { count: requestCount }, { data: plans }, { data: moduleData }, { data: invitationData }, { data: auditData }] = await Promise.all([
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", targetId).eq("is_active", true),
    supabase.from("crm_requests").select("id", { count: "exact", head: true }).eq("organization_id", targetId),
    supabase.from("plans").select("code,name").eq("is_active", true).order("created_at"),
    supabase.from("organization_modules").select("module_code,is_enabled,arvo_modules(name,description,sort_order)").eq("organization_id", targetId),
    supabase.from("organization_invitations").select("email,status,sent_at,accepted_at,error_message").eq("organization_id", targetId).order("created_at", { ascending: false }).limit(1),
    supabase.from("provisioning_audit_logs").select("id,action,state,result,duration_ms,details,created_at").eq("organization_id", targetId).order("created_at", { ascending: false }).limit(8),
  ]);
  const latestInvitation = invitationData?.[0];
  const auditRows = (auditData ?? []) as AuditRow[];
  const moduleRows = ((moduleData ?? []) as ModuleRow[]).map((row) => {
    const relation = Array.isArray(row.arvo_modules) ? row.arvo_modules[0] : row.arvo_modules;
    const fallback = panelModules[row.module_code];
    return { code: row.module_code, name: fallback?.name ?? relation?.name ?? row.module_code, description: fallback?.description ?? relation?.description ?? "", enabled: row.is_enabled, order: relation?.sort_order ?? 0 };
  }).sort((a, b) => a.order - b.order);
  const enabledCount = moduleRows.filter((module) => module.enabled).length;

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">YALNIZCA ARVOOS KURUCU ERİŞİMİ</small><h1>Platform Yönetimi</h1><p>Müşteri kurumlarını, provisioning durumlarını, owner davetlerini ve paket erişimlerini yönetin.</p></div><span className="owner-badge">◇ KURUCU YETKİSİ</span></div>
    {params.provisioned === "1" ? <div className="team-notice">Kurum hazırlandı; owner daveti gönderildi ve kabul bekleniyor.</div> : null}

    <section className="management-grid">
      <article className="panel-card management-card">
        <div className="management-heading"><div><small>TENANT PROVISIONING</small><h2>Yeni müşteri kurumu</h2></div><span className="status-pill">Otomatik kurulum</span></div>
        <form className="panel-form" action={createCustomerOrganization}>
          <label>Kurum adı<input name="name" minLength={2} maxLength={160} required placeholder="Örn. AkademikMerkez" /></label>
          <label>Kısa ad / slug<input name="slug" minLength={2} maxLength={80} placeholder="akademikmerkez" /></label>
          <label>Sektör<input name="sector" defaultValue="general" minLength={2} maxLength={80} required /></label>
          <label>Paket<select name="plan_code" defaultValue="starter">{(plans ?? []).map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
          <label>İlk owner adı<input name="owner_name" minLength={2} maxLength={120} required placeholder="Ad Soyad" /></label>
          <label>İlk owner e-posta<input name="owner_email" type="email" required placeholder="owner@firma.com" /></label>
          <label className="wide">Özel alan adı<input name="custom_domain" placeholder="panel.firma.com" /></label>
          <label><input name="seed_crm" type="checkbox" /> CRM demo verisi</label>
          <label><input name="seed_operations" type="checkbox" /> Operasyon demo verisi</label>
          <div className="wide management-submit"><small>Kurum, modüller, demo verileri ve owner daveti tek provisioning akışında hazırlanır.</small><button className="panel-primary" type="submit">Kurumu hazırla ve davet et</button></div>
        </form>
      </article>

      <article className="panel-card management-card">
        <div className="management-heading"><div><small>YÖNETİLECEK KURUM</small><h2>Kurum seçimi</h2></div><span className="status-pill">{organizations.length} kurum</span></div>
        <form className="panel-form" method="get"><label className="wide">Aktif hedef kurum<select name="organization" defaultValue={targetId}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.plan_code}</option>)}</select></label><div className="wide management-submit"><small>Seçim yalnızca kurucu yönetim görünümünü değiştirir.</small><button className="panel-primary" type="submit">Kurumu aç</button></div></form>
        <div className="platform-note"><span>i</span><p><b>Provisioning: {stateLabels[selectedOrganization.provisioning_state] ?? selectedOrganization.provisioning_state}</b>{latestInvitation ? ` · ${latestInvitation.email} · ${latestInvitation.status}` : " · Owner daveti yok"}{latestInvitation?.error_message ? ` · ${latestInvitation.error_message}` : ""}</p></div>
      </article>
    </section>

    <section className="platform-overview"><div><small>CANLI KURUM ÖZETİ</small><h2>{selectedOrganization.name}</h2><p>Seçilen kurumun paket, provisioning ve kullanım durumu canlı veriden okunur.</p></div><dl><div><dt>DURUM</dt><dd>{stateLabels[selectedOrganization.provisioning_state] ?? selectedOrganization.provisioning_state}</dd></div><div><dt>PAKET</dt><dd>{selectedOrganization.plan_code}</dd></div><div><dt>AKTİF MODÜL</dt><dd>{enabledCount}</dd></div><div><dt>KULLANICI</dt><dd>{memberCount ?? 0}</dd></div></dl></section>

    <section className="panel-card management-card">
      <div className="management-heading"><div><small>PROVISIONING AUDIT</small><h2>Son işlem adımları</h2></div><span className="status-pill">{auditRows.length} kayıt</span></div>
      <div className="module-control-list">
        {auditRows.length ? auditRows.map((entry) => <div className="module-control" key={entry.id}><div><b>{stateLabels[entry.state] ?? entry.state}</b><small>{entry.action} · {entry.result} · {new Date(entry.created_at).toLocaleString("tr-TR")}</small></div><span className="status-pill">{entry.duration_ms == null ? "—" : `${entry.duration_ms} ms`}</span></div>) : <p>Bu kurum için henüz provisioning audit kaydı yok.</p>}
      </div>
    </section>

    <section className="management-grid">
      <article className="panel-card management-card"><div className="management-heading"><div><small>KURUM ÇEKİRDEĞİ</small><h2>Kurum ayarları</h2></div><span className="status-pill">{selectedOrganization.status}</span></div><form className="panel-form" action={updateOrganizationSettings}><input type="hidden" name="organization_id" value={targetId} /><label>Kurum adı<input name="name" defaultValue={selectedOrganization.name} minLength={2} maxLength={160} required /></label><label>Sektör<input name="sector" defaultValue={selectedOrganization.sector ?? "general"} minLength={2} maxLength={80} required /></label><label>Paket<select name="plan_code" defaultValue={selectedOrganization.plan_code}>{(plans ?? []).map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label><label>Özel alan adı<input name="custom_domain" defaultValue={selectedOrganization.custom_domain ?? ""} placeholder="panel.firma.com" /></label><div className="wide management-submit"><small>Değişiklikler seçilen kurum paneline uygulanır.</small><button className="panel-primary" type="submit">Ayarları kaydet</button></div></form></article>
      <article className="panel-card management-card"><div className="management-heading"><div><small>PAKET VE ERİŞİM</small><h2>Modül yönetimi</h2></div><span className="status-pill">{enabledCount}/{moduleRows.length} etkin</span></div><div className="module-control-list">{moduleRows.map((module) => <div className="module-control" key={module.code}><div><b>{module.name}</b><small>{module.description}</small></div><form action={toggleOrganizationModule}><input type="hidden" name="organization_id" value={targetId} /><input type="hidden" name="module_code" value={module.code} /><input type="hidden" name="is_enabled" value={String(!module.enabled)} /><button className={module.enabled ? "module-toggle enabled" : "module-toggle"} type="submit"><i /><span>{module.enabled ? "Etkin" : "Kapalı"}</span></button></form></div>)}</div></article>
    </section>

    <section className="platform-grid compact-platform-grid"><article className="panel-card platform-card"><i>KY</i><span>{memberCount ?? 0} aktif</span><h3>Kullanıcılar ve Roller</h3><p>Owner daveti doğrulandığında üyelik otomatik aktifleşir.</p><small className="platform-coming">AUTH BAĞLI</small></article><article className="panel-card platform-card"><i>CRM</i><span>{requestCount ?? 0} kayıt</span><h3>CRM Verileri</h3><p>Demo veri seçildiyse ilk CRM kayıtları otomatik hazırlanır.</p><small className="platform-coming">SEED DESTEKLİ</small></article><article className="panel-card platform-card"><i>DN</i><span>RLS aktif</span><h3>Denetim ve Güvenlik</h3><p>Provisioning işlemleri kurucu kimliği, state machine ve audit kayıtlarıyla korunur.</p><small className="platform-coming">KURUCU SINIRI</small></article></section>
    <div className="platform-note"><span>i</span><p><b>Deneme durumu paket değildir.</b> Yeni kurum `status=trial` ile açılır; paket starter, professional veya enterprise olarak atanır.</p><Link href="/panel">Genel bakışa dön →</Link></div>
  </>;
}
