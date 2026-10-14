import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { StgIcon, StgSection, type StgTone } from "../../settings/settings-ui";
import { PAKET_ADI, para, tarih } from "../bicim";
import { productName } from "@/lib/products";
import { AbonelikListesi, type AbonelikGrubu } from "./abonelik-listesi";
/* Gösterilen liste: kanal başına bu kadar satır okunuyor, toplam
   veritabanından geliyor. */
const LISTE = 20;
import "../../settings/settings.css";
import "../platform.css";
// Panelin başlık ve özet şeridi kalıbı (talep-bas, kayit-serit).
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import { abonelikHatirlatmasiGonder } from "../actions";
import { getPaymentIncidents } from "@/lib/payment-incidents";
import { renewalReminders, REMINDER_WINDOW_DAYS, type RenewalLicense, type RenewalOrganization } from "@/lib/renewal-reminders";

/*
  Abonelikler LİSANSLARDAN okunuyor, billing_subscriptions'tan değil.

  O tablo bir abonelik kütüğü değil, ÖDEME GÜNLÜĞÜ: arvo_record_paytr_payment
  her başarılı kart ödemesinde oraya düz bir insert atıyor (on conflict yok)
  ve status'ü her zaman 'active' yazıyor. Sonuçları üç ayrı yanlış sayıydı:

    - "Aktif abonelik", abonelik sayısı değil ÖDEME sayısıydı; altı ay ödeyen
      bir kiracı altı kez sayılıyordu.
    - "Ödemesi gecikmiş" hep 0 çıkıyordu, çünkü o tabloya past_due hiç
      yazılmıyor.
    - "Kurum abonelikleri" listesi aynı kiracıyı her ödemesi için tekrar
      tekrar gösteriyordu.

  Aynı hata sınıfı daha önce billing_invoices'ta da yaşandı (kiracının kendi
  müşterilerine kestiği faturalar Arvo'nun geliri sanılıyordu). Gelir zaten
  lisanslardan hesaplanıyordu; artık abonelik listesi de aynı kaynaktan.
*/

type AbonelikSatiri = {
  organizationId: string;
  organizationName: string;
  urun: string;
  urunAdi: string;
  durum: string;
  planCode: string | null;
  monthlyFee: number | null;
  donemSonu: string | null;
  denemeSonu: string | null;
};

const statusLabels: Record<string, string> = { active: "Aktif", trialing: "Deneme", past_due: "Ödeme gecikmiş", suspended: "Askıda", canceled: "İptal", incomplete: "Tamamlanmadı", paid: "Ödendi", open: "Açık", draft: "Taslak", void: "Geçersiz" };
const statusTones: Record<string, StgTone> = { active: "success", trialing: "info", past_due: "warning", suspended: "danger", canceled: "danger", incomplete: "warning", paid: "success", open: "warning", draft: "neutral", void: "neutral" };

// Şimdiki zaman bileşen dışında okunur (react-hooks/purity).
const gunOnce = (gun: number) => new Date(Date.now() - gun * 86_400_000).toISOString();
const remindersNow = (licenses: RenewalLicense[], organizations: RenewalOrganization[]) => renewalReminders(licenses, organizations, Date.now());

