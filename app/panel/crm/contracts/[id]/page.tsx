import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ConfirmDeleteButton } from "../../../accounts/confirm-delete-button";
import { deleteContract, issueContractLink, markContractStatus } from "../../sales-actions";
import { InternalComments } from "../../internal-comments";
import { saveInstallmentPaymentLink } from "../../../finance/actions";
import { PaymentShareActions } from "./payment-share-actions";
import "../../request-page.css";

type Props = { params: Promise<{ id: string }> };
const labels: Record<string, string> = { draft: "Taslak", sent: "İmza bekliyor", signed: "İmzalandı", rejected: "Reddedildi", cancelled: "İptal", completed: "Tamamlandı" };
const money = (value: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value / 100);
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("tr-TR") : "—";

export default async function ContractDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase, membership, modules, organization } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const { data, error } = await supabase
    .from("crm_contracts")
    .select("id,contract_no,title,scope,amount,currency,payment_plan,start_date,due_date,status,created_at,sent_at,first_viewed_at,last_viewed_at,view_count,signed_name,signed_at,workflow_id,tracking_code,customer_address,customer_tax_number,customer_tax_office,opportunity_id,payment_plan_id,crm_opportunities!inner(customer_name,contact_email,contact_phone,assigned_employee_id)")
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
  const canManageFinance = modules.some((module) => module.code === "finance") && ["owner", "admin"].includes(membership.role);
  const { data: installmentData, error: installmentError } = data.payment_plan_id
    ? await supabase.from("payment_installments").select("id,installment_no,due_date,amount,status,paid_at,payment_url,notice_sent_at,reminder_sent_at").eq("payment_plan_id", data.payment_plan_id).eq("organization_id", membership.organization_id).order("installment_no")
    : { data: [], error: null };
  if (installmentError) throw new Error("Ödeme taksitleri okunamadı: " + installmentError.message);
  const installments = installmentData ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const customerName = customer?.customer_name || "Müşterimiz";
  const brandName = organization.display_name || organization.name || "ArvoOS";
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
      <section className="panel-card contract-payment-center">
        <header><div><small className="panel-kicker">TAHSİLAT MERKEZİ</small><h2>PAYTR ödeme bağlantıları</h2><p>Her taksite ait kalıcı ödeme bağlantısını kaydedin ve müşteriye gönderin.</p></div><span className="status-pill">{installments.filter((item) => item.status !== "paid").length} bekleyen</span></header>
        <div className="contract-installment-list">
          {installments.map((installment) => {
            const overdue = installment.status !== "paid" && Boolean(installment.due_date && installment.due_date < today);
            const dueSoon = installment.status !== "paid" && !overdue && Boolean(installment.due_date && installment.due_date <= new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
            const paymentUrl = installment.payment_url as string | null;
            const message = overdue ? `Sayın ${customerName},\n\n${data.contract_no} numaralı sözleşmenize ait ${money(Number(installment.amount), data.currency)} tutarındaki ödemenizin vadesi ${date(installment.due_date)} tarihinde dolmuştur.\n\nÖdemenizi güvenli şekilde tamamlamak için:\n${paymentUrl ?? ""}\n\nÖdeme yaptıysanız bu mesajı dikkate almayınız.\n\nSaygılarımızla,\n${brandName}` : `Sayın ${customerName},\n\n${data.contract_no} numaralı sözleşmenize ait ${money(Number(installment.amount), data.currency)} tutarındaki ödemenizi güvenli şekilde tamamlamak için:\n${paymentUrl ?? ""}\n\nVade Tarihi: ${date(installment.due_date)}\n\nSaygılarımızla,\n${brandName}`;
            const phone = String(customer?.contact_phone ?? "").replace(/\D/g, "").replace(/^0/, "90");
            const whatsappUrl = paymentUrl && phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null;
            const emailUrl = paymentUrl && customer?.contact_email ? `mailto:${encodeURIComponent(customer.contact_email)}?subject=${encodeURIComponent(`${data.contract_no} ödeme bilgilendirmesi`)}&body=${encodeURIComponent(message)}` : null;
            return <article key={installment.id} className={overdue ? "is-overdue" : ""}>
              <div className="contract-installment-main"><span>{installment.installment_no}. ödeme</span><strong>{money(Number(installment.amount), data.currency)}</strong><small>Vade: {date(installment.due_date)}</small></div>
              <div className="contract-installment-status"><span className={`status-pill ${installment.status === "paid" ? "is-paid" : overdue ? "is-late" : dueSoon ? "is-soon" : ""}`}>{installment.status === "paid" ? "Ödendi" : overdue ? "Gecikmiş" : dueSoon ? "Vadesi yaklaşıyor" : "Bekliyor"}</span><small>{installment.reminder_sent_at ? `Son hatırlatma: ${date(installment.reminder_sent_at)}` : installment.notice_sent_at ? `Gönderildi: ${date(installment.notice_sent_at)}` : "Henüz gönderilmedi"}</small></div>
              {installment.status !== "paid" && canManageFinance ? <form className="contract-payment-link-form" action={saveInstallmentPaymentLink}><input type="hidden" name="installment_id" value={installment.id}/><input type="hidden" name="contract_id" value={data.id}/><input name="payment_url" type="url" defaultValue={paymentUrl ?? ""} placeholder="https://www.paytr.com/link/..."/><button className="panel-secondary">Linki Kaydet</button></form> : paymentUrl ? <a className="panel-text-link" href={paymentUrl} target="_blank" rel="noreferrer">Ödeme linkini aç →</a> : null}
              {installment.status !== "paid" ? <PaymentShareActions installmentId={installment.id} contractId={data.id} whatsappUrl={whatsappUrl} emailUrl={emailUrl} overdue={overdue}/> : null}
            </article>;
          })}
          {!installments.length ? <p className="contract-payment-empty">Sözleşme imzalandığında ödeme taksitleri burada oluşacaktır.</p> : null}
        </div>
      </section>
      <InternalComments opportunityId={data.opportunity_id} contextType="contract" contextId={data.id} />
    </div>
  );
}
