import { TarihSecici } from "@/app/panel/components/tarih-secici";
import Link from "next/link";
import { kimlikMi } from "@/lib/kimlik";
import { Suspense } from "react";
import { statusTone } from "@/lib/status-tone";
import { belgeGonderimYolu } from "@/lib/belge-gonderim-yolu";
import { arvoKurumuMu } from "@/lib/arvo-kurumu";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { waMeAdresi } from "@/lib/wa-me";
import { istanbulDateTime, todayInIstanbul } from "@/lib/istanbul-date";
import { TEKLIF_ADIMLARI, teklifAdimi } from "@/lib/teklif-asamalari";
import { TEKLIF_GRUP_ADLARI, teklifGrubu } from "@/lib/teklif-grubu";
import { installmentLabel, normalizePaymentSchedule } from "@/lib/payment-schedule";
import { formatSubject } from "@/lib/table-format";
import { WhatsappGonderDugmesi } from "../../whatsapp-gonder-dugmesi";
import { ShareSendLink } from "../../share-send-link";
import { ResmiBilgiUyarisi } from "../../resmi-bilgi-uyarisi";
import { formatPhone } from "@/lib/format-phone";
import { PROPOSAL_STATUS_LABELS as labels, contractStatusLabel } from "../../status-labels";
import { resolvePublicHost } from "@/lib/public-host";
import { formatPersonName } from "@/lib/format-name";
import { organizationBrandName, proposalMessages } from "@/lib/customer-message-templates";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ConfirmDeleteButton } from "../../../accounts/confirm-delete-button";
import {
  deleteProposal,
  fastTrackProposalToContract,
  issueProposalLink,
  resolveProposal,
  updateProposal,
} from "../../proposal-actions";
import { PanelDrawer } from "../../../components/panel-drawer";
import { InternalComments } from "../../internal-comments";
import { RecordHistory } from "../../record-history";
import { PanelModal } from "../../../components/panel-modal";
import { ozetZamani, yorumOzetiOku } from "../../kayit-detay/akis-kanallari";
import { KanalDugmesi } from "../../kayit-detay/kanal-dugmesi";
import { PostaAkisi, WhatsappAkisi, musteriPostalari, musteriWhatsapp } from "../../musteri-yazismalari";
import "../../request-page.css";
import "../../crm.css";
import "../../kayit-detay/kayit-detay.css";
import "../../../components/kayit-formu.css";
import { kurumHizmetTurleri } from "@/lib/hizmet-turleri-oku";
import { HizmetTuruOnerileri } from "../../hizmet-turu-onerileri";
import { liraYazisi } from "@/lib/turkish-amount";
import { doluAlanlar, type Kunye } from "@/lib/musteri-kunyesi";
import { modulGerek } from "@/lib/modul-kapisi";

/*
  TEKLİF DETAYI (2026-10): talep detayıyla aynı üç sütun.

  Üstte teklif no, başlık, durumuna göre asıl işlem (göndermeden önce
  "Müşteriye gönder", gönderdikten sonra "Sözleşmeye dönüştür",
  sözleşmesi varsa "Sözleşmeye git") ve "⋯" menüsü; altında aşama
  çizgisi. Solda müşteri ve müşteri bağlantısı (gönderim düğmeleri),
  ortada tutar, geçerlilik ve kapsam, sağda yorumlar ve kayıt geçmişi.

  Eskiden bağlantı kartı en üstte ayrı duruyor, 12 alanlık tablo tek
  kartta, işlemler en altta, kayıt geçmişi onun da altındaydı.
*/

type Props = { params: Promise<{ id: string }> };

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value / 100);
/* Dilim şart: last_viewed_at ve created_at birer AN. Dilimsiz
   biçimlendirilince sunucunun UTC'si yazılıyor ve Türkiye'de gece
   00:00–03:00 arasında olan her şey bir önceki güne düşüyor. */
const tarih = (value: string | null) =>
  value ? istanbulDateTime(value, { day: "numeric", month: "long", year: "numeric" }) : null;
/** Geçerliliğe kalan gün (bugün = 0, geçmişse negatif); Türkiye takvimiyle. */
const kalanGun = (valid: string, bugun: string) => Math.round((Date.parse(valid) - Date.parse(bugun)) / 86_400_000);
/* Olay tarihi uzun ve günlü ("27 Ekim 2026 Salı"); gönderim ve görüntüleme birer AN, dilim şart. */
const uzunTarih = (value: string) => istanbulDateTime(value, { day: "numeric", month: "long", year: "numeric", weekday: "long" });
const KDV_ADI: Record<string, string> = { excluded: "KDV hariç", included: "KDV dahil", exempt: "KDV istisna" };

