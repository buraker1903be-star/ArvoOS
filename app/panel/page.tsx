import { sureOlcer } from "@/lib/sure-olcumu";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { headers } from "next/headers";
import { getPanelContext } from "@/lib/panel-context";
import { hostFromHeaders, isManagementHost } from "@/lib/site/host-rules";
import { KonsolAnaSayfa } from "./konsol-ana-sayfa";
import { formatPersonName } from "@/lib/format-name";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { formatSubject } from "@/lib/table-format";
import { dueBadge, terminGruplari } from "@/lib/operasyon-termin";
import { postaBaglantiDurumu } from "@/lib/posta-hesabi";
import { activeStatuses, workflowStatusNames } from "./operations/ops-shared";
import { relativeTime } from "./crm/last-contact";
import { musteriMesajGondereni } from "@/lib/musteri-mesaji";
import { ORGANIZATION_LEGAL_COLUMNS } from "@/app/_components/legal/organization";
import { BELGEDE_ZORUNLU, eksikResmiAlanlar, legalDetailsFrom, validateLegalDetails } from "./settings/legal-details";
import { gunlukSeri } from "@/lib/gunluk-seri";
import { BugunPaneli } from "./os/bugun-paneli";
import { GorunumSecici, type GorunumPaneli } from "./os/gorunum-secici";
import { kurulumIlerlemesi } from "@/lib/kurulum-ilerlemesi";
import { GENEL_BAKIS_SATIR, GenelBakis, ListeKarti, ListeSatiri, SeriKarti, seriBaslangici, simdi, yeniMi } from "./os/genel-bakis";

/*
  ANA EKRAN (2026-10, şirket işletim sistemi).

  Kurum sahibinin çizdiği düzen: selamlama; tam genişlikte "Yeni talepler
  — son 14 gün"; altında dört sütun: son operasyonlar, yaklaşan aşama
  tarihleri, müşteri mesajları, gelen postalar. Her kart en fazla 6 satır
  (tek ekrana sığsın diye; ilk sürüm 10'du) ve kendi uygulamasına bağlantı verir.

  Eskiden burada sayı kartları (yeni talep, teklif bekleyen, tahsilat…),
  odak listesi, aşama dağılımı ve hareket akışı vardı; sayıların her biri
  zaten kendi uygulamasının genel bakışında duruyor. Ana ekran artık
  "şu an ne oluyor" listesi.

  Her kart yalnızca ilgili modül açıksa sorgulanır ve gösterilir. Ekran
  canlıdır: değişiklikte kendiliğinden tazelenir (os/os-canli-yenile).
*/

const TZ = "Europe/Istanbul";
const LISTE = GENEL_BAKIS_SATIR;

// Zamana bağlı yardımcılar bileşen gövdesinin dışında (saat gövdede okunmaz).
function greetingLine() {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
  const greeting = hour < 5 ? "İyi geceler" : hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : hour < 23 ? "İyi akşamlar" : "İyi geceler";
  const date = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now);
  return { greeting, date };
}

/** "8 Eki" — kısa tarih, Türkiye saatiyle. */
const kisaTarih = (deger: string | null | undefined) =>
  deger ? new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(`${deger.slice(0, 10)}T12:00:00Z`)) : "";

// ---------------------------------------------------------------
// Simgeler
// ---------------------------------------------------------------
const iconPaths: Record<string, ReactNode> = {
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
};
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}
const Chevron = () => (
  <svg className="dash-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
);

type IsSatiri = { id: string; title: string; customer_name: string | null; status: string; due_date: string | null; updated_at: string };
type AsamaSatiri = { id: string; title: string; due_date: string; workflow_id: string; operation_workflows: { title: string; customer_name: string | null } | null };
type MesajSatiri = { id: string; workflow_id: string; sender_name: string | null; body: string; created_at: string; read_at: string | null; operation_workflows: { title: string; customer_name: string | null } | null };
type PostaSatiri = { thread_id: string; konu: string | null; son_gonderen_ad: string | null; son_gonderen_adres: string | null; son_mesaj_at: string | null; okunmamis: boolean };

