import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPersonName } from "@/lib/format-name";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { kotaDurumu } from "@/lib/kota-durumu";
import { renewalReminders, REMINDER_WINDOW_DAYS, type RenewalLicense, type RenewalOrganization } from "@/lib/renewal-reminders";
import { StgIcon } from "./settings/settings-ui";
import { para, tarihSaat } from "./platform/bicim";
import "./dashboard.css";

/*
  Kurucu konsolunun ana sayfası (yalnızca yonetim.arvo-os.com).

  Konsolun bir "eve dönüş" noktası yoktu: menü doğrudan kiracı listesiyle
  başlıyordu ve kurucunun ilk sorusu ("bugün neye bakmam gerek") hiçbir
  ekranda yanıtlanmıyordu — yanıtı yedi sayfayı tek tek gezerek
  topluyordu.

  Kiracı panelinin ana sayfasıyla AYNI dil (dash-*): selamlama, dokunulabilir
  widget'lar, odak listesi. Kurucu gün içinde iki kabuk arasında gidip
  geliyor; ikisinin ana sayfası farklı görünürse hangi alan adında olduğu
  her seferinde yeniden okunuyordu.

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

const Chevron = () => (
  <svg className="dash-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
);

type Kurum = { id: string; name: string; display_name: string | null; kind: string | null; provisioning_state: string; contact_phone: string | null };
type CekirdekLisans = { organization_id: string; license_status: string; monthly_fee: number | null; user_limit: number; storage_limit_mb: number; ai_credit_limit: number; ai_credits_used: number };
type UrunLisansi = { organization_id: string; product: string; status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null };
type KurulumKaydi = { id: number | string; organization_id: string; action: string; result: string | null; state: string | null; created_at: string };

export async function KonsolAnaSayfa() {
  const { supabase, userId, isPlatformOwner } = await getPanelContext();
  /* Kabuk da eliyor (layout.tsx) ama yetki üç yerde birden duruyor
     (AGENTS.md): kabuğun bir gün değişmesi bu sayfayı açmamalı. */
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();

  const [
    { data: kurumSatirlari },
    { data: uyelikler },
    { data: cekirdekSatirlari },
    { data: urunSatirlari },
    bekleyenOdeme,
    { data: profil },
    { data: personel },
    { data: depolamalar },
  ] = await Promise.all([
    supabase.from("organizations").select("id,name,display_name,kind,provisioning_state,contact_phone").order("name"),
    supabase.from("organization_memberships").select("organization_id,is_active"),
    supabase.from("organization_licenses").select("organization_id,license_status,monthly_fee,user_limit,storage_limit_mb,ai_credit_limit,ai_credits_used"),
    supabase.from("organization_product_licenses").select("organization_id,product,status,monthly_fee,current_period_end,trial_ends_at"),
    supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    /* Ad birden çok yerde olabilir ve hiçbiri zorunlu değil; davet
       akışından geçmeden açılmış bir hesabın profiles kaydı yok ve
       selamlama adsız kalıyordu. */
    supabase.from("hr_employees").select("full_name").eq("user_id", userId).limit(1).maybeSingle(),
    /* Depolama storage.objects'ten geliyor; o tablo PostgREST'e açık değil
       ve olmamalı. Fonksiyon yalnızca kurum başına TOPLAM döndürüyor. */
    admin ? admin.rpc("arvo_storage_usage") : Promise.resolve({ data: [] }),
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

  const [arvolab, arc, randevu] = await Promise.all([
    getArvolabBridgeHealth(),
    getArcBridgeHealth(),
    getRandevuBridgeHealth(),
  ]);

  const kurumlar = (kurumSatirlari ?? []) as Kurum[];
  const musteriler = kurumlar.filter((kurum) => kurum.kind !== "internal");
  const kurumAdi = new Map(kurumlar.map((kurum) => [kurum.id, kurum.display_name || kurum.name]));

  const aktifUye = new Map<string, number>();
  for (const satir of (uyelikler ?? []) as { organization_id: string; is_active: boolean }[]) {
    if (satir.is_active) aktifUye.set(satir.organization_id, (aktifUye.get(satir.organization_id) ?? 0) + 1);
  }
  const depolamaBayt = new Map(
    ((depolamalar ?? []) as { organization_id: string; bytes: number }[]).map((satir) => [satir.organization_id, Number(satir.bytes ?? 0)]),
  );
  const cekirdek = (cekirdekSatirlari ?? []) as CekirdekLisans[];
  const kota = new Map(cekirdek.map((lisans) => [lisans.organization_id, kotaDurumu({
    organizationId: lisans.organization_id,
    kullaniciSayisi: aktifUye.get(lisans.organization_id) ?? 0,
    kullaniciLimiti: lisans.user_limit,
    aiKullanilan: lisans.ai_credits_used,
    aiLimiti: lisans.ai_credit_limit,
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
  const musteriMi = new Set(musteriler.map((kurum) => kurum.id));
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

  const kopruler = [
    arvolab?.broken
      ? {
          ad: "ArvoLab köprüsü",
          not: arvolab.permanent
            ? "Anahtar eksik ya da iki tarafta farklı; bireysel abonelikler denetlenemiyor."
            : "ArvoLab, ArvoOS'a ulaşamıyor; kullanıcılar engellenmiyor ama abonelik denetimi durdu.",
        }
      : null,
    !arc.ok ? { ad: "ARC köprüsü", not: arc.error ? `Bağlanılamadı: ${arc.error}` : `Tanımlı olmayan değişkenler: ${arc.missing.join(", ")}` } : null,
    !randevu.ok ? { ad: "Randevu köprüsü", not: randevu.error ? `Bağlanılamadı: ${randevu.error}` : `Tanımlı olmayan değişkenler: ${randevu.missing.join(", ")}` } : null,
  ].filter(Boolean) as { ad: string; not: string }[];

  const widgetlar: { etiket: string; deger: string | number; not: string; href: string; icon: string; tone: Tone }[] = [
    { etiket: "Müşteri kurum", deger: musteriler.length, not: `${kullanimda} tanesi kullanımda`, href: "/panel/platform", icon: "building", tone: "info" },
    { etiket: "Beklenen aylık", deger: para(aylikGelir), not: "Ödeyen lisanslardan", href: "/panel/platform/billing", icon: "wallet", tone: "gold" },
    {
      etiket: "Onay bekleyen", deger: onayBekleyen, href: "/panel/platform/payments", icon: "check",
      not: onayBekleyen ? `${odemeSayisi} ödeme${sozlesmeSayisi === null ? "" : ` · ${sozlesmeSayisi} sözleşme`}` : "Kuyruk boş",
      tone: onayBekleyen ? "danger" : "success",
    },
    { etiket: "Dikkat gerektiren", deger: dikkatGerektiren, not: dikkatGerektiren ? "Kurulum hatası ya da kota aşımı" : "Sorun yok", href: "/panel/platform?filtre=dikkat", icon: "shield", tone: dikkatGerektiren ? "danger" : "success" },
  ];

  const odak = ([
    { etiket: "Kurulum bekleyen kiracı", sayi: kurulumBekleyen, href: "/panel/platform?filtre=kurulum", icon: "users", tone: "info" },
    sozlesmeSayisi === null
      ? null
      : { etiket: "Onay bekleyen sözleşme", sayi: sozlesmeSayisi, href: "/panel/platform/sozlesmeler", icon: "doc", tone: "gold" },
    { etiket: "İncelenecek ödeme bildirimi", sayi: odemeSayisi, href: "/panel/platform/payments", icon: "wallet", tone: "gold" },
    { etiket: `Dönemi ${REMINDER_WINDOW_DAYS} gün içinde dolan abonelik`, sayi: hatirlatmalar.length, href: "/panel/platform/billing", icon: "box", tone: "danger" },
    { etiket: "Kota aşımı ya da kurulum hatası", sayi: dikkatGerektiren, href: "/panel/platform?filtre=dikkat", icon: "shield", tone: "danger" },
  ] as ({ etiket: string; sayi: number; href: string; icon: string; tone: Tone } | null)[]).filter(Boolean) as { etiket: string; sayi: number; href: string; icon: string; tone: Tone }[];

  const bolumler = [
    { etiket: "Tüm kiracılar", not: `${kurumlar.length} kurum kaydı`, href: "/panel/platform", icon: "building" },
    { etiket: "Lisans ve kota", not: "Paket, limit ve deneme süresi", href: "/panel/platform/licenses", icon: "box" },
    { etiket: "Abonelikler", not: "Gelir, tahsilat ve hatırlatmalar", href: "/panel/platform/billing", icon: "wallet" },
    { etiket: "Modül matrisi", not: "Hangi modül hangi kiracıda açık", href: "/panel/platform/moduller", icon: "grid" },
    { etiket: "Tüm üyeler", not: "Üç ürünün kullanıcıları tek listede", href: "/panel/platform/members", icon: "users" },
    { etiket: "Bireysel aboneler", not: "Kuruma bağlı olmayan kullanıcılar", href: "/panel/platform/subscribers", icon: "support" },
  ];

  const kurulumlar = (kurulumKayitlari ?? []) as KurulumKaydi[];

  return (
    <div className="dash">
      <header className="dash-hero">
        <div>
          <small className="panel-kicker">{tarih.toLocaleUpperCase("tr-TR")}</small>
          <h1>{selam}{ad ? `, ${ad}` : ""}</h1>
          <p>{ozet}</p>
        </div>
        <div className="panel-page-actions">
          <Link className="panel-secondary" href="/panel/platform/billing">Abonelikler</Link>
          <Link className="panel-primary" href="/panel/platform">Tüm kiracılar</Link>
        </div>
      </header>

      {/* Köprüler sessizce kopuyor: hata yalnızca karşı taraftaki günlükte
          kalıyor ve kurucu aylar sonra fark ediyordu. Konsolun ilk ekranı
          bunu söylemeli. */}
      {kopruler.map((kopru) => (
        <p className="dash-uyari" data-tone="danger" role="alert" key={kopru.ad}>
          <span aria-hidden="true"><StgIcon name="shield" size={16} /></span>
          <span><b>{kopru.ad} yanıt vermiyor</b><small>{kopru.not}</small></span>
        </p>
      ))}

      <section className="dash-widgets" aria-label="Platform özeti">
        {widgetlar.map((widget) => (
          <Link className="dash-widget" data-tone={widget.tone} href={widget.href} key={widget.etiket}>
            <span className="dash-widget-icon"><StgIcon name={widget.icon} /></span>
            <small>{widget.etiket}</small>
            <strong>{widget.deger}</strong>
            <span className="dash-widget-note">{widget.not}</span>
          </Link>
        ))}
      </section>

      <section className="dash-grid">
        <article className="dash-card dash-focus">
          <header className="dash-card-head"><div><h2>Bugün neye bakmalı?</h2><p>Bekleyen işler</p></div></header>
          <nav className="dash-list">
            {odak.map((satir) => (
              <Link className="dash-row" data-tone={satir.sayi ? satir.tone : "neutral"} href={satir.href} key={satir.etiket}>
                <span className="dash-row-icon"><StgIcon name={satir.icon} size={17} /></span>
                <span className="dash-row-label">{satir.etiket}</span>
                <b className={`dash-row-count${satir.sayi ? "" : " is-zero"}`}>{satir.sayi}</b>
                <Chevron />
              </Link>
            ))}
          </nav>
        </article>

        <article className="dash-card">
          <header className="dash-card-head"><div><h2>Bölümler</h2><p>Konsolun tamamı</p></div></header>
          <nav className="dash-list">
            {bolumler.map((bolum) => (
              <Link className="dash-row" data-tone="brand" href={bolum.href} key={bolum.href}>
                <span className="dash-row-icon"><StgIcon name={bolum.icon} size={17} /></span>
                <span className="dash-row-label">{bolum.etiket}<small className="dash-row-note">{bolum.not}</small></span>
                <Chevron />
              </Link>
            ))}
          </nav>
        </article>

        <article className="dash-card">
          <header className="dash-card-head"><div><h2>Son kurulum hareketleri</h2><p>Kurum açma ve giriş bağlantısı</p></div></header>
          {kurulumlar.length ? (
            <nav className="dash-list">
              {kurulumlar.map((kayit) => (
                <Link className="dash-row" data-tone={kayit.result === "error" ? "danger" : "success"} href={`/panel/platform?organization=${kayit.organization_id}`} key={kayit.id}>
                  <span className="dash-row-icon"><StgIcon name={kayit.result === "error" ? "shield" : "check"} size={17} /></span>
                  <span className="dash-row-label">
                    {kurumAdi.get(kayit.organization_id) ?? "Kurum"}
                    <small className="dash-row-note">{actionLabels[kayit.action] ?? kayit.action} · {tarihSaat(kayit.created_at)}</small>
                  </span>
                  <Chevron />
                </Link>
              ))}
            </nav>
          ) : (
            <p className="dash-empty">
              {admin
                ? "Henüz kurulum kaydı yok. Yeni bir müşteri kurulduğunda adımları burada görürsünüz."
                : "Sunucu anahtarı tanımlı olmadığı için kurulum günlüğü okunamıyor."}
            </p>
          )}
        </article>
      </section>
    </div>
  );
}
