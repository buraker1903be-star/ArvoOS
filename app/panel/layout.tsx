import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getPanelContextErisimdenBagimsiz as getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantTheme } from "@/lib/tenant-theme";
import { getLoginBrand } from "@/lib/login-branding";
import { logout } from "./actions";
import { ThemeToggle } from "./theme-toggle";
import { NavProgress } from "./nav-progress";
import { GlobalActionFeedback } from "./global-action-feedback";
import { FlashToast } from "./flash-toast";
import { PresenceHeartbeat } from "./presence-heartbeat";
import { MessagesDrawer } from "./messages-drawer";
import { NotificationsDrawer } from "./notifications-drawer";
import { loadMessagesInit, mesajlarBaslangici } from "./messages/load-messages";
import { headers } from "next/headers";
import { hostFromHeaders, isManagementHost, MANAGEMENT_HOST } from "@/lib/site/host-rules";
import { formatPersonName } from "@/lib/format-name";
import { osUygulamalari } from "./os/os-apps";
import { OsDock } from "./os/os-dock";
import { konsolUygulamalari } from "./os/konsol-apps";
import { OsGeri } from "./os/os-geri";
import { OsBolumSeridi } from "./os/os-bolum-seridi";
import { OsUygulamaKabugu } from "./os/os-uygulama-kabugu";
import { basHarf, depodakiSimgeMi } from "@/lib/kurum-simgesi";
import { OsCanli, OsSaat, OsUygulamaAdi } from "./os/os-status";
import { OsAramaDugmesi, OsKomutPaleti } from "./os/os-command-palette";
import { OsKullaniciMenusu } from "./os/os-user-menu";
import { OsMenuKapat } from "./os/os-menu-kapat";
import { OsCanliSayfa } from "./os/os-canli-yenile";
import { CustomerLookupHost } from "./crm/customer-lookup";
import "./panel-tokens.css";
import "./panel.css";
import "./panel-ux.css";
import "./panel-page-system.css";
import "./panel-top-actions.css";
import "./sidebar-workspace-switcher.css";
import "./panel-mobile.css";
import "./panel-compact.css";
import "./panel-premium.css";
import "./panel-tables.css";
import "./panel-motion.css";
import "./os-shell.css";
import "./panel-ui.css";
// Telefonda uygulama gibi: yalnızca ≤760px kuralları (masaüstüne dokunmaz).
import "./mobil-uygulama.css";
import { postaBaglantiDurumu } from "@/lib/posta-hesabi";
import { OsPostaDugmesi } from "./os/os-posta-dugmesi";
import { OsPostaUyarisi } from "./os/os-posta-uyarisi";
import { kurumSimgeleri } from "@/lib/kurum-simgesi";
import { sozlesmeOnayGerekli } from "@/lib/sozlesme/onay-durumu";
import { SozlesmeOnayi } from "./sozlesme-onayi";

