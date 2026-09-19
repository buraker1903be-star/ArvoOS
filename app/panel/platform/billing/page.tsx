import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { StgIcon, StgSection, StgWidget, type StgTone } from "../../settings/settings-ui";
import "../../settings/settings.css";
import "../platform.css";
import { renewalReminders, REMINDER_WINDOW_DAYS, type RenewalLicense, type RenewalOrganization } from "@/lib/renewal-reminders";

type Subscription = { id: string; organization_id: string; provider: string; plan_code: string; status: string; currency: string; unit_amount: number; interval: string; current_period_end: string | null; organizations: { name?: string; display_name?: string | null } | { name?: string; display_name?: string | null }[] | null };
type Invoice = { id: string; organization_id: string; status: string; currency: string; total: number; paid_at: string | null; created_at: string };

const money = (amount: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount / 100);
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";
const planLabels: Record<string, string> = { starter: "Başlangıç", professional: "Profesyonel", enterprise: "Kurumsal" };
const statusLabels: Record<string, string> = { active: "Aktif", trialing: "Deneme", past_due: "Ödeme gecikmiş", canceled: "İptal", incomplete: "Tamamlanmadı", paid: "Ödendi", open: "Açık", draft: "Taslak", void: "Geçersiz" };
const statusTones: Record<string, StgTone> = { active: "success", trialing: "info", past_due: "warning", canceled: "danger", incomplete: "warning", paid: "success", open: "warning", draft: "neutral", void: "neutral" };

// Şimdiki zaman bileşen dışında okunur (react-hooks/purity).
const remindersNow = (licenses: RenewalLicense[], organizations: RenewalOrganization[]) => renewalReminders(licenses, organizations, Date.now());