export default async function BillingPage() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const [
    { data: internalOrganizations },
    { data: productLicenses },
    { data: organizationRows },
    { data: coreLicenses },
    { data: tahsilatOzeti, error: ozetHatasi },
    { data: sorunluBildirimler },
    odemeOlaylari,
  ] = await Promise.all([
    supabase.from("organizations").select("id").eq("kind", "internal"),
    supabase.from("organization_product_licenses").select("organization_id,product,status,plan_code,monthly_fee,current_period_end,trial_ends_at").in("status", ["active", "trialing", "past_due", "suspended", "canceled"]),
    supabase.from("organizations").select("id,name,display_name,contact_phone,kind"),
    // ArvoOS çekirdek lisansının aylık ücreti; ek ürünler ayrı tabloda.
    supabase.from("organization_licenses").select("organization_id,license_status,plan_code,monthly_fee,current_period_end,trial_ends_at"),
    /* Tahsilat listesi Faturalama ve Tahsilat'a taşındı (14.10.2026);
       burada yalnızca şeridin "bu ay tahsil edilen" sayısı için özet. */
    supabase.rpc("platform_tahsilat_ozeti"),
    /* Ödeme sorunları: bekleyen havale bildirimleri (hepsi) ve son 30
       günde reddedilenler. Sınırsız değil ama küçük: bekleyen iş kuyruğu. */
    supabase.from("organization_payment_requests").select("id,organization_id,product,amount,currency,status,created_at,reviewed_at,review_note")
      .or(`status.eq.pending,and(status.eq.rejected,reviewed_at.gte.${gunOnce(30)})`)
      .order("created_at", { ascending: false }).limit(100),
    // PayTR'nin bildirip kayıt oluşturamadığı ödemeler (Ödeme Onayları'ndaki liste).
    getPaymentIncidents(),
  ]);
  if (ozetHatasi) throw new Error("Tahsilat özeti okunamadı: " + ozetHatasi.message);
  const ozet = (tahsilatOzeti ?? {}) as { adet?: number; toplam?: number; bu_ay?: number; birimler?: string[] };
  // Otomatik çekim yok: dönem sonu yaklaşanlar burada, kurucu WhatsApp'tan hatırlatır.
  /* ArvoOS çekirdek lisansı da listede (14.10.2026): eskiden yalnızca ek
     ürünler okunuyordu, panelin asıl aboneliği hatırlatma listesine hiç
     düşmüyordu. Ücret burada paket ücreti; ek kullanıcı bedeli ödeme
     bağlantısı açılırken eklenir. */
  const cekirdekHatirlatmalari: RenewalLicense[] = ((coreLicenses ?? []) as { organization_id: string; license_status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }[])
    .filter((l) => ["active", "trialing", "past_due"].includes(l.license_status))
    .map((l) => ({ organization_id: l.organization_id, product: "arvoos", status: l.license_status, monthly_fee: l.monthly_fee, current_period_end: l.current_period_end, trial_ends_at: l.trial_ends_at }));
  const reminders = remindersNow([...((productLicenses ?? []) as RenewalLicense[]), ...cekirdekHatirlatmalari], (organizationRows ?? []) as RenewalOrganization[]);

  /*
    Kendi markalarımız gelir toplamına girmez: aynı tüzel kişiliğin kendi
    kendine ödemesi gelir değil, yalnızca raporu şişirir. Kayıtlar listede
    görünmeye devam eder, yalnızca sayımdan düşer.
  */
  const internal = new Set((internalOrganizations ?? []).map((row) => row.id as string));
  const isCustomer = (row: { organization_id: string }) => !internal.has(row.organization_id);

  const kurumlar = (organizationRows ?? []) as { id: string; name: string; display_name: string | null }[];
  const orgAdi = new Map(kurumlar.map((row) => [row.id, row.display_name || row.name]));

  const cekirdek = (coreLicenses ?? []) as { organization_id: string; license_status: string; plan_code: string | null; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }[];
  const ekUrunler = (productLicenses ?? []) as unknown as { organization_id: string; product: string; status: string; plan_code: string | null; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }[];

  /* Askıdaki ve iptal edilen abonelikler de listede (14.10.2026): eskiden
     yalnızca açık olanlar okunuyordu, "kim ayrıldı, kim askıda" sorusunun
     yanıtı hiçbir ekranda yoktu. Gelir toplamına girmezler. */
  const ABONE_DURUMLARI = new Set(["active", "trialing", "past_due", "suspended", "canceled"]);
  const abonelikler: AbonelikSatiri[] = [
    ...cekirdek
      .filter((satir) => isCustomer(satir) && ABONE_DURUMLARI.has(satir.license_status))
      .map((satir) => ({
        organizationId: satir.organization_id,
        organizationName: orgAdi.get(satir.organization_id) ?? "Kurum",
        urun: "arvoos",
        urunAdi: productName("arvoos"),
        durum: satir.license_status,
        planCode: satir.plan_code,
        monthlyFee: satir.monthly_fee,
        donemSonu: satir.current_period_end,
        denemeSonu: satir.trial_ends_at,
      })),
    ...ekUrunler
      .filter(isCustomer)
      .map((satir) => ({
        organizationId: satir.organization_id,
        organizationName: orgAdi.get(satir.organization_id) ?? "Kurum",
        urun: satir.product,
        urunAdi: productName(satir.product),
        durum: satir.status,
        planCode: satir.plan_code,
        monthlyFee: satir.monthly_fee,
        donemSonu: satir.current_period_end,
        denemeSonu: satir.trial_ends_at,
      })),
  ].sort((a, b) => a.organizationName.localeCompare(b.organizationName, "tr") || a.urunAdi.localeCompare(b.urunAdi, "tr"));

  /*
    Beklenen aylık gelir LİSANSLARDAN hesaplanıyor: billing_subscriptions'a
    satır ancak bir ödeme onaylandığında düşüyor, yani denemedeki ya da elle
    lisans verilmiş kurumlar hiç sayılmıyordu ve gerçek gelir varken ekranda
    ₺0 yazabiliyordu.

    Denemedekiler ayrı tutuluyor: henüz ödemiyorlar, beklenen gelire katmak
    raporu şişirir. Potansiyel olarak ayrıca gösteriliyor.
  */
  const topla = (satirlar: AbonelikSatiri[]) => satirlar.reduce((sum, satir) => sum + Number(satir.monthlyFee ?? 0), 0);
  const odeyenler = abonelikler.filter((satir) => satir.durum === "active" || satir.durum === "past_due");
  const denemedekiler = abonelikler.filter((satir) => satir.durum === "trialing");
  const mrr = topla(odeyenler);
  const denemeGeliri = topla(denemedekiler);
  const pastDue = abonelikler.filter((satir) => satir.durum === "past_due").length;
  const ucretsiz = abonelikler.filter((satir) => !satir.monthlyFee).length;


  /*
    Toplam artık BÜTÜN kayıtlardan. Eskiden her sorguda .limit(50) vardı ve
    "Tahsil edildi" son 50 kaydın toplamıydı; 51. ödemeden sonra rakam
    sessizce eksilmeye başlıyordu. Liste kısa kalıyor, toplam kısalmıyor.
  */
  const toplamTahsilat = Number(ozet.toplam ?? 0);
  const tahsilatAdedi = Number(ozet.adet ?? 0);
  /*
    Ay sınırı Türkiye saatiyle ve ZAMAN DAMGASI olarak karşılaştırılıyor.
    Metin karşılaştırması (`satir.tarih >= ayBasi`) burada çalışıyor gibi
    görünürdü ama PostgREST "…+00:00", toISOString() ise "…Z" yazıyor;
    aynı saniyeye denk gelen iki kayıtta sonuç sessizce sapardı.
  */
  const buAyTahsilat = Number(ozet.bu_ay ?? 0);

  /*
    Para birimi karışırsa toplam anlamsız olur: 100 ₺ ile 100 $ toplanıp tek
    simgeyle yazılırdı. Lisans ücretlerinin birim sütunu yok, onlar tanımı
    gereği TRY (AGENTS.md "Para kuruş cinsinden tamsayı"); karışma ancak
    tahsilat kayıtlarından gelebilir.
  */
  const birimler = new Set((ozet.birimler ?? []).map((birim) => birim || "TRY"));
  if (abonelikler.length) birimler.add("TRY");
  const currency = birimler.size === 1 ? [...birimler][0] : "TRY";
  const birimKarisik = birimler.size > 1;


  /*
    Abonelikler kiracı bazında gruplanıyor. Düz listede aynı kurumun üç
    aboneliği listenin üç ayrı yerine dağılıyordu ve "bu kurum bize ayda ne
    ödüyor" sorusunun yanıtı hiçbir satırda yazmıyordu.

    Sıralama GELİRE göre: bir finans ekranında ilk bakılan şey en çok kimin
    ödediği. Denemedekiler toplama girmiyor — henüz ödemiyorlar; grup
    başlığı kaç tanesinin denemede olduğunu ayrıca yazıyor.
  */
  const grupHarita = new Map<string, AbonelikGrubu>();
  for (const satir of abonelikler) {
    let grup = grupHarita.get(satir.organizationId);
    if (!grup) {
      grup = {
        organizationId: satir.organizationId,
        ad: satir.organizationName,
        aylikToplam: 0,
        aylikToplamAdi: "",
        kalemler: [],
        odeyen: 0,
        denemede: 0,
        geciken: 0,
        kapali: 0,
      };
      grupHarita.set(satir.organizationId, grup);
    }
    if (satir.durum === "suspended" || satir.durum === "canceled") grup.kapali += 1;
    else if (satir.durum === "trialing") grup.denemede += 1;
    else if (satir.durum === "past_due") { grup.geciken += 1; grup.aylikToplam += Number(satir.monthlyFee ?? 0); }
    else { grup.odeyen += 1; grup.aylikToplam += Number(satir.monthlyFee ?? 0); }

    grup.kalemler.push({
      urun: satir.urun,
      urunAdi: satir.urunAdi,
      durum: satir.durum,
      durumAdi: statusLabels[satir.durum] ?? satir.durum,
      tone: statusTones[satir.durum] ?? "neutral",
      planAdi: satir.planCode ? PAKET_ADI[satir.planCode] ?? satir.planCode : null,
      ucret: satir.monthlyFee ? `${para(Number(satir.monthlyFee), currency)} / ay` : null,
      donemAdi: satir.durum === "trialing"
        ? tarih(satir.denemeSonu)
        : satir.donemSonu ? tarih(satir.donemSonu) : "girilmedi",
      donemNotu: satir.durum === "trialing" ? "Deneme bitişi" : "Dönem sonu",
    });
  }
  /*
    ÖDEME SORUNLARI (14.10.2026): kurucunun bugün peşine düşeceği iş tek
    listede. Eskiden gecikmiş sayısı şeritte, bekleyen dekontlar Ödeme
    Onayları'nda, işlenemeyen PayTR bildirimleri Sistem Sağlığı'ndaydı ve
    denemesi bitip ödemeye geçmeyen kiracı hiçbir yerde görünmüyordu.

    "Denemesi bitti" yalnızca GÖSTERİLİYOR, durum değiştirilmiyor:
    ArvoARC, ArvoLab ve Randevu deneme bitişine değil dönem sonuna bakıyor;
    durumu 'past_due'ya çekmek bugün açık olan denemeleri kapatırdı.
  */
  const simdiAn = Date.parse(gunOnce(0));
  type Sorun = { anahtar: string; kim: string; organizationId: string | null; sorun: string; ayrinti: string; ton: StgTone; baglanti: string; baglantiAdi: string };
  const sorunlar: Sorun[] = [
    ...abonelikler.filter((s) => s.durum === "past_due").map((s) => ({
      anahtar: `gecikmis-${s.organizationId}-${s.urun}`, kim: s.organizationName, organizationId: s.organizationId,
      sorun: "Ödemesi gecikmiş", ayrinti: `${s.urunAdi} · dönem sonu ${tarih(s.donemSonu)}`, ton: "warning" as StgTone,
      baglanti: `/panel/platform/licenses?organization=${s.organizationId}`, baglantiAdi: "Lisans →",
    })),
    ...abonelikler.filter((s) => s.durum === "trialing" && s.denemeSonu && Date.parse(s.denemeSonu) < simdiAn).map((s) => ({
      anahtar: `deneme-${s.organizationId}-${s.urun}`, kim: s.organizationName, organizationId: s.organizationId,
      sorun: "Denemesi bitti, ödeme yok", ayrinti: `${s.urunAdi} · deneme ${tarih(s.denemeSonu)} tarihinde bitti`, ton: "warning" as StgTone,
      baglanti: `/panel/platform/licenses?organization=${s.organizationId}`, baglantiAdi: "Lisans →",
    })),
    ...((sorunluBildirimler ?? []) as { id: string; organization_id: string; product: string | null; amount: number; currency: string; status: string; created_at: string; review_note: string | null }[])
      .filter(isCustomer)
      .map((b) => ({
        anahtar: `bildirim-${b.id}`, kim: orgAdi.get(b.organization_id) ?? "Kurum", organizationId: b.organization_id,
        sorun: b.status === "pending" ? "Havale onay bekliyor" : "Havale reddedildi",
        ayrinti: `${productName(b.product ?? "arvoos")} · ${para(Number(b.amount), b.currency)} · ${tarih(b.created_at)}${b.status === "rejected" && b.review_note ? ` · ${b.review_note}` : ""}`,
        ton: (b.status === "pending" ? "info" : "danger") as StgTone,
        baglanti: "/panel/platform/payments", baglantiAdi: "Ödeme onayları →",
      })),
    ...odemeOlaylari.map((olay) => ({
      anahtar: `paytr-${olay.id}`, kim: olay.organizationName ?? "Bilinmeyen kurum", organizationId: olay.organizationId,
      sorun: "PayTR ödemesi işlenemedi", ayrinti: `${olay.paymentAmount !== null ? para(olay.paymentAmount) : "tutar yok"} · ${olay.merchantOid}`, ton: "danger" as StgTone,
      baglanti: "/panel/platform/payments#karsiliksiz", baglantiAdi: "Ayrıntı →",
    })),
  ];

  const abonelikGruplari = [...grupHarita.values()]
    .map((grup) => ({ ...grup, aylikToplamAdi: grup.aylikToplam ? para(grup.aylikToplam, currency) : "—" }))
    .sort((a, b) => b.aylikToplam - a.aylikToplam || a.ad.localeCompare(b.ad, "tr"));

  return <main className="stg plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · FİNANS</small>
        <h1>Abonelikler</h1>
        <p>Kurum aboneliklerini, ödeme durumlarını ve tahsilatları tek yerden izleyin.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/payments">Ödeme onayları</Link>
      </div>
    </header>

    {/*
      13.10.2026: StgWidget kutuları yerine panelin özet şeridi. Konsol
      kendi tasarım dilini kullanıyordu; aynı kurucunun gün içinde gidip
      geldiği panel ekranları şerit kullanıyor ve iki dil arasında geçiş
      sayıları her seferinde yeniden aramak demekti.

      Dördü de her zaman çiziliyor: "ödemesi gecikmiş kurum yok" demek,
      satırın hiç olmamasından daha çok şey söyler.
    */}
    <nav className="kayit-serit talep-serit" aria-label="Abonelik özeti">
      <dl>
        <div>
          <dt>Beklenen aylık</dt>
          <dd>{para(mrr, currency)}</dd>
          <small>{denemeGeliri ? `${para(denemeGeliri, currency)} denemede` : ucretsiz ? `${ucretsiz} abonelikte ücret girilmedi` : "Denemede gelir yok"}</small>
        </div>
        {/* Toplam BÜTÜN kayıtlardan; başlıkta bu ay, notta tüm zaman. Eskiden
            son 50 kaydın toplamı "tahsil edildi" diye yazılıyordu. */}
        <div>
          <dt>Bu ay tahsil edilen</dt>
          <dd className="cari-arti"><Link href="/panel/platform/tahsilat">{para(buAyTahsilat, currency)}</Link></dd>
          <small>Tüm zamanlar {para(toplamTahsilat, currency)} · {tahsilatAdedi} ödeme</small>
        </div>
        <div>
          <dt>Aktif abonelik</dt>
          <dd>{odeyenler.length}</dd>
          <small>{denemedekiler.length ? `${denemedekiler.length} deneme sürüyor` : `${odeyenler.length + denemedekiler.length} açık abonelik`}</small>
        </div>
        <div>
          <dt>Ödemesi gecikmiş</dt>
          <dd className={pastDue ? "talep-uyari" : undefined}>{pastDue}</dd>
          <small>{pastDue ? "Hatırlatma gönderin" : "Gecikmiş abonelik yok"}</small>
        </div>
      </dl>
    </nav>

    {/* Farklı para birimleri toplanamaz; toplamı doğru sanmaktansa
        güvenilmez olduğunu söylüyoruz. */}
    {birimKarisik ? (
      <p className="stg-muted"><StgIcon name="shield" size={16} />Kayıtlarda birden çok para birimi var; toplamlar {currency} varsayımıyla yazıldı ve güvenilir değil.</p>
    ) : null}

    {/* Ödeme sorunları: bugün peşine düşülecek işler tek listede. */}
    <StgSection
      id="sorunlar" wide icon="shield" tone={sorunlar.some((x) => x.ton === "danger") ? "danger" : sorunlar.length ? "warning" : "success"}
      kicker="ÖDEME SORUNLARI" title={sorunlar.length ? `${sorunlar.length} konu bekliyor` : "Ödeme sorunu yok"}
      description="Gecikmiş abonelikler, denemesi bitip ödemeye geçmeyenler, onay bekleyen ya da son 30 günde reddedilen havaleler ve PayTR'nin bildirip işlenemeyen ödemeler."
    >
      {sorunlar.length ? (
        <div className="plt-table-scroll">
          <table className="plt-table">
            <thead><tr><th>Kurum</th><th>Sorun</th><th>Ayrıntı</th><th /></tr></thead>
            <tbody>
              {sorunlar.map((x) => (
                <tr key={x.anahtar}>
                  <td>{x.kim}</td>
                  <td><span className="status-pill" data-tone={x.ton}>{x.sorun}</span></td>
                  <td>{x.ayrinti}</td>
                  <td><Link className="kiraci-baglanti" href={x.baglanti}>{x.baglantiAdi}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="stg-empty"><StgIcon name="check" size={22} /><p>Gecikmiş abonelik, bekleyen havale ya da işlenemeyen ödeme yok.</p></div>}
    </StgSection>

    <div className="stg-grid">
      <StgSection
        id="hatirlatmalar" wide icon="wallet" tone={reminders.some((r) => r.daysLeft < 0) ? "danger" : reminders.length ? "warning" : "neutral"}
        kicker="ÖDEME HATIRLATMALARI" title="Dönem sonu yaklaşanlar"
        description={`ArvoOS, ArvoARC, ArvoLab ve Randevu aboneliklerinden ${REMINDER_WINDOW_DAYS} gün içinde bitenler ve süresi geçenler. WhatsApp düğmesi kurumun iletişim numarasına ödeme bağlantılı hazır mesajı açar.`}
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
                    <small>{r.daysLeft < 0 ? `${-r.daysLeft} gün önce bitti` : r.daysLeft === 0 ? "Bugün bitiyor" : `${r.daysLeft} gün kaldı`} · {tarih(r.endsAt)}{r.fee ? ` · ${para(r.fee, "TRY")} / ay` : " · aylık ücret girilmedi"}</small>
                  </span>
                </span>
                {/*
                  Eskiden bu bir wa.me bağlantısıydı: kurucu WhatsApp Web'e
                  düşüyor, mesajı elle gönderiyordu ve gönderilip
                  gönderilmediğinin kaydı kalmıyordu — "bu kuruma hatırlattık
                  mı" sorusunun yanıtı kimsede yoktu. Artık kapıdan gidiyor
                  ve kurumun sohbetine yazılıyor.
                */}
                {r.phone ? (
                  <form action={abonelikHatirlatmasiGonder}>
                    <input type="hidden" name="organization_id" value={r.organizationId} />
                    <input type="hidden" name="product" value={r.product} />
                    <input type="hidden" name="tur" value={r.trial ? "trial" : "renewal"} />
                    <input type="hidden" name="phone" value={r.phone} />
                    <input type="hidden" name="message" value={r.message} />
                    <input type="hidden" name="abone" value={r.organizationName} />
                    <input type="hidden" name="urun" value={r.productName} />
                    <input type="hidden" name="tarih" value={r.endsAtLabel} />
                    <input type="hidden" name="ucret" value={r.feeLabel ?? ""} />
                    <button className="panel-secondary" type="submit" title={r.message}>WhatsApp ile hatırlat</button>
                  </form>
                ) : (
                  <Link className="panel-secondary" href={`/panel/platform?organization=${r.organizationId}#ayarlar`} title="Kurum ayarlarında iletişim telefonu yok ya da cep numarası değil">Telefon ekle</Link>
                )}
              </div>
            ))}
          </div>
        ) : <div className="stg-empty"><StgIcon name="check" size={22} /><p>Önümüzdeki {REMINDER_WINDOW_DAYS} gün içinde biten ya da süresi geçmiş abonelik yok.</p></div>}
      </StgSection>

      <StgSection
        id="abonelikler" wide icon="box" tone="gold" kicker="ABONELİKLER" title="Kurum abonelikleri"
        description="Kiracı bazında gruplu; başlıkta o kurumun aylık toplamı. Kaynak lisans kayıtları, yani ödemesi henüz gelmemiş ya da elle açılmış abonelikler de burada."
        aside={<span className="status-pill">{abonelikler.length} abonelik</span>}
      >
        {abonelikGruplari.length ? (
          <AbonelikListesi gruplar={abonelikGruplari} />
        ) : <div className="stg-empty"><StgIcon name="box" size={22} /><p>Aktif, denemede ya da ödemesi gecikmiş abonelik yok.</p></div>}
      </StgSection>

      {/* Tahsilat listesi kendi menüsünde (Faturalama ve Tahsilat, 14.10.2026). */}
      <StgSection
        id="tahsilat" wide icon="wallet" tone="success" kicker="TAHSİLAT" title="Platformun aldığı ödemeler"
        description="Havale, kart ve bireysel abone ödemelerinin listesi ve faturalar Faturalama ve Tahsilat menüsünde."
        aside={<Link className="kiraci-baglanti" href="/panel/platform/tahsilat">Tahsilatlara git →</Link>}
      >
        <p className="stg-muted">Tüm zamanlar {para(toplamTahsilat, currency)} · {tahsilatAdedi} ödeme.</p>
      </StgSection>
    </div>
  </main>;
}
