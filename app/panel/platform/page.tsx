import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext, panelModules } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { ORGANIZATION_LEGAL_COLUMNS } from "@/app/_components/legal/organization";
import { legalDetailsFrom, validateLegalDetails } from "../settings/legal-details";
import { StgIcon, StgSection, StgValueRow, StgWidget, type StgTone } from "../settings/settings-ui";
import { PanelDrawer } from "../components/panel-drawer";
import { createCustomerOrganization, toggleOrganizationModule, updateOrganizationSettings } from "./actions";
import { NewOrganizationWizard } from "./new-organization-wizard";
import { OwnerAccessLink } from "./owner-access-link";
import "../settings/settings.css";
import "./platform.css";

type ModuleRow = { module_code: string; is_enabled: boolean; arvo_modules: { name?: string; description?: string; sort_order?: number } | { name?: string; description?: string; sort_order?: number }[] | null };
type ManagedOrganization = {
  id: string; name: string; display_name: string | null; slug: string; status: string; plan_code: string; sector: string;
  custom_domain: string | null; custom_domain_status: string | null; provisioning_state: string; logo_url: string | null; kind: string;
};
type Invitation = { organization_id: string; email: string; status: string; sent_at: string | null; accepted_at: string | null; error_message: string | null };
type AuditRow = { id: string; action: string; state: string; result: string; duration_ms: number | null; created_at: string };
type CheckState = "done" | "todo" | "bad" | "unknown";

const stateLabels: Record<string, string> = {
  creating: "Oluşturuluyor",
  inviting_owner: "Davet gönderiliyor",
  waiting_owner: "Sahip bekleniyor",
  active: "Kullanımda",
  suspended: "Askıda",
  archived: "Arşivlendi",
  failed: "Kurulum hatası",
};
const stateTones: Record<string, StgTone> = {
  creating: "info", inviting_owner: "info", waiting_owner: "warning", active: "success", suspended: "danger", archived: "neutral", failed: "danger",
};
const actionLabels: Record<string, string> = { provision_organization: "Kurulum", owner_access_link: "Giriş bağlantısı" };
const licenseLabels: Record<string, string> = { trialing: "Deneme", active: "Aktif", past_due: "Ödeme gecikmiş", suspended: "Askıda", canceled: "İptal" };
const PENDING_STATES = new Set(["creating", "inviting_owner", "waiting_owner"]);

