import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { SUBSCRIBER_PRODUCTS, productLicenseLabels, productName } from "@/lib/products";
import { StgIcon, StgSection, StgValueRow, type StgTone } from "../../settings/settings-ui";
import { updateProductPlan, updateSubscriber } from "./actions";
import "../../settings/settings.css";
import "../platform.css";

type PlanRow = { product: string; individual_monthly_fee: number | null; trial_days: number };
type SubscriberRow = {
  id: string;
  product: string;
  email: string;
  full_name: string | null;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  suspension_reason: string | null;
  created_at: string;
};

const formatTry = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";
const dateValue = (value: string | null) => value ? value.slice(0, 10) : "";
const tones: Record<string, StgTone> = { trialing: "info", active: "success", past_due: "warning", suspended: "danger", canceled: "danger" };

// Deneme ya da aktif dönem sürüyorsa erişim açık (köprüdeki kuralın aynısı).
function hasAccess(subscriber: SubscriberRow) {
  const now = Date.now();
  if (subscriber.status === "trialing") return Boolean(subscriber.trial_ends_at && new Date(subscriber.trial_ends_at).getTime() > now);
  if (subscriber.status === "active") return !subscriber.current_period_end || new Date(subscriber.current_period_end).getTime() > now;
  return false;
}

export default async function SubscribersPage() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const [{ data: planData }, { data: subscriberData, error }] = await Promise.all([
    supabase.from("product_plans").select("product,individual_monthly_fee,trial_days"),
    supabase.from("product_subscribers").select("id,product,email,full_name,status,trial_ends_at,current_period_end,suspension_reason,created_at").order("created_at", { ascending: false }).limit(200),
  ]);
  if (error) throw new Error(`Bireysel aboneler okunamadı: ${error.message}`);

  const plans = new Map(((planData ?? []) as PlanRow[]).map((row) => [row.product, row]));
  const subscribers = (subscriberData ?? []) as SubscriberRow[];
  const active = subscribers.filter(hasAccess);
  const trialing = subscribers.filter((row) => row.status === "trialing" && hasAccess(row));
  const paying = active.filter((row) => row.status === "active");
  const monthlyRevenue = paying.reduce((sum, row) => sum + Number(plans.get(row.product)?.individual_monthly_fee ?? 0), 0);

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">PLATFORM · TİCARİ ÇEKİRDEK</small><h1>Bireysel Aboneler</h1><p>Kuruma bağlı olmayan kullanıcıların aboneliği, ürün fiyatı ve deneme süresi.</p></div>
      
    </div>


    <section className="platform-serit" aria-label="Abone özeti">
      <span><b>{paying.length}</b> ödeyen abone{monthlyRevenue ? ` · ${formatTry(monthlyRevenue)} / ay` : ""}</span>
      {trialing.length ? <span><b>{trialing.length}</b> denemede</span> : null}
      {subscribers.length - active.length ? <span data-tone="warning"><b>{subscribers.length - active.length}</b> erişimi kapalı</span> : null}
      <span><b>{subscribers.length}</b> toplam</span>
    </section>

    {/*
      Plan kartları yan yana. Tek sütunda tam genişlik kaplıyorlardı: iki
      kısa formu alt alta okumak için ekran boyu kaydırmak gerekiyordu ve
      ürün sayısı arttıkça sayfa uzayacaktı. Izgara, sığdığı kadar kartı
      yan yana diziyor.
    */}
    <div className="plan-izgara">
    {SUBSCRIBER_PRODUCTS.map((product) => {
      const plan = plans.get(product.code);
      return (
        <StgSection
          key={product.code} id={`plan-${product.code}`} icon="box" tone={plan?.individual_monthly_fee ? "success" : "warning"}
          kicker={product.name.toLocaleUpperCase("tr-TR")} title={`${product.name} bireysel planı`}
          description="Fiyat herkese aynı uygulanır. Ücret girilmezse kişi ödeme yapamaz; deneme süresi 0 girilirse kayıt olan kişi doğrudan kapalı başlar."
          aside={<span className="status-pill" data-tone={plan?.individual_monthly_fee ? "success" : "warning"}>{plan?.individual_monthly_fee ? `${formatTry(Number(plan.individual_monthly_fee))} / ay` : "Ücret yok"}</span>}
        >
          <form className="panel-form" action={updateProductPlan}>
            <input type="hidden" name="product" value={product.code} />
            <label>Bireysel aylık ücret (TL)<input name="individual_monthly_fee" type="number" min={1} step="0.01" defaultValue={plan?.individual_monthly_fee ? Number(plan.individual_monthly_fee) / 100 : ""} placeholder="Boşsa ödeme kapalı" /></label>
            <label>Deneme süresi (gün)<input name="trial_days" type="number" min={0} max={365} defaultValue={plan?.trial_days ?? 14} required /></label>
            <div className="wide panel-form-actions"><button className="panel-primary" type="submit">{product.name} planını kaydet</button></div>
          </form>
        </StgSection>
      );
    })}
    </div>

    {subscribers.length ? (
      <div className="stg-grid">
        {subscribers.map((subscriber) => {
          const open = hasAccess(subscriber);
          const tone = open ? tones[subscriber.status] ?? "neutral" : "danger";
          return (
            <StgSection
              key={subscriber.id} id={`abone-${subscriber.id}`} icon="users" tone={tone}
              kicker={productName(subscriber.product).toLocaleUpperCase("tr-TR")}
              title={subscriber.full_name || subscriber.email}
              aside={<span className="status-pill" data-tone={tone}>{open ? productLicenseLabels[subscriber.status] ?? subscriber.status : "Erişim kapalı"}</span>}
            >
              <dl className="stg-list">
                <StgValueRow label="E-posta" value={subscriber.email} />
                <StgValueRow label="Deneme bitişi" value={date(subscriber.trial_ends_at)} />
                <StgValueRow label="Dönem sonu" value={date(subscriber.current_period_end)} />
                <StgValueRow label="Kayıt" value={date(subscriber.created_at)} />
              </dl>
              {subscriber.suspension_reason ? <p className="stg-muted"><StgIcon name="lock" size={16} />{subscriber.suspension_reason}</p> : null}
              <form className="panel-form" action={updateSubscriber}>
                <input type="hidden" name="subscriber_id" value={subscriber.id} />
                <label>Durum<select name="status" defaultValue={subscriber.status}><option value="trialing">Deneme</option><option value="active">Aktif</option><option value="past_due">Ödeme gecikmiş</option><option value="suspended">Askıda</option><option value="canceled">İptal</option></select></label>
                <label>Deneme bitişi<input name="trial_ends_at" type="date" defaultValue={dateValue(subscriber.trial_ends_at)} /></label>
                <label>Dönem sonu<input name="current_period_end" type="date" defaultValue={dateValue(subscriber.current_period_end)} /></label>
                <label>Askıya alma nedeni<input name="suspension_reason" defaultValue={subscriber.suspension_reason ?? ""} placeholder="Yalnızca askıya alındığında" /></label>
                <div className="wide panel-form-actions"><button className="panel-secondary" type="submit">Kaydet</button></div>
              </form>
            </StgSection>
          );
        })}
      </div>
    ) : <div className="stg-empty"><StgIcon name="users" size={22} /><p>Henüz bireysel abone yok. Ürüne ilk giriş yapan kişi burada görünür.</p></div>}
  </div>;
}