export default async function PanelPage() {
  /*
    Kurucu konsolunun (yonetim.arvo-os.com) ana sayfası ayrı: buradaki
    özet TEK BİR KURUMUN günü ve konsolda o kurum Arvo'nun kendisi olurdu.
  */
  if (isManagementHost(hostFromHeaders(await headers()))) return <KonsolAnaSayfa />;

  /* Okuma başına süre (lib/sure-olcumu): kurum panelinin ana sayfası
     app.akademikmerkez.com'da p75 ~0,7 sn; eşiği aşan açılış günlüğe yazılıyor. */
  const sure = sureOlcer("panel-ana");
  const { supabase, organization, isPlatformOwner, membership, modules, hiddenModuleKeys, userId, izin } = await sure.olc("baglam", getPanelContext());
  const organizationId = organization.id;
  const today = todayInIstanbul();

  const isOwner = isPlatformOwner || membership.role === "owner";
  const modulAcik = (kod: string) => modules.some((m) => m.code.replaceAll("-", "_").toLowerCase() === kod);
  const canSee = (moduleKey: string) => isOwner || !hiddenModuleKeys.has(moduleKey);
  const canSeeCrm = canSee("crm");
  const canSeeOperations = canSee("operations") && modulAcik("operations");
  /* Posta: menüdeki kuralla aynı — yetki ve kutu bağlı (layout.tsx). */
  const postaYetkisi = izin("posta.gor");
  /*
    Bağlantı durumu ve son postalar AYNI turda (22.10.2026, hız çalışması):
    eskiden önce durum okunuyor (hesabın tamamı, imza dahil), ancak sonra
    diğer sorgular başlıyordu. Kutu bağlı değilse okunan satırlar atılır.
  */
  const postaDurumSozu = sure.olc("posta_durumu", postaYetkisi ? postaBaglantiDurumu(organizationId) : Promise.resolve(null));
  /* Kutu bağlı değilse kart yine durur ve bunu söyler: dördüncü sütun boş
     kalmasın, bağlayabilen kişi nereden bağlanacağını görsün. */
  const postaBaglayabilir = izin("settings.kurum.yonet");
  // Kurulum kartı yalnızca kurum sahibi/yöneticisine; platform kurucusu görmez.
  const canSetup = !isPlatformOwner && izin("settings.kurulum.yonet");
  const none = Promise.resolve({ data: null, count: 0, error: null });

  const [
    { data: talepTarihleri, error: talepError },
    { data: isRows, error: isError },
    { data: asamaRows, error: asamaError },
    { data: mesajRows, error: mesajError },
    { data: postaRows, error: postaError },
    // hata-tamam: yalnızca selamlamadaki ad; düşerse selam adsız kalır, hiçbir sayı etkilenmez
    { data: me },
    { data: onboardingRow, error: onboardingError },
    { data: setupOrganization, error: setupOrganizationError },
    { count: memberCount, error: memberCountError },
    { count: talepToplami },
  ] = await sure.olc("ana_tur", Promise.all([
    // Trend: yalnızca son 28 günün oluşturulma tarihleri (sınırsız, sayım doğru).
    canSeeCrm ? supabase.from("crm_opportunities").select("created_at").eq("organization_id", organizationId).gte("created_at", seriBaslangici()) : none,
    /* Açık işler termine göre: en az günü kalan (gecikmiş olan) en üstte,
       termini girilmemiş iş en sonda. Eskiden son güncellenen altı iş
       sırasız listeleniyordu; 10 gün kalan iş 79 gün kalanın altında
       kalıyor, yaklaşan termin gözden kaçabiliyordu. Sıralama sorguda:
       bellekte sıralamak yalnızca son güncellenen altı işi dizerdi. */
    canSeeOperations
      ? supabase.from("operation_workflows").select("id,title,customer_name,status,due_date,updated_at")
          .eq("organization_id", organizationId).in("status", [...activeStatuses])
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("updated_at", { ascending: false }).limit(LISTE)
      : none,
    /* Yaklaşan aşamalar: tamamlanmamış, tarihi olan; gecikmişler en üstte
       (tarih sırası). İşi iptal/arşiv olanlar dışarıda (operasyon genel
       bakışıyla aynı kural). */
    canSeeOperations
      ? supabase.from("operation_steps").select("id,title,due_date,workflow_id,operation_workflows!inner(title,customer_name,status)")
          .eq("organization_id", organizationId).eq("is_completed", false).not("due_date", "is", null)
          .in("operation_workflows.status", [...activeStatuses])
          .order("due_date", { ascending: true }).limit(LISTE)
      : none,
    // !inner: mesajın işi RLS'te görünmüyorsa mesaj da gelmez (operasyon sayfasıyla aynı).
    canSeeOperations
      ? supabase.from("customer_file_messages").select("id,workflow_id,sender_name,body,created_at,read_at,operation_workflows!inner(title,customer_name,status)")
          .eq("organization_id", organizationId).eq("sender_type", "customer").neq("operation_workflows.status", "cancelled")
          .order("created_at", { ascending: false }).limit(LISTE)
      : none,
    postaYetkisi
      ? supabase.from("mail_threads").select("thread_id,konu,son_gonderen_ad,son_gonderen_adres,son_mesaj_at,okunmamis")
          .eq("organization_id", organizationId).is("silindi_at", null)
          .order("son_mesaj_at", { ascending: false, nullsFirst: false }).limit(LISTE)
      : none,
    supabase.from("hr_employees").select("full_name").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    canSetup ? supabase.from("organization_onboarding").select("completed_at").eq("organization_id", organizationId).maybeSingle() : none,
    canSetup ? supabase.from("organizations").select(`${ORGANIZATION_LEGAL_COLUMNS},logo_url,signature_stamp_url`).eq("id", organizationId).maybeSingle() : none,
    canSetup ? supabase.from("organization_memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_active", true) : none,
    // Kurulum adımı "ilk talebinizi girin" için: kurumda hiç talep var mı.
    canSetup && canSeeCrm ? supabase.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", organizationId) : none,
  ]));
  const canSeePosta = postaYetkisi && (await postaDurumSozu)?.durum === "bagli";

  /*
    Supabase istemcisi hata fırlatmaz, yalnızca error alanına yazar; okuma
    hatası "hiç kayıt yok" gibi görünmesin diye kullanıcıya söylenir.
  */
  const failedQueries = ([
    ["Talepler", talepError],
    ["Operasyonlar", isError],
    ["Aşamalar", asamaError],
    ["Müşteri mesajları", mesajError],
    ["Postalar", canSeePosta ? postaError : null],
    ["Kurulum durumu", onboardingError],
    ["Kurum bilgileri", setupOrganizationError],
    ["Ekip sayısı", memberCountError],
  ] as [string, { message: string } | null | undefined][])
    .filter((row): row is [string, { message: string }] => Boolean(row[1]));
  if (failedQueries.length)
    console.error("[panel] ana sayfa sorguları okunamadı", {
      organizationId,
      role: membership.role,
      failures: failedQueries.map(([label, error]) => `${label}: ${error.message}`),
    });

  const trend = gunlukSeri(((talepTarihleri ?? []) as { created_at: string }[]).map((row) => row.created_at), simdi());
  const isler = (isRows ?? []) as IsSatiri[];
  const asamalar = (asamaRows ?? []) as unknown as AsamaSatiri[];
  const mesajlar = (mesajRows ?? []) as unknown as MesajSatiri[];
  const postalar = (canSeePosta ? postaRows ?? [] : []) as PostaSatiri[];

  // Kurulum adımları: belgeler ve müşteri ekranı eksiksiz görünene kadar
  // gösterilir; hepsi tamamlanınca kart kendiliğinden kaybolur. Ölçütler
  // Ayarlar'daki "Belge kimliği" ile aynıdır. Ekip adımı isteğe bağlı.
  type SetupStep = { key: string; title: string; note: string; href: string; done: boolean; optional?: boolean };
  const setupSteps: SetupStep[] = [];
  if (canSetup && setupOrganization) {
    const row = setupOrganization as Record<string, unknown> & { logo_url?: string | null; signature_stamp_url?: string | null };
    const legal = legalDetailsFrom(row);
    /* Ölçüt ortak: teklif/sözleşme ekranındaki uyarı da aynı listeyi
       soruyor (settings/legal-details · BELGEDE_ZORUNLU). */
    const eksikler = eksikResmiAlanlar(legal);
    const legalFilled = BELGEDE_ZORUNLU.length - eksikler.length;
    const legalComplete = !eksikler.length && !Object.keys(validateLegalDetails(legal)).length;
    const hasLogo = Boolean(row.logo_url);
    const hasSignature = Boolean(row.signature_stamp_url);
    const members = memberCount ?? 0;
    const talepVar = (talepToplami ?? 0) > 0;
    setupSteps.push(
      { key: "kurum", title: "Kurum ve marka", note: "Resmi ad, iletişim, logo ve marka rengi", href: "/panel/onboarding", done: Boolean((onboardingRow as { completed_at?: string | null } | null)?.completed_at) },
      { key: "resmi", title: "Resmi bilgiler ve IBAN", note: legalComplete ? "Belgelere otomatik yazılıyor" : `${legalFilled}/${BELGEDE_ZORUNLU.length} zorunlu alan dolu`, href: "/panel/settings?bolum=resmi-bilgiler", done: legalComplete },
      { key: "kimlik", title: "Logo ve kaşe-imza", note: hasLogo && hasSignature ? "Belgelerde görünüyor" : hasLogo ? "Kaşe-imza görseli eksik" : hasSignature ? "Logo eksik" : "Logo ve kaşe-imza görseli eksik", href: "/panel/settings?bolum=kurumsal-kimlik", done: hasLogo && hasSignature },
      { key: "ekip", title: "Ekibinizi davet edin", note: members > 1 ? `${members} kişi panelde` : "Satış ve operasyon ekibinizi ekleyin", href: "/panel/hr", done: members > 1, optional: true },
    );
    if (canSeeCrm) setupSteps.push({ key: "talep", title: "İlk talebinizi girin", note: talepVar ? `${talepToplami} talep kayıtlı` : "Teklif, sözleşme ve takip buradan başlar", href: "/panel/crm", done: talepVar });
  }
  /* Sayaç, çubuk, "kaldı" metni ve kartın kapanması aynı zorunlu
     listeden (OS-03, lib/kurulum-ilerlemesi.ts); isteğe bağlı ekip adımı
     ayrı bölümde ve ilerlemeye girmiyor. */
  const ilerleme = kurulumIlerlemesi(setupSteps);
  const showSetup = ilerleme.toplam > 0 && !ilerleme.bitti;

  /*
    GÜN BİR (15.10.2026). Kurum daha hiç çalışmaya başlamamışken ana
    ekranın TAMAMI "yok" diyor: altı sıfır kutusu, boş grafik, dört boş
    liste. Ekranda tek anlamlı şey kurulum adımları, ama telefonda
    "Bugün" paneli en üstte olduğu için onlar altı sıfırın ALTINDA
    kalıyordu — masaüstünde (panel gizli) zaten üstteydi, yani rehber
    tam da kurum sahibinin oturduğu cihazda gürültünün arkasındaydı.
    İlk kayıt girilir girilmez olağan sıraya dönüyor.
  */
  const hicKayitYok = !isler.length && !asamalar.length && !mesajlar.length && !postalar.length
    && !trend.total && !trend.previous && (talepToplami ?? 0) === 0;
  const kurulumOnce = showSetup && hicKayitYok;

  const kurulumKarti = showSetup ? (
    <section className="dash-card dash-setup" aria-label="Kurulum">
      <header className="dash-card-head">
        <div>
          <h2>Kurulumu tamamlayın</h2>
          <p>Teklif, sözleşme ve müşteri takip ekranınızın eksiksiz görünmesi için {ilerleme.toplam - ilerleme.tamamlanan} zorunlu adım kaldı.</p>
        </div>
        <div className="dash-setup-progress" role="progressbar" aria-valuemin={0} aria-valuemax={ilerleme.toplam} aria-valuenow={ilerleme.tamamlanan} aria-valuetext={ilerleme.ozet}>
          <b>{ilerleme.tamamlanan}/{ilerleme.toplam}</b>
          <span><i style={{ "--w": `${ilerleme.yuzde}%` } as CSSProperties} /></span>
          <small>{ilerleme.ozet}</small>
        </div>
      </header>
      <ol className="dash-setup-list">
        {ilerleme.zorunlu.map((step, index) => {
          const content = (
            <>
              <span className="dash-setup-dot" aria-hidden="true">{step.done ? <Icon name="check" size={14} /> : index + 1}</span>
              <span className="dash-setup-text">
                <b>{step.title}</b>
                <small>{step.note}</small>
                {step.done ? <span className="dash-setup-state">Tamamlandı</span> : <span className="dash-setup-go">Tamamla <Chevron /></span>}
              </span>
            </>
          );
          return (
            <li key={step.key}>
              {step.done
                ? <div className="dash-setup-step is-done">{content}</div>
                : <Link className="dash-setup-step" href={step.href}>{content}</Link>}
            </li>
          );
        })}
      </ol>
      {ilerleme.istegeBagli.length ? (
        <div className="dash-setup-istege" aria-label="İsteğe bağlı adımlar">
          <small className="dash-setup-istege-bas">İsteğe bağlı · kurulum ilerlemesine sayılmaz</small>
          <ul className="dash-setup-list">
            {ilerleme.istegeBagli.map((step) => {
              const content = (
                <>
                  <span className="dash-setup-dot" aria-hidden="true">{step.done ? <Icon name="check" size={14} /> : "+"}</span>
                  <span className="dash-setup-text">
                    <b>{step.title}</b>
                    <small>{step.note}</small>
                    {step.done ? <span className="dash-setup-state">Yapıldı</span> : <span className="dash-setup-go">Davet et <Chevron /></span>}
                  </span>
                </>
              );
              return (
                <li key={step.key}>
                  {step.done
                    ? <div className="dash-setup-step is-done is-istege">{content}</div>
                    : <Link className="dash-setup-step is-istege" href={step.href}>{content}</Link>}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  ) : null;

  /*
    GECİKMİŞ / YAKLAŞAN (10.11.2026). Sorgu sırası değişmedi (termin
    artan, gecikmiş en üstte); satırlar yalnızca başlıklı iki gruba
    bölünüyor, "gecikmiş" kararı dueBadge'in (lib/operasyon-termin ·
    terminGruplari). Liste en fazla LISTE satır: hepsi gecikmişse
    yaklaşanlar görünmez — bunu kartın altında söylüyoruz, sessizce
    "yaklaşan yok" demiyoruz.
  */
  const isSatiri = (is: IsSatiri) => {
    const rozet = dueBadge(is.due_date, today, is.status);
    return (
      <ListeSatiri
        key={is.id}
        href={`/panel/operations/${is.id}`}
        baslik={formatSubject(is.title)}
        baslikIpucu={is.title}
        alt={<><span className="dash-col-musteri">{is.customer_name || "Kurum içi iş"}</span> · {workflowStatusNames[is.status] ?? is.status}</>}
        sag={is.due_date ? <span className="status-pill" data-tone={rozet.tone}>{rozet.label}</span> : null}
        yeni={yeniMi(is.updated_at)}
      />
    );
  };
  const asamaSatiri = (asama: AsamaSatiri) => {
    const rozet = dueBadge(asama.due_date, today);
    return (
      <ListeSatiri
        key={asama.id}
        href={`/panel/operations/${asama.workflow_id}`}
        baslik={formatSubject(asama.title)}
        baslikIpucu={asama.title}
        /* Aşama adı tek başına hangi işin maddesi olduğunu söylemiyor: müşteri ve iş adı alt satırda. */
        alt={<><span className="dash-col-musteri">{asama.operation_workflows?.customer_name || "Kurum içi iş"}</span> · {formatSubject(asama.operation_workflows?.title)}</>}
        sag={<span className="status-pill" data-tone={rozet.tone} title={kisaTarih(asama.due_date)}>{rozet.label}</span>}
      />
    );
  };
  const isG = terminGruplari(isler, (is) => is.due_date, today, (is) => is.status);
  const isGruplari = [
    { anahtar: "gecikmis", baslik: "Gecikmiş", ton: "danger" as const, satirlar: isG.gecikmis.map(isSatiri) },
    { anahtar: "yaklasan", baslik: "Yaklaşan", satirlar: isG.yaklasan.map(isSatiri) },
    { anahtar: "tarihsiz", baslik: "Termin girilmemiş", satirlar: isG.tarihsiz.map(isSatiri) },
  ];
  const isNotu = isler.length >= LISTE && isG.gecikmis.length === isler.length ? `İlk ${LISTE} iş gecikmiş; yaklaşan işler Tüm işler'de.` : undefined;
  const asamaG = terminGruplari(asamalar, (a) => a.due_date, today);
  const asamaGruplari = [
    { anahtar: "gecikmis", baslik: "Gecikmiş", ton: "danger" as const, satirlar: asamaG.gecikmis.map(asamaSatiri) },
    { anahtar: "yaklasan", baslik: "Yaklaşan", satirlar: asamaG.yaklasan.map(asamaSatiri) },
  ];
  const asamaNotu = asamalar.length >= LISTE && asamaG.gecikmis.length === asamalar.length ? `İlk ${LISTE} aşama gecikmiş; yaklaşanlar takvimde.` : undefined;

  const { greeting, date } = greetingLine();
  const firstName = formatPersonName(me?.full_name).split(" ")[0];

  sure.bitir();
  /*
    SAYFA KAYMAZ, KART KAYAR (10.11.2026, ürün kuralı; os/gorunum-secici).
    Masaüstünde liste kartları kalan yüksekliği paylaşır ve her biri kendi
    içinde kayar (NAV-02: uzun aşama kartı kardeşlerinin altında boşluk
    bırakıyordu). Telefonda kartlar yığılmaz: görünüm seçici. Kurulum kartı
    gün bir'de Bugün panelinin ÖNÜNDE (yukarıdaki not).
  */
  const paneller: GorunumPaneli[] = [];
  const kurulumPaneli: GorunumPaneli | null = kurulumKarti ? { anahtar: "kurulum", etiket: "Kurulum", yer: "ust", icerik: kurulumKarti } : null;
  if (kurulumOnce && kurulumPaneli) paneller.push(kurulumPaneli);
  /* Telefonda "Bugün": hızlı işlemler, yönetici kutuları, adımlarım (masaüstünde gizli, bugun-paneli.css). */
  if (canSeeCrm || canSeeOperations) {
    paneller.push({
      anahtar: "bugun", etiket: "Bugün", yer: "ust", sadeceTelefon: true,
      icerik: <BugunPaneli supabase={supabase} orgId={organizationId} userId={userId} izin={izin}
        crmGorur={canSeeCrm && modulAcik("crm")} operasyonGorur={canSeeOperations}
        finansGorur={canSee("finance") && modulAcik("finance") && izin("finance.gor")}
        yeniKurum={hicKayitYok} />,
    });
  }
  if (!kurulumOnce && kurulumPaneli) paneller.push(kurulumPaneli);
  /* Boş durumdaki "Yeni talep", telefondaki Bugün panelinin kısayoluyla aynı kural: CRM'i gören ve modülü açık olan. */
  if (canSeeCrm) {
    paneller.push({
      anahtar: "talepler", etiket: "Talepler", yer: "ust",
      icerik: <SeriKarti baslik="Yeni talepler" alt="Son 14 gün" seri={trend} adet="talep" hata={Boolean(talepError)}
        bos={hicKayitYok ? "İlk talebinizi girdiğinizde günlük dağılım burada çizilir." : "Son 14 günde yeni talep yok. Talep girildiğinde günlük dağılım burada çizilir."}
        eylem={modulAcik("crm") ? { href: "/panel/crm?yeni=talep", etiket: "+ Yeni talep" } : undefined} />,
    });
  }
  if (canSeeOperations) {
    paneller.push({ anahtar: "operasyon", etiket: "Operasyon", yer: "liste", icerik: (
          <ListeKarti baslik="Operasyon" alt={`Termini en yakın ${LISTE} iş`} bos={hicKayitYok ? "Sözleşme imzalanınca iş burada açılır; termini en yakın olan en üstte durur." : "Açık operasyon yok."} href="/panel/operations/isler" hrefEtiket="Tüm işler" sayi={isler.length}
            hata={Boolean(isError)} gruplar={isGruplari} not={isNotu}>
          </ListeKarti>
    ) });
    paneller.push({ anahtar: "asamalar", etiket: "Aşamalar", yer: "liste", icerik: (
          <ListeKarti baslik="Aşama tarihleri" alt={`Tarihi en yakın ${LISTE} aşama`} bos={hicKayitYok ? "İşin adımlarına tarih girdikçe yaklaşanlar burada sıralanır." : "Tarihi girilmiş açık aşama yok."} href="/panel/operations/takvim" hrefEtiket="Takvimde gör" sayi={asamalar.length}
            hata={Boolean(asamaError)} gruplar={asamaGruplari} not={asamaNotu}>
          </ListeKarti>
    ) });
    paneller.push({ anahtar: "mesajlar", etiket: "Mesajlar", yer: "liste", icerik: (
          <ListeKarti baslik="Müşteri mesajları" alt={`Gelen müşteri mesajları, son ${LISTE}`} bos={hicKayitYok ? "Müşteriniz iş portalından yazdığında mesajı burada görürsünüz." : "Müşterilerden mesaj yok."} href="/panel/operations/isler" hrefEtiket="İşlere git" sayi={mesajlar.length} hata={Boolean(mesajError)}>
            {mesajlar.map((mesaj) => (
              /* Operasyon genel bakışıyla aynı: iş detayı mesaj penceresi açık gelir. */
              <ListeSatiri
                key={mesaj.id}
                href={`/panel/operations/${mesaj.workflow_id}?pencere=mesajlar`}
                baslik={formatPersonName(musteriMesajGondereni(mesaj.operation_workflows?.customer_name, mesaj.sender_name))}
                alt={mesaj.body}
                onizleme
                zaman={relativeTime(mesaj.created_at)}
                okunmamis={!mesaj.read_at}
                yeni={yeniMi(mesaj.created_at)}
              />
            ))}
          </ListeKarti>
    ) });
  }
  if (canSeePosta) {
    paneller.push({ anahtar: "posta", etiket: "Posta", yer: "liste", icerik: (
          <ListeKarti baslik="Gelen postalar" alt={`Gelen müşteri e-postaları, son ${LISTE}`} bos="Kutuda konuşma yok." href="/panel/posta" hrefEtiket="Postaya git" sayi={postalar.length} hata={Boolean(postaError)}>
            {postalar.map((posta) => (
              <ListeSatiri
                key={posta.thread_id}
                href={`/panel/posta/${posta.thread_id}`}
                baslik={posta.son_gonderen_ad || posta.son_gonderen_adres || "Bilinmeyen gönderen"}
                alt={posta.konu || "(konu yok)"}
                onizleme
                zaman={posta.son_mesaj_at ? relativeTime(posta.son_mesaj_at) : undefined}
                okunmamis={posta.okunmamis}
                yeni={yeniMi(posta.son_mesaj_at)}
              />
            ))}
          </ListeKarti>
    ) });
  } else if (postaYetkisi) {
    paneller.push({ anahtar: "posta", etiket: "Posta", yer: "liste", icerik: (
          <ListeKarti
            baslik="Gelen postalar"
            alt="Gelen müşteri e-postaları"
            bos={postaBaglayabilir ? "Ortak posta kutusu henüz bağlı değil." : "Kurum yöneticiniz ortak posta kutusunu bağladığında gelen postalar burada görünür."}
            href={postaBaglayabilir ? "/panel/settings?bolum=entegrasyonlar#posta" : undefined}
            hrefEtiket="Posta kutusunu bağla"
            sayi={0}
          />
    ) });
  }

  return (
    <GenelBakis
      sinif="dash-sabit"
      ust={<span className="dash-tarih">{date}</span>}
      baslik={<>{greeting}{firstName ? `, ${firstName}` : ""}</>}
      uyari={failedQueries.map(([label]) => label)}
    >
      <GorunumSecici etiket="Ana ekran görünümü" paneller={paneller} />
    </GenelBakis>
  );
}
