import { sureOlcer } from "@/lib/sure-olcumu";
import { kopruSagliklari } from "@/lib/kopru-sagliklari";
import { askidakiKurumlar, type AskiSatiri } from "@/lib/askidakiler";
import { GONDERIM_ADI, gonderimDurumu, gonderimSirasi } from "@/lib/proforma-gonderim";
import MIGRATION_IZLERI from "@/lib/migration-izleri.json";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { depolamaKullanimi } from "@/lib/lisans-olcumleri";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPersonName } from "@/lib/format-name";
import { arvolabKopyalari } from "@/lib/arvolab";
import { arcKopyalari } from "@/lib/arc-bridge";
import { randevuKopyalari } from "@/lib/randevu-bridge";
import { eskiKopyalar } from "@/lib/kopya-denetimi";
import { kotaDurumu } from "@/lib/kota-durumu";
import { kurumTuru, musteriMi } from "@/lib/kurum-turu";
import { renewalReminders, REMINDER_WINDOW_DAYS, type RenewalLicense, type RenewalOrganization } from "@/lib/renewal-reminders";
import { productName } from "@/lib/products";
import { getPaymentIncidents, incidentLabels } from "@/lib/payment-incidents";
import { havaleDenetimleri } from "@/lib/beklenen-odeme";
import { reviewBankTransferPayment } from "./platform/payments/actions";
import { HizliOnay } from "./platform/payments/hizli-onay";
import { notTamamla } from "./platform/musteriler/[id]/not-actions";
import { bekleyenKrediler } from "@/lib/ai-kredi-yukleme";
import { gunFarki } from "@/lib/is-adimlari";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { gunlukSeri } from "@/lib/gunluk-seri";
import { tumSatirlar } from "@/lib/rapor-okuma";
import { musteriEtkinlikleri } from "@/lib/musteri-etkinligi-oku";
import { etkinlikYazisi, kullanilmayanMi, yenilemeRiski } from "@/lib/musteri-etkinligi";
import { beklemeSuresi, gecikmisMi, kuyrukSirala, ONCELIK_ADI, YANIT_BEKLEYEN_DURUMLAR } from "@/lib/destek-kuyrugu";
import Link from "next/link";
import { KONSOL_ALANLARI, uygulamalariSuz, type KonsolKapsami } from "@/lib/konsol-alanlari";
import { konsolUygulamalari } from "./os/konsol-apps";
import { donemDegisimi } from "@/lib/gunluk-seri";
import { GENEL_BAKIS_SATIR, GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri, SeriKarti, seriBaslangici, simdi } from "./os/genel-bakis";
import { TalepAkis } from "./crm/kayit-detay/kayit-akis";
import { StgIcon } from "./settings/settings-ui";
import { KURULUM_ADI, KURULUM_ISLEMI, para, tarih } from "./platform/bicim";
import { relativeTime } from "./crm/last-contact";
import "./dashboard.css";
import "./hr/hr.css";
import "./crm/kayit-detay/kayit-detay.css";
import "./konsol-ana-sayfa.css";

/*
  Kurucu konsolunun ana sayfası (yalnızca yonetim.arvo-os.com).

  Konsolun bir "eve dönüş" noktası yoktu: menü doğrudan kiracı listesiyle
  başlıyordu ve kurucunun ilk sorusu ("bugün neye bakmam gerek") hiçbir
  ekranda yanıtlanmıyordu — yanıtı yedi sayfayı tek tek gezerek
  topluyordu.

  Kiracı panelinin ana ekranıyla AYNI BİLEŞENLER (os/genel-bakis):
  selamlama, tam genişlikte 14 günlük grafik, altında dört liste kartı.
  Kurucu gün içinde iki kabuk arasında gidip geliyor; ikisinin ana
  sayfası farklı görünürse hangi alan adında olduğu her seferinde
  yeniden okunuyordu.

  13.10.2026'ya kadar konsol kendi düzenini çiziyordu (dash-widget
  kutuları, dash-row listeleri) — panelin diline benziyordu ama ayrı
  bir koddu ve panel genel bakış şablonuna geçtiğinde geride kaldı.
  Artık aynı bileşenler: düzen tek yerde değişiyor.

  Grafik 14 günlük TAHSİLAT. Konsolun ilk ekranında hiç eğilim yoktu;
  kurucu "bu hafta geçen haftadan iyi mi" sorusunu hiçbir ekranda
  göremiyordu. Sayı kartları grafiğin başlığına taşındı (panelde de
  böyle: ayrı bir satır ekranı aşağı itiyordu).

  BUGÜNÜN İŞLERİ (29.10.2026, konsol yeniden kurulurken). "Bugün neye
  bakmalı?" kartı beş SAYI sıralıyordu ("İncelenecek ödeme bildirimi
  3"); hangi kurumun, ne kadarlık bir ödemesi olduğunu görmek için
  kurucu yine o ekrana gidiyordu — kart yalnızca bir yönlendirmeydi.
  Artık sayfanın ortası sekmeli bir iş kuyruğu: ödeme onayları,
  sözleşmeler, kurulumlar, dönemi dolanlar ve sorunlar, her biri KAYIT
  KAYIT. Sayılar en üstte tek şeritte; grafik ve son hareketler altta.
  Elle yazılmış "Bölümler" kartı kalktı: dock beş uygulamaya indi ve
  aynı listeyi zaten gösteriyor.

  SAYFA ARTIK BİR ŞEY YAZIYOR, AMA TEK BİR ŞEY (29.10.2026, kurum
  sahibinin isteği): beklenenle UYUŞAN ödeme bildirimi kuyruktan tek
  tıkla onaylanabiliyor. Kurucunun günde defalarca yaptığı iş "dekont
  geldi, tutar doğru, onayla" idi ve bunun için ekran değiştirmek
  gerekiyordu.

  Eski kural ("buradan hiçbir şey yazılmıyor") şunun için konmuştu:
  aynı işi iki yerde uygulamak, birinin sapması demek. Kural
  korunuyor — ikinci bir uygulama YOK: düğme payments/actions.ts'teki
  AYNI sunucu işlemini çağırıyor, yetki, tutar denetimi, lisans uzatma
  ve ürün köprüsüne yansıtma orada.

  Farkı olan bildirim burada onaylanmıyor; satır "incelenmeli" deyip
  ekrana götürüyor, çünkü farkı görerek teyit etmek orada. Ret de
  orada: ret notu müşteriye gösteriliyor ve zorunlu.
*/

const TZ = "Europe/Istanbul";
const PENDING_STATES = new Set(["creating", "inviting_owner", "waiting_owner"]);
const ODEYEN_DURUMLAR = new Set(["active", "past_due"]);

type Tone = "info" | "gold" | "success" | "danger" | "brand" | "neutral";

function KisitliKonsol({ kapsam }: { kapsam: KonsolKapsami }) {
  const uygulamalar = uygulamalariSuz(konsolUygulamalari(), kapsam).filter((u) => u.key !== "home");
  return (
    <GenelBakis baslik={selamlama().selam} sinif="konsol-ana">
      <ListeIzgarasi etiket="Konsol alanlarınız">
        <ListeKarti baslik="Konsol alanlarınız" alt="Size açık olan bölümler; yetkiyi tam yetkili bir kurucu Sistem → Ayarlar'dan değiştirir." bos="Size açık bir konsol alanı yok." sayi={uygulamalar.length}>
          {uygulamalar.map((u) => (
            <ListeSatiri key={u.key} href={u.href} baslik={u.label}
              alt={KONSOL_ALANLARI.find((a) => a.kod === u.key)?.aciklama} />
          ))}
        </ListeKarti>
      </ListeIzgarasi>
    </GenelBakis>
  );
}

function selamlama() {
  const now = new Date();
  const saat = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
  const selam = saat < 5 ? "İyi geceler" : saat < 12 ? "Günaydın" : saat < 18 ? "İyi günler" : saat < 23 ? "İyi akşamlar" : "İyi geceler";
  return { selam };
}

/*
  BAŞLIĞIN ÜSTÜNDEKİ TARİH VE ALTINDAKİ ÖZET CÜMLESİ KALDIRILDI
  (14.10.2026, kurum sahibinin isteği).

  Tarih üst çubukta zaten yazıyor (os-status saati), yani masaüstünde
  aynı bilgi iki yerdeydi. Özet cümlesi de ("Bugün 2 kurulum bekliyor…")
  hemen altındaki "Bugün neye bakmalı?" kartının söylediğini tekrar
  ediyordu; kart sayıları satır satır veriyor, cümle onları virgülle
  birleştiriyordu.

  NOT: üst çubuğun saati 900px altında gizleniyor (.os-clock), yani
  telefonda tarih artık hiçbir yerde yazmıyor. Bilerek böyle; geri
  istenirse etiketi yalnızca dar ekranda göstermek yeterli.
*/
// Şimdiki zaman bileşen dışında okunur (react-hooks/purity).
const hatirlatmalariHesapla = (lisanslar: RenewalLicense[], kurumlar: RenewalOrganization[]) =>
  renewalReminders(lisanslar, kurumlar, Date.now());

