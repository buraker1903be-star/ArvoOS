import Link from "next/link";
import { statusTone } from "@/lib/status-tone";
import { belgeGonderimYolu } from "@/lib/belge-gonderim-yolu";
import { arvoKurumuMu } from "@/lib/arvo-kurumu";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { waMeAdresi } from "@/lib/wa-me";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { TEKLIF_ADIMLARI, teklifAdimi } from "@/lib/teklif-asamalari";
import { WhatsappGonderDugmesi } from "../../whatsapp-gonder-dugmesi";
import { ShareSendLink } from "../../share-send-link";
import { formatPhone } from "@/lib/format-phone";
import { PROPOSAL_STATUS_LABELS as labels } from "../../status-labels";
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
import { TalepAkis } from "../../kayit-detay/kayit-akis";
import "../../request-page.css";
import "../../crm.css";
import "../../kayit-detay/kayit-detay.css";

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
const tarih = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : null;
/** Geçerliliğe kalan gün (bugün = 0, geçmişse negatif); Türkiye takvimiyle. */
const kalanGun = (valid: string, bugun: string) => Math.round((Date.parse(valid) - Date.parse(bugun)) / 86_400_000);
const KDV_ADI: Record<string, string> = { excluded: "KDV hariç", included: "KDV dahil", exempt: "KDV istisna" };