/*
  SEKME BAŞLIĞI VE SİMGESİ KURUMUN (11.10.2026).

  Kendi alan adında (panel.kurum.com) çalışan bir kiracı tarayıcı
  sekmesinde, yer iminde ve geçmişinde "ArvoOS" görüyordu; ürün
  beyaz etiketli satılırken kurumun kendi ekibine bile başka bir
  markayı gösteriyordu.

  Ölçüt ADRES: kurum kendi alan adındaysa onun adı ve logosu. Paylaşılan
  adreste (app.arvo-os.com) ArvoOS kalıyor — orada kullanıcının birden
  çok çalışma alanı olabiliyor ve sekmeye birini yazmak yanıltırdı.

  Oturum okunmuyor: generateMetadata içinde kimlik doğrulaması
  yönlendirme demek ve sayfa daha çizilmeden yönlendirme yapmak,
  "giriş yapılmadı" ekranını metadata'dan tetiklemek olurdu.
*/
/*
  PANELDE YAKINLAŞTIRMA KAPALI (13.10.2026, kurum sahibinin isteği).
  Telefonda panel uygulama gibi kullanılıyor: iki parmakla ya da çift
  dokunuşla sayfa büyüyünce düzen kayıyor, alt çubuk ekran dışına
  çıkıyordu. Android Chrome bu satırı uyguluyor; iOS Safari erişilebilirlik
  gereği "user-scalable=no"yu YOK SAYIYOR — orada hareketi
  os-uygulama-kabugu.tsx engelliyor. Yalnızca panel: müşteriye giden
  teklif/sözleşme belgesi ve pazarlama sitesi yakınlaştırılabilir kalır.
*/
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#050c1a" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  /*
    iOS'TA ANA EKRAN ADI MANIFEST'TEN GELMEZ (15.10.2026).

    Kurucu konsolu ana ekrana eklenince kısayol "ArvoOS" adıyla
    kuruluyordu — app.arvo-os.com'daki kiracı paneliyle birebir aynı.
    Manifest'e ad yazmak Android'i düzeltir ama iOS Safari manifest'in
    short_name'ini DEĞİL `apple-mobile-web-app-title` meta'sını okuyor.
    O meta app/layout.tsx'te statik duruyor ve oraya host kontrolü
    koymak kök düzeni dinamikleştirip pazarlama sitesinin 149 statik
    sayfasını götürürdü. Burası zaten dinamik (oturum okuyor): ad
    yalnızca konsolun kendi alan adında değişiyor.
  */
  if (isManagementHost(hostFromHeaders(await headers()))) {
    return {
      title: "ArvoOS | Yönetim Merkezi",
      description: "ArvoOS güvenli kurum ve platform çalışma alanı",
      applicationName: "Arvo Yönetim",
      appleWebApp: { capable: true, statusBarStyle: "default", title: "Yönetim" },
    };
  }
  const marka = await getLoginBrand();
  if (!marka) {
    return { title: "ArvoOS | Yönetim Merkezi", description: "ArvoOS güvenli kurum ve platform çalışma alanı" };
  }
  return {
    title: `${marka.name} | Panel`,
    description: `${marka.name} çalışma alanı`,
    // Sekme simgesi logo değil: yatay logo 16×16 kareye sıkışıyordu (lib/kurum-simgesi).
    icons: kurumSimgeleri(marka),
  };
}

const roleNames: Record<string, string> = {
  owner: "Kurum Sahibi",
  admin: "Yönetici",
  manager: "Yönetici",
  member: "Satış Personeli",
  operasyoncu: "Operasyon Personeli",
};

/** Konsoldan müşteri paneline geçiş için; proxy'deki adresle aynı. */
const DEFAULT_APP_HOST = "app.arvo-os.com";

