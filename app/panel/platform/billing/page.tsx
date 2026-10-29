import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPanelContext } from "@/lib/panel-context";
import { sayfaliSonuc } from "@/lib/rapor-okuma";
import { zorunlu } from "../konsol-oku";
import { basHarfleri, PAKET_ADI, para, sayi, tarih } from "../bicim";
import { productName } from "@/lib/products";
import { AbonelikListesi, type AbonelikGrubu } from "./abonelik-listesi";
import { KNot } from "../konsol-ui";
import { MobilSatir } from "../../crm/table-cells";
import { SatirTiklama } from "../../crm/satir-tiklama";
import { IstatistikKarti } from "../../crm/istatistik-karti";
import { TalepAkis } from "../../crm/kayit-detay/kayit-akis";
import "../platform.css";
// Panelin başlık ve özet şeridi kalıbı (talep-bas, kayit-serit).
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../hr/hr.css";
import "../finans.css";
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
  /** Grup markası (lib/kurum-turu): listede görünür, müşteri gelirine girmez. */
  grup: boolean;
};

const statusLabels: Record<string, string> = { active: "Aktif", trialing: "Deneme", past_due: "Ödeme gecikmiş", suspended: "Askıda", canceled: "İptal", incomplete: "Tamamlanmadı", paid: "Ödendi", open: "Açık", draft: "Taslak", void: "Geçersiz" };
/* Durum rozetinin tonları (status-pill data-tone). Eskiden ayarlar
   ekranının StgTone tipiydi; konsol o kart dilinden çıkınca yerel tip. */
type Ton = "success" | "info" | "warning" | "danger" | "neutral";
const statusTones: Record<string, Ton> = { active: "success", trialing: "info", past_due: "warning", suspended: "danger", canceled: "danger", incomplete: "warning", paid: "success", open: "warning", draft: "neutral", void: "neutral" };

// Şimdiki zaman bileşen dışında okunur (react-hooks/purity).
const gunOnce = (gun: number) => new Date(Date.now() - gun * 86_400_000).toISOString();
const remindersNow = (licenses: RenewalLicense[], organizations: RenewalOrganization[]) => renewalReminders(licenses, organizations, Date.now());

