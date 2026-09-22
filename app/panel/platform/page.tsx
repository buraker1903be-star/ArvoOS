import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext, panelModules } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { ORGANIZATION_LEGAL_COLUMNS } from "@/app/_components/legal/organization";
import { legalDetailsFrom, validateLegalDetails } from "../settings/legal-details";
import { KiraciUyeleri, type KiraciUyesi } from "./kiraci-uyeleri";
import { kotaDurumu } from "@/lib/kota-durumu";
import { StgIcon, StgSection, StgValueRow, StgWidget, type StgTone } from "../settings/settings-ui";
import { PanelDrawer } from "../components/panel-drawer";
import { createCustomerOrganization, toggleOrganizationModule, updateOrganizationSettings } from "./actions";
import { NewOrganizationWizard } from "./new-organization-wizard";
import { OwnerAccessLink } from "./owner-access-link";
import "../settings/settings.css";
import "./platform.css";

type ModuleRow = { module_code: string; is_enabled: boolean; arvo_modules: { name?: string; description?: string; sort_order?: number } | { name?: string; description?: string; sort_order?: number }[] | null };
type ManagedOrganization = {
  id: string; name: string; display_name: string | null; slug: string; status: string; plan_code: string; sector: string;
  custom_domain: string | null; custom_domain_status: string | null; provisioning_state: string; logo_url: string | null; kind: string; contact_phone: string | null;
};
type Invitation = { organization_id: string; email: string; status: string; sent_at: string | null; accepted_at: string | null; error_message: string | null };
type AuditRow = { id: string; action: string; state: string; result: string; duration_ms: number | null; created_at: string };
type CheckState = "done" | "todo" | "bad" | "unknown";

const stateLabels: Record<string, string> = {
  creating: "Oluşturuluyor",
  inviting_owner: "Davet gönderiliyor",
  waiting_owner: "Sahip bekleniyor",
  active: "Kullanımda",
  suspended: "Askıda",
  archived: "Arşivlendi",
  failed: "Kurulum hatası",
};
const stateTones: Record<string, StgTone> = {
  creating: "info", inviting_owner: "info", waiting_owner: "warning", active: "success", suspended: "danger", archived: "neutral", failed: "danger",
};
const actionLabels: Record<string, string> = { provision_organization: "Kurulum", owner_access_link: "Giriş bağlantısı" };
// Tutarlar kuruş cinsinden tamsayı (AGENTS.md "Değişmezler").
const formatTry = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);
/* Etkinlik kaydındaki ham kodlar ("status", "crm_proposal") kimseye bir
   şey anlatmıyor; okunur karşılıkları burada. */
const ETKINLIK_ADI: Record<string, string> = {
  create: "Oluşturuldu", update: "Güncellendi", status: "Durum değişti",
  send: "Müşteriye gönderildi", delete: "Silindi", sign: "İmzalandı",
};
const VARLIK_ADI: Record<string, string> = {
  crm_opportunity: "Talep", crm_proposal: "Teklif", crm_contract: "Sözleşme",
  organization_membership: "Üye erişimi",
};
const licenseLabels: Record<string, string> = { trialing: "Deneme", active: "Aktif", past_due: "Ödeme gecikmiş", suspended: "Askıda", canceled: "İptal" };
const PENDING_STATES = new Set(["creating", "inviting_owner", "waiting_owner"]);

