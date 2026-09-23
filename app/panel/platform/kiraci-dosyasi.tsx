import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { panelModules } from "@/lib/panel-context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ORGANIZATION_LEGAL_COLUMNS } from "@/app/_components/legal/organization";
import { legalDetailsFrom, validateLegalDetails } from "../settings/legal-details";
import { KiraciUyeleri, type KiraciUyesi } from "./kiraci-uyeleri";
import { ModulMatrisi, type ModulSatiri } from "./modul-matrisi";
import { ADDON_PRODUCTS, productLicenseLabels } from "@/lib/products";
import { kotaOzetiYaz, urunKotalari } from "@/lib/urun-kotasi";
import { urunKullanimi } from "@/lib/urun-kullanimi";
import type { KotaDurumu } from "@/lib/kota-durumu";
import { StgIcon } from "../settings/settings-ui";
import { KURULUM_ADI, KURULUM_TONU, LISANS_TONU, basHarfleri, depolama, para, tarih, tarihSaat } from "./bicim";
import { toggleOrganizationModule, updateOrganizationSettings } from "./actions";
import { OwnerAccessLink } from "./owner-access-link";

/*
  Tek kiracının dosyası.

  Liste ve dosya aynı sayfada ama aynı anda değil: kurucu ya "hangi
  kiracıya bakmalıyım" diye listeye bakıyor ya da bir kiracının
  tamamını okuyor. İkisini yan yana koymak listeyi dar bir sütuna
  sıkıştırıyordu.

  Kiracıya özel sorgular burada: bileşen yalnızca dosya açıkken
  çiziliyor, yani liste görünümünde bu on beş sorgu hiç gitmiyor.
*/

type ModuleRow = { module_code: string; is_enabled: boolean; arvo_modules: { name?: string; description?: string; sort_order?: number } | { name?: string; description?: string; sort_order?: number }[] | null };
type AuditRow = { id: string; action: string; state: string; result: string; duration_ms: number | null; created_at: string };
type CheckState = "done" | "todo" | "bad" | "unknown";

export type DosyaKurumu = {
  id: string; name: string; display_name: string | null; slug: string; status: string; plan_code: string; sector: string;
  custom_domain: string | null; custom_domain_status: string | null; provisioning_state: string; logo_url: string | null; kind: string; contact_phone: string | null;
};
export type DosyaDaveti = { organization_id: string; email: string; status: string; sent_at: string | null; accepted_at: string | null; error_message: string | null };
export type DosyaUyeligi = { organization_id: string; user_id: string; role: string; is_active: boolean };

const actionLabels: Record<string, string> = { provision_organization: "Kurulum", owner_access_link: "Giriş bağlantısı" };

/* Etkinlik kaydındaki ham kodlar ("status", "crm_proposal") kimseye bir
   şey anlatmıyor; okunur karşılıkları burada. Listede karşılığı olmayan
   kod yine de basılır ama artık eksik olanı görünce buraya eklemek
   yeterli. */
const ETKINLIK_ADI: Record<string, string> = {
  create: "Oluşturuldu", update: "Güncellendi", status: "Durum değişti",
  send: "Müşteriye gönderildi", delete: "Silindi", sign: "İmzalandı",
  archive: "Arşivlendi", restore: "Geri alındı", accept: "Kabul edildi",
  reject: "Reddedildi", cancel: "İptal edildi", complete: "Tamamlandı",
  invite: "Davet edildi", activate: "Erişim açıldı", deactivate: "Erişim kapatıldı",
  login: "Giriş yapıldı", payment: "Ödeme bildirildi",
};
const VARLIK_ADI: Record<string, string> = {
  crm_opportunity: "Talep", crm_proposal: "Teklif", crm_contract: "Sözleşme",
  organization_membership: "Üye erişimi", organization: "Kurum",
  payment_notification: "Ödeme bildirimi", operation_workflow: "İş akışı",
  hr_employee: "Personel", finance_transaction: "Finans hareketi",
};


