import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { SUBSCRIBER_PRODUCTS, productLicenseLabels, productName } from "@/lib/products";
import { StgIcon, StgSection, StgWidget } from "../../settings/settings-ui";
import { LISANS_TONU, para, tarih, tarihDegeri } from "../bicim";
import { updateProductPlan, updateSubscriber } from "./actions";
import { AboneListesi } from "./abone-listesi";
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

  /*
    Sayım sorgudan geliyor (count: exact), listenin uzunluğundan değil.
    Eskiden "Toplam kayıt", "Erişimi kapalı" ve aylık gelir yalnızca
    yüklenen 200 kayıttan hesaplanıyordu: 201. aboneden sonra rakamlar
    sessizce eksik kalacaktı. Sınır duruyor ama artık tamamını kapsamadığı
    durumda bunu yazıyoruz.
  */
  const LISTE_SINIRI = 1000;
  const [{ data: planData }, { data: subscriberData, count, error }] = await Promise.all([
    supabase.from("product_plans").select("product,individual_monthly_fee,trial_days"),
    supabase.from("product_subscribers")
      .select("id,product,email,full_name,status,trial_ends_at,current_period_end,suspension_reason,created_at", { count: "exact" })
      .order("created_at", { ascending: false }).limit(LISTE_SINIRI),
  ]);
  if (error) throw new Error(`Bireysel aboneler okunamadı: ${error.message}`);

  const plans = new Map(((planData ?? []) as PlanRow[]).map((row) => [row.product, row]));
  const subscribers = (subscriberData ?? []) as SubscriberRow[];
  const toplamKayit = count ?? subscribers.length;
  const eksikKapsam = toplamKayit > subscribers.length;
  const active = subscribers.filter(hasAccess);
  const trialing = subscribers.filter((row) => row.status === "trialing" && hasAccess(row));
  const paying = active.filter((row) => row.status === "active");
  // tuzak-tamam: sınır 1000 ve tamamını kapsamadığında `eksikKapsam`
  // hem widget notunda hem listenin üstünde yazıyor; sessiz bir eksilme yok.
  const monthlyRevenue = paying.reduce((sum, row) => sum + Number(plans.get(row.product)?.individual_monthly_fee ?? 0), 0);
  const kapali = subscribers.length - active.length;
  // Ücreti girilmemiş ürün kimseden para tahsil edemez; kurucunun görmesi gereken ilk şey bu.
  const ucretsizUrunler = SUBSCRIBER_PRODUCTS.filter((product) => !plans.get(product.code)?.individual_monthly_fee);

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">PLATFORM · TİCARİ ÇEKİRDEK</small><h1>Bireysel Aboneler</h1><p>Kuruma bağlı olmayan kullanıcıların aboneliği, ürün fiyatı ve deneme süresi.</p></div>
    </div>

    {ucretsizUrunler.length ? (
      <div className="plt-banner" data-tone="warning" role="status">
        <span className="plt-banner-icon"><StgIcon name="wallet" size={18} /></span>
        <div>
          <b>{ucretsizUrunler.map((product) => product.name).join(", ")} için bireysel ücret girilmemiş</b>
          <p>Ücret girilmeden kimse ödeme yapamaz: denemesi biten kullanıcının önüne çıkacak bir tutar yok, abonelik sessizce kapanır.</p>
        </div>
      </div>
    ) : null}

    {/*
      Dördü de her zaman çiziliyor. Sıfır da bir cevaptır: "erişimi kapalı
      abone yok" demek, satırın hiç olmamasından daha çok şey söyler.
    */}
    <div className="stg-widgets" aria-label="Abone özeti">
      <StgWidget tone="success" icon="wallet" label="Ödeyen abone" value={paying.length} note={monthlyRevenue ? `${para(monthlyRevenue)} / ay` : "Aylık gelir yok"} />
      <StgWidget tone={trialing.length ? "info" : "neutral"} icon="box" label="Denemede" value={trialing.length} note={trialing.length ? "Henüz ödeme yok" : "Denemede kimse yok"} />
      <StgWidget tone={kapali ? "warning" : "neutral"} icon="lock" label="Erişimi kapalı" value={kapali} note={kapali ? "Süresi geçmiş ya da askıda" : "Kapalı abone yok"} />
      <StgWidget tone="neutral" icon="users" label="Toplam kayıt" value={toplamKayit} note={eksikKapsam ? `En yeni ${subscribers.length} kayıt işleniyor` : "Tamamı listeleniyor"} />
    </div>

    {/*
      Plan kartları yan yana. Tek sütunda tam genişlik kaplıyorlardı: iki
      kısa formu alt alta okumak için ekran boyu kaydırmak gerekiyordu ve
      ürün sayısı arttıkça sayfa uzayacaktı. Izgara, sığdığı kadar kartı
      yan yana diziyor.
    */}
    <section className="stg-card is-wide" aria-labelledby="planlar-title">
      <header className="stg-card-head">
        <span className="stg-card-icon" data-tone="gold"><StgIcon name="wallet" size={20} /></span>
        <div className="stg-card-title">
          <small>FİYATLANDIRMA</small>
          <h2 id="planlar-title">Bireysel planlar</h2>
          <p>Fiyat herkese aynı uygulanır. Ücret girilmezse kişi ödeme yapamaz; deneme süresi 0 girilirse kayıt olan kişi doğrudan kapalı başlar.</p>
        </div>
        <div className="stg-card-aside">
          <span className="status-pill" data-tone={ucretsizUrunler.length ? "warning" : "success"}>
            {SUBSCRIBER_PRODUCTS.length - ucretsizUrunler.length} / {SUBSCRIBER_PRODUCTS.length} fiyatlı
          </span>
        </div>
      </header>
      <div className="plan-izgara">
        {SUBSCRIBER_PRODUCTS.map((product) => {
          const plan = plans.get(product.code);
          const tone = plan?.individual_monthly_fee ? "success" : "warning";
          return (
            <StgSection
              key={product.code} id={`plan-${product.code}`} icon="box" tone={tone}
              kicker={product.name.toLocaleUpperCase("tr-TR")} title={`${product.name} bireysel planı`}
              description={product.description}
              aside={<span className="status-pill" data-tone={tone}>{plan?.individual_monthly_fee ? `${para(Number(plan.individual_monthly_fee))} / ay` : "Ücret yok"}</span>}
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
    </section>

    {/*
      Aboneler artık satır listesi. Eskiden her abone, içinde açık bir
      düzenleme formu olan tam boy bir karttı ve iki yüz taneye kadar
      çiziliyordu: tek bir aboneyi bulmanın yolu tarayıcının sayfa içi
      aramasıydı, ekranda hiçbir süzgeç yoktu.
    */}
    <StgSection
      id="aboneler" wide icon="users" tone="info" kicker="ABONELER" title="Bireysel aboneler"
      description="Satıra tıklayarak durumu, dönemi ve askıyı düzenleyin."
      aside={<span className="status-pill">{toplamKayit} kayıt</span>}
    >
      {eksikKapsam ? (
        <p className="stg-muted"><StgIcon name="shield" size={16} />Toplam {toplamKayit} abone var; bu listede en yeni {subscribers.length} tanesi işleniyor. Üstteki sayılar da bu kesiti kapsıyor.</p>
      ) : null}
      <AboneListesi
        kaydet={updateSubscriber}
        aboneler={subscribers.map((subscriber) => {
          const open = hasAccess(subscriber);
          return {
            id: subscriber.id,
            urun: subscriber.product,
            urunAdi: productName(subscriber.product),
            ad: subscriber.full_name,
            eposta: subscriber.email,
            durum: subscriber.status,
            durumAdi: productLicenseLabels[subscriber.status] ?? subscriber.status,
            tone: open ? LISANS_TONU[subscriber.status] ?? "neutral" : "danger",
            erisimAcik: open,
            denemeSonu: tarihDegeri(subscriber.trial_ends_at),
            donemSonu: tarihDegeri(subscriber.current_period_end),
            denemeSonuAdi: tarih(subscriber.trial_ends_at),
            donemSonuAdi: tarih(subscriber.current_period_end),
            askiNedeni: subscriber.suspension_reason ?? "",
            kayit: tarih(subscriber.created_at),
          };
        })}
      />
    </StgSection>
  </div>;
}
