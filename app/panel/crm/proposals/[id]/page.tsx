import Link from "next/link";
import { resolvePublicHost } from "@/lib/public-host";
import { formatPersonName } from "@/lib/format-name";
import { organizationBrandName, proposalMessages } from "@/lib/customer-message-templates";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ConfirmDeleteButton } from "../../../accounts/confirm-delete-button";
import {
  createProposalRevision,
  deleteProposal,
  fastTrackProposalToContract,
  issueProposalLink,
  resolveProposal,
  updateProposal,
} from "../../sales-actions";
import { PanelDrawer } from "../../../components/panel-drawer";
import { InternalComments } from "../../internal-comments";
import "../../request-page.css";

type Props = { params: Promise<{ id: string }> };

const labels: Record<string, string> = {
  draft: "Taslak",
  sent: "Gönderildi",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
  expired: "Süresi doldu",
  archived: "Arşiv",
};
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value / 100);
const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("tr-TR") : "—";

export default async function ProposalDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase, membership, modules, organization } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm"))
    throw new Error("CRM modülüne erişiminiz yok.");

  const { data, error } = await supabase
    .from("crm_proposals")
    .select("id,proposal_no,title,scope,amount,currency,payment_plan,valid_until,status,created_at,sent_at,first_viewed_at,last_viewed_at,view_count,revision_no,root_proposal_id,share_token,opportunity_id,crm_opportunities!inner(id,customer_name,contact_email,contact_phone,title,assigned_employee_id,request_details)")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (error) throw new Error("Teklif bilgileri okunamadı: " + error.message);
  if (!data) notFound();

  const customer = Array.isArray(data.crm_opportunities)
    ? data.crm_opportunities[0]
    : data.crm_opportunities;
  let representative = "Atanmamış";
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
  // token'ı koruyor), bu yüzden bir kez üretildikten sonra sayfanın
  // üstünde kalıcı olarak gösterilebilir.
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

  // Revizyon geçmişi artık ayrı sayfada değil, sayfanın altında.
  const rootId = data.root_proposal_id || data.id;
  const { data: revisionRows } = await supabase
    .from("crm_proposals")
    .select("id,proposal_no,amount,currency,status,revision_no,revision_note,created_at,superseded_by")
    .eq("organization_id", membership.organization_id)
    .or(`id.eq.${rootId},root_proposal_id.eq.${rootId}`)
    .order("revision_no", { ascending: false });
  const revisions = revisionRows ?? [];

  const locked = ["accepted", "rejected", "archived"].includes(data.status);
  const canDelete = ["owner", "admin", "manager"].includes(membership.role);

  return (
    <div className="crm-request-detail-page">
      <div className="panel-pagehead">
        <div>
          <small className="panel-kicker">CRM / TEKLİF DETAYI</small>
          <h1>{data.proposal_no}</h1>
          <p>{formatPersonName(customer?.customer_name)} · {data.title}</p>
        </div>
        <Link className="panel-secondary" href="/panel/crm/proposals">Tekliflere Dön</Link>
      </div>
      {shareUrl ? (
        <section className="panel-card share-ready-card">
          <div className="share-ready-icon">✓</div>
          <div className="share-ready-body">
            <small className="panel-kicker">MÜŞTERİ BAĞLANTISI</small>
            <h2>Teklif bağlantısı</h2>
            <div className="share-ready-link">
              <span style={{ wordBreak: "break-all" }}>{shareUrl}</span>
            </div>
            <div className="panel-page-actions">
              {customer?.contact_email && messages ? (
                <a className="panel-primary" href={`mailto:${encodeURIComponent(customer.contact_email)}?subject=${encodeURIComponent(messages.subject)}&body=${encodeURIComponent(messages.email)}`}>
                  ✉ E-posta ile gönder
                </a>
              ) : null}
              {messages ? (
                <a className="panel-secondary" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(messages.whatsapp)}`}>
                  💬 WhatsApp ile gönder
                </a>
              ) : null}
              <a className="panel-secondary" target="_blank" rel="noreferrer" href={shareUrl}>
                👁 Önizle
              </a>
            </div>
          </div>
        </section>
      ) : null}

      <div className="crm-detail-split">
        <div className="crm-detail-main">
      <section className="panel-card crm-request-detail-card">
        <div className="crm-request-detail-heading">
          <div><span className="status-pill">{labels[data.status] ?? data.status}</span><h2>{data.title}</h2></div>
          <strong>{money(data.amount, data.currency)}</strong>
        </div>
        <dl className="crm-request-detail-grid">
          <div><dt>Müşteri</dt><dd>{customer?.customer_name || "—"}</dd></div>
          <div><dt>Temsilci</dt><dd>{representative}</dd></div>
          <div><dt>Telefon</dt><dd>{customer?.contact_phone || "—"}</dd></div>
          <div><dt>E-posta</dt><dd>{customer?.contact_email || "—"}</dd></div>
          <div><dt>Ödeme planı</dt><dd>{data.payment_plan || "—"}</dd></div>
          <div><dt>Geçerlilik</dt><dd>{date(data.valid_until)}</dd></div>
          <div><dt>Oluşturulma</dt><dd>{date(data.created_at)}</dd></div>
          <div><dt>Görüntülenme</dt><dd>{data.view_count || 0} kez</dd></div>
          <div><dt>Revizyon</dt><dd>{data.revision_no > 0 ? `R${data.revision_no}` : "İlk sürüm"}</dd></div>
          <div><dt>Gönderim</dt><dd>{date(data.sent_at)}</dd></div>
          <div><dt>İlk görüntüleme</dt><dd>{date(data.first_viewed_at)}</dd></div>
          <div><dt>Son görüntüleme</dt><dd>{date(data.last_viewed_at)}</dd></div>
        </dl>
        {data.scope ? <div className="crm-request-detail-note"><small>KAPSAM</small><p>{data.scope}</p></div> : null}

        <div className="crm-request-detail-actions">
          <small className="panel-kicker">İŞLEMLER</small>
          <div>

          {!locked ? (
            <PanelDrawer triggerLabel="Düzenle" title={data.proposal_no} description="Teklif bilgilerini kontrol edin.">
            <form className="panel-form" action={updateProposal}>
              <input type="hidden" name="proposal_id" value={data.id} />
              <input
                type="hidden"
                name="opportunity_id"
                value={customer?.id ?? ""}
              />
              <input
                type="hidden"
                name="current_details"
                value={JSON.stringify(customer?.request_details ?? {})}
              />
              <p className="wide panel-form-note">
                Müşteri / Talep Bilgileri
              </p>
              <label>
                Müşteri adı
                <input
                  name="customer_name"
                  defaultValue={customer?.customer_name ?? ""}
                />
              </label>
              <label>
                Telefon
                <input
                  name="contact_phone"
                  defaultValue={customer?.contact_phone ?? ""}
                />
              </label>
              <label>
                E-posta
                <input
                  name="contact_email"
                  defaultValue={customer?.contact_email ?? ""}
                />
              </label>
              <label>
                Hizmet türü
                <input
                  name="service_type"
                  defaultValue={String(
                    customer?.request_details?.service_type ?? "",
                  )}
                />
              </label>
              <label>
                Akademik seviye
                <input
                  name="academic_level"
                  defaultValue={String(
                    customer?.request_details?.academic_level ?? "",
                  )}
                />
              </label>
              <label>
                Üniversite
                <input
                  name="university"
                  defaultValue={String(
                    customer?.request_details?.university ?? "",
                  )}
                />
              </label>
              <label>
                Bölüm
                <input
                  name="department"
                  defaultValue={String(
                    customer?.request_details?.department ?? "",
                  )}
                />
              </label>
              <p className="wide panel-form-note">Teklif Bilgileri</p>
              <label>
                Başlık
                <input name="title" defaultValue={data.title} required />
              </label>
              <label>
                Tutar
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={(data.amount / 100).toFixed(2)}
                  required
                />
              </label>
              <label className="wide">
                Kapsam
                <textarea
                  name="scope"
                  defaultValue={data.scope ?? ""}
                  required
                />
              </label>
              <label>
                Ödeme planı
                <input
                  name="payment_plan"
                  defaultValue={data.payment_plan ?? ""}
                />
              </label>
              <label>
                Geçerlilik
                <input
                  name="valid_until"
                  type="date"
                  defaultValue={data.valid_until ?? ""}
                />
              </label>
              <div className="wide panel-form-actions">
                <button className="panel-primary">Kaydet</button>
              </div>
            </form>
            </PanelDrawer>
          ) : null}
          {!locked ? (
            <PanelDrawer triggerLabel="Revizyon" title={`${data.proposal_no} revizyonu`} description="Yeni sürüm oluşturun; mevcut teklif arşivlenecektir.">
            <form
              className="panel-form"
              action={createProposalRevision}
            >
              <input type="hidden" name="proposal_id" value={data.id} />
              <label className="wide">
                Revizyon nedeni
                <textarea
                  name="revision_reason"
                  required
                  minLength={3}
                  maxLength={1000}
                  placeholder="Müşterinin talebi, kapsam değişikliği, fiyat güncellemesi..."
                />
              </label>
              <div className="wide panel-card" style={{ padding: 14 }}>
                <strong>
                  Yeni revizyon: {data.proposal_no.replace(/-R\d+$/, "")}
                  -R{data.revision_no + 1}
                </strong>
                <p style={{ margin: "8px 0 0" }}>
                  Mevcut sürüm arşivlenecek ve müşterinin yalnızca yeni
                  sürümü onaylamasına izin verilecek.
                </p>
              </div>
              <div className="wide panel-form-actions">
                <button className="panel-primary">
                  Revizyonu Oluştur
                </button>
              </div>
            </form>
            </PanelDrawer>
          ) : null}
          {!locked ? (
            <form action={issueProposalLink}>
              <input type="hidden" name="proposal_id" value={data.id} />
              <input type="hidden" name="redirect_to" value={`/panel/crm/proposals/${data.id}`} />
              <button className="panel-primary">Müşteriye Gönder</button>
            </form>
          ) : null}
          {!locked ? (
            <form action={fastTrackProposalToContract}>
              <input type="hidden" name="proposal_id" value={data.id} />
              <button className="panel-primary">Sözleşmeye Dönüştür</button>
            </form>
          ) : null}
          {!locked ? (
            <PanelDrawer
              triggerLabel="İptal"
              title="Teklifi kapat"
              description="Kaydın neden kapatıldığını seçin. Bu bilgi raporlarda kullanılıyor."
              triggerClassName="panel-secondary"
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
        </div>
      </section>
      {revisions.length > 1 ? (
        <section className="panel-card crm-revision-history">
          <header>
            <small className="panel-kicker">REVİZYON GEÇMİŞİ</small>
            <h2>{revisions.length} sürüm</h2>
          </header>
          <ol>
            {revisions.map((r) => {
              const isCurrent = r.id === data.id;
              return (
                <li key={r.id} className={isCurrent ? "is-current" : undefined}>
                  <div className="crm-revision-mark">
                    {r.revision_no > 0 ? `R${r.revision_no}` : "İlk"}
                  </div>
                  <div className="crm-revision-body">
                    <b>
                      {r.proposal_no}
                      {isCurrent ? <em>Görüntülenen sürüm</em> : null}
                    </b>
                    <span>
                      {money(Number(r.amount), r.currency || "TRY")} ·{" "}
                      {labels[r.status] ?? r.status} ·{" "}
                      {new Date(r.created_at).toLocaleString("tr-TR")}
                    </span>
                    {r.revision_note ? <p>{r.revision_note}</p> : null}
                  </div>
                  {!isCurrent ? (
                    <Link className="panel-secondary" href={`/panel/crm/proposals/${r.id}`}>
                      Aç
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
        </div>
        <aside className="crm-detail-side">
  <InternalComments opportunityId={data.opportunity_id} contextType="proposal" contextId={data.id} />
        </aside>
      </div>
    </div>
  );
}