export default async function BillingPage() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const [{ data: subscriptions }, { data: invoices }, { data: internalOrganizations }, { data: productLicenses }, { data: organizationRows }] = await Promise.all([
    supabase.from("billing_subscriptions").select("id,organization_id,provider,plan_code,status,currency,unit_amount,interval,current_period_end,organizations(name,display_name)").order("created_at", { ascending: false }),
    supabase.from("billing_invoices").select("id,organization_id,status,currency,total,paid_at,created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("organizations").select("id").eq("kind", "internal"),
    supabase.from("organization_product_licenses").select("organization_id,product,status,monthly_fee,current_period_end,trial_ends_at").in("status", ["active", "trialing", "past_due"]),
    supabase.from("organizations").select("id,name,display_name,contact_phone,kind"),
  ]);
  // Otomatik çekim yok: dönem sonu yaklaşanlar burada, kurucu WhatsApp'tan hatırlatır.
  const reminders = remindersNow((productLicenses ?? []) as RenewalLicense[], (organizationRows ?? []) as RenewalOrganization[]);

  /*
    Kendi markalarımız gelir toplamına girmez: aynı tüzel kişiliğin kendi
    kendine ödemesi gelir değil, yalnızca raporu şişirir. Kayıtlar listede
    görünmeye devam eder, yalnızca sayımdan düşer.
  */
  const internal = new Set((internalOrganizations ?? []).map((row) => row.id as string));
  const isCustomer = (row: { organization_id: string }) => !internal.has(row.organization_id);

  const subscriptionRows = (subscriptions ?? []) as Subscription[];
  const invoiceRows = (invoices ?? []) as Invoice[];
  const active = subscriptionRows.filter((item) => (item.status === "active" || item.status === "trialing") && isCustomer(item));
  const mrr = active.filter((item) => item.interval === "month").reduce((sum, item) => sum + Number(item.unit_amount), 0)
    + Math.round(active.filter((item) => item.interval === "year").reduce((sum, item) => sum + Number(item.unit_amount), 0) / 12);
  const pastDue = subscriptionRows.filter((item) => item.status === "past_due" && isCustomer(item)).length;
  const paidTotal = invoiceRows.filter((item) => item.status === "paid" && isCustomer(item)).reduce((sum, item) => sum + Number(item.total), 0);
  const currency = active[0]?.currency ?? invoiceRows[0]?.currency ?? "TRY";

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">PLATFORM · FİNANS</small><h1>Abonelikler</h1><p>Kurum aboneliklerini, ödeme durumlarını ve tahsilatları tek yerden izleyin.</p></div>
      <div className="panel-page-actions"><Link className="panel-secondary" href="/panel/platform">Platform yönetimi</Link></div>
    </div>

    <section className="stg-widgets" aria-label="Abonelik özeti">
      <StgWidget tone="success" icon="check" label="Aktif abonelik" value={active.length} note="Aktif ve denemedeki kurumlar" />
      <StgWidget tone="gold" icon="chart" label="Tahmini aylık gelir" value={money(mrr, currency)} note="Yıllıklar aya bölünür" />
      <StgWidget tone={pastDue ? "warning" : "neutral"} icon="wallet" label="Ödemesi gecikmiş" value={pastDue} note={pastDue ? "Takip edilmesi gereken kurum" : "Gecikme yok"} />
      <StgWidget tone="info" icon="doc" label="Tahsil edilen" value={money(paidTotal, currency)} note="Son 50 fatura içinde" />
    </section>

    <div className="stg-grid">
      <StgSection
        id="hatirlatmalar" wide icon="wallet" tone={reminders.some((r) => r.daysLeft < 0) ? "danger" : reminders.length ? "warning" : "neutral"}
        kicker="ÖDEME HATIRLATMALARI" title="Dönem sonu yaklaşanlar"
        description={`Arc, ArvoLab ve Randevu aboneliklerinden ${REMINDER_WINDOW_DAYS} gün içinde bitenler ve süresi geçenler. WhatsApp düğmesi kurumun iletişim numarasına ödeme bağlantılı hazır mesajı açar.`}
        aside={<span className="status-pill" data-tone={reminders.length ? "warning" : "neutral"}>{reminders.length} kurum</span>}
      >
        {reminders.length ? (
          <div className="stg-list">
            {reminders.map((r) => (
              <div key={`${r.organizationId}-${r.product}`} className="plt-row">
                <span className="stg-row-main">
                  <span className="stg-row-icon" data-tone={r.daysLeft < 0 ? "danger" : r.daysLeft <= 1 ? "warning" : "gold"}><StgIcon name="wallet" size={16} /></span>
                  <span>
                    <b>{r.organizationName} · {r.productName}</b>
                    <small>{r.daysLeft < 0 ? `${-r.daysLeft} gün önce bitti` : r.daysLeft === 0 ? "Bugün bitiyor" : `${r.daysLeft} gün kaldı`} · {date(r.endsAt)}{r.fee ? ` · ${money(r.fee, "TRY")} / ay` : " · aylık ücret girilmedi"}</small>
                  </span>
                </span>
                {r.whatsappUrl
                  ? <a className="panel-secondary" href={r.whatsappUrl} target="_blank" rel="noreferrer" title={r.message}>WhatsApp ile hatırlat</a>
                  : <Link className="panel-secondary" href={`/panel/platform?organization=${r.organizationId}#ayarlar`} title="Kurum ayarlarında iletişim telefonu yok ya da cep numarası değil">Telefon ekle</Link>}
              </div>
            ))}
          </div>
        ) : <div className="stg-empty"><StgIcon name="check" size={22} /><p>Önümüzdeki {REMINDER_WINDOW_DAYS} gün içinde biten ya da süresi geçmiş ek ürün aboneliği yok.</p></div>}
      </StgSection>

      <StgSection id="abonelikler" wide icon="box" tone="gold" kicker="ABONELİKLER" title="Kurum abonelikleri" aside={<span className="status-pill">{subscriptionRows.length} kayıt</span>}>
        {subscriptionRows.length ? (
          <div className="stg-list">
            {subscriptionRows.map((row) => {
              const relation = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
              return (
                <div key={row.id} className="plt-row">
                  <span className="stg-row-main">
                    <span className="stg-row-icon" data-tone={statusTones[row.status] ?? "neutral"}><StgIcon name="building" size={16} /></span>
                    <span><b>{relation?.display_name || relation?.name || row.organization_id}</b><small>{planLabels[row.plan_code] ?? row.plan_code} · {money(Number(row.unit_amount), row.currency)} / {row.interval === "year" ? "yıl" : "ay"} · {row.provider}{row.current_period_end ? ` · dönem sonu ${date(row.current_period_end)}` : ""}</small></span>
                  </span>
                  <span className="status-pill" data-tone={statusTones[row.status] ?? "neutral"}>{statusLabels[row.status] ?? row.status}</span>
                </div>
              );
            })}
          </div>
        ) : <div className="stg-empty"><StgIcon name="box" size={22} /><p>Henüz abonelik kaydı yok. Ödeme sağlayıcısı bağlandığında abonelikler burada listelenir.</p></div>}
      </StgSection>

      <StgSection id="faturalar" wide icon="doc" tone="info" kicker="FATURALAR" title="Son faturalar" aside={<span className="status-pill">{invoiceRows.length} kayıt</span>}>
        {invoiceRows.length ? (
          <div className="stg-list">
            {invoiceRows.map((row) => (
              <div key={row.id} className="plt-row">
                <span className="stg-row-main">
                  <span className="stg-row-icon" data-tone={statusTones[row.status] ?? "neutral"}><StgIcon name="doc" size={16} /></span>
                  <span><b>{money(Number(row.total), row.currency)}</b><small>{date(row.created_at)}{row.paid_at ? ` · ödendi ${date(row.paid_at)}` : ""}</small></span>
                </span>
                <span className="status-pill" data-tone={statusTones[row.status] ?? "neutral"}>{statusLabels[row.status] ?? row.status}</span>
              </div>
            ))}
          </div>
        ) : <div className="stg-empty"><StgIcon name="doc" size={22} /><p>Henüz fatura kaydı yok.</p></div>}
      </StgSection>
    </div>
  </div>;
}
