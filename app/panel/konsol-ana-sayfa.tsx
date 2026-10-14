import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { depolamaKullanimi } from "@/lib/lisans-olcumleri";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPersonName } from "@/lib/format-name";
import { arvolabKopyalari, getArvolabBridgeHealth } from "@/lib/arvolab";
import { arcKopyalari, getArcBridgeHealth } from "@/lib/arc-bridge";
import { randevuKopyalari, getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { eskiKopyalar } from "@/lib/kopya-denetimi";
import { kotaDurumu } from "@/lib/kota-durumu";
import { renewalReminders, REMINDER_WINDOW_DAYS, type RenewalLicense, type RenewalOrganization } from "@/lib/renewal-reminders";
import { gunlukSeri } from "@/lib/gunluk-seri";
import { GENEL_BAKIS_SATIR, GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri, SeriKarti, seriBaslangici, simdi } from "./os/genel-bakis";
import { StgIcon } from "./settings/settings-ui";
import { para, tarihSaat } from "./platform/bicim";
import "./dashboard.css";

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

  Sayfa okunur: buradan hiçbir şey yazılmıyor, her satır işin yapıldığı
  ekrana götürüyor. Aynı kuralı iki yerde uygulamak, birinin sapması demek.
*/

const TZ = "Europe/Istanbul";
const PENDING_STATES = new Set(["creating", "inviting_owner", "waiting_owner"]);
const ODEYEN_DURUMLAR = new Set(["active", "past_due"]);

type Tone = "info" | "gold" | "success" | "danger" | "brand" | "neutral";

const actionLabels: Record<string, string> = {
  provision_organization: "Kurum kurulumu",
  owner_access_link: "Giriş bağlantısı",
};

function selamlama() {
  const now = new Date();
  const saat = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
  const selam = saat < 5 ? "İyi geceler" : saat < 12 ? "Günaydın" : saat < 18 ? "İyi günler" : saat < 23 ? "İyi akşamlar" : "İyi geceler";
  const tarih = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now);
  return { selam, tarih };
}

// Şimdiki zaman bileşen dışında okunur (react-hooks/purity).
const hatirlatmalariHesapla = (lisanslar: RenewalLicense[], kurumlar: RenewalOrganization[]) =>
  renewalReminders(lisanslar, kurumlar, Date.now());

type Kurum = { id: string; name: string; display_name: string | null; kind: string | null; provisioning_state: string; contact_phone: string | null; grup_markasi?: boolean | null };
type CekirdekLisans = { organization_id: string; license_status: string; monthly_fee: number | null; user_limit: number; storage_limit_mb: number };
type UrunLisansi = { organization_id: string; product: string; status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null };
type KurulumKaydi = { id: number | string; organization_id: string; action: string; result: string | null; state: string | null; created_at: string };

