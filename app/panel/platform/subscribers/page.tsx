import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { SUBSCRIBER_PRODUCTS, productLicenseLabels, productName } from "@/lib/products";
import { IstatistikKarti } from "../../crm/istatistik-karti";
import { KKart, KNot } from "../konsol-ui";
import { LISANS_TONU, para, tarih, tarihDegeri } from "../bicim";
import { updateProductPlan, updateSubscriber } from "./actions";
import { bireyselListeFiyatiKurus } from "@/lib/paket-ucreti";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { AboneListesi } from "./abone-listesi";
import "../platform.css";
// Ortak kayıt formu düzeni (alan görünümü, zorunlu alan işareti).
import "../../components/kayit-formu.css";

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

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { durum } = await searchParams;

  /*
    Sayım sorgudan geliyor (count: exact), listenin uzunluğundan değil.
    Eskiden "Toplam kayıt", "Erişimi kapalı" ve aylık gelir yalnızca
    yüklenen 200 kayıttan hesaplanıyordu: 201. aboneden sonra rakamlar
    sessizce eksik kalacaktı. Sınır duruyor ama artık tamamını kapsamadığı
    durumda bunu yazıyoruz.
  */
  const LISTE_SINIRI = 1000;
  const [{ data: planData }, { data: subscriberData, count, error }, fiyatlar] = await Promise.all([
    supabase.from("product_plans").select("product,individual_monthly_fee,trial_days"),
    supabase.from("product_subscribers")
      .select("id,product,email,full_name,status,trial_ends_at,current_period_end,suspension_reason,created_at", { count: "exact" })
      .order("created_at", { ascending: false }).limit(LISTE_SINIRI),
    yayimlananFiyatlar(),
  ]);
  if (error) throw new Error(`Bireysel aboneler okunamadı: ${error.message}`);

  /* Listede karşılığı olan ürünün (ArvoLab → Araştırmacı) ücreti
     yayımlanmış fiyat listesinden; köprü de oradan tahsil ediyor. */
  const plans = new Map(((planData ?? []) as PlanRow[]).map((row) => {
    const liste = bireyselListeFiyatiKurus(row.product, fiyatlar);
    return [row.product, liste === undefined ? row : { ...row, individual_monthly_fee: liste }];
  }));
  for (const product of SUBSCRIBER_PRODUCTS) {
    const liste = bireyselListeFiyatiKurus(product.code, fiyatlar);
    if (liste !== undefined && !plans.has(product.code)) plans.set(product.code, { product: product.code, individual_monthly_fee: liste, trial_days: 14 });
  }
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

  return <main className="plt talep cari ekip liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · TİCARİ ÇEKİRDEK</small>
        <h1>Bireysel Aboneler</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/members">Tüm üyeler</Link>
      </div>
    </header>

    {ucretsizUrunler.length ? (
      <KNot ton="uyari">
        <b>{ucretsizUrunler.map((product) => product.name).join(", ")} için bireysel ücret girilmemiş.</b>
        {" "}Ücret girilmeden kimse ödeme yapamaz: denemesi biten kullanıcının önüne çıkacak bir tutar yok, abonelik sessizce kapanır.
      </KNot>
    ) : null}

    {/*
      Dördü de her zaman çiziliyor. Sıfır da bir cevaptır: "erişimi kapalı
      abone yok" demek, satırın hiç olmamasından daha çok şey söyler.
    */}
    {/*
      13.10.2026: StgWidget kutuları yerine panelin özet şeridi. Konsol
      kendi tasarım dilini kullanıyordu; aynı kurucunun gün içinde gidip
      geldiği panel ekranları şerit kullanıyor ve iki dil arasında geçiş
      sayıları her seferinde yeniden aramak demekti.

      Hepsi her zaman çiziliyor: sıfır da bir cevaptır ve satırın hiç
      olmamasından daha çok şey söyler.
    */}
    <nav className="kayit-serit talep-serit" aria-label="Abone özeti">
      <dl>
        <div><dt>Ödeyen abone</dt><dd className="cari-arti">{paying.length}</dd><small>{monthlyRevenue ? `${para(monthlyRevenue)} / ay` : "Aylık gelir yok"}</small></div>
        <div><dt>Denemede</dt><dd>{trialing.length}</dd><small>{trialing.length ? "Henüz ödeme yok" : "Denemede kimse yok"}</small></div>
        <div><dt>Erişimi kapalı</dt><dd className={kapali ? "talep-uyari" : undefined}>{kapali}</dd><small>{kapali ? "Süresi geçmiş ya da askıda" : "Kapalı abone yok"}</small></div>
        <div><dt>Toplam kayıt</dt><dd>{toplamKayit}</dd><small>{eksikKapsam ? `En yeni ${subscribers.length} kayıt işleniyor` : "Tamamı listeleniyor"}</small></div>
      </dl>
    </nav>

    {/*
      14.10.2026: panelin liste düzeni. Aboneler solda liste kartında,
      sağda istatistik ve bireysel plan formları (.liste-sag). Eskiden
      planlar sayfanın üstünde StgSection kartlarından bir ızgaraydı ve
      abone listesi onun altında ikinci bir StgSection'dı.

      Aboneler satır listesi. Eskiden her abone, içinde açık bir
      düzenleme formu olan tam boy bir karttı ve iki yüz taneye kadar
      çiziliyordu: tek bir aboneyi bulmanın yolu tarayıcının sayfa içi
      aramasıydı, ekranda hiçbir süzgeç yoktu.
    */}
    <div className="talep-izgara personel-iki ekip-izgara">
      <section id="aboneler" className="panel-card talep-bilgi" aria-label="Bireysel aboneler">
        {eksikKapsam ? (
          <KNot ton="uyari">Toplam {toplamKayit} abone var; bu listede en yeni {subscribers.length} tanesi işleniyor. Üstteki sayılar da bu kesiti kapsıyor.</KNot>
        ) : null}
        <AboneListesi
          kaydet={updateSubscriber}
          durum={durum}
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
      </section>

      <div className="liste-sag">
        {/* Şeritteki sayıların aynısı; kapsam yazısı listenin kesitini söylüyor. */}
        <IstatistikKarti
          kapsam={eksikKapsam ? `en yeni ${subscribers.length} kayıttan (toplam ${toplamKayit})` : "bütün kayıtlardan"}
          kutular={[
            { ad: "Ödeyen", deger: String(paying.length), alt: monthlyRevenue ? `${para(monthlyRevenue)} / ay` : "aylık gelir yok", ton: "arti" },
            { ad: "Denemede", deger: String(trialing.length), alt: "henüz ödeme yok" },
            { ad: "Erişimi kapalı", deger: String(kapali), alt: "süresi geçmiş ya da askıda", ton: kapali ? "uyari" : undefined },
            { ad: "Toplam kayıt", deger: String(toplamKayit) },
          ]}
          gruplar={[
            /* Ürün başına dağılım bilerek yok: liste sınırlı (LISTE_SINIRI)
               ve listeden sayılan ürün adedi sınıra varınca sessizce eksilir. */
            {
              baslik: "Erişim",
              satirlar: [
                { ad: "Ödeyen", adet: paying.length },
                { ad: "Denemede", adet: trialing.length },
                { ad: "Erişimi kapalı", adet: kapali },
              ],
            },
          ]}
        />

        {/*
          Plan formları yan sütunda alt alta (14.10.2026). Önce tek sütunda
          tam genişlikteydiler: iki kısa formu alt alta okumak için ekran
          boyu kaydırmak gerekiyordu; sonra yan yana bir ızgara oldular
          (StgSection kartları). Liste sayfasında asıl alanı abone listesi
          alıyor; iki kısa form dar yan sütuna sığıyor.
        */}
        <KKart
          id="planlar"
          baslik="Bireysel planlar"
          aciklama="Fiyat herkese aynı uygulanır. Ücret girilmezse kişi ödeme yapamaz; deneme süresi 0 girilirse kayıt olan kişi doğrudan kapalı başlar."
          sag={(
            <span className="status-pill" data-tone={ucretsizUrunler.length ? "warning" : "success"}>
              {SUBSCRIBER_PRODUCTS.length - ucretsizUrunler.length} / {SUBSCRIBER_PRODUCTS.length} fiyatlı
            </span>
          )}
        >
          {SUBSCRIBER_PRODUCTS.map((product) => {
            const plan = plans.get(product.code);
            const tone = plan?.individual_monthly_fee ? "success" : "warning";
            return (
              <section key={product.code} id={`plan-${product.code}`} className="talep-not" aria-label={`${product.name} bireysel planı`}>
                <header className="k-kart-bas">
                  <div>
                    <h3>{product.name} bireysel planı</h3>
                    <p>{product.description}</p>
                  </div>
                  <div className="k-kart-sag">
                    <span className="status-pill" data-tone={tone}>{plan?.individual_monthly_fee ? `${para(Number(plan.individual_monthly_fee))} / ay` : "Ücret yok"}</span>
                  </div>
                </header>
                <form className="panel-form kayit-formu" action={updateProductPlan}>
                  <input type="hidden" name="product" value={product.code} />
                  {bireyselListeFiyatiKurus(product.code, fiyatlar) !== undefined ? (
                    <p className="wide panel-muted">
                      Ücret fiyat listesinden: <b>{plan?.individual_monthly_fee ? `${para(Number(plan.individual_monthly_fee))} / ay` : "teklif usulü (kartla satılmaz)"}</b>.
                      {" "}Değiştirmek için <Link href="/panel/platform/fiyatlar">Ücret ve Paketler</Link>.
                    </p>
                  ) : (
                    <label>Bireysel aylık ücret (TL)<input name="individual_monthly_fee" type="number" min={1} step="0.01" defaultValue={plan?.individual_monthly_fee ? Number(plan.individual_monthly_fee) / 100 : ""} placeholder="Boşsa ödeme kapalı" /></label>
                  )}
                  <label><span>Deneme süresi (gün)<b className="req" aria-hidden="true">*</b></span><input name="trial_days" type="number" min={0} max={365} defaultValue={plan?.trial_days ?? 14} required /></label>
                  <div className="wide panel-form-actions kayit-formu-eylem"><p>{bireyselListeFiyatiKurus(product.code, fiyatlar) !== undefined ? "Burada yalnızca deneme süresi değişir." : "Ücret boşsa bu ürün kartla satılmaz."}</p><button className="panel-primary" type="submit">{product.name} planını kaydet</button></div>
                </form>
              </section>
            );
          })}
        </KKart>
      </div>
    </div>
  </main>;
}
