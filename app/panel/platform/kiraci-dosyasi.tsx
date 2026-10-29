import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { panelModules } from "@/lib/panel-context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ORGANIZATION_LEGAL_COLUMNS } from "@/app/_components/legal/organization";
import { legalDetailsFrom, validateLegalDetails } from "../settings/legal-details";
import { KiraciUyeleri } from "./kiraci-uyeleri";
import { kiraciUyeleriniOku } from "./kiraci-uyeleri-oku";
import { ModulMatrisi, type ModulSatiri } from "./modul-matrisi";
import { ADDON_PRODUCTS, productLicenseLabels } from "@/lib/products";
import { kotaOzetiYaz, urunKotalari } from "@/lib/urun-kotasi";
import { lisansOlcumleri } from "@/lib/lisans-olcumleri";
import type { KotaDurumu } from "@/lib/kota-durumu";
import { KKart, KNot } from "./konsol-ui";
import { MobilSatir } from "../crm/table-cells";
import { KURULUM_ADI, KURULUM_TONU, LISANS_TONU, basHarfleri, depolama, para, tarih, tarihSaat } from "./bicim";
import { toggleOrganizationModule, updateOrganizationSettings } from "./actions";
import { OwnerAccessLink } from "./owner-access-link";
// Ortak kayıt formu düzeni (alan görünümü, zorunlu alan işareti).
import "../components/kayit-formu.css";
import { eylemEtiketi, varlikEtiketi } from "@/lib/kayit-etiketleri";

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
  custom_domain: string | null; custom_domain_status: string | null; provisioning_state: string; logo_url: string | null; kind: string; contact_phone: string | null; grup_markasi?: boolean | null;
};
export type DosyaDaveti = { organization_id: string; email: string; status: string; sent_at: string | null; accepted_at: string | null; error_message: string | null };
export type DosyaUyeligi = { organization_id: string; user_id: string; role: string; is_active: boolean };

const actionLabels: Record<string, string> = { provision_organization: "Kurulum", owner_access_link: "Giriş bağlantısı" };



const Bos = ({ baslik, aciklama }: { baslik: string; aciklama: string }) => (
  <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>{baslik}</h2><p>{aciklama}</p></div>
);