export async function KonsolAnaSayfa() {
  const { supabase, userId, isPlatformOwner } = await getPanelContext();
  /* Kabuk da eliyor (layout.tsx) ama yetki üç yerde birden duruyor
     (AGENTS.md): kabuğun bir gün değişmesi bu sayfayı açmamalı. */
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();

  const [
    { data: kiraciSatirlari },
    { data: urunSatirlari },
    bekleyenOdeme,
    { data: profil },
    { data: personel },
    { data: depolamalar },
  ] = await Promise.all([
    /*
      KURUM, LİSANS VE AKTİF ÜYE SAYISI TEK GÖRÜNÜMDEN (12.10.2026).

      Üçü ayrı okunuyordu ve ortadaki en pahalısıydı: bütün
      kiracıların BÜTÜN üyelikleri, yalnızca kurum başına "kaç aktif
      üye" sayısı için. O tablo personel giriş çıkışıyla büyüyor;
      satır tavanına çarpıldığı gün kota rozetleri sessizce "limit
      aşılmadı" derdi. platform_kiraci_liste kiracı başına tek satır
      veriyor, sayım yan sorguda.
    */
    supabase.from("platform_kiraci_liste")
      .select("id,name,display_name,kind,provisioning_state,contact_phone,license_status,monthly_fee,user_limit,storage_limit_mb,aktif_uye,grup_markasi")
      .order("name"),
    supabase.from("organization_product_licenses").select("organization_id,product,status,monthly_fee,current_period_end,trial_ends_at"),
    supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    /* Ad birden çok yerde olabilir ve hiçbiri zorunlu değil; davet
       akışından geçmeden açılmış bir hesabın profiles kaydı yok ve
       selamlama adsız kalıyordu. */
    supabase.from("hr_employees").select("full_name").eq("user_id", userId).limit(1).maybeSingle(),
    /* Depolama storage.objects'ten geliyor; o tablo PostgREST'e açık değil
       ve olmamalı. Fonksiyon yalnızca kurum başına TOPLAM döndürüyor. */
    /* Depolama toplamı 5 dk önbellekte (lib/lisans-olcumleri): storage.objects'i taramak her sayfa açılışında tekrar ediliyordu. */
    depolamaKullanimi().then((data) => ({ data })),
  ]);

  /* Sözleşme kuyruğu ve kurulum günlüğü yalnızca sunucu anahtarıyla
     okunuyor (sozlesmeler sayfasındaki kuralın aynısı). Anahtar yoksa
     satır hiç çizilmiyor: "0 sözleşme bekliyor" yazmak, okunamayan bir
     kuyruğu boş göstermek olurdu. */
  const [bekleyenSozlesme, { data: kurulumKayitlari }] = admin
    ? await Promise.all([
        admin.from("platform_subscription_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        admin.from("provisioning_audit_logs").select("id,organization_id,action,result,state,created_at").order("created_at", { ascending: false }).limit(6),
      ])
    : [{ count: null, error: null }, { data: [] }];

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
  const seriBasi = seriBaslangici();
  const [{ data: havaleler }, { data: bireyselOdemeler }] = await Promise.all([
    supabase.from("organization_payment_requests").select("amount,reviewed_at")
      .eq("status", "approved").gte("reviewed_at", seriBasi),
    supabase.from("subscriber_payments").select("amount,paid_at").gte("paid_at", seriBasi),
  ]);

  const [arvolab, arc, randevu, labKopya, arcKopya, rdvKopya] = await Promise.all([
    getArvolabBridgeHealth(),
    getArcBridgeHealth(),
    getRandevuBridgeHealth(),
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

  /* Görünümün satırı hem kurumu hem lisansı taşıyor; ikisi burada
     ayrılıyor. Lisans alanı boş olan kurum (tetikleyici lisansı
     açmamışsa) kota ve ödeyen hesabına girmiyor — eski davranış da
     böyleydi, çünkü o kurumun lisans SATIRI yoktu. */
  const kiracilar = (kiraciSatirlari ?? []) as unknown as (Kurum & {
    license_status: string | null; monthly_fee: number | null;
    user_limit: number | null; storage_limit_mb: number | null; aktif_uye: number;
  })[];
  const kurumlar = kiracilar as Kurum[];
  const musteriler = kurumlar.filter((kurum) => kurum.kind !== "internal");
  const kurumAdi = new Map(kurumlar.map((kurum) => [kurum.id, kurum.display_name || kurum.name]));

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
  const kurulumBekleyen = musteriler.filter((kurum) => PENDING_STATES.has(kurum.provisioning_state)).length;
  const dikkatGerektiren = musteriler.filter((kurum) =>
    kurum.provisioning_state === "failed" || kota.get(kurum.id)?.durum === "asildi").length;

  /*
    Beklenen aylık gelir LİSANSLARDAN hesaplanıyor, abonelik kaydından
    değil: o tabloya satır ancak bir ödeme onaylandığında düşüyor, yani
    elle lisans verilmiş kurumlar hiç sayılmıyordu. Denemedekiler dışarıda:
    henüz ödemiyorlar, beklenen gelire katmak raporu şişirir.
  */
  /* Gelire yalnızca gerçek müşteri girer: grup markalarının (AkademikMerkez,
     ArvoCulture) ücreti grup içi değer, müşteri geliri değil (lib/kurum-turu). */
  const kiraciMi = new Set(musteriler.map((kurum) => kurum.id));
  const musteriMi = new Set(musteriler.filter((kurum) => !kurum.grup_markasi).map((kurum) => kurum.id));
  const urunler = (urunSatirlari ?? []) as UrunLisansi[];
  const aylikGelir =
    cekirdek.filter((satir) => musteriMi.has(satir.organization_id) && ODEYEN_DURUMLAR.has(satir.license_status))
      .reduce((toplam, satir) => toplam + Number(satir.monthly_fee ?? 0), 0)
    + urunler.filter((satir) => musteriMi.has(satir.organization_id) && ODEYEN_DURUMLAR.has(satir.status))
      .reduce((toplam, satir) => toplam + Number(satir.monthly_fee ?? 0), 0);

  const hatirlatmalar = hatirlatmalariHesapla(urunler as RenewalLicense[], kurumlar as RenewalOrganization[]);
  const odemeSayisi = bekleyenOdeme.error ? 0 : bekleyenOdeme.count ?? 0;
  /** Sunucu anahtarı yoksa null: okunamadı, sıfır değil. */
  const sozlesmeSayisi = admin ? bekleyenSozlesme.count ?? 0 : null;
  const onayBekleyen = odemeSayisi + (sozlesmeSayisi ?? 0);

  /*
    Grafiğin dilimleri: tarih listesi + AĞIRLIK olarak tutar. gunlukSeri
    ağırlıksız çağrılsaydı grafik "kaç ödeme" gösterirdi; kurucunun
    sorduğu "ne kadar tahsil edildi".
  */
  const tahsilatKayitlari = [
    ...((havaleler ?? []) as { amount: number | null; reviewed_at: string | null }[])
      .map((satir) => ({ tarih: satir.reviewed_at, tutar: Number(satir.amount ?? 0) })),
    ...((bireyselOdemeler ?? []) as { amount: number | null; paid_at: string | null }[])
      .map((satir) => ({ tarih: satir.paid_at, tutar: Number(satir.amount ?? 0) })),
  ].filter((satir) => satir.tarih);
  const tahsilatSerisi = gunlukSeri(
    tahsilatKayitlari.map((satir) => satir.tarih as string),
    simdi(),
    14,
    tahsilatKayitlari.map((satir) => satir.tutar),
  );

  const { selam, tarih } = selamlama();
  const ad = formatPersonName(
    (profil?.full_name as string | null | undefined) || (personel?.full_name as string | null | undefined),
  ).split(" ")[0];

  /* Özet cümle: sıfırsa hiç yazılmıyor. "0 kurulum bekliyor" demek,
     kurucuyu olmayan bir işe bakmaya çağırır. */
  const parcalar = [
    kurulumBekleyen ? `${kurulumBekleyen} kurulum bekliyor` : null,
    onayBekleyen ? `${onayBekleyen} onay bekliyor` : null,
    hatirlatmalar.length ? `${hatirlatmalar.length} aboneliğin dönemi doluyor` : null,
    dikkatGerektiren ? `${dikkatGerektiren} kiracı dikkat istiyor` : null,
  ].filter(Boolean);
  const ozet = parcalar.length
    ? `Bugün ${parcalar.join(", ")}.`
    : "Bekleyen bir iş yok; platform kendi kendine dönüyor.";

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
    !randevu.ok ? { ad: "Randevu köprüsü", not: randevu.error ? `Bağlanılamadı: ${randevu.error}` : `Tanımlı olmayan değişkenler: ${randevu.missing.join(", ")}` } : null,
    /*
      Tek satır, kurum kurum değil: kaç kiracının kopyası bozuk olduğu
      uyarı için yeter, hangisi olduğu kiracı sayfasında yazıyor. Uzun bir
      liste ana sayfayı ezer ve okunmaz hâle gelirdi.
    */
    bayatKopyalar.length
      ? {
          ad: `${bayatKopyalar.length} kiracının ürün kopyası bozuk`,
          not: bayatKopyalar
            .slice(0, 3)
            .map((kayit) => `${kurumAdi.get(kayit.organizationId) ?? kayit.organizationId} · ${kayit.product}: üründe "${kayit.kopyaDurumu}", burada "${kayit.konsolDurumu}"`)
            .join(" — ")
            + (bayatKopyalar.length > 3 ? ` (ve ${bayatKopyalar.length - 3} tane daha)` : "")
            + ". Kiracının lisans sayfasından \"Ürüne yeniden yansıt\".",
        }
      : null,
  ].filter(Boolean) as { ad: string; not: string }[];

  /*
    Sayı kartları kalktı: dört rakam grafiğin başlığına taşındı (panelde
    de böyle — ayrı bir satır ekranı aşağı itiyor ve genel bakış tek
    ekrana sığmıyordu).
  */
  const grafikOzeti = [
    { ad: "Beklenen aylık", deger: para(aylikGelir), href: "/panel/platform/billing" },
    /* "3 / 4": kaçının kullanımda olduğu bilgisi sayı kartından buraya taşındı. */
    { ad: "Müşteri kurum", deger: `${kullanimda} / ${musteriler.length}`, href: "/panel/platform/musteriler" },
    { ad: "Onay bekleyen", deger: String(onayBekleyen), ton: onayBekleyen ? "danger" : undefined, href: "/panel/platform/payments" },
    { ad: "Dikkat gerektiren", deger: String(dikkatGerektiren), ton: dikkatGerektiren ? "danger" : undefined, href: "/panel/platform/musteriler" },
  ];

  const odak = ([
    { etiket: "Kurulum bekleyen kiracı", sayi: kurulumBekleyen, href: "/panel/platform/kurulumlar?asama=devam", tone: "info" },
    sozlesmeSayisi === null
      ? null
      : { etiket: "Onay bekleyen sözleşme", sayi: sozlesmeSayisi, href: "/panel/platform/sozlesmeler", tone: "gold" },
    { etiket: "İncelenecek ödeme bildirimi", sayi: odemeSayisi, href: "/panel/platform/payments", tone: "gold" },
    { etiket: `Dönemi ${REMINDER_WINDOW_DAYS} gün içinde dolan abonelik`, sayi: hatirlatmalar.length, href: "/panel/platform/billing", tone: "danger" },
    { etiket: "Kota aşımı ya da kurulum hatası", sayi: dikkatGerektiren, href: "/panel/platform/musteriler", tone: "danger" },
  ] as ({ etiket: string; sayi: number; href: string; tone: Tone } | null)[]).filter(Boolean) as { etiket: string; sayi: number; href: string; tone: Tone }[];

  /*
    Dikkat isteyen kiracılar KART OLARAK listeleniyor (13.10.2026).
    Eskiden yalnızca bir sayıydı ve kurucu hangi kurum olduğunu görmek
    için kiracı listesine gidip süzgeci kendisi kuruyordu.
  */
  const dikkatliler = musteriler
    .filter((kurum) => kurum.provisioning_state === "failed" || kota.get(kurum.id)?.durum === "asildi")
    .slice(0, GENEL_BAKIS_SATIR)
    .map((kurum) => ({
      id: kurum.id,
      ad: kurum.display_name || kurum.name,
      sebep: kurum.provisioning_state === "failed"
        ? "Kurulum hatası"
        : kota.get(kurum.id)?.kullanici.asildi ? "Kullanıcı limiti aşıldı" : "Depolama limiti aşıldı",
    }));

  const bolumler = [
    { etiket: "Tüm kiracılar", not: `${kurumlar.length} kurum kaydı`, href: "/panel/platform/musteriler" },
    { etiket: "Lisans ve kota", not: "Paket, limit ve deneme süresi", href: "/panel/platform/licenses" },
    { etiket: "Abonelikler", not: "Gelir, tahsilat ve hatırlatmalar", href: "/panel/platform/billing" },
    { etiket: "Modül matrisi", not: "Hangi modül hangi kiracıda açık", href: "/panel/platform/moduller" },
    { etiket: "Kullanıcılar", not: "Dört ürünün kullanıcıları tek listede", href: "/panel/platform/kullanicilar" },
    { etiket: "Bireysel aboneler", not: "Kuruma bağlı olmayan kullanıcılar", href: "/panel/platform/subscribers" },
  ];

  const kurulumlar = (kurulumKayitlari ?? []) as KurulumKaydi[];

  return (
    <GenelBakis baslik={`${selam}${ad ? `, ${ad}` : ""}`} ust={tarih.toLocaleUpperCase("tr-TR")}>
      <p className="dash-ozet-cumle">{ozet}</p>

      {/* Köprüler sessizce kopuyor: hata yalnızca karşı taraftaki günlükte
          kalıyor ve kurucu aylar sonra fark ediyordu. Konsolun ilk ekranı
          bunu söylemeli. GenelBakis'in kendi `uyari` satırı "veri
          okunamadı" içindir; bunun başlığı kopan köprünün adı. */}
      {kopruler.map((kopru) => (
        <p className="dash-uyari" data-tone="danger" role="alert" key={kopru.ad}>
          <span aria-hidden="true"><StgIcon name="shield" size={16} /></span>
          <span><b>{kopru.ad} yanıt vermiyor</b><small>{kopru.not}</small></span>
        </p>
      ))}

      <SeriKarti
        baslik="Tahsilat"
        alt="Son 14 gün"
        seri={tahsilatSerisi}
        birim={(deger) => para(deger)}
        adet="tahsilat"
        href="/panel/platform/billing"
        ozet={grafikOzeti}
      />

      <ListeIzgarasi etiket="Konsol">
        <ListeKarti
          baslik="Bugün neye bakmalı?" alt="Bekleyen işler"
          bos="Bekleyen iş yok." sayi={odak.length}
          href="/panel/platform/musteriler" hrefEtiket="Müşteriler"
        >
          {odak.map((satir) => (
            <ListeSatiri
              key={satir.etiket}
              href={satir.href}
              baslik={satir.etiket}
              sag={<span className="status-pill" data-tone={satir.sayi ? satir.tone : "neutral"}>{satir.sayi}</span>}
            />
          ))}
        </ListeKarti>

        <ListeKarti
          baslik="Dikkat gerektiren" alt="Kurulum hatası ya da kota aşımı"
          bos="Her kiracı yolunda." sayi={dikkatliler.length}
          href="/panel/platform/musteriler" hrefEtiket="Tümü"
        >
          {dikkatliler.map((kurum) => (
            <ListeSatiri
              key={kurum.id}
              href={`/panel/platform/musteriler/${kurum.id}`}
              baslik={kurum.ad}
              sag={<span className="status-pill" data-tone="danger">{kurum.sebep}</span>}
            />
          ))}
        </ListeKarti>

        <ListeKarti
          baslik="Son kurulum hareketleri" alt="Kurum açma ve giriş bağlantısı"
          bos={admin
            ? "Henüz kurulum kaydı yok. Yeni bir müşteri kurulduğunda adımları burada görürsünüz."
            : "Sunucu anahtarı tanımlı olmadığı için kurulum günlüğü okunamıyor."}
          sayi={kurulumlar.length}
        >
          {kurulumlar.map((kayit) => (
            <ListeSatiri
              key={kayit.id}
              href={`/panel/platform/musteriler/${kayit.organization_id}?pencere=ayarlar`}
              baslik={kurumAdi.get(kayit.organization_id) ?? "Kurum"}
              alt={actionLabels[kayit.action] ?? kayit.action}
              sag={kayit.result === "error" ? <span className="status-pill" data-tone="danger">hata</span> : null}
              zaman={tarihSaat(kayit.created_at)}
            />
          ))}
        </ListeKarti>

        <ListeKarti baslik="Bölümler" alt="Konsolun tamamı" bos="" sayi={bolumler.length}>
          {bolumler.map((bolum) => (
            <ListeSatiri key={bolum.href} href={bolum.href} baslik={bolum.etiket} alt={bolum.not} />
          ))}
        </ListeKarti>
      </ListeIzgarasi>
    </GenelBakis>
  );
}
