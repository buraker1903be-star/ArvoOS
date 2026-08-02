import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { resetOrganizationAiCredits, updateOrganizationLicense } from "./actions";

type OrganizationRow = { id: string; name: string; slug: string; plan_code: string; status: string };
type LicenseRow = {
  organization_id: string;
  plan_code: string;
  license_status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  user_limit: number;
  storage_limit_mb: number;
  ai_credit_limit: number;
  ai_credits_used: number;
  suspended_at: string | null;
  suspension_reason: string | null;
};

const dateValue = (value: string | null) => value ? value.slice(0, 10) : "";
const numberFormat = new Intl.NumberFormat("tr-TR");

export default async function LicenseManagementPage({ searchParams }: { searchParams: Promise<{ organization?: string; saved?: string }> }) {
  const { supabase, organization: founderOrganization, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const params = await searchParams;
  const { data: organizationData, error: organizationError } = await supabase
    .from("organizations")
    .select("id,name,slug,plan_code,status")
    .order("name");
  if (organizationError) throw new Error("Kurum listesi okunamadı.");

  const organizations = (organizationData ?? []) as OrganizationRow[];
  const selected = organizations.find((item) => item.id === params.organization)
    ?? organizations.find((item) => item.id === founderOrganization.id)
    ?? organizations[0];
  if (!selected) throw new Error("Yönetilecek kurum bulunamadı.");

  const [{ data: licenseData, error: licenseError }, { count: activeUsers }] = await Promise.all([
    supabase.from("organization_licenses").select("*").eq("organization_id", selected.id).maybeSingle(),
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", selected.id).eq("is_active", true),
  ]);
  if (licenseError) throw new Error(`Lisans okunamadı: ${licenseError.message}`);
  const license = licenseData as LicenseRow | null;
  if (!license) throw new Error("Kurum lisansı bulunamadı. Migration ve lisans backfill işlemini kontrol edin.");

  const aiUsagePercent = license.ai_credit_limit > 0
    ? Math.min(100, Math.round((license.ai_credits_used / license.ai_credit_limit) * 100))
    : 0;
  const userUsagePercent = Math.min(100, Math.round(((activeUsers ?? 0) / license.user_limit) * 100));

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">ARVOOS TİCARİ ÇEKİRDEK</small><h1>Lisans ve Kota Yönetimi</h1><p>Kurumların paketini, kullanım limitlerini, trial süresini ve erişim durumunu yönetin.</p></div>
      <span className="owner-badge">◇ KURUCU YETKİSİ</span>
    </div>

    {params.saved === "1" ? <div className="team-notice">Lisans ve kota ayarları kaydedildi.</div> : null}

    <section className="management-grid">
      <article className="panel-card management-card">
        <div className="management-heading"><div><small>HEDEF KURUM</small><h2>Kurum seçimi</h2></div><span className="status-pill">{organizations.length} kurum</span></div>
        <form className="panel-form" method="get">
          <label className="wide">Yönetilecek kurum<select name="organization" defaultValue={selected.id}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.plan_code}</option>)}</select></label>
          <div className="wide management-submit"><small>Lisans değişiklikleri seçilen kuruma uygulanır.</small><button className="panel-primary" type="submit">Kurumu aç</button></div>
        </form>
      </article>

      <article className="panel-card management-card">
        <div className="management-heading"><div><small>CANLI KULLANIM</small><h2>{selected.name}</h2></div><span className="status-pill">{license.license_status}</span></div>
        <div className="module-control-list">
          <div className="module-control"><div><b>Kullanıcı kotası</b><small>{activeUsers ?? 0} / {license.user_limit} aktif kullanıcı</small></div><span>{userUsagePercent}%</span></div>
          <div className="module-control"><div><b>AI kredisi</b><small>{numberFormat.format(license.ai_credits_used)} / {numberFormat.format(license.ai_credit_limit)}</small></div><span>{aiUsagePercent}%</span></div>
          <div className="module-control"><div><b>Depolama limiti</b><small>{numberFormat.format(license.storage_limit_mb)} MB</small></div><span>Limit</span></div>
        </div>
      </article>
    </section>

    <section className="panel-card management-card">
      <div className="management-heading"><div><small>LİSANS POLİTİKASI</small><h2>Paket ve erişim ayarları</h2></div><span className="status-pill">{selected.status}</span></div>
      <form className="panel-form" action={updateOrganizationLicense}>
        <input type="hidden" name="organization_id" value={selected.id} />
        <label>Paket<select name="plan_code" defaultValue={license.plan_code}><option value="starter">Başlangıç</option><option value="professional">Profesyonel</option><option value="enterprise">Kurumsal</option></select></label>
        <label>Lisans durumu<select name="license_status" defaultValue={license.license_status}><option value="trialing">Deneme</option><option value="active">Aktif</option><option value="past_due">Ödeme gecikmiş</option><option value="suspended">Askıda</option><option value="canceled">İptal</option></select></label>
        <label>Trial bitiş<input name="trial_ends_at" type="date" defaultValue={dateValue(license.trial_ends_at)} /></label>
        <label>Dönem bitiş<input name="current_period_end" type="date" defaultValue={dateValue(license.current_period_end)} /></label>
        <label>Kullanıcı limiti<input name="user_limit" type="number" min={1} defaultValue={license.user_limit} required /></label>
        <label>Depolama limiti (MB)<input name="storage_limit_mb" type="number" min={1} defaultValue={license.storage_limit_mb} required /></label>
        <label>AI kredi limiti<input name="ai_credit_limit" type="number" min={0} defaultValue={license.ai_credit_limit} required /></label>
        <label>Askıya alma nedeni<input name="suspension_reason" defaultValue={license.suspension_reason ?? ""} placeholder="Yalnızca askıya alındığında kullanılır" /></label>
        <div className="wide management-submit"><small>Askıya alınan veya iptal edilen kurumun panel erişimi kurum durumuyla birlikte kapatılır.</small><button className="panel-primary" type="submit">Lisansı kaydet</button></div>
      </form>
    </section>

    <section className="management-grid">
      <article className="panel-card management-card">
        <div className="management-heading"><div><small>AI KULLANIMI</small><h2>Kredi dönemi</h2></div><span className="status-pill">{aiUsagePercent}%</span></div>
        <p>Yeni fatura veya kullanım dönemi başlarken tüketilen AI kredilerini sıfırlayın.</p>
        <form action={resetOrganizationAiCredits}><input type="hidden" name="organization_id" value={selected.id} /><button className="panel-primary" type="submit">AI kullanımını sıfırla</button></form>
      </article>
      <article className="panel-card management-card">
        <div className="management-heading"><div><small>YAŞAM DÖNGÜSÜ</small><h2>Erişim durumu</h2></div><span className="status-pill">{license.license_status}</span></div>
        <p>Trial, aktif, ödeme gecikmiş, askıda ve iptal durumları paket seçiminden bağımsız izlenir.</p>
        <Link href={`/panel/platform?organization=${selected.id}`}>Platform yönetimine dön →</Link>
      </article>
    </section>
  </>;
}
