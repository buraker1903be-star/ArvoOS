import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ConfirmDeleteButton } from "../../../accounts/confirm-delete-button";
import { deleteContract, issueContractLink, markContractStatus } from "../../sales-actions";
import { InternalComments } from "../../internal-comments";
import "../../request-page.css";

type Props = { params: Promise<{ id: string }> };
const labels: Record<string, string> = { draft: "Taslak", sent: "İmza bekliyor", signed: "İmzalandı", rejected: "Reddedildi", cancelled: "İptal", completed: "Tamamlandı" };
const money = (value: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value / 100);
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("tr-TR") : "—";

export default async function ContractDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const { data, error } = await supabase
    .from("crm_contracts")
    .select("id,contract_no,title,scope,amount,currency,payment_plan,start_date,due_date,status,created_at,sent_at,first_viewed_at,last_viewed_at,view_count,signed_name,signed_at,workflow_id,tracking_code,customer_address,customer_tax_number,customer_tax_office,opportunity_id,crm_opportunities!inner(customer_name,contact_email,contact_phone,assigned_employee_id)")
    .eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (error) throw new Error("Sözleşme bilgileri okunamadı: " + error.message);
  if (!data) notFound();
  const customer = Array.isArray(data.crm_opportunities) ? data.crm_opportunities[0] : data.crm_opportunities;
  let representative = "Atanmamış";
  if (customer?.assigned_employee_id) {
    const { data: employee } = await supabase.from("hr_employees").select("full_name").eq("id", customer.assigned_employee_id).eq("organization_id", membership.organization_id).maybeSingle();
    representative = employee?.full_name ?? "Pasif personel";
  }
  const locked = ["signed", "completed", "rejected", "cancelled"].includes(data.status);
  const canDelete = ["owner", "admin", "manager"].includes(membership.role);
  return (
    <div className="crm-request-detail-page">
      <div className="panel-pagehead">
        <div><small className="panel-kicker">CRM / SÖZLEŞME DETAYI</small><h1>{data.contract_no}</h1><p>{customer?.customer_name} · {data.title}</p></div>
        <Link className="panel-secondary" href="/panel/crm/contracts">Sözleşmelere Dön</Link>
      </div>
      <section className="panel-card crm-request-detail-card">
        <div className="crm-request-detail-heading"><div><span className="status-pill">{labels[data.status] ?? data.status}</span><h2>{data.title}</h2></div><strong>{money(data.amount, data.currency)}</strong></div>
        <dl className="crm-request-detail-grid">
          <div><dt>Müşteri</dt><dd>{customer?.customer_name || "—"}</dd></div>
          <div><dt>Temsilci</dt><dd>{representative}</dd></div>
          <div><dt>Telefon</dt><dd>{customer?.contact_phone || "—"}</dd></div>
          <div><dt>E-posta</dt><dd>{customer?.contact_email || "—"}</dd></div>
          <div><dt>Ödeme planı</dt><dd>{data.payment_plan || "—"}</dd></div>
          <div><dt>Başlangıç</dt><dd>{date(data.start_date)}</dd></div>
          <div><dt>Teslim</dt><dd>{date(data.due_date)}</dd></div>
          <div><dt>İmzalayan</dt><dd>{data.signed_name || "Bekleniyor"}</dd></div>
          <div><dt>Takip kodu</dt><dd>{data.tracking_code || "—"}</dd></div>
          <div><dt>Görüntülenme</dt><dd>{data.view_count || 0} kez</dd></div>
        </dl>
        {data.scope ? <div className="crm-request-detail-note"><small>KAPSAM</small><p>{data.scope}</p></div> : null}
        <div className="crm-request-detail-actions">
          <small className="panel-kicker">İŞLEMLER</small>
          <div>
          {!locked ? <form action={issueContractLink}><input type="hidden" name="contract_id" value={data.id}/><button className="panel-primary">İmzaya Gönder</button></form> : null}
          {data.workflow_id ? <Link className="panel-secondary" href={`/panel/operations/${data.workflow_id}`}>İş Akışını Aç</Link> : null}
          {!locked ? <form action={markContractStatus}><input type="hidden" name="contract_id" value={data.id}/><input type="hidden" name="status" value="rejected"/><button className="panel-secondary">Reddedildi</button></form> : null}
          {!locked ? <form action={markContractStatus}><input type="hidden" name="contract_id" value={data.id}/><input type="hidden" name="status" value="cancelled"/><button className="panel-secondary">İptal</button></form> : null}
          {canDelete ? <form action={deleteContract}><input type="hidden" name="contract_id" value={data.id}/><ConfirmDeleteButton label="Sil" confirmMessage={`${data.contract_no} sözleşmesini kalıcı olarak silmek istediğinize emin misiniz?`}/></form> : null}
          </div>
        </div>
      </section>
      <InternalComments opportunityId={data.opportunity_id} contextType="contract" contextId={data.id} />
    </div>
  );
}