type Kurum = { id: string; name: string; display_name: string | null; kind: string | null; provisioning_state: string; contact_phone: string | null; grup_markasi: boolean | null };
type CekirdekLisans = { organization_id: string; license_status: string; monthly_fee: number | null; user_limit: number; storage_limit_mb: number };
type UrunLisansi = { organization_id: string; product: string; status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null };
type BekleyenOdeme = { id: string; organization_id: string; product: string | null; plan_code: string | null; amount: number | null; currency: string | null; payment_method: string | null; created_at: string };
type BekleyenSozlesme = { id: string; contract_no: string | null; customer_name: string | null; amount: number | null; currency: string | null; created_at: string };
type KurulumKaydi = { id: number | string; organization_id: string; action: string; result: string | null; state: string | null; created_at: string };

export async function KonsolAnaSayfa() {
  const { supabase, userId, isPlatformOwner, konsolKapsami } = await getPanelContext();
  /* Kabuk da eliyor (layout.tsx) ama yetki üç yerde birden duruyor
     (AGENTS.md): kabuğun bir gün değişmesi bu sayfayı açmamalı. */
  if (!isPlatformOwner) notFound();
  /*
    KISITLI KURUCU (02.11.2026, lib/konsol-alanlari). Bu ekran bütün
    alanların sayılarını taşıyor (gelir, ödeme kuyruğu, destek, kurulum);
    her bölümü ayrı ayrı süzmek yerine kısıtlı kurucuya yalnızca kendi
    alanlarının girişleri gösteriliyor.
  */
  if (konsolKapsami !== null) return <KisitliKonsol kapsam={konsolKapsami} />;
  const admin = createAdminClient();
  /* Uygulanmamış migration (02.11.2026, ayrıntı Sistem sağlığı → Veritabanı).
     Şimdi başlatılıyor, Sorunlar kuyruğunu kurarken bekleniyor: öteki
     okumalarla paralel koşsun. Denetim kurulmamışsa ya da okunamazsa burada
     satır çıkmıyor; sağlık ekranı onu ayrıca söylüyor. */
  /* Okuma başına süre (lib/sure-olcumu): paralelleştirmeden sonra da p75
     ~0,9 sn kaldı; süre tek bir okumada. Eşiği aşan açılış günlüğe
     "[süre] konsol-ana …" satırı yazıyor, en yavaş okuma başta. */
  const sure = sureOlcer("konsol-ana");
  const semaIstegi = admin
    ? Promise.resolve(admin.rpc("platform_sema_eksikleri", { p_izler: MIGRATION_IZLERI })).catch(() => null)
    : Promise.resolve(null);

  /*
    TEK TUR (02.11.2026, hızlandırma). Ana sayfa on ayrı turda bekliyordu:
    kiracılar, sonra sözleşme/kurulum/proforma, sonra ödeme sorunları,
    sonra yeni müşteri sayımı, sonra takipler, sonra destek, sonra grafik,
    sonra köprüler — hiçbiri öncekinin SONUCUNA bakmıyordu (canlıda p75
    ~230 ms, köprüler yavaşken çok daha fazla). Bağımsız okumaların hepsi
    burada aynı anda BAŞLIYOR ve kullanıldıkları yerde bekleniyor; sayfa
    en yavaş tek okuma kadar sürüyor. Supabase sorgusu tembel: then
    çağrılmadan istek gitmiyor, o yüzden Promise.resolve/Promise.all ile
    sarmalanıyor. Kiracılara ya da ödemelere bağlı olanlar (havale
    denetimi, sorunlar) yerinde kalıyor.
  */
  const ayBasi = `${todayInIstanbul().slice(0, 7)}-01T00:00:00+03:00`;
  const seriBasi = seriBaslangici();
  /*
    KÜÇÜK OKUMALAR TEK ÇAĞRIDA (03.11.2026, migration 20261103065144).
    Tek tura indirmek yetmedi: otuz beşe yakın istek aynı anda gidince
    veritabanı havuzunda sıra bekliyordu — tek isteğin olağan süresi
    ~85 ms iken buradaki en basit sayım 300–490 ms sürüyordu. On dört
    küçük okuma (iş listeleri, sayımlar, grafik penceresi, ad) artık
    platform_konsol_ana_ozeti'nde.

    Çağrı düşerse (migration henüz uygulanmamış, ya da başka bir hata)
    aşağıdaki her okuma ESKİ sorgusuna dönüyor: ekran yavaş açılır ama
    yanlış açılmaz. Eski sorgu yalnızca o durumda başlıyor (`yedek`).
  */
  type Ozet = Record<string, unknown> & { yeni_kurum: number; yeni_abone: number; ad: string | null };
  const ozetIstegi: Promise<Ozet | null> = Promise.resolve(supabase.rpc("platform_konsol_ana_ozeti", {
    p_ay_basi: ayBasi, p_seri_basi: seriBasi, p_bugun: todayInIstanbul(), p_destek_durumlari: [...YANIT_BEKLEYEN_DURUMLAR],
  })).then(({ data, error }) => {
    if (error) {
      console.error("[konsol] ana sayfa özeti okunamadı, eski okumalara dönülüyor", error.code, error.message);
      return null;
    }
    return data as Ozet;
  }, (hata: unknown) => {
    console.error("[konsol] ana sayfa özeti okunamadı, eski okumalara dönülüyor", hata);
    return null;
  });
  /* Özetin bir parçası, PostgREST yanıtının biçiminde; özet yoksa eski sorgu. */
  const yedek = <A, B>(al: (o: Ozet) => A, eski: () => PromiseLike<B>): Promise<A | B> =>
    ozetIstegi.then<A | B>((o) => (o ? al(o) : eski()));
  const liste = (o: Ozet, anahtar: string) => ({ data: o[anahtar] as Record<string, unknown>[], error: null });
  const sozlesmeIstegi = Promise.all([
    yedek((o) => liste(o, "sozlesmeler"), async () => admin
      ? admin.from("platform_subscription_requests").select("id,contract_no,customer_name,amount,currency,created_at")
          .eq("status", "pending").order("created_at", { ascending: false })
      : Promise.resolve({ data: null, error: null })),
    yedek((o) => liste(o, "kurulum"), async () => admin
      ? admin.from("provisioning_audit_logs").select("id,organization_id,action,result,state,created_at").order("created_at", { ascending: false }).limit(6)
      : Promise.resolve({ data: [], error: null })),
    /*
      BEKLEYEN PROFORMALAR (29.10.2026): gönderilmiş, ödemesi gelmemiş
      belgeler. Hepsi, sınırsız: bekleyen proforma bir iş kalemi ve
      sayısı küçük. Geçerliliği en yakın olan başta — kurucunun
      aradığı "hangisinin süresi dolmak üzere".
    */
    yedek((o) => liste(o, "proformalar"), async () => admin
      /* sınırsız-tamam: bekleyen proforma kuyruğu — kurucunun temizlediği iş listesi, sayısı küçük. */
      ? admin.from("platform_proformalari").select("id,proforma_no,musteri_adi,product,toplam,para_birimi,gecerlilik_tarihi,gonderildi_at,bildirildi_at,gonderim_hatasi")
          .eq("durum", "bekliyor").order("gecerlilik_tarihi", { ascending: true })
      : Promise.resolve({ data: null, error: null })),
  ]);
  /* Grup içi de ayrı ölçülüyor: ilk ölçümde bu grup ~470 ms ile en yavaştı
     ve beş okumadan hangisi olduğu görünmüyordu. */
  const odemeIstegi = Promise.all([
    sure.olc("odeme_olaylari", getPaymentIncidents()),
    admin
      ? sure.olc("bekleyen_krediler", bekleyenKrediler(admin)).then((veri) => ({ veri, hata: null as string | null }))
          .catch((hata: unknown) => ({ veri: [], hata: hata instanceof Error ? hata.message : String(hata) }))
      : Promise.resolve({ veri: [], hata: null as string | null }),
    /* Panel etkinliği (lib/musteri-etkinligi-oku): okunamazsa harita null, risk sekmesi "okunamadı". */
    sure.olc("musteri_etkinligi", musteriEtkinlikleri()),
    /* Askıdaki lisanslar (02.11.2026, lib/askidakiler): kuyruk "açalım mı, kapatalım mı".
       sınırsız-tamam: askıdaki lisans sayısı küçük ve kurucunun temizlediği bir iş listesi. */
    yedek((o) => liste(o, "aski_cekirdek"), () => (admin ?? supabase).from("organization_licenses").select("organization_id,suspended_at,suspension_reason").eq("license_status", "suspended")),
    /* sınırsız-tamam: aynı kuyruk, ek ürünler. */
    yedek((o) => liste(o, "aski_urun"), () => (admin ?? supabase).from("organization_product_licenses").select("organization_id,product,suspended_at,suspension_reason").eq("status", "suspended")),
  ]);
  const yeniSayimIstegi = yedek(
    (o) => ({ count: o.yeni_kurum as number | null, error: null as { message: string } | null }),
    () => (admin ?? supabase).from("organizations").select("id", { count: "exact", head: true })
      .gte("created_at", ayBasi).neq("kind", "internal").eq("grup_markasi", false));
  const yeniAboneIstegi = yedek(
    (o) => ({ count: o.yeni_abone as number | null, error: null as { message: string } | null }),
    async () => admin
      ? admin.from("product_subscribers").select("id", { count: "exact", head: true }).is("kurum_id", null).gte("created_at", ayBasi)
      : Promise.resolve({ count: null, error: { message: "sunucu anahtarı yok" } }));
  /* sınırsız-tamam: zamanı gelen takipler — kurucunun temizlediği iş listesi, sayısı küçük. */
  const takipIstegi = yedek(
    (o) => ({ ...liste(o, "takipler"), error: null as { code?: string; message: string } | null }),
    () => supabase.from("platform_musteri_notlari")
      .select("id,organization_id,metin,takip_tarihi")
      .lte("takip_tarihi", todayInIstanbul())
      .is("tamamlandi_at", null)
      .order("takip_tarihi", { ascending: true }));
  /* sınırsız-tamam: yanıt bekleyen talepler — kurucunun temizlediği iş listesi, sayısı küçük. */
  const destekIstegi = yedek((o) => liste(o, "destek"), () => supabase.from("support_tickets")
    .select("id,subject,priority,status,last_message_at,organization_id")
    .in("status", YANIT_BEKLEYEN_DURUMLAR)
    .order("last_message_at", { ascending: true }));
  const grafikIstegi = Promise.all([
    /* sınırsız-tamam: 14 günlük grafik penceresi; okuma tarihle sınırlı. */
    yedek((o) => liste(o, "havaleler"), () => supabase.from("organization_payment_requests").select("id,organization_id,product,amount,payment_method,reviewed_at")
      .eq("status", "approved").gte("reviewed_at", seriBasi)),
    yedek((o) => liste(o, "bireysel"), () => supabase.from("subscriber_payments").select("id,amount,paid_at").gte("paid_at", seriBasi)),
  ]);
  /* Köprü sağlığı 60 sn önbellekte (lib/kopru-sagliklari); Sistem sağlığı canlı okuyor. */
  const kopruSagligi = kopruSagliklari();
  const kopruIstegi = Promise.all([
    kopruSagligi.then((k) => k.arvolab),
    kopruSagligi.then((k) => k.arc),
    kopruSagligi.then((k) => k.randevu),
    /*
      Kopyaların KENDİSİ okunuyor, ürün başına TEK sorguyla. Köprü sağlığı
      (yukarıdaki üçü) "çağrı gidiyor mu" diyor; kopyanın bayat olup
      olmadığını söylemiyor. AkademikMerkez'de köprü sağlıklıyken kopya
      altı gün eski kaldı ve bunu hiçbir ekran göstermiyordu.
    */
    arvolabKopyalari(),
    arcKopyalari(),
    randevuKopyalari(),
  ]);
  /* Ölçüm başlangıç anında bağlanıyor: süre okumanın kendisi, bekleme yeri değil. */
  for (const [ad, is] of Object.entries({
    ozet: ozetIstegi, sema: semaIstegi, sozlesme_kurulum_proforma: sozlesmeIstegi, odeme_kredi_etkinlik_aski: odemeIstegi,
    yeni_kurum: yeniSayimIstegi, yeni_abone: yeniAboneIstegi, takip: takipIstegi, destek: destekIstegi,
    grafik: grafikIstegi, kopru_kopya: kopruIstegi,
  } as Record<string, PromiseLike<unknown>>)) void sure.olc(ad, is).catch(() => {});

  const [
    { data: kiraciSatirlari, error: kiraciHatasi },
    { data: urunSatirlari, error: urunHatasi },
    bekleyenOdeme,
    // hata-tamam: kurucunun kendi adı (selamlama); düşerse selam adsız kalır
    { data: profil },
    // hata-tamam: kurucunun kendi personel kaydı, yine yalnızca ad için
    { data: personel },
    // hata-tamam: depolamaKullanimi bir promise; düşerse Promise.all REDDEDİLİR ve sayfa hata ekranına gider, sessizce sıfır göstermez
    { data: depolamalar },
  ] = await sure.olc("kiraci_urun_depolama", Promise.all([
    /*
      KURUM, LİSANS VE AKTİF ÜYE SAYISI TEK GÖRÜNÜMDEN (12.10.2026).

      Üçü ayrı okunuyordu ve ortadaki en pahalısıydı: bütün
      kiracıların BÜTÜN üyelikleri, yalnızca kurum başına "kaç aktif
      üye" sayısı için. O tablo personel giriş çıkışıyla büyüyor;
      satır tavanına çarpıldığı gün kota rozetleri sessizce "limit
      aşılmadı" derdi. platform_kiraci_liste kiracı başına tek satır
      veriyor, sayım yan sorguda.
    */
    /* Kiracı başına tek satır, yine de sayfalı: 1.000 müşteride tavan
       sessizce vurur ve konsolun bütün sayıları o gün eksilirdi. */
    tumSatirlar<Kurum & { license_status: string; monthly_fee: number | null; user_limit: number; storage_limit_mb: number; aktif_uye: number; current_period_end: string | null; trial_ends_at: string | null }>(
      "kiracılar",
      (bas, son) => supabase.from("platform_kiraci_liste")
        .select("id,name,display_name,kind,provisioning_state,contact_phone,license_status,monthly_fee,user_limit,storage_limit_mb,aktif_uye,grup_markasi,current_period_end,trial_ends_at")
        .order("name")
        .range(bas, son))
      .then((data) => ({ data, error: null as { message: string } | null }))
      .catch((hata: unknown) => ({ data: null, error: { message: hata instanceof Error ? hata.message : String(hata) } })),
    /*
      ÜRÜN LİSANSLARI SAYFA SAYFA. Bu tablo kiracı × ürün büyüyor
      (bugün dört ürün) ve PostgREST yanıtı 1.000 satırda kesip bunu
      SÖYLEMİYOR (lib/rapor-okuma). Tavana çarpıldığı gün konsolun
      aylık geliri, lisans sayıları ve yenileme hatırlatmaları
      sessizce EKSİLİRDİ — hem de kurucunun "bugün neye bakmalı"
      dediği ekranda. Yaklaşık 250 müşteride çarpılıyor.

      `tumSatirlar` sınıra ulaşınca fırlatıyor: eksik bir toplam
      göstermektense ekranı hatayla açmak doğrusu.
    */
    tumSatirlar<UrunLisansi>("ürün lisansları", (bas, son) =>
      supabase.from("organization_product_licenses")
        .select("organization_id,product,status,monthly_fee,current_period_end,trial_ends_at")
        .order("organization_id")
        .range(bas, son))
      /*
        Hata YUTULMUYOR, ÇEVRİLİYOR: `tumSatirlar` sınıra ulaşınca ya
        da sorgu düşünce fırlatıyor; bu sayfa ise okunamayan bölümü
        "okunamadı" diye gösterip gerisini çiziyor. Fırlatmayı olduğu
        gibi bırakmak, tek bir okuma yüzünden kurucunun bütün ana
        sayfasını hata ekranına çevirirdi.
      */
      .then((data) => ({ data, error: null as { message: string } | null }))
      .catch((hata: unknown) => ({ data: null, error: { message: hata instanceof Error ? hata.message : String(hata) } })),
    /* Bekleyenlerin TAMAMI, sınırsız: kuyruk kurucunun bugünkü işi ve
       satır satır gösteriliyor (Ödeme onayları ekranındaki kuralın aynısı). */
    yedek((o) => liste(o, "bekleyen_odemeler"), () => supabase.from("organization_payment_requests").select("id,organization_id,product,plan_code,amount,currency,payment_method,created_at")
      .eq("status", "pending").order("created_at", { ascending: false })),
    yedek((o) => ({ data: { full_name: o.ad } }), () => supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle()),
    /* Ad birden çok yerde olabilir ve hiçbiri zorunlu değil; davet
       akışından geçmeden açılmış bir hesabın profiles kaydı yok ve
       selamlama adsız kalıyordu. */
    yedek((o) => ({ data: { full_name: o.ad } }), () => supabase.from("hr_employees").select("full_name").eq("user_id", userId).limit(1).maybeSingle()),
    /* Depolama storage.objects'ten geliyor; o tablo PostgREST'e açık değil
       ve olmamalı. Fonksiyon yalnızca kurum başına TOPLAM döndürüyor. */
    /* Depolama toplamı 5 dk önbellekte (lib/lisans-olcumleri): storage.objects'i taramak her sayfa açılışında tekrar ediliyordu. */
    depolamaKullanimi().then((data) => ({ data })),
  ]));

  /* Sözleşme kuyruğu ve kurulum günlüğü yalnızca sunucu anahtarıyla
     okunuyor (sozlesmeler sayfasındaki kuralın aynısı). Anahtar yoksa
     satır hiç çizilmiyor: "0 sözleşme bekliyor" yazmak, okunamayan bir
     kuyruğu boş göstermek olurdu. */
  const [{ data: sozlesmeSatirlari, error: sozlesmeHatasi }, { data: kurulumKayitlari, error: kurulumHatasi }, { data: proformaSatirlari, error: proformaHatasi }] = await sozlesmeIstegi;
  /*
    ÖDEME VE KREDİ SORUNLARI da kuyrukta (29.10.2026): PayTR'nin ödeyip
    kaydı oluşmayan bildirimleri ve ödenip ArvoLab'a yüklenemeyen AI
    kredisi. İkisi de yalnızca Sistem sağlığında yazıyordu; ana ekran
    "Her kiracı yolunda" derken müşteri ödediği krediyi kullanamıyordu.
    getPaymentIncidents okunamazsa kendi içinde boş döner (günlüğe yazar);
    kredi okuması düşerse satırı "okunamadı" olarak işaretliyoruz.
  */
  const [odemeOlaylari, krediSonucu, etkinlik, askiCekirdek, askiUrun] = await odemeIstegi;

  /*
    YANIT BEKLEYEN DESTEK TALEPLERİ (02.11.2026): kurumların açtığı
    talepler konsolun hiçbir yerinde görünmüyordu (lib/destek-kuyrugu).
    Kurucunun oturumuyla; RLS kurucuya bütün kurumların talebini açıyor.
  */
  /*
    TAKİP EDİLECEKLER (02.11.2026): müşteri notlarından takip tarihi
    gelmiş ya da geçmiş, tamamlanmamış olanlar (migration 20261102131114).
    Tablo henüz kurulmadıysa (PGRST205 / 42P01) sekme hiç çizilmiyor:
    migration uygulanmadan ana ekranın en üstünde "okunamadı" uyarısı
    çıkması yanlış alarm olurdu. Başka her hata "okunamadı".
  */
  /*
    BU AYIN YENİ MÜŞTERİSİ (02.11.2026): şeritte, aylık rapora bağlantı.
    Türkiye ayının başından (UTC'de ayın ilk gecesi 00:00–03:00 arası
    önceki aya düşmesin). Arvo'nun kendisi ve grup markaları müşteri değil
    (lib/kurum-turu kuralının sorgu karşılığı). Sayım head sorgusuyla.
  */
  const yeniSayimi = await yeniSayimIstegi;
  if (yeniSayimi.error) console.error("[konsol] bu ayın yeni müşteri sayısı okunamadı", yeniSayimi.error.message);
  /* Bireysel aboneler de: aylık rapor "yeni müşteri"ye ikisini birden sayıyor; şeritte
     yalnızca kurum sayılınca bir tık ötedeki rapor başka sayı yazıyordu. */
  const yeniAboneSayimi = await yeniAboneIstegi;
  if (yeniAboneSayimi.error) console.error("[konsol] bu ayın yeni abone sayısı okunamadı", yeniAboneSayimi.error.message);
  const yeniOkunamadi = Boolean(yeniSayimi.error || yeniAboneSayimi.error);

  /* sınırsız-tamam: zamanı gelen takipler — kurucunun temizlediği iş listesi, sayısı küçük. */
  const takipSonucu = await takipIstegi;
  const takipKurulu = !(takipSonucu.error && (takipSonucu.error.code === "PGRST205" || takipSonucu.error.code === "42P01"));
  const takipHatasi = takipKurulu ? takipSonucu.error : null;
  const takipler = (takipSonucu.data ?? []) as { id: string; organization_id: string; metin: string; takip_tarihi: string }[];

  /* sınırsız-tamam: yanıt bekleyen talepler — kurucunun temizlediği iş listesi, sayısı küçük. */
  const { data: destekSatirlari, error: destekHatasi } = await destekIstegi;

  /*
    GRAFİĞİN TAHSİLATLARI: üç kanal, PENCEREYLE sınırlı.

    Sınır `.limit()` DEĞİL tarih: son 28 gün (14 gün + kıyas için önceki
    14 gün). Satır sayısıyla sınırlamak, yoğun bir haftada grafiği
    sessizce eksiltirdi — konsolun "Tahsil edildi" rakamı 22.09.2026'da
    tam olarak böyle yanlış çıkmıştı. Zaman penceresi hem sınırlı hem
    eksiksiz: pencerenin içindeki her kayıt geliyor.

    İki kaynak, Finans sayfasındakiyle aynı: onaylı kurum ödeme istekleri
    (havale VE PayTR) ve bireysel abone ödemeleri. billing_subscriptions
    eskiden "kart kanalı" diye üçüncü kaynak olarak ekleniyordu; oysa her
    kurum ödemesinin aktivasyon ikizi — grafik her ödemeyi iki kez
    çiziyordu (14.10.2026, 20261014062145).
  */
  const [{ data: havaleler, error: havaleHatasi }, { data: bireyselOdemeler, error: bireyselHatasi }] = await grafikIstegi;

  const [arvolab, arc, randevu, labKopya, arcKopya, rdvKopya] = await kopruIstegi;

  /* Görünümün satırı hem kurumu hem lisansı taşıyor; ikisi burada
     ayrılıyor. Lisans alanı boş olan kurum (tetikleyici lisansı
     açmamışsa) kota ve ödeyen hesabına girmiyor — eski davranış da
     böyleydi, çünkü o kurumun lisans SATIRI yoktu. */
  /*
    OKUNAMAYAN SORGU "SIFIR" DEĞİLDİR (15.10.2026).

    Supabase istemcisi hata fırlatmıyor, `error` alanına yazıyor; bu dört
    okumanın hatası alınmıyordu. Kiracı listesi düşerse kurucunun ANA
    EKRANI "Müşteri kurum 0 / 0", "Beklenen aylık ₺0,00" ve "Grup markası
    0" diyor; tahsilat serisi düşerse grafik "Son 14 günde tahsilat yok"
    diyor. Hepsi emin emin yanlış. Kiracı panelinin ana ekranı bu kuralı
    zaten uyguluyordu (app/panel/page.tsx, failedQueries → GenelBakis
    uyarısı); konsolun ana ekranı dışarıda kalmıştı.
  */
  const okunamayan = ([
    ["Kiracı listesi", kiraciHatasi],
    ["Ürün lisansları", urunHatasi],
    ["Ödeme bildirimleri", bekleyenOdeme.error],
    ["Sözleşme onayları", sozlesmeHatasi],
    ["Kurum ödemeleri", havaleHatasi],
    ["Bireysel abone ödemeleri", bireyselHatasi],
    ["Kurulum günlüğü", kurulumHatasi],
    ["Bekleyen proformalar", proformaHatasi],
    ["Destek talepleri", destekHatasi],
    ["Takip notları", takipHatasi],
  ] as [string, { message: string } | null][])
    .filter((satir): satir is [string, { message: string }] => Boolean(satir[1]));
  if (okunamayan.length)
    console.error("[konsol] ana ekran sorguları okunamadı", okunamayan.map(([ad, h]) => `${ad}: ${h.message}`));

  const kiracilar = (kiraciSatirlari ?? []) as unknown as (Kurum & {
    current_period_end: string | null; trial_ends_at: string | null;
    license_status: string | null; monthly_fee: number | null;
    user_limit: number | null; storage_limit_mb: number | null; aktif_uye: number;
  })[];
  const kurumlar = kiracilar as Kurum[];
  /*
    KİRACI (Arvo'nun kendisi hariç) ile MÜŞTERİ (grup markaları da hariç)
    ayrı: ortak kural lib/kurum-turu'nda. Ana ekranın "Müşteri kurum"
    sayısı 14.10.2026'ya kadar kiracıları sayıyordu ve grup markaları da
    müşteri görünüyordu — aynı soruya Müşteriler ekranı 2, ana ekran 4
    diyordu. Gelir hesabı zaten doğru kuralı kullanıyordu, yalnızca
    başlıktaki sayı ayrışmıştı.
  */
  const kiracilarListesi = kurumlar.filter((kurum) => kurum.kind !== "internal");
  const musteriler = kurumlar.filter(musteriMi);
  const grupMarkalari = kurumlar.filter((kurum) => kurumTuru(kurum) === "grup");
  const kurumAdi = new Map(kurumlar.map((kurum) => [kurum.id, kurum.display_name || kurum.name]));
  const askiHatasi = askiCekirdek.error ?? askiUrun.error;
  const askiMusterileri = new Set(kurumlar.filter((k) => musteriMi(k)).map((k) => k.id));
  const askidakiler = askiHatasi ? [] : askidakiKurumlar([
    ...((askiCekirdek.data ?? []) as { organization_id: string; suspended_at: string | null; suspension_reason: string | null }[]).map((s) => ({ ...s, product: "arvoos" })),
    ...((askiUrun.data ?? []) as AskiSatiri[]),
  ], (id) => askiMusterileri.has(id), simdi());

  const aktifUye = new Map(kiracilar.map((satir) => [satir.id, Number(satir.aktif_uye)]));
  const depolamaBayt = new Map(
    ((depolamalar ?? []) as { organization_id: string; bytes: number }[]).map((satir) => [satir.organization_id, Number(satir.bytes ?? 0)]),
  );
  const cekirdek: CekirdekLisans[] = kiracilar
    .filter((satir) => satir.license_status !== null && satir.user_limit !== null && satir.storage_limit_mb !== null)
    .map((satir) => ({
      organization_id: satir.id,
      license_status: satir.license_status!,
      monthly_fee: satir.monthly_fee,
      user_limit: Number(satir.user_limit),
      storage_limit_mb: Number(satir.storage_limit_mb),
    }));
  const kota = new Map(cekirdek.map((lisans) => [lisans.organization_id, kotaDurumu({
    organizationId: lisans.organization_id,
    kullaniciSayisi: aktifUye.get(lisans.organization_id) ?? 0,
    kullaniciLimiti: lisans.user_limit,
    depolamaBayt: depolamaBayt.get(lisans.organization_id) ?? 0,
    depolamaLimitiMb: lisans.storage_limit_mb,
  })]));

  const kullanimda = musteriler.filter((kurum) => kurum.provisioning_state === "active").length;
  /*
    Beklenen aylık gelir LİSANSLARDAN hesaplanıyor, abonelik kaydından
    değil: o tabloya satır ancak bir ödeme onaylandığında düşüyor, yani
    elle lisans verilmiş kurumlar hiç sayılmıyordu. Denemedekiler dışarıda:
    henüz ödemiyorlar, beklenen gelire katmak raporu şişirir.
  */
  /* Gelire yalnızca gerçek müşteri girer: grup markalarının (AkademikMerkez,
     ArvoCulture) ücreti grup içi değer, müşteri geliri değil (lib/kurum-turu). */
  const kiraciMi = new Set(kiracilarListesi.map((kurum) => kurum.id));
  const musteriKimlikleri = new Set(musteriler.map((kurum) => kurum.id));
  const urunler = (urunSatirlari ?? []) as UrunLisansi[];
  const aylikGelir =
    cekirdek.filter((satir) => musteriKimlikleri.has(satir.organization_id) && ODEYEN_DURUMLAR.has(satir.license_status))
      .reduce((toplam, satir) => toplam + Number(satir.monthly_fee ?? 0), 0)
    + urunler.filter((satir) => musteriKimlikleri.has(satir.organization_id) && ODEYEN_DURUMLAR.has(satir.status))
      .reduce((toplam, satir) => toplam + Number(satir.monthly_fee ?? 0), 0);

  const hatirlatmalar = hatirlatmalariHesapla(urunler as RenewalLicense[], kurumlar as RenewalOrganization[]);
  const odemeler = (bekleyenOdeme.data ?? []) as BekleyenOdeme[];
  /*
    TUTAR DENETİMİ KUYRUKTA DA ÇALIŞIYOR (lib/beklenen-odeme). Tek
    tıkla onay yalnızca beklenenle UYUŞAN bildirimde var; farkı olan
    satır "İncele" diyerek ekrana götürüyor, çünkü farkı görerek teyit
    etmek orada (payments/karar-formu). Okuma bekleyen kuyruk kadar
    küçük ve kurum kimlikleriyle sınırlı.
  */
  const odemeDenetimleri = await sure.olc("havale_denetimi", havaleDenetimleri(supabase, odemeler.map((o) => ({
    id: o.id, organization_id: o.organization_id, product: o.product, plan_code: o.plan_code,
    /* Tutarsız bildirim yoktur: sütun NOT NULL değil ama bildirim
       tutarsız gelirse denetim onu 0 ile karşılaştırıp fark yazar —
       yani sessizce "uyumlu" saymaz. */
    amount: Number(o.amount ?? 0),
  }))));
  /** Sunucu anahtarı yoksa null: okunamadı, boş değil. */
  const sozlesmeler = admin ? ((sozlesmeSatirlari ?? []) as BekleyenSozlesme[]) : null;

  /*
    Grafiğin dilimleri: tarih listesi + AĞIRLIK olarak tutar. gunlukSeri
    ağırlıksız çağrılsaydı grafik "kaç ödeme" gösterirdi; kurucunun
    sorduğu "ne kadar tahsil edildi".
  */
  type Havale = { id: string; organization_id: string; product: string | null; amount: number | null; payment_method: string | null; reviewed_at: string | null };
  const tahsilatKayitlari = [
    ...((havaleler ?? []) as Havale[]).map((satir) => ({
      id: `k-${satir.id}`, tarih: satir.reviewed_at, tutar: Number(satir.amount ?? 0),
      ad: kurumAdi.get(satir.organization_id) ?? "Kurum",
      alt: [satir.product ? productName(satir.product) : null, satir.payment_method === "paytr" ? "Kart (PayTR)" : "Havale/EFT"].filter(Boolean).join(" · "),
      href: `/panel/platform/musteriler/${satir.organization_id}`,
    })),
    ...((bireyselOdemeler ?? []) as { id: string; amount: number | null; paid_at: string | null }[]).map((satir) => ({
      id: `b-${satir.id}`, tarih: satir.paid_at, tutar: Number(satir.amount ?? 0),
      ad: "Bireysel abone", alt: "Kart (PayTR)", href: "/panel/platform/subscribers",
    })),
  ].filter((satir) => satir.tarih);
  const tahsilatSerisi = gunlukSeri(
    tahsilatKayitlari.map((satir) => satir.tarih as string),
    simdi(),
    14,
    tahsilatKayitlari.map((satir) => satir.tutar),
  );

  const { selam } = selamlama();
  const ad = formatPersonName(
    (profil?.full_name as string | null | undefined) || (personel?.full_name as string | null | undefined),
  ).split(" ")[0];

  /*
    Kopyası konsoldan farklı erişim veren kiracılar. Yalnızca MÜŞTERİ
    kurumları: Arvo'nun kendi kurumu ürünlerin kopyasında bulunmaz ve her
    açılışta listeye düşerdi.
  */
  const bayatKopyalar = eskiKopyalar(
    // Grup markaları da gerçek kiracı: kopyaları denetimde kalıyor (yalnızca Arvo'nun kendisi dışarıda).
    urunler.filter((satir) => kiraciMi.has(satir.organization_id)),
    { arvolab: labKopya, arc: arcKopya, randevu: rdvKopya },
  );

  const kopruler = [
    arvolab?.broken
      ? {
          ad: "ArvoLab köprüsü",
          not: arvolab.permanent
            ? "Anahtar eksik ya da iki tarafta farklı; bireysel abonelikler denetlenemiyor."
            : "ArvoLab, ArvoOS'a ulaşamıyor; kullanıcılar engellenmiyor ama abonelik denetimi durdu.",
        }
      : null,
    !arc.ok ? { ad: "ArvoARC köprüsü", not: arc.error ? `Bağlanılamadı: ${arc.error}` : `Tanımlı olmayan değişkenler: ${arc.missing.join(", ")}` } : null,
    !randevu.ok ? { ad: "ArvoCal köprüsü", not: randevu.error ? `Bağlanılamadı: ${randevu.error}` : `Tanımlı olmayan değişkenler: ${randevu.missing.join(", ")}` } : null,
  ].filter(Boolean) as { ad: string; not: string }[];


  /* Dikkat isteyen kiracılar: kurulumu hatada kalan ya da kotasını aşan.
     BÜTÜN kiracılar üzerinden: bozuk kurulan ya da kotasını aşan bir grup
     markası da kurucunun işidir, müşteri olmaması onu ilgisiz yapmıyor. */
  const dikkatliler = kiracilarListesi
    .filter((kurum) => kurum.provisioning_state === "failed" || kota.get(kurum.id)?.durum === "asildi")
    .map((kurum) => ({
      id: kurum.id,
      ad: kurum.display_name || kurum.name,
      sebep: kurum.provisioning_state === "failed"
        ? "Kurulum hatası"
        : kota.get(kurum.id)?.kullanici.asildi ? "Kullanıcı limiti aşıldı" : "Depolama limiti aşıldı",
    }));
  const kurulumdakiler = kiracilarListesi.filter((kurum) => PENDING_STATES.has(kurum.provisioning_state));

  /*
    SORUNLAR TEK SEKMEDE: kurulum hatası, kota aşımı ve bayat ürün
    kopyası. Bayat kopya eskiden köprü uyarılarının arasında, sayfanın en
    üstünde kırmızı bir PARAGRAFTI ve üç kurumdan sonrası "(ve 2 tane
    daha)" diye kesiliyordu; şimdi her kiracı kendi satırında ve o
    kiracının dosyasına gidiyor. Köprü kopması yerinde kaldı: o tek bir
    kiracının değil bütün ürünün sorunu.
  */
  const semaSonucu = await semaIstegi;
  const eksikMigrationlar = [...new Set(((semaSonucu?.error ? [] : semaSonucu?.data) ?? []).map((e: { eksik_migration: string }) => e.eksik_migration))].sort();
  /* Denetim okunamadıysa (işlevin olmaması dahil) kuyruk bunu söylüyor: sessizce
     boş kalması "eksik migration yok" diye okunuyordu (inceleme bulgusu, 02.11.2026). */
  const semaOkunamadi = Boolean(admin) && (semaSonucu === null || Boolean(semaSonucu.error));
  const sorunlar = [
    ...(semaOkunamadi ? [{ id: "m-denetim", href: "/panel/platform/saglik?sekme=veritabani", ad: "Migration denetimi", alt: semaSonucu?.error?.message ?? "Denetim yanıt vermedi", rozet: "Okunamadı" }] : []),
    ...eksikMigrationlar.map((ad) => ({
      id: `m-${ad}`, href: "/panel/platform/saglik?sekme=veritabani", ad: `${ad}.sql`,
      alt: "Canlı veritabanına uygulanmamış; SQL Editor'de çalıştırın", rozet: "Migration eksik",
    })),
    ...odemeOlaylari.map((olay) => ({
      id: `o-${olay.id}`,
      href: olay.organizationId ? `/panel/platform/musteriler/${olay.organizationId}?pencere=odemeler` : "/panel/platform/payments#karsiliksiz",
      ad: olay.organizationName ?? "Kurum bilinmiyor",
      alt: `PayTR ${olay.merchantOid}${olay.paymentAmount !== null ? ` · ${para(olay.paymentAmount)}` : ""}`,
      rozet: incidentLabels[olay.result] ?? "Ödeme işlenemedi",
    })),
    ...krediSonucu.veri.map((kredi) => ({
      id: `c-${kredi.siparisId}`,
      href: kredi.organizationId ? `/panel/platform/musteriler/${kredi.organizationId}?pencere=odemeler` : "/panel/platform/saglik?sekme=odeme",
      ad: kredi.organizationId ? kurumAdi.get(kredi.organizationId) ?? "Kurum" : "Bireysel abone",
      alt: `${kredi.kredi} AI kredisi ödendi, ArvoLab'a yüklenemedi`,
      rozet: "Kredi yüklenemedi",
    })),
    ...(krediSonucu.hata ? [{ id: "c-hata", href: "/panel/platform/saglik?sekme=odeme", ad: "AI kredi siparişleri", alt: krediSonucu.hata, rozet: "Okunamadı" }] : []),
    ...dikkatliler.map((kurum) => ({ id: `d-${kurum.id}`, href: `/panel/platform/musteriler/${kurum.id}`, ad: kurum.ad, alt: "Kiracı", rozet: kurum.sebep })),
    ...bayatKopyalar.map((kayit) => ({
      id: `k-${kayit.organizationId}-${kayit.product}`,
      href: `/panel/platform/musteriler/${kayit.organizationId}`,
      ad: kurumAdi.get(kayit.organizationId) ?? "Kurum",
      alt: `${productName(kayit.product)}: üründe "${kayit.kopyaDurumu}", burada "${kayit.konsolDurumu}" · lisanstan "Ürüne yeniden yansıt"`,
      rozet: "Kopya bozuk",
    })),
  ];

  /*
    Sekmeler. Kuyruk okunamadıysa sekme "okunamadı" der, boş değil:
    sıfır bir cevaptır, okunamayan sorgu cevap değildir (yukarıdaki
    `okunamayan` da aynı adı en üstte yazıyor).
  */
  const bugun = todayInIstanbul();
  /* Müşteriye ULAŞMAYAN önce (02.11.2026, lib/proforma-gonderim): bu kuyruk
     "gönderilmiş, ödemesi gelmemiş" diyordu ama gönderime hiç bakmıyordu;
     29.10–02.11 arasında kesilenler müşteriye gitmediği hâlde öyle görünüyordu. */
  const proformalar = gonderimSirasi((proformaSatirlari ?? []) as { id: string; proforma_no: string; musteri_adi: string; product: string; toplam: number; para_birimi: string | null; gecerlilik_tarihi: string; gonderildi_at: string | null; bildirildi_at: string | null; gonderim_hatasi: string | null }[])
    .map((p) => ({ ...p, kalan: gunFarki(bugun, p.gecerlilik_tarihi), gonderim: gonderimDurumu(p) }));
  const gitmeyenProforma = proformalar.filter((p) => p.gonderim !== "gitti").length;
  /*
    YENİLEME RİSKİ (02.11.2026): ArvoOS lisansı açık, yenilemesi 30 gün
    içinde ve son 7 günde panele kimse girmemiş müşteriler
    (lib/musteri-etkinligi). Müşteriler listesinin "Dikkat" sekmesindeki
    kuralın aynısı; ana ekranda da çünkü "kimi arayayım" sorusu bugünün işi.
    Grup markaları ve Arvo'nun kendisi dışarıda: ödemeyi yenileyecek
    bir müşteri değiller.
  */
  const riskliler = etkinlik.harita
    ? kiracilar
        .filter((k) => musteriMi(k))
        .map((k) => {
          const son = etkinlik.harita!.get(k.id)?.son ?? null;
          const yenileme = k.license_status === "trialing" ? k.trial_ends_at : k.current_period_end;
          const acik = k.license_status === "active" || k.license_status === "trialing" || k.license_status === "past_due";
          return { id: k.id, ad: k.display_name || k.name, son, yenileme, risk: yenilemeRiski({ acik, yenileme, son }, etkinlik.simdi) };
        })
        .filter((k) => k.risk)
        .sort((a, b) => (a.yenileme ?? "").localeCompare(b.yenileme ?? ""))
    : [];
  /*
    KURULUP KULLANILMAYANLAR (02.11.2026, lib/musteri-etkinligi
    kullanilmayanMi): denemesi boşa giden ya da ödediği hâlde panele hiç
    girilmemiş müşteriler. Yeni müşteriyi ilk haftalarda kaybetmenin en
    sık yolu bu; yenileme riskinde olanlar orada, burada tekrar edilmiyor.
  */
  const riskliIdler = new Set(riskliler.map((k) => k.id));
  const kullanmayanlar = etkinlik.harita
    ? kiracilar
        .filter((k) => musteriMi(k) && !riskliIdler.has(k.id))
        .map((k) => ({ id: k.id, ad: k.display_name || k.name, durum: k.license_status, son: etkinlik.harita!.get(k.id)?.son ?? null, kurulum: k.provisioning_state }))
        .filter((k) => kullanilmayanMi({ kurulum: k.kurulum, durum: k.durum, son: k.son }, etkinlik.simdi))
        .sort((a, b) => (a.son ?? "").localeCompare(b.son ?? "") || a.ad.localeCompare(b.ad, "tr"))
    : [];
  const destekTalepleri = kuyrukSirala((destekSatirlari ?? []) as { id: string; subject: string; priority: string; status: string; last_message_at: string; organization_id: string }[]);
  const destekAni = new Date(simdi());
  const sekmeler = [
    { ad: "Ödeme onayları", sayi: odemeler.length, hata: Boolean(bekleyenOdeme.error) },
    { ad: "Destek", sayi: destekTalepleri.length, hata: Boolean(destekHatasi) },
    ...(takipKurulu ? [{ ad: "Takip", sayi: takipler.length, hata: Boolean(takipHatasi) }] : []),
    ...(sozlesmeler ? [{ ad: "Sözleşmeler", sayi: sozlesmeler.length, hata: Boolean(sozlesmeHatasi) }] : []),
    ...(admin ? [{ ad: "Proformalar", sayi: proformalar.length, hata: Boolean(proformaHatasi) }] : []),
    { ad: "Kurulumlar", sayi: kurulumdakiler.length, hata: Boolean(kiraciHatasi) },
    { ad: "Dönemi dolanlar", sayi: hatirlatmalar.length, hata: Boolean(urunHatasi) },
    { ad: "Askıdakiler", sayi: askidakiler.length, hata: Boolean(askiHatasi) },
    { ad: "Yenileme riski", sayi: riskliler.length, hata: !etkinlik.harita || Boolean(kiraciHatasi) },
    { ad: "Kullanmayanlar", sayi: kullanmayanlar.length, hata: !etkinlik.harita || Boolean(kiraciHatasi) },
    { ad: "Sorunlar", sayi: sorunlar.length, hata: Boolean(kiraciHatasi) },
  ];
  const bekleyenIs = sekmeler.reduce((toplam, sekme) => toplam + sekme.sayi, 0);
  /* Açılışta işi olan İLK sekme: kurucu boş bir listeye inip doluyu aramasın. */
  const ilkDolu = Math.max(0, sekmeler.findIndex((sekme) => sekme.sayi > 0));

  const kurulumlar = (kurulumKayitlari ?? []) as KurulumKaydi[];
  /* Hangi kiracının kurulumu HÂLÂ hatada: rozetin tonu buna bakıyor. */
  const hatadaKalanlar = new Set(kurumlar.filter((k) => k.provisioning_state === "failed").map((k) => k.id));
  const sonTahsilatlar = [...tahsilatKayitlari]
    .sort((x, y) => (y.tarih as string).localeCompare(x.tarih as string))
    .slice(0, GENEL_BAKIS_SATIR);

  /*
    Sayılar TEK ŞERİTTE (29.10.2026). Eskiden grafiğin başlığına
    sıkıştırılmıştı ve telefonda grafiğin altına kayıyordu; "kaç iş
    bekliyor" sorusu da grafiğin değil kuyruğun sorusu.
  */
  const serit: { ad: string; deger: string; alt?: string; href: string; ton?: Tone }[] = [
    { ad: "Beklenen aylık", deger: para(aylikGelir), alt: "Ödeyen müşteri lisansları", href: "/panel/platform/billing" },
    { ad: "Müşteri kurum", deger: `${kullanimda} / ${musteriler.length}`, alt: "Kullanımda / toplam", href: "/panel/platform/musteriler?tur=kurumsal" },
    ...(grupMarkalari.length ? [{ ad: "Grup markası", deger: String(grupMarkalari.length), alt: "Müşteri sayılmaz", href: "/panel/platform/musteriler" }] : []),
    { ad: "Son 14 gün tahsilat", deger: para(tahsilatSerisi.total), alt: donemDegisimi(tahsilatSerisi, { adet: "tahsilat" }).metin, href: "/panel/platform/tahsilat" },
    { ad: "Bu ay yeni müşteri", deger: yeniOkunamadi ? "—" : String((yeniSayimi.count ?? 0) + (yeniAboneSayimi.count ?? 0)), alt: yeniOkunamadi ? "okunamadı" : `${yeniSayimi.count ?? 0} kurum · ${yeniAboneSayimi.count ?? 0} bireysel`, href: `/panel/platform/rapor?ay=${todayInIstanbul().slice(0, 7)}-01` },
    { ad: "Bekleyen iş", deger: String(bekleyenIs), alt: bekleyenIs ? "Aşağıdaki kuyrukta" : "Kuyruk boş", href: "#bugunun-isleri", ton: bekleyenIs ? "gold" : undefined },
  ];

  const bos = (metin: string) => <p className="pu-bos">{metin}</p>;
  const okunamadi = <p className="pu-bos" data-tone="danger">Bu kuyruk okunamadı; sayfayı yenileyin. Sorun sürerse Sistem → Sistem sağlığı.</p>;
  const bas = (not: string, href: string, etiket: string) => (
    <header className="phr-bas"><small>{not}</small><Link className="pu-tumu" href={href}>{etiket}</Link></header>
  );

  sure.bitir();
  return (
    <GenelBakis baslik={`${selam}${ad ? `, ${ad}` : ""}`} uyari={okunamayan.map(([ad2]) => ad2)} sinif="konsol-ana">
      {/* Köprüler sessizce kopuyor: hata yalnızca karşı taraftaki günlükte
          kalıyor ve kurucu aylar sonra fark ediyordu. Konsolun ilk ekranı
          bunu söylemeli. */}
      {kopruler.map((kopru) => (
        <p className="dash-uyari" data-tone="danger" role="alert" key={kopru.ad}>
          <span aria-hidden="true"><StgIcon name="shield" size={16} /></span>
          <span><b>{kopru.ad} yanıt vermiyor</b><small>{kopru.not}</small></span>
        </p>
      ))}

      <dl className="konsol-serit" aria-label="Konsolun sayıları">
        {serit.map((oge) => (
          <div key={oge.ad} data-tone={oge.ton}>
            <dt>{oge.ad}</dt>
            <dd><Link href={oge.href}>{oge.deger}</Link></dd>
            {oge.alt ? <small>{oge.alt}</small> : null}
          </div>
        ))}
      </dl>

      <div id="bugunun-isleri" className="konsol-isler-kap">
        <h2 className="konsol-isler-baslik">Bugünün işleri</h2>
        <TalepAkis
          kimlik="konsol-is"
          etiket="Bugünün işleri"
          sinif="konsol-isler"
          baslangic={ilkDolu}
          sekmeler={sekmeler.map((sekme) => (sekme.sayi ? `${sekme.ad} · ${sekme.sayi}` : sekme.ad))}
        >
          <section>
            {bas("Kurumların gönderdiği dekontlar ve kart ödemeleri; onaylanınca lisans açılır.", "/panel/platform/payments", "Ödeme onayları")}
            {bekleyenOdeme.error ? okunamadi : odemeler.length ? (
              <ul className="pu-liste">
                {odemeler.map((odeme) => {
                  const farklar = odemeDenetimleri.get(odeme.id)?.farklar ?? [];
                  const ayrinti = [odeme.product ? productName(odeme.product) : null, odeme.payment_method === "paytr" ? "Kart (PayTR)" : "Havale/EFT", relativeTime(odeme.created_at)].filter(Boolean).join(" · ");
                  const tutar = para(Number(odeme.amount ?? 0), odeme.currency ?? "TRY");
                  return (
                    <li key={odeme.id} className="pu-eylemli">
                      <Link href="/panel/platform/payments">
                        <span className="pu-govde">
                          <b>{kurumAdi.get(odeme.organization_id) ?? "Kurum"}</b>
                          <small>{farklar.length ? "Beklenenle uyuşmuyor · incelenmeli" : ayrinti}</small>
                        </span>
                        <span className="konsol-tutar" data-uyari={farklar.length ? "evet" : undefined}>{tutar}</span>
                      </Link>
                      {/* Farkı olan bildirim burada onaylanmıyor: teyit,
                          farkın satır satır yazılı olduğu ekranda. */}
                      {farklar.length ? null : (
                        <HizliOnay
                          paymentId={odeme.id}
                          kurumAdi={kurumAdi.get(odeme.organization_id) ?? "Kurum"}
                          tutar={tutar}
                          ayrinti={ayrinti}
                          kaydet={reviewBankTransferPayment}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : bos("İncelenecek ödeme bildirimi yok.")}
          </section>

          <section>
            {bas("Kurumların yanıt bekleyen destek talepleri; acil olan ve en uzun bekleyen başta.", "/panel/platform/destek", "Destek talepleri")}
            {destekHatasi ? okunamadi : destekTalepleri.length ? (
              <ul className="pu-liste">
                {destekTalepleri.map((t) => (
                  <li key={t.id}>
                    <Link href={`/panel/platform/destek/${t.id}`}>
                      <span className="pu-govde">
                        <b>{t.subject}</b>
                        <small>{[kurumAdi.get(t.organization_id) ?? "Kurum", ONCELIK_ADI[t.priority]].filter(Boolean).join(" · ")}</small>
                      </span>
                      <span className="status-pill" data-tone={gecikmisMi(t.last_message_at, destekAni) ? "danger" : "gold"}>
                        {beklemeSuresi(t.last_message_at, destekAni)} bekliyor
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : bos("Yanıt bekleyen destek talebi yok.")}
          </section>

          {takipKurulu ? (
            <section>
              {bas("Müşteri notlarından takip tarihi gelen ya da geçenler; tamamlayınca listeden düşer.", "/panel/platform/musteriler", "Müşteriler")}
              {takipHatasi ? okunamadi : takipler.length ? (
                <ul className="pu-liste">
                  {takipler.map((t) => {
                    const gecikme = gunFarki(t.takip_tarihi, bugun);
                    return (
                      <li key={t.id} className="pu-eylemli">
                        <Link href={`/panel/platform/musteriler/${t.organization_id}?pencere=notlar`}>
                          <span className="pu-govde">
                            <b>{kurumAdi.get(t.organization_id) ?? "Kurum"}</b>
                            <small>{t.metin.length > 120 ? `${t.metin.slice(0, 117)}…` : t.metin}</small>
                          </span>
                          <span className="status-pill" data-tone={gecikme > 0 ? "danger" : "gold"}>{gecikme > 0 ? `${gecikme} gün geçti` : "Bugün"}</span>
                        </Link>
                        <form action={notTamamla}><input type="hidden" name="id" value={t.id} /><button type="submit" className="panel-secondary konsol-takip-kapat">Tamamlandı</button></form>
                      </li>
                    );
                  })}
                </ul>
              ) : bos("Bugün takip edilecek not yok.")}
            </section>
          ) : null}

          {sozlesmeler ? (
            <section>
              {bas("İmzalanan sözleşmeler; onay aboneliği açar.", "/panel/platform/sozlesmeler", "Sözleşme onayları")}
              {sozlesmeHatasi ? okunamadi : sozlesmeler.length ? (
                <ul className="pu-liste">
                  {sozlesmeler.map((istek) => (
                    <li key={istek.id}>
                      <Link href="/panel/platform/sozlesmeler">
                        <span className="pu-govde">
                          <b>{istek.customer_name || "Müşteri"}</b>
                          <small>{[istek.contract_no, relativeTime(istek.created_at)].filter(Boolean).join(" · ")}</small>
                        </span>
                        {istek.amount ? <span className="konsol-tutar">{para(Number(istek.amount), istek.currency ?? "TRY")}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : bos("Onay bekleyen sözleşme yok.")}
            </section>
          ) : null}

          {admin ? (
            <section>
              {bas(gitmeyenProforma
                ? `Ödemesi gelmemiş proformalar; ${gitmeyenProforma} tanesi müşteriye ulaşmamış ve en üstte. Tahsilat → Proforma'dan toplu gönderilir.`
                : "Gönderilmiş, ödemesi gelmemiş proformalar; geçerliliği en yakın olan başta.", "/panel/platform/tahsilat?kanal=proforma", "Proformalar")}
              {proformaHatasi ? okunamadi : proformalar.length ? (
                <ul className="pu-liste">
                  {proformalar.map((p) => (
                    <li key={p.id}>
                      <Link href={`/panel/platform/tahsilat/proforma/${p.id}`}>
                        <span className="pu-govde">
                          <b>{p.musteri_adi}</b>
                          <small>{[p.proforma_no, productName(p.product), p.gonderim !== "gitti" ? GONDERIM_ADI[p.gonderim] : null].filter(Boolean).join(" · ")}</small>
                        </span>
                        <span className="konsol-tutar">{para(Number(p.toplam), p.para_birimi ?? "TRY")}</span>
                        {p.gonderim === "gitmedi" ? (
                          <span className="status-pill" data-tone="danger" title={p.gonderim_hatasi ?? undefined}>Gitmedi</span>
                        ) : (
                          <span className="status-pill" data-tone={p.kalan < 0 ? "danger" : p.kalan <= 3 ? "gold" : "neutral"}>
                            {p.kalan < 0 ? `${-p.kalan} gün geçti` : p.kalan === 0 ? "Bugün son gün" : `${p.kalan} gün kaldı`}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : bos("Ödeme bekleyen proforma yok.")}
            </section>
          ) : null}

          <section>
            {bas("Kurulumu bitmemiş kiracılar: oluşturuluyor, davet gönderiliyor ya da kurum sahibi bekleniyor.", "/panel/platform/kurulumlar?asama=devam", "Kurulumlar")}
            {kiraciHatasi ? okunamadi : kurulumdakiler.length ? (
              <ul className="pu-liste">
                {kurulumdakiler.map((kurum) => (
                  <li key={kurum.id}>
                    <Link href={`/panel/platform/musteriler/${kurum.id}?pencere=ayarlar`}>
                      <span className="pu-govde"><b>{kurum.display_name || kurum.name}</b><small>{kurum.contact_phone || "Telefon yok"}</small></span>
                      <span className="status-pill" data-tone="info">{KURULUM_ADI[kurum.provisioning_state] ?? kurum.provisioning_state}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : bos("Devam eden kurulum yok.")}
          </section>

          <section>
            {bas(`Dönemi ya da denemesi ${REMINDER_WINDOW_DAYS} gün içinde dolan, ya da son 30 günde dolmuş abonelikler.`, "/panel/platform/billing", "Abonelikler")}
            {urunHatasi ? okunamadi : hatirlatmalar.length ? (
              <ul className="pu-liste">
                {hatirlatmalar.map((h) => (
                  <li key={`${h.organizationId}-${h.product}`}>
                    <Link href={`/panel/platform/musteriler/${h.organizationId}`}>
                      <span className="pu-govde">
                        <b>{h.organizationName}</b>
                        <small>{[h.trial ? `${h.productName} denemesi` : h.productName, h.endsAtLabel, h.feeLabel].filter(Boolean).join(" · ")}</small>
                      </span>
                      <span className="status-pill" data-tone={h.daysLeft < 0 ? "danger" : h.daysLeft <= 2 ? "gold" : "neutral"}>
                        {h.daysLeft < 0 ? `${-h.daysLeft} gün geçti` : h.daysLeft === 0 ? "Bugün" : `${h.daysLeft} gün kaldı`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : bos("Yakında dolan abonelik yok.")}
          </section>

          <section>
            {bas("Ödeme gelmediği için askıya alınmış müşteriler, en uzun bekleyen başta. Askı geçici: ödeme gelince açılır, gelmeyecekse lisansı İptal edip kayıp nedenini yazın.", "/panel/platform/musteriler", "Müşteriler")}
            {askiHatasi ? okunamadi : askidakiler.length ? (
              <ul className="pu-liste">
                {askidakiler.map((k) => (
                  <li key={k.organizationId}>
                    <Link href={`/panel/platform/musteriler/${k.organizationId}?pencere=urunler`}>
                      <span className="pu-govde">
                        <b>{kurumAdi.get(k.organizationId) ?? "Kurum"}</b>
                        <small>{[k.urunler.map((u) => productName(u)).join(", "), k.sebep].filter(Boolean).join(" · ")}</small>
                      </span>
                      <span className="status-pill" data-tone={k.gun !== null && k.gun >= 14 ? "danger" : "gold"}>
                        {k.gun === null ? "Askıda" : k.gun === 0 ? "Bugün" : `${k.gun} gündür`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : bos("Askıda bekleyen müşteri yok.")}
          </section>

          <section>
            {bas("Yenilemesi 30 gün içinde ve son 7 günde paneli kullanmamış müşteriler; yenilemeden önce arayın.", "/panel/platform/musteriler", "Müşteriler")}
            {!etkinlik.harita || kiraciHatasi ? okunamadi : riskliler.length ? (
              <ul className="pu-liste">
                {riskliler.map((k) => (
                  <li key={k.id}>
                    <Link href={`/panel/platform/musteriler/${k.id}`}>
                      <span className="pu-govde">
                        <b>{k.ad}</b>
                        <small>Son kullanım: {etkinlikYazisi(k.son, etkinlik.simdi).toLocaleLowerCase("tr-TR")}</small>
                      </span>
                      <span className="status-pill" data-tone="gold">{k.yenileme ? `Yenileme ${tarih(k.yenileme)}` : "Yenileme"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : bos("Yenilemesi yaklaşan bütün müşteriler paneli kullanıyor.")}
          </section>

          <section>
            {bas("Denemesi boşa giden (son 7 günde kimse girmedi) ya da ödediği hâlde panele hiç girilmemiş müşteriler; arayıp başlamalarına yardım edin.", "/panel/platform/musteriler?etkinlik=sessiz", "Müşteriler")}
            {!etkinlik.harita || kiraciHatasi ? okunamadi : kullanmayanlar.length ? (
              <ul className="pu-liste">
                {kullanmayanlar.map((k) => (
                  <li key={k.id}>
                    <Link href={`/panel/platform/musteriler/${k.id}?pencere=kullanicilar`}>
                      <span className="pu-govde">
                        <b>{k.ad}</b>
                        <small>Son kullanım: {etkinlikYazisi(k.son, etkinlik.simdi).toLocaleLowerCase("tr-TR")}</small>
                      </span>
                      <span className="status-pill" data-tone={k.durum === "trialing" ? "gold" : "info"}>{k.durum === "trialing" ? "Denemede" : "Ödüyor, girmedi"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : bos("Kurulan bütün müşteriler paneli kullanıyor.")}
          </section>

          <section>
            {bas("İşlenemeyen ödeme, yüklenemeyen AI kredisi, kurulum hatası, kota aşımı ve ürüne yansımamış lisanslar.", "/panel/platform/saglik", "Sistem sağlığı")}
            {kiraciHatasi ? okunamadi : sorunlar.length ? (
              <ul className="pu-liste">
                {sorunlar.map((sorun) => (
                  <li key={sorun.id}>
                    <Link href={sorun.href}>
                      <span className="pu-govde"><b>{sorun.ad}</b><small>{sorun.alt}</small></span>
                      <span className="status-pill" data-tone="danger">{sorun.rozet}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : bos("Her kiracı yolunda.")}
          </section>
        </TalepAkis>
      </div>

      <SeriKarti
        baslik="Tahsilat"
        alt="Son 14 gün"
        seri={tahsilatSerisi}
        birim={(deger) => para(deger)}
        adet="tahsilat"
        href="/panel/platform/tahsilat"
        bos="Son 14 günde tahsilat yok. İlk ödeme alındığında günlük dağılım burada çizilir."
      />

      <ListeIzgarasi etiket="Son hareketler">
        <ListeKarti
          baslik="Son tahsilatlar" alt="Onaylanan kurum ödemeleri ve bireysel abone ödemeleri"
          bos="Son dört haftada tahsilat yok." sayi={sonTahsilatlar.length}
          href="/panel/platform/tahsilat" hrefEtiket="Tahsilatlar"
        >
          {sonTahsilatlar.map((kayit) => (
            <ListeSatiri
              key={kayit.id}
              href={kayit.href}
              baslik={kayit.ad}
              alt={kayit.alt}
              sag={<span className="konsol-tutar">{para(kayit.tutar)}</span>}
              zaman={relativeTime(kayit.tarih as string)}
            />
          ))}
        </ListeKarti>

        <ListeKarti
          baslik="Son kurulum hareketleri" alt="Kurum açma ve giriş bağlantısı"
          bos={admin
            ? "Henüz kurulum kaydı yok. Yeni bir müşteri kurulduğunda adımları burada görürsünüz."
            : "Sunucu anahtarı tanımlı olmadığı için kurulum günlüğü okunamıyor."}
          sayi={kurulumlar.length}
          href="/panel/platform/kurulumlar" hrefEtiket="Kurulumlar"
        >
          {kurulumlar.map((kayit) => (
            <ListeSatiri
              key={kayit.id}
              href={`/panel/platform/musteriler/${kayit.organization_id}?pencere=ayarlar`}
              baslik={kurumAdi.get(kayit.organization_id) ?? "Kurum"}
              /* Aşama da yazılıyor (14.10.2026): aynı eylemin iki aşaması
                 yoksa birbirinin aynısı iki satır gibi görünüyordu. */
              alt={[KURULUM_ISLEMI[kayit.action] ?? kayit.action, kayit.state ? KURULUM_ADI[kayit.state] ?? kayit.state : null]
                .filter(Boolean).join(" · ")}
              /* 'failed', 'error' değil (sütunun kısıtı). Ton kiracının
                 BUGÜNKÜ durumuna göre: sonradan tamamlanmış bir kurulumun
                 eski hatası her gün kırmızı yanmasın. */
              sag={kayit.result === "failed" ? (
                <span className="status-pill" data-tone={hatadaKalanlar.has(kayit.organization_id) ? "danger" : "neutral"}>
                  {hatadaKalanlar.has(kayit.organization_id) ? "hata" : "hata · çözüldü"}
                </span>
              ) : null}
              /* Göreli zaman (15.10.2026): tam tarih rozetli satırlarda adı kırpıyordu. */
              zaman={relativeTime(kayit.created_at)}
            />
          ))}
        </ListeKarti>
      </ListeIzgarasi>
    </GenelBakis>
  );
}
