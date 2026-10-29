import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBSCRIBER_PRODUCTS, productLicenseLabels, productName } from "@/lib/products";
import { KNot } from "../konsol-ui";
import { TalepAkis } from "../../crm/kayit-detay/kayit-akis";
import { LISANS_TONU, para, tarih, tarihDegeri } from "../bicim";
import { setSubscriberOrganization, updateProductPlan, updateSubscriber } from "./actions";
import { bireyselListeFiyatiKurus } from "@/lib/paket-ucreti";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { AboneListesi } from "./abone-listesi";
import "../platform.css";
// Ortak kayıt formu düzeni (alan görünümü, zorunlu alan işareti).
import "../../components/kayit-formu.css";
import "../../hr/hr.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../finans.css";
import { liraYazisi } from "@/lib/turkish-amount";

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
  const [{ data: planData, error: planHatasi }, { data: subscriberData, count, error }, fiyatlar, { data: kurumdakiSatirlar, error: kurumdakiHatasi }, { data: kurumSatirlari, error: kurumHatasi }, { data: urunLisansSatirlari, error: urunLisansHatasi }] = await Promise.all([
    supabase.from("product_plans").select("product,individual_monthly_fee,trial_days"),
    supabase.from("product_subscribers")
      .select("id,product,email,full_name,status,trial_ends_at,current_period_end,suspension_reason,created_at", { count: "exact" })
      // Kuruma geçmiş abone bireysel sayılmaz (sağdaki "Kurum lisansında" kartı).
      .is("kurum_id", null)
      .order("created_at", { ascending: false }).limit(LISTE_SINIRI),
    yayimlananFiyatlar(),
    /* Kurum lisansına geçenler: kurum anlaşmasıyla gelen kişi sayısı kadar,
       bilerek sınırsız (toplam ya da gelir hesaplanmıyor, yalnızca liste). */
    supabase.from("product_subscribers").select("id,product,email,full_name,kurum_id,kuruma_gecti_at")
      .not("kurum_id", "is", null).order("kuruma_gecti_at", { ascending: false }),
    supabase.from("organizations").select("id,name,display_name").order("name"),
    // Taşıma seçeneği: yalnızca o ürünün lisansı olan kurumlar.
    supabase.from("organization_product_licenses").select("organization_id,product"),
  ]);
  if (error) throw new Error(`Bireysel aboneler okunamadı: ${error.message}`);
  if (kurumdakiHatasi) throw new Error(`Kuruma geçen aboneler okunamadı: ${kurumdakiHatasi.message}`);
  /* Planlar, kurumlar ve ürün lisansları abonenin hangi pakette olduğunu
     ve ücretini söylüyor: düşerlerse ekran aboneyi paketsiz/ücretsiz
     gösterir. */
  const yanHatasi = planHatasi ?? kurumHatasi ?? urunLisansHatasi;
  if (yanHatasi) throw new Error(`Abonelik bilgileri okunamadı: ${yanHatasi.message}`);
  const kurumAdi = new Map(((kurumSatirlari ?? []) as { id: string; name: string; display_name: string | null }[]).map((k) => [k.id, k.display_name || k.name]));
  const kurumdakiler = (kurumdakiSatirlar ?? []) as { id: string; product: string; email: string; full_name: string | null; kurum_id: string; kuruma_gecti_at: string | null }[];

  /*
    ADI OLMAYAN KAYDA KURUMUN PERSONEL ADI (14.10.2026).

    Buradaki ad product_subscribers.full_name'den geliyor ve kurum
    anlaşmasıyla gelen kişide çoğu zaman BOŞ: satır bir e-postadan
    açılmış, kişi adını hiç girmemiş. Sonuç, aynı kişinin Kullanıcılar
    ekranında "Berkcan Ağca", burada yalnızca e-posta olarak görünmesiydi
    — iki konsol ekranı aynı insana farklı davranıyordu.

    Yedek, kurumun kendi personel kaydı: hr_employees'te e-posta ve ad
    birlikte duruyor ve kiracının paneli de selamlamada onu kullanıyor.
    Eşleşme KURUMLA BİRLİKTE aranıyor; aynı e-posta başka bir kurumda
    varsa onun adı buraya yazılmamalı.

    SUNUCU ANAHTARIYLA okunuyor: personel kaydı RLS ile yalnızca kurum
    ÜYELERİNE açık ve kurucu her kiracının üyesi değil. Oturum
    istemcisiyle okusaydık ad bazı kiracılarda çıkar, bazılarında
    çıkmazdı — sessiz ve açıklanamaz bir fark (aynı gerekçe
    platform/kiraci-uyeleri-oku.ts'te yazılı). Anahtar yoksa ad yedeği
    hiç denenmiyor ve eskisi gibi e-posta yazılıyor.

    Ad bulunamazsa eskisi gibi e-posta yazılıyor: uydurma bir ad,
    adsızlıktan kötüdür.
  */
  const adsizlar = kurumdakiler.filter((k) => !k.full_name);
  const admin = createAdminClient();
  // hata-tamam: abonenin adı; düşerse ad yerine e-posta gösterilir, sayılar etkilenmez
  const { data: personelAdlari } = adsizlar.length && admin
    ? await admin.from("hr_employees").select("organization_id,email,full_name")
        .in("organization_id", [...new Set(adsizlar.map((k) => k.kurum_id))])
        .in("email", [...new Set(adsizlar.map((k) => k.email))])
    : { data: null };
  const personelAdi = new Map(
    ((personelAdlari ?? []) as { organization_id: string; email: string; full_name: string | null }[])
      .filter((p) => p.full_name)
      .map((p) => [`${p.organization_id}:${p.email.toLowerCase()}`, p.full_name as string]),
  );
  /** Kaydın adı; yoksa kurumun personel kaydındaki ad, o da yoksa e-posta. */
  const kisiAdi = (kisi: { full_name: string | null; email: string; kurum_id: string }) =>
    kisi.full_name || personelAdi.get(`${kisi.kurum_id}:${kisi.email.toLowerCase()}`) || kisi.email;
  const lisansliKurumlar = new Map<string, { id: string; ad: string }[]>();
  for (const satir of (urunLisansSatirlari ?? []) as { organization_id: string; product: string }[]) {
    const ad = kurumAdi.get(satir.organization_id);
    if (!ad) continue;
    lisansliKurumlar.set(satir.product, [...(lisansliKurumlar.get(satir.product) ?? []), { id: satir.organization_id, ad }]);
  }
  for (const liste of lisansliKurumlar.values()) liste.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));

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

  /*
    PANELİN DİLİ (29.10.2026, konsol yeniden kurulurken): Müşteriler ve
    Kullanıcılar listesiyle aynı tablo; sağdaki iki kart (kurum
    lisansındakiler, bireysel planlar) tek sekmeli kart oldu.
  */
  return <main className="plt talep cari ekip talepler teklifler liste-sayfa kisi-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/musteriler">MÜŞTERİLER</Link></small>
        <h1>Bireysel aboneler</h1>
        <p className="ek-alt">Kendi adına abone olan kişiler · {paying.length} ödeyen · {trialing.length} denemede{monthlyRevenue ? ` · ${para(monthlyRevenue)} / ay` : ""}</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/kullanicilar">Kullanıcılar</Link>
      </div>
    </header>

    {ucretsizUrunler.length ? (
      <KNot ton="uyari">
        <b>{ucretsizUrunler.map((product) => product.name).join(", ")} için bireysel ücret girilmemiş.</b>
        {" "}Ücret girilmeden kimse ödeme yapamaz: denemesi biten kullanıcının önüne çıkacak bir tutar yok, abonelik sessizce kapanır.
      </KNot>
    ) : null}

    {/* Dördü de her zaman çiziliyor: sıfır da bir cevaptır. */}
    <nav className="kayit-serit talep-serit" aria-label="Abone özeti">
      <dl>
        <div><dt>Ödeyen abone</dt><dd className="cari-arti">{paying.length}</dd><small>{monthlyRevenue ? `${para(monthlyRevenue)} / ay` : "Aylık gelir yok"}</small></div>
        <div><dt>Denemede</dt><dd>{trialing.length}</dd><small>{trialing.length ? "Henüz ödeme yok" : "Denemede kimse yok"}</small></div>
        <div><dt>Erişimi kapalı</dt><dd className={kapali ? "talep-uyari" : undefined}>{kapali}</dd><small>{kapali ? "Süresi geçmiş ya da askıda" : "Kapalı abone yok"}</small></div>
        <div><dt>Toplam kayıt</dt><dd>{toplamKayit}</dd><small>{eksikKapsam ? `En yeni ${subscribers.length} kayıt işleniyor` : "Tamamı listeleniyor"}</small></div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section id="aboneler" className="panel-card talep-bilgi" aria-label="Bireysel aboneler">
        {eksikKapsam ? (
          <KNot ton="uyari">Toplam {toplamKayit} abone var; bu listede en yeni {subscribers.length} tanesi işleniyor. Üstteki sayılar da bu kesiti kapsıyor.</KNot>
        ) : null}
        <AboneListesi
          kaydet={updateSubscriber}
          tasi={setSubscriberOrganization}
          kurumlar={Object.fromEntries(lisansliKurumlar)}
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

      {/*
        Sağ sütun: bireysel planlar ve kurum lisansına geçmiş kişiler tek
        sekmeli kartta. Ürün başına abone dağılımı bilerek yok: liste
        sınırlı (LISTE_SINIRI) ve listeden sayılan adet sınıra varınca
        sessizce eksilir.
      */}
      <div className="liste-sag">
        <TalepAkis kimlik="abone-sag" sinif="ek-sag" etiket="Bireysel planlar ve kurum lisansı"
          sekmeler={[ucretsizUrunler.length ? `Planlar · ${ucretsizUrunler.length} eksik` : "Planlar", ...(kurumdakiler.length ? [`Kurum lisansında · ${kurumdakiler.length}`] : [])]}>
          <section className="ek-panel" id="planlar" aria-label="Bireysel planlar">
            <p className="ek-not">Fiyat herkese aynı uygulanır. Ücret girilmezse kişi ödeme yapamaz; deneme süresi 0 girilirse kayıt olan kişi doğrudan kapalı başlar.</p>
            {SUBSCRIBER_PRODUCTS.map((product) => {
              const plan = plans.get(product.code);
              const tone = plan?.individual_monthly_fee ? "success" : "warning";
              const listeden = bireyselListeFiyatiKurus(product.code, fiyatlar) !== undefined;
              return (
                <section key={product.code} id={`plan-${product.code}`} className="ab-plan" aria-label={`${product.name} bireysel planı`}>
                  <header className="phr-bas">
                    <h2>{product.name}</h2>
                    <span className="status-pill" data-tone={tone}>{plan?.individual_monthly_fee ? `${para(Number(plan.individual_monthly_fee))} / ay` : "Ücret yok"}</span>
                  </header>
                  <form className="panel-form kayit-formu" action={updateProductPlan}>
                    <input type="hidden" name="product" value={product.code} />
                    {listeden ? (
                      <p className="wide panel-muted">
                        Ücret fiyat listesinden{plan?.individual_monthly_fee ? "" : ": teklif usulü (kartla satılmaz)"}. Değiştirmek için <Link href="/panel/platform/fiyatlar">Fiyat listesi</Link>.
                      </p>
                    ) : (
                      <label className="wide">Bireysel aylık ücret (TL)<input name="individual_monthly_fee" inputMode="decimal" autoComplete="off" defaultValue={plan?.individual_monthly_fee ? liraYazisi(Number(plan.individual_monthly_fee)) : ""} placeholder="Boşsa ödeme kapalı" /></label>
                    )}
                    <label className="wide"><span>Deneme süresi (gün)<b className="req" aria-hidden="true">*</b></span><input name="trial_days" type="number" min={0} max={365} defaultValue={plan?.trial_days ?? 14} required /></label>
                    <div className="wide panel-form-actions kayit-formu-eylem"><p>{listeden ? "Burada yalnızca deneme süresi değişir." : "Ücret boşsa bu ürün kartla satılmaz."}</p><button className="panel-primary" type="submit">Kaydet</button></div>
                  </form>
                </section>
              );
            })}
          </section>

          {/* Kurum anlaşmasıyla gelen kişiler (14.10.2026): bireysel listede
              ve sayılarda yoklar; erişimleri kurumun lisansıyla açılıp kapanıyor. */}
          {kurumdakiler.length ? (
            <section className="ek-panel" aria-label="Kurum lisansında">
              <p className="ek-not">Bireysel değil; erişim kurumun lisansından. &quot;Bireysele al&quot; kişiyi kendi aboneliğine geri taşır.</p>
              <ul className="pu-liste">
                {kurumdakiler.map((kisi) => (
                  <li key={kisi.id}>
                    <span className="sy-ozet">
                      <span className="pu-govde"><b>{kisiAdi(kisi)}</b><small>{[kurumAdi.get(kisi.kurum_id) ?? "Kurum", productName(kisi.product), kisiAdi(kisi) === kisi.email ? null : kisi.email].filter(Boolean).join(" · ")}</small></span>
                      <form action={setSubscriberOrganization}>
                        <input type="hidden" name="subscriber_id" value={kisi.id} />
                        <input type="hidden" name="kurum_id" value="" />
                        <button type="submit" className="panel-secondary" aria-label={`${kisiAdi(kisi)} bireysel aboneliğe geri al`}>Bireysele al</button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </TalepAkis>
      </div>
    </div>
  </main>;
}