export async function KiraciDosyasi({ supabase, selected, invitation, planList, tumUyelikler, seciliKota, seciliLisans }: {
  supabase: SupabaseClient;
  selected: DosyaKurumu;
  invitation: DosyaDaveti | null;
  planList: { code: string; name: string }[];
  tumUyelikler: DosyaUyeligi[];
  seciliKota: KotaDurumu | null;
  seciliLisans: { license_status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null } | null;
}) {
  const targetId = selected.id;
  const admin = createAdminClient();

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
  const kiraciUyelikleri = tumUyelikler
    .filter((satir) => satir.organization_id === targetId);
  /*
    Ad üç yerde olabilir ve hiçbiri zorunlu değil:

      profiles.full_name  — davet akışı yazıyor (owner daveti, üye ekleme).
      hr_employees        — kurumun kendi personel kaydı; kiracının paneli
                            selamlamada bunu kullanıyor.
      auth üstverisi      — kayıt sırasında girilmişse.

    Üçü de denenmediği için konsolda "Adı kayıtlı değil" yazan satırlar
    kalıyordu: davet akışından geçmeden kuruma eklenen bir hesabın
    profiles kaydı hiç oluşmuyor.
  */
  const kullaniciIdleri = kiraciUyelikleri.map((satir) => satir.user_id);
  /* Personel kaydı yalnızca kurum üyelerine açık (RLS: arvo_is_member).
     Kurucu her kiracının üyesi değil; kullanıcı anahtarıyla okusaydık ad
     bazı kiracılarda çıkar bazılarında çıkmazdı — sessiz ve açıklanamaz
     bir fark. Sunucu anahtarıyla okunuyor, ödeme ve etkinlik gibi. */
  const [{ data: profilData }, { data: personelData }] = kullaniciIdleri.length
    ? await Promise.all([
        supabase.from("profiles").select("id,full_name").in("id", kullaniciIdleri),
        admin
          ? admin.from("hr_employees").select("user_id,full_name").eq("organization_id", targetId).in("user_id", kullaniciIdleri)
          : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }];
  const personelAdi = new Map(
    ((personelData ?? []) as { user_id: string | null; full_name: string | null }[])
      .filter((row) => row.user_id && row.full_name)
      .map((row) => [row.user_id as string, row.full_name]),
  );
  const adById = new Map(((profilData ?? []) as { id: string; full_name: string | null }[]).map((row) => [row.id, row.full_name]));
  /*
    E-posta ve yedek ad auth.users'ta; REST'ten okunamıyor, yönetim
    API'siyle geliyor. Kiracı başına birkaç üye olduğu için tek tek
    sormak ucuz — Tüm Üyeler ekranındaki gibi tüm listeyi sayfalamak
    burada gereksiz olurdu.

    "Adı kayıtlı değil" yazan üç satır arasında kimin kim olduğunu
    ayırmanın yolu yoktu: profiles.full_name çoğu hesapta boş, e-posta
    ise hesabın kendisi.
  */
  const hesaplar = admin
    ? await Promise.all(kiraciUyelikleri.map(async (satir) => {
        const { data } = await admin.auth.admin.getUserById(satir.user_id);
        const ustveri = (data?.user?.user_metadata ?? {}) as { full_name?: string; name?: string };
        return { id: satir.user_id, email: data?.user?.email ?? null, name: ustveri.full_name ?? ustveri.name ?? null };
      }))
    : [];
  const hesapById = new Map(hesaplar.map((hesap) => [hesap.id, hesap]));
  const kiraciUyeleri: KiraciUyesi[] = kiraciUyelikleri
    .map((satir) => ({
      userId: satir.user_id,
      name: adById.get(satir.user_id) || personelAdi.get(satir.user_id) || hesapById.get(satir.user_id)?.name || null,
      email: hesapById.get(satir.user_id)?.email ?? null,
      role: satir.role,
      active: Boolean(satir.is_active),
    }))
    // Sahipler üstte, pasifler altta: bakılması gereken sıra bu.
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.role === "owner") - Number(a.role === "owner"));


  /*
    Modül matrisi: ArvoOS çekirdeği organization_licenses'ta, diğer üç
    ürün organization_product_licenses'ta. İki tablodan tek liste
    kuruluyor; kurucu için ikisi aynı soruya cevap veriyor.
  */
  const [{ data: urunLisanslari }, kullanim] = await Promise.all([
    supabase
      .from("organization_product_licenses")
      .select("product,status,monthly_fee,integrated,limits")
      .eq("organization_id", targetId),
    /*
      Ürün kullanımı yalnızca SEÇİLİ kiracı için ölçülüyor: iki ayrı
      veritabanına gidiyor (ArvoLab, Randevu) ve tüm kiracılar için
      yapmak liste ekranını her açılışta yavaşlatırdı.
    */
    urunKullanimi(targetId),
  ]);
  const urunById = new Map(
    ((urunLisanslari ?? []) as { product: string; status: string; monthly_fee: number | null; integrated: boolean | null; limits: Record<string, unknown> | null }[])
      .map((row) => [row.product, row]),
  );
  const kullanimById: Record<string, Record<string, number | null> | null> = {
    arvolab: kullanim.arvolab,
    randevu: kullanim.randevu,
  };
  const modulSatirlari: ModulSatiri[] = [
    {
      product: "arvoos",
      name: "ArvoOS",
      status: seciliLisans?.license_status ?? "inactive",
      integrated: null,
      monthlyFee: seciliLisans?.monthly_fee ?? null,
      // Yalnızca ÖLÇÜLEN kotalar yazılıyor; ölçümü olmayan limit,
      // kurucunun koruma sandığı boş bir sayı olurdu.
      kotaOzeti: seciliKota
        ? `${seciliKota.kullanici.kullanilan}/${seciliKota.kullanici.limit} kullanıcı · ${seciliKota.depolama.kullanilan}/${seciliKota.depolama.limit} MB`
        : null,
      cekirdek: true,
    },
    ...ADDON_PRODUCTS.map((urun) => {
      const satir = urunById.get(urun.code);
      return {
        product: urun.code,
        name: urun.name,
        status: satir?.status ?? "inactive",
        integrated: satir?.integrated ?? true,
        monthlyFee: satir?.monthly_fee ?? null,
        // Kota özeti yalnızca ölçümü yazılmış ürünlerde doluyor.
        kotaOzeti: kotaOzetiYaz(urunKotalari(urun.code, satir?.limits, kullanimById[urun.code])),
        cekirdek: false,
      };
    }),
  ];

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
    { key: "created", title: "Kurum oluşturuldu", note: `${planList.find((plan) => plan.code === selected.plan_code)?.name ?? selected.plan_code} paketi · ${enabledCount} modül etkin`, state: selected.provisioning_state === "creating" ? "todo" : "done" },
    {
      key: "invite", title: "Sahibe davet gönderildi", state: inviteState,
      note: !invitation ? (hasActiveMember ? "Davet gerekmedi; sahip doğrudan eklendi." : "Davet kaydı yok.") : invitation.status === "failed" ? `Davet gönderilemedi: ${invitation.error_message ?? "bilinmeyen hata"}. Aşağıdan giriş bağlantısı oluşturun.` : `${invitation.email}${invitation.sent_at ? ` · ${tarihSaat(invitation.sent_at)}` : ""}`,
    },
    { key: "joined", title: "Sahip hesabını açtı", state: ownerJoined ? "done" : "todo", note: ownerJoined ? `${invitation?.accepted_at ? `Katıldı · ${tarihSaat(invitation.accepted_at)}` : "Hesap açık"} · ${memberCount ?? 0} aktif kullanıcı` : "Davet bekleniyor. E-posta gelmediyse giriş bağlantısını WhatsApp’tan gönderin." },
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
  const ad = selected.display_name || selected.name;
  const bekleyenAdimlar = checks.filter((check) => !check.optional && check.state !== "done");
  const donem = seciliLisans?.license_status === "trialing" ? seciliLisans.trial_ends_at : seciliLisans?.current_period_end ?? null;

  return <div className="plt-dosya">
    {/*
      KİMLİK EN ÜSTTE. Kiracının adı sayfanın ortasında duruyordu: kimin
      dosyasına baktığınızı görmek için aşağı kaydırmak gerekiyordu.
      Dosya "bu kim" ile başlamalı — kimlik, hızlı işlemler ve kota
      rakamları tek şeritte, ayrı üç karta bölünmeden.
    */}
    <header className="plt-kimlik">
      <span className="plt-kiraci-avatar" data-tone={KURULUM_TONU[selected.provisioning_state] ?? "neutral"}>{basHarfleri(ad)}</span>
      <div className="plt-kimlik-ad">
        <h2>{ad}</h2>
        <ul className="plt-kiraci-etiket">
          <li className="is-mono">{selected.slug}</li>
          {selected.sector ? <li>{selected.sector}</li> : null}
          {selected.display_name && selected.name !== selected.display_name ? <li>{selected.name}</li> : null}
          {invitation?.email ? <li>{invitation.email}</li> : null}
        </ul>
      </div>
      <div className="plt-kimlik-islem">
        <span className="status-pill" data-tone={KURULUM_TONU[selected.provisioning_state] ?? "neutral"}>
          {KURULUM_ADI[selected.provisioning_state] ?? selected.provisioning_state}
        </span>
        {/* Kurucunun en sık yaptığı şey kiracının paneline bakmak; üç
            düğme aynı ağırlıktayken hangisinin asıl yol olduğu belli
            değildi. Hepsi mevcut ekranlara götürüyor — konsolda ikinci
            bir yazma yolu açmıyoruz, aksi hâlde aynı kural iki yerde
            durur ve biri sapar. */}
        <a className="panel-primary" href={`https://app.arvo-os.com/panel?organization=${targetId}`} target="_blank" rel="noreferrer">Kiracının paneline git</a>
        <Link className="panel-secondary" href={`/panel/platform/licenses?organization=${targetId}`}>Paket ve limit</Link>
      </div>
    </header>

    {/*
      Kota ve tahsilat tek satırda küçük olgular hâlinde. Bunlar daha önce
      "Kiracı özeti" adında tam genişlikte bir gruplanmış listeydi: beş
      satır, çoğu "Belirtilmedi", ekranın üçte biri. Değer boşsa olgu
      yazılıyor ama soluk — yer kaplamadan.
    */}
    <div className="plt-olgular">
      <span data-tone={seciliLisans ? LISANS_TONU[seciliLisans.license_status] ?? "neutral" : "neutral"}>
        <small>Lisans</small>
        <b>{seciliLisans ? productLicenseLabels[seciliLisans.license_status] ?? seciliLisans.license_status : "Lisans yok"}</b>
      </span>
      <span data-tone={seciliKota?.kullanici.asildi ? "danger" : undefined}>
        <small>Kullanıcı</small>
        <b>{seciliKota ? `${seciliKota.kullanici.kullanilan} / ${seciliKota.kullanici.limit}` : "—"}</b>
      </span>
      <span data-tone={seciliKota?.depolama.asildi ? "danger" : undefined}>
        <small>Depolama</small>
        <b>{seciliKota ? `${depolama(seciliKota.depolama.kullanilan)} / ${depolama(seciliKota.depolama.limit)}` : "—"}</b>
      </span>
      <span>
        <small>Aylık ücret</small>
        <b className={seciliLisans?.monthly_fee ? undefined : "is-empty"}>{seciliLisans?.monthly_fee ? para(Number(seciliLisans.monthly_fee)) : "Girilmedi"}</b>
      </span>
      <span>
        <small>{seciliLisans?.license_status === "trialing" ? "Deneme bitişi" : "Dönem sonu"}</small>
        <b className={donem ? undefined : "is-empty"}>{donem ? tarih(donem) : "Girilmedi"}</b>
      </span>
      <span>
        <small>Son tahsilat</small>
        <b className={sonTahsilat ? undefined : "is-empty"}>{sonTahsilat ? `${para(Number(sonTahsilat.amount))} · ${tarih(sonTahsilat.reviewed_at ?? sonTahsilat.created_at)}` : "Yok"}</b>
      </span>
      <span data-tone={bekleyenOdeme.length ? "warning" : undefined}>
        <small>Bekleyen dekont</small>
        <b className={bekleyenOdeme.length ? undefined : "is-empty"}>
          {bekleyenOdeme.length ? <Link className="kiraci-baglanti" href="/panel/platform/payments">{bekleyenOdeme.length} bildirim →</Link> : "Yok"}
        </b>
      </span>
      <span data-tone={wa?.status === "connected" ? "success" : undefined}>
        <small>WhatsApp</small>
        <b className={wa ? undefined : "is-empty"}>{wa ? (wa.status === "connected" ? wa.display_phone ?? "Bağlı" : "Doğrulanamadı") : "Bağlı değil"}</b>
      </span>
      <span data-tone={selected.custom_domain && selected.custom_domain_status !== "verified" ? "warning" : undefined}>
        <small>Alan adı</small>
        <b className="is-mono">{selected.custom_domain ? `${selected.custom_domain}${selected.custom_domain_status === "verified" ? "" : " · doğrulanmadı"}` : "Arvo alan adı"}</b>
      </span>
      {/* Kurulum eksikse tek satır yeter: dokuz maddelik "tamam" listesi
          her açılışta ekranın yarısını kaplıyor ve okunacak bir şey
          söylemiyordu. Eksik varsa ne eksik olduğu yazıyor. */}
      <span data-tone={progress === 100 ? "success" : "warning"}>
        <small>Kurulum</small>
        <b>{progress === 100 ? `Tamamlandı · ${doneCount}/${required.length}` : `${doneCount}/${required.length} adım`}</b>
      </span>
    </div>

    {wa?.last_error ? <p className="plt-uyari"><StgIcon name="lock" size={15} />{wa.last_error}</p> : null}
    {seciliKota?.durum === "asildi" ? (
      <p className="plt-uyari" data-tone="danger"><StgIcon name="shield" size={15} />Bu kiracı limitini aşmış. Limit yalnızca burada görünür; kiracının kullanımını kesmez.</p>
    ) : null}

    {/*
      KURUM AYARLARI EN ÜSTTE. Kurucunun bu dosyada en sık değiştirdiği
      şey bu form ve sayfanın en altındaydı: her seferinde altı bölüm
      kaydırmak gerekiyordu.
    */}
    <div className="plt-dosya-izgara">
      <section className="stg-card plt-kompakt" aria-labelledby="ayarlar-title">
        <header className="stg-card-head">
          <span className="stg-card-icon" data-tone="info"><StgIcon name="palette" size={18} /></span>
          <div className="stg-card-title"><small>KURUM ÇEKİRDEĞİ</small><h2 id="ayarlar-title">Kurum ayarları</h2></div>
        </header>
        <form className="panel-form" action={updateOrganizationSettings}>
          <input type="hidden" name="organization_id" value={targetId} />
          <label className="wide">Yasal unvan<input name="name" defaultValue={selected.name} minLength={2} maxLength={160} required /></label>
          <label className="wide">Tabela unvanı <small className="plt-optional">boşsa yasal unvan</small><input name="display_name" defaultValue={selected.display_name ?? ""} maxLength={80} placeholder="Örn. AkademikMerkez" /></label>
          <label>Sektör<input name="sector" defaultValue={selected.sector ?? "general"} minLength={2} maxLength={80} required /></label>
          <label>Kurum türü<select name="kind" defaultValue={selected.kind ?? "customer"}><option value="customer">Müşteri</option><option value="internal">Kendi markamız</option></select></label>
          <label>Paket<select name="plan_code" defaultValue={selected.plan_code}>{planList.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
          <label>İletişim telefonu <small className="plt-optional">ödeme hatırlatması buraya gider</small><input name="contact_phone" type="tel" defaultValue={selected.contact_phone ?? ""} maxLength={20} placeholder="05XX XXX XX XX" /></label>
          <label className="wide">Özel alan adı<input name="custom_domain" defaultValue={selected.custom_domain ?? ""} placeholder="panel.firma.com" /></label>
          <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Ayarları kaydet</button></div>
        </form>
      </section>

      <section className="stg-card plt-kompakt" aria-labelledby="uyeler-title">
        <header className="stg-card-head">
          <span className="stg-card-icon" data-tone={seciliKota?.kullanici.asildi ? "danger" : "neutral"}><StgIcon name="users" size={18} /></span>
          <div className="stg-card-title"><small>ERİŞİM</small><h2 id="uyeler-title">Üyeler</h2></div>
          <div className="stg-card-aside">
            <span className="status-pill" data-tone={seciliKota?.kullanici.asildi ? "danger" : "neutral"}>
              {seciliKota ? `${seciliKota.kullanici.kullanilan}/${seciliKota.kullanici.limit}` : kiraciUyeleri.length}
            </span>
            <Link className="panel-secondary" href={`/panel/platform/licenses?organization=${targetId}`}>Limit</Link>
          </div>
        </header>
        <KiraciUyeleri organizationId={targetId} kurumAdi={ad} uyeler={kiraciUyeleri} />
      </section>
    </div>

    {/*
      Modüller yatay: dört ürün yan yana kart hâlinde. Satır satır
      dizildiğinde her ürün ekranın tüm genişliğini kaplıyor ama içinde
      üç kısa bilgi taşıyordu; dört satır boşuna dört ekran yüksekliği
      demekti.
    */}
    <section className="stg-card plt-kompakt" aria-labelledby="moduller-title">
      <header className="stg-card-head">
        <span className="stg-card-icon" data-tone="gold"><StgIcon name="grid" size={18} /></span>
        <div className="stg-card-title">
          <small>ERİŞİM VE ENTEGRASYON</small>
          <h2 id="moduller-title">Modüller</h2>
          <p>Erişim kiracının ürüne girip giremediğini, köprü ArvoOS ile otomatik veri akışını yönetir. İkisi ayrı: ödemesini yapmış bir kiracı bağımsız çalışmayı seçebilir.</p>
        </div>
      </header>
      <ModulMatrisi organizationId={targetId} kurumAdi={ad} satirlar={modulSatirlari} />
    </section>

    {/*
      Panel modülleri ve son etkinlik yan yana. İkisi de "kiracı ne
      kullanıyor" sorusunun parçası ve ikisi de dar sütuna sığıyor.
      Etkinlik listesi kendi içinde kayıyor: altı satır bile sayfayı
      uzatıyordu, kaydırma sayfanın değil kartın işi.
    */}
    <div className="plt-dosya-izgara">
      <section className="stg-card plt-kompakt" aria-labelledby="panel-moduller-title">
        <header className="stg-card-head">
          <span className="stg-card-icon" data-tone="gold"><StgIcon name="box" size={18} /></span>
          <div className="stg-card-title"><small>PAKET VE ERİŞİM</small><h2 id="panel-moduller-title">Panel modülleri</h2></div>
          <div className="stg-card-aside"><span className="status-pill" data-tone="gold">{enabledCount}/{moduleRows.length}</span></div>
        </header>
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
                <button type="submit" className={module.enabled ? "plt-switch is-on" : "plt-switch is-off"} role="switch" aria-checked={module.enabled} aria-label={`${module.name}: ${module.enabled ? "kapat" : "aç"}`}><i /></button>
              </form>
            ))}
          </div>
        ) : <div className="stg-empty"><StgIcon name="grid" size={22} /><p>Bu kurum için modül kaydı yok.</p></div>}
      </section>

      <section className="stg-card plt-kompakt" aria-labelledby="etkinlik-title">
        <header className="stg-card-head">
          <span className="stg-card-icon" data-tone="neutral"><StgIcon name="chart" size={18} /></span>
          <div className="stg-card-title"><small>PANEL</small><h2 id="etkinlik-title">Son etkinlik</h2></div>
        </header>
        {etkinlikSatirlari.length ? (
          <ul className="plt-etkinlik plt-kaydir">
            {etkinlikSatirlari.map((satir, sira) => (
              <li key={`${satir.created_at}-${sira}`}>
                <span className="plt-etkinlik-nokta" aria-hidden="true" />
                <span>
                  <b>{ETKINLIK_ADI[satir.action] ?? satir.action}</b>
                  <small>{VARLIK_ADI[satir.entity_type] ?? satir.entity_type} · {tarihSaat(satir.created_at)}</small>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="stg-empty"><StgIcon name="doc" size={22} /><p>Bu kiracının panelinde henüz bir işlem yapılmamış.</p></div>
        )}
      </section>
    </div>

    {/*
      Kurulum ayrıntısı kapalı geliyor. Dokuz maddelik liste her açılışta
      ekranın yarısını kaplıyor, yerleşmiş bir kiracıda dokuz yeşil tik
      okunacak bir şey söylemiyordu. Eksik adımlar özet satırında yazıyor;
      tamamını görmek isteyen açıyor.
    */}
    {progress < 100 || invitation ? (
      <details className="stg-card plt-kompakt plt-kurulum" open={progress < 100 && bekleyenAdimlar.length > 0}>
        <summary>
          <span className="stg-card-icon" data-tone={progress === 100 ? "success" : "warning"}><StgIcon name="check" size={18} /></span>
          <span className="plt-kurulum-ad">
            <b>{progress === 100 ? "Kurulum tamamlandı" : "Müşteriyi panele alın"}</b>
            <small>
              {bekleyenAdimlar.length
                ? `Eksik: ${bekleyenAdimlar.map((check) => check.title.toLocaleLowerCase("tr-TR")).join(", ")}`
                : `${doneCount}/${required.length} adım tamam`}
            </small>
          </span>
          <span className="plt-progress" aria-label={`Kurulum ilerlemesi yüzde ${progress}`}><i style={{ width: `${progress}%` }} /><b>{doneCount}/{required.length}</b></span>
        </summary>
        <ol className="plt-checks">
          {checks.map((check) => (
            <li key={check.key} className={`is-${check.state}`}>
              <span className="plt-check-dot" aria-hidden="true">{check.state === "done" ? <StgIcon name="check" size={13} /> : check.state === "bad" ? "!" : check.state === "unknown" ? "?" : ""}</span>
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
            <OwnerAccessLink organizationId={targetId} organizationName={ad} ownerEmail={invitation.email} />
          </div>
        ) : null}
      </details>
    ) : null}

    {/*
      Kurulum kayıtları yalnızca işe yaradığında: kurulum sürüyorsa ya da
      bir adım hata verdiyse. Yerleşmiş kiracıda sekiz satırlık teknik
      dökümün karşılığı yok.
    */}
    {progress < 100 || auditRows.some((entry) => entry.result === "failed" || entry.state === "failed") ? (
      <details className="stg-card plt-kompakt plt-kurulum">
        <summary>
          <span className="stg-card-icon" data-tone="neutral"><StgIcon name="chart" size={18} /></span>
          <span className="plt-kurulum-ad"><b>Kurulum kayıtları</b><small>{auditRows.length} kayıt</small></span>
        </summary>
        {auditRows.length ? (
          <ol className="plt-audit plt-kaydir">
            {auditRows.map((entry) => (
              <li key={entry.id} data-tone={entry.result === "failed" || entry.state === "failed" ? "danger" : "neutral"}>
                <span className="plt-audit-dot" aria-hidden="true" />
                <span>
                  <b>{actionLabels[entry.action] ?? entry.action} · {KURULUM_ADI[entry.state] ?? entry.state}</b>
                  <small>{tarihSaat(entry.created_at)}{entry.duration_ms != null ? ` · ${entry.duration_ms} ms` : ""}{entry.result ? ` · ${entry.result}` : ""}</small>
                </span>
              </li>
            ))}
          </ol>
        ) : <div className="stg-empty"><StgIcon name="chart" size={22} /><p>Bu kurum için henüz kurulum kaydı yok.</p></div>}
      </details>
    ) : null}
  </div>;
}
