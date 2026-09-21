import Link from "next/link";
import { PlatformTabs } from "../platform-tabs";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ADDON_PRODUCTS, productLicenseLabels } from "@/lib/products";
import { StgSection, StgWidget, type StgTone } from "../../settings/settings-ui";
import { resetOrganizationAiCredits, updateOrganizationLicense, updateProductLicense } from "./actions";
import "../../settings/settings.css";
import "../platform.css";

type OrganizationRow = { id: string; name: string; display_name: string | null; slug: string; plan_code: string; status: string };
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

type ProductLicenseRow = {
  product: string;
  status: string;
  plan_code: string | null;
  monthly_fee: number | null;
  current_period_end: string | null;
  suspension_reason: string | null;
};

const planLabels: Record<string, string> = { starter: "Başlangıç", professional: "Profesyonel", enterprise: "Kurumsal" };
const licenseLabels: Record<string, string> = { trialing: "Deneme", active: "Aktif", past_due: "Ödeme gecikmiş", suspended: "Askıda", canceled: "İptal" };
const licenseTones: Record<string, StgTone> = { trialing: "info", active: "success", past_due: "warning", suspended: "danger", canceled: "danger", inactive: "neutral" };
const dateValue = (value: string | null) => value ? value.slice(0, 10) : "";
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";
const numberFormat = new Intl.NumberFormat("tr-TR");
const percent = (used: number, limit: number) => limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR")).join("") || "?";