export default async function ProposalDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase, membership, modules, organization, izin } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm"))
    throw new Error("CRM modülüne erişiminiz yok.");

  const [{ data, error }, { data: sozlesmeData }] = await Promise.all([
    supabase
      .from("crm_proposals")
      .select("id,proposal_no,title,scope,amount,net_amount,gross_amount,tax_status,currency,payment_plan,valid_until,status,archive_reason,superseded_by,created_at,sent_at,first_viewed_at,last_viewed_at,view_count,revision_no,root_proposal_id,share_token,opportunity_id,crm_opportunities!inner(id,customer_name,contact_email,contact_phone,title,assigned_employee_id,request_details)")
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

  const bilgiler: [string, React.ReactNode][] = [
    ["Ödeme planı", data.payment_plan || <em>Belirtilmedi</em>],
    ["Revizyon", data.revision_no > 0 ? `R${data.revision_no}` : "İlk sürüm"],
    ["Oluşturulma", tarih(data.created_at)],
    ["Gönderim", tarih(data.sent_at) ?? <em>Gönderilmedi</em>],
    ["Görüntülenme", data.view_count ? `${data.view_count} kez${data.last_viewed_at ? ` · son ${tarih(data.last_viewed_at)}` : ""}` : <em>Açılmadı</em>],
    ["Temsilci", representative ? formatPersonName(representative) : <em>Atanmamış</em>],
  ];

  return (
    <main className="crm-page-stack crm-request-detail-page talep">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">{data.proposal_no}{data.revision_no > 0 ? ` · R${data.revision_no}` : ""}</small>
          <h1>{data.title}</h1>
        </div>
        <div className="talep-bas-eylem">
          {sozlesme ? (
            <Link className="panel-primary" href={`/panel/crm/contracts/${sozlesme.id}`}>Sözleşmeye git</Link>
          ) : locked || data.superseded_by ? null : shareUrl ? (
            sozlesmeyeDonustur("panel-primary")
          ) : (
            gonderBicimi("panel-primary", "Müşteriye gönder")
          )}
          <details className="os-menu talep-menu">
            <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
            <div className="os-menu-list" role="menu">
              {!locked ? (
                <PanelDrawer triggerLabel="Düzenle" title={data.proposal_no} description="Teklif bilgilerini kontrol edin." triggerClassName="os-menu-item">
                  <form className="panel-form" action={updateProposal}>
                    <input type="hidden" name="proposal_id" value={data.id} />
                    <input type="hidden" name="opportunity_id" value={customer?.id ?? ""} />
                    <input type="hidden" name="current_details" value={JSON.stringify(customer?.request_details ?? {})} />
                    <p className="wide panel-form-note">Müşteri / Talep Bilgileri</p>
                    <label>
                      Müşteri adı
                      <input name="customer_name" defaultValue={customer?.customer_name ?? ""} />
                    </label>
                    <label>
                      Telefon
                      <input name="contact_phone" defaultValue={customer?.contact_phone ?? ""} />
                    </label>
                    <label>
                      E-posta
                      <input name="contact_email" defaultValue={customer?.contact_email ?? ""} />
                    </label>
                    <label>
                      Hizmet türü
                      <input name="service_type" defaultValue={String(customer?.request_details?.service_type ?? "")} />
                    </label>
                    <label>
                      Akademik seviye
                      <input name="academic_level" defaultValue={String(customer?.request_details?.academic_level ?? "")} />
                    </label>
                    <label>
                      Üniversite
                      <input name="university" defaultValue={String(customer?.request_details?.university ?? "")} />
                    </label>
                    <label>
                      Bölüm
                      <input name="department" defaultValue={String(customer?.request_details?.department ?? "")} />
                    </label>
                    <p className="wide panel-form-note">Teklif Bilgileri</p>
                    <label>
                      Başlık
                      <input name="title" defaultValue={data.title} required />
                    </label>
                    <label>
                      {taxStatus === "included" ? "Tutar (KDV dahil)" : taxStatus ? "Tutar (KDV hariç)" : "Tutar"}
                      <input name="amount" type="number" step="0.01" min="0" defaultValue={(editableAmount / 100).toFixed(2)} required />
                    </label>
                    {taxStatus ? (
                      <label>
                        KDV durumu
                        <select name="tax_status" defaultValue={taxStatus}>
                          <option value="excluded">KDV Hariç</option>
                          <option value="included">KDV Dahil</option>
                          <option value="exempt">KDV İstisna</option>
                        </select>
                      </label>
                    ) : null}
                    <label className="wide">
                      Kapsam
                      <textarea name="scope" defaultValue={data.scope ?? ""} required />
                    </label>
                    <label>
                      Ödeme planı
                      <input name="payment_plan" defaultValue={data.payment_plan ?? ""} />
                    </label>
                    <label>
                      Geçerlilik
                      <input name="valid_until" type="date" defaultValue={data.valid_until ?? ""} />
                    </label>
                    <div className="wide panel-form-actions">
                      <button className="panel-primary">Kaydet</button>
                    </div>
                  </form>
                </PanelDrawer>
              ) : null}
              {/* Gönderilmemiş teklifte asıl işlem "Müşteriye gönder";
                  müşteri sözlü onay verdiyse sözleşmeye buradan geçilir. */}
              {!locked && !shareUrl && !sozlesme ? sozlesmeyeDonustur("os-menu-item") : null}
              <Link className="os-menu-item" href={`/panel/crm/requests/${data.opportunity_id}`}>Talebe git</Link>
              {data.revision_no > 0 || data.root_proposal_id ? (
                <Link className="os-menu-item" href={`/panel/crm/proposals/${data.id}/revisions`}>Revizyon geçmişi</Link>
              ) : null}
              {!locked ? (
                <PanelDrawer
                  triggerLabel="Teklifi kapat"
                  title="Teklifi kapat"
                  description="Kaydın neden kapatıldığını seçin. Bu bilgi raporlarda kullanılıyor."
                  triggerClassName="os-menu-item is-danger"
                >
                  <form className="panel-form" action={resolveProposal}>
                    <input type="hidden" name="proposal_id" value={data.id} />
                    <label className="wide">
                      İptal sebebi
                      <select name="resolution" defaultValue="rejected" required>
                        <option value="rejected">Reddedildi</option>
                        <option value="expired">Süresi Doldu</option>
                        <option value="invalid">Hatalı Kayıt</option>
                      </select>
                    </label>
                    <div className="wide panel-form-actions">
                      <button className="panel-primary">Teklifi Kapat</button>
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

      {/* Aşama çizgisi; kapanan teklifte çizgi yerine sebep. */}
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

      <div className="talep-izgara">
        {/* Müşteri ve müşteri bağlantısı */}
        <section className="panel-card talep-musteri" aria-label="Müşteri">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{musteri.split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr")).join("")}</span>
            <div>
              <h2>{musteri}</h2>
              <small>Müşteri</small>
            </div>
          </div>
          <div className="talep-iletisim">
            {customer?.contact_phone ? <a className="panel-secondary" href={`tel:${customer.contact_phone}`}>Ara</a> : null}
            {customer?.contact_email ? <a className="panel-secondary" href={`mailto:${customer.contact_email}`}>E-posta</a> : null}
          </div>
          <dl className="talep-liste">
            <div><dt>Telefon</dt><dd>{formatPhone(customer?.contact_phone) || <em>Yok</em>}</dd></div>
            <div><dt>E-posta</dt><dd>{customer?.contact_email || <em>Yok</em>}</dd></div>
          </dl>

          {/*
            MÜŞTERİ BAĞLANTISI. Eskiden sayfanın en üstünde ayrı bir kart
            ve tam adresle duruyordu. Gönderim müşteriyle ilgili: müşteri
            kartının içinde. Kendi numarasını bağlamamış kurumda WhatsApp
            eski usul (wa.me) sürüyor; teklifi Arvo'nun numarasından yollamak,
            müşteriye tanımadığı bir numaradan teklif göndermek olurdu.
          */}
          <div className="talep-gecmis">
            <h3>Müşteri bağlantısı</h3>
            {shareUrl ? (
              <>
                <p className="teklif-baglanti" title={shareUrl}>{shareUrl.replace(/^https:\/\//, "")}</p>
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
          </div>
        </section>

        {/* Teklif */}
        <section className="panel-card talep-bilgi" aria-label="Teklif bilgileri">
          <div className="teklif-tutar">
            <div>
              <h2>Teklif tutarı</h2>
              <strong>{money(Number(data.amount), data.currency || "TRY")}</strong>
              {taxStatus ? (
                <small>
                  {KDV_ADI[taxStatus]}
                  {taxStatus === "excluded" && data.gross_amount ? ` · KDV dahil ${money(Number(data.gross_amount), data.currency || "TRY")}` : ""}
                </small>
              ) : null}
            </div>
            <div className="teklif-gecerlilik">
              <h3>Geçerlilik</h3>
              <span>{tarih(data.valid_until) ?? "Belirtilmedi"}</span>
              {gecerlilikRozeti ? <span className="status-pill" data-tone={gecerlilikRozeti.ton}>{gecerlilikRozeti.ad}</span> : null}
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
          <dl className="talep-liste talep-liste--iki">
            {bilgiler.map(([ad, deger]) => (
              <div key={ad}><dt>{ad}</dt><dd>{deger}</dd></div>
            ))}
          </dl>
          <div className="talep-not">
            <h3>Kapsam</h3>
            {data.scope ? <p>{data.scope}</p> : <p className="talep-bos">Kapsam yazılmamış.</p>}
          </div>
        </section>

        {/* Akış */}
        <TalepAkis sekmeler={["Yorumlar", "Geçmiş"]}>
          <InternalComments opportunityId={data.opportunity_id} contextType="proposal" contextId={data.id} gorunum="akis" />
          <RecordHistory opportunityId={data.opportunity_id} />
        </TalepAkis>
      </div>
    </main>
  );
}