const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" }) : "—";
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";
const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR")).join("") || "?";

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ organization?: string; provisioned?: string }> }) {
  const { supabase, organization: founderOrganization, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const params = await searchParams;

  const [{ data: organizationData, error: organizationError }, { data: invitationData }, { data: plans }, pendingPayments] = await Promise.all([
    supabase.from("organizations").select("id,name,display_name,slug,status,plan_code,sector,custom_domain,custom_domain_status,provisioning_state,logo_url,kind,contact_phone").order("name"),
    supabase.from("organization_invitations").select("organization_id,email,status,sent_at,accepted_at,error_message").order("created_at", { ascending: false }),
    supabase.from("plans").select("code,name").eq("is_active", true).order("created_at"),
    supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  if (organizationError) throw new Error("Kurum listesi okunamadı.");
  const organizations = (organizationData ?? []) as ManagedOrganization[];
  const latestInvitation = new Map<string, Invitation>();
  for (const invitation of (invitationData ?? []) as Invitation[]) {
    if (!latestInvitation.has(invitation.organization_id)) latestInvitation.set(invitation.organization_id, invitation);
  }
  const planList = (plans ?? []).map((plan) => ({ code: String(plan.code), name: String(plan.name) }));
  const planNames = new Map(planList.map((plan) => [plan.code, plan.name]));

  const selected = organizations.find((item) => item.id === params.organization) ?? organizations.find((item) => item.id === founderOrganization.id) ?? organizations[0];
  if (!selected) throw new Error("Yönetilecek kurum bulunamadı.");
  const targetId = selected.id;
  const invitation = latestInvitation.get(targetId) ?? null;

  const admin = createAdminClient();

  /*
    Kiracı listesindeki kota rozeti için tüm kurumların ölçümü. Kurum başına
    ayrı sayım sorgusu, kurum sayısı kadar gidiş dönüş demekti; satırlar
    zaten az, bellekte gruplanıyor.
  */
  const [{ data: tumUyelikler }, { data: tumLisanslar }] = await Promise.all([
    supabase.from("organization_memberships").select("organization_id,user_id,role,is_active"),
    supabase.from("organization_licenses").select("organization_id,user_limit,ai_credit_limit,ai_credits_used,monthly_fee,current_period_end,license_status,trial_ends_at"),
  ]);
  const aktifUyeSayisi = new Map<string, number>();
  for (const satir of (tumUyelikler ?? []) as { organization_id: string; is_active: boolean }[]) {
    if (satir.is_active) aktifUyeSayisi.set(satir.organization_id, (aktifUyeSayisi.get(satir.organization_id) ?? 0) + 1);
  }
  const lisansById = new Map(
    ((tumLisanslar ?? []) as { organization_id: string; user_limit: number; ai_credit_limit: number; ai_credits_used: number; monthly_fee: number | null; current_period_end: string | null; license_status: string; trial_ends_at: string | null }[])
      .map((row) => [row.organization_id, row]),
  );
  const kotaById = new Map(
    [...lisansById.entries()].map(([id, lisans]) => [id, kotaDurumu({
      organizationId: id,
      kullaniciSayisi: aktifUyeSayisi.get(id) ?? 0,
      kullaniciLimiti: lisans.user_limit,
      aiKullanilan: lisans.ai_credits_used,
      aiLimiti: lisans.ai_credit_limit,
    })]),
  );

  const [{ count: memberCount }, { data: moduleData }, { data: auditData }, legalResult, onboardingResult, opportunityResult] = await Promise.all([
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", targetId).eq("is_active", true),
    supabase.from("organization_modules").select("module_code,is_enabled,arvo_modules(name,description,sort_order)").eq("organization_id", targetId),
    supabase.from("provisioning_audit_logs").select("id,action,state,result,duration_ms,created_at").eq("organization_id", targetId).order("created_at", { ascending: false }).limit(8),
    supabase.from("organizations").select(`${ORGANIZATION_LEGAL_COLUMNS},signature_stamp_url`).eq("id", targetId).maybeSingle(),
    // İlk kurulum kaydı yalnızca kurum üyelerine açık (RLS); kurucu sunucu anahtarıyla okur.
    admin ? admin.from("organization_onboarding").select("completed_at").eq("organization_id", targetId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    // Talepler de yalnızca kurum üyelerine açık; sayı sunucu anahtarıyla okunur.
    admin ? admin.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", targetId) : Promise.resolve({ count: null, error: null }),
  ]);
  /*
    Seçili kiracının üyeleri. Ad profiles'tan okunuyor: e-posta auth.users'ta
    ve yönetim API'siyle sayfa sayfa çekiliyor — tek kurum için o maliyete
    girmeye değmez, ad zaten ayırt etmeye yetiyor.
  */
  const kiraciUyelikleri = ((tumUyelikler ?? []) as { organization_id: string; user_id: string; role: string; is_active: boolean }[])
    .filter((satir) => satir.organization_id === targetId);
  const { data: profilData } = kiraciUyelikleri.length
    ? await supabase.from("profiles").select("id,full_name").in("id", kiraciUyelikleri.map((satir) => satir.user_id))
    : { data: [] };
  const adById = new Map(((profilData ?? []) as { id: string; full_name: string | null }[]).map((row) => [row.id, row.full_name]));
  const kiraciUyeleri: KiraciUyesi[] = kiraciUyelikleri
    .map((satir) => ({
      userId: satir.user_id,
      name: adById.get(satir.user_id) ?? null,
      role: satir.role,
      active: Boolean(satir.is_active),
    }))
    // Sahipler üstte, pasifler altta: bakılması gereken sıra bu.
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.role === "owner") - Number(a.role === "owner"));

  const seciliKota = kotaById.get(targetId) ?? null;
  const seciliLisans = lisansById.get(targetId) ?? null;

  /*
    Kiracı dosyasının kalan parçaları: ödeme, kanallar, son etkinlik.
    Hepsi seçili kuruma daraltılmış; dördü tek turda okunuyor.

    Ödeme ve etkinlik kayıtları yalnızca kurum üyelerine açık (RLS);
    kurucu bunları sunucu anahtarıyla okuyor — konsolun işi zaten başka
    kurumların verisine bakmak.
  */
  const [{ data: odemeler }, { data: whatsappHesabi }, { data: etkinlikler }] = await Promise.all([
    admin
      ? admin.from("organization_payment_requests").select("id,amount,currency,status,created_at,reviewed_at").eq("organization_id", targetId).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
    admin
      ? admin.from("whatsapp_accounts").select("status,display_phone,verified_name,last_error").eq("organization_id", targetId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      ? admin.from("activity_logs").select("action,entity_type,created_at,metadata").eq("organization_id", targetId).order("created_at", { ascending: false }).limit(6)
      : Promise.resolve({ data: [] }),
  ]);
  const odemeSatirlari = (odemeler ?? []) as { amount: number; status: string; created_at: string; reviewed_at: string | null }[];
  const bekleyenOdeme = odemeSatirlari.filter((satir) => satir.status === "pending");
  const sonTahsilat = odemeSatirlari.find((satir) => satir.status === "approved") ?? null;
  const wa = whatsappHesabi as { status: string; display_phone: string | null; verified_name: string | null; last_error: string | null } | null;
  const etkinlikSatirlari = (etkinlikler ?? []) as { action: string; entity_type: string; created_at: string }[];

  const auditRows = (auditData ?? []) as AuditRow[];
  const moduleRows = ((moduleData ?? []) as ModuleRow[]).map((row) => {
    const relation = Array.isArray(row.arvo_modules) ? row.arvo_modules[0] : row.arvo_modules;
    const fallback = panelModules[row.module_code];
    return { code: row.module_code, name: fallback?.name ?? relation?.name ?? row.module_code, description: fallback?.description ?? relation?.description ?? "", icon: fallback?.icon ?? row.module_code.slice(0, 2).toUpperCase(), enabled: row.is_enabled, order: relation?.sort_order ?? 0 };
  }).sort((a, b) => a.order - b.order);
  const enabledCount = moduleRows.filter((module) => module.enabled).length;
  const legal = legalDetailsFrom(legalResult.error ? null : (legalResult.data as Record<string, unknown> | null));
  const legalFilled = [legal.legal_address, legal.legal_city, legal.tax_office, legal.tax_number, legal.iban].filter(Boolean).length;
  // Ayarlar'daki "Belge kimliği" ve müşterinin kurulum kartıyla aynı ölçüt.
  const legalComplete = legalFilled === 5 && !Object.keys(validateLegalDetails(legal)).length;
  const onboardingDone = Boolean((onboardingResult.data as { completed_at?: string | null } | null)?.completed_at);
  const signatureUrl = legalResult.error ? null : (legalResult.data as { signature_stamp_url?: string | null } | null)?.signature_stamp_url ?? null;
  const opportunityCount = opportunityResult.count ?? 0;
  // ArvoLab ayrı veritabanında; köprü koparsa tek iz orada kalır (lib/arvolab.ts).
  const bridge = await getArvolabBridgeHealth();
  // ARC köprüsü sessiz çalışıyor; durumu yalnızca burada görünür (lib/arc-bridge.ts).
  const [arcBridge, randevuBridge] = await Promise.all([getArcBridgeHealth(), getRandevuBridgeHealth()]);

  // ---- Kurulum durumu (sahip katılana ve kurum hazır olana kadar)
  /*
    Sahip katılmış sayılır: daveti kabul ettiyse YA DA kurumda aktif kullanıcı
    varsa. Eskiden yalnızca davet kaydına bakılıyordu; sahibi doğrudan eklenen
    kurumlarda (platformun kendi kurumu gibi) davet kaydı hiç oluşmadığı için
    bu adım sonsuza kadar eksik görünüyor ve "Kurulum bekleyen" sayacını
    şişiriyordu.
  */
  const hasActiveMember = (memberCount ?? 0) > 0;
  const ownerJoined = Boolean(invitation?.accepted_at) || invitation?.status === "accepted" || hasActiveMember;
  const inviteState: CheckState = invitation
    ? invitation.status === "failed" ? "bad" : ["sent", "accepted"].includes(invitation.status) ? "done" : "todo"
    : hasActiveMember ? "done" : "todo";
  const checks: { key: string; title: string; note: string; state: CheckState; optional?: boolean }[] = [
    { key: "created", title: "Kurum oluşturuldu", note: `${planNames.get(selected.plan_code) ?? selected.plan_code} paketi · ${enabledCount} modül etkin`, state: selected.provisioning_state === "creating" ? "todo" : "done" },
    {
      key: "invite", title: "Sahibe davet gönderildi", state: inviteState,
      note: !invitation ? (hasActiveMember ? "Davet gerekmedi; sahip doğrudan eklendi." : "Davet kaydı yok.") : invitation.status === "failed" ? `Davet gönderilemedi: ${invitation.error_message ?? "bilinmeyen hata"}. Aşağıdan giriş bağlantısı oluşturun.` : `${invitation.email}${invitation.sent_at ? ` · ${dateTime(invitation.sent_at)}` : ""}`,
    },
    { key: "joined", title: "Sahip hesabını açtı", state: ownerJoined ? "done" : "todo", note: ownerJoined ? `${invitation?.accepted_at ? `Katıldı · ${dateTime(invitation.accepted_at)}` : "Hesap açık"} · ${memberCount ?? 0} aktif kullanıcı` : "Davet bekleniyor. E-posta gelmediyse giriş bağlantısını WhatsApp’tan gönderin." },
    { key: "onboarding", title: "İlk kurulum tamamlandı", state: !admin ? "unknown" : onboardingDone ? "done" : "todo", note: !admin ? "Sunucu anahtarı olmadan okunamıyor." : onboardingDone ? "Kurum bilgileri ve marka ayarları girildi." : "Sahip ilk girişte kurum bilgilerini ve marka rengini girer." },
    { key: "legal", title: "Resmi bilgiler", state: legalResult.error ? "unknown" : legalComplete ? "done" : "todo", note: legalComplete ? "Teklif ve sözleşmeler için hazır." : legalFilled === 5 ? "Alanlar dolu ama biri geçersiz (IBAN, vergi no veya MERSİS). Sahip Ayarlar’dan düzeltir." : `${legalFilled}/5 zorunlu alan dolu (adres, il, vergi dairesi, vergi no, IBAN). Sahip Ayarlar’dan tamamlar.` },
    { key: "logo", title: "Logo", state: selected.logo_url ? "done" : "todo", note: selected.logo_url ? "Belgelerde ve takip ekranında kullanılıyor." : "Logo yüklenmedi; belgelerde kurum adı yazar." },
    { key: "signature", title: "Kaşe-imza görseli", state: legalResult.error ? "unknown" : signatureUrl ? "done" : "todo", note: signatureUrl ? "Sözleşmelerde hizmet sağlayıcı imzası olarak görünüyor." : "Yüklenmedi; sözleşmelerde imza alanı boş kalır. Sahip Ayarlar’dan yükler." },
    { key: "first-request", title: "İlk talep girildi", state: !admin || opportunityResult.error ? "unknown" : opportunityCount > 0 ? "done" : "todo", note: !admin ? "Sunucu anahtarı olmadan okunamıyor." : opportunityCount > 0 ? `${opportunityCount} talep kayıtlı; kurum paneli kullanıyor.` : "Henüz talep yok. Sahip CRM’den ilk talebini girince teklif ve sözleşme süreci başlar." },
    { key: "team", title: "Ekip davet edildi", optional: true, state: (memberCount ?? 0) > 1 ? "done" : "todo", note: (memberCount ?? 0) > 1 ? `${memberCount} aktif kullanıcı` : "Şimdilik yalnızca sahip var. Ekip, İnsan Kaynakları’ndan eklenir." },
    {
      key: "domain", title: "Özel alan adı", optional: true,
      state: !selected.custom_domain ? "todo" : selected.custom_domain_status === "verified" ? "done" : selected.custom_domain_status === "failed" ? "bad" : "todo",
      note: !selected.custom_domain ? "İsteğe bağlı; tanımlı değil." : `${selected.custom_domain} · ${selected.custom_domain_status === "verified" ? "doğrulandı" : selected.custom_domain_status === "failed" ? "doğrulanamadı" : "DNS doğrulaması bekleniyor"}`,
    },
  ];
  const required = checks.filter((check) => !check.optional);
  const doneCount = required.filter((check) => check.state === "done").length;
  const progress = Math.round((doneCount / required.length) * 100);

  // ---- Genel özet
  /*
    Sayaçlar yalnızca müşteri kurumları sayar. Kendi markalarımız listede
    görünür ama "kaç müşterim var" sorusunu bulandırmasın.
  */
  const customers = organizations.filter((item) => item.kind !== "internal");
  const activeCount = customers.filter((item) => item.provisioning_state === "active").length;
  const pendingCount = customers.filter((item) => PENDING_STATES.has(item.provisioning_state)).length;
  const issueCount = customers.filter((item) => item.provisioning_state === "failed" || item.provisioning_state === "suspended" || item.status === "suspended").length;
  const paymentsWaiting = pendingPayments.error ? 0 : pendingPayments.count ?? 0;

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">YALNIZCA ARVOOS KURUCU ERİŞİMİ</small><h1>Platform Yönetimi</h1><p>Müşteri kurumlarını kurun, sahiplerini panele alın, paket ve modüllerini yönetin.</p></div>
      <div className="panel-page-actions">
        <PanelDrawer triggerLabel="+ Yeni müşteri" kicker="YENİ MÜŞTERİ" title="Yeni müşteri kurulumu" description="Dört adımda kurum, paket ve sahip hesabı hazırlanır; davet otomatik gönderilir.">
          <NewOrganizationWizard action={createCustomerOrganization} plans={planList} existingSlugs={organizations.map((item) => item.slug)} />
        </PanelDrawer>
      </div>
    </div>

    {bridge?.broken ? (
      <div className="plt-banner" data-tone="danger" role="alert">
        <span className="plt-banner-icon"><StgIcon name="shield" size={18} /></span>
        <div>
          <b>ArvoLab köprüsü yanıt vermiyor{bridge.permanent ? " · yapılandırma hatası" : ""}</b>
          <p>
            {bridge.permanent
              ? "Anahtar eksik ya da iki tarafta farklı. ArvoLab abonelik durumunu soramıyor ve kimseyi engellemediği için bireysel kullanıcılar şu an ücretsiz kullanıyor. Vercel'de PRODUCT_BRIDGE_SECRET'in iki projede de aynı olduğunu kontrol edin."
              : "ArvoLab, ArvoOS'a ulaşamıyor. Kullanıcılar engellenmiyor; sorun sürerse bireysel abonelikler denetlenemez."}
            {bridge.lastErrorAt ? ` Son hata: ${dateTime(bridge.lastErrorAt)}.` : ""}
            {bridge.lastOkAt ? ` Son başarılı bağlantı: ${dateTime(bridge.lastOkAt)}.` : " Hiç başarılı bağlantı kaydı yok."}
          </p>
        </div>
      </div>
    ) : null}

    {!arcBridge.ok ? (
      <div className="plt-banner" data-tone={arcBridge.error ? "danger" : undefined} role="status">
        <span className="plt-banner-icon"><StgIcon name="shield" size={18} /></span>
        <div>
          <b>{arcBridge.error ? "ARC köprüsü bağlanamıyor" : "ARC köprüsü kapalı"}</b>
          <p>
            {arcBridge.error
              ? `ARC veritabanına bağlanılamadı: ${arcBridge.error}. Anahtarın yeni ARC projesinin secret anahtarı olduğunu kontrol edin.`
              : `Bu dağıtımda tanımlı olmayan değişkenler: ${arcBridge.missing.join(", ")}. Vercel'de ArvoOS projesine Production ortamı için ekleyip yeniden dağıtın.`}
          </p>
        </div>
      </div>
    ) : (
      <p className="plt-substatus">ARC köprüsü bağlı · ARC veritabanında {arcBridge.organizations} kurum.</p>
    )}

    {!randevuBridge.ok ? (
      <div className="plt-banner" data-tone={randevuBridge.error ? "danger" : undefined} role="status">
        <span className="plt-banner-icon"><StgIcon name="shield" size={18} /></span>
        <div>
          <b>{randevuBridge.error ? "Randevu köprüsü bağlanamıyor" : "Randevu köprüsü kapalı"}</b>
          <p>
            {randevuBridge.error
              ? `Randevu veritabanına bağlanılamadı: ${randevuBridge.error}. Anahtarın ArvoRandevu projesinin secret anahtarı olduğunu kontrol edin.`
              : `Bu dağıtımda tanımlı olmayan değişkenler: ${randevuBridge.missing.join(", ")}. Vercel'de ArvoOS projesine Production ortamı için ekleyip yeniden dağıtın. Tanımlanana kadar salon lisansları Randevu'ya yansımaz.`}
          </p>
        </div>
      </div>
    ) : (
      <p className="plt-substatus">Randevu köprüsü bağlı · Randevu veritabanında {randevuBridge.organizations} kurum.</p>
    )}

    {params.provisioned === "1" ? (
      <div className="plt-banner" role="status">
        <span className="plt-banner-icon"><StgIcon name="check" size={18} /></span>
        <div>
          <b>{selected.display_name || selected.name} kuruldu</b>
          <p>Davet {invitation?.email ?? "sahibin e-posta adresine"} gönderildi. E-posta gelmezse “Kurulum durumu” bölümünden giriş bağlantısı oluşturup WhatsApp’tan gönderin.</p>
        </div>
      </div>
    ) : null}

    <section className="stg-widgets" aria-label="Platform özeti">
      <StgWidget tone="gold" icon="building" label="Müşteri kurum" value={customers.length} note={organizations.length > customers.length ? `${organizations.length - customers.length} kendi markamız ayrı tutuluyor` : "Platformdaki müşteriler"} />
      <StgWidget tone="success" icon="check" label="Kullanımda" value={activeCount} note="Sahibi katılmış kurumlar" />
      <StgWidget tone={pendingCount ? "warning" : "neutral"} icon="users" label="Kurulum bekleyen" value={pendingCount} note={pendingCount ? "Sahibin katılması bekleniyor" : "Bekleyen kurulum yok"} />
      <StgWidget tone={issueCount ? "danger" : "neutral"} icon="shield" label="Dikkat" value={issueCount} note={issueCount ? "Hata veya askıdaki kurum" : "Sorunlu kurum yok"} />
    </section>


    <div className="plt-layout">
      <aside className="plt-orgs" aria-label="Kurumlar">
        <header><b>Kurumlar</b><small>{organizations.length} kurum</small></header>
        <ul>
          {organizations.map((item) => {
            const itemInvite = latestInvitation.get(item.id);
            const label = item.display_name || item.name;
            return (
              <li key={item.id}>
                <Link href={`/panel/platform?organization=${item.id}`} className={item.id === targetId ? "plt-org is-active" : "plt-org"} aria-current={item.id === targetId ? "page" : undefined}>
                  <span className="plt-org-avatar" data-tone={stateTones[item.provisioning_state] ?? "neutral"}>{initials(label)}</span>
                  <span className="plt-org-text">
                    <b>{label}</b>
                    <small>{item.slug} · {item.kind === "internal" ? "Kendi markamız" : planNames.get(item.plan_code) ?? item.plan_code}{item.provisioning_state === "waiting_owner" && itemInvite?.email ? ` · ${itemInvite.email}` : ""}</small>
                  </span>
                  {/* Rozet önce KOTAYI söylüyor: kurucu listeye bakınca hangi
                      kiracıya bakması gerektiğini görmeli. Kota sorunu yoksa
                      kurulum durumu gösteriliyor. */}
                  {(() => {
                    const kota = kotaById.get(item.id);
                    if (kota && kota.durum !== "normal") {
                      return <span className="status-pill" data-tone={kota.durum === "asildi" ? "danger" : "warning"}>{kota.kullanici.kullanilan}/{kota.kullanici.limit}</span>;
                    }
                    return <span className="status-pill" data-tone={stateTones[item.provisioning_state] ?? "neutral"}>{stateLabels[item.provisioning_state] ?? item.provisioning_state}</span>;
                  })()}
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="plt-detail">
        {/*
          Kiracı özeti en üstte: lisans, kota, ücret ve dönem sonu. Bunlar
          daha önce üç ayrı sekmeye dağılmıştı (Lisans ve kota, Abonelikler,
          Üyeler) ve bir kiracı hakkında karar vermek için üçünü de gezmek
          gerekiyordu.
        */}
        <section className="kiraci-ozet" aria-label="Kiracı özeti">
          <div>
            <small>Lisans</small>
            <b data-tone={seciliLisans?.license_status === "active" ? "success" : seciliLisans?.license_status === "trialing" ? "info" : "warning"}>
              {seciliLisans ? (licenseLabels[seciliLisans.license_status] ?? seciliLisans.license_status) : "Lisans yok"}
            </b>
          </div>
          <div>
            <small>Kullanıcı</small>
            <b data-tone={seciliKota?.durum === "asildi" ? "danger" : seciliKota?.durum === "yaklasti" ? "warning" : undefined}>
              {seciliKota ? `${seciliKota.kullanici.kullanilan} / ${seciliKota.kullanici.limit}` : "—"}
            </b>
          </div>
          <div>
            <small>Aylık</small>
            <b>{seciliLisans?.monthly_fee ? formatTry(Number(seciliLisans.monthly_fee)) : "Girilmedi"}</b>
          </div>
          <div>
            {/* Denemedeki kurumda asıl merak edilen deneme bitişi; dönem
                sonu orada boş kalıyordu. */}
            <small>{seciliLisans?.license_status === "trialing" ? "Deneme bitişi" : "Dönem sonu"}</small>
            <b data-tone={seciliLisans?.license_status === "trialing" ? "warning" : undefined}>
              {date(seciliLisans?.license_status === "trialing" ? seciliLisans.trial_ends_at : seciliLisans?.current_period_end ?? null)}
            </b>
          </div>
        </section>

        {/*
          Hızlı işlemler kiracının üstünde: kurucunun en sık yaptığı üç şey.
          Hepsi mevcut ekranlara götürüyor — konsolda ikinci bir yazma yolu
          açmıyoruz, aksi hâlde aynı kural iki yerde durur ve biri sapar.
        */}
        <div className="kiraci-islemler">
          <a className="panel-secondary" href={`https://app.arvo-os.com/panel?organization=${targetId}`} target="_blank" rel="noreferrer">Panele git</a>
          <Link className="panel-secondary" href={`/panel/platform/licenses?organization=${targetId}`}>Paket ve limit</Link>
          <Link className="panel-secondary" href="/panel/platform/payments">
            Ödeme onayları{paymentsWaiting ? <span className="plt-count">{paymentsWaiting}</span> : null}
          </Link>
        </div>

        <div className="kiraci-kartlar">
          <section className="panel-card" aria-label="Ödeme">
            <h3>Ödeme</h3>
            <dl>
              <div><dt>Bekleyen dekont</dt><dd data-tone={bekleyenOdeme.length ? "warning" : undefined}>{bekleyenOdeme.length || "yok"}</dd></div>
              <div><dt>Son tahsilat</dt><dd>{sonTahsilat ? `${formatTry(Number(sonTahsilat.amount))} · ${date(sonTahsilat.reviewed_at ?? sonTahsilat.created_at)}` : "—"}</dd></div>
              <div><dt>Toplam bildirim</dt><dd>{odemeSatirlari.length}</dd></div>
            </dl>
          </section>

          <section className="panel-card" aria-label="Kanallar">
            <h3>Kanallar</h3>
            <dl>
              <div>
                <dt>WhatsApp</dt>
                <dd data-tone={wa ? (wa.status === "connected" ? "success" : "warning") : undefined}>
                  {wa ? (wa.status === "connected" ? (wa.display_phone ?? "bağlı") : "doğrulanamadı") : "bağlı değil"}
                </dd>
              </div>
              <div>
                <dt>Alan adı</dt>
                <dd data-tone={selected.custom_domain_status === "verified" ? "success" : selected.custom_domain ? "warning" : undefined}>
                  {selected.custom_domain ? (selected.custom_domain_status === "verified" ? selected.custom_domain : `${selected.custom_domain} · doğrulanmadı`) : "Arvo alan adı"}
                </dd>
              </div>
              {/* WhatsApp hatası varsa yazılıyor: "bağlı değil" demek,
                  bağlıyken bozulmuş bir numarayı gizlerdi. */}
              {wa?.last_error ? <div><dt>Son hata</dt><dd data-tone="danger">{wa.last_error}</dd></div> : null}
            </dl>
          </section>

          <section className="panel-card" aria-label="Son etkinlik">
            <h3>Son etkinlik</h3>
            {etkinlikSatirlari.length ? (
              <ul className="kiraci-etkinlik">
                {etkinlikSatirlari.map((satir, sira) => (
                  <li key={`${satir.created_at}-${sira}`}>
                    <b>{ETKINLIK_ADI[satir.action] ?? satir.action}</b>
                    <small>{VARLIK_ADI[satir.entity_type] ?? satir.entity_type} · {dateTime(satir.created_at)}</small>
                  </li>
                ))}
              </ul>
            ) : <p className="plt-substatus">Kayıtlı etkinlik yok.</p>}
          </section>
        </div>

        <StgSection
          id="uyeler" wide icon="users" tone={seciliKota?.durum === "asildi" ? "danger" : "neutral"}
          kicker="ERİŞİM" title="Üyeler"
          description="Erişimi kapatılan kişi kurumun paneline giremez; kayıt kurumun etkinlik geçmişine düşer."
          aside={<Link className="panel-secondary" href={`/panel/platform/licenses?organization=${targetId}`}>Limiti düzenle</Link>}
        >
          <KiraciUyeleri organizationId={targetId} kurumAdi={selected.display_name || selected.name} uyeler={kiraciUyeleri} />
        </StgSection>

        <StgSection
          id="kurum" wide icon="building" tone={stateTones[selected.provisioning_state] ?? "neutral"}
          kicker={selected.slug} title={selected.display_name || selected.name}
          description={selected.display_name ? selected.name : `${selected.sector} sektörü`}
          aside={<span className="status-pill" data-tone={stateTones[selected.provisioning_state] ?? "neutral"}>{stateLabels[selected.provisioning_state] ?? selected.provisioning_state}</span>}
        >
          <dl className="stg-list plt-facts">
            {/* Paket, lisans ve kullanıcı sayısı özet şeridinde; burada
                tekrarlamıyoruz. Ekran aynı şeyi üç kez söylüyordu. */}
            <StgValueRow label="Sektör" value={selected.sector} />
            <StgValueRow label="Modüller" value={`${enabledCount} / ${moduleRows.length} etkin`} />
            <StgValueRow label="Sahip" value={invitation?.email ?? null} />
          </dl>
        </StgSection>

        <StgSection
          id="kurulum" wide icon="check" tone={progress === 100 ? "success" : "warning"}
          kicker="KURULUM DURUMU" title={progress === 100 ? "Kurum kullanıma hazır" : "Müşteriyi panele alın"}
          description="Kurumun kullanıma hazır olması için gereken adımlar. Sahip katılınca kalan adımları kendi panelinden tamamlar."
          aside={<span className="plt-progress" aria-label={`Kurulum ilerlemesi yüzde ${progress}`}><i style={{ width: `${progress}%` }} /><b>{doneCount}/{required.length}</b></span>}
        >
          <ol className="plt-checks">
            {checks.map((check) => (
              <li key={check.key} className={`is-${check.state}`}>
                <span className="plt-check-dot" aria-hidden="true">{check.state === "done" ? <StgIcon name="check" size={14} /> : check.state === "bad" ? "!" : check.state === "unknown" ? "?" : ""}</span>
                <span><b>{check.title}{check.optional ? <small className="plt-optional">isteğe bağlı</small> : null}</b><small>{check.note}</small></span>
              </li>
            ))}
          </ol>
          {invitation ? (
            <div className="plt-access-box">
              <div>
                <b>Sahibe giriş bağlantısı</b>
                <small>{ownerJoined ? "Sahip şifresini unuttuysa yeni şifre bağlantısı gönderin." : "Davet e-postası gelmediyse ya da süresi dolduysa tek kullanımlık bağlantıyı WhatsApp’tan gönderin."}</small>
              </div>
              <OwnerAccessLink organizationId={targetId} organizationName={selected.display_name || selected.name} ownerEmail={invitation.email} />
            </div>
          ) : null}
        </StgSection>

        <div className="plt-two">
          <StgSection id="ayarlar" icon="palette" tone="info" kicker="KURUM ÇEKİRDEĞİ" title="Kurum ayarları" description="Değişiklikler seçilen kurumun paneline uygulanır.">
            <form className="panel-form" action={updateOrganizationSettings}>
              <input type="hidden" name="organization_id" value={targetId} />
              <label className="wide">Yasal unvan<input name="name" defaultValue={selected.name} minLength={2} maxLength={160} required /></label>
              <label className="wide">Tabela unvanı <small className="plt-optional">boşsa yasal unvan</small><input name="display_name" defaultValue={selected.display_name ?? ""} maxLength={80} placeholder="Örn. AkademikMerkez" /></label>
              <label>Sektör<input name="sector" defaultValue={selected.sector ?? "general"} minLength={2} maxLength={80} required /></label>
              <label>Kurum türü<select name="kind" defaultValue={selected.kind ?? "customer"}><option value="customer">Müşteri</option><option value="internal">Kendi markamız</option></select></label>
              <label>Paket<select name="plan_code" defaultValue={selected.plan_code}>{planList.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
              <label className="wide">İletişim telefonu <small className="plt-optional">ödeme hatırlatması WhatsApp&apos;tan buraya gider</small><input name="contact_phone" type="tel" defaultValue={selected.contact_phone ?? ""} maxLength={20} placeholder="05XX XXX XX XX" /></label>
              <label className="wide">Özel alan adı<input name="custom_domain" defaultValue={selected.custom_domain ?? ""} placeholder="panel.firma.com" /></label>
              <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Ayarları kaydet</button></div>
            </form>
          </StgSection>

          <StgSection id="moduller" icon="grid" tone="gold" kicker="PAKET VE ERİŞİM" title="Modüller" description="Kurumun panelinde görünecek modüller." aside={<span className="status-pill" data-tone="gold">{enabledCount}/{moduleRows.length}</span>}>
            {moduleRows.length ? (
              <div className="stg-list">
                {moduleRows.map((module) => (
                  <form className="plt-module" action={toggleOrganizationModule} key={module.code}>
                    <input type="hidden" name="organization_id" value={targetId} />
                    <input type="hidden" name="module_code" value={module.code} />
                    <input type="hidden" name="is_enabled" value={String(!module.enabled)} />
                    <span className="stg-row-main">
                      <span className="stg-row-icon plt-module-icon" data-tone={module.enabled ? "success" : "neutral"}>{module.icon}</span>
                      <span><b>{module.name}</b><small>{module.description}</small></span>
                    </span>
                    <button type="submit" className={module.enabled ? "plt-switch is-on" : "plt-switch"} role="switch" aria-checked={module.enabled} aria-label={`${module.name}: ${module.enabled ? "kapat" : "aç"}`}><i /></button>
                  </form>
                ))}
              </div>
            ) : <div className="stg-empty"><StgIcon name="grid" size={22} /><p>Bu kurum için modül kaydı yok.</p></div>}
          </StgSection>
        </div>

        <StgSection id="gecmis" wide icon="chart" tone="neutral" kicker="KURULUM GEÇMİŞİ" title="Son işlemler" aside={<span className="status-pill">{auditRows.length} kayıt</span>}>
          {auditRows.length ? (
            <ol className="plt-audit">
              {auditRows.map((entry) => (
                <li key={entry.id} data-tone={entry.result === "failed" || entry.state === "failed" ? "danger" : "neutral"}>
                  <span className="plt-audit-dot" aria-hidden="true" />
                  <span>
                    <b>{actionLabels[entry.action] ?? entry.action} · {stateLabels[entry.state] ?? entry.state}</b>
                    <small>{dateTime(entry.created_at)}{entry.duration_ms != null ? ` · ${entry.duration_ms} ms` : ""}{entry.result ? ` · ${entry.result}` : ""}</small>
                  </span>
                </li>
              ))}
            </ol>
          ) : <div className="stg-empty"><StgIcon name="chart" size={22} /><p>Bu kurum için henüz kurulum kaydı yok.</p></div>}
        </StgSection>
      </div>
    </div>
  </div>;
}