const BOLUMLER = ["sorunlar", "hatirlatma"] as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ durum?: string; bolum?: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { durum, bolum: istenenBolum } = await searchParams;
  const bolum = BOLUMLER.find((b) => b === istenenBolum) ?? "";

  const [
    icKurumSonucu,
    urunLisansSonucu,
    kurumSonucu,
    cekirdekSonucu,
    { data: tahsilatOzeti, error: ozetHatasi },
    sorunluSonucu,
    odemeOlaylari,
    { count: bekleyenSozlesme },
  ] = await Promise.all([
    /* SAYFALI: kiracı (× ürün) büyüyen tablolar; PostgREST 1.000
       satırda kesip söylemiyor ve bu ekranın sayıları o gün sessizce
       eksilirdi (lib/rapor-okuma). */
    sayfaliSonuc<{ id: string }>("iç kurumlar", (bas, son) =>
      supabase.from("organizations").select("id").eq("kind", "internal").order("id").range(bas, son)),
    sayfaliSonuc<{ organization_id: string; product: string; status: string; plan_code: string | null; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }>("ürün lisansları", (bas, son) =>
      supabase.from("organization_product_licenses").select("organization_id,product,status,plan_code,monthly_fee,current_period_end,trial_ends_at")
        .in("status", ["active", "trialing", "past_due", "suspended", "canceled"]).order("organization_id").range(bas, son)),
    sayfaliSonuc<{ id: string; name: string; display_name: string | null; contact_phone: string | null; kind: string | null; grup_markasi: boolean | null }>("kurumlar", (bas, son) =>
      supabase.from("organizations").select("id,name,display_name,contact_phone,kind,grup_markasi").order("id").range(bas, son)),
    // ArvoOS çekirdek lisansının aylık ücreti; ek ürünler ayrı tabloda.
    sayfaliSonuc<{ organization_id: string; license_status: string; plan_code: string | null; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }>("çekirdek lisanslar", (bas, son) =>
      supabase.from("organization_licenses").select("organization_id,license_status,plan_code,monthly_fee,current_period_end,trial_ends_at")
        .order("organization_id").range(bas, son)),
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
    /* Bekleyen sözleşme onayı (başlıktaki düğme). İstekler yalnızca sunucu
       anahtarıyla okunuyor (sözleşme kuyruğundaki kural). */
    (() => { const admin = createAdminClient(); return admin
      ? admin.from("platform_subscription_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
      : Promise.resolve({ count: 0 }); })(),
  ]);
  if (ozetHatasi) throw new Error("Tahsilat özeti okunamadı: " + ozetHatasi.message);
  /*
    Sayfanın ASIL verisi: okunamazsa sayfa hata veriyor. Eskiden `?? []`
    ile boş diziye düşüyordu ve ekran "abonelik yok" diyordu — "iş yok"
    ile "okuyamadım" aynı şey değil ve kurucu birincisine bakıp geçer
    (konsol-oku.ts).
  */
  const internalOrganizations = zorunlu(icKurumSonucu, "Kurum listesi");
  const productLicenses = zorunlu(urunLisansSonucu, "Ürün lisansları");
  const organizationRows = zorunlu(kurumSonucu, "Kurumlar");
  const coreLicenses = zorunlu(cekirdekSonucu, "Çekirdek lisanslar");
  const sorunluBildirimler = zorunlu(sorunluSonucu, "Ödeme sorunları");
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

  const kurumlar = (organizationRows ?? []) as { id: string; name: string; display_name: string | null; grup_markasi?: boolean | null }[];
  const orgAdi = new Map(kurumlar.map((row) => [row.id, row.display_name || row.name]));
  /* Grup markaları (AkademikMerkez, ArvoCulture) listede kalıyor — ücretleri
     ArvoOS'un gruba yarattığı değeri gösteriyor — ama müşteri gelirine
     (beklenen aylık) girmiyor; ayrıca "grup içi değer" olarak yazılıyor. */
  const grupMarkasi = new Set(kurumlar.filter((row) => row.grup_markasi).map((row) => row.id));

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
        grup: grupMarkasi.has(satir.organization_id),
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
        grup: grupMarkasi.has(satir.organization_id),
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
  const odeyenlerTumu = abonelikler.filter((satir) => satir.durum === "active" || satir.durum === "past_due");
  const odeyenler = odeyenlerTumu.filter((satir) => !satir.grup);
  const denemedekiler = abonelikler.filter((satir) => satir.durum === "trialing" && !satir.grup);
  const mrr = topla(odeyenler);
  const grupDegeri = topla(odeyenlerTumu.filter((satir) => satir.grup));
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
        grup: satir.grup,
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
  type Sorun = { anahtar: string; kim: string; organizationId: string | null; sorun: string; ayrinti: string; ton: Ton; baglanti: string; baglantiAdi: string };
  const sorunlar: Sorun[] = [
    ...abonelikler.filter((s) => s.durum === "past_due").map((s) => ({
      anahtar: `gecikmis-${s.organizationId}-${s.urun}`, kim: s.organizationName, organizationId: s.organizationId,
      sorun: "Ödemesi gecikmiş", ayrinti: `${s.urunAdi} · dönem sonu ${tarih(s.donemSonu)}`, ton: "warning" as Ton,
      baglanti: `/panel/platform/musteriler/${s.organizationId}?pencere=lisanslar`, baglantiAdi: "Lisans →",
    })),
    ...abonelikler.filter((s) => s.durum === "trialing" && s.denemeSonu && Date.parse(s.denemeSonu) < simdiAn).map((s) => ({
      anahtar: `deneme-${s.organizationId}-${s.urun}`, kim: s.organizationName, organizationId: s.organizationId,
      sorun: "Denemesi bitti, ödeme yok", ayrinti: `${s.urunAdi} · deneme ${tarih(s.denemeSonu)} tarihinde bitti`, ton: "warning" as Ton,
      baglanti: `/panel/platform/musteriler/${s.organizationId}?pencere=lisanslar`, baglantiAdi: "Lisans →",
    })),
    ...((sorunluBildirimler ?? []) as { id: string; organization_id: string; product: string | null; amount: number; currency: string; status: string; created_at: string; review_note: string | null }[])
      .filter(isCustomer)
      .map((b) => ({
        anahtar: `bildirim-${b.id}`, kim: orgAdi.get(b.organization_id) ?? "Kurum", organizationId: b.organization_id,
        sorun: b.status === "pending" ? "Havale onay bekliyor" : "Havale reddedildi",
        ayrinti: `${productName(b.product ?? "arvoos")} · ${para(Number(b.amount), b.currency)} · ${tarih(b.created_at)}${b.status === "rejected" && b.review_note ? ` · ${b.review_note}` : ""}`,
        ton: (b.status === "pending" ? "info" : "danger") as Ton,
        baglanti: "/panel/platform/payments", baglantiAdi: "Ödeme onayları →",
      })),
    ...odemeOlaylari.map((olay) => ({
      anahtar: `paytr-${olay.id}`, kim: olay.organizationName ?? "Bilinmeyen kurum", organizationId: olay.organizationId,
      sorun: "PayTR ödemesi işlenemedi", ayrinti: `${olay.paymentAmount !== null ? para(olay.paymentAmount) : "tutar yok"} · ${olay.merchantOid}`, ton: "danger" as Ton,
      baglanti: "/panel/platform/payments#karsiliksiz", baglantiAdi: "Ayrıntı →",
    })),
  ];

  const abonelikGruplari = [...grupHarita.values()]
    .map((grup) => ({ ...grup, aylikToplamAdi: grup.aylikToplam ? para(grup.aylikToplam, currency) : "—" }))
    .sort((a, b) => b.aylikToplam - a.aylikToplam || a.ad.localeCompare(b.ad, "tr"));

  /* Sağdaki istatistik kartının dağılımları: hepsi yukarıdaki sınırsız
     lisans okumasından (abonelikler), süzgeçten bağımsız. */
  const durumSayisi = (kod: string) => abonelikler.filter((s) => s.durum === kod).length;
  const urunSayilari = new Map<string, number>();
  for (const s of abonelikler) urunSayilari.set(s.urunAdi, (urunSayilari.get(s.urunAdi) ?? 0) + 1);

  /*
    GÖRÜNÜŞ (14.10.2026, "bizim ArvoOS panel gibi olmalı"): ayarlar
    ekranının kartları (StgSection) ve konsolun kendi tablosu (.plt-table)
    yerine panelin liste sayfası: solda liste kartı, sağda istatistik.
    Ödeme sorunları ve dönem sonu hatırlatmaları kartın çip satırında
    birer bölüm (?bolum=); eskiden üç ayrı kart alt alta diziliyordu ve
    abonelik listesi sayfanın dibinde kalıyordu.
  */
  const kisi = (ad: string, alt: string, href: string) => (
    <Link className="crm-row-link ek-kisi" href={href}>
      <span className="ek-avatar" aria-hidden="true">{basHarfleri(ad)}</span>
      <span className="ek-kisi-metin"><span className="crm-table-title" title={ad}>{ad}</span><span className="crm-table-sub">{alt}</span></span>
    </Link>
  );
  const bos = (baslik: string, aciklama: string) => (
    <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>{baslik}</h2><p>{aciklama}</p></div>
  );

  /*
    PANELİN DİLİ (29.10.2026, konsol yeniden kurulurken): Müşteriler
    listesiyle aynı tablo, sağda aynı sekmeli istatistik kartı. Ödeme
    sorunları ve dönem sonu hatırlatmaları da tablo; hatırlatma düğmesi
    satırın sonunda.
  */
  return <main className="plt talep cari ekip talepler teklifler liste-sayfa finans-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">FİNANS</small>
        <h1>Abonelikler</h1>
        <p className="ek-alt">{odeyenler.length} ödeyen · {denemedekiler.length} denemede · beklenen aylık {para(mrr, currency)}</p>
      </div>
      <div className="talep-bas-eylem">
        {/* Sözleşme onayları (14.10.2026): imzalanan sözleşme kuruma
            onaylanınca abonelik açılır. */}
        <Link className={bekleyenSozlesme ? "panel-primary" : "panel-secondary"} href="/panel/platform/sozlesmeler">
          Sözleşme onayları{bekleyenSozlesme ? ` · ${bekleyenSozlesme} bekliyor` : ""}
        </Link>
      </div>
    </header>

    {/* Dördü de her zaman çiziliyor: "ödemesi gecikmiş kurum yok" demek,
        satırın hiç olmamasından daha çok şey söyler. */}
    <nav className="kayit-serit talep-serit" aria-label="Abonelik özeti">
      <dl>
        <div>
          <dt>Beklenen aylık</dt>
          <dd className="cari-arti">{para(mrr, currency)}</dd>
          <small>{grupDegeri ? `+ ${para(grupDegeri, currency)} grup içi değer` : denemeGeliri ? `${para(denemeGeliri, currency)} denemede` : ucretsiz ? `${ucretsiz} abonelikte ücret girilmedi` : "Denemede gelir yok"}</small>
        </div>
        {/* Toplam BÜTÜN kayıtlardan; eskiden son 50 kaydın toplamı "tahsil edildi" diye yazılıyordu. */}
        <div>
          <dt>Bu ay tahsil edilen</dt>
          <dd><Link href="/panel/platform/tahsilat">{para(buAyTahsilat, currency)}</Link></dd>
          <small>Tüm zamanlar {para(toplamTahsilat, currency)} · {tahsilatAdedi} ödeme</small>
        </div>
        <div>
          <dt>Aktif abonelik</dt>
          <dd>{odeyenler.length}</dd>
          <small>{denemedekiler.length ? `${denemedekiler.length} deneme sürüyor` : `${odeyenler.length + denemedekiler.length} açık abonelik`}</small>
        </div>
        <div className={!bolum && durum === "geciken" ? "is-active" : undefined}>
          <dt>Ödemesi gecikmiş</dt>
          <dd className={pastDue ? "talep-uyari" : undefined}><Link href="/panel/platform/billing?durum=geciken">{pastDue}</Link></dd>
          <small>{pastDue ? "Hatırlatma gönderin" : "Gecikmiş abonelik yok"}</small>
        </div>
      </dl>
    </nav>

    {birimKarisik ? (
      <KNot ton="uyari">Kayıtlarda birden çok para birimi var; toplamlar {currency} varsayımıyla yazıldı ve güvenilir değil.</KNot>
    ) : null}

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Abonelik listesi">
        <AbonelikListesi
          gruplar={abonelikGruplari}
          durum={durum}
          bolum={bolum}
          bolumler={[
            { kod: "sorunlar", ad: "Ödeme sorunları", adet: sorunlar.length, uyari: sorunlar.length > 0 },
            { kod: "hatirlatma", ad: "Dönem sonu yaklaşanlar", adet: reminders.length, uyari: reminders.some((r) => r.daysLeft < 0) },
          ]}
        >
          {bolum === "sorunlar" ? (
            sorunlar.length ? (
              <div className="talep-tablo">
                <table className="crm-data-table" data-cols="fn-sorun">
                  <thead><tr><th>Kurum</th><th>Sorun</th><th>Ayrıntı</th><th></th></tr></thead>
                  <tbody>
                    {sorunlar.map((x) => (
                      <tr key={x.anahtar}>
                        <td data-label="Kurum">{kisi(x.kim, x.baglantiAdi.replace(" →", ""), x.baglanti)}</td>
                        <td data-label="Sorun"><span className="status-pill" data-tone={x.ton}>{x.sorun}</span></td>
                        <td data-label="Ayrıntı"><span className="crm-table-sub" title={x.ayrinti}>{x.ayrinti}</span></td>
                        <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                        <MobilSatir href={x.baglanti} baslik={x.kim} durum={{ etiket: x.sorun, ton: x.ton }} alt={[x.ayrinti]} />
                      </tr>
                    ))}
                  </tbody>
                </table>
                <SatirTiklama />
              </div>
            ) : bos("Ödeme sorunu yok", "Gecikmiş abonelik, bekleyen havale ya da işlenemeyen ödeme yok.")
          ) : bolum === "hatirlatma" ? (
            reminders.length ? (
              <div className="talep-tablo">
                <table className="crm-data-table" data-cols="fn-hatirlatma">
                  <thead><tr><th>Kurum</th><th className="crm-col-date">Bitiş</th><th>Kalan</th><th className="crm-col-amount">Aylık</th><th></th></tr></thead>
                  <tbody>
                    {reminders.map((r) => {
                      const kalan = r.daysLeft < 0 ? `${-r.daysLeft} gün önce bitti` : r.daysLeft === 0 ? "Bugün bitiyor" : `${r.daysLeft} gün kaldı`;
                      const ton = r.daysLeft < 0 ? "danger" : r.daysLeft <= 1 ? "warning" : "info";
                      return (
                        <tr key={`${r.organizationId}-${r.product}`}>
                          <td data-label="Kurum">{kisi(r.organizationName, `${r.productName}${r.trial ? " · deneme" : ""}`, `/panel/platform/musteriler/${r.organizationId}?pencere=lisanslar`)}</td>
                          <td className="crm-col-date" data-label="Bitiş">{tarih(r.endsAt)}</td>
                          <td data-label="Kalan"><span className="status-pill" data-tone={ton}>{kalan}</span></td>
                          {/* Ücreti girilmemiş abonelik ₺0 yazmıyor: eksik kayıt, ücretsiz değil. */}
                          <td className="crm-col-amount" data-label="Aylık">{r.fee ? <span className="crm-table-title">{para(r.fee, "TRY")}</span> : <span className="k-ios-eksik">Ücret yok</span>}</td>
                          <td className="crm-table-actions">
                            {/* Hatırlatma WhatsApp kapısından gidiyor ve kurumun
                                sohbetine yazılıyor; eskiden wa.me bağlantısıydı ve
                                gönderilip gönderilmediğinin kaydı kalmıyordu. */}
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
                              <Link className="panel-secondary" href={`/panel/platform/musteriler/${r.organizationId}?pencere=ayarlar`} title="Kurum ayarlarında iletişim telefonu yok ya da cep numarası değil">Telefon ekle</Link>
                            )}
                          </td>
                          <MobilSatir href={`/panel/platform/musteriler/${r.organizationId}?pencere=lisanslar`} baslik={r.organizationName} durum={{ etiket: kalan, ton }}
                            alt={[r.productName, `bitiş ${tarih(r.endsAt)}`, r.fee ? para(r.fee, "TRY") : "ücret yok"]} />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <SatirTiklama />
              </div>
            ) : bos("Yaklaşan dönem sonu yok", `Önümüzdeki ${REMINDER_WINDOW_DAYS} gün içinde biten ya da süresi geçmiş abonelik yok.`)
          ) : null}
        </AbonelikListesi>
      </section>

      {/* Sağ sütun: bütün lisans kayıtlarından, süzgeçten bağımsız dağılımlar. */}
      <div className="liste-sag">
        <TalepAkis kimlik="abonelik-sag" sinif="ek-sag" etiket="Abonelik istatistikleri" sekmeler={["İstatistikler"]}>
          <IstatistikKarti
            kapsam="bütün abonelikler"
            kutular={[
              { ad: "Beklenen aylık", deger: para(mrr, currency), alt: "ödeyen müşteriler" },
              { ad: "Denemede", deger: sayi(denemedekiler.length), alt: denemeGeliri ? `${para(denemeGeliri, currency)} potansiyel` : "abonelik" },
              { ad: "Ücreti girilmemiş", deger: sayi(ucretsiz), alt: "açık abonelik", ton: ucretsiz ? "uyari" : undefined },
              { ad: "Ödeme sorunu", deger: sayi(sorunlar.length), alt: "takip edilecek", ton: sorunlar.length ? "uyari" : undefined },
            ]}
            gruplar={[
              { baslik: "Duruma göre", satirlar: [
                { ad: "Aktif", adet: durumSayisi("active") },
                { ad: "Deneme", adet: durumSayisi("trialing") },
                { ad: "Ödeme gecikmiş", adet: durumSayisi("past_due") },
                { ad: "Askıda", adet: durumSayisi("suspended") },
                { ad: "İptal", adet: durumSayisi("canceled") },
              ].filter((d) => d.adet) },
              { baslik: "Ürüne göre", satirlar: [...urunSayilari.entries()].sort((a, b) => b[1] - a[1]).map(([ad, adet]) => ({ ad, adet })) },
            ]}
          />
        </TalepAkis>
      </div>
    </div>
  </main>;
}
