import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ConfirmDeleteButton } from "../../../accounts/confirm-delete-button";
import {
  createProposalRevision,
  deleteProposal,
  fastTrackProposalToContract,
  issueProposalLink,
  markProposalStatus,
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
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm"))
    throw new Error("CRM modülüne erişiminiz yok.");

  const { data, error } = await supabase
    .from("crm_proposals")
    .select("id,proposal_no,title,scope,amount,currency,payment_plan,valid_until,status,created_at,sent_at,first_viewed_at,last_viewed_at,view_count,revision_no,opportunity_id,crm_opportunities!inner(id,customer_name,contact_email,contact_phone,title,assigned_employee_id,request_details)")
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
  const locked = ["accepted", "rejected", "archived"].includes(data.status);
  const canDelete = ["owner", "admin", "manager"].includes(membership.role);

  return (
    <div className="crm-request-detail-page">
      <div className="panel-pagehead">
        <div>
          <small className="panel-kicker">CRM / TEKLİF DETAYI</small>
          <h1>{data.proposal_no}</h1>
          <p>{customer?.customer_name} · {data.title}</p>
        </div>
        <Link className="panel-secondary" href="/panel/crm/proposals">Tekliflere Dön</Link>
      </div>

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
          <Link className="panel-secondary" href={`/panel/crm/proposals/${data.id}/revisions`}>Revizyon Geçmişi</Link>
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
          {!locked ? <form action={issueProposalLink}><input type="hidden" name="proposal_id" value={data.id}/><button className="panel-primary">Müşteriye Gönder</button></form> : null}
          {!locked ? <form action={fastTrackProposalToContract}><input type="hidden" name="proposal_id" value={data.id}/><button className="panel-secondary">Sözleşmeye Dönüştür</button></form> : null}
          {!locked ? <form action={markProposalStatus}><input type="hidden" name="proposal_id" value={data.id}/><input type="hidden" name="status" value="rejected"/><button className="panel-secondary">Reddedildi</button></form> : null}
          {!locked ? <form action={markProposalStatus}><input type="hidden" name="proposal_id" value={data.id}/><input type="hidden" name="status" value="expired"/><button className="panel-secondary">Süre Doldu</button></form> : null}
          {canDelete ? <form action={deleteProposal}><input type="hidden" name="proposal_id" value={data.id}/><ConfirmDeleteButton label="Sil" confirmMessage={`${data.proposal_no} teklifini kalıcı olarak silmek istediğinize emin misiniz?`}/></form> : null}
          </div>
        </div>
      </section>
      <InternalComments opportunityId={data.opportunity_id} contextType="proposal" contextId={data.id} />
    </div>
  );
}