export default async function ProposalDetailPage({ params }: Props) {
  const { id } = await params;
  /* Bozuk/kırpılmış kimlik "kayıt yok"tur: Postgres uuid olmayan değeri
     22P02 ile reddediyor ve sayfa onu çökme ekranına çeviriyordu. */
  if (!kimlikMi(id)) notFound();
  const { supabase, membership, modules, organization, izin, userId } = await getPanelContext();
  modulGerek(modules, "crm");

  const [{ data, error }, { data: sozlesmeData }] = await Promise.all([
    supabase
      .from("crm_proposals")
      .select("id,proposal_no,title,scope,amount,net_amount,gross_amount,tax_status,currency,payment_plan,payment_schedule,valid_until,status,archive_reason,superseded_by,previous_revision_id,created_at,sent_at,first_viewed_at,last_viewed_at,view_count,revision_no,root_proposal_id,share_token,opportunity_id,crm_opportunities!inner(id,customer_name,contact_email,contact_phone,title,assigned_employee_id,request_details)")
      .eq("id", id)
      .eq("organization_id", membership.organization_id)
      .maybeSingle(),
    /* Bu tekliften üretilen sözleşme: aşama çizgisinin son adımı ve
       "Sözleşmeye git". İptal/red edilenler sayılmaz. */
    supabase
      .from("crm_contracts")
      .select("id,contract_no,status")
      .eq("organization_id", membership.organization_id)
      .eq("proposal_id", id)
      .not("status", "in", "(rejected,cancelled)")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (error) throw new Error("Teklif bilgileri okunamadı: " + error.message);
  if (!data) notFound();
  const sozlesme = ((sozlesmeData ?? []) as { id: string; contract_no: string; status: string }[])[0] ?? null;

  /*
    REVİZYON ZİNCİRİ (2026-10, sözleşme detayıyla eşitleme): aynı kökten
    çıkan bütün sürümler. Eskiden yalnızca "⋯ → Revizyon geçmişi" ayrı bir
    sayfaya gidiyordu; hangi sürümde olunduğu ve yenisinin olup olmadığı
    detayda görünmüyordu.
  */
  const kok = data.root_proposal_id ?? data.id;
  /* Hata OKUNUYOR: liste yutulduğunda sayfa "tek sürüm var" gibi
     görünüyordu. Müşteriye gitmiş bir belgede hangi sürümde olunduğunu
     yanlış göstermek, eksik göstermekten kötü. */
  const { data: revizyonData, error: revizyonHatasi } = await supabase
    .from("crm_proposals")
    .select("id,proposal_no,revision_no,status,archive_reason,superseded_by,amount,currency,created_at")
    .eq("organization_id", membership.organization_id)
    .or(`id.eq.${kok},root_proposal_id.eq.${kok}`)
    .order("revision_no", { ascending: true });
  if (revizyonHatasi) throw new Error("Teklif sürümleri okunamadı: " + revizyonHatasi.message);
  const revizyonlar = (revizyonData ?? []) as { id: string; proposal_no: string; revision_no: number; status: string; archive_reason: string | null; superseded_by: string | null; amount: number; currency: string; created_at: string }[];
  const oncekiRevizyon = data.previous_revision_id ? revizyonlar.find((r) => r.id === data.previous_revision_id) ?? null : null;
  const sonrakiRevizyon = data.superseded_by ? revizyonlar.find((r) => r.id === data.superseded_by) ?? null : null;
  // Ödeme takvimi: teklifte kayıtlı taksitler (tutar kuruş; eski kayıtlarda TL, normalize ediyor).
  const odemeTakvimi = normalizePaymentSchedule(data.payment_schedule ?? [], Number(data.amount));

  const customer = Array.isArray(data.crm_opportunities)
    ? data.crm_opportunities[0]
    : data.crm_opportunities;
  let representative: string | null = null;
  if (customer?.assigned_employee_id) {
    const { data: employee } = await supabase
      .from("hr_employees")
      .select("full_name")
      .eq("id", customer.assigned_employee_id)
      .eq("organization_id", membership.organization_id)
      .maybeSingle();
    representative = employee?.full_name ?? "Pasif personel";
  }
  // Paylaşım bağlantısı: token sabit (issue_crm_proposal_link mevcut
  // token'ı koruyor), bu yüzden bir kez üretildikten sonra kalıcı gösterilir.
  const publicHost = await resolvePublicHost(supabase, membership.organization_id);
  const shareUrl = data.share_token
    ? `https://${publicHost}/teklif/${data.share_token}`
    : "";
  const messages = shareUrl
    ? proposalMessages({
        organizationName: organizationBrandName({
          slug: organization.slug,
          displayName: organization.display_name,
          legalName: organization.name,
        }),
        customerName: formatPersonName(customer?.customer_name),
        documentNo: data.proposal_no,
        title: data.title,
        formattedAmount: money(Number(data.amount), data.currency || "TRY"),
        url: shareUrl,
      })
    : null;

  const waDurum = await getWhatsappStatus(membership.organization_id);
  const gonderimYolu = belgeGonderimYolu({
    kendiNumarasiBagli: waDurum.connected && waDurum.status !== "disabled",
    arvoKurumu: await arvoKurumuMu(supabase, membership.organization_id),
  });

  const locked = ["accepted", "rejected", "archived"].includes(data.status);
  // Silme RLS politikası yalnızca owner/admin'e izin veriyor.
  const canDelete = izin("crm.teklif.sil");
  /* Üçüncü katman: müşteriye gönderme ve sözleşmeye dönüştürme
     sunucuda anahtara bağlı (proposal-actions). Yetkisi olmayana
     düğme gösterip sunucuda reddetmek, hatayı tıklamadan önce
     söylememek demek. */
  const teklifYonetir = izin("crm.teklif.yonet");
  // Formdaki tutar, teklif oluşturulurken girildiği anlamda gösterilir:
  // KDV dahilse brüt, hariç/istisnaysa net. KDV durumu olmayan eski
  // kayıtlarda tutar olduğu gibi (brüt) düzenlenir.
  const taxStatus = ["excluded", "included", "exempt"].includes(data.tax_status)
    ? (data.tax_status as string)
    : null;
  const editableAmount =
    taxStatus && taxStatus !== "included"
      ? Number(data.net_amount ?? data.amount)
      : Number(data.amount);

  const { adim, kapanis } = teklifAdimi({
    status: data.status,
    view_count: data.view_count,
    archive_reason: data.archive_reason,
    superseded_by: data.superseded_by,
    sozlesmeVar: Boolean(sozlesme),
  });
  const musteri: string = formatPersonName(customer?.customer_name) || customer?.customer_name || "Müşteri";

  /* Müşteriyle yazışmalar (WhatsApp ve Postalar sekmeleri): talep,
     sözleşme ve iş detayıyla aynı kural (../../musteri-yazismalari.tsx). */
  const postaGorur = izin("posta.gor");
  const [{ numara: whatsappNumarasi, mesajlar: whatsappMesajlari }, postalar, hizmetTurleri, yorumOzeti] = await Promise.all([
    musteriWhatsapp(membership.organization_id, customer?.contact_phone),
    postaGorur ? musteriPostalari(supabase, membership.organization_id, { talepIdleri: [data.opportunity_id], eposta: customer?.contact_email }) : Promise.resolve([]),
    // Düzenleme formundaki hizmet türü önerileri (Ayarlar → Hizmet türleri).
    kurumHizmetTurleri(supabase, membership.organization_id),
    yorumOzetiOku(supabase, membership.organization_id, data.opportunity_id, userId),
  ]);
  const sonPostaZamani = postalar.map((posta) => posta.son_mesaj_at ?? "").sort().at(-1) || null;
  /* WhatsApp düğmesi yalnızca kurumun kendi hesabı bağlıysa (iş detayıyla aynı kural). */
  const whatsappEntegre = waDurum.connected && waDurum.status !== "disabled";
  const bugun = todayInIstanbul();
  const kalan = data.valid_until && !locked ? kalanGun(data.valid_until, bugun) : null;
  const gecerlilikRozeti = kalan === null ? null
    : kalan < 0 ? { ton: "danger", ad: "Süresi doldu" }
    : kalan === 0 ? { ton: "warning", ad: "Son gün" }
    : kalan <= 3 ? { ton: "warning", ad: `${kalan} gün kaldı` }
    : { ton: "neutral", ad: `${kalan} gün kaldı` };
  const gonderBicimi = (sinif: string, etiket: string) => (
    <form action={issueProposalLink}>
      <input type="hidden" name="proposal_id" value={data.id} />
      <input type="hidden" name="redirect_to" value={`/panel/crm/proposals/${data.id}`} />
      <button className={sinif}>{etiket}</button>
    </form>
  );
  const sozlesmeyeDonustur = (sinif: string) => (
    <form action={fastTrackProposalToContract}>
      <input type="hidden" name="proposal_id" value={data.id} />
      <button className={sinif}>Sözleşmeye dönüştür</button>
    </form>
  );

  const kunyeSatirlari = doluAlanlar((customer?.request_details ?? {}) as Kunye);
  /*
    Üç düzenleme penceresi (müşteri, hizmet ve ücret, geçerlilik) aynı
    sunucu işlemini (updateProposal) çağırıyor ve işlem bütün alanları
    okuyor: pencerede olmayan bölümün değerleri GİZLİ alanla taşınıyor
    (sözleşme detayıyla aynı gerekçe — boş gelen alan kaydı silerdi).
    Ödeme planı açıklaması formdan kalktı, değeri korunuyor.
  */
  const teklifDegerleri: [string, string][] = [
    ["title", data.title ?? ""], ["scope", data.scope ?? ""], ["amount", liraYazisi(editableAmount)],
    ...(taxStatus ? [["tax_status", taxStatus] as [string, string]] : []),
    ["payment_plan", data.payment_plan ?? ""], ["valid_until", data.valid_until ?? ""],
  ];
  const musteriDegerleri: [string, string][] = [
    ["customer_name", customer?.customer_name ?? ""], ["contact_phone", customer?.contact_phone ?? ""], ["contact_email", customer?.contact_email ?? ""],
    ["service_type", String(customer?.request_details?.service_type ?? "")], ["academic_level", String(customer?.request_details?.academic_level ?? "")],
    ["university", String(customer?.request_details?.university ?? "")], ["department", String(customer?.request_details?.department ?? "")],
  ];
  const gizliAlanlar = (pencere: "hizmet" | "musteri" | "gecerlilik") => {
    const satirlar = pencere === "musteri" ? teklifDegerleri
      : pencere === "hizmet" ? [...musteriDegerleri, ...teklifDegerleri.filter(([ad]) => ad === "payment_plan" || ad === "valid_until")]
      : [...musteriDegerleri, ...teklifDegerleri.filter(([ad]) => ad !== "valid_until")];
    return <>{satirlar.map(([ad, deger]) => <input key={ad} type="hidden" name={ad} value={deger} />)}</>;
  };

  return (
    <main className="crm-page-stack crm-request-detail-page talep kd-tek-sayfa">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">{data.proposal_no}{data.revision_no > 0 ? ` · R${data.revision_no}` : ""}</small>
          <h1>{data.title}</h1>
        </div>
        {/* Aşama çizgisi başlıkta (03.11.2026, sözleşme detayıyla aynı); kapanan teklifte çizgi yerine sebep. */}
        <div className="kd-bas-asama">
          {kapanis ? (
            <p className="talep-arsiv">
              <span className="status-pill" data-tone={statusTone(data.status)}>{labels[data.status] ?? data.status}</span>
              <span>{kapanis}</span>
            </p>
          ) : (
            <ol className="talep-asama" aria-label={`Durum: ${labels[data.status] ?? data.status}`}>
              {TEKLIF_ADIMLARI.map((ad, sira) => (
                <li key={ad} className={adim === null ? undefined : sira < adim ? "is-done" : sira === adim ? "is-current" : undefined} aria-current={sira === adim ? "step" : undefined}>
                  <i aria-hidden="true" />
                  <span>{ad}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="talep-bas-eylem">
          {/* GEÇERLİLİK başlıkta (sözleşmenin imza son tarihiyle aynı yer ve biçim). */}
          {!locked ? (
            <div className="opd-bas-termin">
              <p><b>Geçerlilik:</b> {tarih(data.valid_until) ?? "Belirtilmedi"}</p>
              {gecerlilikRozeti ? <p><span className="status-pill" data-tone={gecerlilikRozeti.ton}>{gecerlilikRozeti.ad}</span></p> : null}
              <PanelModal triggerClassName="panel-secondary opd-bas-termin-dugme" triggerLabel={data.valid_until ? "Yeni geçerlilik tarihi belirle" : "Geçerlilik belirle"} title="Geçerlilik tarihi" description="Müşteri teklifi bu güne kadar onaylayabilir." kicker={`TEKLİF · ${data.proposal_no}`} boy="dar" basaridaKapan>
                  <form className="panel-form kayit-formu" action={updateProposal}>
                    <input type="hidden" name="proposal_id" value={data.id} />
                    <input type="hidden" name="opportunity_id" value={customer?.id ?? ""} />
                    <input type="hidden" name="current_details" value={JSON.stringify(customer?.request_details ?? {})} />

                    {gizliAlanlar("gecerlilik")}
                    <label className="wide">Geçerlilik tarihi<TarihSecici name="valid_until" defaultValue={data.valid_until ?? ""} min={bugun} /></label>
                    <div className="wide panel-form-actions kayit-formu-eylem">
                      <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
                      <button className="panel-primary">Değişiklikleri kaydet</button>
                    </div>
                  </form>
              </PanelModal>
            </div>
          ) : null}
          {sozlesme ? (
            <Link className="panel-primary" href={`/panel/crm/contracts/${sozlesme.id}`}>Sözleşmeye git</Link>
          ) : locked || data.superseded_by || !teklifYonetir ? null : shareUrl ? (
            sozlesmeyeDonustur("panel-primary")
          ) : (
            gonderBicimi("panel-primary", "Müşteriye gönder")
          )}
          <details className="os-menu talep-menu">
            <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
            <div className="os-menu-list" role="menu">
              {/* Kayıt geçmişi (03.11.2026): eskiden yazışma çekmecesinin son sekmesiydi. */}
              <PanelModal triggerClassName="os-menu-item" triggerLabel="Kayıt geçmişi" title="Kayıt geçmişi" description="Alan değişiklikleri ve durum geçişleri." kicker={`TEKLİF · ${data.proposal_no}`} boy="buyuk">
                <RecordHistory opportunityId={data.opportunity_id} />
              </PanelModal>
              {/* Gönderilmemiş teklifte asıl işlem "Müşteriye gönder";
                  müşteri sözlü onay verdiyse sözleşmeye buradan geçilir. */}
              {!locked && !shareUrl && !sozlesme && teklifYonetir ? sozlesmeyeDonustur("os-menu-item") : null}
              <Link className="os-menu-item" href={`/panel/crm/requests/${data.opportunity_id}`}>Talebe git</Link>
              {data.revision_no > 0 || data.root_proposal_id ? (
                <Link className="os-menu-item" href={`/panel/crm/proposals/${data.id}/revisions`}>Revizyon geçmişi</Link>
              ) : null}
              {!locked ? (
                <PanelDrawer
                  triggerLabel="Teklifi kapat"
                  kicker={`TEKLİF · ${data.proposal_no}`}
                  title="Teklifi kapat"
                  description="Kaydın neden kapatıldığını seçin. Bu bilgi raporlarda kullanılıyor."
                  triggerClassName="os-menu-item is-danger"
                >
                  <form className="panel-form kayit-formu" action={resolveProposal}>
                    <input type="hidden" name="proposal_id" value={data.id} />
                    <label className="wide"><span>Kapanış sebebi<b className="req" aria-hidden="true">*</b></span>
                      <select name="resolution" defaultValue="rejected" required>
                        <option value="rejected">Reddedildi</option>
                        <option value="expired">Süresi Doldu</option>
                        <option value="invalid">Hatalı Kayıt</option>
                      </select>
                    </label>
                    <div className="wide panel-form-actions kayit-formu-eylem">
                      <p>Kayıt silinmez; teklif kapananlar arasında kalır.</p>
                      <button className="panel-primary">Teklifi kapat</button>
                    </div>
                  </form>
                  {canDelete ? (
                    <div className="panel-danger-zone">
                      <small className="panel-kicker">KALICI İŞLEM</small>
                      <p>
                        Silme geri alınamaz ve teklif raporlardan da düşer. Kaydı
                        yalnızca yanlışlıkla oluşturulduysa silin.
                      </p>
                      <form action={deleteProposal}>
                        <input type="hidden" name="proposal_id" value={data.id} />
                        <ConfirmDeleteButton
                          label="Sil"
                          confirmMessage={`${data.proposal_no} teklifini kalıcı olarak silmek istediğinize emin misiniz?`}
                        />
                      </form>
                    </div>
                  ) : null}
                </PanelDrawer>
              ) : null}
            </div>
          </details>
        </div>
      </header>


      {/*
        DETAY DÜZENİ (03.11.2026, iş detayıyla aynı): solda üstte müşteri ve
        iletişim kartları, altlarında müşteri bağlantısı ve kaydın
        bağlantıları (sürümler dahil); sağda teklifin kendisi. Yazışmalar
        ortada açılan pencerede, kayıt geçmişi ⋯ menüsünde.
      */}
      <div className="kd-duzen-v4 kd-tek-ekran">
        <section className="panel-card opd-kart opd-musteri kd-musteri" aria-label="Müşteri">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{musteri.split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr")).join("")}</span>
            <div>
              <h2>{musteri}</h2>
              {/* Müşterinin bütün kayıtları tek sayfada (/panel/crm/musteri). */}
              <small><Link className="personel-tumu" href={`/panel/crm/musteri/${data.opportunity_id}`}>Müşteri sayfası</Link></small>
            </div>
          </div>
          {customer?.contact_phone || customer?.contact_email ? (
            <div className="opd-iletisim-dugmeleri">
            {customer?.contact_phone ? <a className="panel-secondary" href={`tel:${customer.contact_phone}`}>Ara</a> : null}
            {customer?.contact_email ? <a className="panel-secondary" href={`mailto:${customer.contact_email}`}>E-posta</a> : null}
            </div>
          ) : null}
          <dl className="talep-liste opd-musteri-liste">
            <div><dt>Satış temsilcisi</dt><dd>{representative ? formatPersonName(representative) : <em>Atanmamış</em>}</dd></div>
            <div><dt>Telefon</dt><dd>{formatPhone(customer?.contact_phone) || <em>Yok</em>}</dd></div>
            <div><dt>E-posta</dt><dd>{customer?.contact_email || <em>Yok</em>}</dd></div>
          </dl>
          <PanelModal triggerClassName="panel-secondary opd-ayrinti-dugme" triggerLabel="Müşteri ayrıntıları" title={musteri} description="İletişim ve künye." kicker={`TEKLİF · ${data.proposal_no}`} boy="buyuk">
            <div className="opd-ayrinti">
              <section className="opd-ayrinti-bolum">
                <h3>İletişim</h3>
                <dl className="talep-liste">
                  <div><dt>Telefon</dt><dd>{formatPhone(customer?.contact_phone) || <em>Yok</em>}</dd></div>
                  <div><dt>E-posta</dt><dd>{customer?.contact_email || <em>Yok</em>}</dd></div>
                </dl>
              </section>
              <section className="opd-ayrinti-bolum">
                <h3>Künye</h3>
                {kunyeSatirlari.length ? (
                  <dl className="talep-liste">
                    {kunyeSatirlari.map((alan) => <div key={alan.anahtar}><dt>{alan.etiket}</dt><dd>{alan.deger}</dd></div>)}
                  </dl>
                ) : <p className="talep-bos">Künye girilmemiş. “Müşteri bilgilerini düzenle” ile eklenir.</p>}
              </section>
            </div>
          </PanelModal>
        </section>

        <section className="panel-card opd-kart kd-iletisim" aria-label="İletişim">
          <h2 className="opd-kart-baslik">İletişim</h2>
          <h3 className="opd-kanal-grup">Kurum içi</h3>
          <p className="opd-kanal-ozet">
            {!yorumOzeti ? "Yorumlar okunamadı"
              : yorumOzeti.sayi && yorumOzeti.son ? <>{yorumOzeti.sayi} yorum · son <time dateTime={yorumOzeti.son}>{ozetZamani(yorumOzeti.son)}</time></>
              : "Henüz yorum yok"}
          </p>
          <KanalDugmesi
            anahtar={`kanal:teklif:${data.id}:yorum`}
            etiket="Yorumlar"
            olaylar={yorumOzeti?.baskalari ?? []}
            varsayilanGorulme={yorumOzeti?.benimSon ?? ""}
            title="Ekip içi yorumlar"
            description="Yalnızca ekip görür; müşteriye gitmez."
            kicker={`TEKLİF · ${data.proposal_no}`}
          >
            <InternalComments opportunityId={data.opportunity_id} contextType="proposal" contextId={data.id} gorunum="akis" />
          </KanalDugmesi>
          <h3 className="opd-kanal-grup">Müşteri</h3>
          {sonPostaZamani ? <p className="opd-kanal-ozet">Son posta <time dateTime={sonPostaZamani}>{ozetZamani(sonPostaZamani)}</time></p> : null}
          {whatsappEntegre ? (
            <KanalDugmesi
              anahtar={`kanal:teklif:${data.id}:whatsapp`}
              etiket="WhatsApp"
              olaylar={whatsappMesajlari[0]?.direction === "inbound" ? [whatsappMesajlari[0].createdAt] : []}
              title={musteri}
              kicker="WHATSAPP"
            >
              <WhatsappAkisi mesajlar={whatsappMesajlari} numara={whatsappNumarasi} musteri={musteri} />
            </KanalDugmesi>
          ) : null}
          {postaGorur ? (
            <KanalDugmesi
              anahtar={`kanal:teklif:${data.id}:posta`}
              etiket="Postalar"
              olaylar={postalar.filter((posta) => posta.okunmamis).map((posta) => posta.son_mesaj_at ?? "").filter(Boolean)}
              title={musteri}
              kicker="POSTALAR"
            >
              <PostaAkisi
                postalar={postalar}
                epostaVar={Boolean(customer?.contact_email)}
                eylem={izin("posta.yanitla") && customer?.contact_email ? (
                  <Link className="panel-primary" href={`/panel/posta/yeni?alici=${encodeURIComponent(customer.contact_email)}&firsat=${encodeURIComponent(data.opportunity_id)}&konu=${encodeURIComponent(`${data.proposal_no} · ${data.title}`)}`}>Posta gönder</Link>
                ) : null}
              />
            </KanalDugmesi>
          ) : null}
        </section>

        <section className="panel-card opd-kart kd-alt-sol talep-gecmis" aria-label="Müşteri bağlantısı">
          <h3 className="opd-kanal-grup">Müşteri bağlantısı</h3>
          {/*
            MÜŞTERİ BAĞLANTISI. Eskiden sayfanın en üstünde ayrı bir kart
            ve tam adresle duruyordu. Gönderim müşteriyle ilgili: müşteri
            kartının içinde. Kendi numarasını bağlamamış kurumda WhatsApp
            eski usul (wa.me) sürüyor; teklifi Arvo'nun numarasından yollamak,
            müşteriye tanımadığı bir numaradan teklif göndermek olurdu.
          */}
            {shareUrl ? (
              <>
                <p className="teklif-baglanti" title={shareUrl}>{shareUrl.replace(/^https:\/\//, "")}</p>
                {/*
                  Uyarı GÖNDERME DÜĞMESİNİN yanında değil burada: teklif
                  oluşturulurken paylaşım bağlantısı da üretiliyor, yani
                  "Müşteriye gönder" düğmesi pratikte hiç çizilmiyor ve
                  uyarı oraya konunca görünmüyordu. Belge müşteriye bu
                  karttan gidiyor.
                */}
                <Suspense fallback={null}><ResmiBilgiUyarisi organizationId={membership.organization_id} belge="teklif" /></Suspense>
                <div className="talep-iletisim">
                  {customer?.contact_email && messages ? (
                    <ShareSendLink kind="proposal" token={data.share_token} className="panel-secondary" href={`mailto:${encodeURIComponent(customer.contact_email)}?subject=${encodeURIComponent(messages.subject)}&body=${encodeURIComponent(messages.email)}`}>
                      E-posta ile gönder
                    </ShareSendLink>
                  ) : null}
                  {gonderimYolu === "panel" ? (
                    <WhatsappGonderDugmesi kind="proposal" token={data.share_token} musteriAdi={musteri} />
                  ) : messages ? (
                    <ShareSendLink kind="proposal" token={data.share_token} className="panel-secondary" newTab href={waMeAdresi(customer?.contact_phone, messages.whatsapp)}>
                      WhatsApp ile gönder
                    </ShareSendLink>
                  ) : null}
                  <a className="panel-secondary" target="_blank" rel="noreferrer" href={shareUrl}>Önizle</a>
                </div>
              </>
            ) : locked ? (
              <p className="talep-bos">Bu teklif için bağlantı oluşturulmamış.</p>
            ) : (
              <p className="talep-bos">Henüz oluşturulmadı. “Müşteriye gönder” bağlantıyı oluşturur; sonra e-posta ya da WhatsApp ile gönderilir.</p>
            )}
        </section>

        {/* BAĞLANTILAR ve SÜRÜMLER: kaydın zinciri tek kartta (eskiden Ayrıntılar penceresinde ve çekmecenin Revizyonlar sekmesindeydi). */}
        <section className="panel-card opd-kart kd-alt-sag talep-gecmis" aria-label="Bağlantılar">
          <h3 className="opd-kanal-grup">Bağlantılar</h3>
                <ul>
                  <li>
                    <Link href={`/panel/crm/requests/${data.opportunity_id}`}>
                      <span className="talep-gecmis-metin"><b>Talep</b><small>{formatSubject(customer?.title) || "Talebe git"}</small></span>
                    </Link>
                  </li>
                  {sozlesme ? (
                    <li>
                      <Link href={`/panel/crm/contracts/${sozlesme.id}`}>
                        <span className="talep-gecmis-metin"><b>Sözleşme {sozlesme.contract_no}</b><small>{contractStatusLabel(sozlesme.status)}</small></span>
                      </Link>
                    </li>
                  ) : null}
                  {oncekiRevizyon ? (
                    <li>
                      <Link href={`/panel/crm/proposals/${oncekiRevizyon.id}`}>
                        <span className="talep-gecmis-metin"><b>Önceki sürüm{oncekiRevizyon.revision_no ? ` · R${oncekiRevizyon.revision_no}` : ""}</b><small>{money(Number(oncekiRevizyon.amount), oncekiRevizyon.currency || "TRY")}</small></span>
                      </Link>
                    </li>
                  ) : null}
                  {sonrakiRevizyon ? (
                    <li>
                      <Link href={`/panel/crm/proposals/${sonrakiRevizyon.id}`}>
                        <span className="talep-gecmis-metin"><b>Yeni sürüm · R{sonrakiRevizyon.revision_no}</b><small>Bu teklif yeni sürümle değiştirildi</small></span>
                      </Link>
                    </li>
                  ) : null}
                </ul>
          {revizyonlar.length > 1 ? <h3 className="opd-kanal-grup">Sürümler · {revizyonlar.length}</h3> : null}
          {revizyonlar.length > 1 ? (
            <ul className="ekip-liste teklif-revizyonlar">
              {[...revizyonlar].reverse().map((r) => {
                const grup = teklifGrubu(r);
                const bu = r.id === data.id;
                return (
                  <li key={r.id}>
                    <Link href={`/panel/crm/proposals/${r.id}`} className={bu ? "is-active" : undefined} aria-current={bu ? "page" : undefined}>
                      <span className="ekip-dep-kod">{r.revision_no ? `R${r.revision_no}` : "İlk"}</span>
                      <span className="cari-hareket-metin">
                        <b>{r.proposal_no}{bu ? " · bu sürüm" : ""}</b>
                        <small>{tarih(r.created_at)}</small>
                      </span>
                      <strong className="teklif-tutar-satir">{money(Number(r.amount), r.currency || "TRY")}</strong>
                      <span className="status-pill">{TEKLIF_GRUP_ADLARI[grup]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <section className="panel-card talep-bilgi kd-ana" aria-label="Teklif bilgileri">
          {/*
            ANA BÖLÜM (03.11.2026, sözleşme detayıyla aynı kalite): üstte
            düzenleme ve önizleme; dört kart (hizmet ve ücret, ödeme takvimi,
            geçerlilik, müşteri yanıtı). Kartın her yeri pencere açar.
            Eskiden tutar ve geçerlilik başlıkta, altında altı satırlık bilgi
            listesi, kapsam ve ödeme takvimi alt alta duruyordu; düzenleme
            ⋯ menüsünde tek uzun formdu.
          */}
          <div className="kd-tutar-satir">
            <div><h2 className="kd-ana-baslik">Teklif</h2></div>
            <div className="kd-tutar-eylem">
              {!locked ? (
                <PanelModal triggerLabel="Müşteri bilgilerini düzenle" kicker={`TEKLİF · ${data.proposal_no}`} title="Müşteri bilgileri" description="İletişim ve künye. Değişiklik müşteriye giden teklif bağlantısına da yansır." triggerClassName="panel-secondary kd-hap" boy="buyuk" basaridaKapan>
                  <form className="panel-form kayit-formu" action={updateProposal}>
                    <input type="hidden" name="proposal_id" value={data.id} />
                    <input type="hidden" name="opportunity_id" value={customer?.id ?? ""} />
                    <input type="hidden" name="current_details" value={JSON.stringify(customer?.request_details ?? {})} />

                    {gizliAlanlar("musteri")}
                    <p className="wide kayit-formu-bolum">Müşteri</p>
                    <label className="wide"><span>Müşteri / kurum<b className="req" aria-hidden="true">*</b></span><input name="customer_name" defaultValue={customer?.customer_name ?? ""} required minLength={2} maxLength={180} /></label>
                    <label>Telefon<input name="contact_phone" type="tel" inputMode="tel" defaultValue={customer?.contact_phone ?? ""} placeholder="05xx xxx xx xx" /></label>
                    <label>E-posta<input name="contact_email" type="email" defaultValue={customer?.contact_email ?? ""} placeholder="ornek@eposta.com" /></label>

                    <p className="wide kayit-formu-bolum">Hizmet ve akademik künye</p>
                    <label>Hizmet türü<input name="service_type" list="hizmet-turu-onerileri" defaultValue={String(customer?.request_details?.service_type ?? "")} /><HizmetTuruOnerileri liste={hizmetTurleri.liste} /></label>
                    <label>Akademik düzey<input name="academic_level" list="teklif-akademik-duzey" defaultValue={String(customer?.request_details?.academic_level ?? "")} placeholder="Seçin ya da yazın" /></label>
                    <label>Üniversite<input name="university" defaultValue={String(customer?.request_details?.university ?? "")} placeholder="Örn. İstanbul Üniversitesi" /></label>
                    <label>Bölüm / alan<input name="department" defaultValue={String(customer?.request_details?.department ?? "")} placeholder="Örn. İşletme" /></label>
                    <datalist id="teklif-akademik-duzey"><option value="Lisans" /><option value="Yüksek Lisans" /><option value="Doktora" /><option value="Tıpta Uzmanlık" /><option value="Doçentlik" /></datalist>

                    <div className="wide panel-form-actions kayit-formu-eylem">
                      <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
                      <button className="panel-primary">Değişiklikleri kaydet</button>
                    </div>
                  </form>
                </PanelModal>
              ) : null}
              {shareUrl ? <a className="panel-secondary kd-hap" target="_blank" rel="noreferrer" href={shareUrl}>Önizle</a> : null}
            </div>
          </div>
          {locked ? (
            <p className="teklif-kilit">
              {/* Arşivlenen tekliflerde kabul arşiv sebebinde (archive_reason). */}
              {data.status === "accepted" || data.archive_reason === "accepted"
                ? "Bu teklif müşteri tarafından onaylandı. Tutar ve içerik artık değiştirilemez; değişiklik gerekiyorsa yeni bir teklif oluşturun."
                : "Bu teklifin karar aşaması kapandı. Tutar ve içerik değiştirilemez."}
            </p>
          ) : null}

          <div className="kd-kutular">
            <PanelModal
              triggerClassName="kd-kutu"
              triggerLabel="Hizmet ve ücret"
              tetik={<>
                <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Hizmet ve ücret</span>{taxStatus ? <span className="kd-kutu-cip">{KDV_ADI[taxStatus]}</span> : null}</span>
                <span className="kd-kutu-deger">{money(Number(data.amount), data.currency || "TRY")}</span>
                <span className="kd-kutu-aciklama">{data.title}</span>
                <span className="kd-kutu-ozet">{data.scope || "Kapsam yazılmamış."}</span>
                <span className="kd-kutu-dip"><span>{taxStatus === "excluded" && data.gross_amount ? `KDV dahil ${money(Number(data.gross_amount), data.currency || "TRY")}` : ""}</span><span className="kd-kutu-ac">{locked ? "Görüntüle" : "Düzenle"} →</span></span>
              </>}
              title="Hizmet ve ücret"
              description="Teklif başlığı, verilecek hizmetler, tutar ve KDV."
              kicker={`TEKLİF · ${data.proposal_no}`}
              boy="buyuk"
              basaridaKapan
            >
              {!locked ? (
                      <form className="panel-form kayit-formu" action={updateProposal}>
                        <input type="hidden" name="proposal_id" value={data.id} />
                        <input type="hidden" name="opportunity_id" value={customer?.id ?? ""} />
                        <input type="hidden" name="current_details" value={JSON.stringify(customer?.request_details ?? {})} />

                        {gizliAlanlar("hizmet")}
                        <p className="wide kayit-formu-bolum">Teklif</p>
                        <label className="wide"><span>Teklif başlığı<b className="req" aria-hidden="true">*</b></span><input name="title" defaultValue={data.title} required maxLength={180} /></label>
                        <label className="wide"><span>Hizmet kapsamı<b className="req" aria-hidden="true">*</b></span><textarea name="scope" defaultValue={data.scope ?? ""} required placeholder="Verilecek hizmetler ve teslimler" /></label>

                        <p className="wide kayit-formu-bolum">Tutar</p>
                        <label><span>{/* İstisnada KDV yok; eskiden "KDV hariç" yazıyordu. */ taxStatus === "included" ? "Tutar, KDV dahil (₺)" : taxStatus === "excluded" ? "Tutar, KDV hariç (₺)" : "Tutar (₺)"}<b className="req" aria-hidden="true">*</b></span><input name="amount" inputMode="decimal" autoComplete="off" defaultValue={liraYazisi(editableAmount)} required /></label>
                        {taxStatus ? (
                          <label>KDV durumu
                            <select name="tax_status" defaultValue={taxStatus}>
                              <option value="excluded">KDV Hariç</option>
                              <option value="included">KDV Dahil</option>
                              <option value="exempt">KDV İstisna</option>
                            </select>
                          </label>
                        ) : null}

                        <div className="wide panel-form-actions kayit-formu-eylem">
                          <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
                          <button className="panel-primary">Değişiklikleri kaydet</button>
                        </div>
                      </form>
              ) : (
                <dl className="talep-liste">
                  <div><dt>Başlık</dt><dd>{data.title}</dd></div>
                  <div><dt>Tutar</dt><dd>{money(Number(data.amount), data.currency || "TRY")}{taxStatus ? ` · ${KDV_ADI[taxStatus]}` : ""}</dd></div>
                  <div><dt>Kapsam</dt><dd className="kd-salt">{data.scope || <em>Yazılmamış</em>}</dd></div>
                </dl>
              )}
            </PanelModal>

            <PanelModal
              triggerClassName="kd-kutu"
              triggerLabel="Ödeme takvimi"
              tetik={<>
                <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Ödeme takvimi</span><span className="kd-kutu-cip">{odemeTakvimi.length ? `${odemeTakvimi.length} taksit` : "Takvim yok"}</span></span>
                {odemeTakvimi.length ? (
                  <span className="kd-kutu-deger">{money(odemeTakvimi.reduce((toplam, taksit) => toplam + taksit.amount, 0), data.currency || "TRY")}<small>planlanan</small></span>
                ) : <span className="kd-kutu-deger is-sessiz">—<small>taksit girilmemiş</small></span>}
                {odemeTakvimi.length ? (
                  <span className="kd-kutu-satirlar">
                    {odemeTakvimi.slice(0, 3).map((taksit) => (
                      <span key={taksit.sequence}>
                        <span><b>{installmentLabel(taksit.label, taksit.sequence)}</b><time>{taksit.due_date ? tarih(taksit.due_date) : taksit.trigger || "Tarih yok"}</time></span>
                        <strong>{money(taksit.amount, data.currency || "TRY")}</strong>
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className="kd-kutu-dip"><span>{odemeTakvimi.length > 3 ? `+${odemeTakvimi.length - 3} taksit daha` : data.payment_plan || ""}</span><span className="kd-kutu-ac">Görüntüle →</span></span>
              </>}
              title="Ödeme takvimi"
              description="Teklifte müşteriye sunulan taksitler. Değiştirmek için teklifin yeni bir sürümünü oluşturun."
              kicker={`TEKLİF · ${data.proposal_no}`}
              boy="buyuk"
            >
              {odemeTakvimi.length ? (
                <ol className="plan-timeline">
                  {odemeTakvimi.map((taksit) => (
                    <li key={taksit.sequence}>
                      <time>{taksit.due_date ? tarih(taksit.due_date) : taksit.trigger || "Tarih yok"}</time>
                      <span>{installmentLabel(taksit.label, taksit.sequence)} · {money(taksit.amount, data.currency || "TRY")}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="talep-bos">Taksit girilmemiş{data.payment_plan ? `; ödeme planı: ${data.payment_plan}` : ""}.</p>
              )}
            </PanelModal>

            <PanelModal
              triggerClassName="kd-kutu"
              triggerLabel="Geçerlilik"
              tetik={<>
                <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Geçerlilik</span>{gecerlilikRozeti ? <span className="kd-kutu-cip" data-tone={gecerlilikRozeti.ton === "neutral" ? undefined : gecerlilikRozeti.ton}>{gecerlilikRozeti.ad}</span> : <span className="kd-kutu-cip">{locked ? "Kapandı" : "Süresiz"}</span>}</span>
                {data.valid_until ? <span className="kd-kutu-deger">{tarih(data.valid_until)}<small>son gün</small></span> : <span className="kd-kutu-deger is-sessiz">—<small>geçerlilik tarihi yok</small></span>}
                <span className="kd-kutu-satirlar">
                  <span><span><b>Oluşturulma</b></span><time>{tarih(data.created_at)}</time></span>
                  <span><span><b>Sürüm</b></span><time>{data.revision_no > 0 ? `R${data.revision_no}` : "İlk sürüm"}</time></span>
                </span>
                <span className="kd-kutu-dip"><span /><span className="kd-kutu-ac">{locked ? "Görüntüle" : "Düzenle"} →</span></span>
              </>}
              title="Geçerlilik tarihi"
              description="Müşteri teklifi bu güne kadar onaylayabilir."
              kicker={`TEKLİF · ${data.proposal_no}`}
              boy="dar"
              basaridaKapan
            >
              {!locked ? (
                      <form className="panel-form kayit-formu" action={updateProposal}>
                        <input type="hidden" name="proposal_id" value={data.id} />
                        <input type="hidden" name="opportunity_id" value={customer?.id ?? ""} />
                        <input type="hidden" name="current_details" value={JSON.stringify(customer?.request_details ?? {})} />

                        {gizliAlanlar("gecerlilik")}
                        <label className="wide">Geçerlilik tarihi<TarihSecici name="valid_until" defaultValue={data.valid_until ?? ""} min={bugun} /></label>
                        <div className="wide panel-form-actions kayit-formu-eylem">
                          <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
                          <button className="panel-primary">Değişiklikleri kaydet</button>
                        </div>
                      </form>
              ) : (
                <dl className="talep-liste">
                  <div><dt>Geçerlilik</dt><dd>{tarih(data.valid_until) ?? <em>Belirtilmedi</em>}</dd></div>
                  <div><dt>Oluşturulma</dt><dd>{tarih(data.created_at)}</dd></div>
                </dl>
              )}
            </PanelModal>

            <PanelModal
              triggerClassName="kd-kutu"
              triggerLabel="Müşteri yanıtı"
              tetik={<>
                <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Müşteri yanıtı</span><span className="kd-kutu-cip" data-tone={data.view_count ? undefined : "warning"}>{data.view_count ? `${data.view_count} görüntüleme` : data.sent_at ? "Açılmadı" : "Gönderilmedi"}</span></span>
                <span className="kd-kutu-deger">{labels[data.status] ?? data.status}<small>{data.last_viewed_at ? `son açılış ${tarih(data.last_viewed_at)}` : ""}</small></span>
                <span className="kd-kutu-satirlar">
                  <span><span><b>Gönderim</b></span><time>{tarih(data.sent_at) ?? "gönderilmedi"}</time></span>
                  <span><span><b>İlk görüntüleme</b></span><time>{tarih(data.first_viewed_at) ?? "—"}</time></span>
                </span>
                <span className="kd-kutu-dip"><span /><span className="kd-kutu-ac">Ayrıntılar →</span></span>
              </>}
              title="Müşteri yanıtı"
              description="Teklifin müşteriye gönderimi ve müşterinin teklif sayfasındaki hareketi."
              kicker={`TEKLİF · ${data.proposal_no}`}
              boy="dar"
            >
              <dl className="talep-liste">
                <div><dt>Durum</dt><dd>{labels[data.status] ?? data.status}</dd></div>
                <div><dt>Gönderim</dt><dd>{data.sent_at ? uzunTarih(data.sent_at) : <em>Gönderilmedi</em>}</dd></div>
                <div><dt>İlk görüntüleme</dt><dd>{data.first_viewed_at ? uzunTarih(data.first_viewed_at) : <em>Açılmadı</em>}</dd></div>
                <div><dt>Son görüntüleme</dt><dd>{data.last_viewed_at ? uzunTarih(data.last_viewed_at) : <em>—</em>}</dd></div>
                <div><dt>Görüntülenme</dt><dd>{data.view_count ? `${data.view_count} kez` : <em>0</em>}</dd></div>
              </dl>
            </PanelModal>
          </div>
        </section>
      </div>
    </main>
  );
}