export async function KiraciDosyasi({ supabase, selected, invitation, planList, tumUyelikler, seciliKota, seciliLisans, pencerede = false }: {
  supabase: SupabaseClient;
  selected: DosyaKurumu;
  invitation: DosyaDaveti | null;
  planList: { code: string; name: string }[];
  tumUyelikler: DosyaUyeligi[];
  seciliKota: KotaDurumu | null;
  seciliLisans: { license_status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null } | null;
  /*
    Müşteri detayının "Kurum Ayarları" penceresinde (14.10.2026: kiracı
    dosyası sayfası kaldırıldı, müşteri detayına taşındı). Orada özet
    şeridi, üyeler ve son etkinlik ZATEN var (sayfanın şeridi, Kullanıcılar
    penceresi, Son etkinlik kartı); burada tekrar çizilmiyor.
  */
  pencerede?: boolean;
}) {
  const targetId = selected.id;
  const admin = createAdminClient();

  /*
    TEK TUR (14.10.2026). Okumalar dört ayrı Promise.all'da sırayla
    bekleniyordu (çekirdek → üyeler → ürünler → ödeme/kanal/etkinlik);
    hiçbiri ötekine bağlı değil. Müşteri detayının penceresinde
    (pencerede) gösterilmeyenler hiç okunmuyor: üye listesi (her üye için
    ayrı e-posta sorgusu), ödemeler ve etkinlik — onlar detay sayfasında
    ve Kullanıcılar penceresinde. Pencere 1,2 sn'de açılıyordu.
  */
  const bos = Promise.resolve({ data: [] as unknown[] });
  const [
    [{ count: memberCount }, { data: moduleData }, { data: auditData }, legalResult, onboardingResult, opportunityResult],
    kiraciUyeleri,
    [{ data: urunLisanslari }, { kullanim }],
    [{ data: odemeler }, { data: whatsappHesabi }, { data: etkinlikler }],
  ] = await Promise.all([Promise.all([
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", targetId).eq("is_active", true),
    supabase.from("organization_modules").select("module_code,is_enabled,arvo_modules(name,description,sort_order)").eq("organization_id", targetId),
    supabase.from("provisioning_audit_logs").select("id,action,state,result,duration_ms,created_at").eq("organization_id", targetId).order("created_at", { ascending: false }).limit(8),
    supabase.from("organizations").select(`${ORGANIZATION_LEGAL_COLUMNS},signature_stamp_url`).eq("id", targetId).maybeSingle(),
    // İlk kurulum kaydı yalnızca kurum üyelerine açık (RLS); kurucu sunucu anahtarıyla okur.
    admin ? admin.from("organization_onboarding").select("completed_at").eq("organization_id", targetId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    // Talepler de yalnızca kurum üyelerine açık; sayı sunucu anahtarıyla okunur.
    admin ? admin.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", targetId) : Promise.resolve({ count: null, error: null }),
  ]),
  /* Üyeler: ad profiles'tan, e-posta yönetim API'sinden (kiraci-uyeleri-oku). */
  pencerede ? Promise.resolve([]) : kiraciUyeleriniOku(supabase, admin, targetId, tumUyelikler),
  /*
    Modül matrisi: ArvoOS çekirdeği organization_licenses'ta, diğer üç ürün
    organization_product_licenses'ta. Ürün kullanımı yalnızca SEÇİLİ kiracı
    için ve 60 sn önbellekte (lib/lisans-olcumleri): iki ayrı veritabanına
    (ArvoLab, Randevu) gidiyor.
  */
  Promise.all([
    supabase.from("organization_product_licenses").select("product,status,monthly_fee,integrated,limits").eq("organization_id", targetId),
    lisansOlcumleri(targetId),
  ]),
  /*
    Ödeme, kanal ve son etkinlik. Ödeme ve etkinlik yalnızca kurum
    üyelerine açık (RLS); kurucu sunucu anahtarıyla okuyor.
  */
  Promise.all([
    admin && !pencerede
      ? admin.from("organization_payment_requests").select("id,amount,currency,status,created_at,reviewed_at").eq("organization_id", targetId).order("created_at", { ascending: false }).limit(20)
      : bos,
    admin
      ? admin.from("whatsapp_accounts").select("status,display_phone,verified_name,last_error").eq("organization_id", targetId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin && !pencerede
      ? admin.from("activity_logs").select("action,entity_type,created_at,metadata").eq("organization_id", targetId).order("created_at", { ascending: false }).limit(6)
      : bos,
  ]),
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
  // tuzak-tamam: moduleRows organization_modules'tan SINIRSIZ okunuyor; aynı Promise.all'daki .limit() denetim kayıtları ve etkinlik sorgularına ait.
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

  const lisansAdi = seciliLisans ? productLicenseLabels[seciliLisans.license_status] ?? seciliLisans.license_status : "Lisans yok";
  const lisansTonu = seciliLisans ? LISANS_TONU[seciliLisans.license_status] ?? "neutral" : "neutral";
  const CHECK_DURUMU: Record<CheckState, { etiket: string; ton: string }> = {
    done: { etiket: "Tamam", ton: "success" },
    todo: { etiket: "Eksik", ton: "warning" },
    bad: { etiket: "Hata", ton: "danger" },
    unknown: { etiket: "Okunamadı", ton: "neutral" },
  };

  /*
    PANELİN KAYIT DETAYI GİBİ (14.10.2026). Dosya ayarlar ekranının kart
    dilindeydi (renkli simge kutusu, büyük harfli üst başlık) ve kendi
    olgu şeridi (.plt-olgular) vardı. Artık panelin personel / talep
    detayıyla aynı: üstte olgu şeridi (.kayit-serit), altında solda
    kimlik kartı, sağda form; kalan bölümler panel kartı ve tablosu.
  */
  return <>
    {/*
      Kota ve tahsilat tek satırda küçük olgular hâlinde. Bunlar daha önce
      "Kiracı özeti" adında tam genişlikte bir gruplanmış listeydi: beş
      satır, çoğu "Belirtilmedi", ekranın üçte biri. Değer boşsa olgu
      yazılıyor ama soluk — yer kaplamadan.
    */}
    {pencerede ? null : <nav className="kayit-serit talep-serit" aria-label="Kiracı özeti">
      <dl>
        <div><dt>Lisans</dt><dd><span className="status-pill" data-tone={lisansTonu}>{lisansAdi}</span></dd></div>
        <div>
          <dt>Kullanıcı</dt>
          <dd className={seciliKota?.kullanici.asildi ? "talep-uyari" : seciliKota ? undefined : "talep-bos"}>{seciliKota ? `${seciliKota.kullanici.kullanilan} / ${seciliKota.kullanici.limit}` : "—"}</dd>
        </div>
        <div>
          <dt>Depolama</dt>
          <dd className={seciliKota?.depolama.asildi ? "talep-uyari" : seciliKota ? undefined : "talep-bos"}>{seciliKota ? `${depolama(seciliKota.depolama.kullanilan)} / ${depolama(seciliKota.depolama.limit)}` : "—"}</dd>
        </div>
        <div>
          <dt>Aylık ücret</dt>
          <dd className={seciliLisans?.monthly_fee ? undefined : "talep-bos"}>{seciliLisans?.monthly_fee ? para(Number(seciliLisans.monthly_fee)) : "Girilmedi"}</dd>
        </div>
        <div>
          <dt>{seciliLisans?.license_status === "trialing" ? "Deneme bitişi" : "Dönem sonu"}</dt>
          <dd className={donem ? undefined : "talep-bos"}>{donem ? tarih(donem) : "Girilmedi"}</dd>
        </div>
        <div>
          <dt>Son tahsilat</dt>
          <dd className={sonTahsilat ? undefined : "talep-bos"}>{sonTahsilat ? para(Number(sonTahsilat.amount)) : "Yok"}</dd>
          {sonTahsilat ? <small>{tarih(sonTahsilat.reviewed_at ?? sonTahsilat.created_at)}</small> : null}
        </div>
        <div>
          <dt>Bekleyen dekont</dt>
          <dd className={bekleyenOdeme.length ? "talep-uyari" : "talep-bos"}>
            {bekleyenOdeme.length ? <Link className="kiraci-baglanti" href="/panel/platform/payments">{bekleyenOdeme.length} bildirim →</Link> : "Yok"}
          </dd>
        </div>
        <div>
          <dt>WhatsApp</dt>
          <dd className={wa?.status === "connected" ? "cari-arti" : wa ? "talep-uyari" : "talep-bos"}>{wa ? (wa.status === "connected" ? wa.display_phone ?? "Bağlı" : "Doğrulanamadı") : "Bağlı değil"}</dd>
        </div>
        {/* Kurulum eksikse tek satır yeter: dokuz maddelik "tamam" listesi
            her açılışta ekranın yarısını kaplıyor ve okunacak bir şey
            söylemiyordu. Eksik varsa ne eksik olduğu yazıyor. */}
        <div>
          <dt>Kurulum</dt>
          <dd className={progress === 100 ? "cari-arti" : "talep-uyari"}>{progress === 100 ? `Tamamlandı · ${doneCount}/${required.length}` : `${doneCount}/${required.length} adım`}</dd>
        </div>
      </dl>
    </nav>}

    {wa?.last_error ? <KNot ton="uyari">WhatsApp: {wa.last_error}</KNot> : null}
    {seciliKota?.durum === "asildi" ? (
      <KNot ton="tehlike">Bu kiracı limitini aşmış. Limit yalnızca burada görünür; kiracının kullanımını kesmez.</KNot>
    ) : null}

    {/*
      KİMLİK EN ÜSTTE. Kiracının adı sayfanın ortasında duruyordu: kimin
      dosyasına baktığınızı görmek için aşağı kaydırmak gerekiyordu.
      Dosya "bu kim" ile başlamalı — kimlik, hızlı işlemler ve kota
      rakamları tek şeritte, ayrı üç karta bölünmeden.

      KURUM AYARLARI EN ÜSTTE. Kurucunun bu dosyada en sık değiştirdiği
      şey bu form ve sayfanın en altındaydı: her seferinde altı bölüm
      kaydırmak gerekiyordu.
    */}
    <div className={pencerede ? undefined : "talep-izgara personel-iki"}>
      {pencerede ? null : <section className="panel-card talep-musteri" aria-label="Kiracı">
        <div className="talep-musteri-kimlik">
          <span className="talep-avatar" aria-hidden="true">{basHarfleri(ad)}</span>
          <div>
            <h2>{ad}</h2>
            <small><span className="status-pill" data-tone={KURULUM_TONU[selected.provisioning_state] ?? "neutral"}>{KURULUM_ADI[selected.provisioning_state] ?? selected.provisioning_state}</span></small>
          </div>
        </div>
        {/* Kurucunun en sık yaptığı şey kiracının paneline bakmak; üç
            düğme aynı ağırlıktayken hangisinin asıl yol olduğu belli
            değildi. Hepsi mevcut ekranlara götürüyor — konsolda ikinci
            bir yazma yolu açmıyoruz, aksi hâlde aynı kural iki yerde
            durur ve biri sapar. */}
        <div className="talep-iletisim">
          <a className="panel-primary" href={`https://app.arvo-os.com/panel?organization=${targetId}`} target="_blank" rel="noreferrer">Kiracının paneline git</a>
          {pencerede ? null : <Link className="panel-secondary" href={`/panel/platform/musteriler/${targetId}?pencere=lisanslar`}>Paket ve limit</Link>}
        </div>
        <dl className="talep-liste">
          <div><dt>Çalışma alanı</dt><dd className="plt-mono">{selected.slug}</dd></div>
          <div><dt>Sektör</dt><dd>{selected.sector || <em>Belirtilmedi</em>}</dd></div>
          {selected.display_name && selected.name !== selected.display_name ? <div><dt>Yasal unvan</dt><dd>{selected.name}</dd></div> : null}
          <div><dt>Sahip</dt><dd>{invitation?.email || <em>Davet kaydı yok</em>}</dd></div>
          <div><dt>Telefon</dt><dd>{selected.contact_phone || <em>Yok</em>}</dd></div>
          <div>
            <dt>Alan adı</dt>
            <dd className={selected.custom_domain && selected.custom_domain_status !== "verified" ? "talep-uyari" : undefined}>
              {selected.custom_domain ? `${selected.custom_domain}${selected.custom_domain_status === "verified" ? "" : " · doğrulanmadı"}` : <em>Arvo alan adı</em>}
            </dd>
          </div>
        </dl>
      </section>}

      <section className="panel-card talep-bilgi" aria-labelledby="ayarlar-title">
        <div className="cari-baslik">
          <h2 id="ayarlar-title">Kurum ayarları</h2>
          {pencerede
            ? <small><span className="plt-mono">{selected.slug}</span> · <a href={`https://app.arvo-os.com/panel?organization=${targetId}`} target="_blank" rel="noreferrer">Kiracının paneli ↗</a></small>
            : <small>kurum çekirdeği</small>}
        </div>
        <form className="panel-form kayit-formu" action={updateOrganizationSettings}>
          <input type="hidden" name="organization_id" value={targetId} />
          <label className="wide"><span>Yasal unvan<b className="req" aria-hidden="true">*</b></span><input name="name" defaultValue={selected.name} minLength={2} maxLength={160} required /></label>
          <label className="wide"><span>Tabela unvanı <small className="plt-optional">boşsa yasal unvan</small></span><input name="display_name" defaultValue={selected.display_name ?? ""} maxLength={80} placeholder="Örn. AkademikMerkez" /></label>
          <label><span>Sektör<b className="req" aria-hidden="true">*</b></span><input name="sector" defaultValue={selected.sector ?? "general"} minLength={2} maxLength={80} required /></label>
          {/* "Grup markası" ayrı bir tür değil, müşteri kurumunun raporlama işareti
              (organizations.grup_markasi): kind='internal' WhatsApp kutusunu,
              sözleşme→abonelik isteğini ve belge yolunu değiştiriyor; grup
              markası ise sıradan bir kiracı gibi çalışıp yalnızca gelirden ayrılıyor. */}
          <label>Kurum türü<select name="kind" defaultValue={selected.kind === "internal" ? "internal" : selected.grup_markasi ? "grup" : "customer"}><option value="customer">Müşteri</option><option value="grup">Grup markası</option><option value="internal">Arvo (kendisi)</option></select></label>
          {/*
            PAKET BURADAN DEĞİŞMİYOR (14.10.2026).

            Bu seçim yalnızca organizations.plan_code'u yazıyordu; limit,
            ücret, dönem ve kota ise organization_licenses'ta duruyor ve
            ona dokunmuyordu. Yani paketi buradan değiştiren kurucu bir
            ETİKET değiştiriyor, kiracının hakkını değil — üstelik
            Lisanslar penceresi eski paketi yazmaya devam ettiği için aynı
            kiracı iki ekranda iki farklı pakette görünüyordu (Deneme
            Salon'da "Başlangıç" ve "Özel kurum").

            Paket, limitleri ve ücretiyle birlikte Lisanslar penceresinde
            değişiyor; o form iki sütunu da yazıyor. Kurum oluşturulurken
            paket yine seçiliyor (yeni müşteri sihirbazı): orada lisans
            satırını tetikleyici o koddan yaratıyor.
          */}
          <label><span>İletişim telefonu <small className="plt-optional">ödeme hatırlatması buraya gider</small></span><input name="contact_phone" type="tel" defaultValue={selected.contact_phone ?? ""} maxLength={20} placeholder="05XX XXX XX XX" /></label>
          <label className="wide"><span>Özel alan adı <small className="plt-optional">yalnızca Özel kurum paketinde</small></span><input name="custom_domain" defaultValue={selected.custom_domain ?? ""} placeholder="panel.firma.com" /></label>
          <div className="wide panel-form-actions kayit-formu-eylem"><p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p><button className="panel-primary" type="submit">Ayarları kaydet</button></div>
        </form>
      </section>
    </div>

    {/* Kartlar tek blok içinde alt alta: KKart kendi aralığını veriyor,
        sayfanın (main.talep) aralığı üstüne binmesin. */}
    <div>
      {pencerede ? null : <KKart
        baslik="Üyeler"
        aciklama="Kurumun panel hesapları; erişim buradan açılıp kapatılır."
        sag={<>
          <span className="status-pill" data-tone={seciliKota?.kullanici.asildi ? "danger" : "neutral"}>
            {seciliKota ? `${seciliKota.kullanici.kullanilan}/${seciliKota.kullanici.limit}` : kiraciUyeleri.length}
          </span>
          <Link className="panel-secondary" href={`/panel/platform/musteriler/${targetId}?pencere=lisanslar`}>Limit</Link>
        </>}
      >
        <KiraciUyeleri organizationId={targetId} kurumAdi={ad} uyeler={kiraciUyeleri} />
      </KKart>}

      {/*
        Modüller yatay: dört ürün yan yana kart hâlinde. Satır satır
        dizildiğinde her ürün ekranın tüm genişliğini kaplıyor ama içinde
        üç kısa bilgi taşıyordu; dört satır boşuna dört ekran yüksekliği
        demekti.
      */}
      {pencerede && !modulSatirlari.some((satir) => !satir.cekirdek && ["active", "trialing", "past_due"].includes(satir.status)) ? null : <KKart
        baslik={pencerede ? "Ürün köprüleri" : "Modüller"}
        aciklama={pencerede
          ? "ArvoOS ile otomatik veri akışı. Erişim ve ücret Lisanslar penceresinde."
          : "Erişim kiracının ürüne girip giremediğini, köprü ArvoOS ile otomatik veri akışını yönetir. İkisi ayrı: ödemesini yapmış bir kiracı bağımsız çalışmayı seçebilir."}
      >
        <ModulMatrisi organizationId={targetId} kurumAdi={ad} satirlar={modulSatirlari} yalnizKopru={pencerede} />
      </KKart>}

      {/*
        Panel modülleri ve son etkinlik. İkisi de "kiracı ne kullanıyor"
        sorusunun parçası. Eskiden yan yana dar sütunlardı ve etkinlik
        listesi kendi içinde kayıyordu; artık panel tablosu, altı satır
        sayfayı uzatmıyor.

        PANELİN TABLOSU (29.10.2026, müşteri kartının Kurulum sekmesi). Bu
        dosyanın dört listesi (panel modülleri, son etkinlik, kurulum
        adımları, kurulum kayıtları) 14.10.2026'dan beri iOS satırıydı;
        müşteri kartının öteki sekmeleri hizalı tabloya geçince bu sekme
        farklı bir dilde kalmıştı. Modül anahtarı satırın sonunda.
      */}
      <KKart baslik="Panel modülleri" sag={<span className="status-pill" data-tone="gold">{enabledCount}/{moduleRows.length}</span>}>
        {moduleRows.length ? (
          <div className="talep-tablo fn-ic-tablo">
            <table className="crm-data-table" data-cols="mk-modul">
              <thead><tr><th>Modül</th><th>Durum</th><th>Erişim</th></tr></thead>
              <tbody>
                {moduleRows.map((module) => {
                  const durum = { etiket: module.enabled ? "Açık" : "Kapalı", ton: module.enabled ? "success" : "neutral" };
                  return (
                    <tr key={module.code} className={module.enabled ? undefined : "is-pasif"}>
                      <td data-label="Modül"><span className="crm-table-title">{module.name}</span><span className="crm-table-sub" title={module.description}>{module.description}</span></td>
                      <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                      <td className="crm-table-actions">
                        <form action={toggleOrganizationModule}>
                          <input type="hidden" name="organization_id" value={targetId} />
                          <input type="hidden" name="module_code" value={module.code} />
                          <input type="hidden" name="is_enabled" value={String(!module.enabled)} />
                          <button type="submit" className={module.enabled ? "plt-switch is-on" : "plt-switch is-off"} role="switch" aria-checked={module.enabled} aria-label={`${module.name}: ${module.enabled ? "kapat" : "aç"}`}><i /></button>
                        </form>
                      </td>
                      <MobilSatir baslik={module.name} durum={durum} alt={[module.description]} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Bos baslik="Modül kaydı yok" aciklama="Kurulum tamamlandığında kurumun modülleri burada açılıp kapatılır." />}
      </KKart>

      {pencerede ? null : <KKart baslik="Son etkinlik" aciklama="Kiracının panelindeki son altı işlem.">
        {etkinlikSatirlari.length ? (
          <div className="talep-tablo fn-ic-tablo">
            <table className="crm-data-table" data-cols="mk-etkinlik">
              <thead><tr><th>İşlem</th><th>Kayıt</th><th className="crm-col-date">Zaman</th></tr></thead>
              <tbody>
                {etkinlikSatirlari.map((satir, sira) => (
                  <tr key={`${satir.created_at}-${sira}`}>
                    <td data-label="İşlem"><span className="crm-table-title">{eylemEtiketi(satir.action, "edilgen")}</span></td>
                    <td data-label="Kayıt"><span className="crm-table-sub">{varlikEtiketi(satir.entity_type)}</span></td>
                    <td className="crm-col-date" data-label="Zaman">{tarihSaat(satir.created_at)}</td>
                    <MobilSatir baslik={eylemEtiketi(satir.action, "edilgen")} alt={[varlikEtiketi(satir.entity_type), tarihSaat(satir.created_at)]} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Bos baslik="Panelde işlem yok" aciklama="Kurumun ekibi çalışmaya başlayınca son altı işlem burada görünür." />}
      </KKart>}

      {/*
        Kurulum ayrıntısı kapalı geliyor. Dokuz maddelik liste her açılışta
        ekranın yarısını kaplıyor, yerleşmiş bir kiracıda dokuz yeşil tik
        okunacak bir şey söylemiyordu. Eksik adımlar özet satırında yazıyor;
        tamamını görmek isteyen açıyor.
      */}
      {progress < 100 || invitation ? (
        <details className="panel-card k-kart plt-kurulum" open={progress < 100 && bekleyenAdimlar.length > 0}>
          <summary>
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
          <div className="talep-tablo fn-ic-tablo">
            <table className="crm-data-table" data-cols="mk-adim">
              <thead><tr><th>Adım</th><th>Not</th><th>Durum</th></tr></thead>
              <tbody>
                {checks.map((check) => (
                  <tr key={check.key}>
                    <td data-label="Adım"><span className="crm-table-title">{check.title}</span>{check.optional ? <span className="crm-table-sub">isteğe bağlı</span> : null}</td>
                    <td data-label="Not"><span className="crm-table-sub" title={check.note}>{check.note}</span></td>
                    <td data-label="Durum"><span className="status-pill" data-tone={CHECK_DURUMU[check.state].ton}>{CHECK_DURUMU[check.state].etiket}</span></td>
                    <MobilSatir baslik={check.title} durum={CHECK_DURUMU[check.state]} alt={[check.optional ? "isteğe bağlı" : null, check.note]} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invitation ? (
            <div className="talep-gecmis">
              <h3>Sahibe giriş bağlantısı</h3>
              <p className="panel-muted">{ownerJoined ? "Sahip şifresini unuttuysa yeni şifre bağlantısı gönderin." : "Davet e-postası gelmediyse ya da süresi dolduysa tek kullanımlık bağlantıyı WhatsApp’tan gönderin."}</p>
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
        <details className="panel-card k-kart plt-kurulum">
          <summary>
            <span className="plt-kurulum-ad"><b>Kurulum kayıtları</b><small>{auditRows.length} kayıt</small></span>
          </summary>
          {auditRows.length ? (
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="mk-kayit">
                <thead><tr><th>Adım</th><th>Süre</th><th>Sonuç</th><th className="crm-col-date">Zaman</th></tr></thead>
                <tbody>
                  {auditRows.map((entry) => {
                    const hatali = entry.result === "failed" || entry.state === "failed";
                    const sonuc = { etiket: entry.result || "—", ton: hatali ? "danger" : "neutral" };
                    const ad = `${actionLabels[entry.action] ?? entry.action} · ${KURULUM_ADI[entry.state] ?? entry.state}`;
                    return (
                      <tr key={entry.id}>
                        <td data-label="Adım"><span className="crm-table-title">{ad}</span></td>
                        <td data-label="Süre"><span className="crm-table-sub">{entry.duration_ms != null ? `${entry.duration_ms} ms` : "—"}</span></td>
                        <td data-label="Sonuç"><span className="status-pill" data-tone={sonuc.ton}>{sonuc.etiket}</span></td>
                        <td className="crm-col-date" data-label="Zaman">{tarihSaat(entry.created_at)}</td>
                        <MobilSatir baslik={ad} durum={sonuc} alt={[tarihSaat(entry.created_at)]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <Bos baslik="Kurulum kaydı yok" aciklama="Kurulum adımları koştukça her adım burada tarihiyle birikir." />}
        </details>
      ) : null}
    </div>
  </>;
}