const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" }) : "—";
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";
const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR")).join("") || "?";

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ organization?: string; provisioned?: string }> }) {
  const { supabase, organization: founderOrganization, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const params = await searchParams;

  const [{ data: organizationData, error: organizationError }, { data: invitationData }, { data: plans }, pendingPayments] = await Promise.all([
    supabase.from("organizations").select("id,name,display_name,slug,status,plan_code,sector,custom_domain,custom_domain_status,provisioning_state,logo_url,kind").order("name"),
    supabase.from("organization_invitations").select("organization_id,email,status,sent_at,accepted_at,error_message").order("created_at", { ascending: false }),
    supabase.from("plans").select("code,name").eq("is_active", true).order("created_at"),
    supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  if (organizationError) throw new Error("Kurum listesi okunamadı.");
  const organizations = (organizationData ?? []) as ManagedOrganization[];
  const latestInvitation = new Map<string, Invitation>();
  for (const invitation of (invitationData ?? []) as Invitation[]) {
    if (!latestInvitation.has(invitation.organization_id)) latestInvitation.set(invitation.organization_id, invitation);
  }
  const planList = (plans ?? []).map((plan) => ({ code: String(plan.code), name: String(plan.name) }));
  const planNames = new Map(planList.map((plan) => [plan.code, plan.name]));

  const selected = organizations.find((item) => item.id === params.organization) ?? organizations.find((item) => item.id === founderOrganization.id) ?? organizations[0];
  if (!selected) throw new Error("Yönetilecek kurum bulunamadı.");
  const targetId = selected.id;
  const invitation = latestInvitation.get(targetId) ?? null;

  const admin = createAdminClient();
  const [{ count: memberCount }, { data: moduleData }, { data: auditData }, legalResult, licenseResult, onboardingResult, opportunityResult] = await Promise.all([
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", targetId).eq("is_active", true),
    supabase.from("organization_modules").select("module_code,is_enabled,arvo_modules(name,description,sort_order)").eq("organization_id", targetId),
    supabase.from("provisioning_audit_logs").select("id,action,state,result,duration_ms,created_at").eq("organization_id", targetId).order("created_at", { ascending: false }).limit(8),
    supabase.from("organizations").select(`${ORGANIZATION_LEGAL_COLUMNS},signature_stamp_url`).eq("id", targetId).maybeSingle(),
    supabase.from("organization_licenses").select("license_status,trial_ends_at,user_limit").eq("organization_id", targetId).maybeSingle(),
    // İlk kurulum kaydı yalnızca kurum üyelerine açık (RLS); kurucu sunucu anahtarıyla okur.
    admin ? admin.from("organization_onboarding").select("completed_at").eq("organization_id", targetId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    // Talepler de yalnızca kurum üyelerine açık; sayı sunucu anahtarıyla okunur.
    admin ? admin.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", targetId) : Promise.resolve({ count: null, error: null }),
  ]);
  const auditRows = (auditData ?? []) as AuditRow[];
  const moduleRows = ((moduleData ?? []) as ModuleRow[]).map((row) => {
    const relation = Array.isArray(row.arvo_modules) ? row.arvo_modules[0] : row.arvo_modules;
    const fallback = panelModules[row.module_code];
    return { code: row.module_code, name: fallback?.name ?? relation?.name ?? row.module_code, description: fallback?.description ?? relation?.description ?? "", icon: fallback?.icon ?? row.module_code.slice(0, 2).toUpperCase(), enabled: row.is_enabled, order: relation?.sort_order ?? 0 };
  }).sort((a, b) => a.order - b.order);
  const enabledCount = moduleRows.filter((module) => module.enabled).length;
  const legal = legalDetailsFrom(legalResult.error ? null : (legalResult.data as Record<string, unknown> | null));
  const legalFilled = [legal.legal_address, legal.legal_city, legal.tax_office, legal.tax_number, legal.iban].filter(Boolean).length;
  // Ayarlar'daki "Belge kimliği" ve müşterinin kurulum kartıyla aynı ölçüt.
  const legalComplete = legalFilled === 5 && !Object.keys(validateLegalDetails(legal)).length;
  const license = licenseResult.error ? null : (licenseResult.data as { license_status: string; trial_ends_at: string | null; user_limit: number } | null);
  const onboardingDone = Boolean((onboardingResult.data as { completed_at?: string | null } | null)?.completed_at);
  const signatureUrl = legalResult.error ? null : (legalResult.data as { signature_stamp_url?: string | null } | null)?.signature_stamp_url ?? null;
  const opportunityCount = opportunityResult.count ?? 0;
  // ArvoLab ayrı veritabanında; köprü koparsa tek iz orada kalır (lib/arvolab.ts).
  const bridge = await getArvolabBridgeHealth();
  // ARC köprüsü sessiz çalışıyor; durumu yalnızca burada görünür (lib/arc-bridge.ts).
  const arcBridge = await getArcBridgeHealth();

  // ---- Kurulum durumu (sahip katılana ve kurum hazır olana kadar)
  /*
    Sahip katılmış sayılır: daveti kabul ettiyse YA DA kurumda aktif kullanıcı
    varsa. Eskiden yalnızca davet kaydına bakılıyordu; sahibi doğrudan eklenen
    kurumlarda (platformun kendi kurumu gibi) davet kaydı hiç oluşmadığı için
    bu adım sonsuza kadar eksik görünüyor ve "Kurulum bekleyen" sayacını
    şişiriyordu.
  */
  const hasActiveMember = (memberCount ?? 0) > 0;
  const ownerJoined = Boolean(invitation?.accepted_at) || invitation?.status === "accepted" || hasActiveMember;
  const inviteState: CheckState = invitation
    ? invitation.status === "failed" ? "bad" : ["sent", "accepted"].includes(invitation.status) ? "done" : "todo"
    : hasActiveMember ? "done" : "todo";
  const checks: { key: string; title: string; note: string; state: CheckState; optional?: boolean }[] = [
    { key: "created", title: "Kurum oluşturuldu", note: `${planNames.get(selected.plan_code) ?? selected.plan_code} paketi · ${enabledCount} modül etkin`, state: selected.provisioning_state === "creating" ? "todo" : "done" },
    {
      key: "invite", title: "Sahibe davet gönderildi", state: inviteState,
      note: !invitation ? (hasActiveMember ? "Davet gerekmedi; sahip doğrudan eklendi." : "Davet kaydı yok.") : invitation.status === "failed" ? `Davet gönderilemedi: ${invitation.error_message ?? "bilinmeyen hata"}. Aşağıdan giriş bağlantısı oluşturun.` : `${invitation.email}${invitation.sent_at ? ` · ${dateTime(invitation.sent_at)}` : ""}`,
    },
    { key: "joined", title: "Sahip hesabını açtı", state: ownerJoined ? "done" : "todo", note: ownerJoined ? `${invitation?.accepted_at ? `Katıldı · ${dateTime(invitation.accepted_at)}` : "Hesap açık"} · ${memberCount ?? 0} aktif kullanıcı` : "Davet bekleniyor. E-posta gelmediyse giriş bağlantısını WhatsApp’tan gönderin." },
    { key: "onboarding", title: "İlk kurulum tamamlandı", state: !admin ? "unknown" : onboardingDone ? "done" : "todo", note: !admin ? "Sunucu anahtarı olmadan okunamıyor." : onboardingDone ? "Kurum bilgileri ve marka ayarları girildi." : "Sahip ilk girişte kurum bilgilerini ve marka rengini girer." },
    { key: "legal", title: "Resmi bilgiler", state: legalResult.error ? "unknown" : legalComplete ? "done" : "todo", note: legalComplete ? "Teklif ve sözleşmeler için hazır." : legalFilled === 5 ? "Alanlar dolu ama biri geçersiz (IBAN, vergi no veya MERSİS). Sahip Ayarlar’dan düzeltir." : `${legalFilled}/5 zorunlu alan dolu (adres, il, vergi dairesi, vergi no, IBAN). Sahip Ayarlar’dan tamamlar.` },
    { key: "logo", title: "Logo", state: selected.logo_url ? "done" : "todo", note: selected.logo_url ? "Belgelerde ve takip ekranında kullanılıyor." : "Logo yüklenmedi; belgelerde kurum adı yazar." },
    { key: "signature", title: "Kaşe-imza görseli", state: legalResult.error ? "unknown" : signatureUrl ? "done" : "todo", note: signatureUrl ? "Sözleşmelerde hizmet sağlayıcı imzası olarak görünüyor." : "Yüklenmedi; sözleşmelerde imza alanı boş kalır. Sahip Ayarlar’dan yükler." },
    { key: "first-request", title: "İlk talep girildi", state: !admin || opportunityResult.error ? "unknown" : opportunityCount > 0 ? "done" : "todo", note: !admin ? "Sunucu anahtarı olmadan okunamıyor." : opportunityCount > 0 ? `${opportunityCount} talep kayıtlı; kurum paneli kullanıyor.` : "Henüz talep yok. Sahip CRM’den ilk talebini girince teklif ve sözleşme süreci başlar." },
    { key: "team", title: "Ekip davet edildi", optional: true, state: (memberCount ?? 0) > 1 ? "done" : "todo", note: (memberCount ?? 0) > 1 ? `${memberCount} aktif kullanıcı` : "Şimdilik yalnızca sahip var. Ekip, İnsan Kaynakları’ndan eklenir." },
    {
      key: "domain", title: "Özel alan adı", optional: true,
      state: !selected.custom_domain ? "todo" : selected.custom_domain_status === "verified" ? "done" : selected.custom_domain_status === "failed" ? "bad" : "todo",
      note: !selected.custom_domain ? "İsteğe bağlı; tanımlı değil." : `${selected.custom_domain} · ${selected.custom_domain_status === "verified" ? "doğrulandı" : selected.custom_domain_status === "failed" ? "doğrulanamadı" : "DNS doğrulaması bekleniyor"}`,
    },
  ];
  const required = checks.filter((check) => !check.optional);
  const doneCount = required.filter((check) => check.state === "done").length;
  const progress = Math.round((doneCount / required.length) * 100);

  // ---- Genel özet
  /*
    Sayaçlar yalnızca müşteri kurumları sayar. Kendi markalarımız listede
    görünür ama "kaç müşterim var" sorusunu bulandırmasın.
  */
  const customers = organizations.filter((item) => item.kind !== "internal");
  const activeCount = customers.filter((item) => item.provisioning_state === "active").length;
  const pendingCount = customers.filter((item) => PENDING_STATES.has(item.provisioning_state)).length;
  const issueCount = customers.filter((item) => item.provisioning_state === "failed" || item.provisioning_state === "suspended" || item.status === "suspended").length;
  const paymentsWaiting = pendingPayments.error ? 0 : pendingPayments.count ?? 0;

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">YALNIZCA ARVOOS KURUCU ERİŞİMİ</small><h1>Platform Yönetimi</h1><p>Müşteri kurumlarını kurun, sahiplerini panele alın, paket ve modüllerini yönetin.</p></div>
      <div className="panel-page-actions">
        <PanelDrawer triggerLabel="+ Yeni müşteri" kicker="YENİ MÜŞTERİ" title="Yeni müşteri kurulumu" description="Dört adımda kurum, paket ve sahip hesabı hazırlanır; davet otomatik gönderilir.">
          <NewOrganizationWizard action={createCustomerOrganization} plans={planList} existingSlugs={organizations.map((item) => item.slug)} />
        </PanelDrawer>
      </div>
    </div>

    {bridge?.broken ? (
      <div className="plt-banner" data-tone="danger" role="alert">
        <span className="plt-banner-icon"><StgIcon name="shield" size={18} /></span>
        <div>
          <b>ArvoLab köprüsü yanıt vermiyor{bridge.permanent ? " · yapılandırma hatası" : ""}</b>
          <p>
            {bridge.permanent
              ? "Anahtar eksik ya da iki tarafta farklı. ArvoLab abonelik durumunu soramıyor ve kimseyi engellemediği için bireysel kullanıcılar şu an ücretsiz kullanıyor. Vercel'de PRODUCT_BRIDGE_SECRET'in iki projede de aynı olduğunu kontrol edin."
              : "ArvoLab, ArvoOS'a ulaşamıyor. Kullanıcılar engellenmiyor; sorun sürerse bireysel abonelikler denetlenemez."}
            {bridge.lastErrorAt ? ` Son hata: ${dateTime(bridge.lastErrorAt)}.` : ""}
            {bridge.lastOkAt ? ` Son başarılı bağlantı: ${dateTime(bridge.lastOkAt)}.` : " Hiç başarılı bağlantı kaydı yok."}
          </p>
        </div>
      </div>
    ) : null}

    {!arcBridge.ok ? (
      <div className="plt-banner" data-tone={arcBridge.error ? "danger" : undefined} role="status">
        <span className="plt-banner-icon"><StgIcon name="shield" size={18} /></span>
        <div>
          <b>{arcBridge.error ? "ARC köprüsü bağlanamıyor" : "ARC köprüsü kapalı"}</b>
          <p>
            {arcBridge.error
              ? `ARC veritabanına bağlanılamadı: ${arcBridge.error}. Anahtarın yeni ARC projesinin secret anahtarı olduğunu kontrol edin.`
              : `Bu dağıtımda tanımlı olmayan değişkenler: ${arcBridge.missing.join(", ")}. Vercel'de ArvoOS projesine Production ortamı için ekleyip yeniden dağıtın.`}
          </p>
        </div>
      </div>
    ) : (
      <p className="plt-substatus">ARC köprüsü bağlı · ARC veritabanında {arcBridge.organizations} kurum.</p>
    )}

    {params.provisioned === "1" ? (
      <div className="plt-banner" role="status">
        <span className="plt-banner-icon"><StgIcon name="check" size={18} /></span>
        <div>
          <b>{selected.display_name || selected.name} kuruldu</b>
          <p>Davet {invitation?.email ?? "sahibin e-posta adresine"} gönderildi. E-posta gelmezse “Kurulum durumu” bölümünden giriş bağlantısı oluşturup WhatsApp’tan gönderin.</p>
        </div>
      </div>
    ) : null}

    <section className="stg-widgets" aria-label="Platform özeti">
      <StgWidget tone="gold" icon="building" label="Müşteri kurum" value={customers.length} note={organizations.length > customers.length ? `${organizations.length - customers.length} kendi markamız ayrı tutuluyor` : "Platformdaki müşteriler"} />
      <StgWidget tone="success" icon="check" label="Kullanımda" value={activeCount} note="Sahibi katılmış kurumlar" />
      <StgWidget tone={pendingCount ? "warning" : "neutral"} icon="users" label="Kurulum bekleyen" value={pendingCount} note={pendingCount ? "Sahibin katılması bekleniyor" : "Bekleyen kurulum yok"} />
      <StgWidget tone={issueCount ? "danger" : "neutral"} icon="shield" label="Dikkat" value={issueCount} note={issueCount ? "Hata veya askıdaki kurum" : "Sorunlu kurum yok"} />
    </section>

    <nav className="stg-nav" aria-label="Platform bölümleri">
      <Link href={`/panel/platform/licenses?organization=${targetId}`}><StgIcon name="box" size={16} />Lisans ve kota</Link>
      <Link href="/panel/platform/billing"><StgIcon name="chart" size={16} />Abonelikler</Link>
      <Link href="/panel/platform/subscribers"><StgIcon name="users" size={16} />Bireysel aboneler</Link>
      <Link href="/panel/platform/members"><StgIcon name="users" size={16} />Tüm üyeler</Link>
      <Link href="/panel/platform/payments"><StgIcon name="wallet" size={16} />Ödeme onayları{paymentsWaiting ? <span className="plt-count">{paymentsWaiting}</span> : null}</Link>
    </nav>

    <div className="plt-layout">
      <aside className="plt-orgs" aria-label="Kurumlar">
        <header><b>Kurumlar</b><small>{organizations.length} kurum</small></header>
        <ul>
          {organizations.map((item) => {
            const itemInvite = latestInvitation.get(item.id);
            const label = item.display_name || item.name;
            return (
              <li key={item.id}>
                <Link href={`/panel/platform?organization=${item.id}`} className={item.id === targetId ? "plt-org is-active" : "plt-org"} aria-current={item.id === targetId ? "page" : undefined}>
                  <span className="plt-org-avatar" data-tone={stateTones[item.provisioning_state] ?? "neutral"}>{initials(label)}</span>
                  <span className="plt-org-text">
                    <b>{label}</b>
                    <small>{item.slug} · {item.kind === "internal" ? "Kendi markamız" : planNames.get(item.plan_code) ?? item.plan_code}{item.provisioning_state === "waiting_owner" && itemInvite?.email ? ` · ${itemInvite.email}` : ""}</small>
                  </span>
                  <span className="status-pill" data-tone={stateTones[item.provisioning_state] ?? "neutral"}>{stateLabels[item.provisioning_state] ?? item.provisioning_state}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="plt-detail">
        <StgSection
          id="kurum" wide icon="building" tone={stateTones[selected.provisioning_state] ?? "neutral"}
          kicker={selected.slug} title={selected.display_name || selected.name}
          description={selected.display_name ? selected.name : `${selected.sector} sektörü`}
          aside={<span className="status-pill" data-tone={stateTones[selected.provisioning_state] ?? "neutral"}>{stateLabels[selected.provisioning_state] ?? selected.provisioning_state}</span>}
        >
          <dl className="stg-list plt-facts">
            <StgValueRow label="Paket" value={planNames.get(selected.plan_code) ?? selected.plan_code} />
            <StgValueRow label="Lisans" value={license ? `${licenseLabels[license.license_status] ?? license.license_status}${license.license_status === "trialing" && license.trial_ends_at ? ` · ${date(license.trial_ends_at)} bitiş` : ""}` : null} />
            <StgValueRow label="Kullanıcılar" value={`${memberCount ?? 0}${license?.user_limit ? ` / ${license.user_limit}` : ""} aktif`} />
            <StgValueRow label="Modüller" value={`${enabledCount} / ${moduleRows.length} etkin`} />
            <StgValueRow label="Sahip" value={invitation?.email ?? null} />
          </dl>
        </StgSection>

        <StgSection
          id="kurulum" wide icon="check" tone={progress === 100 ? "success" : "warning"}
          kicker="KURULUM DURUMU" title={progress === 100 ? "Kurum kullanıma hazır" : "Müşteriyi panele alın"}
          description="Kurumun kullanıma hazır olması için gereken adımlar. Sahip katılınca kalan adımları kendi panelinden tamamlar."
          aside={<span className="plt-progress" aria-label={`Kurulum ilerlemesi yüzde ${progress}`}><i style={{ width: `${progress}%` }} /><b>{doneCount}/{required.length}</b></span>}
        >
          <ol className="plt-checks">
            {checks.map((check) => (
              <li key={check.key} className={`is-${check.state}`}>
                <span className="plt-check-dot" aria-hidden="true">{check.state === "done" ? <StgIcon name="check" size={14} /> : check.state === "bad" ? "!" : check.state === "unknown" ? "?" : ""}</span>
                <span><b>{check.title}{check.optional ? <small className="plt-optional">isteğe bağlı</small> : null}</b><small>{check.note}</small></span>
              </li>
            ))}
          </ol>
          {invitation ? (
            <div className="plt-access-box">
              <div>
                <b>Sahibe giriş bağlantısı</b>
                <small>{ownerJoined ? "Sahip şifresini unuttuysa yeni şifre bağlantısı gönderin." : "Davet e-postası gelmediyse ya da süresi dolduysa tek kullanımlık bağlantıyı WhatsApp’tan gönderin."}</small>
              </div>
              <OwnerAccessLink organizationId={targetId} organizationName={selected.display_name || selected.name} ownerEmail={invitation.email} />
            </div>
          ) : null}
        </StgSection>

        <div className="plt-two">
          <StgSection id="ayarlar" icon="palette" tone="info" kicker="KURUM ÇEKİRDEĞİ" title="Kurum ayarları" description="Değişiklikler seçilen kurumun paneline uygulanır.">
            <form className="panel-form" action={updateOrganizationSettings}>
              <input type="hidden" name="organization_id" value={targetId} />
              <label className="wide">Yasal unvan<input name="name" defaultValue={selected.name} minLength={2} maxLength={160} required /></label>
              <label className="wide">Tabela unvanı <small className="plt-optional">boşsa yasal unvan</small><input name="display_name" defaultValue={selected.display_name ?? ""} maxLength={80} placeholder="Örn. AkademikMerkez" /></label>
              <label>Sektör<input name="sector" defaultValue={selected.sector ?? "general"} minLength={2} maxLength={80} required /></label>
              <label>Kurum türü<select name="kind" defaultValue={selected.kind ?? "customer"}><option value="customer">Müşteri</option><option value="internal">Kendi markamız</option></select></label>
              <label>Paket<select name="plan_code" defaultValue={selected.plan_code}>{planList.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
              <label className="wide">Özel alan adı<input name="custom_domain" defaultValue={selected.custom_domain ?? ""} placeholder="panel.firma.com" /></label>
              <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Ayarları kaydet</button></div>
            </form>
          </StgSection>

          <StgSection id="moduller" icon="grid" tone="gold" kicker="PAKET VE ERİŞİM" title="Modüller" description="Kurumun panelinde görünecek modüller." aside={<span className="status-pill" data-tone="gold">{enabledCount}/{moduleRows.length}</span>}>
            {moduleRows.length ? (
              <div className="stg-list">
                {moduleRows.map((module) => (
                  <form className="plt-module" action={toggleOrganizationModule} key={module.code}>
                    <input type="hidden" name="organization_id" value={targetId} />
                    <input type="hidden" name="module_code" value={module.code} />
                    <input type="hidden" name="is_enabled" value={String(!module.enabled)} />
                    <span className="stg-row-main">
                      <span className="stg-row-icon plt-module-icon" data-tone={module.enabled ? "success" : "neutral"}>{module.icon}</span>
                      <span><b>{module.name}</b><small>{module.description}</small></span>
                    </span>
                    <button type="submit" className={module.enabled ? "plt-switch is-on" : "plt-switch"} role="switch" aria-checked={module.enabled} aria-label={`${module.name}: ${module.enabled ? "kapat" : "aç"}`}><i /></button>
                  </form>
                ))}
              </div>
            ) : <div className="stg-empty"><StgIcon name="grid" size={22} /><p>Bu kurum için modül kaydı yok.</p></div>}
          </StgSection>
        </div>

        <StgSection id="gecmis" wide icon="chart" tone="neutral" kicker="KURULUM GEÇMİŞİ" title="Son işlemler" aside={<span className="status-pill">{auditRows.length} kayıt</span>}>
          {auditRows.length ? (
            <ol className="plt-audit">
              {auditRows.map((entry) => (
                <li key={entry.id} data-tone={entry.result === "failed" || entry.state === "failed" ? "danger" : "neutral"}>
                  <span className="plt-audit-dot" aria-hidden="true" />
                  <span>
                    <b>{actionLabels[entry.action] ?? entry.action} · {stateLabels[entry.state] ?? entry.state}</b>
                    <small>{dateTime(entry.created_at)}{entry.duration_ms != null ? ` · ${entry.duration_ms} ms` : ""}{entry.result ? ` · ${entry.result}` : ""}</small>
                  </span>
                </li>
              ))}
            </ol>
          ) : <div className="stg-empty"><StgIcon name="chart" size={22} /><p>Bu kurum için henüz kurulum kaydı yok.</p></div>}
        </StgSection>
      </div>
    </div>
  </div>;
}