/** Çevrimiçi sayılmak için son görülme sınırı (PresenceHeartbeat dakikada bir yazar). */
const cevrimiciEsigi = () => new Date(Date.now() - 3 * 60_000).toISOString();

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, userId, membership, organization, modules, isPlatformOwner, workspaces, hiddenModuleKeys, izin, yetkiler } = await getPanelContext();

  /*
    Kurucu konsolu (yonetim.arvo-os.com) normal panel kabuğunu KULLANMAZ.

    Eskiden bu alan adında da müşteri menüsü (CRM, Operasyon, Finans…)
    çiziliyordu; hepsi uygulama alan adına sıçradığı için kurucu menüye
    her tıkladığında konsoldan çıkıyordu. Ayrıca çalışma alanı seçici,
    bildirim çekmecesi ve mesaj çekmecesi buraya ait değil: konsol tek bir
    kurumun paneli değil, platformun kendisi.
  */
  const konsolHostu = isManagementHost(hostFromHeaders(await headers()));

  /*
    Konsola yalnızca kurucu girebilir. Yetkisi olmayan biri giriş yaparsa
    normal paneli BURADA göstermiyoruz: bu alan adının tamamı platform
    yönetimi, müşteri paneli için uygulama alan adı var.
  */
  if (konsolHostu && !isPlatformOwner) {
    return <div className="panel-root"><main className="panel-frame konsol-red">
      <section>
        <h1>Bu adres kurucu yönetimi içindir</h1>
        <p>Hesabınızın platform yönetimine erişimi yok. Kendi panelinize aşağıdaki adresten girebilirsiniz.</p>
        <div className="panel-page-actions">
          <a className="panel-primary" href={`https://${DEFAULT_APP_HOST}/panel`}>ArvoOS paneline git</a>
          <form action={logout}><button className="panel-secondary" type="submit">Çıkış yap</button></form>
        </div>
      </section>
    </main></div>;
  }

  /*
    KULLANIM SÖZLEŞMESİ (29.10.2026). Yürürlükteki sürümü onaylamamış
    kullanıcıda panel bir onay penceresinin arkasında etkisiz kalır
    (lib/sozlesme). Muafiyet yok: kurucu ve Kurum Sahibi dâhil. Sorgu
    kabuğun öteki okumalarıyla birlikte başlıyor; okunamazsa pencere
    gösterilmiyor (onay-durumu.ts'in başı).
  */
  const sozlesmeSorgusu = sozlesmeOnayGerekli(supabase, userId);

  const roleName = isPlatformOwner ? "Kurucu / Owner" : roleNames[membership.role] ?? "Kurum Kullanıcısı";
  const hasMessages = modules.some((module) => module.code.replaceAll("-", "_").toLowerCase() === "messages");
  // Toplu bildirimlerde okundu bilgisi kişiye özel; kurum sayacı veritabanı
  // fonksiyonunda hesaplanıyor (arvo_unread_notification_count).
  // Tembel: yalnızca eski yol çağırırsa çalışır (.then sorguyu hemen başlatıyordu).
  const notificationQuery = () => isPlatformOwner
    ? supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).eq("audience", "founder")
    : supabase.rpc("arvo_unread_notification_count", { p_organization_id: membership.organization_id })
        .then(({ data }) => ({ count: Number(data ?? 0) }));
  // Beyaz etiket (white-label) deneyimi: platformun kendi kurumu (arvo-os)
  // dışında, panel navigasyonu artık sabit "ArvoOS" markası yerine
  // kurumun kendi logosunu ve tabela unvanını gösteriyor.
  const isPlatformOrg = organization.slug === "arvo-os";
  const brandName = organization.display_name || organization.name;
  const ownEmployeeQuery = supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle();
  // Mesaj çekmecesi ve /panel/messages aynı yükleyiciyi kullanır; okunmamış
  // sayısı sunucuda hesaplanır (eskiden son 1000 mesaj tarayıcıya çekiliyordu).
  const messagesQuery = () => (hasMessages ? loadMessagesInit(supabase, membership.organization_id, userId) : Promise.resolve(null));
  /*
    Bekleyen gizlilik sözleşmesi personel kaydı üzerinden TEK sorguda
    (hr_employees!inner): eskiden önce personel kaydı okunuyor, sonra onun
    kimliğiyle sözleşme aranıyordu — her sayfada fazladan bir tur.
  */
  const pendingAgreementQuery = supabase.from("hr_confidentiality_agreements").select("id,hr_employees!inner(user_id)")
    .eq("organization_id", membership.organization_id).eq("hr_employees.user_id", userId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  /*
    YERLEŞİMİN SORGULARI TEK ADIMDA (2026-10). Eskiden altı ayrı aşamada,
    her biri bir öncekini bekleyerek çalışıyordu (bildirim+personel+mesaj →
    gizlilik → ürün lisansları → posta durumu → okunmamış posta → çevrimiçi
    ekip). Yerleşim her sayfanın kritik yolunda; birbirine bağlı olmayan
    sorguların sırayla beklenmesi her tıklamaya birkaç veritabanı turu
    ekliyordu. Okunmamış posta sayısı kutu bağlı olmasa da (yetkisi olana)
    okunuyor: sayım ucuz, beklemekten hızlı; bağlı değilse kullanılmıyor.
  */
  const postaYetkisi = !konsolHostu && izin("posta.gor");
  /*
    Okunmamış konuşma sayısı menüdeki rozette. Sayı KUTUNUN tamamı için,
    kişinin kendisine göre değil: kutu ortak, bir konuşmayı kim açarsa
    ekibin tamamı için okundu oluyor. Süzgeç yok — /panel/posta'nın
    varsayılan görünümü de süzgeçsiz; rozete basan kişi tam o sayıyı görsün.
  */
  const postaSayimSorgusu = postaYetkisi
    /* Çöptekiler sayılmıyor: silinen bir yazışmanın okunmamış rozeti
       kapatılamaz bir sayı bırakıyordu. */
    ? supabase.from("mail_threads").select("thread_id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("okunmamis", true).is("silindi_at", null)
    : Promise.resolve({ count: 0 });
  const ucDakikaOnce = cevrimiciEsigi();
  /*
    KABUK TEK ÇAĞRIDA (20261013114758). Aşağıdaki on dört okuma (bildirim,
    personel kaydı, gizlilik, lisanslar, posta sayısı, çevrimiçi ekip, ekip
    adları, kendi görünürlüğüm ve mesaj çekmecesinin dört okuması) her
    sayfa açılışında AYNI ANDA ayrı istek olarak gidiyor, sayfanın kendi
    sorgularıyla birlikte veritabanının bağlantı havuzunda kuyruğa
    giriyordu: tek satırlık okumalar canlıda ortalama 0,5–0,8 sn, en kötü
    4,5 sn sürüyordu. arvo_panel_kabugu aynısını tek gidiş-dönüşte,
    çağıranın yetkisiyle (security invoker, RLS aynen) yapıyor. İşlev yoksa
    (migration henüz uygulanmadı) ya da hata verirse eski yol çalışır.
    Posta durumu ayrı: service_role ile okunuyor (mail_accounts RLS'i).
  */
  const eskiYol = async () => {
    const [
      { count: notificationUnreadCount },
      { data: ownEmployee },
      messagesInit,
      { data: pendingAgreement },
      { data: urunLisanslari },
      postaBilgisi,
      postaSayimi,
      { data: varlikSatirlari },
      { data: ekipSatirlari },
    ] = await Promise.all([
      notificationQuery(),
      ownEmployeeQuery,
      messagesQuery(),
      pendingAgreementQuery,
      konsolHostu
        ? Promise.resolve({ data: null })
        : supabase.from("organization_product_licenses")
            .select("product,status").eq("organization_id", membership.organization_id)
            .in("status", ["active", "trialing", "past_due"]),
      postaYetkisi ? postaBaglantiDurumu(membership.organization_id) : Promise.resolve(null),
      postaSayimSorgusu,
      /* Çevrimiçi ekip (yalnızca uygulama kabuğunda): son 3 dakikada görülenler
         ve adları. Çalışan listesini görme yetkisi olmayan rolde RLS boş döner;
         avatarlar "Ekip üyesi" olur, kabuk bozulmaz. */
      konsolHostu
        ? Promise.resolve({ data: null })
        /* Kendini ekibe çevrimdışı gösterenler bu listede yok (gizli).
           Son görülme yine yazılıyor; personel ekranı gerçek durumu
           göstermeye devam ediyor. */
        : supabase.from("user_presence").select("user_id,last_seen_at,gizli").eq("organization_id", membership.organization_id).gte("last_seen_at", ucDakikaOnce).eq("gizli", false),
      konsolHostu
        ? Promise.resolve({ data: null })
        : supabase.from("hr_employees").select("user_id,full_name").eq("organization_id", membership.organization_id).not("user_id", "is", null).limit(300),
    ]);
    return { notificationUnreadCount, ownEmployee, messagesInit, pendingAgreement, urunLisanslari, postaBilgisi, postaSayimi, varlikSatirlari, ekipSatirlari, kurumSimgesi: null as string | null };
  };
  const tekCagri = async () => {
    const [{ data, error }, postaBilgisi] = await Promise.all([
      supabase.rpc("arvo_panel_kabugu", {
        p_org: membership.organization_id,
        p_kurucu: isPlatformOwner,
        p_posta: postaYetkisi,
        p_mesaj: hasMessages,
        p_esik: ucDakikaOnce,
      }),
      postaYetkisi ? postaBaglantiDurumu(membership.organization_id) : Promise.resolve(null),
    ]);
    if (error || !data) return null;
    const k = data as {
      bildirim: number; personel: { id: string; full_name: string } | null; gizlilik: string | null;
      lisanslar: string[]; posta_okunmamis: number; varlik: { user_id: string; last_seen_at: string }[];
      ekip: { user_id: string; full_name: string }[]; kendi_gizli: boolean; simge?: string | null;
      mesaj?: { kisiler: unknown; kanallar: unknown; varlik: unknown; okunmamis: unknown };
    };
    return {
      notificationUnreadCount: Number(k.bildirim ?? 0),
      ownEmployee: k.personel,
      messagesInit: hasMessages && k.mesaj
        ? mesajlarBaslangici(membership.organization_id, userId, { employees: k.mesaj.kisiler, channelRows: k.mesaj.kanallar, presenceRows: k.mesaj.varlik, unreadRows: k.mesaj.okunmamis })
        : null,
      pendingAgreement: k.gizlilik ? { id: k.gizlilik } : null,
      urunLisanslari: konsolHostu ? null : (k.lisanslar ?? []).map((product) => ({ product })),
      postaBilgisi,
      postaSayimi: { count: Number(k.posta_okunmamis ?? 0) },
      varlikSatirlari: konsolHostu ? null : k.varlik,
      ekipSatirlari: konsolHostu ? null : k.ekip,
      kurumSimgesi: k.simge ?? null,
    };
  };
  const {
    notificationUnreadCount, ownEmployee, messagesInit, pendingAgreement, urunLisanslari,
    postaBilgisi, postaSayimi, varlikSatirlari, ekipSatirlari, kurumSimgesi,
  } = (await tekCagri()) ?? (await eskiYol());
  const sozlesmeGerekli = await sozlesmeSorgusu;
  const messageUnreadCount = messagesInit ? Object.values(messagesInit.unread).reduce((total, count) => total + count, 0) : 0;

  /*
    Kurumun sahip olduğu diğer Arvo ürünleri menünün altında. Panelde
    bunların hiçbir izi yoktu: ArvoLab'ı da alan bir kurum ürüne nasıl
    gideceğini bilmiyordu — adresi bilen elle yazıyor, bilmeyen "bize
    ArvoLab verilmemiş" sanıyordu.

    Konsolda çizilmiyor: orada tek bir kurumun paneli açık değil.
  */
  const acikUrunler = new Set(((urunLisanslari ?? []) as { product: string }[]).map((satir) => satir.product));
  const lisansliUrunler = [
    /* ArvoLab kendi yolundan: tek kullanımlık oturum bağlantısıyla, ikinci
       bir giriş ekranı görmeden. Yeni sekmede — kişi ArvoOS'taki işini
       kaybetmesin. Kullanıcı tıklamasıyla açıldığı için yönlendirme
       zinciri pencere engelleyicisine takılmıyor. */
    { kod: "arvolab", ad: "ArvoLab", href: "/panel/uygulama/arvolab", ayniSekme: false, marka: "arvolab" as const },
    { kod: "arc", ad: "ArvoARC", href: "https://arc.arvo-os.com", ayniSekme: false, marka: "arc" as const },
    { kod: "randevu", ad: "ArvoCal", href: "https://cal.arvo-os.com", ayniSekme: false },
  ].filter((uygulama) => acikUrunler.has(uygulama.kod));

  /*
    KURUCU KONSOLU (yonetim.arvo-os.com) uygulama ızgarasında, ama yalnızca
    oraya GERÇEKTEN girebilenlere. Koşul konsolun kendi kapısıyla birebir
    aynı: isPlatformOwner, yani Arvo'nun kendi kurumunda (arvo-os) owner
    rolü. Başkasına yetki vermek, o kişiyi arvo-os çalışma alanına owner
    olarak eklemek demek.

    Burası YETKİ VERMİYOR, yalnızca gösteriyor. Asıl kapı bu dosyanın
    yukarısında: konsol alan adına yetkisiz giren "Bu adres kurucu
    yönetimi içindir" ekranıyla karşılaşıyor. Menüde gizlemek üçüncü
    katman (AGENTS.md: RLS + sunucu + menü); tek başına koruma değil.

    Bağlantı yeni sekmede: konsol tek bir kurumun paneli değil, platformun
    kendisi — kurum panelindeki işin üstüne açılmamalı.
  */
  /*
    ORTAK POSTA KUTUSU MENÜDE, "UYGULAMALAR" PENCERESİNDE DEĞİL.

    Önce diğer ürünlerle aynı ızgaradaydı; ama o pencere ayrı ürünlere
    geçmek için ve ArvoOS'un kendi ekranı değil. Okunmamış sayısı da orada
    hiç işe yaramıyordu: rozetin bütün anlamı hiçbir şey açmadan görünmek,
    pencerenin içindeki rozeti görmek içinse pencereyi açmak gerekiyordu.

    Yalnızca kutu bağlıyken ve yetkisi olana görünür: bağlanacak bir şey
    yokken menüye boş bir girdi koymak, tıklayana "burada ne var" diye
    sordurup geri döndürürdü.
  */
  const postaGorunur = postaYetkisi && postaBilgisi?.durum === "bagli";

  // Okunmamış posta sayısı: sorgu ve gerekçesi yukarıda (postaSayimSorgusu).
  const postaOkunmamis = postaGorunur ? postaSayimi.count ?? 0 : 0;

  const digerUygulamalar = [
    ...lisansliUrunler,
    ...(isPlatformOwner
      ? [{ kod: "yonetim", ad: "Kurucu Konsolu", href: `https://${MANAGEMENT_HOST}/panel`, ayniSekme: false, marka: "yonetim" as const }]
      : []),
  ];

  // Beyaz etiket: kurum kendi marka rengini seçtiyse tüm panel vurgusu
  // (buton, aktif menü, rozet, odak halkası) o renge döner. Seçmediyse
  // panel-tokens.css içindeki fallback ArvoOS yeşilini kullanır.
  const tenantStyle = isPlatformOrg ? {} : tenantTheme(organization.brand_color);
  const agreementBanner = pendingAgreement
    ? <Link href={`/panel/confidentiality/${pendingAgreement.id}`} className="panel-agreement-banner"><span>Gizlilik sözleşmeniz imza bekliyor.</span><b>İncele ve İmzala →</b></Link>
    : null;

  /*
    ŞİRKET İŞLETİM SİSTEMİ KABUĞU (2026-10).

    Kenar menüsü + üst çubuk yerine: üstte durum çubuğu (kurum, açık
    uygulama, Ctrl+K araması, canlı bağlantı, çevrimiçi ekip, saat,
    mesajlar, bildirimler, hesap), altta uygulama dock'u. Her modül bir
    uygulama; liste os/os-apps.ts'te eski menünün yetki kuralıyla aynı.
    Kurucu konsolu aşağıdaki eski kabukta kalıyor: orası tek bir kurumun
    çalışma alanı değil.
  */
  if (!konsolHostu) {
    const uygulamalar = osUygulamalari({
      modules,
      role: membership.role,
      hiddenModuleKeys,
      posta: postaGorunur ? { okunmamis: postaOkunmamis } : null,
      mesajlar: messagesInit ? { okunmamis: messageUnreadCount } : null,
      erisim: { yetkiler, isPlatformOwner },
    });
    const varlik = Object.fromEntries(((varlikSatirlari ?? []) as { user_id: string; last_seen_at: string }[]).map((s) => [s.user_id, s.last_seen_at]));
    const ekip = ((ekipSatirlari ?? []) as { user_id: string; full_name: string | null }[])
      .map((s) => ({ userId: s.user_id, ad: formatPersonName(s.full_name) || "Ekip üyesi" }));
    const benimAdim = formatPersonName((ownEmployee as { full_name?: string | null } | null)?.full_name) || roleName;

    return <div className="panel-root os-root" style={tenantStyle}>{sozlesmeGerekli ? <SozlesmeOnayi cikis={logout} /> : null}<main className="panel-frame os-frame" inert={sozlesmeGerekli || undefined}>
      <PresenceHeartbeat />
      <NavProgress />
      <GlobalActionFeedback />
      <FlashToast />
      <header className="os-bar">
        {/* Telefonda alt sayfalarda geri (ana ekrana eklenen uygulamada tarayıcının geri tuşu yok). */}
        <OsGeri uygulamalar={uygulamalar} />
        <Link className="os-brand" href="/panel" aria-label={`${brandName} ana ekran`}>
          {/*
            KARE MARKA SİMGESİ (13.10.2026). Eskiden kiracıda yatay logo
            basılıyor, kurum adı ve açık uygulama gizleniyordu; ArvoOS'ta kare
            "A" + ad + uygulama vardı. Kurum sahibinin tarifi: hepsi ArvoOS
            gibi, "A" yerine kurumun yüklediği kare simge (Ayarlar → Kurumsal
            kimlik). Yalnızca kendi depomuzdaki dosya gösterilir
            (depodakiSimgeMi); yoksa kurum renginde baş harf.
          */}
          {!isPlatformOrg && depodakiSimgeMi(kurumSimgesi, process.env.NEXT_PUBLIC_SUPABASE_URL, organization.id)
            ? <img src={kurumSimgesi} alt="" />
            : <i aria-hidden="true">{basHarf(brandName)}</i>}
          <span><b>{brandName}</b><OsUygulamaAdi uygulamalar={uygulamalar} /></span>
        </Link>
        <OsAramaDugmesi />
        <div className="os-bar-right">
          <OsCanli organizationId={membership.organization_id} benimId={userId} ekip={ekip} baslangic={varlik} />
          <OsSaat />
          <div className="os-bar-actions">
            {postaGorunur ? <OsPostaDugmesi okunmamis={postaOkunmamis} /> : null}
            {/* Yeni posta anlık uyarısı rozetin yanında doğuyor; kutusu
                üst çubuğun altına, sağa çıkıyor (os-shell.css). */}
            {postaGorunur ? <OsPostaUyarisi organizationId={membership.organization_id} /> : null}
            {messagesInit ? <MessagesDrawer init={messagesInit} /> : null}
            <NotificationsDrawer unreadCount={notificationUnreadCount ?? 0} />
            <ThemeToggle />
          </div>
          <OsMenuKapat />
          <OsKullaniciMenusu ad={benimAdim} rol={roleName} kurum={brandName} paket={organization.plan_code} workspaces={workspaces} aktifKurumId={organization.id} abonelik={izin("finance.lisans.yonet")} cikis={logout} />
        </div>
      </header>
      {/* Telefonda açık uygulamanın bölümleri (masaüstünde gizli; orada dock'un ikinci katı). */}
      <OsBolumSeridi uygulamalar={uygulamalar} />
      <section className="os-workspace">
        <div className="panel-content">{agreementBanner}{children}</div>
      </section>
      {/* Onay penceresi açıkken dock ve komut paleti (Ctrl+K) çizilmez: pencerenin üstüne açılıp odağı çalmasınlar. */}
      {sozlesmeGerekli ? null : <OsDock uygulamalar={uygulamalar} digerUygulamalar={digerUygulamalar} />}
      {/* Uygulama kabuğu: çevrimdışı ekranı, yeni sürüm uyarısı, ana ekrana ekleme önerisi. */}
      <OsUygulamaKabugu />
      {sozlesmeGerekli ? null : <OsKomutPaleti uygulamalar={uygulamalar} cikis={logout} />}
      <OsCanliSayfa organizationId={membership.organization_id} />
      {/* Ctrl+K'daki müşteri araması bu pencereyi açar; yalnızca CRM'i görene. */}
      {uygulamalar.some((u) => u.key === "crm") ? <CustomerLookupHost /> : null}
    </main></div>;
  }

  /*
    KURUCU KONSOLU (yonetim.arvo-os.com) — 13.10.2026'dan beri AYNI
    İŞLETİM SİSTEMİ KABUĞU.

    Eskiden burası sol menü + breadcrumb çubuğuyla çiziliyordu ve gerekçe
    "orası tek bir kurumun çalışma alanı değil" idi. Ama kabuğun kiracıya
    özel parçaları (çalışma alanı seçici, mesaj çekmecesi, ekip varlığı,
    posta) zaten tek tek eleniyor; geriye kalan dock mantığının konsolda
    çalışmaması için bir sebep yoktu. Kurum sahibi gün içinde iki kabuk
    arasında gidip geliyor ve birinde dock, ötekinde sol menü arıyordu.

    Konsolda OLMAYANLAR ve sebepleri:
      - çalışma alanı seçici: konsol tek bir kurumun paneli değil,
      - mesaj ve posta: kurucunun kiracı yazışmaları buraya ait değil,
      - ekip varlığı (OsCanli): konsolda ekip yok, platform var,
      - bölüm şeridi: konsol uygulamalarının alt bölümü yok.
    Kalanlar panelle birebir aynı bileşen.
  */
  /*
    Dock rozetleri: onay bekleyen dekont ve sözleşme. İki `head` sayımı —
    satır çekilmiyor, yalnızca sayı. Sözleşme kuyruğu yalnızca sunucu
    anahtarıyla okunabiliyor (sozlesmeler sayfasındaki kuralın aynısı);
    anahtar yoksa rozet çizilmiyor, "0 sözleşme bekliyor" denmiyor.
  */
  /*
    Dock rozetleri: onay bekleyen dekont ve sözleşme. İki `head` sayımı —
    satır çekilmiyor, yalnızca sayı.

    TAMAMI TRY İÇİNDE (14.10.2026). İlk sürümde değildi ve konsolun
    BÜTÜN ekranları 500 verdi: layout her sayfayı sarıyor, orada atılan
    bir hata tek bir rozet için konsolu tamamen kapatıyor. Sayaç
    süslemedir; okunamadığında rozet çizilmez, konsol açılmaya devam
    eder. Sebep günlüğe yazılır.
  */
  let bekleyenOdeme = 0;
  let bekleyenSozlesme = 0;
  try {
    const konsolAdmin = createAdminClient();
    const [odemeSonucu, sozlesmeSonucu] = await Promise.all([
      supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      konsolAdmin
        ? konsolAdmin.from("platform_subscription_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
        : Promise.resolve({ count: 0, error: null }),
    ]);
    bekleyenOdeme = odemeSonucu.error ? 0 : odemeSonucu.count ?? 0;
    bekleyenSozlesme = sozlesmeSonucu.error ? 0 : sozlesmeSonucu.count ?? 0;
  } catch (hata) {
    console.error("[konsol] dock rozetleri okunamadı", hata instanceof Error ? hata.message : hata);
  }
  const konsolUygulamalariListesi = konsolUygulamalari({ odeme: bekleyenOdeme, sozlesme: bekleyenSozlesme });

  const konsolAdim = formatPersonName((ownEmployee as { full_name?: string | null } | null)?.full_name) || roleName;

  return <div className="panel-root os-root os-konsol">{sozlesmeGerekli ? <SozlesmeOnayi cikis={logout} /> : null}<main className="panel-frame os-frame" inert={sozlesmeGerekli || undefined}>
    <PresenceHeartbeat />
    <NavProgress />
    <GlobalActionFeedback />
    <FlashToast />
    <header className="os-bar">
      <OsGeri uygulamalar={konsolUygulamalariListesi} />
      <Link className="os-brand" href="/panel" aria-label="Kurucu Konsolu ana ekran">
        <i aria-hidden="true">◇</i>
        <span><b>Kurucu Konsolu</b><OsUygulamaAdi uygulamalar={konsolUygulamalariListesi} /></span>
      </Link>
      <OsAramaDugmesi />
      <div className="os-bar-right">
        <OsSaat />
        <div className="os-bar-actions">
          <NotificationsDrawer unreadCount={notificationUnreadCount ?? 0} />
          <ThemeToggle />
        </div>
        <OsMenuKapat />
        <OsKullaniciMenusu
          ad={konsolAdim} rol="Kurucu" kurum="ArvoOS" paket="PLATFORM"
          workspaces={[]} aktifKurumId={organization.id} cikis={logout}
        />
      </div>
    </header>
    <section className="os-workspace">
      <div className="panel-content">{agreementBanner}{children}</div>
    </section>
    {/* "Diğer uygulamalar": konsoldan kiracı paneline dönüş. Eskiden sol
        menünün dibinde bir bağlantıydı. */}
    {sozlesmeGerekli ? null : <OsDock
      uygulamalar={konsolUygulamalariListesi}
      digerUygulamalar={[{ kod: "panel", ad: "Kiracı Paneli", href: `https://${DEFAULT_APP_HOST}/panel`, ayniSekme: false, marka: "arvoos" as const }]}
    />}
    <OsUygulamaKabugu />
    {/* Ctrl+K kiracı adıyla da arıyor: konsolda en çok tekrarlanan
        gezinme "şu kurumun dosyasını aç" ve menüde karşılığı yok. */}
    {sozlesmeGerekli ? null : <OsKomutPaleti
      uygulamalar={konsolUygulamalariListesi}
      cikis={logout}
      kayitAramasi={{ etiket: "için kiracı ara", ipucu: "Müşteriler", adresOneki: "/panel/platform/musteriler?ara=" }}
    />}
  </main></div>;
}