export default async function LicenseManagementPage({ searchParams }: { searchParams: Promise<{ organization?: string }> }) {
  const { supabase, organization: founderOrganization, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const params = await searchParams;
  const [{ data: organizationData, error: organizationError }, { data: allLicenses }] = await Promise.all([
    supabase.from("organizations").select("id,name,display_name,slug,plan_code,status").order("name"),
    supabase.from("organization_licenses").select("organization_id,license_status"),
  ]);
  if (organizationError) throw new Error("Kurum listesi okunamadı.");

  const organizations = (organizationData ?? []) as OrganizationRow[];
  const statusByOrg = new Map(((allLicenses ?? []) as { organization_id: string; license_status: string }[]).map((row) => [row.organization_id, row.license_status]));
  const selected = organizations.find((item) => item.id === params.organization)
    ?? organizations.find((item) => item.id === founderOrganization.id)
    ?? organizations[0];
  if (!selected) throw new Error("Yönetilecek kurum bulunamadı.");

  const [{ data: licenseData, error: licenseError }, { count: activeUsers }, { data: productLicenseData }] = await Promise.all([
    supabase.from("organization_licenses").select("*").eq("organization_id", selected.id).maybeSingle(),
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", selected.id).eq("is_active", true),
    supabase.from("organization_product_licenses").select("product,status,plan_code,monthly_fee,current_period_end,suspension_reason").eq("organization_id", selected.id),
  ]);
  if (licenseError) throw new Error(`Lisans okunamadı: ${licenseError.message}`);
  const license = licenseData as LicenseRow | null;
  if (!license) throw new Error("Kurum lisansı bulunamadı. Migration ve lisans backfill işlemini kontrol edin.");

  const productLicenses = new Map(((productLicenseData ?? []) as ProductLicenseRow[]).map((row) => [row.product, row]));
  const users = activeUsers ?? 0;
  const userPercent = percent(users, license.user_limit);
  const aiPercent = percent(license.ai_credits_used, license.ai_credit_limit);
  const label = selected.display_name || selected.name;

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">PLATFORM · TİCARİ ÇEKİRDEK</small><h1>Lisans ve Kota</h1><p>Kurumların paketini, kullanım limitlerini, deneme süresini ve erişim durumunu yönetin.</p></div>
      
    </div>

    <PlatformTabs active="lisans" />

    <div className="plt-layout">
      <aside className="plt-orgs" aria-label="Kurumlar">
        <header><b>Kurumlar</b><small>{organizations.length} kurum</small></header>
        <ul>
          {organizations.map((item) => {
            const status = statusByOrg.get(item.id);
            const itemLabel = item.display_name || item.name;
            return (
              <li key={item.id}>
                <Link href={`/panel/platform/licenses?organization=${item.id}`} className={item.id === selected.id ? "plt-org is-active" : "plt-org"} aria-current={item.id === selected.id ? "page" : undefined}>
                  <span className="plt-org-avatar" data-tone={status ? licenseTones[status] ?? "neutral" : "neutral"}>{initials(itemLabel)}</span>
                  <span className="plt-org-text"><b>{itemLabel}</b><small>{item.slug} · {planLabels[item.plan_code] ?? item.plan_code}</small></span>
                  <span className="status-pill" data-tone={status ? licenseTones[status] ?? "neutral" : "neutral"}>{status ? licenseLabels[status] ?? status : "Lisans yok"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="plt-detail">
        <section className="stg-widgets" aria-label={`${label} kullanımı`}>
          <StgWidget tone={licenseTones[license.license_status] ?? "neutral"} icon="shield" label="Lisans" value={licenseLabels[license.license_status] ?? license.license_status} note={license.license_status === "trialing" ? `Deneme bitişi ${date(license.trial_ends_at)}` : license.current_period_end ? `Dönem sonu ${date(license.current_period_end)}` : "Dönem tarihi yok"} />
          <StgWidget tone={userPercent >= 100 ? "danger" : userPercent >= 80 ? "warning" : "success"} icon="users" label="Kullanıcı" value={`${users} / ${license.user_limit}`} note={<span className="plt-meter"><i style={{ width: `${userPercent}%` }} /></span>} />
          <StgWidget tone={aiPercent >= 100 ? "danger" : aiPercent >= 80 ? "warning" : "info"} icon="chart" label="AI kredisi" value={`%${aiPercent}`} note={`${numberFormat.format(license.ai_credits_used)} / ${numberFormat.format(license.ai_credit_limit)}`} />
          <StgWidget tone="gold" icon="folder" label="Depolama" value={`${numberFormat.format(license.storage_limit_mb)} MB`} note="Kurum limiti" />
        </section>

        <StgSection
          id="lisans" wide icon="box" tone={licenseTones[license.license_status] ?? "neutral"}
          kicker={selected.slug} title={`${label} · lisans politikası`}
          description="Askıya alınan ya da iptal edilen kurumun panel erişimi kurum durumuyla birlikte kapatılır."
          aside={<span className="status-pill" data-tone={licenseTones[license.license_status] ?? "neutral"}>{licenseLabels[license.license_status] ?? license.license_status}</span>}
        >
          <form className="panel-form" action={updateOrganizationLicense}>
            <input type="hidden" name="organization_id" value={selected.id} />
            <label>Paket<select name="plan_code" defaultValue={license.plan_code}><option value="starter">Başlangıç</option><option value="professional">Profesyonel</option><option value="enterprise">Kurumsal</option></select></label>
            <label>Lisans durumu<select name="license_status" defaultValue={license.license_status}><option value="trialing">Deneme</option><option value="active">Aktif</option><option value="past_due">Ödeme gecikmiş</option><option value="suspended">Askıda</option><option value="canceled">İptal</option></select></label>
            <label>Deneme bitişi<input name="trial_ends_at" type="date" defaultValue={dateValue(license.trial_ends_at)} /></label>
            <label>Dönem bitişi<input name="current_period_end" type="date" defaultValue={dateValue(license.current_period_end)} /></label>
            <label>Kullanıcı limiti<input name="user_limit" type="number" min={1} defaultValue={license.user_limit} required /></label>
            <label>Depolama limiti (MB)<input name="storage_limit_mb" type="number" min={1} defaultValue={license.storage_limit_mb} required /></label>
            <label>AI kredi limiti<input name="ai_credit_limit" type="number" min={0} defaultValue={license.ai_credit_limit} required /></label>
            <label>Aylık ücret (TL)<input name="monthly_fee" type="number" min={1} step="0.01" defaultValue={(license as LicenseRow & { monthly_fee?: number | null }).monthly_fee ? Number((license as LicenseRow & { monthly_fee?: number | null }).monthly_fee) / 100 : ""} placeholder="Kartla ödeme tutarı · boşsa kapalı" /></label>
            <label>Askıya alma nedeni<input name="suspension_reason" defaultValue={license.suspension_reason ?? ""} placeholder="Yalnızca askıya alındığında kullanılır" /></label>
            <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Lisansı kaydet</button></div>
          </form>
        </StgSection>

        {ADDON_PRODUCTS.map((product) => {
          const row = productLicenses.get(product.code);
          const status = row?.status ?? "inactive";
          return (
            <StgSection
              key={product.code} id={`urun-${product.code}`} wide icon="box" tone={licenseTones[status] ?? "neutral"}
              kicker={product.name.toLocaleUpperCase("tr-TR")} title={`${product.name} aboneliği`}
              description={`${product.description}. Aylık ücret girilmezse kurum bu ürünü kartla ödeyemez.`}
              aside={<span className="status-pill" data-tone={licenseTones[status] ?? "neutral"}>{productLicenseLabels[status] ?? status}</span>}
            >
              <form className="panel-form" action={updateProductLicense}>
                <input type="hidden" name="organization_id" value={selected.id} />
                <input type="hidden" name="product" value={product.code} />
                <label>Durum<select name="status" defaultValue={status}><option value="inactive">Kapalı</option><option value="trialing">Deneme</option><option value="active">Aktif</option><option value="past_due">Ödeme gecikmiş</option><option value="suspended">Askıda</option><option value="canceled">İptal</option></select></label>
                <label>Paket<select name="plan_code" defaultValue={row?.plan_code ?? ""}><option value="">Belirtilmedi</option><option value="starter">Başlangıç</option><option value="professional">Profesyonel</option><option value="enterprise">Kurumsal</option></select></label>
                <label>Aylık ücret (TL)<input name="monthly_fee" type="number" min={1} step="0.01" defaultValue={row?.monthly_fee ? Number(row.monthly_fee) / 100 : ""} placeholder="Kartla ödeme tutarı · boşsa kapalı" /></label>
                <label>Dönem bitişi<input name="current_period_end" type="date" defaultValue={dateValue(row?.current_period_end ?? null)} /></label>
                <label className="wide">Askıya alma nedeni<input name="suspension_reason" defaultValue={row?.suspension_reason ?? ""} placeholder="Yalnızca askıya alındığında kullanılır" /></label>
                <div className="wide panel-form-actions"><button className="panel-primary" type="submit">{product.name} lisansını kaydet</button></div>
              </form>
            </StgSection>
          );
        })}

        <StgSection id="ai" wide icon="chart" tone="info" kicker="AI KULLANIMI" title="Kredi dönemi" description="Yeni fatura ya da kullanım dönemi başlarken tüketilen AI kredilerini sıfırlayın." aside={<span className="status-pill" data-tone="info">%{aiPercent}</span>}>
          <div className="plt-usage">
            <span className="plt-meter is-wide"><i style={{ width: `${aiPercent}%` }} /></span>
            <small>{numberFormat.format(license.ai_credits_used)} / {numberFormat.format(license.ai_credit_limit)} kredi kullanıldı</small>
          </div>
          <form action={resetOrganizationAiCredits}>
            <input type="hidden" name="organization_id" value={selected.id} />
            <button className="panel-secondary" type="submit">AI kullanımını sıfırla</button>
          </form>
        </StgSection>
      </div>
    </div>
  </div>;
}
